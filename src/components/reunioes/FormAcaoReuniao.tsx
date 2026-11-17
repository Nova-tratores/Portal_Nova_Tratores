'use client'
// Janela "Nova tarefa" da reunião (antes "Criar ação"; José, 17/11/2026: "deixa claro o que é para fazer").
// Mesmo formulário de 3 passos das Tarefas (FormNovaTarefa): o que → quem (até de fora da reunião) → até quando.
// A descrição (decisão + motivo, quando nasce de um item decidido) vai junto, sem campo para preencher.
import type { UsuarioMin } from '@/lib/tickets/constantes'
import { FormNovaTarefa } from './TarefasRapidas'
import { Modal } from './comum'

export default function FormAcaoReuniao({ tituloInicial, descricaoInicial, categoriaInicial, pessoas, usuarios, onFechar, onCriar }: {
  tituloInicial?: string
  descricaoInicial?: string
  categoriaInicial?: string
  pessoas: string[]
  usuarios: Record<string, UsuarioMin>
  onFechar: () => void
  onCriar: (a: { titulo: string; descricao: string; responsavel_id: string; prazo: string; categoria: string }) => Promise<void>
}) {
  return (
    <Modal titulo="Nova tarefa" onFechar={onFechar} largura={720}>
      <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)', marginBottom: 12 }}>
        Tarefa é algo que alguém fica responsável por fazer até uma data. A pessoa recebe no sino e na agenda dela.
      </div>
      <FormNovaTarefa pessoas={pessoas} usuarios={usuarios} tituloInicial={tituloInicial} onCancelar={onFechar}
        onSalvar={async (t) => { await onCriar({ ...t, descricao: descricaoInicial || '', categoria: categoriaInicial || '' }); onFechar() }} />
    </Modal>
  )
}
