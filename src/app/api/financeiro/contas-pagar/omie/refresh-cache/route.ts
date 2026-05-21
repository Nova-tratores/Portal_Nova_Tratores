import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccount,
  OMIE_ACCOUNTS,
  listarCategoriasDespesa,
  listarContasCorrentes,
  listarProjetos,
  listarTiposDocumento,
  listarDepartamentos,
  carregarVendedoresOmie,
  invalidarCacheMatching,
} from "@/lib/financeiro/omie-contapagar";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type TipoCache = "categorias" | "contas" | "projetos" | "vendedores" | "tipos_documento" | "departamentos";
const TIPOS_VALIDOS: TipoCache[] = ["categorias", "contas", "projetos", "vendedores", "tipos_documento", "departamentos"];

async function recarregarTipo(empresa: string, tipo: TipoCache): Promise<number> {
  const acc = getAccount(empresa);

  let itens: Array<{ codigo: string | number; descricao: string; payload?: Record<string, unknown> }> = [];
  if (tipo === "categorias") {
    const lista = await listarCategoriasDespesa(acc);
    itens = lista.map((c) => ({ codigo: c.codigo, descricao: c.descricao }));
  } else if (tipo === "contas") {
    const lista = await listarContasCorrentes(acc);
    itens = lista.map((c) => ({ codigo: c.id, descricao: c.descricao, payload: { tipo: c.tipo } }));
  } else if (tipo === "projetos") {
    const lista = await listarProjetos(acc);
    itens = lista.map((p) => ({ codigo: p.codigo, descricao: p.nome }));
  } else if (tipo === "vendedores") {
    const lista = await carregarVendedoresOmie(acc);
    itens = lista.map((v) => ({ codigo: v.codigo, descricao: v.nome }));
  } else if (tipo === "tipos_documento") {
    const lista = await listarTiposDocumento(acc);
    itens = lista.map((t) => ({ codigo: t.codigo, descricao: t.descricao }));
  } else if (tipo === "departamentos") {
    const lista = await listarDepartamentos(acc);
    itens = lista.map((d) => ({ codigo: d.codigo, descricao: d.descricao }));
  }

  // limpa entradas antigas dessa empresa+tipo e regrava
  await supabase.from("omie_cache").delete().eq("empresa", acc.name).eq("tipo", tipo);

  if (itens.length > 0) {
    const rows = itens.map((i) => ({
      empresa: acc.name,
      tipo,
      codigo: String(i.codigo),
      descricao: i.descricao || null,
      payload: i.payload ?? null,
      atualizado: new Date().toISOString(),
    }));
    await supabase.from("omie_cache").insert(rows);
  }
  return itens.length;
}

// =====================================================================
// POST — força refresh do cache Omie
//   body: { empresa?: string; tipo?: TipoCache | 'all' }
//   default: tipo='all' para todas as empresas listadas
// =====================================================================
export async function POST(req: NextRequest) {
  let body: { empresa?: string; tipo?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const empresasAlvo = body.empresa ? [body.empresa] : OMIE_ACCOUNTS.map((a) => a.name);
    const tipoAlvo = body.tipo && body.tipo !== "all" ? [body.tipo as TipoCache] : TIPOS_VALIDOS;

    // validação de tipo
    for (const t of tipoAlvo) {
      if (!TIPOS_VALIDOS.includes(t)) {
        return NextResponse.json({ ok: false, erro: `Tipo inválido: ${t}` }, { status: 400 });
      }
    }

    // invalida o cache em memória da lib de matching também (vendedores/projetos)
    for (const empresa of empresasAlvo) {
      const acc = getAccount(empresa);
      invalidarCacheMatching(acc);
    }

    const resultado: Record<string, Record<string, number>> = {};
    for (const empresa of empresasAlvo) {
      resultado[empresa] = {};
      for (const tipo of tipoAlvo) {
        try {
          const n = await recarregarTipo(empresa, tipo);
          resultado[empresa][tipo] = n;
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          console.error(`[refresh-cache] ${empresa}/${tipo}:`, erro);
          resultado[empresa][tipo] = -1;
        }
      }
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[refresh-cache]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
