'use client'

// Ações extras do menu do clique direito (widget public/bug-reporter.js):
//  - "Relatar ocorrência": MESMA mecânica de print do relatar problema
//    (captura + seleção da área) e abre o OcorrenciaFormModal com o print
//    já anexado. Só aparece pra quem pode criar ocorrência.
//  - "Abrir ticket": abre o MESMO modal de Novo Ticket do módulo /tickets
//    (sem print — ticket v1 não tem anexos). Só pra quem tem o módulo.
//
// Segue o padrão do BugReporterChat: enriquece a config do widget via
// BugReporter.init() (merge) e usa o supabase direto — sem depender dos
// providers do PortalLayout.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OcorrenciaFormModal from '@/components/ocorrencias/OcorrenciaFormModal'
import FormTicket from '@/components/tickets/FormTicket'

interface CapturaAcao {
  canvas: HTMLCanvasElement
  dataUrl: string
  selectionRect: { x: number; y: number; width: number; height: number } | null
  viewport: { width: number; height: number } | null
}

const SVG_OCORRENCIA =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#DC2626" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/>' +
  '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'

const SVG_TICKET =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>' +
  '<path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>'

function canvasParaFile(canvas: HTMLCanvasElement): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) =>
        resolve(
          blob
            ? new File([blob], `print-${Date.now()}.png`, { type: 'image/png' })
            : null,
        ),
      'image/png',
    )
  })
}

export default function ReporterAcoes() {
  const router = useRouter()
  const [ocorrenciaAberta, setOcorrenciaAberta] = useState(false)
  const [printInicial, setPrintInicial] = useState<File[]>([])
  const [ticketAberto, setTicketAberto] = useState(false)
  const [tecnicos, setTecnicos] = useState<string[]>([])
  const [meuNome, setMeuNome] = useState<string | null>(null)
  const tecnicosCarregados = useRef(false)

  // Lista de funcionários do seletor — mesma fonte do Painel dos Mecânicos
  // (portal_permissoes.mecanico_tecnico_nome, sem os usuários inativos).
  // Carregada só quando a ação dispara (o menu existe em todas as páginas).
  const carregarTecnicos = async () => {
    if (tecnicosCarregados.current) return
    tecnicosCarregados.current = true
    try {
      const [{ data: tecs }, { data: usus }] = await Promise.all([
        supabase
          .from('portal_permissoes')
          .select('user_id, mecanico_tecnico_nome')
          .not('mecanico_tecnico_nome', 'is', null),
        supabase.from('financeiro_usu').select('id, ativo'),
      ])
      const inativos = new Set(
        ((usus || []) as { id: string; ativo: boolean | null }[])
          .filter((u) => u.ativo === false)
          .map((u) => u.id),
      )
      const nomes = ((tecs || []) as { user_id: string; mecanico_tecnico_nome: string }[])
        .filter((t) => t.mecanico_tecnico_nome && !inativos.has(t.user_id))
        .map((t) => t.mecanico_tecnico_nome)
      setTecnicos([...new Set(nomes)].sort((a, b) => a.localeCompare(b)))
    } catch {
      tecnicosCarregados.current = false
    }
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function setup() {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!user || cancelled) return

      const [{ data: perms }, { data: perfil }] = await Promise.all([
        supabase
          .from('portal_permissoes')
          .select('is_admin, is_dev, modulos_permitidos')
          .eq('user_id', user.id)
          .single(),
        supabase.from('financeiro_usu').select('nome').eq('id', user.id).single(),
      ])
      if (cancelled) return
      setMeuNome(perfil?.nome ?? null)

      const admin = perms?.is_admin === true || perms?.is_dev === true
      const mods: string[] = perms?.modulos_permitidos ?? []
      const podeOcorrencia =
        admin ||
        mods.includes('painel-mecanicos') ||
        mods.includes('painel-mecanicos:criar_ocorrencia')
      const podeTicket =
        admin || mods.includes('tickets') || mods.some((m) => m.startsWith('tickets:'))

      const extraActions: { id: string; label: string; svg: string; capture?: boolean }[] = []
      if (podeOcorrencia) {
        extraActions.push({
          id: 'ocorrencia',
          label: 'Relatar ocorrência',
          svg: SVG_OCORRENCIA,
          capture: true,
        })
      }
      if (podeTicket) {
        extraActions.push({
          id: 'ticket',
          label: 'Abrir ticket',
          svg: SVG_TICKET,
          capture: false,
        })
      }
      if (extraActions.length === 0) return

      const config = {
        extraActions,
        onAction: async (id: string, captura: CapturaAcao | null) => {
          if (id === 'ticket') {
            setTicketAberto(true)
            return
          }
          if (id === 'ocorrencia') {
            carregarTecnicos()
            const file = captura?.canvas ? await canvasParaFile(captura.canvas) : null
            setPrintInicial(file ? [file] : [])
            setOcorrenciaAberta(true)
          }
        },
      }

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

  return (
    <>
      <OcorrenciaFormModal
        aberto={ocorrenciaAberta}
        onFechar={() => { setOcorrenciaAberta(false); setPrintInicial([]) }}
        tecnicos={tecnicos}
        arquivosIniciais={printInicial}
        criadoPor={meuNome}
      />
      {ticketAberto && (
        <FormTicket
          onFechar={() => setTicketAberto(false)}
          onCriado={(id) => { setTicketAberto(false); router.push(`/tickets/${id}`) }}
        />
      )}
    </>
  )
}
