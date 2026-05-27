import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_APP_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET || "";
const OMIE_BASE = "https://app.omie.com.br/api/v1";

async function omieListarClientes(pagina: number) {
  const res = await fetch(`${OMIE_BASE}/geral/clientes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call: "ListarClientes",
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ pagina, registros_por_pagina: 100, apenas_importado_api: "N" }],
    }),
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 60000));
    return omieListarClientes(pagina);
  }

  return res.json();
}

// Geocodifica endereco usando Nominatim (OpenStreetMap) - gratis, 1 req/sec
async function geocode(endereco: string, cidade: string, estado: string): Promise<{ lat: number; lng: number } | null> {
  const query = [endereco, cidade, estado, "Brasil"].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "NovaTraores-Portal/1.0" },
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }

    // Fallback: tenta so com cidade + estado
    if (endereco) {
      const fallbackQuery = [cidade, estado, "Brasil"].filter(Boolean).join(", ");
      const res2 = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fallbackQuery)}`,
        { headers: { "User-Agent": "NovaTratores-Portal/1.0" } }
      );
      const data2 = await res2.json();
      if (data2 && data2.length > 0) {
        return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
      }
    }
  } catch (e) {
    console.error("[Geocode] Erro:", e);
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    return NextResponse.json({ error: "Chaves Omie nao configuradas" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const geocodificar = body.geocodificar !== false; // default true
  const maxGeocode = body.maxGeocode || 50; // limite por chamada (respeitar rate limit)

  let pagina = 1;
  let totalPaginas = 1;
  let sincronizados = 0;

  try {
    // 1. Sync do Omie
    while (pagina <= totalPaginas) {
      const json = await omieListarClientes(pagina);
      if (!json.clientes_cadastro) break;

      totalPaginas = json.total_de_paginas || 1;

      const clientesFormatados = json.clientes_cadastro.map((c: Record<string, string>) => ({
        nome_fantasia: c.nome_fantasia || "",
        razao_social: c.razao_social || "",
        cnpj_cpf: c.cnpj_cpf,
        cidade: c.cidade || "",
        estado: c.estado || "",
        endereco: c.endereco || "",
        numero: c.endereco_numero || "",
        bairro: c.bairro || "",
        cep: c.cep || "",
        telefone: c.telefone1_numero
          ? `(${c.telefone1_ddd || ""}) ${c.telefone1_numero}`
          : "",
        email: c.email || "",
        id_omie: c.codigo_cliente_omie,
      }));

      const { error } = await supabase
        .from("Clientes")
        .upsert(clientesFormatados, { onConflict: "id_omie" });

      if (error) throw error;

      sincronizados += clientesFormatados.length;
      if (pagina >= totalPaginas) break;
      pagina++;
    }

    // 2. Geocoding dos que nao tem lat/lng
    let geocodificados = 0;
    if (geocodificar) {
      const { data: semCoord } = await supabase
        .from("Clientes")
        .select("id, endereco, cidade, estado, bairro")
        .is("lat", null)
        .not("cidade", "is", null)
        .limit(maxGeocode);

      if (semCoord && semCoord.length > 0) {
        for (const c of semCoord) {
          const endCompleto = [c.endereco, c.bairro].filter(Boolean).join(", ");
          const coords = await geocode(endCompleto, c.cidade || "", c.estado || "");

          if (coords) {
            await supabase
              .from("Clientes")
              .update({ lat: coords.lat, lng: coords.lng })
              .eq("id", c.id);
            geocodificados++;
          }

          // Nominatim rate limit: 1 req/sec
          await new Promise((r) => setTimeout(r, 1100));
        }
      }
    }

    return NextResponse.json({
      success: true,
      sincronizados,
      geocodificados,
      totalPaginas,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
