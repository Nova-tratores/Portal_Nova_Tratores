'use client'
// Padrões da etiqueta térmica (José, 29/10/2026): o admin salva modelos no banco
// e quem imprime escolhe um em vez de configurar o editor. "Meu" = a arrumação
// deste computador (o editor). A escolha fica neste navegador; o modelo em si é
// lido do banco a cada abertura — mudou o modelo, muda para todos que o usam.

import { useState } from 'react'
import { Pencil, Save, Trash2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { LayoutCampo } from '@/lib/opa-pecas/etiqueta-termica'

export interface ModeloEtiqueta { id: number; nome: string; layout: LayoutCampo[]; atualizado_em: string; atualizado_por_nome: string | null }

export async function lerModelosEtiqueta(): Promise<{ modelos: ModeloEtiqueta[]; podeEditar: boolean; migracaoFaltando?: boolean }> {
  try {
    const res = await fetch('/api/etiquetas/modelos', { headers: await authHeaders() })
    const j = await res.json().catch(() => ({}))
    if (j.migracaoFaltando) return { modelos: [], podeEditar: false, migracaoFaltando: true }
    return { modelos: res.ok && Array.isArray(j.modelos) ? j.modelos : [], podeEditar: !!j.podeEditar }
  } catch { return { modelos: [], podeEditar: false } }
}

async function mudar(corpo: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/etiquetas/modelos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo),
    })
    const j = await res.json().catch(() => ({}))
    return res.ok && j.ok ? null : (j.erro || 'Não consegui salvar o modelo.')
  } catch { return 'Sem conexão com o portal.' }
}

export default function ModelosEtiqueta({ modelos, podeEditar, migracaoFaltando, escolhido, onEscolher, layoutMeu, onMudou }: {
  modelos: ModeloEtiqueta[]
  podeEditar: boolean
  migracaoFaltando?: boolean
  /** id do modelo em uso; null = "Meu" */
  escolhido: number | null
  onEscolher: (id: number | null) => void
  /** arrumação do editor — é ela que vira (ou substitui) um modelo */
  layoutMeu: LayoutCampo[]
  /** recarregar a lista depois de mudar */
  onMudou: () => void
}) {
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (migracaoFaltando && !podeEditar) return null
  const atual = modelos.find((m) => m.id === escolhido) || null

  const fazer = async (corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true); setErro('')
    const e = await mudar(corpo)
    setOcupado(false)
    if (e) { setErro(e); return }
    depois?.()
    onMudou()
  }
  const salvarComoNovo = () => {
    const nome = window.prompt('Nome do novo modelo (ex.: "Só locação grande"):')
    if (nome?.trim()) void fazer({ acao: 'criar', nome, layout: layoutMeu })
  }

  const pilula = (ativo: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
    border: '1.5px solid ' + (ativo ? '#EA580C' : 'var(--portal-border)'),
    background: ativo ? '#EA580C' : 'var(--portal-bg-card)', color: ativo ? '#fff' : 'var(--portal-text)',
  })
  const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: '#EA580C', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)', marginRight: 2 }}>Padrão:</span>
        <button type="button" aria-pressed={escolhido === null} onClick={() => onEscolher(null)} style={pilula(escolhido === null)}>Meu (editor)</button>
        {modelos.map((m) => (
          <button key={m.id} type="button" aria-pressed={escolhido === m.id} onClick={() => onEscolher(m.id)} style={pilula(escolhido === m.id)}>{m.nome}</button>
        ))}
      </div>
      {migracaoFaltando && <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 6 }}>Os modelos ainda não existem no banco — falta rodar o <b>sql/etiquetas-modelos.sql</b>.</div>}
      {atual && (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginTop: 6 }}>
          Usando o modelo <b>{atual.nome}</b>{atual.atualizado_por_nome ? ` (por ${atual.atualizado_por_nome}, ${new Date(atual.atualizado_em).toLocaleDateString('pt-BR')})` : ''}.
          {' '}Para mexer só para você:{' '}
          <button type="button" style={link} onClick={() => onEscolher(null)}>usar o meu</button>.
        </div>
      )}
      {podeEditar && !migracaoFaltando && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, opacity: ocupado ? 0.5 : 1, pointerEvents: ocupado ? 'none' : 'auto' }}>
          {escolhido === null && <button type="button" style={link} onClick={salvarComoNovo}><Save size={12} /> Salvar o meu como modelo para todos</button>}
          {atual && <>
            <button type="button" style={link} onClick={() => {
              if (window.confirm(`Trocar o modelo "${atual.nome}" pela arrumação do seu editor ("Meu")? Quem usa este modelo passa a imprimir assim.`)) void fazer({ acao: 'atualizar', id: atual.id, layout: layoutMeu })
            }}><Save size={12} /> Substituir pelo meu</button>
            <button type="button" style={link} onClick={() => {
              const nome = window.prompt('Novo nome do modelo:', atual.nome)
              if (nome?.trim() && nome.trim() !== atual.nome) void fazer({ acao: 'atualizar', id: atual.id, nome })
            }}><Pencil size={12} /> Renomear</button>
            <button type="button" style={{ ...link, color: '#dc2626' }} onClick={() => {
              if (window.confirm(`Apagar o modelo "${atual.nome}"? Quem usa ele volta para a própria arrumação.`)) void fazer({ acao: 'apagar', id: atual.id }, () => onEscolher(null))
            }}><Trash2 size={12} /> Apagar</button>
          </>}
        </div>
      )}
      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 6 }}>{erro}</div>}
    </div>
  )
}
