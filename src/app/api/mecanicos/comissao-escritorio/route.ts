// Comissão do escritório do pós-vendas (José, 29/10/2026: "dentro de comissão vai dividir entre Funcionários:
// Técnicos / Escritório (Vinicius Correa e Larissa Garcia)"). A regra própria do escritório ainda vai ser
// definida; por enquanto mostra a comissão que já está no RH (a do Vinicius vem do Omie, base garantias/diversos).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { clienteRH } from '@/lib/mecanicos/rh-server'
import { casarNome } from '@/lib/mecanicos/ocorrencias-painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ESCRITORIO = ['Vinicius Correa', 'Larissa Garcia']

type Rec = Record<string, unknown>

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const c = clienteRH()
  if (!c) return NextResponse.json({ pessoas: ESCRITORIO.map((nome) => ({ nome, rh: null, comissoes: [] })), erro: 'O portal não tem acesso ao banco do RH.' })
  const { data: fun, error } = await c.from('rh_funcionarios').select('id, nome, cargo, departamento, status')
  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  const lista = ((fun || []) as Rec[]).filter((f) => f.status !== 'desligado')
  const pessoas = await Promise.all(ESCRITORIO.map(async (nome) => {
    const achado = casarNome(nome, lista.map((f) => String(f.nome)))
    const f = achado ? lista.find((x) => x.nome === achado) : null
    if (!f) return { nome, rh: null, comissoes: [] }
    const { data: com } = await c.from('rh_comissoes').select('competencia_mes, competencia_ano, valor, status, origem_descricao')
      .eq('funcionario_id', f.id).not('status', 'in', '(cancelada,rejeitada)')
      .order('competencia_ano', { ascending: false }).order('competencia_mes', { ascending: false }).limit(12)
    return {
      nome,
      rh: { nome: String(f.nome), cargo: (f.cargo as string) || null, departamento: (f.departamento as string) || null },
      comissoes: ((com || []) as Rec[]).map((x) => ({
        mes: `${x.competencia_ano}-${String(x.competencia_mes).padStart(2, '0')}`,
        valor: Number(x.valor) || 0, status: String(x.status), origem: String(x.origem_descricao || ''),
      })),
    }
  }))
  return NextResponse.json({ pessoas })
}
