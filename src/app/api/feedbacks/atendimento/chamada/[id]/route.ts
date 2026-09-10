import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { cancelarChamada, encerrarChamada, RpcError, type Atendente } from "@/lib/feedbacks/atendimento/chamada-db";
import { ehDesfecho, validarEncerramento, type PayloadEncerrar } from "@/lib/feedbacks/atendimento/chamada";

export const dynamic = "force-dynamic";

// PATCH  /api/feedbacks/atendimento/chamada/[id]  body = PayloadEncerrar → encerra (idempotente)
// DELETE /api/feedbacks/atendimento/chamada/[id]                       → cancela (só sem notas)

async function atendenteDaSessao(req: NextRequest): Promise<Atendente | NextResponse> {
  try {
    const u = await exigirPermissao(req, "feedbacks", "atendimento");
    return { id: u.id, nome: u.nome || u.email || "Atendente" };
  } catch (e) {
    const err = e as { message?: string; http?: number };
    return NextResponse.json({ erro: err.message || "não autorizado" }, { status: err.http ?? 401 });
  }
}

function respostaErro(e: unknown) {
  if (e instanceof RpcError) return NextResponse.json({ erro: e.erro.mensagem, codigo: e.erro.codigo, detalhe: e.erro.detalhe }, { status: e.erro.http });
  console.error("[atendimento/chamada/id]", e);
  return NextResponse.json({ erro: (e as Error)?.message || "falha inesperada" }, { status: 500 });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const at = await atendenteDaSessao(req);
  if (at instanceof NextResponse) return at;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  let body: Partial<PayloadEncerrar>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body inválido" }, { status: 400 });
  }
  const erros = validarEncerramento(body);
  if (erros.length || !ehDesfecho(body.desfecho)) return NextResponse.json({ erro: erros.join(" "), erros }, { status: 400 });
  const payload: PayloadEncerrar = {
    desfecho: body.desfecho,
    motivo_negativa_id: body.motivo_negativa_id ? Number(body.motivo_negativa_id) : null,
    motivo_negativa_obs: body.motivo_negativa_obs?.toString().slice(0, 2000) || null,
    proximo_contato_em: body.proximo_contato_em || null,
    servico_previsto_em: body.servico_previsto_em || null,
    notas_encerramento: body.notas_encerramento?.toString().slice(0, 8000) || null,
    telefone_usado: body.telefone_usado?.toString().slice(0, 40) || null,
    humor_cliente: body.humor_cliente ?? null,
    qualidade_conversa: body.qualidade_conversa ?? null,
  };
  try {
    return NextResponse.json(await encerrarChamada(at, id, payload));
  } catch (e) {
    return respostaErro(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const at = await atendenteDaSessao(req);
  if (at instanceof NextResponse) return at;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  try {
    return NextResponse.json(await cancelarChamada(at, id));
  } catch (e) {
    return respostaErro(e);
  }
}
