import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { omie } from "@/lib/omie/porta";
import { exigirAdmin } from "@/lib/auth/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_APP_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET || "";

async function omieListarClientes(pagina: number) {
  // Porta única: 429/rede são repetidos por ela (sem espera própria de 60 s).
  return omie<any>(
    { appKey: OMIE_APP_KEY, appSecret: OMIE_APP_SECRET, rotulo: "NOVA" },
    "/geral/clientes/", "ListarClientes",
    { pagina, registros_por_pagina: 100, apenas_importado_api: "N" },
    { lancarFault: false },
  );
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

  // só admin: o único chamador era o botão do app estático do Mapa Geral
  // (removido em 16/10/2026); antes qualquer um disparava o sync sem login
  if (!(await exigirAdmin(req))) return NextResponse.json({ error: "Só administrador" }, { status: 403 });
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
        inativo: String(c.inativo || "N").toUpperCase() === "S", // flag do Omie
      }));

      const { error } = await supabase
        .from("portal_nt_clientes_PRINCIPAL")
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
        .from("portal_nt_clientes_PRINCIPAL")
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
              .from("portal_nt_clientes_PRINCIPAL")
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
