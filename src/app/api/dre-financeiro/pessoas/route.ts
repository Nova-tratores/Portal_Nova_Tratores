// =============================================================================
// API: área Pessoas do Financeiro novo (06/11/2026). Para o mês e a empresa escolhidos devolve:
//   - as contas a pagar do Omie (espelho) dos blocos P1 a P4, pelo vencimento (lerContasModulo);
//   - as comissões calculadas no portal do mês anterior (a de outubro é paga em novembro);
//   - as requisições de Alimentação do mês (a requisição não guarda a empresa: vêm todas).
// Só lê. Mesma trava das telas do Caixa (módulo financeiro).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { BLOCOS_PESSOAS, type ContaPessoas, type RespostaPessoas } from '@/lib/financeiro/pessoas'
import { fimDoMes, lerContasModulo, mesDeHoje, mesValido } from '@/lib/financeiro/modulosContas-server'
import { paginar } from '@/lib/db/paginar'

export const dynamic = 'force-dynamic'

const COMISSAO_VALE = ['aguardando', 'devolvida', 'erro_rh', 'espelhada'] // igual a lib/mecanicos/controle-comissoes-server
const mesAnterior = (m: string) => { const [a, n] = m.split('-').map(Number); const d = new Date(Date.UTC(a, n - 2, 1)); return d.toISOString().slice(0, 7) }
// "50,00" / "1.234,56" → número
const numBR = (v: unknown) => { if (typeof v === 'number') return v; const s = String(v ?? '').trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0 }

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'calendario')
  if (g.resposta) return g.resposta
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sb = supabase
  try {
    const sp = request.nextUrl.searchParams
    const mes = mesValido(sp.get('mes')) || mesDeHoje()
    const conta = sp.get('conta') === 'castro' ? 'castro' : 'nova'
    const de = `${mes}-01`, ate = fimDoMes(mes), mesCom = mesAnterior(mes)

    const [contasOmie, rCom, rAli] = await Promise.all([
      lerContasModulo(BLOCOS_PESSOAS, mes, conta),
      // mesma regra do Controle de comissões da Gestão: só os status que valem, o pedido mais recente de cada técnico
      supabase.from('posvendas_comissoes').select('id, tecnico, mes, valor, status').eq('mes', mesCom).in('status', COMISSAO_VALE).order('pedido_em', { ascending: false }),
      paginar((a, b) => sb.from('Requisicao').select('id, titulo, solicitante, data, status, valor_despeza, ordem_servico, fornecedor')
        .eq('tipo', 'Alimentação').gte('data', de).lte('data', ate).neq('status', 'lixeira').order('data', { ascending: false }).order('id', { ascending: false }).range(a, b)),
    ])
    for (const r of [rCom, rAli]) if (r.error) throw new Error(r.error.message)

    const resposta: RespostaPessoas = {
      mes, conta, contas: contasOmie as ContaPessoas[], mesComissoes: mesCom,
      comissoes: (rCom.data || [])
        .filter((c: Record<string, unknown>, i: number, l: Record<string, unknown>[]) => l.findIndex((x) => x.tecnico === c.tecnico) === i)
        .map((c: Record<string, unknown>) => ({ id: String(c.id), tecnico: String(c.tecnico), mes: String(c.mes), valor: Number(c.valor) || 0, status: String(c.status) }))
        .sort((a: { tecnico: string }, b: { tecnico: string }) => a.tecnico.localeCompare(b.tecnico)),
      alimentacao: (rAli.data || []).map((a: Record<string, unknown>) => ({
        id: Number(a.id), titulo: (a.titulo as string) || null, solicitante: (a.solicitante as string) || null, data: String(a.data),
        status: String(a.status), valor: numBR(a.valor_despeza), ordem_servico: (a.ordem_servico as string) || null, fornecedor: (a.fornecedor as string) || null,
      })),
    }
    return NextResponse.json(resposta)
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
