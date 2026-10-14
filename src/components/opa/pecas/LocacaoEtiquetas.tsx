'use client'
// Ficha da peça: LOCAÇÃO no estoque (Prateleira/Andar/Caixa, com o atalho
// "destinar para a locação do SKU" quando o código existente já tem locação no
// catálogo) e ETIQUETAS (marcadores livres, opcionais). Os dois são gravados
// pelo "Salvar alterações" da ficha (pni_atualizar_item, sql/pni-13).

import { useEffect, useState } from 'react'
import { Boxes, CheckCircle2, Tag, X } from 'lucide-react'
import { etiquetasUsadas } from '@/lib/opa-pecas/db'
import { mesmaLocacao, normalizarEtiquetas, textoLocacao, type Locacao } from '@/lib/opa-pecas/regras'
import { botao, INP, LARANJA, ROTULO } from './comum'
import { chaveSku, useProdutosSku } from './useProdutosSku'

export function SecaoLocacao({ sku, valor, onChange, disabled }: {
  /** código existente (SKU) já salvo na peça */
  sku: string | null
  valor: Locacao
  onChange: (l: Locacao) => void
  disabled: boolean
}) {
  const mapa = useProdutosSku([sku])
  const achados = sku ? mapa[chaveSku(sku)] : undefined
  const comLocacao = achados?.find((p) => p.locacao)
  const doSku = comLocacao?.locacao || null
  const jaNoSku = !!doSku && mesmaLocacao(valor, doSku)

  const campo = (k: keyof Locacao, rotulo: string, ph: string) => (
    <div style={{ flex: 1, minWidth: 80 }}>
      <label style={{ ...ROTULO, fontSize: 12 }}>{rotulo}</label>
      <input value={valor[k]} disabled={disabled} maxLength={20} placeholder={ph}
        onChange={(e) => onChange({ ...valor, [k]: e.target.value.toUpperCase() })} style={{ ...INP, textTransform: 'uppercase' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* o que o catálogo diz do SKU */}
      {!sku && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Sem código existente (SKU): informe a locação à mão, se a peça for guardada no estoque.</div>}
      {sku && !achados && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Procurando o SKU {sku} no catálogo…</div>}
      {sku && achados && achados.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>O SKU <b style={{ fontFamily: 'monospace' }}>{sku}</b> não está no catálogo — informe a locação à mão, se houver.</div>
      )}
      {sku && achados && achados.length > 0 && !doSku && (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
          SKU <b style={{ fontFamily: 'monospace' }}>{achados[0].sku}</b> está no catálogo ({[...new Set(achados.map((p) => p.conta))].join('/')}){achados[0].descricao ? ` — ${achados[0].descricao}` : ''}, mas <b>sem locação cadastrada</b>.
        </div>
      )}
      {doSku && comLocacao && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: jaNoSku ? '#ECFDF5' : '#FFF7ED', border: `1px solid ${jaNoSku ? '#A7F3D0' : '#FED7AA'}` }}>
          <Boxes size={18} style={{ color: jaNoSku ? '#047857' : LARANJA, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: '#111111' }}>
            O SKU <b style={{ fontFamily: 'monospace' }}>{comLocacao.sku}</b> ({comLocacao.conta}) fica em <b>{textoLocacao(doSku)}</b>
            {comLocacao.descricao && <div style={{ fontSize: 11.5, color: '#52525B', marginTop: 2 }}>{comLocacao.descricao}</div>}
          </div>
          {jaNoSku
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#047857' }}><CheckCircle2 size={15} /> Destinada para esta locação</span>
            : !disabled && <button type="button" onClick={() => onChange({ ...doSku })} style={botao(LARANJA)}>Destinar para esta locação</button>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {campo('prateleira', 'Prateleira', 'ex.: 3')}
        {campo('andar', 'Andar', 'ex.: G')}
        {campo('caixa', 'Caixa', 'ex.: 24')}
        {!disabled && (valor.prateleira || valor.andar || valor.caixa) && (
          <button type="button" title="Tirar a locação" onClick={() => onChange({ prateleira: '', andar: '', caixa: '' })} style={{ ...botao('#52525B', { contorno: true }), height: 42 }}><X size={14} /></button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Fica só na peça (Peças S/Estoque). Nada é alterado na Omie.</div>
    </div>
  )
}

let cacheSugestoes: string[] | null = null

export function EditorEtiquetas({ valor, onChange, disabled }: { valor: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [texto, setTexto] = useState('')
  const [sugestoes, setSugestoes] = useState<string[]>(cacheSugestoes || [])
  useEffect(() => {
    if (disabled || cacheSugestoes) return
    let vivo = true
    etiquetasUsadas().then((l) => { cacheSugestoes = l; if (vivo) setSugestoes(l) })
    return () => { vivo = false }
  }, [disabled])

  const incluir = (bruto: string) => {
    const novas = bruto.split(',').map((t) => t.trim()).filter(Boolean)
    if (!novas.length) return
    onChange(normalizarEtiquetas([...valor, ...novas]))
    setTexto('')
  }
  const disponiveis = sugestoes.filter((s) => !valor.some((v) => v.toLowerCase() === s.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {valor.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Nenhuma etiqueta.</span>}
        {valor.map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, padding: '3px 6px 3px 9px', borderRadius: 999, background: '#EEF2FF', color: '#3730A3', border: '1px solid #C7D2FE' }}>
            <Tag size={11} /> {t}
            {!disabled && (
              <button type="button" aria-label={`Tirar a etiqueta ${t}`} onClick={() => onChange(valor.filter((x) => x !== t))}
                style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: '#3730A3', padding: 1 }}><X size={12} /></button>
            )}
          </span>
        ))}
      </div>
      {!disabled && valor.length < 15 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={texto} list="pni-etiquetas-sugestoes" maxLength={30} placeholder="Nova etiqueta (Enter para incluir)"
            onChange={(e) => { const v = e.target.value; if (v.includes(',')) incluir(v); else setTexto(v) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(texto) } }}
            style={{ ...INP, flex: 1 }} />
          <datalist id="pni-etiquetas-sugestoes">{disponiveis.map((s) => <option key={s} value={s} />)}</datalist>
          <button type="button" disabled={!texto.trim()} onClick={() => incluir(texto)} style={botao(LARANJA, { contorno: true, desab: !texto.trim() })}>Incluir</button>
        </div>
      )}
      {!disabled && disponiveis.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Já usadas:</span>
          {disponiveis.slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => incluir(s)} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px dashed var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Depois de salvar etiquetas novas, as sugestões são relidas na próxima ficha. */
export function esquecerSugestoesEtiquetas() { cacheSugestoes = null }
