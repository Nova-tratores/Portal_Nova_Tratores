// PÚBLICO: o cheque de revisão em HTML (A4, tamanho real), pronto pra abrir,
// imprimir ou salvar em PDF. É este o link que vai nas observações da OS no
// Omie e o que o POS abre. Fora de (portal): sem login, sem sidebar.
import { NextRequest } from 'next/server';
import { ErroCheque, buscarPorToken } from '@/lib/revisoes/cheque-db';
import { htmlCheque } from '@/lib/revisoes/cheque';
import { assinaturaTecnicoDisponivel } from '@/lib/revisoes/cheque-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BARRA = `<style>
  .barra-print { position: sticky; top: 0; z-index: 9; background: #fff; border-bottom: 3px solid #E8462B; padding: 10px 16px; display: flex; gap: 10px; align-items: center; font-family: Arial, sans-serif; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .barra-print b { color: #E8462B; }
  .barra-print button { margin-left: auto; background: #E8462B; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; }
  .barra-print .st { color: #555; }
</style>`;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const c = await buscarPorToken(token);
    const html = htmlCheque(c.dados, {
      horas: c.horas,
      assinaturaClienteUrl: c.assinatura_cliente_url,
      assinaturaTecnicoUrl: c.assinatura_tecnico_url || assinaturaTecnicoDisponivel(c.dados.tecnico),
      carimbo: true,
      extraHead: BARRA,
    });
    const status = c.assinado_em ? `Assinado pelo cliente em ${new Date(c.assinado_em).toLocaleDateString('pt-BR')}` : 'Aguardando assinatura do cliente';
    const barra = `<div class="barra-print no-print"><b>Cheque de revisão ${c.horas}h</b> · OS ${c.os_id} · chassi ${c.chassis.slice(-6)} <span class="st">· ${status}</span><button onclick="window.print()">Imprimir / salvar PDF</button></div>`;
    return new Response(html.replace('<body>', `<body>${barra}`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  } catch (e) {
    const msg = e instanceof ErroCheque ? 'Link inválido ou expirado.' : 'Erro ao montar o cheque.';
    return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;padding:40px;color:#333"><h2>${msg}</h2></body>`, { status: e instanceof ErroCheque ? 404 : 500, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}
