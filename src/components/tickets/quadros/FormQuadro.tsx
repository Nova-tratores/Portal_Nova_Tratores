'use client'
// Criar / configurar um quadro (nome, descrição, cor, visibilidade e, na
// criação, os integrantes iniciais). Integrantes e colunas de um quadro
// existente são geridos na própria tela do quadro.
import { useState } from 'react'
import { X, LayoutGrid, Lock, Globe, Archive, ArchiveRestore, User as UserIcon } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { CORES_QUADRO, type Quadro, type QuadroVisibilidade } from '@/lib/tickets/quadros'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import UserSelect from '../UserSelect'

interface Props {
  inicial?: Quadro
  usuarios?: Record<string, UsuarioMin>
  onFechar: () => void
  onSalvo: (quadro: Quadro) => void
}

const campo: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
  color: 'var(--portal-text, #111)', outline: 'none',
}
const rotulo: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6,
  color: 'var(--portal-text-secondary, #555)', textTransform: 'uppercase', letterSpacing: .4,
}

export default function FormQuadro({ inicial, usuarios = {}, onFechar, onSalvo }: Props) {
  const editando = !!inicial
  const [nome, setNome] = useState(inicial?.nome || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [cor, setCor] = useState(inicial?.cor || CORES_QUADRO[0])
  const [visibilidade, setVisibilidade] = useState<QuadroVisibilidade>(inicial?.visibilidade || 'privado')
  const [integrantes, setIntegrantes] = useState<string[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [escolhendo, setEscolhendo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (extra: Record<string, unknown> = {}) => {
    setErro('')
    if (!nome.trim()) { setErro('Dê um nome ao bloco.'); return }
    setSalvando(true)
    try {
      const res = await fetch(editando ? `/api/tickets/quadros/${inicial!.id}` : '/api/tickets/quadros', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim(), cor, visibilidade, integrantes, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha ao salvar'); return }
      onSalvo(json.quadro)
    } catch {
      setErro('Falha de conexão — tente novamente')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <LayoutGrid size={18} color={cor} /> {editando ? 'Configurar bloco' : 'Novo bloco'}
          </h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={rotulo} htmlFor="q-nome">Nome *</label>
            <input id="q-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus
              placeholder="Ex: Obra do galpão, Pós-Vendas, Feira Agrishow" style={campo} />
          </div>
          <div>
            <label style={rotulo} htmlFor="q-desc">Descrição</label>
            <textarea id="q-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500}
              placeholder="Para que serve este bloco (opcional)" style={{ ...campo, resize: 'vertical' }} />
          </div>
          <div>
            <span style={rotulo}>Cor</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CORES_QUADRO.map((c) => (
                <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`}
                  style={{ width: 28, height: 28, borderRadius: 8, cursor: 'pointer', background: c, border: cor === c ? '3px solid var(--portal-text, #111)' : '3px solid transparent' }} />
              ))}
            </div>
          </div>
          <div>
            <span style={rotulo}>Quem enxerga</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { v: 'privado' as const, t: 'Privado — só integrantes', i: <Lock size={14} /> },
                { v: 'publico' as const, t: 'Público — todos de Tickets veem', i: <Globe size={14} /> },
              ]).map((op) => (
                <button key={op.v} type="button" onClick={() => setVisibilidade(op.v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: visibilidade === op.v ? '1.5px solid #dc2626' : '1px solid var(--portal-border, #e5e7eb)',
                    background: visibilidade === op.v ? 'rgba(220,38,38,.07)' : 'transparent',
                    color: visibilidade === op.v ? '#dc2626' : 'var(--portal-text-secondary, #555)',
                  }}>{op.i} {op.t}</button>
              ))}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--portal-text-muted, #888)' }}>
              Em bloco público, quem não é integrante só olha; criar e mover cartões é dos integrantes.
            </p>
          </div>

          {!editando && (
            <div>
              <span style={rotulo}>Integrantes</span>
              <UserSelect value={escolhendo} autoFocus={false} placeholder="Adicionar integrante..." excluir={integrantes}
                onChange={(id, u) => {
                  setEscolhendo('')
                  setIntegrantes((l) => (l.includes(id) ? l : [...l, id]))
                  setNomes((n) => ({ ...n, [id]: u?.nome || usuarios[id]?.nome || 'Usuário' }))
                }} />
              {integrantes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {integrantes.map((id) => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: 'var(--portal-bg, #f3f4f6)', color: 'var(--portal-text, #111)' }}>
                      <UserIcon size={12} /> {nomes[id] || 'Usuário'}
                      <button type="button" onClick={() => setIntegrantes((l) => l.filter((x) => x !== id))} aria-label="Remover"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--portal-text-muted, #888)' }}><X size={13} /></button>
                    </span>
                  ))}
                </div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--portal-text-muted, #888)' }}>
                Você entra automaticamente. Dá para incluir mais gente depois.
              </p>
            </div>
          )}

          {erro && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {editando && (
              <button type="button" disabled={salvando} onClick={() => {
                const arquivar = !inicial!.arquivado
                if (arquivar && !window.confirm('Arquivar este bloco? Ele sai da lista e ninguém cria tickets nele. Os tickets continuam existindo.')) return
                enviar({ arquivado: arquivar })
              }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--portal-text-secondary, #555)' }}>
                {inicial!.arquivado ? <><ArchiveRestore size={14} /> Desarquivar</> : <><Archive size={14} /> Arquivar</>}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onFechar} disabled={salvando}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--portal-text-secondary, #555)' }}>Cancelar</button>
            <button type="button" onClick={() => enviar()} disabled={salvando}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: salvando ? .6 : 1 }}>
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar bloco'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

