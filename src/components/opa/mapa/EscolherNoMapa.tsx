'use client'
// Janela "Escolher no mapa" do Novo Opa: a pessoa toca no lugar da planta (troca de andar
// com Subir/Descer) e o lugar volta para o formulário.
import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import PlantaLoja from './PlantaLoja'
import { useDadosMapa } from './useDadosMapa'
import { andaresOrdenados, opasPorLocal } from '@/lib/opa/mapa'

export default function EscolherNoMapa({ atual, onEscolher, onFechar }: {
  atual?: string
  onEscolher: (localId: string) => void
  onFechar: () => void
}) {
  const isMobile = useIsMobile()
  const { dados, erro } = useDadosMapa()
  // abre no andar do lugar já escolhido (se tiver)
  const andarDoAtual = dados?.posicoes.find((p) => p.local_id === atual)?.andar_id || null
  const [andar, setAndar] = useState<string | null>(null)
  const andarId = andar || andarDoAtual || (dados ? andaresOrdenados(dados.andares)[0]?.id : '') || ''
  const contagem = dados ? Object.fromEntries(Object.entries(opasPorLocal(dados.opas)).map(([k, v]) => [k, v.length])) : {}
  const vazio = !!dados && dados.posicoes.length === 0

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', zIndex: 10050 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', borderRadius: isMobile ? 0 : 14, width: '100%', maxWidth: isMobile ? '100%' : 900, maxHeight: isMobile ? '100%' : '92vh', overflow: 'auto', boxSizing: 'border-box' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--portal-bg-card)', borderBottom: '1px solid var(--portal-border)' }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>Toque onde está o problema</span>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--portal-bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: isMobile ? 12 : 16 }}>
          {erro && <div style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13.5, marginBottom: 10 }}>{erro}</div>}
          {!dados && !erro && <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: 40, color: 'var(--portal-text-muted)' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando o mapa…</div>}
          {vazio && <div style={{ padding: 10, borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 13.5, marginBottom: 10 }}>Os lugares ainda não foram colocados no mapa. Escolha pela lista.</div>}
          {dados && !vazio && (
            <PlantaLoja dados={dados} andarId={andarId} onAndar={setAndar} modo="escolher" selecionado={atual ? { tipo: 'lugar', id: atual } : null}
              contagem={contagem} onSelecionar={(tipo, id) => { if (tipo === 'lugar') onEscolher(id) }} />
          )}
        </div>
      </div>
    </div>
  )
}
