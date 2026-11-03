// GET  /api/financeiro/recorrentes → contas a pagar recorrentes do Omie e a situação de cada mês
//      (faltando / aguardando o prazo costumeiro / lançada / no mês vizinho / marcada). Regras: lib/financeiro/recorrentes.ts
// POST /api/financeiro/recorrentes { empresa, fornecedor_codigo, categoria, tipo, mes? } → grava a decisão
//      ("ja_lancei" | "pular_mes" para um mês, "nao_recorrente" para sempre)
// DELETE /api/financeiro/recorrentes?id=N → desfaz a decisão
// Só Dev, quem é do Financeiro (financeiro_usu.funcao = 'Financeiro') ou o responsável (Mariano).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import {
  COLUNAS_RECORRENTES, RESPONSAVEL_RECORRENTES, detectarRecorrentes, hojeBrasilia, inicioLeitura, type Decisao, type TituloRec,
} from "@/lib/financeiro/recorrentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const TIPOS = ["ja_lancei", "pular_mes", "nao_recorrente"] as const;

async function podeVer(userId: string, isDev: boolean): Promise<boolean> {
  if (isDev || userId === RESPONSAVEL_RECORRENTES.id) return true;
  const { data } = await supabase.from("financeiro_usu").select("funcao").eq("id", userId).maybeSingle();
  return (data as { funcao?: string } | null)?.funcao === "Financeiro";
}

async function lerTitulos(desde: string): Promise<TituloRec[]> {
  const out: TituloRec[] = [];
  let ultimo = 0;
  for (let i = 0; i < 60; i++) {
    const { data, error } = await supabase.from("contas_pagar").select(COLUNAS_RECORRENTES)
      .gte("data_vencimento", desde).gt("id", ultimo).order("id").limit(1000);
    if (error) throw new Error(`contas_pagar: ${error.message}`);
    const lote = (data || []) as unknown as TituloRec[];
    out.push(...lote);
    if (lote.length < 1000) break;
    ultimo = lote[lote.length - 1].id;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeVer(auth.userId, auth.isDev))) return NextResponse.json({ error: "Acesso restrito ao Financeiro" }, { status: 403 });
  try {
    const hoje = hojeBrasilia();
    const [titulos, usuarios, dec, sync] = await Promise.all([
      lerTitulos(inicioLeitura(hoje)),
      supabase.from("omie_usuarios").select("codigo,nome"),
      supabase.from("finan_recorrentes_decisoes").select("*"),
      supabase.from("contas_pagar").select("synced_at").order("synced_at", { ascending: false }).limit(1),
    ]);
    const nomes: Record<string, string> = {};
    for (const u of (usuarios.data || []) as { codigo: string; nome: string | null }[]) if (u.nome) nomes[u.codigo] = u.nome;
    // Sem a tabela ainda (SQL não rodado) a tela funciona, só sem as decisões.
    const decisoes = (dec.error ? [] : dec.data || []) as Decisao[];
    const itens = detectarRecorrentes(titulos, hoje, decisoes, nomes);
    return NextResponse.json({
      hoje, itens, decisoesAtivas: !dec.error, titulosLidos: titulos.length, responsavel: RESPONSAVEL_RECORRENTES.nome,
      ultimoSync: (sync.data?.[0] as { synced_at?: string } | undefined)?.synced_at || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[financeiro/recorrentes]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeVer(auth.userId, auth.isDev))) return NextResponse.json({ error: "Acesso restrito ao Financeiro" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const tipo = TIPOS.find((t) => t === b?.tipo);
  const mes = typeof b?.mes === "string" && /^\d{4}-\d{2}$/.test(b.mes) ? b.mes : null;
  if (!tipo || !b?.empresa || !Number(b?.fornecedor_codigo) || (tipo !== "nao_recorrente" && !mes)) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }
  const { data: perfil } = await supabase.from("financeiro_usu").select("nome").eq("id", auth.userId).maybeSingle();
  const { data, error } = await supabase.from("finan_recorrentes_decisoes").insert({
    empresa: String(b.empresa), fornecedor_codigo: Number(b.fornecedor_codigo), categoria: b.categoria || null,
    fornecedor_nome: b.fornecedor_nome || null, tipo, mes: tipo === "nao_recorrente" ? null : mes,
    criado_por: auth.userId, criado_por_nome: (perfil as { nome?: string } | null)?.nome || auth.email,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decisao: data });
}

export async function DELETE(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeVer(auth.userId, auth.isDev))) return NextResponse.json({ error: "Acesso restrito ao Financeiro" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id" }, { status: 400 });
  const { error } = await supabase.from("finan_recorrentes_decisoes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
