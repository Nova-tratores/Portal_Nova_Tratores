import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LOGS_PPO } from "@/lib/pos/constants";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";
import { usuariosPosVendas } from "@/lib/faturamento/alerta-ti";
import { resolverCobranca, type AcaoCobranca } from "@/lib/pos/cobranca-requisicoes";

// POST /api/pos/requisicoes/cobranca — Pós-Vendas resolve a cobrança da requisição (José, 26/10/2026)
// body: { requisicao_id, acao: 'nao_cobrada' | 'cobrada' | 'reabrir', motivo?, valor? }
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "requisicoes" }]);
  if (g.resposta) return g.resposta;
  // só Pós-Vendas (função no financeiro_usu) ou admin/dev
  if (!g.user.isAdmin) {
    const pos = await usuariosPosVendas().catch(() => [] as string[]);
    if (!pos.includes(g.user.id)) return NextResponse.json({ ok: false, erro: "Só o Pós-Vendas ou admin resolve a cobrança." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requisicaoId = Number(body?.requisicao_id);
  if (!Number.isFinite(requisicaoId) || requisicaoId <= 0) return NextResponse.json({ ok: false, erro: "requisicao_id inválido." }, { status: 400 });
  const acao = String(body?.acao || "") as AcaoCobranca;
  const por = autorDe(g.user);

  const r = await resolverCobranca({ requisicaoId, acao, motivo: body?.motivo, valor: body?.valor, por });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });

  // registro no log da OS (opcional; não derruba a resposta)
  const idOs = String(r.requisicao.ordem_servico || "").trim();
  if (idOs) {
    const agora = new Date();
    const txt = acao === "nao_cobrada" ? `Req #${requisicaoId} marcada como NÃO cobrada: ${String(body?.motivo || "").trim()}`
      : acao === "cobrada" ? `Req #${requisicaoId} cobrada do cliente${r.requisicao.valor_cobrado_cliente ? ` (R$ ${r.requisicao.valor_cobrado_cliente})` : ""}`
      : `Req #${requisicaoId}: cobrança reaberta`;
    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: idOs, Data_Acao: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora),
      Hora_Acao: agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }), UsuEmail: por, acao: txt.slice(0, 500),
      Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    }).then(() => {}, () => {});
  }

  return NextResponse.json({ ok: true, requisicao: r.requisicao, lembretes_concluidos: r.lembretes });
}
