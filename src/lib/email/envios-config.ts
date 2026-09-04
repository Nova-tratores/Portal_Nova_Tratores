/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ENVIOS DE E-MAIL — configuração e histórico no BANCO (tela Dev → Envios de
// e-mail). Substitui as variáveis do Railway (RELATORIO_LISTA_EMAIL_TO etc.).
//
// Este arquivo NÃO importa os relatórios (evita import circular): os relatórios
// importam daqui; o despacho "enviar agora" fica em ./envios-disparo.ts.
//
// Tabelas: email_envios_config (1 linha por chave) + email_envios_log.
// Migration: sql/email-envios-config.sql. Se a tabela ainda não existir, tudo
// aqui degrada sem lançar (config vazia + flag `migrationFaltando`).
// ============================================================================
import { supabase as db } from '@/lib/ajustes/supabase'
import { parseDestinatarios } from '@/lib/dre-financeiro/email'

/** Catálogo dos envios que existem no código (a tela lista isto; o banco guarda a config). */
export interface EnvioDef {
  chave: string
  nome: string
  descricao: string
  agenda: string                 // texto humano (o cron real está no GitHub Actions)
  workflow: string               // arquivo .github/workflows/*.yml
  rota: string                   // rota de cron
  parametros: { k: string; label: string; tipo: 'number' | 'text'; padrao: string | number; ajuda?: string }[]
}

export const ENVIOS: EnvioDef[] = [
  {
    chave: 'ppv_relacao',
    nome: 'PPV — Relação de pedidos em aberto',
    descricao: 'Relação dos Pré-Pedidos de Venda em aberto (todas as fases menos Faturado e Cancelada), PDF + CSV, igual ao modo Relação da tela /ppv.',
    agenda: 'Segunda-feira 07:10 (BRT)',
    workflow: 'ppv-relatorio-lista.yml',
    rota: '/api/ppv/cron/relatorio-lista',
    parametros: [],
  },
  {
    chave: 'dre_lista',
    nome: 'DRE — Lista de títulos criados na semana',
    descricao: 'Dois e-mails (Contas a Pagar / Contas a Receber) com os títulos criados nos últimos N dias, NOVA + CASTRO, PDF + CSV (visão Lista do Calendário DRE).',
    agenda: 'Segunda-feira 07:00 (BRT)',
    workflow: 'dre-financeiro-relatorio-lista.yml',
    rota: '/api/dre-financeiro/cron/relatorio-lista',
    parametros: [{ k: 'dias', label: 'Dias da janela', tipo: 'number', padrao: 7, ajuda: 'Títulos criados nos últimos N dias (de hoje-N até ontem).' }],
  },
]

export function envioDef(chave: string): EnvioDef | undefined {
  return ENVIOS.find((e) => e.chave === chave)
}

export interface ConfigEnvio {
  chave: string
  ativo: boolean
  to: string[]
  cc: string[]
  bcc: string[]
  parametros: Record<string, any>
  atualizadoEm?: string | null
  atualizadoPor?: string | null
  /** true quando a linha ainda não existe no banco (ou a tabela não foi criada). */
  padrao: boolean
  migrationFaltando: boolean
}

function migrationFaltou(err: any): boolean {
  const m = String(err?.message || err?.code || '')
  return err?.code === '42P01' || /does not exist|schema cache|relation .* not/i.test(m)
}

function limparLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  return parseDestinatarios(v)
}

/**
 * Config de um envio. Fallback (linha ausente): DESLIGADO e sem destinatário —
 * exceto o legado do DRE, que ainda aceita RELATORIO_LISTA_EMAIL_* do ambiente
 * enquanto a linha não for salva na tela (compatibilidade com o que já rodava).
 */
export async function getConfigEnvio(chave: string): Promise<ConfigEnvio> {
  const def = envioDef(chave)
  const parametrosPadrao: Record<string, any> = {}
  for (const p of def?.parametros || []) parametrosPadrao[p.k] = p.padrao

  let row: any = null
  let migrationFaltando = false
  try {
    const { data, error } = await db.from('email_envios_config').select('*').eq('chave', chave).maybeSingle()
    if (error) { if (migrationFaltou(error)) migrationFaltando = true; else throw error }
    row = data
  } catch (e: any) {
    if (migrationFaltou(e)) migrationFaltando = true
    else throw e
  }

  if (row) {
    return {
      chave,
      ativo: !!row.ativo,
      to: limparLista(row.destinatarios),
      cc: limparLista(row.cc),
      bcc: limparLista(row.bcc),
      parametros: { ...parametrosPadrao, ...(row.parametros && typeof row.parametros === 'object' ? row.parametros : {}) },
      atualizadoEm: row.atualizado_em || null,
      atualizadoPor: row.atualizado_por || null,
      padrao: false,
      migrationFaltando: false,
    }
  }

  // Linha ausente. Legado DRE: env do Railway ainda vale até salvar na tela.
  if (chave === 'dre_lista') {
    const to = parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_TO)
    const dias = parseInt(process.env.RELATORIO_LISTA_DIAS || '', 10)
    return {
      chave, ativo: to.length > 0, to,
      cc: parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_CC),
      bcc: parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_BCC),
      parametros: { ...parametrosPadrao, ...(dias > 0 ? { dias } : {}) },
      padrao: true, migrationFaltando,
    }
  }
  return { chave, ativo: false, to: [], cc: [], bcc: [], parametros: parametrosPadrao, padrao: true, migrationFaltando }
}

export interface SalvarConfigArgs {
  ativo?: boolean
  to?: string[] | string
  cc?: string[] | string
  bcc?: string[] | string
  parametros?: Record<string, any>
}

/** Cria/atualiza a linha (upsert). Lança se a migration não foi aplicada. */
export async function salvarConfigEnvio(chave: string, args: SalvarConfigArgs, usuario?: string): Promise<ConfigEnvio> {
  if (!envioDef(chave)) throw new Error(`envio desconhecido: ${chave}`)
  const atual = await getConfigEnvio(chave)
  const linha = {
    chave,
    ativo: args.ativo ?? atual.ativo,
    destinatarios: args.to !== undefined ? limparLista(args.to) : atual.to,
    cc: args.cc !== undefined ? limparLista(args.cc) : atual.cc,
    bcc: args.bcc !== undefined ? limparLista(args.bcc) : atual.bcc,
    parametros: args.parametros !== undefined ? { ...atual.parametros, ...args.parametros } : atual.parametros,
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuario || null,
  }
  const { error } = await db.from('email_envios_config').upsert(linha, { onConflict: 'chave' })
  if (error) {
    if (migrationFaltou(error)) throw new Error('Tabela email_envios_config não existe — rode sql/email-envios-config.sql no Supabase.')
    throw new Error(error.message)
  }
  return getConfigEnvio(chave)
}

export interface LogEnvioArgs {
  chave: string
  origem: 'cron' | 'manual' | 'teste'
  ok: boolean
  motivo?: string
  assunto?: string
  destinatarios?: string[]
  total?: number
  detalhes?: any
  usuario?: string
}

/** Grava uma linha no histórico. Best-effort: nunca lança. */
export async function registrarEnvioLog(a: LogEnvioArgs): Promise<void> {
  try {
    await db.from('email_envios_log').insert({
      chave: a.chave,
      origem: a.origem,
      ok: a.ok,
      motivo: a.motivo || null,
      assunto: a.assunto || null,
      destinatarios: a.destinatarios || [],
      total: a.total ?? null,
      detalhes: a.detalhes ?? null,
      usuario: a.usuario || null,
    })
  } catch { /* histórico é best-effort */ }
}

export interface LogEnvioLinha {
  id: number
  chave: string
  origem: string
  ok: boolean
  motivo: string | null
  assunto: string | null
  destinatarios: string[]
  total: number | null
  usuario: string | null
  criado_em: string
}

/** Últimos envios (todas as chaves ou só uma). */
export async function listarEnvioLog(chave?: string, limite = 30): Promise<{ linhas: LogEnvioLinha[]; migrationFaltando: boolean }> {
  try {
    let q = db.from('email_envios_log').select('id,chave,origem,ok,motivo,assunto,destinatarios,total,usuario,criado_em').order('criado_em', { ascending: false }).limit(limite)
    if (chave) q = q.eq('chave', chave)
    const { data, error } = await q
    if (error) { if (migrationFaltou(error)) return { linhas: [], migrationFaltando: true }; throw error }
    return { linhas: (data || []) as LogEnvioLinha[], migrationFaltando: false }
  } catch (e: any) {
    if (migrationFaltou(e)) return { linhas: [], migrationFaltando: true }
    throw e
  }
}

/** Painel da tela Dev: catálogo + config + último envio de cada um. */
export async function listarEnviosPainel() {
  const gmailConfigurado = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  const itens = []
  let migrationFaltando = false
  for (const def of ENVIOS) {
    const cfg = await getConfigEnvio(def.chave)
    if (cfg.migrationFaltando) migrationFaltando = true
    itens.push({ def, config: cfg })
  }
  const log = await listarEnvioLog(undefined, 40)
  if (log.migrationFaltando) migrationFaltando = true
  return { gmailConfigurado, gmailUser: process.env.GMAIL_USER || null, migrationFaltando, itens, log: log.linhas }
}
