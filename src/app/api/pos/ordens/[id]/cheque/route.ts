// Cheque de revisão da OS (uso pelo POS).
//   GET   → cheque da OS (cria com dados iniciais na 1ª vez) + links
//   PATCH → { dados: {...}, horas? } edita campos | { acao: 'repreencher' } refaz da OS
//           | { acao: 'reabrir_assinatura' } apaga assinatura do cliente e troca o link
//           | { acao: 'assinatura_tecnico', png: 'data:image/png;base64,...' | null }
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { ErroCheque, atualizarDados, garantirCheque, linkCheque, reabrirAssinatura, repreencher, salvarAssinaturaTecnico, type ChequeRow } from '@/lib/revisoes/cheque-db';
import { garantirAssinatura, linkAssinatura, mensagemAssinatura, resumoDaOS } from '@/lib/pos/assinatura-cliente-db';
import { assinaturaTecnicoDisponivel } from '@/lib/revisoes/cheque-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resposta(c: ChequeRow) {
  // link de assinatura é o da OS (/assinar/<token>), o mesmo pra qualquer serviço
  let linkAssinar = '', mensagemWhatsApp = '';
  try {
    const a = await garantirAssinatura(c.os_id);
    linkAssinar = linkAssinatura(a.token);
    mensagemWhatsApp = mensagemAssinatura(await resumoDaOS(c.os_id), linkAssinar);
  } catch { /* tabela de assinaturas ausente */ }
  return {
    cheque: c,
    linkCheque: linkCheque(c.token),
    linkAssinar,
    mensagemWhatsApp,
    assinaturaTecnicoUrl: c.assinatura_tecnico_url || assinaturaTecnicoDisponivel(c.dados.tecnico),
  };
}

function erro(e: unknown) {
  if (e instanceof ErroCheque) {
    const st = e.codigo === 'os_nao_encontrada' ? 404 : e.codigo === 'tabela_ausente' ? 503 : 422;
    return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: st });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await resposta(await garantirCheque(id, auth.email || null)));
  } catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    let c: ChequeRow;
    if (body.acao === 'repreencher') c = await repreencher(id);
    else if (body.acao === 'reabrir_assinatura') c = await reabrirAssinatura(id);
    else if (body.acao === 'assinatura_tecnico') c = await salvarAssinaturaTecnico(id, body.png || null);
    else c = await atualizarDados(id, body.dados || {}, Number(body.horas) || null);
    return NextResponse.json(await resposta(c));
  } catch (e) { return erro(e); }
}
