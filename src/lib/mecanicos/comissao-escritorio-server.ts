// Comissão do escritório do pós-vendas (José, 29/10/2026) — SÓ SERVIDOR.
// Garantista (função dada na Administração: módulo Gestão Pós Vendas → "Garantista"):
//   1% do total das GARANTIAS faturadas no mês (OS + peças) + X% do total das REVISÕES faturadas no mês (OS + peças).
//   X começa em 1% e só o Gerente do Pós-Vendas (mesma tela da Administração → "Gerente do Pós-Vendas") muda.
// Larissa Garcia: regra ainda a definir — aparece sem cálculo.
// Config em posvendas_config (chave "comissao-escritorio"); sem a tabela, iv_config "posvendas:comissao-escritorio".
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarBase } from './painel-server'
import { comCache } from './cache'
import { clienteRH } from './rh-server'
import { casarNome } from './ocorrencias-painel'

export const ACAO_GARANTISTA = 'mecanicos:garantista'
export const ACAO_GERENTE = 'mecanicos:gerente_posvendas'
const SEM_REGRA = ['Larissa Garcia']
const CHAVE = 'comissao-escritorio'

export interface ConfigEscritorio { pctGarantia: number; pctRevisao: number; atualizadoEm?: string | null; atualizadoPor?: string | null }
const PADRAO: ConfigEscritorio = { pctGarantia: 1, pctRevisao: 1 }
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))
const r2 = (n: number) => Math.round(n * 100) / 100
const pctOk = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 20 ? Math.round(n * 100) / 100 : d }

export async function lerConfigEscritorio(): Promise<ConfigEscritorio> {
  let linha: { valor: unknown; atualizado_em: string | null; atualizado_por: string | null } | null = null
  const a = await sb.from('posvendas_config').select('valor, atualizado_em, atualizado_por').eq('chave', CHAVE).maybeSingle()
  if (!a.error) linha = a.data
  if (!linha && (a.error ? falta(a.error) : true)) {
    const b = await sb.from('iv_config').select('valor, atualizado_em, atualizado_por').eq('chave', `posvendas:${CHAVE}`).maybeSingle()
    if (!b.error) linha = b.data
  }
  const v = (linha?.valor || {}) as Partial<ConfigEscritorio>
  return { pctGarantia: pctOk(v.pctGarantia, PADRAO.pctGarantia), pctRevisao: pctOk(v.pctRevisao, PADRAO.pctRevisao), atualizadoEm: linha?.atualizado_em ?? null, atualizadoPor: linha?.atualizado_por ?? null }
}

export async function gravarConfigEscritorio(pctRevisao: unknown, autor: string): Promise<ConfigEscritorio> {
  const atual = await lerConfigEscritorio()
  const valor = { pctGarantia: atual.pctGarantia, pctRevisao: pctOk(pctRevisao, atual.pctRevisao) }
  const reg = { valor, atualizado_em: new Date().toISOString(), atualizado_por: autor }
  const a = await sb.from('posvendas_config').upsert({ chave: CHAVE, ...reg })
  if (a.error) {
    if (!falta(a.error)) throw new Error(a.error.message)
    const b = await sb.from('iv_config').upsert({ chave: `posvendas:${CHAVE}`, ...reg })
    if (b.error) throw new Error(b.error.message)
  }
  return { ...valor, atualizadoEm: reg.atualizado_em, atualizadoPor: autor }
}

export interface OSBase { os: string; numero: string | null; cliente: string; data: string; total: number; tipo: string }
export interface PessoaEscritorio {
  nome: string; foto: string | null; funcao: 'garantista' | 'sem_regra'
  rh: { nome: string; cargo: string | null; departamento: string | null } | null
  comissoes: { mes: string; valor: number; status: string; origem: string }[]
}

/** Quem tem a função Garantista na Administração (+ quem ainda não tem regra). */
async function pessoas(): Promise<{ nome: string; foto: string | null; funcao: PessoaEscritorio['funcao'] }[]> {
  const { data: ps } = await sb.from('portal_permissoes').select('user_id, modulos_permitidos').contains('modulos_permitidos', [ACAO_GARANTISTA])
  const ids = ((ps || []) as { user_id: string }[]).map((p) => p.user_id)
  const { data: us } = ids.length ? await sb.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids) : { data: [] }
  const lista: { nome: string; foto: string | null; funcao: PessoaEscritorio['funcao'] }[] = ((us || []) as { nome: string | null; avatar_url: string | null }[]).filter((u) => u.nome?.trim()).map((u) => ({ nome: u.nome!.trim(), foto: u.avatar_url, funcao: 'garantista' as const }))
  for (const n of SEM_REGRA) if (!lista.some((x) => casarNome(n, [x.nome]) || casarNome(x.nome, [n]))) lista.push({ nome: n, foto: null, funcao: 'sem_regra' })
  return lista
}

/** Garantias e revisões faturadas no mês (OS + peças). */
export async function basesDoMes(mes: string): Promise<{ garantias: OSBase[]; revisoes: OSBase[] }> {
  const de = `${mes}-01`, ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const base = (await comCache(`esc-base:${mes}`, 10 * 60_000, () => carregarBase(de, ate))).dados
  const fat = base.faturadas.filter((o) => o.data >= de && o.data <= ate)
  // tipo de serviço do portal (Revisão, Garantia Trator…); OS só do Omie fica pelo selo de garantia
  const tipo = new Map<string, string>()
  const ids = fat.map((o) => o.os).filter((x) => !x.startsWith('OMIE'))
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Ordem_Servico').select('Id_Ordem, Tipo_Servico').in('Id_Ordem', ids.slice(i, i + 200))
    for (const r of (data || []) as { Id_Ordem: string; Tipo_Servico: string | null }[]) tipo.set(r.Id_Ordem, String(r.Tipo_Servico || ''))
  }
  const linha = (o: (typeof fat)[number]): OSBase => ({ os: o.os, numero: o.numeroOmie, cliente: o.cliente, data: o.data, total: r2(o.bruto + o.pecas), tipo: tipo.get(o.os) || (o.garantia ? 'Garantia' : '') })
  const garantias = fat.filter((o) => o.garantia || /garantia/i.test(tipo.get(o.os) || '')).map(linha)
  const revisoes = fat.filter((o) => /revis/i.test(tipo.get(o.os) || '') && !o.garantia).map(linha)
  const ord = (a: OSBase, b: OSBase) => b.data.localeCompare(a.data)
  return { garantias: garantias.sort(ord), revisoes: revisoes.sort(ord) }
}

export async function comissaoEscritorio(mes: string) {
  const [config, gente, bases] = await Promise.all([lerConfigEscritorio(), pessoas(), basesDoMes(mes)])
  const totG = r2(bases.garantias.reduce((a, o) => a + o.total, 0)), totR = r2(bases.revisoes.reduce((a, o) => a + o.total, 0))
  const conta = { garantias: totG, revisoes: totR, comGarantia: r2(totG * config.pctGarantia / 100), comRevisao: r2(totR * config.pctRevisao / 100) }
  // histórico no RH
  const c = clienteRH()
  const fun = c ? (((await c.from('rh_funcionarios').select('id, nome, cargo, departamento, status')).data || []) as { id: string; nome: string; cargo: string | null; departamento: string | null; status: string }[]).filter((f) => f.status !== 'desligado') : []
  const lista: PessoaEscritorio[] = await Promise.all(gente.map(async (p) => {
    const achado = casarNome(p.nome, fun.map((f) => f.nome))
    const f = achado ? fun.find((x) => x.nome === achado) : null
    let comissoes: PessoaEscritorio['comissoes'] = []
    if (c && f) {
      const { data } = await c.from('rh_comissoes').select('competencia_mes, competencia_ano, valor, status, origem_descricao').eq('funcionario_id', f.id).not('status', 'in', '(cancelada,rejeitada)')
        .order('competencia_ano', { ascending: false }).order('competencia_mes', { ascending: false }).limit(12)
      comissoes = ((data || []) as Record<string, unknown>[]).map((x) => ({ mes: `${x.competencia_ano}-${String(x.competencia_mes).padStart(2, '0')}`, valor: Number(x.valor) || 0, status: String(x.status), origem: String(x.origem_descricao || '') }))
    }
    return { ...p, rh: f ? { nome: f.nome, cargo: f.cargo, departamento: f.departamento } : null, comissoes }
  }))
  return { mes, config, conta, total: r2(conta.comGarantia + conta.comRevisao), bases, pessoas: lista }
}
