'use client'

// Liga o widget bug-reporter.js (public/bug-reporter.js) ao chat interno
// do Portal:
//  - usa o usuario LOGADO como relator (nao pede e-mail na mao);
//  - oferece um campo "Encaminhar no chat para" com todos os usuarios;
//  - ao escolher alguem, envia o report como mensagem(ns) no chat individual.
//
// A tag <Script src="/bug-reporter.js"> ja inicializa o widget pelos
// data-* (systemName, supabase, trigger). Este componente apenas
// ENRIQUECE a config chamando BugReporter.init() de novo.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface BugReport {
  systemName: string
  description: string
  category: string
  pageUrl: string
  reporterName: string
  reporterEmail: string
  screenshotCanvas: HTMLCanvasElement | null
}

interface BugReporterApi {
  init: (opts: Record<string, unknown>) => void
}

declare global {
  interface Window {
    BugReporter?: BugReporterApi
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.')),
      'image/png',
    )
  })
}

// Acha (ou cria) o chat individual entre os dois usuarios.
// Mesma logica do criarChatIndividual de src/hooks/useChat.ts.
async function obterChatIndividual(
  meuId: string,
  outroId: string,
): Promise<string> {
  const { data: minhas } = await supabase
    .from('portal_chat_membros')
    .select('chat_id')
    .eq('user_id', meuId)
  const { data: dele } = await supabase
    .from('portal_chat_membros')
    .select('chat_id')
    .eq('user_id', outroId)

  const meus = new Set((minhas ?? []).map((m: { chat_id: string }) => m.chat_id))
  const comuns = (dele ?? [])
    .map((m: { chat_id: string }) => m.chat_id)
    .filter((id: string) => meus.has(id))

  if (comuns.length > 0) {
    const { data: existentes } = await supabase
      .from('portal_chats')
      .select('id')
      .in('id', comuns)
      .eq('tipo', 'individual')
    if (existentes && existentes.length > 0) {
      return existentes[0].id as string
    }
  }

  const { data: chat, error } = await supabase
    .from('portal_chats')
    .insert({ tipo: 'individual', criado_por: meuId })
    .select()
    .single()
  if (error || !chat) {
    throw new Error('Nao foi possivel abrir a conversa no chat.')
  }

  await supabase.from('portal_chat_membros').insert([
    { chat_id: chat.id, user_id: meuId, role: 'admin' },
    { chat_id: chat.id, user_id: outroId, role: 'membro' },
  ])
  return chat.id as string
}

// Envia o report como mensagem(ns) no chat para a pessoa escolhida.
async function encaminharNoChat(
  meuId: string,
  destinoId: string,
  report: BugReport,
): Promise<void> {
  const chatId = await obterChatIndividual(meuId, destinoId)

  const texto =
    `🐛 Bug reportado — ${report.systemName}\n` +
    `Tipo: ${report.category}\n` +
    `Pagina: ${report.pageUrl}\n\n` +
    report.description +
    (report.reporterName ? `\n\n— ${report.reporterName}` : '')

  await supabase.from('portal_mensagens').insert({
    chat_id: chatId,
    user_id: meuId,
    conteudo: texto,
    tipo: 'texto',
  })

  // anexa a captura da tela como mensagem de imagem
  if (report.screenshotCanvas) {
    const blob = await canvasToBlob(report.screenshotCanvas)
    const path = `${meuId}/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.png`
    const { error } = await supabase.storage
      .from('chat-anexos')
      .upload(path, blob)
    if (!error) {
      const url = supabase.storage.from('chat-anexos').getPublicUrl(path).data
        .publicUrl
      await supabase.from('portal_mensagens').insert({
        chat_id: chatId,
        user_id: meuId,
        conteudo: null,
        tipo: 'imagem',
        arquivo_url: url,
        arquivo_nome: 'captura-da-falha.png',
        arquivo_tamanho: blob.size,
      })
    }
  }

  await supabase
    .from('portal_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId)
}

export default function BugReporterChat() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function setup() {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!user || cancelled) return

      const { data: perfil } = await supabase
        .from('financeiro_usu')
        .select('nome')
        .eq('id', user.id)
        .single()

      const { data: usuarios } = await supabase
        .from('financeiro_usu')
        .select('id, nome')
        .eq('ativo', true)
        .neq('id', user.id)
        .order('nome')

      const forwardOptions = (usuarios ?? []).map(
        (u: { id: string; nome: string }) => ({ value: u.id, label: u.nome }),
      )

      const config = {
        user: {
          name: perfil?.nome ?? user.email ?? 'Usuario',
          email: user.email ?? '',
        },
        forwardLabel: 'Encaminhar no chat para (opcional)',
        forwardOptions,
        onForward: (destinoId: string, report: BugReport) =>
          encaminharNoChat(user.id, destinoId, report),
      }

      // o widget pode ainda nao ter carregado — tenta ate aparecer
      const aplicar = () => {
        if (!window.BugReporter) return false
        window.BugReporter.init(config)
        return true
      }
      if (!aplicar()) {
        timer = setInterval(() => {
          if (cancelled || aplicar()) {
            if (timer) clearInterval(timer)
          }
        }, 300)
        setTimeout(() => {
          if (timer) clearInterval(timer)
        }, 15000)
      }
    }

    setup()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [])

  return null
}
