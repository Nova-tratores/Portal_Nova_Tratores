'use client'

// Formulário "Nova máquina" (atalho do POS): cria o projeto no Omie no padrão
// do cadastro ("MARCA MODELO CHASSI", até 70 letras) pela rota
// /api/clientes/projetos/criar — que não duplica: nome igual devolve o existente.
import { useEffect, useState } from 'react'
import { X, Tractor, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export type MaquinaCriada = { codigo: number; nome: string; empresa: string; modelo: string; chassi: string; ja_existia?: boolean; aviso?: string }

const LBL: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }
const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', borderRadius: 9, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #0f172a)', fontSize: 13.5, outline: 'none' }
const NOME_MAX = 70

export default function ModalNovaMaquina({ aberto, onFechar, onCriada, empresaPadrao, zIndex = 90000 }: {
  aberto: boolean; onFechar: () => void; onCriada: (m: MaquinaCriada) => void; empresaPadrao?: string; zIndex?: number
}) {
  const [empresa, setEmpresa] = useState('Nova Tratores')
  const [modelo, setModelo] = useState('')
  const [chassi, setChassi] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    let vivo = true
    Promise.resolve().then(() => {
      if (!vivo) return
      setEmpresa(empresaPadrao && /castro/i.test(empresaPadrao) ? 'Castro Pecas' : 'Nova Tratores')
      setModelo(''); setChassi(''); setErro('')
    })
    return () => { vivo = false }
  }, [aberto, empresaPadrao])

  const nome = `${modelo} ${chassi}`.replace(/\s+/g, ' ').trim().toUpperCase()

  const criar = async () => {
    setErro('')
    if (!modelo.trim()) { setErro('Informe a marca e o modelo.'); return }
    if (!chassi.trim()) { setErro('Informe o chassi (ou número de série).'); return }
    if (nome.length > NOME_MAX) { setErro(`Nome com ${nome.length} letras — o Omie aceita no máximo ${NOME_MAX}. Abrevie o modelo.`); return }
    setEnviando(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const r = await fetch('/api/clientes/projetos/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ nome, empresa }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { setErro(j?.error || j?.erro || `Erro ${r.status}`); return }
      onCriada({ codigo: j.codigo, nome: j.nome, empresa: j.empresa, modelo: modelo.trim().toUpperCase(), chassi: chassi.trim().toUpperCase(), ja_existia: j.ja_existia, aviso: j.aviso })
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) return null
  return (
    <div onClick={e => { if (e.target === e.currentTarget && !enviando) onFechar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 16, width: 460, maxWidth: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: '#ECFDF5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Tractor size={19} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #0f172a)' }}>Nova máquina</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Cria o projeto no Omie e já usa nesta OS.</div>
          </div>
          <button onClick={onFechar} disabled={enviando} title="Fechar"
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #E5E7EB', background: 'var(--portal-bg-secondary, #f8fafc)', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={LBL}>Empresa *</label>
            <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
              <option value="Nova Tratores">Nova Tratores</option>
              <option value="Castro Pecas">Castro Peças</option>
            </select>
          </div>
          <div>
            <label style={LBL}>Marca e modelo *</label>
            <input autoFocus value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Ex.: MAHINDRA 6075, NEW HOLLAND TL 75" style={INP} />
          </div>
          <div>
            <label style={LBL}>Chassi / nº de série *</label>
            <input value={chassi} onChange={e => setChassi(e.target.value)} placeholder="Ex.: MDI07502AN0002581" style={{ ...INP, fontFamily: 'ui-monospace, monospace' }}
              onKeyDown={e => { if (e.key === 'Enter') criar() }} />
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--portal-bg-secondary, #f8fafc)', border: '1px dashed #E5E7EB' }}>
            <div style={{ ...LBL, marginBottom: 3 }}>Vai ficar no Omie como</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: nome ? 'var(--portal-text, #0f172a)' : '#CBD5E1', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
              {nome || 'MARCA MODELO CHASSI'}
            </div>
            <div style={{ fontSize: 11, color: nome.length > NOME_MAX ? '#DC2626' : '#94A3B8', marginTop: 3 }}>{nome.length}/{NOME_MAX} letras</div>
          </div>
          {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12.5, color: '#B91C1C', fontWeight: 600 }}>{erro}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #F1F5F9', background: 'var(--portal-bg-secondary, #f8fafc)' }}>
          <button onClick={onFechar} disabled={enviando}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={criar} disabled={enviando}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #059669, #047857)', color: '#fefefe', fontSize: 13.5, fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
            {enviando ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Tractor size={15} />}
            {enviando ? 'Criando no Omie...' : 'Criar máquina'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
