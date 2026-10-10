'use client'
// POPs — criar POP (v1 em rascunho) numa área onde sou dono (ou qualquer, se admin).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, botao, botaoClaro, campo, chamar, rotulo, type Area } from './comum'

export default function ModalNovoPop({ areas, admin, modeloInicial = false, onFechar }: { areas: Area[]; admin: boolean; modeloInicial?: boolean; onFechar: () => void }) {
  const router = useRouter()
  const [area, setArea] = useState(areas[0]?.id || '')
  const [titulo, setTitulo] = useState('')
  const [periodo, setPeriodo] = useState('365')
  const [modelo, setModelo] = useState(modeloInicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const criar = async () => {
    setSalvando(true); setErro('')
    try {
      const r = await chamar<{ pop_id: string; versao_id: string }>('/api/pops', {
        json: { area_id: area, titulo, periodicidade_revisao_dias: Number(periodo), template: modelo },
      })
      router.push(`/pops/${r.pop_id}/editar?versao=${r.versao_id}`)
    } catch (e) { setErro((e as Error).message); setSalvando(false) }
  }

  return (
    <Modal titulo="Novo POP" onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={rotulo}>Área</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} style={campo}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.sigla} — {a.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} autoFocus style={campo}
            placeholder="Ex.: Entrega técnica de máquina ao cliente" />
        </div>
        <div>
          <label style={rotulo}>Revisar a cada</label>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={campo}>
            <option value="90">3 meses</option><option value="180">6 meses</option>
            <option value="365">1 ano</option><option value="730">2 anos</option>
          </select>
        </div>
        {admin && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--portal-text,#111)' }}>
            <input type="checkbox" checked={modelo} onChange={(e) => setModelo(e.target.checked)} />
            É um <strong>modelo do sistema</strong> (biblioteca; não é executado — as áreas duplicam)
          </label>
        )}
        <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
          O código (ex.: OFI-004) é gerado sozinho. O POP nasce em rascunho; só vale depois de aprovado.
        </p>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={criar} disabled={salvando || !titulo.trim() || !area} style={{ ...botao('#0f766e'), opacity: salvando || !titulo.trim() ? .6 : 1 }}>
            {salvando ? 'Criando…' : 'Criar e editar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
