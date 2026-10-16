import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizarFiltro } from "@/lib/busca-segura";
import { autenticar, type Autenticado } from "@/lib/auth/server";

// Até 16/10/2026 esta rota não pedia login: qualquer um na internet lia os
// clientes (com CNPJ) e criava/editava/apagava em portal_nt_clientes_PRINCIPAL
// (o chamador era o app estático do Mapa Geral, removido). Agora:
//   GET  → login + Mapa/Frota/Feedbacks/Clientes;
//   PUT  → idem, e SÓ coordenadas (o MiniMapa dos Feedbacks corrige a posição);
//   POST/DELETE → só admin (o cadastro de cliente é na Omie).
const MODULOS_LEITURA = ["mapa", "frota", "feedbacks", "clientes"];
function podeLer(auth: Autenticado): boolean {
  return auth.isAdmin || auth.modulos.some((m) => MODULOS_LEITURA.some((x) => m === x || m.startsWith(`${x}:`)));
}
const CAMPOS_PUT = new Set(["lat", "lng", "latitude", "longitude"]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Cache em memoria (2 min)
let cache: { data: unknown[]; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

// Colunas reais da tabela Clientes
const SELECT_MAPA = "id, nome_fantasia, razao_social, cnpj_cpf, cidade, estado, lat, lng";
const SELECT_FULL = "id, nome_fantasia, razao_social, cnpj_cpf, cidade, estado, endereco, bairro, email, telefone, lat, lng, latitude, longitude, id_omie";

// Resolve lat/lng: tabela tem tanto lat/lng quanto latitude/longitude
function getLat(c: Record<string, unknown>): number | null {
  const v = c.lat ?? c.latitude;
  return v != null ? Number(v) : null;
}
function getLng(c: Record<string, unknown>): number | null {
  const v = c.lng ?? c.longitude;
  return v != null ? Number(v) : null;
}

// Busca paginada do Supabase (supera limite de 1000 rows)
async function fetchAll(select: string) {
  const rows: Record<string, unknown>[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase.from("portal_nt_clientes_PRINCIPAL").select(select).range(from, from + PAGE - 1);
    if (error) {
      console.error("[mapa/clientes] fetchAll error:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeLer(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  const busca = req.nextUrl.searchParams.get("busca");

  if (id) {
    const { data, error } = await supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  if (busca) {
    const { data, error } = await supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select(SELECT_MAPA)
      .or(`nome_fantasia.ilike.%${sanitizarFiltro(busca)}%,razao_social.ilike.%${sanitizarFiltro(busca)}%,cnpj_cpf.ilike.%${sanitizarFiltro(busca)}%,cidade.ilike.%${sanitizarFiltro(busca)}%`)
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map((c) => ({
      id: c.id,
      nome: c.nome_fantasia || c.razao_social || "Sem nome",
      cnpj_cpf: c.cnpj_cpf || "",
      cidade: c.cidade || "",
      estado: c.estado || "",
      lat: getLat(c),
      lng: getLng(c),
      equipamentos_count: 0,
      total_os_count: 0,
      total_pv_count: 0,
    })));
  }

  // Lista para o mapa - usa cache
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const rows = await fetchAll(SELECT_MAPA);

    // Retorna todos os clientes (com e sem coordenadas)
    // Os sem lat/lng aparecem na lista/busca mas nao no mapa
    const todos = rows.map((c) => ({
      id: c.id,
      nome: ((c.nome_fantasia || c.razao_social || "Sem nome") as string),
      cnpj_cpf: ((c.cnpj_cpf || "") as string),
      cidade: ((c.cidade || "") as string),
      estado: ((c.estado || "") as string),
      lat: getLat(c),
      lng: getLng(c),
      equipamentos_count: 0,
      ultima_visita: null,
      feedbacks_count: 0,
    }));

    // Deduplicar: mesmo nome normalizado + mesma cidade = duplicata (prioriza o que tem coordenada)
    const seen = new Map<string, typeof todos[0]>();
    for (const c of todos) {
      const key = (c.nome + "|" + c.cidade).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, c);
      } else if (!existing.lat && c.lat) {
        seen.set(key, c);
      }
    }
    const clientes = Array.from(seen.values());

    cache = { data: clientes, ts: Date.now() };

    console.log(`[mapa/clientes] ${rows.length} total, ${clientes.length} com coordenadas`);

    return NextResponse.json(clientes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mapa/clientes] GET error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: "Só administrador" }, { status: 403 });
  const body = await req.json();

  const { data, error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .insert(body)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data?.id });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeLer(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const body = await req.json();
  const { id, ...resto } = body;
  const updates = Object.fromEntries(Object.entries(resto).filter(([k]) => CAMPOS_PUT.has(k)));
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Só a posição (lat/lng) pode ser alterada por aqui" }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  }

  const { error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: "Só administrador" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  }

  const { error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
