'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { X, Plus, Trash2, Save, AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { corCultura } from '@/lib/agro/prospeccao'

// Regras de oportunidade: por cultura e faixa de área, que máquina sugerir, o
// argumento do vendedor e os pesos do score. Quem preenche é o comercial.
// O score dos imóveis só muda na próxima execução do pipeline (calcular_perfil.py).

const VERDE = '#16a34a'
const txt = 'var(--portal-text,#111111)'
const mut = 'var(--portal-text-muted,#6b7280)'
const borda = '1px solid var(--portal-border,#e5e7eb)'
const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: borda, background: 'var(--portal-bg-input,#fefefe)', color: txt, fontSize: 13, width: '100%', boxSizing: 'border-box' }
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderBottom: borda, color: txt, verticalAlign: 'top' }
const th: React.CSSProperties = { ...td, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary,#374151)', background: 'var(--portal-bg-secondary,#f3f4f6)', whiteSpace: 'nowrap' }
const botao = (cor: string, cheio: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fefefe' : cor, cursor: 'pointer',
})

const VAZIA = { cultura_codigo: '', faixa_area_min: '0', faixa_area_max: '', produto_sugerido: '', argumento: '', prioridade: '3', peso_area: '1', peso_credito: '1', peso_sem_compra: '1' }

export default function RegrasOportunidade({ onFechar }: { onFechar: () => void }) {
  const [regras, setRegras] = useState<any[]>([])
  const [culturas, setCulturas] = useState<any[]>([])
  const [nova, setNova] = useState<Record<string, string>>(VAZIA)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/agro/regras', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setRegras(j.regras || []); setCulturas((j.culturas || []).filter((c: any) => !['mosaico', 'outro'].includes(c.codigo)))
    } catch (e: any) { setErro(e?.message || 'Falha ao carregar as regras') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const chamar = async (method: string, url: string, body?: any) => {
    setOcupado(true); setErro(null)
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      await carregar(); return true
    } catch (e: any) { setErro(e?.message || 'Falha ao gravar'); return false }
    finally { setOcupado(false) }
  }
  const nomeDe = (cod: string) => culturas.find((c) => c.codigo === cod)?.nome || cod

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '5vh 12px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', background: 'var(--portal-bg-card,#fefefe)', borderRadius: 12, border: borda, borderTop: `4px solid ${VERDE}`, boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: borda }}>
          <SlidersHorizontal size={20} style={{ color: VERDE }} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: txt }}>Regras de oportunidade</h2>
          <span style={{ fontSize: 12, color: mut }}>{regras.length} regra(s)</span>
          <button type="button" onClick={onFechar} style={{ ...botao('#6b7280', false), padding: 6, marginLeft: 'auto' }} title="Fechar (Esc)"><X size={16} /></button>
        </div>
        <div style={{ padding: '10px 16px', fontSize: 12, lineHeight: 1.5, color: 'var(--portal-text-secondary,#374151)' }}>
          Para cada cultura e faixa de área, diga qual máquina oferecer e por quê. A prioridade vai de 1 (mais importante) a 5; os pesos dizem quanto contam a área da cultura, o crédito recente e o fato de o imóvel ainda não ser cliente.
          O score = (área × peso + crédito × peso + não cliente × peso + prioridade) × fator da confiança. <b>A lista só reordena depois que o perfil for recalculado</b> (rodada do pipeline).
        </div>
        {erro && <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'rgba(220,38,38,.10)', borderLeft: '4px solid #dc2626', color: txt, fontSize: 13 }}><AlertTriangle size={16} style={{ color: '#dc2626' }} /> {erro}</div>}

        <div style={{ overflowX: 'auto', padding: '0 16px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={th}>Cultura</th><th style={th}>Área de (ha)</th><th style={th}>até (ha)</th><th style={th}>Produto sugerido</th><th style={th}>Argumento do vendedor</th>
                <th style={th}>Prior.</th><th style={th} title="peso da área da cultura">P. área</th><th style={th} title="peso do crédito recente">P. crédito</th><th style={th} title="peso de ainda não ser cliente">P. não cliente</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {regras.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: mut }}>Nenhuma regra cadastrada: o score usa pesos iguais e prioridade neutra.</td></tr>}
              {regras.map((r) => (
                <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                  <td style={td}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: corCultura(r.cultura_codigo), marginRight: 6 }} />{nomeDe(r.cultura_codigo)}</td>
                  <td style={td}>{Number(r.faixa_area_min).toLocaleString('pt-BR')}</td>
                  <td style={td}>{r.faixa_area_max != null ? Number(r.faixa_area_max).toLocaleString('pt-BR') : 'sem teto'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.produto_sugerido}</td>
                  <td style={{ ...td, fontSize: 12, maxWidth: 300 }}>{r.argumento || <span style={{ color: mut }}>—</span>}</td>
                  <td style={td}>{r.prioridade}</td><td style={td}>{Number(r.peso_area)}</td><td style={td}>{Number(r.peso_credito)}</td><td style={td}>{Number(r.peso_sem_compra)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" disabled={ocupado} onClick={() => chamar('PATCH', '/api/agro/regras', { id: r.id, ativo: !r.ativo })} style={botao('#6b7280', false)}>{r.ativo ? 'Desativar' : 'Ativar'}</button>{' '}
                    <button type="button" disabled={ocupado} onClick={() => { if (confirm(`Remover a regra "${r.produto_sugerido}"?`)) chamar('DELETE', `/api/agro/regras?id=${r.id}`) }} style={{ ...botao('#dc2626', false), padding: 6 }} title="Remover"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {/* nova regra */}
              <tr style={{ background: 'rgba(22,163,74,.06)' }}>
                <td style={td}>
                  <select value={nova.cultura_codigo} onChange={(e) => setNova({ ...nova, cultura_codigo: e.target.value })} style={input}>
                    <option value="">cultura…</option>
                    {culturas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}
                  </select>
                </td>
                <td style={td}><input value={nova.faixa_area_min} onChange={(e) => setNova({ ...nova, faixa_area_min: e.target.value })} style={{ ...input, width: 80 }} inputMode="decimal" /></td>
                <td style={td}><input value={nova.faixa_area_max} onChange={(e) => setNova({ ...nova, faixa_area_max: e.target.value })} placeholder="sem teto" style={{ ...input, width: 80 }} inputMode="decimal" /></td>
                <td style={td}><input value={nova.produto_sugerido} onChange={(e) => setNova({ ...nova, produto_sugerido: e.target.value })} placeholder="ex.: Mahindra 6075 4x4" style={input} /></td>
                <td style={td}><input value={nova.argumento} onChange={(e) => setNova({ ...nova, argumento: e.target.value })} placeholder="o que o vendedor fala" style={input} /></td>
                <td style={td}><input value={nova.prioridade} onChange={(e) => setNova({ ...nova, prioridade: e.target.value })} style={{ ...input, width: 50 }} inputMode="numeric" /></td>
                <td style={td}><input value={nova.peso_area} onChange={(e) => setNova({ ...nova, peso_area: e.target.value })} style={{ ...input, width: 55 }} inputMode="decimal" /></td>
                <td style={td}><input value={nova.peso_credito} onChange={(e) => setNova({ ...nova, peso_credito: e.target.value })} style={{ ...input, width: 55 }} inputMode="decimal" /></td>
                <td style={td}><input value={nova.peso_sem_compra} onChange={(e) => setNova({ ...nova, peso_sem_compra: e.target.value })} style={{ ...input, width: 55 }} inputMode="decimal" /></td>
                <td style={td}>
                  <button type="button" disabled={ocupado || !nova.cultura_codigo || !nova.produto_sugerido.trim()} onClick={async () => { if (await chamar('POST', '/api/agro/regras', nova)) setNova(VAZIA) }} style={botao(VERDE, true)}><Plus size={13} /> <Save size={13} /> Criar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
