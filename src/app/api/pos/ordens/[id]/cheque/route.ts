// Cheque de revisão da OS (uso pelo POS).
//   GET   → cheque da OS (cria com dados iniciais na 1ª vez) + links
//           ?h=300        → o cheque das 300h desta OS (atrasado)
//           ?anteriores=1 → revisões anteriores à da OS e a situação de cada uma
//   POST  → { acao: 'gerar_atrasado', horas } cria o cheque de uma revisão anterior
//           { acao: 'apagar_atrasado', horas } apaga um cheque atrasado
//   PATCH → { dados: {...}, horas? } edita campos | { acao: 'repreencher' } refaz da OS
//           | { acao: 'reabrir_assinatura' } apaga assinatura do cliente e troca o link
//           | { acao: 'assinatura_tecnico', png: 'data:image/png;base64,...' | null }
//           (?h=300 aponta pro cheque atrasado daquelas horas; sem ?h é o principal)
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import {
  ErroCheque, apagarAtrasado, atualizarDados, buscarPorOS, garantirCheque, gerarAtrasado, linkCheque, reabrirAssinatura, repreencher,
  revisoesAnteriores, salvarAssinaturaTecnico, type ChequeRow,
} from '@/lib/revisoes/cheque-db';
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
    const st = e.codigo === 'os_nao_encontrada' || e.codigo === 'cheque_nao_encontrado' ? 404 : e.codigo === 'tabela_ausente' || e.codigo === 'migration_atrasados' ? 503 : 422;
    return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: st });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
}

const horasDe = (req: NextRequest) => { const h = Number(req.nextUrl.searchParams.get('h') || 0); return h > 0 ? h : null; };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    if (req.nextUrl.searchParams.get('anteriores')) return NextResponse.json(await revisoesAnteriores(id));
    const h = horasDe(req);
    if (h) {
      const c = await buscarPorOS(id, h);
      if (!c) return NextResponse.json({ error: `A OS não tem cheque das ${h} horas.`, codigo: 'cheque_nao_encontrado' }, { status: 404 });
      return NextResponse.json(await resposta(c));
    }
    return NextResponse.json(await resposta(await garantirCheque(id, auth.email || null)));
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const horas = Number(body.horas) || 0;
    if (body.acao === 'gerar_atrasado') return NextResponse.json(await resposta(await gerarAtrasado(id, horas, auth.email || null)));
    if (body.acao === 'apagar_atrasado') { await apagarAtrasado(id, horas); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
  } catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const h = horasDe(req);
  try {
    const body = await req.json().catch(() => ({}));
    let c: ChequeRow;
    if (body.acao === 'repreencher') c = await repreencher(id, h);
    else if (body.acao === 'reabrir_assinatura') c = await reabrirAssinatura(id, h);
    else if (body.acao === 'assinatura_tecnico') c = await salvarAssinaturaTecnico(id, body.png || null, h);
    else c = await atualizarDados(id, body.dados || {}, Number(body.horas) || null, h);
    return NextResponse.json(await resposta(c));
  } catch (e) { return erro(e); }
}
