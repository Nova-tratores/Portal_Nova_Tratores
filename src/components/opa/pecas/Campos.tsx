'use client'
// Campos compartilhados da captura e do detalhe: localização (com técnico no
// Box Técnico) e aplicações (tipo de máquina + marca, várias).

import { useEffect, useState } from 'react'
import { MapPin, Minus, Plus, UserRound, X } from 'lucide-react'
import { listarTecnicos } from '@/lib/opa-pecas/db'
import { agruparLocais, mascaraMoeda, textoAplicacao } from '@/lib/opa-pecas/regras'
import { INFO_QUALIDADE, ROTULO_QUALIDADE, type Aplicacao, type Local, type Lookup, type Qualidade } from '@/lib/opa-pecas/tipos'
import { botao, INP, LARANJA } from './comum'

export function SeletorLocal({ locais, local, tecnico, onChange, disabled }: {
  locais: Local[]
  local: string
  tecnico: string
  onChange: (local: string, tecnico: string) => void
  disabled?: boolean
  compacto?: boolean
}) {
  const [tecnicos, setTecnicos] = useState<string[]>([])
  const escolhido = locais.find((l) => l.id === local)
  const precisaTecnico = !!escolhido?.exige_tecnico
  const grupos = agruparLocais(locais.filter((l) => l.ativo || l.id === local))

  useEffect(() => {
    if (!precisaTecnico) return
    let vivo = true
    listarTecnicos().then((t) => { if (vivo) setTecnicos(t) })
    return () => { vivo = false }
  }, [precisaTecnico])

  if (locais.length === 0) return <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Carregando locais…</div>

  const linha: React.CSSProperties = { display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', alignItems: 'center', gap: 8 }
  const titulo: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: 'var(--portal-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={linha}>
        <span style={titulo}><MapPin size={13} style={{ opacity: 0.5 }} /> Local</span>
        <select value={local} disabled={disabled}
          onChange={(e) => { const l = locais.find((x) => x.id === e.target.value); onChange(e.target.value, l?.exige_tecnico ? tecnico : '') }}
          style={{ ...INP, borderColor: local ? LARANJA : 'var(--portal-border)' }}>
          <option value="">Sem local</option>
          {grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.itens.map(({ local: l, rotulo }) => <option key={l.id} value={l.id}>{g.titulo === rotulo ? rotulo : `${g.titulo} · ${rotulo}`}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {precisaTecnico && (
        <div style={linha}>
          <span style={{ ...titulo, color: tecnico ? 'var(--portal-text-secondary)' : '#B45309' }}><UserRound size={13} /> Técnico</span>
          <select value={tecnico} disabled={disabled} onChange={(e) => onChange(local, e.target.value)}
            style={{ ...INP, borderColor: tecnico ? 'var(--portal-border)' : '#F59E0B', borderWidth: tecnico ? 1 : 2 }}>
            <option value="">{tecnicos.length ? 'Escolha o técnico do box' : 'Carregando técnicos…'}</option>
            {tecnico && !tecnicos.includes(tecnico) && <option value={tecnico}>{tecnico}</option>}
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

/** Qualidade em cartões com cor e explicação curta. */
export function SeletorQualidade({ valor, onChange, disabled }: { valor: Qualidade; onChange: (q: Qualidade) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Qualidade" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {(Object.keys(INFO_QUALIDADE) as Qualidade[]).map((q) => {
        const info = INFO_QUALIDADE[q]
        const ativo = q === valor
        return (
          <button key={q} type="button" role="radio" aria-checked={ativo} disabled={disabled} onClick={() => onChange(q)} style={{
            textAlign: 'left', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
            border: '1.5px solid ' + (ativo ? info.cor : 'var(--portal-border)'), background: ativo ? info.fundo : 'var(--portal-bg-card)',
            boxShadow: ativo ? 'inset 4px 0 0 ' + info.cor : 'none',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: ativo ? info.cor : 'var(--portal-text)' }}>{ROTULO_QUALIDADE[q]}</div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{info.dica}</div>
          </button>
        )
      })}
    </div>
  )
}

/** Quantidade: − / + grandes, atalhos e o texto por extenso. */
export function SeletorQuantidade({ valor, onChange, disabled }: { valor: number; onChange: (n: number) => void; disabled?: boolean }) {
  const ajustar = (n: number) => onChange(Math.min(100000, Math.max(1, n)))
  const passo: React.CSSProperties = {
    width: 46, height: 46, borderRadius: 10, border: '1.5px solid var(--portal-border)', background: 'var(--portal-bg-card)',
    color: 'var(--portal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" aria-label="Menos" disabled={disabled || valor <= 1} onClick={() => ajustar(valor - 1)} style={{ ...passo, opacity: valor <= 1 ? 0.4 : 1 }}><Minus size={20} /></button>
        <input inputMode="numeric" aria-label="Quantidade" value={valor} disabled={disabled}
          onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10); ajustar(Number.isFinite(n) ? n : 1) }}
          style={{ ...INP, width: 72, height: 46, textAlign: 'center', fontSize: 20, fontWeight: 800, padding: 0 }} />
        <button type="button" aria-label="Mais" disabled={disabled} onClick={() => ajustar(valor + 1)} style={passo}><Plus size={20} /></button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 5, 10].map((n) => (
          <button key={n} type="button" disabled={disabled} onClick={() => ajustar(n)} style={{
            minWidth: 38, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
            border: '1.5px solid ' + (valor === n ? LARANJA : 'var(--portal-border)'),
            background: valor === n ? '#FFF7ED' : 'var(--portal-bg-card)', color: valor === n ? '#9A3412' : 'var(--portal-text-secondary)',
          }}>{n}</button>
        ))}
      </div>
      <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>{valor === 1 ? '1 peça' : valor.toLocaleString('pt-BR') + ' peças iguais'}</span>
    </div>
  )
}

export function EditorAplicacoes({ tipos, marcas, valor, onChange, disabled, ocupado }: {
  tipos: Lookup[]
  marcas: Lookup[]
  valor: Aplicacao[]
  onChange: (lista: Aplicacao[]) => void
  disabled?: boolean
  ocupado?: boolean
}) {
  const [nova, setNova] = useState({ tipo: '', marca: '' })
  const nomes = {
    tipos: Object.fromEntries(tipos.map((t) => [t.id, t.nome])),
    marcas: Object.fromEntries(marcas.map((m) => [m.id, m.nome])),
  }
  const adicionar = () => {
    if (!nova.tipo) return
    const marca = nova.marca || null
    if (!valor.some((a) => a.tipo_maquina_id === nova.tipo && a.marca_id === marca)) {
      onChange([...valor, { tipo_maquina_id: nova.tipo, marca_id: marca }])
    }
    setNova({ tipo: '', marca: '' })
  }
  return (
    <div>
      {(valor.length > 0 || disabled) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: disabled ? 0 : 8 }}>
          {valor.length === 0 && <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Nenhuma aplicação informada.</span>}
          {valor.map((a) => (
            <span key={`${a.tipo_maquina_id}-${a.marca_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: '#EFF6FF', color: '#1E40AF', fontSize: 13.5, fontWeight: 600 }}>
              {textoAplicacao(a, nomes)}
              {!disabled && (
                <button type="button" aria-label="Remover aplicação" disabled={ocupado} onClick={() => onChange(valor.filter((x) => x !== a))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#1E40AF', display: 'flex' }}><X size={15} /></button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={nova.tipo} onChange={(e) => setNova((n) => ({ ...n, tipo: e.target.value }))} style={{ ...INP, width: 'auto', minWidth: 160, flex: 1 }}>
            <option value="">Tipo de máquina…</option>
            {tipos.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={nova.marca} onChange={(e) => setNova((n) => ({ ...n, marca: e.target.value }))} style={{ ...INP, width: 'auto', minWidth: 140, flex: 1 }}>
            <option value="">Qualquer marca</option>
            {marcas.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button type="button" onClick={adicionar} disabled={!nova.tipo || ocupado} style={botao('#1E40AF', { desab: !nova.tipo || ocupado })}>
            <Plus size={15} /> Adicionar
          </button>
        </div>
      )}
    </div>
  )
}

/** Campo de preço já em reais: digita só números, aparece "R$ 1.234,56". */
export function CampoPreco({ valor, onChange, disabled, placeholder = '0,00', estilo }: {
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  estilo?: React.CSSProperties
}) {
  return (
    <div style={{ position: 'relative', ...estilo }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--portal-text-muted)', pointerEvents: 'none' }}>R$</span>
      <input inputMode="numeric" value={valor} disabled={disabled} placeholder={placeholder} aria-label="Preço em reais"
        onChange={(e) => onChange(mascaraMoeda(e.target.value))}
        style={{ ...INP, paddingLeft: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
    </div>
  )
}
