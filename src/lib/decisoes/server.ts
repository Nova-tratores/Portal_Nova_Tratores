// Livro de Decisões + SC — regras de negócio no SERVIDOR (uso exclusivo nas
// rotas /api/decisoes/*, via service role). O browser só LÊ (RLS); toda mutação
// passa por aqui para garantir alçadas válidas, justificativa obrigatória,
// encadeamento e o ledger append-only.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { filtrarDestinatarios, type PrefsDestinatario } from '@/lib/notif/prefs'
import type { Autenticado } from '@/lib/auth/server'
import type { SolicitacaoCompra, Decisao, Papel, TipoDecisao } from './constantes'

// Acesso ao módulo (espelha temAcesso do usePermissoes, no servidor).
export function temModuloDecisoes(auth: Autenticado): boolean {
  if (auth.isAdmin) return true
  return auth.modulos.includes('decisoes') || auth.modulos.some((m) => m.startsWith('decisoes:'))
}

// Papéis do usuário derivados das permissões (decisoes:<acao> → papel).
// Admin ou módulo total (`decisoes`) => todos os papéis.
export function papeisDoUsuario(auth: Autenticado): Papel[] {
  const total = auth.isAdmin || auth.modulos.includes('decisoes')
  const tem = (acao: string) => total || auth.modulos.includes('decisoes:' + acao)
  const papeis: Papel[] = []
  if (tem('comercial')) papeis.push('comercial')
  if (tem('diretoria')) papeis.push('diretoria_compras')
  if (tem('financeiro')) papeis.push('financeiro')
  if (tem('comprador')) papeis.push('comprador')
  return papeis
}

export async function carregarSC(id: string): Promise<SolicitacaoCompra | null> {
  const { data } = await supabaseAdmin.from('solicitacoes_compra').select('*').eq('id', id).maybeSingle()
  return (data as SolicitacaoCompra) || null
}

// Envolvidos de uma SC (para notificar): vendedor + todos os atores das decisões.
export async function envolvidosSC(sc: SolicitacaoCompra): Promise<string[]> {
  const { data } = await supabaseAdmin.from('decisoes').select('ator_id').eq('sc_id', sc.id)
  const ids = new Set<string>([sc.vendedor_id])
  for (const d of data || []) if (d.ator_id) ids.add(d.ator_id as string)
  return [...ids]
}

// user_ids que têm um papel (para direcionar notificações do próximo passo).
// Considera permissão granular (decisoes:<acao>) e o módulo total (decisoes).
export async function usuariosComPapel(papel: Papel): Promise<string[]> {
  const acao: Record<string, string> = {
    diretoria_compras: 'diretoria', financeiro: 'financeiro',
    comprador: 'comprador', comercial: 'comercial',
  }
  const chave = acao[papel]
  if (!chave) return []
  const { data } = await supabaseAdmin
    .from('portal_permissoes')
    .select('user_id, modulos_permitidos')
  return (data || [])
    .filter((p) => {
      const m: string[] = Array.isArray(p.modulos_permitidos) ? p.modulos_permitidos : []
      return m.includes('decisoes') || m.includes('decisoes:' + chave)
    })
    .map((p) => p.user_id as string)
}

// Última decisão de um tipo (para encadeamento — ex.: parecer referencia a
// qtd_alterada/sc_criada que o originou).
export async function ultimaDecisao(scId: string, tipos: TipoDecisao[]): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('decisoes')
    .select('id')
    .eq('sc_id', scId)
    .in('tipo', tipos)
    .order('ocorrida_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string) || null
}

export interface RegistroDecisao {
  scId: string
  atorId: string | null
  papel: Papel
  tipo: TipoDecisao
  justificativa: string
  estadoAnterior?: Record<string, unknown> | null
  estadoNovo?: Record<string, unknown> | null
  prazoCompromisso?: string | null
  decisaoAnterior?: string | null
  documentoRef?: string | null
  chassiId?: string | null
}

// Append no ledger + carimbo de última atividade na SC. Justificativa é
// obrigatória (o documento exige texto livre em toda decisão).
export async function registrarDecisao(r: RegistroDecisao): Promise<string | null> {
  const just = (r.justificativa || '').trim()
  if (!just) return 'Justificativa obrigatória.'
  const { error } = await supabaseAdmin.from('decisoes').insert({
    sc_id: r.scId,
    ator_id: r.atorId,
    papel: r.papel,
    tipo: r.tipo,
    justificativa: just,
    estado_anterior: r.estadoAnterior ?? null,
    estado_novo: r.estadoNovo ?? null,
    prazo_compromisso: r.prazoCompromisso ?? null,
    decisao_anterior: r.decisaoAnterior ?? null,
    documento_ref: r.documentoRef ?? null,
    chassi_id: r.chassiId ?? null,
  })
  if (error) return error.message
  await supabaseAdmin
    .from('solicitacoes_compra')
    .update({ ultima_atividade_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', r.scId)
  return null
}

// Atualiza o cabeçalho (projeção) da SC.
export async function atualizarSC(scId: string, patch: Partial<SolicitacaoCompra>): Promise<string | null> {
  const { error } = await supabaseAdmin
    .from('solicitacoes_compra')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', scId)
  return error ? error.message : null
}

// Notifica via portal_notificacoes (sino do portal). Nunca notifica o autor;
// respeita silenciamento (módulo 'decisoes').
export async function notificarDecisao(
  sc: SolicitacaoCompra,
  destinatarios: string[],
  autorId: string | null,
  titulo: string,
  descricao?: string,
) {
  const alvo = [...new Set(destinatarios)].filter((id) => id && id !== autorId)
  if (alvo.length === 0) return
  const { data: prefs } = await supabaseAdmin
    .from('portal_permissoes')
    .select('user_id, categoria, notif_silenciado')
    .in('user_id', alvo)
  const porPrefs = new Set(filtrarDestinatarios('decisoes', (prefs || []) as PrefsDestinatario[]))
  const comLinha = new Set((prefs || []).map((p: { user_id: string }) => p.user_id))
  const finais = alvo.filter((id) => !comLinha.has(id) || porPrefs.has(id))
  if (finais.length === 0) return
  await supabaseAdmin.from('portal_notificacoes').insert(
    finais.map((user_id) => ({
      user_id,
      tipo: 'decisoes',
      titulo,
      descricao: descricao || null,
      link: `/decisoes/${sc.id}`,
    })),
  )
}

// Nome de um usuário (financeiro_usu é o diretório de usuários do portal).
export async function nomeDe(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return data?.nome || 'alguém'
}

// ---------------------------------------------------------------------
// Visão C — compromissos vencidos: pareceres com prazo_compromisso passado
// cuja SC ainda não chegou ao estado prometido (Fase 1: PC emitido).
// ---------------------------------------------------------------------
export interface CompromissoVencido {
  decisao: Decisao
  sc: SolicitacaoCompra
  dias_atraso: number
}

export async function compromissosVencidos(): Promise<CompromissoVencido[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  const { data: pareceres } = await supabaseAdmin
    .from('decisoes')
    .select('*')
    .eq('tipo', 'parecer_financeiro')
    .not('prazo_compromisso', 'is', null)
    .lt('prazo_compromisso', hoje)
    .order('prazo_compromisso', { ascending: true })
  const lista = (pareceres || []) as Decisao[]
  if (lista.length === 0) return []
  const scIds = [...new Set(lista.map((d) => d.sc_id))]
  const { data: scs } = await supabaseAdmin.from('solicitacoes_compra').select('*').in('id', scIds)
  const mapa = new Map((scs || []).map((s) => [s.id, s as SolicitacaoCompra]))
  const out: CompromissoVencido[] = []
  for (const d of lista) {
    const sc = mapa.get(d.sc_id)
    if (!sc) continue
    // Cumprido se o PC foi emitido; recusada/cancelada não é "compromisso pendente".
    if (['pc_emitida', 'recusada', 'cancelada'].includes(sc.status)) continue
    const dias = Math.floor((Date.now() - new Date(d.prazo_compromisso! + 'T23:59:59').getTime()) / 86400000)
    out.push({ decisao: d, sc, dias_atraso: dias })
  }
  return out
}
