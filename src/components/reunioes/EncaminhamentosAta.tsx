'use client'
// ATA → PEDIDOS (melhorias 4.4, 25/11/2026). Cada linha da ata que começa com @pessoa vira um
// encaminhamento. Ao publicar, esta prévia mostra todos: quem faz, o quê e o prazo (dá para mudar a
// data e desmarcar). Confirmou: viram pedidos "Origem: reunião" de uma vez (a mesma rota das ações,
// criar_acao) e a ata é publicada. O que já virou pedido não aparece de novo.
import { useState } from 'react'
import { X, Send, AlertTriangle } from 'lucide-react'
import type { Encaminhamento } from '@/lib/reunioes/fila-reuniao'

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export default function EncaminhamentosAta({ lista, nomes, onCriar, onPublicarSem, onFechar }: {
  lista: Encaminhamento[]
  nomes: Record<string, string>
  /** Cria os marcados (na ordem) e publica. Devolve as mensagens de erro (vazio = tudo certo). */
  onCriar: (marcados: { titulo: string; responsavel_id: string; prazo: string }[]) => Promise<string[]>
  onPublicarSem: () => void
  onFechar: () => void
}) {
  const [itens, setItens] = useState(() => lista.map((e) => ({ ...e, marcado: !!e.responsavel_id })))
  const [ocupado, setOcupado] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const marcados = itens.filter((i) => i.marcado && i.responsavel_id)

  const criar = async () => {
    setOcupado(true); setErros([])
    const e = await onCriar(marcados.map((i) => ({ titulo: i.titulo, responsavel_id: i.responsavel_id!, prazo: i.prazo })))
    setErros(e); setOcupado(false)
  }

  return (
    <div className="ag-modal" style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(15,23,42,.45)' }} onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Encaminhamentos da ata" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(640px,100%)', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 20, borderRadius: 18, background: 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)', boxShadow: '0 30px 60px -30px rgba(15,23,42,.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Send size={18} color="#2563eb" />
          <span style={{ flex: 1, fontSize: 17, fontWeight: 500 }}>Encaminhamentos da ata</span>
          <button className="rd-btn" onClick={onFechar} aria-label="Fechar"><X size={15} /></button>
        </div>
        <span style={{ fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
          Cada linha que começa com <b style={{ fontWeight: 500 }}>@pessoa</b> vira um pedido na fila dessa pessoa, com “Origem: reunião”. Confira antes de publicar.
        </span>
        {itens.map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: '4px 10px', alignItems: 'center', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--portal-border,#e2e8f0)', opacity: i.responsavel_id ? 1 : .8 }}>
            <input type="checkbox" checked={i.marcado} disabled={!i.responsavel_id || ocupado} aria-label={`Criar: ${i.titulo}`}
              onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, marcado: e.target.checked } : x)))} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5 }}>{i.titulo}</span>
              <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>
                {i.responsavel_id ? <>para <b style={{ fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>{nomes[i.responsavel_id] || 'alguém'}</b></>
                  : <span style={{ color: '#b45309' }}><AlertTriangle size={12} style={{ verticalAlign: -1 }} /> {i.ambiguo ? `Mais de uma pessoa chamada @${i.mencao} — escreva @Nome.Sobrenome na ata` : `Não achei @${i.mencao} entre os participantes`}</span>}
                {!i.prazoDaLinha && i.responsavel_id && ' · prazo padrão de 7 dias'}
              </span>
            </span>
            <input type="date" value={i.prazo} disabled={!i.responsavel_id || ocupado} aria-label={`Prazo de ${i.titulo}`} title={`Prazo: ${br(i.prazo)}`}
              onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, prazo: e.target.value } : x)))}
              style={{ height: 34, padding: '0 8px', borderRadius: 10, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', color: 'inherit', fontFamily: 'inherit' }} />
          </div>
        ))}
        {erros.length > 0 && (
          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13 }}>
            {erros.map((e, k) => <div key={k}>{e}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="rd-btn" disabled={ocupado} onClick={onPublicarSem}>Publicar sem criar</button>
          <button className="rd-btn cheio" style={{ ['--c' as string]: '#059669' }} disabled={ocupado || marcados.length === 0} onClick={criar}>
            <Send size={15} /> {ocupado ? 'Criando…' : `Criar ${marcados.length} ${marcados.length === 1 ? 'pedido' : 'pedidos'} e publicar`}
          </button>
        </div>
      </div>
    </div>
  )
}
