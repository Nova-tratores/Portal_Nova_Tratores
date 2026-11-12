// =============================================================================
// PAINEL — QR da garantia por trator (aba "Página do cliente" em /garantias
// e tela /garantias/vincular, aberta pelo celular ao ler um adesivo livre).
//
// GET  ?q=           -> tratores (chassi/cliente/modelo) com o código
// GET  ?lotes=1      -> lotes de adesivos (total × ligados)
// GET  ?lote=L-...   -> códigos do lote (para baixar o PDF de novo)
// GET  ?codigo=XXX   -> situação de um código (livre ou de qual trator)
// POST { chassis }                       -> cria/devolve o código do trator
// POST { codigo, baixou: true }          -> conta o download
// POST { acao: 'lote', quantidade }      -> lote de códigos livres (só Garantias)
// POST { acao: 'vincular', codigo, chassis }
// POST { acao: 'desvincular', codigo }   (só Garantias)
// Gate: Garantias ou Pós-Vendas (quem faz a entrega técnica liga o adesivo).
// =============================================================================
import { NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { normalizarCodigo, quantidadeLote } from '@/lib/garantias/qr-trator';
import {
  codigosDoLote, desvincular, garantirCodigo, gerarLote, listarLotes, listarTratores, marcarDownload,
  migrationFaltou, MSG_MIGRATION_QR, situacaoCodigo, vincular,
} from '@/lib/garantias/qr-trator-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACESSO = [{ modulo: 'garantias' }, { modulo: 'pos' }];
const SO_GARANTIAS = [{ modulo: 'garantias' }];

const MSG_MIGRATION_LOTE =
  'Falta liberar os lotes de adesivos. Rode sql/garantia-qr-tratores-lote.sql no SQL Editor do Supabase.';

function erro(e: unknown, onde: string) {
  const err = e as { status?: number; code?: string; message?: string };
  // coluna "lote"/"vinculado_em" ou chassis NOT NULL = falta a migration dos lotes
  if (err?.code === '42703' || err?.code === '23502') {
    return NextResponse.json({ ok: false, migracaoFaltando: true, erro: MSG_MIGRATION_LOTE }, { status: 503 });
  }
  if (migrationFaltou(e)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: MSG_MIGRATION_QR }, { status: 503 });
  if (err?.status === 404 || err?.status === 409) return NextResponse.json({ ok: false, erro: err.message }, { status: err.status });
  console.error(`[garantia-cliente] qr ${onde}:`, e);
  return NextResponse.json({ ok: false, erro: 'Erro no servidor' }, { status: 500 });
}

export async function GET(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const sp = new URL(req.url).searchParams;
  const h = { headers: { 'Cache-Control': 'no-store' } };
  try {
    if (sp.get('lotes')) return NextResponse.json({ ok: true, lotes: await listarLotes() }, h);
    const lote = sp.get('lote');
    if (lote) return NextResponse.json({ ok: true, codigos: await codigosDoLote(lote.slice(0, 40)) }, h);
    if (sp.has('codigo')) {
      const codigo = normalizarCodigo(sp.get('codigo'));
      if (!codigo) return NextResponse.json({ ok: false, erro: 'Código inválido.' }, { status: 400 });
      const situacao = await situacaoCodigo(codigo);
      if (!situacao) return NextResponse.json({ ok: false, erro: 'Este código não é de um adesivo da Nova Tratores.' }, { status: 404 });
      return NextResponse.json({ ok: true, situacao }, h);
    }
    return NextResponse.json({ ok: true, tratores: await listarTratores(sp.get('q') || '') }, h);
  } catch (e) {
    return erro(e, 'listar');
  }
}

export async function POST(req: Request) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const quem = acesso.user.nome || acesso.user.email || 'portal';
  try {
    if (corpo.acao === 'lote' || corpo.acao === 'desvincular') {
      const so = await protegerRota(req, SO_GARANTIAS);
      if (so.resposta) return so.resposta;
    }
    if (corpo.acao === 'lote') {
      const quantidade = quantidadeLote(corpo.quantidade);
      if (!quantidade) return NextResponse.json({ ok: false, erro: 'Quantidade entre 1 e 500.' }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await gerarLote(quantidade, quem)) });
    }
    if (corpo.acao === 'vincular' || corpo.acao === 'desvincular' || corpo.baixou) {
      const codigo = normalizarCodigo(corpo.codigo);
      if (!codigo) return NextResponse.json({ ok: false, erro: 'Código inválido.' }, { status: 400 });
      if (corpo.baixou) {
        await marcarDownload(codigo);
        return NextResponse.json({ ok: true });
      }
      if (corpo.acao === 'desvincular') {
        await desvincular(codigo);
        return NextResponse.json({ ok: true });
      }
      const chassis = String(corpo.chassis ?? '').trim();
      if (chassis.length < 4 || chassis.length > 40) return NextResponse.json({ ok: false, erro: 'Chassi inválido.' }, { status: 400 });
      await vincular(codigo, chassis, quem);
      return NextResponse.json({ ok: true });
    }
    const chassis = String(corpo.chassis ?? '').trim();
    if (chassis.length < 4 || chassis.length > 40) return NextResponse.json({ ok: false, erro: 'Chassi inválido.' }, { status: 400 });
    return NextResponse.json({ ok: true, codigo: await garantirCodigo(chassis, quem) });
  } catch (e) {
    return erro(e, String(corpo.acao || 'criar'));
  }
}
