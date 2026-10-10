'use client'
// POPs — formulário de UM passo no editor (tipo, título, ajuda, obrigatório,
// configuração do tipo e mídia de apoio). A validação final é a mesma da rota
// (normalizarPassos em lib/pops/regras).
import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, Trash2, X } from 'lucide-react'
import { TIPOS_PASSO, type ConfigPasso, type TipoPasso } from '@/lib/pops/regras'
import { comprimir } from '@/lib/opa-pecas/fotos'
import { COR_POPS, botaoClaro, campo, chamar, rotulo } from './comum'
import { ICONE_PASSO, midiaEhVideo } from './PassoPreview'

export interface PassoEditavel {
  _k: string                // chave local do React
  chave?: string            // identidade entre versões (vem do banco)
  tipo: TipoPasso
  titulo: string
  ajuda: string
  obrigatorio: boolean
  config: ConfigPasso
  midia_path: string | null
  midia_url?: string | null
  midia_tipo?: 'imagem' | 'video' | null
}

const MAX_VIDEO = 50 * 1024 * 1024

interface Props {
  p: PassoEditavel
  n: number
  aberto: boolean
  total: number
  popId: string
  versaoId: string
  onAbrir: () => void
  onMudar: (p: PassoEditavel) => void
  onMover: (delta: -1 | 1) => void
  onRemover: () => void
  arrastar: { onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDragEnd: () => void; arrastando: boolean }
}

export default function EditorPasso({ p, n, aberto, total, popId, versaoId, onAbrir, onMudar, onMover, onRemover, arrastar }: Props) {
  const [subindo, setSubindo] = useState(false)
  const [erroMidia, setErroMidia] = useState('')
  const set = (patch: Partial<PassoEditavel>) => onMudar({ ...p, ...patch })
  const setCfg = (patch: Partial<ConfigPasso>) => onMudar({ ...p, config: { ...p.config, ...patch } })
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))

  const enviarMidia = async (arquivo: File) => {
    setErroMidia(''); setSubindo(true)
    try {
      const video = arquivo.type.startsWith('video/')
      if (video && arquivo.size > MAX_VIDEO) throw new Error('Vídeo acima de 50 MB — use um vídeo curto.')
      const corpo: Blob = video ? arquivo : (await comprimir(arquivo)).grande
      const tipo = video ? arquivo.type : 'image/jpeg'
      const up = await chamar<{ path: string; signedUrl: string }>(`/api/pops/${popId}/acoes`, {
        json: { acao: 'upload_midia', versao_id: versaoId, content_type: tipo },
      })
      const r = await fetch(up.signedUrl, { method: 'PUT', body: corpo, headers: { 'Content-Type': tipo } })
      if (!r.ok) throw new Error('Falha ao enviar o arquivo.')
      set({ midia_path: up.path, midia_url: URL.createObjectURL(corpo), midia_tipo: video ? 'video' : 'imagem' })
    } catch (e) { setErroMidia((e as Error).message) } finally { setSubindo(false) }
  }

  const resumo = (
    <div
      draggable onDragStart={arrastar.onDragStart} onDragOver={arrastar.onDragOver} onDragEnd={arrastar.onDragEnd}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', opacity: arrastar.arrastando ? .4 : 1 }}
      onClick={onAbrir}>
      <span title="Arraste para reordenar" style={{ cursor: 'grab', color: 'var(--portal-text-muted,#888)', display: 'flex' }} onClick={(e) => e.stopPropagation()}>
        <GripVertical size={16} />
      </span>
      <span style={{ fontWeight: 900, width: 22, color: COR_POPS }}>{n}</span>
      <span style={{ color: COR_POPS, display: 'flex' }}>{ICONE_PASSO[p.tipo]}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: p.titulo ? 'var(--portal-text,#111)' : '#9ca3af' }}>
        {p.titulo || 'Passo sem título'}
      </span>
      {p.tipo !== 'instrucao' && !p.obrigatorio && <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#888)' }}>opcional</span>}
      <button aria-label="Subir" disabled={n === 1} onClick={(e) => { e.stopPropagation(); onMover(-1) }} style={setinha}><ChevronUp size={15} /></button>
      <button aria-label="Descer" disabled={n === total} onClick={(e) => { e.stopPropagation(); onMover(1) }} style={setinha}><ChevronDown size={15} /></button>
    </div>
  )

  return (
    <div style={{ border: `1px solid ${aberto ? COR_POPS : 'var(--portal-border,#e5e7eb)'}`, borderRadius: 12, background: 'var(--portal-surface,#fff)' }}>
      {resumo}
      {aberto && (
        <div style={{ padding: '4px 14px 14px', display: 'grid', gap: 12, borderTop: '1px solid var(--portal-border,#e5e7eb)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,220px) 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label style={rotulo}>Tipo</label>
              <select value={p.tipo} onChange={(e) => set({ tipo: e.target.value as TipoPasso, config: {} })} style={campo}>
                {TIPOS_PASSO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={rotulo}>O que fazer</label>
              <input value={p.titulo} maxLength={300} onChange={(e) => set({ titulo: e.target.value })} style={campo} autoFocus={!p.titulo} />
            </div>
          </div>
          <div>
            <label style={rotulo}>Ajuda (opcional)</label>
            <textarea value={p.ajuda} maxLength={1000} rows={2} onChange={(e) => set({ ajuda: e.target.value })} style={{ ...campo, resize: 'vertical' }}
              placeholder="Dica curta para quem executa" />
          </div>

          {p.tipo === 'foto' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <Num rot="Mínimo de fotos" v={p.config.min_fotos ?? 1} on={(v) => setCfg({ min_fotos: v })} />
              <Num rot="Máximo" v={p.config.max_fotos ?? 5} on={(v) => setCfg({ max_fotos: v })} />
            </div>
          )}
          {p.tipo === 'numero' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div><label style={rotulo}>Unidade</label><input value={p.config.unidade || ''} maxLength={20} onChange={(e) => setCfg({ unidade: e.target.value })} style={{ ...campo, width: 110 }} placeholder="psi, h, °C" /></div>
              <div><label style={rotulo}>Mínimo</label><input value={p.config.min ?? ''} onChange={(e) => setCfg({ min: num(e.target.value) })} style={{ ...campo, width: 110 }} inputMode="decimal" /></div>
              <div><label style={rotulo}>Máximo</label><input value={p.config.max ?? ''} onChange={(e) => setCfg({ max: num(e.target.value) })} style={{ ...campo, width: 110 }} inputMode="decimal" /></div>
              <p style={{ alignSelf: 'flex-end', margin: '0 0 8px', fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Fora da faixa grava e avisa quem pediu.</p>
            </div>
          )}
          {p.tipo === 'selecao' && (
            <div>
              <label style={rotulo}>Opções (uma por linha)</label>
              <textarea rows={3} value={(p.config.opcoes || []).join('\n')} onChange={(e) => setCfg({ opcoes: e.target.value.split('\n') })} style={{ ...campo, resize: 'vertical' }} />
            </div>
          )}
          {p.tipo === 'assinatura' && (
            <div>
              <label style={rotulo}>Quem assina</label>
              <select value={p.config.quem || 'executor'} onChange={(e) => setCfg({ quem: e.target.value as 'executor' | 'cliente' })} style={{ ...campo, width: 'auto' }}>
                <option value="executor">Quem executa</option><option value="cliente">O cliente</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {p.tipo !== 'instrucao' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={p.obrigatorio} onChange={(e) => set({ obrigatorio: e.target.checked })} /> Obrigatório
              </label>
            )}
            {p.midia_path ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                {p.midia_url && (p.midia_tipo === 'video' || midiaEhVideo(p.midia_url)
                  ? <video src={p.midia_url} style={{ height: 40, borderRadius: 6 }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={p.midia_url} alt="" style={{ height: 40, borderRadius: 6 }} />)}
                mídia de apoio
                <button onClick={() => set({ midia_path: null, midia_url: null, midia_tipo: null })} style={setinha} aria-label="Tirar mídia"><X size={14} /></button>
              </span>
            ) : (
              <label style={{ ...botaoClaro(), cursor: subindo ? 'wait' : 'pointer' }}>
                <ImagePlus size={14} /> {subindo ? 'Enviando…' : 'Imagem ou vídeo de apoio'}
                <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden disabled={subindo}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarMidia(f); e.target.value = '' }} />
              </label>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={onRemover} style={{ ...botaoClaro(), color: '#dc2626' }}><Trash2 size={14} /> Remover passo</button>
          </div>
          {erroMidia && <div style={{ color: '#dc2626', fontSize: 13 }}>{erroMidia}</div>}
        </div>
      )}
    </div>
  )
}

const setinha: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', display: 'flex', padding: 2,
}

function Num({ rot, v, on }: { rot: string; v: number; on: (v: number) => void }) {
  return (
    <div>
      <label style={rotulo}>{rot}</label>
      <input type="number" min={1} max={10} value={v} onChange={(e) => on(Number(e.target.value))} style={{ ...campo, width: 110 }} />
    </div>
  )
}
