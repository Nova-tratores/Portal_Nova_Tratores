import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { carregarRevisoes, TABELA_CONTATO, TABELA_LEITURAS, tabelaFaltando, validarContato } from "@/lib/feedbacks/previsao-revisao-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aba "Revisões" do RFM na página de teste do CRM (/feedbacks/crm/teste).
//  GET  [?forcar=1]  → tratores com a previsão da próxima revisão + o atendimento já registrado.
//                      Só leitura; service role porque revisao_cheques não tem policy.
//  POST { trator_id, revisao, status, tentativas, proximo_contato_em, data_agendada, motivo }
//                    → grava o estado do atendimento daquele trator (só com "Gravar de verdade").
//                      Sem a tabela (sql/feedbacks-rfm-revisoes.sql) responde 503 migracaoFaltando.
// Ler: a tela Hoje (crm|rfm|atendimento|agenda) e o Painel (relatorios). Gravar: só quem atende a fila da Hoje.
const ACESSO_FILA = [{ modulo: "feedbacks", acao: "crm" }, { modulo: "feedbacks", acao: "rfm" }, { modulo: "feedbacks", acao: "atendimento" }, { modulo: "feedbacks", acao: "agenda" }];
const ACESSO = [...ACESSO_FILA, { modulo: "feedbacks", acao: "relatorios" }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const dados = await carregarRevisoes(req.nextUrl.searchParams.get("forcar") === "1");
    return NextResponse.json(dados);
  } catch (e) {
    console.error("[feedbacks/crm/revisoes]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar as revisões" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_FILA);
  if (g.resposta) return g.resposta;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  const v = validarContato(body);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  const autor = g.user.nome || g.user.email || g.user.id;
  // { leitura: { horas } } = o cliente falou o horímetro: guarda a leitura (histórico) e a previsão
  // passa a contar com ela no próximo cálculo (GET ?forcar=1).
  const leitura = body.leitura as { horas?: unknown } | undefined;
  if (leitura) {
    const horas = Number(String(leitura.horas ?? "").replace(",", "."));
    if (String(leitura.horas ?? "").trim() === "" || !Number.isFinite(horas) || horas < 0 || horas > 50000) return NextResponse.json({ erro: "Informe o horímetro (em horas)." }, { status: 400 });
    const { error: el } = await supabaseAdmin.from(TABELA_LEITURAS).insert({
      trator_id: v.linha.trator_id, horas: Math.round(horas * 10) / 10, data: new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10),
      motivo_codigo: v.linha.motivo_codigo ?? null, nota: v.linha.motivo, user_id: g.user.id, user_nome: autor,
    });
    if (el) {
      if (tabelaFaltando(el)) return NextResponse.json({ erro: "A tabela dos horímetros informados ainda não foi criada (sql/feedbacks-rfm-revisoes.sql).", migracaoFaltando: true }, { status: 503 });
      return NextResponse.json({ erro: el.message }, { status: 500 });
    }
  }
  const { data, error } = await supabaseAdmin.from(TABELA_CONTATO)
    .upsert({ ...v.linha, atualizado_por: autor, atualizado_em: new Date().toISOString() }, { onConflict: "trator_id" })
    .select("*").single();
  if (error) {
    if (tabelaFaltando(error)) return NextResponse.json({ erro: "A tabela do atendimento das revisões ainda não foi criada (sql/feedbacks-rfm-revisoes.sql).", migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contato: data });
}
