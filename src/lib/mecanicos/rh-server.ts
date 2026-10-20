// Custo de PESSOAL do pós-vendas (José, 16/10/2026: "verifica lá no RH e no sistema Omie") — SÓ SERVIDOR.
//  - Equipe: rh_funcionarios do departamento "Pós Vendas" (salário, admissão e demissão de verdade)
//    + encargos da empresa (rh_empresas.encargos_percentual).
//  - Comissão: rh_comissoes por mês de competência (aprovada, lançada no Omie, paga ou aguardando
//    aprovação) + encargos.
//  - Rescisão e acertos: contas a pagar do Omie (espelho contas_pagar) do funcionário como fornecedor,
//    categorias 2.03.04 (rescisões) e 2.01.04 (serviço pago a ex-técnico como PJ).
//  - Requisição descontada do funcionário: rh_descontos "[Portal REQ #id]" aprovados/aplicados — volta para a empresa.
// ⚠️ Salário NÃO sai daqui por pessoa: só o custo mensal (salário + encargos) que o painel já mostra.
// O cliente do RH da Frota (lib/frota/rh.ts) segue sem salário — este módulo é separado de propósito.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { casarNome } from './ocorrencias-painel'
import type { ExtraEquipe, MembroEquipe } from './painel'

type Rec = Record<string, unknown>
const STATUS_COMISSAO = ['aprovada', 'lancada_omie', 'paga', 'pendente_aprovacao']
const CATEGORIAS_ACERTO = ['2.03.04', '2.01.04']
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

let cliente: SupabaseClient | null = null
function rh(): SupabaseClient | null {
  if (!process.env.RH_SUPABASE_URL || !process.env.RH_SUPABASE_SERVICE_KEY) return null
  if (!cliente) cliente = createClient(process.env.RH_SUPABASE_URL, process.env.RH_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  return cliente
}
export const rhDisponivel = () => !!rh()
/** Cliente do banco do RH (null = não configurado) — leitura da ficha do técnico. */
export const clienteRH = () => rh()

export type MembroRH = MembroEquipe & { nomeRh: string }

/** Nome do RH ("GABRIEL GOMES DE MORAES") → nome do portal ("Gabriel Moraes"). */
function nomeDoPortal(nome: string, padronizar: (n: unknown) => string, cadastro: string[]) {
  const direto = padronizar(nome)
  if (cadastro.includes(direto)) return direto
  return casarNome(nome, cadastro) || direto
}

/** Equipe do pós-vendas pelo RH, com comissões e acertos por mês. null = RH não configurado. */
export async function carregarEquipeRH(padronizar: (n: unknown) => string, cadastro: string[]): Promise<MembroRH[] | null> {
  const c = rh()
  if (!c) return null
  const [fun, emp] = await Promise.all([
    c.from('rh_funcionarios').select('id, nome, empresa, empresa_id, departamento, data_admissao, data_demissao, salario_bruto, omie_codigo_fornecedor, tipo_contrato').ilike('departamento', 'p%s%vendas'),
    c.from('rh_empresas').select('id, codigo, encargos_percentual'),
  ])
  if (fun.error) throw new Error(`RH: ${fun.error.message}`)
  const encPorEmpresa = new Map<string, number>()
  for (const e of (emp.data || []) as Rec[]) {
    const pct = Number(e.encargos_percentual)
    if (Number.isFinite(pct)) { encPorEmpresa.set(String(e.id), pct); encPorEmpresa.set(String(e.codigo), pct) }
  }
  const pessoas = (fun.data || []) as Rec[]
  if (!pessoas.length) return []
  const ids = pessoas.map((p) => String(p.id))
  const com = await c.from('rh_comissoes').select('funcionario_id, competencia_mes, competencia_ano, valor, status').in('funcionario_id', ids).in('status', STATUS_COMISSAO)
  if (com.error) throw new Error(`RH comissões: ${com.error.message}`)

  // acertos no Omie: pelo código de fornecedor do funcionário ou pelo nome
  const nomes = new Map(pessoas.map((p) => [norm(p.nome), String(p.id)]))
  const porCodigo = new Map(pessoas.filter((p) => p.omie_codigo_fornecedor).map((p) => [String(p.omie_codigo_fornecedor).trim(), String(p.id)]))
  const acertos = await sb.from('contas_pagar').select('codigo_cliente_fornecedor, nome_fornecedor, codigo_categoria, data_emissao, data_vencimento, valor_documento, status_titulo')
    .in('codigo_categoria', CATEGORIAS_ACERTO).gte('data_vencimento', '2023-01-01').limit(5000)

  const extras = new Map<string, Map<string, ExtraEquipe>>()
  const extra = (fid: string, mes: string) => {
    const m = extras.get(fid) || new Map<string, ExtraEquipe>(); extras.set(fid, m)
    const x = m.get(mes) || { mes, comissao: 0, rescisao: 0 }; m.set(mes, x)
    return x
  }
  const pctDe = (p: Rec | undefined) => (p && (encPorEmpresa.get(String(p.empresa_id)) ?? encPorEmpresa.get(String(p.empresa)))) ?? 44
  const funPorId = new Map(pessoas.map((p) => [String(p.id), p]))
  for (const r of (com.data || []) as Rec[]) {
    const mes = `${r.competencia_ano}-${String(r.competencia_mes).padStart(2, '0')}`
    const v = Number(r.valor) || 0
    extra(String(r.funcionario_id), mes).comissao += v * (1 + pctDe(funPorId.get(String(r.funcionario_id))) / 100)
  }
  for (const t of (acertos.data || []) as Rec[]) {
    if (/cancel/i.test(String(t.status_titulo || ''))) continue
    const fid = porCodigo.get(String(t.codigo_cliente_fornecedor || '').trim()) || nomes.get(norm(t.nome_fornecedor))
    if (!fid) continue
    const dia = String(t.data_emissao || t.data_vencimento || '').slice(0, 10)
    if (!/^\d{4}-\d{2}/.test(dia)) continue
    extra(fid, dia.slice(0, 7)).rescisao += Number(t.valor_documento) || 0
  }

  const out = new Map<string, MembroRH>()
  for (const p of pessoas) {
    const pessoa = nomeDoPortal(String(p.nome), padronizar, cadastro)
    if (!pessoa) continue
    const salario = Number(p.salario_bruto) || 0
    const m: MembroRH = {
      pessoa, nomeRh: String(p.nome), salario, encargos: Math.round(salario * pctDe(p)) / 100,
      admissao: p.data_admissao ? String(p.data_admissao).slice(0, 7) : null,
      demissao: p.data_demissao ? String(p.data_demissao).slice(0, 7) : null,
      extras: [...(extras.get(String(p.id))?.values() || [])].map((x) => ({ mes: x.mes, comissao: Math.round(x.comissao * 100) / 100, rescisao: Math.round(x.rescisao * 100) / 100 })),
    }
    const atual = out.get(pessoa)
    // dois cadastros da mesma pessoa (recontratação): fica o ativo; os extras somam
    if (atual) {
      const ex = [...(atual.extras || []), ...(m.extras || [])]
      const base = (atual.demissao && !m.demissao) ? m : atual
      out.set(pessoa, { ...base, extras: ex })
    } else out.set(pessoa, m)
  }
  return [...out.values()]
}

/** Requisição → quanto o funcionário devolveu (desconto em folha / caixinha). */
export async function requisicoesDescontadas(): Promise<Map<number, number>> {
  const c = rh()
  const out = new Map<number, number>()
  if (!c) return out
  const { data, error } = await c.from('rh_descontos').select('descricao, valor, status').ilike('descricao', '%REQ #%').in('status', ['aprovado', 'aplicado']).limit(5000)
  if (error) return out
  for (const d of (data || []) as Rec[]) {
    const m = String(d.descricao || '').match(/REQ #(\d+)/)
    if (m) out.set(Number(m[1]), (out.get(Number(m[1])) || 0) + (Number(d.valor) || 0))
  }
  return out
}

/** Comissão LANÇADA no RH por pessoa e mês (sem encargos), com o status — o valor oficial. */
export async function comissoesRH(meses: string[], padronizar: (n: unknown) => string, cadastro: string[]): Promise<Record<string, Record<string, { valor: number; status: string }>>> {
  const c = rh()
  const out: Record<string, Record<string, { valor: number; status: string }>> = {}
  if (!c || !meses.length) return out
  const fun = await c.from('rh_funcionarios').select('id, nome').ilike('departamento', 'p%s%vendas')
  const nomes = new Map(((fun.data || []) as Rec[]).map((f) => [String(f.id), nomeDoPortal(String(f.nome), padronizar, cadastro)]))
  if (!nomes.size) return out
  const anos = [...new Set(meses.map((m) => Number(m.slice(0, 4))))]
  const { data } = await c.from('rh_comissoes').select('funcionario_id, competencia_mes, competencia_ano, valor, status')
    .in('funcionario_id', [...nomes.keys()]).in('competencia_ano', anos).not('status', 'in', '(cancelada,rejeitada)')
  for (const r of (data || []) as Rec[]) {
    const mes = `${r.competencia_ano}-${String(r.competencia_mes).padStart(2, '0')}`
    if (!meses.includes(mes)) continue
    const p = nomes.get(String(r.funcionario_id)); if (!p) continue
    const x = ((out[p] ||= {})[mes] ||= { valor: 0, status: String(r.status) })
    x.valor = Math.round((x.valor + (Number(r.valor) || 0)) * 100) / 100
    x.status = String(r.status)
  }
  return out
}
