import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { abertoEmDoRegistro, chamadaAbertaDoCliente, iniciarChamada, listarMotivosNegativa, buscarChamada, RpcError, type Atendente } from "@/lib/feedbacks/atendimento/chamada-db";

export const dynamic = "force-dynamic";

// Ligação do cockpit.
//   GET  ?cliente_key=  → chamada aberta do cliente (se houver), se é minha, e os motivos de negativa
//   POST { cliente_key, oportunidade_id?, registro_id?, telefone? } → inicia (ou retoma) a ligação
// O atendente é SEMPRE o usuário da sessão (exigirPermissao), nunca o body.

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
  console.error("[atendimento/chamada]", e);
  return NextResponse.json({ erro: (e as Error)?.message || "falha inesperada" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const at = await atendenteDaSessao(req);
  if (at instanceof NextResponse) return at;
  const clienteKey = (req.nextUrl.searchParams.get("cliente_key") || "").trim();
  if (!clienteKey) return NextResponse.json({ erro: "cliente_key obrigatório" }, { status: 400 });
  try {
    const [aberta, motivos] = await Promise.all([chamadaAbertaDoCliente(clienteKey), listarMotivosNegativa()]);
    const registro_aberto_em = await abertoEmDoRegistro(aberta?.feedback_id);
    return NextResponse.json({ aberta, minha: !!aberta && aberta.atendente_id === at.id, motivos, registro_aberto_em });
  } catch (e) {
    return respostaErro(e);
  }
}

export async function POST(req: NextRequest) {
  const at = await atendenteDaSessao(req);
  if (at instanceof NextResponse) return at;
  let body: { cliente_key?: string; oportunidade_id?: number | null; registro_id?: number | null; telefone?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body inválido" }, { status: 400 });
  }
  const clienteKey = String(body.cliente_key || "").trim();
  if (!clienteKey) return NextResponse.json({ erro: "cliente_key obrigatório" }, { status: 400 });
  try {
    const r = await iniciarChamada(at, {
      cliente_key: clienteKey,
      oportunidade_id: body.oportunidade_id ? Number(body.oportunidade_id) : null,
      registro_id: body.registro_id ? Number(body.registro_id) : null,
      telefone: body.telefone ? String(body.telefone).slice(0, 40) : null,
    });
    const chamada = await buscarChamada(r.chamada_id);
    const registro_aberto_em = await abertoEmDoRegistro(r.feedback_id);
    return NextResponse.json({ ...r, chamada, registro_aberto_em }, { status: r.reaproveitada ? 200 : 201 });
  } catch (e) {
    return respostaErro(e);
  }
}
