// Documento final da comissão (A4, com as OS e as duas assinaturas) — José, 20/10/2026.
// GET ?id=<pedido> → HTML pronto para imprimir/salvar em PDF. Antes de autorizado sai com a marca "aguardando".
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { pedidoCompleto, codigoPedido, SemTabela } from '@/lib/mecanicos/lancamento-comissao-server'
import { htmlAutorizacaoComissao } from '@/lib/mecanicos/autorizacao-comissao-doc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try {
    const p = await pedidoCompleto(String(req.nextUrl.searchParams.get('id') || ''))
    if (!p) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    const autorizada = !!p.assinatura_diretor && ['espelhada', 'erro_rh', 'substituida'].includes(p.status)
    const html = htmlAutorizacaoComissao({
      codigo: codigoPedido(p), tecnico: p.tecnico, nomeRh: p.info?.nomeRh, cargo: p.info?.cargo, mes: p.mes, pct: p.info?.pct ?? null, pagamentoPrevisto: p.info?.pagamento || null,
      linhas: (p.linhas || []).map((l) => ({ os: l.os, numero: l.numero || l.os, data: l.data || null, cliente: l.cliente, grupo: l.grupo || 'cliente', regra: l.regra || '', calculado: Number(l.calculado) || 0, valor: Number(l.valor) || 0, acao: l.acao, motivo: l.motivo, divisao: l.divisao || null, descontoCliente: l.descontoCliente || null })),
      solicitante: { nome: p.pedido_por || '—', papel: 'Pós-Vendas · pediu a autorização', em: p.assinatura_pedido_meta?.em || p.pedido_em, imagem: p.assinatura_pedido || null, ip: p.assinatura_pedido_meta?.ip },
      diretor: autorizada ? { nome: p.decidido_por || '—', papel: 'Diretor · autorizou', em: p.assinatura_diretor_meta?.em || p.decidido_em || p.pedido_em, imagem: p.assinatura_diretor || null, ip: p.assinatura_diretor_meta?.ip, observacao: p.observacao } : null,
      descontos: p.descontos || [],
      logo: `${req.nextUrl.origin}/Logo_Nova.png`, emitidoEm: new Date().toISOString(),
    })
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof SemTabela) return NextResponse.json({ error: e.message, semTabela: true }, { status: 503 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 })
  }
}
