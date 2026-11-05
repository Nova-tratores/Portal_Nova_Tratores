'use client'
// Planta da loja por andar com os territórios do Opa (pni_locais). Três usos:
//   ver      → cada lugar com a cor do departamento, gestor no "title" e nº de Opas abertos;
//   escolher → tocar no lugar devolve o local (Novo Opa);
//   editar   → admin arrasta/redimensiona lugares e blocos (áreas/paredes do andar).
// Coordenadas em % da planta (igual ao mapa do Pátio). Regras em lib/opa/mapa.ts.

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { andaresOrdenados, andarVizinho, corDoDepartamento, redimensionar, type Andar, type Bloco, type OpaNoMapa, type PosicaoLocal, type Puxador, type Retangulo } from '@/lib/opa/mapa'
import { destinoDoLocal, type Departamento, type LigacaoLocal } from '@/lib/opa/departamentos'
import { nomeLocalCompleto } from '@/lib/opa-pecas/regras'
import type { Local } from '@/lib/opa-pecas/tipos'

export interface DadosMapa {
  andares: Andar[]
  posicoes: PosicaoLocal[]
  locais: Local[]
  departamentos: Departamento[]
  ligacoes: LigacaoLocal[]
  opas: OpaNoMapa[]
  podeEditar: boolean
}

export type CamadaEdicao = 'lugares' | 'blocos'

interface Arrasto {
  tipo: 'lugar' | 'bloco'
  id: string
  modo: Puxador
  x0: number; y0: number
  original: Retangulo
  moveu: boolean
}

export default function PlantaLoja({
  dados, andarId, onAndar, modo, camada = 'lugares', selecionado, onSelecionar,
  onMoverLugar, onMoverBloco, contagem,
}: {
  dados: DadosMapa
  andarId: string
  onAndar: (id: string) => void
  modo: 'ver' | 'escolher' | 'editar'
  camada?: CamadaEdicao
  selecionado?: string | null
  /** clicou num lugar (ou num bloco, no editar/blocos) */
  onSelecionar?: (tipo: 'lugar' | 'bloco', id: string) => void
  /** fim do arrasto de um lugar (editar) — quem chama grava */
  onMoverLugar?: (localId: string, r: Retangulo) => void
  onMoverBloco?: (blocoId: string, r: Retangulo) => void
  /** Opas abertos por lugar (para o número em cima) */
  contagem?: Record<string, number>
}) {
  const planta = useRef<HTMLDivElement | null>(null)
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [temp, setTemp] = useState<Retangulo | null>(null)   // retângulo durante o arrasto

  const andares = andaresOrdenados(dados.andares)
  const andar = andares.find((a) => a.id === andarId) || andares[0]
  const acima = andar ? andarVizinho(dados.andares, andar.id, 1) : null
  const abaixo = andar ? andarVizinho(dados.andares, andar.id, -1) : null
  const depIds = dados.departamentos.map((d) => d.id)
  const nomes = Object.fromEntries(dados.locais.map((l) => [l.id, l.nome]))
  const lugares = dados.posicoes.filter((p) => p.andar_id === andar?.id)
  const editandoLugares = modo === 'editar' && camada === 'lugares'
  const editandoBlocos = modo === 'editar' && camada === 'blocos'

  const comecar = (e: React.PointerEvent, tipo: Arrasto['tipo'], id: string, m: Arrasto['modo'], original: Retangulo) => {
    if (!(tipo === 'lugar' ? editandoLugares : editandoBlocos)) return
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setArrasto({ tipo, id, modo: m, x0: e.clientX, y0: e.clientY, original, moveu: false })
    setTemp(original)
  }
  const mover = (e: React.PointerEvent) => {
    if (!arrasto || !planta.current) return
    const r = planta.current.getBoundingClientRect()
    const dx = ((e.clientX - arrasto.x0) / r.width) * 100
    const dy = ((e.clientY - arrasto.y0) / r.height) * 100
    if (Math.abs(dx) + Math.abs(dy) < 0.4 && !arrasto.moveu) return
    setTemp(redimensionar(arrasto.original, arrasto.modo, dx, dy))
    if (!arrasto.moveu) setArrasto({ ...arrasto, moveu: true })
  }
  const soltar = () => {
    if (!arrasto) return
    const a = arrasto, r = temp
    setArrasto(null); setTemp(null)
    if (!a.moveu || !r) { onSelecionar?.(a.tipo, a.id); return }   // clique sem arrastar = selecionar
    if (a.tipo === 'lugar') onMoverLugar?.(a.id, r)
    else onMoverBloco?.(a.id, r)
  }
  const ret = (tipo: Arrasto['tipo'], id: string, r: Retangulo) => (arrasto && temp && arrasto.tipo === tipo && arrasto.id === id ? temp : r)
  const pos = (r: Retangulo): React.CSSProperties => ({ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` })

  if (!andar) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)' }}>Nenhum andar no mapa.</div>

  const terreo = andar.ordem === andares[0]?.ordem
  const rua: React.CSSProperties = { position: 'absolute', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)', fontSize: 9, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: terreo ? 1 : 0.45, pointerEvents: 'none' }

  return (
    <div>
      {/* andares: subir / descer + atalhos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <Layers size={16} color="var(--portal-text-muted)" />
        {andares.map((a) => {
          const ativo = a.id === andar.id
          const n = dados.posicoes.filter((p) => p.andar_id === a.id).reduce((s, p) => s + (contagem?.[p.local_id] || 0), 0)
          return (
            <button key={a.id} type="button" onClick={() => onAndar(a.id)} aria-pressed={ativo} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontFamily: 'inherit',
              fontSize: 13, fontWeight: 800, cursor: 'pointer', border: `1.5px solid ${ativo ? '#dc2626' : 'var(--portal-border)'}`,
              background: ativo ? '#FEF2F2' : 'var(--portal-bg-card)', color: ativo ? '#991B1B' : 'var(--portal-text-secondary)',
            }}>
              {a.nome}
              {n > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#dc2626', color: '#fefefe', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{n}</span>}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button type="button" disabled={!abaixo} onClick={() => abaixo && onAndar(abaixo.id)} title={abaixo ? `Descer para ${abaixo.nome}` : 'Já está no andar de baixo'}
          style={botaoAndar(!abaixo)}><ChevronDown size={16} /> Descer</button>
        <button type="button" disabled={!acima} onClick={() => acima && onAndar(acima.id)} title={acima ? `Subir para ${acima.nome}` : 'Não tem andar acima'}
          style={botaoAndar(!acima)}><ChevronUp size={16} /> Subir</button>
      </div>

      <div ref={planta} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => { setArrasto(null); setTemp(null) }}
        style={{ position: 'relative', width: '100%', paddingBottom: '80%', borderRadius: 10, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', touchAction: modo === 'editar' ? 'none' : 'auto', userSelect: 'none' }}>
        {/* as ruas em volta (mesma planta do Pátio); nos andares de cima ficam apagadas */}
        <div style={{ ...rua, top: 0, left: 0, right: 0, height: '2.5%' }}>R. Hermes Corrêa de Carvalho</div>
        <div style={{ ...rua, top: '2.5%', left: 0, bottom: 0, width: '2%', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8 }}>Av. São Sebastião (SP-287)</div>
        <div style={{ ...rua, top: '2.5%', right: 0, bottom: 0, width: '2%', writingMode: 'vertical-rl', fontSize: 8 }}>R. Edgar Martinelli</div>

        {/* blocos do andar (áreas/paredes) */}
        {andar.blocos.map((b: Bloco) => {
          const r = ret('bloco', b.id, b)
          const sel = editandoBlocos && selecionado === b.id
          return (
            <div key={b.id} onPointerDown={(e) => comecar(e, 'bloco', b.id, 'mover', b)}
              style={{ ...pos(r), borderRadius: 6, border: `2px ${sel ? 'solid' : 'dashed'} ${sel ? '#dc2626' : 'var(--portal-border)'}`,
                background: 'color-mix(in srgb, var(--portal-text-muted) 7%, transparent)', cursor: editandoBlocos ? 'move' : 'default',
                zIndex: editandoBlocos ? (sel ? 4 : 3) : 1, pointerEvents: editandoBlocos ? 'auto' : 'none' }}>
              <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--portal-text-muted)' }}>{b.nome}</span>
              {editandoBlocos && <Alcas lados={sel} onPuxar={(e, px) => comecar(e, 'bloco', b.id, px, b)} />}
            </div>
          )
        })}

        {/* lugares do andar */}
        {lugares.map((p) => {
          const r = ret('lugar', p.local_id, p)
          const destino = destinoDoLocal(p.local_id, dados.ligacoes, dados.departamentos)
          const cor = corDoDepartamento(destino.departamento?.id, depIds)
          const n = contagem?.[p.local_id] || 0
          const sel = selecionado === p.local_id && !editandoBlocos
          const clicavel = modo !== 'editar' || editandoLugares
          const nome = nomeLocalCompleto(p.local_id, nomes[p.local_id])
          return (
            <div key={p.local_id}
              onPointerDown={(e) => { if (editandoLugares) comecar(e, 'lugar', p.local_id, 'mover', p) }}
              onClick={() => { if (!editandoLugares && clicavel) onSelecionar?.('lugar', p.local_id) }}
              title={`${nome}\n${destino.departamento ? `Departamento: ${destino.departamento.nome}` : 'Sem departamento'}\n${destino.gestorNome ? `Gestor: ${destino.gestorNome}` : 'Sem gestor configurado'}${n ? `\n${n} Opa(s) aberto(s)` : ''}`}
              style={{ ...pos(r), borderRadius: 8, border: `${sel ? 3 : 2}px solid ${cor}`, background: `color-mix(in srgb, ${cor} ${sel ? 30 : 16}%, transparent)`,
                cursor: editandoLugares ? 'move' : clicavel ? 'pointer' : 'default', zIndex: sel ? 7 : 5, opacity: editandoBlocos ? 0.35 : 1,
                pointerEvents: editandoBlocos ? 'none' : 'auto', boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${cor} 25%, transparent)` : 'none',
                // editando: deixa as alças das bordas aparecerem por fora da caixa
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 2, overflow: editandoLugares ? 'visible' : 'hidden' }}>
              <span style={{ fontSize: 'clamp(9px, 1.15vw, 12.5px)', fontWeight: 800, color: 'var(--portal-text)', textAlign: 'center', lineHeight: 1.15 }}>{nome}</span>
              {destino.gestorNome && <span style={{ fontSize: 'clamp(8px, 0.95vw, 11px)', color: 'var(--portal-text-secondary)', textAlign: 'center', lineHeight: 1.1 }}>{destino.gestorNome.split(' ').slice(0, 2).join(' ')}</span>}
              {n > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px', background: '#dc2626', color: '#fefefe', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{n}</span>
              )}
              {editandoLugares && <Alcas lados={sel} onPuxar={(e, px) => comecar(e, 'lugar', p.local_id, px, p)} />}
            </div>
          )
        })}

        {lugares.length === 0 && andar.blocos.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', fontSize: 14, padding: 20, textAlign: 'center', pointerEvents: 'none' }}>
            {modo === 'editar' ? 'Planta vazia: inclua os blocos (áreas) deste andar e depois ponha os lugares.' : 'Nada desenhado neste andar ainda.'}
          </div>
        )}
      </div>
    </div>
  )
}

/** Puxadores do tamanho: o canto sempre; os 4 lados quando o item está selecionado
 *  (puxar o lado direito do Showroom muda só a largura). */
function Alcas({ lados, onPuxar }: { lados: boolean; onPuxar: (e: React.PointerEvent, p: Puxador) => void }) {
  const base: React.CSSProperties = { position: 'absolute', background: '#dc2626', border: '2px solid #fefefe', zIndex: 10, touchAction: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }
  const lado = (p: Exclude<Puxador, 'mover' | 'se'>, estilo: React.CSSProperties, cursor: string, dica: string) => (
    <div key={p} onPointerDown={(e) => onPuxar(e, p)} title={dica} style={{ ...base, borderRadius: 6, cursor, ...estilo }} />
  )
  return (
    <>
      <div onPointerDown={(e) => onPuxar(e, 'se')} title="Arraste para mudar largura e altura"
        style={{ ...base, right: -2, bottom: -2, width: 16, height: 16, borderRadius: 4, cursor: 'nwse-resize' }} />
      {lados && [
        lado('l', { right: -6, top: '50%', width: 12, height: 34, marginTop: -17 }, 'ew-resize', 'Arraste para mudar a largura (lado direito)'),
        lado('o', { left: -6, top: '50%', width: 12, height: 34, marginTop: -17 }, 'ew-resize', 'Arraste para mudar a largura (lado esquerdo)'),
        lado('n', { top: -6, left: '50%', width: 34, height: 12, marginLeft: -17 }, 'ns-resize', 'Arraste para mudar a altura (lado de cima)'),
        lado('s', { bottom: -6, left: '50%', width: 34, height: 12, marginLeft: -17 }, 'ns-resize', 'Arraste para mudar a altura (lado de baixo)'),
      ]}
    </>
  )
}

const botaoAndar = (desab: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)',
  cursor: desab ? 'default' : 'pointer', opacity: desab ? 0.4 : 1,
})
