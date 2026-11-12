// =============================================================================
// PAINEL — QR da garantia por trator (aba "Página do cliente" em /garantias).
//
// GET  /api/garantia-cliente/qr?q=     -> tratores (chassi/cliente/modelo) com o código
// POST /api/garantia-cliente/qr        { chassis }        -> cria/devolve o código
// POST /api/garantia-cliente/qr        { codigo, baixou } -> conta o download
// Gate: módulo garantias (o mesmo da tela).
// =============================================================================
import { NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { normalizarCodigo } from '@/lib/garantias/qr-trator';
import { garantirCodigo, listarTratores, marcarDownload, migrationFaltou, MSG_MIGRATION_QR } from '@/lib/garantias/qr-trator-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACESSO = [{ modulo: 'garantias' }];

function erro(e: unknown, onde: string) {
  if (migrationFaltou(e)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: MSG_MIGRATION_QR }, { status: 503 });
  const status = (e as { status?: number })?.status;
  if (status === 404) return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 404 });
  console.error(`[garantia-cliente] qr ${onde}:`, e);
  return NextResponse.json({ ok: false, erro: 'Erro no servidor' }, { status: 500 });
}

export async function GET(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  try {
    const tratores = await listarTratores(new URL(req.url).searchParams.get('q') || '');
    return NextResponse.json({ ok: true, tratores }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return erro(e, 'listar');
  }
}

export async function POST(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const corpo = (await req.json().catch(() => ({}))) as { chassis?: unknown; codigo?: unknown; baixou?: unknown };
  try {
    if (corpo.baixou) {
      const codigo = normalizarCodigo(corpo.codigo);
      if (!codigo) return NextResponse.json({ ok: false, erro: 'código inválido' }, { status: 400 });
      await marcarDownload(codigo);
      return NextResponse.json({ ok: true });
    }
    const chassis = String(corpo.chassis ?? '').trim();
    if (chassis.length < 4 || chassis.length > 40) return NextResponse.json({ ok: false, erro: 'chassi inválido' }, { status: 400 });
    const quem = acesso.user.nome || acesso.user.email || 'portal';
    const codigo = await garantirCodigo(chassis, quem);
    return NextResponse.json({ ok: true, codigo });
  } catch (e) {
    return erro(e, 'criar');
  }
}
