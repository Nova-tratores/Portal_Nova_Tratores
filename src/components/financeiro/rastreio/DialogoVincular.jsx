'use client'
// Rastreio de notas — VÍNCULO MANUAL: quando o casamento automático não achou
// (grafia de fornecedor diferente, nota sem número), o usuário busca o outro
// documento aqui e liga na mão. Usa o MESMO GET /api/financeiro/rastreio.
import { useState } from 'react'
import { Link2, Loader2, Search, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

const ROTULO_TIPO = {
  finan_pagar: 'Conta a pagar',
  requisicao: 'Requisição',
  chamado_nf: 'Faturamento',
  nota_entrada: 'NF entrada',
  nota_saida: 'NF saída',
  titulo_omie: 'Título Omie',
}

// achata as fichas do resultado em documentos individuais selecionáveis
function docsDe(fichas) {
  const docs = []
  for (const f of fichas) {
    for (const fp of f.secoes.contaPagar) {
      docs.push({ ref: { tipo: 'finan_pagar', id: String(fp.id) }, titulo: `Conta a pagar #${fp.id}`, sub: `${fp.fornecedor || ''} · NF ${fp.numero_NF || '—'} · R$ ${fp.valor || '—'}` })
    }
    for (const q of f.secoes.requisicoes) {
      docs.push({ ref: { tipo: 'requisicao', id: String(q.id) }, titulo: `Requisição #${q.id}`, sub: `${q.titulo || ''} · ${q.fornecedor || ''} · NF ${q.numero_nota || '—'}` })
    }
    for (const c of f.secoes.chamadosReceber) {
      docs.push({ ref: { tipo: 'chamado_nf', id: String(c.id) }, titulo: `Faturamento #${c.id}`, sub: `${c.nom_cliente || ''} · NF ${c.num_nf_servico || c.num_nf_peca || '—'}` })
    }
    for (const t of f.secoes.titulosOmie) {
      docs.push({ ref: { tipo: 'titulo_omie', id: String(t.codigo_lancamento) }, titulo: `Título Omie ${t.codigo_lancamento}`, sub: `${t.tipo === 'pagar' ? 'a pagar' : 'a receber'} · doc ${t.numero_documento_fiscal || '—'} · boleto ${t.numero_boleto || '—'}` })
    }
    for (const nEnt of f.secoes.nfEntrada) {
      if (nEnt.ncod_nf) docs.push({ ref: { tipo: 'nota_entrada', id: String(nEnt.ncod_nf) }, titulo: `NF entrada ${nEnt.numero_nf}`, sub: nEnt.nome_emitente || '' })
    }
    for (const nSai of f.secoes.nfSaida) {
      docs.push({ ref: { tipo: 'nota_saida', id: String(nSai.n_cod_nf) }, titulo: `NF saída ${nSai.numero}`, sub: nSai.cliente_nome || '' })
    }
  }
  return docs
}

export default function DialogoVincular({ origem, origemLabel, jaNaFicha = [], onVinculado, onClose }) {
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [docs, setDocs] = useState([])
  const [vinculando, setVinculando] = useState('')
  const [erro, setErro] = useState('')

  const buscar = async () => {
    if (q.trim().length < 2 || buscando) return
    setBuscando(true)
    setErro('')
    try {
      const r = await fetch(`/api/financeiro/rastreio?q=${encodeURIComponent(q.trim())}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha na busca')
      // tira TODOS os docs que já estão na ficha (não só o representante) —
      // vincular um deles criaria vínculo redundante
      const excluir = new Set([`${origem.tipo}:${origem.id}`, ...jaNaFicha])
      const achados = docsDe(j.fichas || []).filter(d => !excluir.has(`${d.ref.tipo}:${d.ref.id}`))
      setDocs(achados)
      if (achados.length === 0) setErro('Nada encontrado fora desta ficha — tente o nº da nota ou #id da requisição.')
    } catch (e) {
      setErro(String(e?.message || e))
    } finally {
      setBuscando(false)
    }
  }

  const vincular = async (doc) => {
    setVinculando(`${doc.ref.tipo}:${doc.ref.id}`)
    setErro('')
    try {
      const r = await fetch('/api/financeiro/rastreio/vinculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ a: origem, b: doc.ref }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Falha ao vincular')
      onVinculado?.()
      onClose()
    } catch (e) {
      setErro(String(e?.message || e))
    } finally {
      setVinculando('')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', borderBottom: '1px solid #eef0f3' }}>
          <Link2 size={17} style={{ color: '#2563eb' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>Vincular documento</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>a {origemLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', gap: '8px' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar() }}
            placeholder="Nº da nota, #requisição, boleto ou fornecedor…"
            autoFocus
            style={{ flex: 1, padding: '11px 13px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none' }}
          />
          <button onClick={buscar} disabled={buscando || q.trim().length < 2} style={{ padding: '11px 16px', borderRadius: '10px', border: 'none', background: buscando || q.trim().length < 2 ? '#c7d2fe' : '#2563eb', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
          </button>
        </div>

        {erro && <div style={{ padding: '0 20px 10px', fontSize: '12.5px', color: '#dc2626', fontWeight: 600 }}>{erro}</div>}

        <div style={{ overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {docs.map(d => {
            const k = `${d.ref.tipo}:${d.ref.id}`
            return (
              <button key={k} onClick={() => vincular(d)} disabled={!!vinculando} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', background: '#eff6ff', color: '#2563eb', whiteSpace: 'nowrap' }}>{ROTULO_TIPO[d.ref.tipo] || d.ref.tipo}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{d.titulo}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sub}</span>
                </span>
                {vinculando === k ? <Loader2 size={15} className="animate-spin" style={{ color: '#2563eb' }} /> : <Link2 size={15} style={{ color: '#94a3b8' }} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
