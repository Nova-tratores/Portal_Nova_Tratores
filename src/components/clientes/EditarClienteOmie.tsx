'use client'
// Botão "Editar cliente": busca o cadastro no Omie (GET /api/clientes/editar) e abre
// o formulário do cliente em modo edição. Usado na OS, na NFS-e rejeitada e na Pasta.
import { useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { FormNovoCliente } from '@/lib/clientes/novo-cliente'
import ModalNovoCliente, { type ClienteEditado } from './ModalNovoCliente'

export default function EditarClienteOmie({ doc, cod, empresa, onSalvo, rotulo = 'Editar cliente', estilo, zIndex = 100060 }: {
  doc?: string | null; cod?: number | null; empresa?: string | null
  onSalvo?: (c: ClienteEditado) => void
  rotulo?: string; estilo?: React.CSSProperties; zIndex?: number
}) {
  const [form, setForm] = useState<FormNovoCliente | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState('')

  const abrir = async () => {
    setErro(''); setSalvo(''); setCarregando(true)
    try {
      const q = new URLSearchParams()
      if (doc) q.set('doc', doc)
      if (cod) q.set('cod', String(cod))
      if (empresa) q.set('empresa', empresa)
      const r = await fetch(`/api/clientes/editar?${q}`, { headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.form) { setErro(j.error || 'Não consegui abrir o cadastro no Omie.'); return }
      setForm(j.form)
    } catch { setErro('Sem conexão.') } finally { setCarregando(false) }
  }

  return (
    <>
      <button type="button" onClick={abrir} disabled={carregando || (!doc && !cod)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fefefe', color: '#334155', fontSize: 12, fontWeight: 700, cursor: carregando ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', ...estilo }}>
        <i className={`fas ${carregando ? 'fa-spinner fa-spin' : 'fa-user-pen'}`} /> {carregando ? 'Abrindo…' : rotulo}
      </button>
      {erro && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>{erro}</div>}
      {salvo && <div style={{ fontSize: 11, color: '#15803d', marginTop: 4, fontWeight: 600 }}>{salvo}</div>}
      <ModalNovoCliente aberto={!!form} edicao={form} zIndex={zIndex} onFechar={() => setForm(null)}
        onEditado={(c) => {
          setForm(null)
          const falhas = c.resultado.filter((x) => !x.ok)
          setSalvo(falhas.length ? `Salvo em parte — ${falhas.map((f) => `${f.empresa}: ${f.erro}`).join(' · ')}` : `Cadastro salvo no Omie (${c.resultado.map((x) => x.empresa === 'Castro Pecas' ? 'Castro' : 'Nova').join(' e ')}).`)
          onSalvo?.(c)
        }} />
    </>
  )
}
