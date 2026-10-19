// Detalhe de uma OS do "Dinheiro parado" (José, 19/10/2026: "quando clicar na ordem, já abre o modal ali
// mesmo com as peças se tiver"). Só leitura: dados da OS + peças dos PPVs vinculados (movimentações,
// devolução abate, desconto do pedido).
// GET → { os, ppvs: [{ id, status, desconto, itens: [{ cod, descricao, qtd, preco, total }], total }] }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_OS, TBL_ITENS } from '@/lib/pos/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  const { id } = await params
  const { data: os, error } = await sb.from(TBL_OS).select('Id_Ordem, Os_Cliente, Cnpj_Cliente, Cidade_Cliente, Os_Tecnico, Os_Tecnico2, Data, Serv_Solicitado, Causa, Serv_Realizado, Qtd_HR, Valor_HR, Qtd_KM, Valor_KM, Desconto, Desconto_Hora, Desconto_KM, Valor_Total, Status, ID_PPV, Ordem_Omie, Tipo_Servico, Revisao, Projeto, Previsao_Execucao, Dias_Execucao, ID_Relatorio_Final').eq('Id_Ordem', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!os) return NextResponse.json({ error: 'OS não encontrada' }, { status: 404 })

  const ids = String(os.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ppvs: { id: string; status: string; desconto: number; itens: { cod: string; descricao: string; qtd: number; preco: number; total: number }[]; total: number }[] = []
  if (ids.length) {
    const [itensQ, pedsQ] = await Promise.all([
      sb.from(TBL_ITENS).select('Id_PPV, CodProduto, Descricao, Preco, Qtde, TipoMovimento').in('Id_PPV', ids),
      sb.from('pedidos').select('id_pedido, status, desconto_percentual').in('id_pedido', ids),
    ])
    const ped = new Map((pedsQ.data || []).map((p) => [String(p.id_pedido), p]))
    for (const ppv of ids) {
      const grupo = new Map<string, { cod: string; descricao: string; qtd: number; preco: number; total: number }>()
      for (const it of (itensQ.data || []).filter((x) => String(x.Id_PPV) === ppv)) {
        const cod = String(it.CodProduto || '')
        let q = Math.abs(num(it.Qtde))
        if (String(it.TipoMovimento || '').toLowerCase().includes('devolu')) q = -q
        const g = grupo.get(cod) || { cod, descricao: String(it.Descricao || ''), qtd: 0, preco: num(it.Preco), total: 0 }
        g.qtd += q; g.total += num(it.Preco) * q
        grupo.set(cod, g)
      }
      const itens = [...grupo.values()].filter((g) => g.qtd !== 0).sort((a, b) => b.total - a.total)
      const p = ped.get(ppv)
      const desconto = Math.min(100, Math.max(0, num(p?.desconto_percentual)))
      const bruto = itens.reduce((s, x) => s + x.total, 0)
      ppvs.push({ id: ppv, status: String(p?.status || ''), desconto, itens, total: Math.round(bruto * (1 - desconto / 100) * 100) / 100 })
    }
  }
  return NextResponse.json({ os, ppvs })
}
