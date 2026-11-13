// GET /api/empresa/dre-lancamentos?mes=2026-11&setor=comercial&linha=despesas[&conta=03. Despesas Financeiras]
// Os lançamentos que formam um número do resultado gerencial de um setor, para a janela da tela de Despesas do
// /empresa (José, 12/11: "clicar e já mostra tudo, fácil de entender; se precisa de PDF, abre o modal").
// Lê os lançamentos JÁ GRAVADOS do mês (empresa_painel, area 'lanc:AAAA-MM' — src/lib/empresa/painel-gravado.ts),
// com o setor e a linha da mesma regra do DRE gerencial. José: "não pode ficar carregando, tem que ser em uma tabela".
// linha=geral → as despesas gerais da empresa (o setor leva uma parte, pela receita).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerLancamentos } from '@/lib/empresa/painel-gravado'
import type { SetorG } from '@/lib/empresa/dre-gerencial'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const sp = req.nextUrl.searchParams
  const mes = sp.get('mes') || ''
  const setor = (sp.get('setor') || 'comercial') as SetorG
  const linha = sp.get('linha') || 'todas'
  const conta = sp.get('conta') || ''
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ erro: 'Mês inválido.' }, { status: 400 })
  try {
    const m = await lerLancamentos(mes)
    const itens = m.itens.filter((i) => {
      if (linha === 'geral') return i.setor === null && (i.linha === 'despesas' || i.linha === 'custos' || i.linha === 'outrasReceitas')
      if (i.setor !== setor) return false
      if (conta) return i.dreConta === conta
      if (linha === 'todas') return true
      if (linha === 'despesas') return i.linha === 'despesas' || i.linha === 'outrasReceitas' // = "Despesas do Comercial" da tela
      return i.linha === linha
    }).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
    return NextResponse.json({ mes, setor, linha, conta, parteReceita: m.parteReceita?.[setor] ?? null, itens: itens.slice(0, 400), total: itens.reduce((a, i) => a + i.valor, 0), qtd: itens.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
}
