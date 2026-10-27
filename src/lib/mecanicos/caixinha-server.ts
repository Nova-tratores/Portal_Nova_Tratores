// Caixinha dos técnicos ("caixinha do problema") lida do sistema do RH para a Janela Mecânicos (José, 27/10/2026:
// "coloca o valor dela, os extratos, os valores que entram e que saem, antes de Mecânicos do mês, e explica como
// ela funciona"). SÓ LEITURA: quem mexe (contribuição, desconto, redistribuição) é o RH (lib/caixinha.ts de lá).
// Regras de lá: ciclo de 3 meses; cada comissão de técnico aprovada põe 1% na caixinha; desconto de erro pode sair
// da caixinha; no fim do ciclo a empresa DOBRA o saldo (aporte) e o total é dividido igual entre quem contribuiu.
import { clienteRH } from './rh-server'

export interface MovCaixinha {
  tipo: 'contribuicao' | 'aporte' | 'desconto' | 'redistribuicao'
  valor: number
  descricao: string | null
  funcionario: string | null
  em: string
}

export interface Caixinha {
  disponivel: boolean
  erro?: string
  ciclo?: { inicio: string; fim: string; status: 'aberto' | 'redistribuido'; vencido: boolean }
  saldo: number
  entrou: number      // contribuições (1% das comissões)
  aporte: number      // a empresa dobra no fim do ciclo
  saiu: number        // descontos pagos pela caixinha
  redistribuido: number
  contribuintes: number
  porTecnico: { nome: string; entrou: number; saiu: number }[]
  extrato: MovCaixinha[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const r2 = (v: number) => Math.round(v * 100) / 100

export async function lerCaixinha(hoje: { mes: number; ano: number }): Promise<Caixinha> {
  const vazio: Caixinha = { disponivel: false, saldo: 0, entrou: 0, aporte: 0, saiu: 0, redistribuido: 0, contribuintes: 0, porTecnico: [], extrato: [] }
  const db = clienteRH()
  if (!db) return { ...vazio, erro: 'O portal não tem acesso ao banco do RH (RH_SUPABASE_URL / RH_SUPABASE_SERVICE_KEY).' }
  const { data: ciclo, error: e1 } = await db.from('rh_caixinha_ciclo').select('*').eq('status', 'aberto')
    .order('inicio_ano', { ascending: false }).order('inicio_mes', { ascending: false }).limit(1).maybeSingle()
  if (e1) return { ...vazio, erro: e1.message }
  if (!ciclo) return { ...vazio, disponivel: true, erro: 'Nenhum ciclo da caixinha aberto no RH.' }
  const c = ciclo as { id: string; inicio_mes: number; inicio_ano: number; fim_mes: number; fim_ano: number; status: 'aberto' | 'redistribuido' }
  const { data: movs, error: e2 } = await db.from('rh_caixinha_mov').select('tipo, valor, descricao, criado_em, funcionario:rh_funcionarios(nome)')
    .eq('ciclo_id', c.id).order('criado_em', { ascending: false })
  if (e2) return { ...vazio, erro: e2.message }
  const lista = ((movs || []) as unknown as { tipo: MovCaixinha['tipo']; valor: number; descricao: string | null; criado_em: string; funcionario: { nome: string } | null }[])
  let entrou = 0, aporte = 0, saiu = 0, redistribuido = 0
  const porTec = new Map<string, { entrou: number; saiu: number }>()
  for (const m of lista) {
    const v = Number(m.valor) || 0
    const nome = m.funcionario?.nome || ''
    if (m.tipo === 'contribuicao') entrou += v
    else if (m.tipo === 'aporte') aporte += v
    else if (m.tipo === 'desconto') saiu += v
    else if (m.tipo === 'redistribuicao') redistribuido += v
    if (nome && (m.tipo === 'contribuicao' || m.tipo === 'desconto')) {
      const t = porTec.get(nome) || { entrou: 0, saiu: 0 }
      if (m.tipo === 'contribuicao') t.entrou += v; else t.saiu += v
      porTec.set(nome, t)
    }
  }
  // mesmo saldo do RH: contribuído − descontado − redistribuído + aporte
  const vencido = (hoje.ano - c.fim_ano) * 12 + (hoje.mes - c.fim_mes) > 0
  return {
    disponivel: true,
    ciclo: { inicio: `${MESES[c.inicio_mes - 1]}/${c.inicio_ano}`, fim: `${MESES[c.fim_mes - 1]}/${c.fim_ano}`, status: c.status, vencido },
    saldo: r2(entrou - saiu - redistribuido + aporte), entrou: r2(entrou), aporte: r2(aporte), saiu: r2(saiu), redistribuido: r2(redistribuido),
    contribuintes: [...porTec.values()].filter((t) => t.entrou > 0).length,
    porTecnico: [...porTec.entries()].map(([nome, t]) => ({ nome, entrou: r2(t.entrou), saiu: r2(t.saiu) })).sort((a, b) => b.entrou - a.entrou),
    extrato: lista.map((m) => ({ tipo: m.tipo, valor: r2(Number(m.valor) || 0), descricao: m.descricao, funcionario: m.funcionario?.nome || null, em: m.criado_em })),
  }
}
