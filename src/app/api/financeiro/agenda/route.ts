// GET /api/financeiro/agenda?semana=AAAA-MM-DD&conta=NOVA|CASTRO|todas&tipo=receber|pagar|ambos
// Agenda de pagamentos da semana (segunda → domingo): o que vence a receber e a pagar no Omie
// (espelho contas_receber/contas_pagar), pago/atrasado/hoje/a vencer, totais e os atrasados de
// semanas anteriores. Títulos a receber ligados ao card de cobrança do portal (Chamado_NF).
// GET /api/financeiro/agenda?titulo=receber-123: um título com o histórico do cliente/fornecedor (janela de detalhe).
// Só Dev ou quem é do Financeiro (financeiro_usu.funcao = 'Financeiro'). Regras: lib/financeiro/agenda.ts
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { COLUNAS_CARD, hojeBR } from "@/lib/financeiro/fases-automaticas";
import {
  COLUNAS_AGENDA_PAGAR, COLUNAS_AGENDA_RECEBER, historicoDaPessoa, ligarCards, montarAgenda, montarItem, normalizarConta,
  normalizarSemana, normalizarTipo, somarDias, type CardAgenda, type TipoConta, type TituloAgenda,
} from "@/lib/financeiro/agenda";
import type { TituloOmie } from "@/lib/financeiro/fases-automaticas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const PAGINA = 1000; // teto do PostgREST

/** Lê tudo de uma consulta, de 1000 em 1000. */
async function lerTudo<T>(montar: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }, nome: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < 50_000; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw new Error(`${nome}: ${error.message}`);
    const lote = (data || []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

function consultaSemana(sb: SupabaseClient, tabela: string, colunas: string, seg: string, dom: string, conta: string) {
  let q = sb.from(tabela).select(colunas).gte("data_vencimento", seg).lte("data_vencimento", dom)
    .neq("status_titulo", "CANCELADO").order("data_vencimento").order("id");
  if (conta !== "todas") q = q.eq("conta_omie", conta);
  return q;
}

// em aberto com vencimento antes da semana (a regra pura decide se está atrasado pela previsão)
function consultaAnteriores(sb: SupabaseClient, tabela: string, colunas: string, seg: string, conta: string) {
  let q = sb.from(tabela).select(colunas).lt("data_vencimento", seg).is("data_pagamento", null)
    .not("status_titulo", "in", "(CANCELADO,RECEBIDO,PAGO)").order("data_vencimento").order("id");
  if (conta !== "todas") q = q.eq("conta_omie", conta);
  return q;
}

/** Dev, ou usuário com função Financeiro. */
async function podeVerAgenda(userId: string, isDev: boolean): Promise<boolean> {
  if (isDev) return true;
  const { data } = await supabase.from("financeiro_usu").select("funcao").eq("id", userId).maybeSingle();
  return (data as { funcao?: string } | null)?.funcao === "Financeiro";
}

async function detalheDoTitulo(chave: string, hoje: string) {
  const m = /^(receber|pagar)-(\d+)$/.exec(chave);
  if (!m) return NextResponse.json({ ok: false, error: "Título inválido" }, { status: 400 });
  const tipo = m[1] as TipoConta;
  const tabela = tipo === "receber" ? "contas_receber" : "contas_pagar";
  const colunas = tipo === "receber" ? COLUNAS_AGENDA_RECEBER : COLUNAS_AGENDA_PAGAR;
  const { data, error } = await supabase.from(tabela).select(colunas).eq("id", Number(m[2])).maybeSingle();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  const t = data as unknown as TituloAgenda | null;
  const item = t && montarItem(t, tipo, hoje);
  if (!t || !item) return NextResponse.json({ ok: false, error: "Título não encontrado" }, { status: 404 });
  // o código do cliente é de cada empresa no Omie: histórico só dentro da mesma conta
  const titulos = t.codigo_cliente_fornecedor && t.conta_omie
    ? await lerTudo<TituloAgenda>(() => supabase.from(tabela).select(colunas).eq("conta_omie", t.conta_omie as string)
        .eq("codigo_cliente_fornecedor", t.codigo_cliente_fornecedor as string | number).order("id"), tabela)
    : [t];
  return NextResponse.json({ ok: true, item, historico: historicoDaPessoa(titulos, tipo, hoje, chave) });
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeVerAgenda(auth.userId, auth.isDev))) return NextResponse.json({ error: "Acesso restrito ao Financeiro" }, { status: 403 });

  try {
    const url = new URL(req.url);
    const hoje = hojeBR();
    const titulo = url.searchParams.get("titulo");
    if (titulo) return await detalheDoTitulo(titulo, hoje);
    const semana = normalizarSemana(url.searchParams.get("semana"), hoje);
    const fim = somarDias(semana, 6);
    const conta = normalizarConta(url.searchParams.get("conta"));
    const tipo = normalizarTipo(url.searchParams.get("tipo"));
    const querReceber = tipo !== "pagar";
    const querPagar = tipo !== "receber";

    const vazio = Promise.resolve([] as TituloAgenda[]);
    const [receber, pagar, antReceber, antPagar, cards] = await Promise.all([
      querReceber ? lerTudo<TituloAgenda>(() => consultaSemana(supabase, "contas_receber", COLUNAS_AGENDA_RECEBER, semana, fim, conta), "contas_receber") : vazio,
      querPagar ? lerTudo<TituloAgenda>(() => consultaSemana(supabase, "contas_pagar", COLUNAS_AGENDA_PAGAR, semana, fim, conta), "contas_pagar") : vazio,
      querReceber ? lerTudo<TituloAgenda>(() => consultaAnteriores(supabase, "contas_receber", COLUNAS_AGENDA_RECEBER, semana, conta), "contas_receber (atrasados)") : vazio,
      querPagar ? lerTudo<TituloAgenda>(() => consultaAnteriores(supabase, "contas_pagar", COLUNAS_AGENDA_PAGAR, semana, conta), "contas_pagar (atrasados)") : vazio,
      // ~1.000 cards no total: lê todos os que têm NF (o casamento é em memória)
      querReceber
        ? lerTudo<CardAgenda>(() => supabase.from("Chamado_NF").select(`${COLUNAS_CARD}, setor_destino`).neq("status", "excluido").order("id"), "Chamado_NF")
            .catch((e) => { console.error("[financeiro/agenda] cards", e); return [] as CardAgenda[]; })
        : Promise.resolve([] as CardAgenda[]),
    ]);

    const titulosReceber = [...receber, ...antReceber].map((x) => ({ ...x, status_titulo: String(x.status_titulo || "") })) as (TituloAgenda & TituloOmie)[];
    const mapaCards = querReceber ? ligarCards(titulosReceber, cards) : undefined;

    const agenda = montarAgenda({ semana, hoje, receber, pagar, anterioresReceber: antReceber, anterioresPagar: antPagar, cards: mapaCards });
    return NextResponse.json({ ok: true, conta, tipo, ...agenda });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[financeiro/agenda]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
