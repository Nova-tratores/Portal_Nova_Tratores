// =============================================================================
// MOTOR DE OCORRÊNCIAS — escrita centralizada.
//
// TODO lançamento (painel, OSDrawer, MotoristaDrawer e automações da frota)
// passa por registrarOcorrencia(): valida observação obrigatória, resolve os
// PONTOS pelo catálogo (nunca digitados), grava `tipo` compatível
// (tipoLegado ?? subcategoria), herda o vínculo rh_funcionario_id do último
// registro do mesmo técnico, deduplica automações por auto_chave e — só
// quando a linha foi de fato inserida — dispara as 3 notificações:
//   1. admins do painel  → portal_notificacoes (filtrarDestinatarios 'pos')
//   2. técnico no APP    → mecanico_notificacoes (aviso vermelho c/ pontos)
//   3. técnico no PORTAL → portal_notificacoes (user_id via lookup reverso
//      portal_permissoes.mecanico_tecnico_nome)
//
// Funciona no client (supabase anon+sessão) e no server (crons passam o
// client service-role) — o caller injeta o client.
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { filtrarDestinatarios } from '@/lib/notif/prefs'
import { getSubcategoria, type CategoriaOcorrencia } from './catalogo'

export interface AnexoOcorrencia {
  url: string
  tipo: 'imagem' | 'video'
  nome: string
  tamanho: number
}

export interface NovaOcorrencia {
  tecnico_nome: string
  categoria: CategoriaOcorrencia
  subcategoria: string
  /** Observação OBRIGATÓRIA — o "o que aconteceu". */
  observacao: string
  id_ordem?: string | null
  anexos?: AnexoOcorrencia[]
  /** 'manual' (default) ou 'auto' (automações). */
  origem?: 'manual' | 'auto'
  /** Dedupe das automações (índice único parcial). */
  auto_chave?: string | null
  /** Payload estruturado (lat/lng/maps_url/velocidade/valor…). */
  detalhes?: Record<string, unknown>
  /** Data do FATO (default hoje) — automações podem apontar pro passado. */
  data?: string
  /** Nome de quem lançou ('sistema' nas automáticas). */
  criado_por?: string | null
  /** false = não dispara notificações (usado em lotes com aviso agrupado). */
  notificar?: boolean
}

export interface ResultadoRegistro {
  ok: boolean
  /** true = linha nova criada; false = duplicada (auto_chave) ou erro. */
  inseriu: boolean
  id?: number
  pontos?: number
  erro?: string
}

export async function registrarOcorrencia(
  supa: SupabaseClient,
  dados: NovaOcorrencia,
): Promise<ResultadoRegistro> {
  const observacao = (dados.observacao || '').trim()
  if (!observacao) return { ok: false, inseriu: false, erro: 'Observação é obrigatória.' }
  if (!dados.tecnico_nome?.trim()) return { ok: false, inseriu: false, erro: 'Informe o funcionário.' }

  const sub = getSubcategoria(dados.categoria, dados.subcategoria)
  if (!sub) return { ok: false, inseriu: false, erro: 'Categoria/subcategoria inválida.' }

  // Herda o vínculo com o RH do último registro vinculado do mesmo técnico.
  let rhFuncionarioId: string | null = null
  try {
    const { data: vinc } = await supa
      .from('tecnico_ocorrencias')
      .select('rh_funcionario_id')
      .eq('tecnico_nome', dados.tecnico_nome)
      .not('rh_funcionario_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    rhFuncionarioId = (vinc?.[0]?.rh_funcionario_id as string) ?? null
  } catch {
    /* coluna ausente (migração pendente) — segue sem vínculo */
  }

  const payload: Record<string, unknown> = {
    tecnico_nome: dados.tecnico_nome.trim(),
    id_ordem: dados.id_ordem?.trim() || null,
    tipo: sub.tipoLegado ?? sub.slug,
    descricao: observacao,
    data: dados.data ?? new Date().toISOString().split('T')[0],
    pontos_descontados: sub.pontos,
    categoria: dados.categoria,
    subcategoria: sub.slug,
    anexos: dados.anexos ?? [],
    origem: dados.origem ?? 'manual',
    auto_chave: dados.auto_chave ?? null,
    detalhes: dados.detalhes ?? {},
    rh_funcionario_id: rhFuncionarioId,
    criado_por: dados.criado_por ?? null,
  }

  let id: number | undefined
  if (dados.auto_chave) {
    // Automação: idempotente pela chave — duplicata NÃO notifica de novo.
    const { data: rows, error } = await supa
      .from('tecnico_ocorrencias')
      .upsert(payload, { onConflict: 'auto_chave', ignoreDuplicates: true })
      .select('id')
    if (error) return { ok: false, inseriu: false, erro: error.message }
    if (!rows || rows.length === 0) return { ok: true, inseriu: false, pontos: sub.pontos }
    id = rows[0].id as number
  } else {
    const { data: row, error } = await supa
      .from('tecnico_ocorrencias')
      .insert(payload)
      .select('id')
      .single()
    if (error) return { ok: false, inseriu: false, erro: error.message }
    id = row?.id as number
  }

  if (dados.notificar !== false) {
    await notificarOcorrencia(supa, {
      tecnico_nome: payload.tecnico_nome as string,
      label: sub.label,
      pontos: sub.pontos,
      observacao,
      id_ordem: payload.id_ordem as string | null,
      origem: payload.origem as string,
    })
  }

  return { ok: true, inseriu: true, id, pontos: sub.pontos }
}

/** As 3 notificações (best-effort — nunca derrubam o registro). */
export async function notificarOcorrencia(
  supa: SupabaseClient,
  n: {
    tecnico_nome: string
    label: string
    pontos: number
    observacao: string
    id_ordem?: string | null
    origem?: string
  },
): Promise<void> {
  const sufixoOS = n.id_ordem ? ` (OS ${n.id_ordem})` : ''
  const auto = n.origem === 'auto' ? ' [automática]' : ''

  // 1. Admins do painel (respeita silenciamento do módulo 'pos')
  try {
    const { data: admins } = await supa
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .eq('is_admin', true)
    const ids = filtrarDestinatarios('pos', admins || [])
    if (ids.length > 0) {
      await supa.from('portal_notificacoes').insert(
        ids.map((user_id) => ({
          user_id,
          tipo: 'pos',
          titulo: `Ocorrência${auto}: ${n.label} — ${n.tecnico_nome}`,
          descricao: `−${n.pontos} pts · ${n.observacao.slice(0, 140)}${sufixoOS}`,
          link: '/mecanicos',
        })),
      )
    }
  } catch {
    /* best-effort */
  }

  // 2. Técnico no APP (aviso vermelho com os pontos no título) + push
  try {
    await supa.from('mecanico_notificacoes').insert({
      tecnico_nome: n.tecnico_nome,
      tipo: 'execucao',
      titulo: `⚠ Ocorrência: ${n.label} — −${n.pontos} pontos`,
      descricao: `${n.observacao.slice(0, 180)}${sufixoOS} Toque para justificar.`,
      link: '/ocorrencias',
      lida: false,
    })
    const { pushParaTecnico } = await import('@/lib/push-mecanicos')
    await pushParaTecnico(n.tecnico_nome, {
      titulo: `⚠ Ocorrência${auto}: ${n.label} — −${n.pontos} pts`,
      descricao: `Motivo: ${n.observacao.slice(0, 120)}${sufixoOS}`,
      link: '/ocorrencias',
    })
  } catch {
    /* best-effort */
  }

  // 3. Técnico no PORTAL (lookup reverso do user_id pelo nome do técnico)
  try {
    const { data: donos } = await supa
      .from('portal_permissoes')
      .select('user_id')
      .eq('mecanico_tecnico_nome', n.tecnico_nome)
      .limit(1)
    const userId = donos?.[0]?.user_id as string | undefined
    if (userId) {
      await supa.from('portal_notificacoes').insert({
        user_id: userId,
        tipo: 'pos',
        titulo: `⚠ Você recebeu uma ocorrência: ${n.label} — −${n.pontos} pts`,
        descricao: `${n.observacao.slice(0, 140)}${sufixoOS} Justifique no Meu Painel.`,
        link: '/meu-painel',
      })
    }
  } catch {
    /* best-effort */
  }
}
