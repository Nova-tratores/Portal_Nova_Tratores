// Comissão do escritório do pós-vendas (José, 29/10/2026) — SÓ SERVIDOR.
// Garantista (função dada na Administração: módulo Gestão Pós Vendas → "Garantista"):
//   1% do total das GARANTIAS faturadas no mês (OS + peças) + X% do total das REVISÕES faturadas no mês (OS + peças).
//   X começa em 1% e só o Gerente do Pós-Vendas (mesma tela da Administração → "Gerente do Pós-Vendas") muda.
// Larissa Garcia (29/10/2026): 1% de TUDO que entrou no mês (OS + peças, a mesma conta do "Entrou" do Resultados);
//   o Gerente do Pós-Vendas troca a % ou passa para um valor fixo.
// Config em posvendas_config (chave "comissao-escritorio"); sem a tabela, iv_config "posvendas:comissao-escritorio".
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarBase } from './painel-server'
import { comCache } from './cache'
import { clienteRH } from './rh-server'
import { casarNome } from './ocorrencias-painel'
import { ajustesDeComissao } from './comissao-server'
import { chaveDoTecnico, type ComissaoDetalhada, type LinhaComissao } from './comissao-detalhe'
import { projetarMes } from './comissao'

// função do Pós-Vendas marcada na Administração → usuário → aba Pós-Vendas (lib/permissoes/funcoes-posvendas.ts)
export { FUNCAO_GARANTISTA as ACAO_GARANTISTA, FUNCAO_GERENTE as ACAO_GERENTE } from '@/lib/permissoes/funcoes-posvendas'
import { FUNCAO_GARANTISTA as ACAO_GARANTISTA } from '@/lib/permissoes/funcoes-posvendas'
const SEM_REGRA = ['Larissa Garcia']
const CHAVE = 'comissao-escritorio'

export interface RegraPessoa { modo: 'pct' | 'fixo'; pct: number; fixo: number }
export interface ConfigEscritorio { pctGarantia: number; pctRevisao: number; larissa: RegraPessoa; atualizadoEm?: string | null; atualizadoPor?: string | null }
const PADRAO: ConfigEscritorio = { pctGarantia: 1, pctRevisao: 1, larissa: { modo: 'pct', pct: 1, fixo: 0 } }
const regraOk = (v: unknown, d: RegraPessoa): RegraPessoa => { const o = (v || {}) as Partial<RegraPessoa>; const fixo = Number(o.fixo); return { modo: o.modo === 'fixo' ? 'fixo' : 'pct', pct: pctOk(o.pct, d.pct), fixo: Number.isFinite(fixo) && fixo >= 0 ? Math.round(fixo * 100) / 100 : d.fixo } }
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
  return { pctGarantia: pctOk(v.pctGarantia, PADRAO.pctGarantia), pctRevisao: pctOk(v.pctRevisao, PADRAO.pctRevisao), larissa: regraOk(v.larissa, PADRAO.larissa), atualizadoEm: linha?.atualizado_em ?? null, atualizadoPor: linha?.atualizado_por ?? null }
}

export async function gravarConfigEscritorio(entrada: { pctRevisao?: unknown; larissa?: unknown }, autor: string): Promise<ConfigEscritorio> {
  const atual = await lerConfigEscritorio()
  const valor = { pctGarantia: atual.pctGarantia, pctRevisao: entrada.pctRevisao != null ? pctOk(entrada.pctRevisao, atual.pctRevisao) : atual.pctRevisao, larissa: entrada.larissa != null ? regraOk(entrada.larissa, atual.larissa) : atual.larissa }
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
export async function basesDoMes(mes: string): Promise<{ garantias: OSBase[]; revisoes: OSBase[]; entrou: number }> {
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
  // tudo que entrou no mês nas OS faturadas (OS + peças) — base da comissão da Larissa
  const entrou = r2(fat.reduce((a, o) => a + o.bruto + o.pecas, 0))
  return { garantias: garantias.sort(ord), revisoes: revisoes.sort(ord), entrou }
}

export async function comissaoEscritorio(mes: string) {
  const [config, gente, bases] = await Promise.all([lerConfigEscritorio(), pessoas(), basesDoMes(mes)])
  const totG = r2(bases.garantias.reduce((a, o) => a + o.total, 0)), totR = r2(bases.revisoes.reduce((a, o) => a + o.total, 0))
  // arredonda por OS, igual às linhas da ficha (o cartão e a ficha dão o mesmo valor)
  const conta = { garantias: totG, revisoes: totR, comGarantia: r2(bases.garantias.reduce((a, o) => a + r2(o.total * config.pctGarantia / 100), 0)), comRevisao: r2(bases.revisoes.reduce((a, o) => a + r2(o.total * config.pctRevisao / 100), 0)) }
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
  const lr = config.larissa
  const larissa = { entrou: bases.entrou, modo: lr.modo, pct: lr.pct, fixo: lr.fixo, valor: lr.modo === 'fixo' ? lr.fixo : r2(bases.entrou * lr.pct / 100) }
  return { mes, config, conta, total: r2(conta.comGarantia + conta.comRevisao), bases, pessoas: lista, larissa }
}

/** A pessoa (id do portal) tem a função Garantista? */
export async function ehGarantista(userId: string): Promise<boolean> {
  const { data } = await sb.from('portal_permissoes').select('modulos_permitidos').eq('user_id', userId).maybeSingle()
  return (((data as { modulos_permitidos?: string[] } | null)?.modulos_permitidos) || []).includes(ACAO_GARANTISTA)
}

/** Comissão do garantista com as mesmas linhas da ficha dos técnicos (José, 29/10/2026: "tudo tem que ser igual
 *  ao dos técnicos"): cada OS de garantia e de revisão faturada no mês vira uma linha (base = OS + peças), então
 *  pagar/não pagar/ajustar, pedir autorização ao diretor e o RH funcionam igual. Ajuste já autorizado vem do
 *  comissoes_os_relatorio (por_tecnico com o nome dele). */
export async function comissaoDoGarantista(nome: string, mes: string, hoje: string): Promise<ComissaoDetalhada> {
  const [config, bases] = await Promise.all([lerConfigEscritorio(), basesDoMes(mes)])
  const todas = [...bases.garantias.map((o) => ({ o, pct: config.pctGarantia, rot: 'da garantia', garantia: true })), ...bases.revisoes.map((o) => ({ o, pct: config.pctRevisao, rot: 'da revisão', garantia: false }))]
  const ajustes = await ajustesDeComissao([...new Set(todas.flatMap(({ o }) => [o.numero || o.os, o.os]))]).catch(() => new Map())
  const linhas: LinhaComissao[] = todas.map(({ o, pct, rot, garantia }) => {
    const calculado = r2(o.total * pct / 100)
    const aj = ajustes.get(o.numero || o.os) || ajustes.get(o.os)
    const k = aj?.porTecnico ? Object.keys(aj.porTecnico).find((c) => chaveDoTecnico(c, nome)) : undefined
    const valor = k != null ? r2(Number(aj!.porTecnico![k])) : calculado
    return {
      os: o.os, numeroOmie: o.numero, cliente: o.cliente, data: o.data, tipo: 'faturada' as const, garantia, tecnicos: [],
      regra: `${String(pct).replace('.', ',')}% ${rot} (OS + peças · ${o.tipo || (garantia ? 'Garantia' : 'Revisão')})`,
      base: o.total, divisao: 1, calculado, valor, ajustada: Math.abs(valor - calculado) > 0.004,
    }
  }).sort((a, b) => b.data.localeCompare(a.data))
  const total = r2(linhas.reduce((a, l) => a + l.valor, 0))
  return {
    tecnico: nome, mes, pct: config.pctGarantia, linhas, faturadas: total, internas: 0, ajustes: r2(total - linhas.reduce((a, l) => a + l.calculado, 0)), total,
    aguardando: 0, projecao: hoje.startsWith(mes) ? projetarMes(total, mes, hoje) : total, qtdOS: linhas.length,
  }
}
