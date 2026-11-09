// Ficha cadastral × RH (José, 09/11/2026: "já puxa dados do RH… e quando a gente
// preencher, já vai para o RH também"). SÓ SERVIDOR — usa a service key do RH.
//
// Liga pelo rh_funcionarios.portal_user_id (= id do usuário no portal); sem ele,
// tenta o e-mail. Lê os dados para pré-preencher a ficha e devolve o "resumo do RH"
// (cargo, admissão…). Salário/comissão só saem quando o pedido é de um Dev.
// Grava de volta só os campos que o RH tem (documento, nascimento, sexo, estado
// civil, telefone e endereço), e só quando mudou. dependentes_irrf NÃO é tocado:
// mexe no IRRF da folha — fica com o RH.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Dados } from './ficha-cadastral'

let cliente: SupabaseClient | null = null
function rh(): SupabaseClient | null {
  if (!process.env.RH_SUPABASE_URL || !process.env.RH_SUPABASE_SERVICE_KEY) return null
  if (!cliente) cliente = createClient(process.env.RH_SUPABASE_URL, process.env.RH_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  return cliente
}

const COLS = 'id, empresa, nome, cpf, rg, data_nascimento, sexo, estado_civil, telefone, email, endereco, bairro, cidade, estado, cep, cargo, departamento, data_admissao, tipo_contrato, status, matricula, dependentes_irrf'
const COLS_DEV = ', salario_bruto, comissao_percentual'

export interface ResumoRH {
  ligado: boolean
  motivo?: string
  id?: string
  empresa?: string
  cargo?: string
  departamento?: string
  admissao?: string
  contrato?: string
  status?: string
  matricula?: string
  dependentes_irrf?: number
  salario?: number | null
  comissao?: number | null
}

async function acharFuncionario(userId: string, email: string | null, comSalario: boolean) {
  const db = rh()
  if (!db) return { erro: 'RH não configurado neste servidor (RH_SUPABASE_URL)' }
  const cols = COLS + (comSalario ? COLS_DEV : '')
  const ordem = (xs: any[]) => xs.sort((a, b) => (a.status === 'ativo' ? -1 : 0) - (b.status === 'ativo' ? -1 : 0))[0] || null
  const { data, error } = await db.from('rh_funcionarios').select(cols).eq('portal_user_id', userId).limit(5)
  if (error) return { erro: error.message }
  if (data?.length) return { f: ordem(data as any[]) }
  if (email) {
    const r = await db.from('rh_funcionarios').select(cols).ilike('email', email.trim()).limit(5)
    if (r.data?.length) return { f: ordem(r.data as any[]) }
  }
  return { f: null }
}

const SEXO_RH: Record<string, string> = { M: 'Masculino', F: 'Feminino', outro: 'Prefiro não informar' }
const CIVIL_RH: Record<string, string> = { solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)' }
const soDig = (s: any) => String(s ?? '').replace(/\D/g, '')

/** dados da ficha que dá para tirar do RH (só preenche o que está vazio na ficha) */
function doRH(f: any): Dados {
  const d: Dados = {}
  if (f.nome) d.nome_completo = f.nome
  if (f.cpf) d.cpf = soDig(f.cpf).length === 11 ? soDig(f.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf
  if (f.rg) d.rg = f.rg
  if (f.data_nascimento) d.nascimento = String(f.data_nascimento).slice(0, 10)
  if (SEXO_RH[f.sexo]) d.sexo = SEXO_RH[f.sexo]
  if (CIVIL_RH[f.estado_civil]) d.estado_civil = CIVIL_RH[f.estado_civil]
  if (f.telefone) d.celular = f.telefone
  if (f.endereco) d.rua = f.endereco
  if (f.bairro) d.bairro = f.bairro
  if (f.cidade) d.cidade = f.cidade
  if (f.estado) d.uf = f.estado
  if (f.cep) d.cep = f.cep
  if (f.cargo) d.cargo = [f.cargo, f.departamento].filter(Boolean).join(' / ')
  return d
}

export async function lerRH(userId: string, email: string | null, comSalario: boolean): Promise<{ resumo: ResumoRH; sugestao: Dados }> {
  const r = await acharFuncionario(userId, email, comSalario)
  if ('erro' in r) return { resumo: { ligado: false, motivo: r.erro }, sugestao: {} }
  const f = r.f
  if (!f) return { resumo: { ligado: false, motivo: 'Não achei esta pessoa no RH (sem vínculo pelo login nem pelo e-mail).' }, sugestao: {} }
  return {
    resumo: {
      ligado: true, id: f.id, empresa: f.empresa, cargo: f.cargo, departamento: f.departamento,
      admissao: f.data_admissao, contrato: f.tipo_contrato, status: f.status, matricula: f.matricula,
      dependentes_irrf: f.dependentes_irrf,
      ...(comSalario ? { salario: f.salario_bruto ?? null, comissao: f.comissao_percentual ?? null } : {}),
    },
    sugestao: doRH(f),
  }
}

/** preenche só o que a ficha ainda não tem */
export function completarComRH(d: Dados, sugestao: Dados): Dados {
  const o = { ...d }
  for (const [k, v] of Object.entries(sugestao)) if (!String(o[k] ?? '').trim()) o[k] = v
  return o
}

const SEXO_P: Record<string, string> = { Masculino: 'M', Feminino: 'F', 'Prefiro não informar': 'outro' }
const CIVIL_P: Record<string, string> = { 'Solteiro(a)': 'solteiro', 'Casado(a)': 'casado', 'União estável': 'outro', 'Divorciado(a)': 'divorciado', 'Separado(a)': 'divorciado', 'Viúvo(a)': 'viuvo' }

/** grava no RH o que a ficha tem e o RH tem diferente. Devolve o que mudou. */
export async function enviarAoRH(userId: string, email: string | null, d: Dados): Promise<{ ok: boolean; campos: string[]; motivo?: string }> {
  const db = rh()
  if (!db) return { ok: false, campos: [], motivo: 'RH não configurado neste servidor' }
  const r = await acharFuncionario(userId, email, false)
  if ('erro' in r) return { ok: false, campos: [], motivo: r.erro }
  const f = r.f
  if (!f) return { ok: false, campos: [], motivo: 'sem cadastro no RH' }

  const quer: Record<string, string> = {}
  const cpf = soDig(d.cpf)
  if (cpf.length === 11 && cpf !== soDig(f.cpf)) quer.cpf = /\D/.test(String(f.cpf || '')) ? String(d.cpf) : cpf
  if (d.rg && d.rg !== f.rg) quer.rg = d.rg
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento || '') && d.nascimento !== String(f.data_nascimento || '').slice(0, 10)) quer.data_nascimento = d.nascimento
  if (SEXO_P[d.sexo] && SEXO_P[d.sexo] !== f.sexo) quer.sexo = SEXO_P[d.sexo]
  if (CIVIL_P[d.estado_civil] && CIVIL_P[d.estado_civil] !== f.estado_civil) quer.estado_civil = CIVIL_P[d.estado_civil]
  if (d.celular && soDig(d.celular) !== soDig(f.telefone)) quer.telefone = d.celular
  const endereco = [d.rua, d.numero].filter((x) => String(x || '').trim()).join(', ') + (String(d.complemento || '').trim() ? ` - ${d.complemento}` : '')
  if (endereco.trim() && endereco !== f.endereco) quer.endereco = endereco
  for (const [p, rk] of [['bairro', 'bairro'], ['cidade', 'cidade'], ['uf', 'estado']] as const) if (String(d[p] || '').trim() && d[p] !== f[rk]) quer[rk] = d[p]
  if (soDig(d.cep).length === 8 && soDig(d.cep) !== soDig(f.cep)) quer.cep = d.cep

  const campos = Object.keys(quer)
  if (!campos.length) return { ok: true, campos }
  const { error } = await db.from('rh_funcionarios').update({ ...quer, atualizado_em: new Date().toISOString() }).eq('id', f.id)
  if (error) return { ok: false, campos: [], motivo: /duplicate|unique/i.test(error.message) ? 'esse CPF já está em outro funcionário no RH' : error.message }
  return { ok: true, campos }
}
