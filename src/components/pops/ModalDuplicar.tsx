'use client'
// POPs — duplicar (modelo → POP da minha área, ou POP comum → outra área/loja).
// Cria um POP independente em rascunho v1; a origem não muda.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, areasQuePossoCriar, botao, botaoClaro, campo, chamar, rotulo, type AreasResp } from './comum'

export default function ModalDuplicar({ popId, codigo, titulo, onFechar }: { popId: string; codigo: string; titulo: string; onFechar: () => void }) {
  const router = useRouter()
  const [areas, setAreas] = useState<AreasResp | null>(null)
  const [area, setArea] = useState('')
  const [novoTitulo, setNovoTitulo] = useState(titulo)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    chamar<AreasResp>('/api/pops/areas').then((r) => {
      setAreas(r); setArea(areasQuePossoCriar(r)[0]?.id || '')
    }).catch((e) => setErro((e as Error).message))
  }, [])
  const opcoes = areasQuePossoCriar(areas)

  const duplicar = async () => {
    setEnviando(true); setErro('')
    try {
      const r = await chamar<{ pop_id: string; versao_id: string }>(`/api/pops/${popId}/acoes`, { json: { acao: 'duplicar', area_id: area, titulo: novoTitulo } })
      router.push(`/pops/${r.pop_id}/editar?versao=${r.versao_id}`)
    } catch (e) { setErro((e as Error).message); setEnviando(false) }
  }

  return (
    <Modal titulo={`Duplicar ${codigo}`} onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 14 }}>
        {areas && !opcoes.length ? (
          <div style={{ fontSize: 14, color: '#b45309' }}>Você não é dono de POPs em nenhuma área. Peça ao admin do módulo.</div>
        ) : (
          <>
            <div>
              <label style={rotulo}>Para a área</label>
              <select value={area} onChange={(e) => setArea(e.target.value)} style={campo}>
                {opcoes.map((a) => <option key={a.id} value={a.id}>{a.sigla} — {a.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={rotulo}>Título da cópia</label>
              <input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} maxLength={160} style={campo} />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
              A cópia nasce em rascunho, com código novo, e é sua para ajustar. Mudanças futuras na origem não passam para ela — só aparece um aviso.
            </p>
          </>
        )}
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={duplicar} disabled={enviando || !area} style={{ ...botao('#0f766e'), opacity: enviando || !area ? .6 : 1 }}>
            {enviando ? 'Duplicando…' : 'Duplicar e editar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
