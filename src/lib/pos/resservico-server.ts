// Resserviço — banco. Regras em ./resservico.ts. SQL: sql/pos-resservico.sql (portal).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_LOGS_PPO } from './constants'
import { textoSolicitacao, validarResservico, rotuloMotivo, type PedidoResservico, type RegistroResservico, type MotivoResservico } from './resservico'

type Rec = Record<string, unknown>
export class ErroResservico extends Error { constructor(msg: string, public status = 422) { super(msg) } }
const semColuna = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /resservico/i.test(e.message || '') && /column|schema cache/i.test(e.message || ''))
export const SEM_SQL = 'Falta rodar o SQL sql/pos-resservico.sql no banco do portal.'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function logOS(osId: string, acao: string, quem: string, status: string | null) {
  const agora = new Date()
  await sb.from(TBL_LOGS_PPO).insert({
    Id_ppo: osId, Data_Acao: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(agora),
    Hora_Acao: agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), UsuEmail: quem, acao,
    Status_Anterior: status, Status_Atual: status, Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  })
}

export interface EstadoResservico {
  registro: RegistroResservico | null
  /** a OS de resserviço (se existe) */
  osNova: { id: string; status: string; tecnico: string; previsao: string | null; relatorio: boolean } | null
  /** quando ESTA OS é o resserviço de outra */
  resservicoDe: string | null
}

export async function lerResservico(id: string): Promise<EstadoResservico> {
  const r = await sb.from('Ordem_Servico').select('Id_Ordem, resservico, resservico_de').eq('Id_Ordem', id).maybeSingle()
  if (r.error) { if (semColuna(r.error)) throw new ErroResservico(SEM_SQL, 503); throw new Error(r.error.message) }
  if (!r.data) throw new ErroResservico('OS não encontrada', 404)
  const reg = ((r.data as Rec).resservico as RegistroResservico | null) || null
  let osNova: EstadoResservico['osNova'] = null
  if (reg?.os) {
    const n = await sb.from('Ordem_Servico').select('Id_Ordem, Status, Os_Tecnico, Previsao_Execucao').eq('Id_Ordem', reg.os).maybeSingle()
    if (n.data) {
      const rel = await sb.from('Ordem_Servico_Tecnicos').select('Ordem_Servico').eq('Ordem_Servico', reg.os).limit(1)
      const d = n.data as Rec
      osNova = { id: String(d.Id_Ordem), status: String(d.Status || ''), tecnico: String(d.Os_Tecnico || ''), previsao: (d.Previsao_Execucao as string) || null, relatorio: !!(rel.data || []).length }
    }
  }
  return { registro: reg, osNova, resservicoDe: ((r.data as Rec).resservico_de as string) || null }
}

async function proximoId(): Promise<string> {
  const { data } = await sb.from('Ordem_Servico').select('Id_Ordem').like('Id_Ordem', 'OS-%').order('Id_Ordem', { ascending: false }).limit(1)
  const ult = parseInt(String((data as Rec[] | null)?.[0]?.Id_Ordem || 'OS-0').split('-')[1], 10) || 0
  return `OS-${String(ult + 1).padStart(4, '0')}`
}

/** Registra o resserviço na OS original e cria a OS de resserviço (cópia) para o app dos técnicos. */
export async function abrirResservico(id: string, p: PedidoResservico, quem: string): Promise<EstadoResservico> {
  const o = await sb.from('Ordem_Servico').select('*').eq('Id_Ordem', id).maybeSingle()
  if (o.error) throw new Error(o.error.message)
  if (!o.data) throw new ErroResservico('OS não encontrada', 404)
  const os = o.data as Rec
  if (!('resservico' in os)) throw new ErroResservico(SEM_SQL, 503)
  const erroVal = validarResservico(p, { status: String(os.Status || ''), jaTem: !!os.resservico, ehResservico: !!os.resservico_de })
  if (erroVal) throw new ErroResservico(erroVal)

  const tecnicos = [os.Os_Tecnico, os.Os_Tecnico2].map((t) => String(t || '').trim()).filter(Boolean)
  const volta = String(p.tecnicoVolta || os.Os_Tecnico || '').trim()
  const volta2 = p.tecnicoVolta2 !== undefined ? String(p.tecnicoVolta2 || '').trim() : (volta === os.Os_Tecnico ? String(os.Os_Tecnico2 || '') : '')
  const novo = await proximoId()
  const { error } = await sb.from('Ordem_Servico').insert({
    Id_Ordem: novo, Status: 'Aguardando ordem Técnico', Data: hojeSP(),
    Os_Cliente: os.Os_Cliente, Cnpj_Cliente: os.Cnpj_Cliente, Endereco_Cliente: os.Endereco_Cliente, Cidade_Cliente: os.Cidade_Cliente || '',
    Os_Tecnico: volta, Os_Tecnico2: volta2 || null,
    Tipo_Servico: os.Tipo_Servico, Projeto: os.Projeto,
    Serv_Solicitado: textoSolicitacao({ id, servSolicitado: String(os.Serv_Solicitado || '') }, { motivo: p.motivo, erro: p.erro }),
    Qtd_HR: 0, Valor_HR: os.Valor_HR ?? 0, Qtd_KM: 0, Valor_KM: os.Valor_KM ?? 0, Valor_Total: 0, ID_PPV: '',
    Desconto: 0, Desconto_Hora: 0, Desconto_KM: 0,
    Previsao_Execucao: p.previsao || hojeSP(), Previsao_Faturamento: null,
    Servico_Oficina: !!os.Servico_Oficina,
    Hora_Inicio_Exec: '', Hora_Chegada: '', Hora_Fim_Exec: '', Dias_Execucao: '', Data_Fim_Servico: null, Hora_Inicio_Servico: '',
    Alimentacao_Tecnico: false, Alimentacao_Valor: 0, Alimentacao_No_PDF: false, Alimentacoes: [],
    resservico_de: id,
  })
  if (error) throw new Error(`não consegui criar a OS de resserviço: ${error.message}`)

  const registro: RegistroResservico = { os: novo, motivo: p.motivo as MotivoResservico, erro: p.erro.trim(), tecnicos, tecnicoVolta: volta, por: quem, em: new Date().toISOString() }
  const up = await sb.from('Ordem_Servico').update({ resservico: registro }).eq('Id_Ordem', id)
  if (up.error) { await sb.from('Ordem_Servico').delete().eq('Id_Ordem', novo); throw new Error(up.error.message) }
  await logOS(id, `Resserviço registrado (${rotuloMotivo(p.motivo)}) — ${novo} aberta para ${volta}`, quem, String(os.Status || ''))
  await logOS(novo, `Ordem de resserviço da ${id} criada`, quem, 'Aguardando ordem Técnico')
  return lerResservico(id)
}

/** Desfaz: só enquanto a OS de resserviço não foi preenchida pelo técnico. Apaga a OS nova e o registro. */
export async function desfazerResservico(id: string, quem: string): Promise<EstadoResservico> {
  const est = await lerResservico(id)
  if (!est.registro) throw new ErroResservico('Esta OS não tem resserviço.')
  if (est.osNova?.relatorio) throw new ErroResservico(`O técnico já preencheu a ${est.osNova.id}; não dá para desfazer.`)
  if (est.osNova && est.osNova.status !== 'Aguardando ordem Técnico') throw new ErroResservico(`A ${est.osNova.id} já andou (${est.osNova.status}); não dá para desfazer.`)
  if (est.osNova) await sb.from('Ordem_Servico').delete().eq('Id_Ordem', est.osNova.id).eq('resservico_de', id)
  await sb.from('Ordem_Servico').update({ resservico: null }).eq('Id_Ordem', id)
  await logOS(id, `Resserviço desfeito${est.osNova ? ` (${est.osNova.id} apagada)` : ''}`, quem, null)
  return lerResservico(id)
}
