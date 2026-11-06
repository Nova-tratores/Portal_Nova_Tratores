'use client'
// Planta da loja por andar com os territórios do Opa (pni_locais). Três usos:
//   ver      → cada lugar com a cor do departamento, gestor no "title" e nº de Opas abertos;
//   escolher → tocar no lugar devolve o local (Novo Opa);
//   editar   → admin arrasta/redimensiona lugares e blocos (áreas, paredes, portas…) e
//              DESENHA novos com a ferramenta escolhida (retângulo, círculo, L, triângulo,
//              personalizada ponto a ponto; parede, porta, janela, corredor, escada).
// Coordenadas em % da planta (igual ao mapa do Pátio). Regras em lib/opa/mapa.ts.

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Layers, Undo2, X } from 'lucide-react'
import {
  andaresOrdenados, andarVizinho, caixaDosPontos, corDoDepartamento, minDoTipo, pontosDaForma, redimensionar, retanguloDoArrasto,
  TIPOS_ESTRUTURA, type Andar, type Bloco, type Forma, type OpaNoMapa, type Ponto, type PosicaoLocal, type Puxador, type Retangulo, type TipoBloco,
} from '@/lib/opa/mapa'
import { destinoDoLocal, type Departamento, type LigacaoLocal } from '@/lib/opa/departamentos'
import { mapaNomesLocais } from '@/lib/opa-pecas/regras'
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


/** O que vai ser desenhado ao arrastar na planta: um lugar (sala) com forma, uma área ou uma estrutura. */
export type Ferramenta =
  | { tipo: 'lugar' | 'area'; forma: Forma | 'quadrado' }
  | { tipo: 'estrutura'; estrutura: Exclude<TipoBloco, 'area'> }

/** O que saiu do desenho: a caixa, a forma (e os pontos, na personalizada) e onde começou. */
export interface Desenho { ret: Retangulo; forma: Forma; pontos: Ponto[] | null; cx: number; cy: number }

interface Arrasto {
  tipo: 'lugar' | 'bloco'
  /** área ainda não selecionada: o 1º toque só seleciona (não arrasta o Pátio sem querer) */
  travado: boolean
  id: string
  modo: Puxador
  x0: number; y0: number
  original: Retangulo
  min: number
  moveu: boolean
}

/** a planta tem 100 de largura por 80 de altura (paddingBottom 80%): quadrado de verdade = h maior em % */
const PROPORCAO = 0.8

export default function PlantaLoja({
  dados, andarId, onAndar, modo, selecionado, onSelecionar,
  onMoverLugar, onMoverBloco, contagem, ferramenta, onDesenhar, onCancelarDesenho, colocando, onColocar, onDesselecionar,
}: {
  dados: DadosMapa
  andarId: string
  onAndar: (id: string) => void
  modo: 'ver' | 'escolher' | 'editar'
  /** o que está selecionado (lugar ou item da planta) */
  selecionado?: { tipo: 'lugar' | 'bloco'; id: string } | null
  /** clicou num lugar ou num item da planta (área, parede…); clicou no vazio = null */
  onSelecionar?: (tipo: 'lugar' | 'bloco', id: string) => void
  onDesselecionar?: () => void
  /** fim do arrasto de um lugar (editar) — quem chama grava */
  onMoverLugar?: (localId: string, r: Retangulo) => void
  onMoverBloco?: (blocoId: string, r: Retangulo) => void
  /** Opas abertos por lugar (para o número em cima) */
  contagem?: Record<string, number>
  /** editar: ferramenta de desenho ativa (arrastar na planta desenha) */
  ferramenta?: Ferramenta | null
  onDesenhar?: (d: Desenho) => void
  onCancelarDesenho?: () => void
  /** editar: lugar fora do mapa esperando o toque na planta (ou arrastado da lista) */
  colocando?: string | null
  onColocar?: (localId: string, x: number, y: number) => void
}) {
  const planta = useRef<HTMLDivElement | null>(null)
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [temp, setTemp] = useState<Retangulo | null>(null)   // retângulo durante o arrasto
  // desenho: arrastando uma caixa nova, ou os pontos da forma personalizada
  const [riscando, setRiscando] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [pontos, setPontos] = useState<Ponto[]>([])

  const desenhando = modo === 'editar' && !!ferramenta
  const livre = desenhando && ferramenta.tipo !== 'estrutura' && ferramenta.forma === 'personalizada'
  // trocou de ferramenta: some o risco pela metade
  const chaveFerramenta = `${ferramenta ? JSON.stringify(ferramenta) : ''}|${andarId}`
  const [chaveAnterior, setChaveAnterior] = useState(chaveFerramenta)
  if (chaveAnterior !== chaveFerramenta) { setChaveAnterior(chaveFerramenta); setPontos([]); setRiscando(null) }
  // Esc cancela o desenho
  useEffect(() => {
    if (!desenhando) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPontos([]); setRiscando(null); onCancelarDesenho?.() } }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [desenhando, onCancelarDesenho])

  const andares = andaresOrdenados(dados.andares)
  const andar = andares.find((a) => a.id === andarId) || andares[0]
  const acima = andar ? andarVizinho(dados.andares, andar.id, 1) : null
  const abaixo = andar ? andarVizinho(dados.andares, andar.id, -1) : null
  const depIds = dados.departamentos.map((d) => d.id)
  const nomes = mapaNomesLocais(dados.locais)
  const lugares = dados.posicoes.filter((p) => p.andar_id === andar?.id)
  // editar sem ferramenta: tudo se pega direto (lugares, áreas e estrutura)
  const editando = modo === 'editar' && !desenhando && !colocando
  const editandoLugares = editando, editandoBlocos = editando
  const eSel = (tipo: 'lugar' | 'bloco', id: string) => selecionado?.tipo === tipo && selecionado.id === id

  /** posição do ponteiro em % da planta */
  const emPct = (e: React.PointerEvent | React.MouseEvent): Ponto | null => {
    if (!planta.current) return null
    const r = planta.current.getBoundingClientRect()
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }
  }

  const comecar = (e: React.PointerEvent, tipo: Arrasto['tipo'], id: string, m: Arrasto['modo'], original: Retangulo, min?: number) => {
    if (!editando) return
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    const area = tipo === 'bloco' && !!andar?.blocos.find((b) => b.id === id && (b.tipo || 'area') === 'area')
    setArrasto({ tipo, id, modo: m, travado: area && m === 'mover' && !eSel(tipo, id), x0: e.clientX, y0: e.clientY, original, min: min ?? minDoTipo(), moveu: false })
    setTemp(original)
  }

  // ── desenho na planta ──
  const padraoFerramenta = (): { w: number; h: number; min: number } => {
    if (!ferramenta) return { w: 14, h: 10, min: 3 }
    if (ferramenta.tipo === 'estrutura') {
      const t = TIPOS_ESTRUTURA.find((x) => x.id === ferramenta.estrutura)!
      return { w: t.w, h: t.h, min: minDoTipo(ferramenta.estrutura) }
    }
    if (ferramenta.forma === 'quadrado' || ferramenta.forma === 'circulo') return { w: 10, h: 10 / PROPORCAO, min: 3 }
    return ferramenta.tipo === 'area' ? { w: 24, h: 20, min: 3 } : { w: 14, h: 10, min: 3 }
  }
  const terminarLivre = (lista = pontos) => {
    const caixa = caixaDosPontos(lista)
    if (!caixa) return
    const c = lista[0]
    setPontos([])
    onDesenhar?.({ ret: caixa.ret, forma: 'personalizada', pontos: caixa.pontos, cx: c.x, cy: c.y })
  }
  const desenhoDown = (e: React.PointerEvent) => {
    if (colocando) { const c = emPct(e); if (c) onColocar?.(colocando, c.x, c.y); return }
    if (!desenhando) { if (modo === 'editar') onDesselecionar?.(); return }
    const p = emPct(e)
    if (!p) return
    e.preventDefault()
    if (livre) {
      // tocou perto do 1º ponto (com 3 ou mais) = fecha a forma
      const primeiro = pontos[0]
      if (primeiro && pontos.length >= 3 && Math.hypot(primeiro.x - p.x, (primeiro.y - p.y) * PROPORCAO) < 2.2) { terminarLivre(); return }
      setPontos((l) => [...l, { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }])
      return
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setRiscando({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const desenhoMove = (e: React.PointerEvent) => {
    if (!riscando) return
    const p = emPct(e)
    if (!p) return
    let { x, y } = p
    // quadrado/círculo: mantém a proporção (vale o lado maior)
    if (ferramenta && ferramenta.tipo !== 'estrutura' && (ferramenta.forma === 'quadrado' || ferramenta.forma === 'circulo')) {
      const dx = x - riscando.x0, dy = (y - riscando.y0) * PROPORCAO
      const lado = Math.max(Math.abs(dx), Math.abs(dy))
      x = riscando.x0 + Math.sign(dx || 1) * lado
      y = riscando.y0 + (Math.sign(dy || 1) * lado) / PROPORCAO
    }
    setRiscando({ ...riscando, x1: x, y1: y })
  }
  const desenhoUp = () => {
    if (!riscando || !ferramenta) return
    const pad = padraoFerramenta()
    const ret = retanguloDoArrasto(riscando.x0, riscando.y0, riscando.x1, riscando.y1, pad, pad.min)
    setRiscando(null)
    const forma: Forma = ferramenta.tipo === 'estrutura' || ferramenta.forma === 'quadrado' ? 'retangulo' : ferramenta.forma
    onDesenhar?.({ ret, forma, pontos: null, cx: riscando.x0, cy: riscando.y0 })
  }

  const mover = (e: React.PointerEvent) => {
    if (riscando) { desenhoMove(e); return }
    if (!arrasto || !planta.current) return
    const r = planta.current.getBoundingClientRect()
    const dx = ((e.clientX - arrasto.x0) / r.width) * 100
    const dy = ((e.clientY - arrasto.y0) / r.height) * 100
    if ((Math.abs(dx) + Math.abs(dy) < 0.4 && !arrasto.moveu) || arrasto.travado) return
    setTemp(redimensionar(arrasto.original, arrasto.modo, dx, dy, arrasto.min))
    if (!arrasto.moveu) setArrasto({ ...arrasto, moveu: true })
  }
  const soltar = () => {
    if (riscando) { desenhoUp(); return }
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
  const areas = andar.blocos.filter((b) => (b.tipo || 'area') === 'area')
  const estruturas = andar.blocos.filter((b) => (b.tipo || 'area') !== 'area')
  const previa = riscando && ferramenta ? (() => {
    const pad = padraoFerramenta()
    return retanguloDoArrasto(riscando.x0, riscando.y0, riscando.x1, riscando.y1, { w: 0.1, h: 0.1 }, Math.min(pad.min, 0.6))
  })() : null
  const formaPrevia: Forma = ferramenta && ferramenta.tipo !== 'estrutura' && ferramenta.forma !== 'quadrado' ? ferramenta.forma : 'retangulo'

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
              fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1.5px solid ${ativo ? '#dc2626' : 'var(--portal-border)'}`,
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

      <div ref={planta} onPointerDown={desenhoDown} onPointerMove={mover} onPointerUp={soltar}
        onDragOver={(e) => { if (modo === 'editar' && e.dataTransfer.types.includes('text/opa-local')) e.preventDefault() }}
        onDrop={(e) => { const id = e.dataTransfer.getData('text/opa-local'); const c = emPct(e); if (id && c) { e.preventDefault(); onColocar?.(id, c.x, c.y) } }}
        onPointerCancel={() => { setArrasto(null); setTemp(null); setRiscando(null) }}
        style={{ position: 'relative', width: '100%', paddingBottom: '80%', borderRadius: 16, overflow: 'hidden', background: 'var(--portal-bg-card)', border: `1px solid ${desenhando || colocando ? '#dc2626' : 'var(--portal-border)'}`, touchAction: modo === 'editar' ? 'none' : 'auto', userSelect: 'none', cursor: desenhando || colocando ? 'crosshair' : 'default' }}>
        {/* as ruas em volta (mesma planta do Pátio); nos andares de cima ficam apagadas */}
        <div style={{ ...rua, top: 0, left: 0, right: 0, height: '2.5%' }}>R. Hermes Corrêa de Carvalho</div>
        <div style={{ ...rua, top: '2.5%', left: 0, bottom: 0, width: '2%', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8 }}>Av. São Sebastião (SP-287)</div>
        <div style={{ ...rua, top: '2.5%', right: 0, bottom: 0, width: '2%', writingMode: 'vertical-rl', fontSize: 8 }}>R. Edgar Martinelli</div>

        {/* áreas do andar (setores: Oficina, Peças…) */}
        {areas.map((b: Bloco) => {
          const r = ret('bloco', b.id, b)
          const sel = editandoBlocos && eSel('bloco', b.id)
          const forma = b.forma || 'retangulo'
          // cor própria da área (escolhida no editar) ou o cinza de sempre
          const corBorda = sel ? '#dc2626' : b.cor ? `color-mix(in srgb, ${b.cor} 55%, transparent)` : 'var(--portal-border)'
          const fundo = b.cor ? `color-mix(in srgb, ${b.cor} 10%, transparent)` : 'color-mix(in srgb, var(--portal-text-muted) 7%, transparent)'
          return (
            <div key={b.id} onPointerDown={(e) => comecar(e, 'bloco', b.id, 'mover', b)}
              style={{ ...pos(r), borderRadius: forma === 'circulo' ? '50%' : 10, border: forma === 'retangulo' || forma === 'circulo' ? `2px ${sel || b.cor ? 'solid' : 'dashed'} ${corBorda}` : 'none',
                background: forma === 'retangulo' || forma === 'circulo' ? fundo : 'transparent', cursor: editandoBlocos ? (sel ? 'move' : 'pointer') : 'default',
                zIndex: sel ? 4 : 1, pointerEvents: editandoBlocos ? 'auto' : 'none' }}>
              {forma !== 'retangulo' && forma !== 'circulo' && (
                <FormaSvg forma={forma} pontos={b.pontos} preenche={fundo} borda={corBorda} tracejada={!sel && !b.cor} />
              )}
              <span style={{ position: 'absolute', top: 5, left: 8, fontSize: 11, fontWeight: 500, color: b.cor || 'var(--portal-text-muted)' }}>{b.nome}</span>
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
          const sel = eSel('lugar', p.local_id)
          const clicavel = !desenhando && (modo !== 'editar' || editandoLugares)
          const nome = nomes[p.local_id] || p.local_id
          const forma = p.forma || 'retangulo'
          const caixa = forma === 'retangulo' || forma === 'circulo'
          return (
            <div key={p.local_id}
              onPointerDown={(e) => { if (editandoLugares) comecar(e, 'lugar', p.local_id, 'mover', p) }}
              onClick={() => { if (!editandoLugares && clicavel) onSelecionar?.('lugar', p.local_id) }}
              title={`${nome}\n${destino.departamento ? `Departamento: ${destino.departamento.nome}` : 'Sem departamento'}\n${destino.gestorNome ? `Gestor: ${destino.gestorNome}` : 'Sem gestor configurado'}${n ? `\n${n} Opa(s) aberto(s)` : ''}`}
              style={{ ...pos(r), borderRadius: forma === 'circulo' ? '50%' : 8, border: caixa ? `${sel ? 3 : 2}px solid ${cor}` : 'none',
                background: caixa ? `color-mix(in srgb, ${cor} ${sel ? 30 : 16}%, transparent)` : 'transparent',
                cursor: editandoLugares ? 'move' : clicavel ? 'pointer' : 'default', zIndex: sel ? 7 : 5, opacity: desenhando || colocando ? 0.45 : 1,
                pointerEvents: desenhando || colocando ? 'none' : 'auto', boxShadow: sel && caixa ? `0 0 0 3px color-mix(in srgb, ${cor} 25%, transparent)` : 'none',
                // editando: deixa as alças das bordas aparecerem por fora da caixa
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 2, overflow: editandoLugares ? 'visible' : 'hidden' }}>
              {!caixa && <FormaSvg forma={forma} pontos={p.pontos} preenche={`color-mix(in srgb, ${cor} ${sel ? 30 : 16}%, transparent)`} borda={cor} espessura={sel ? 3 : 2} />}
              <span style={{ position: 'relative', fontSize: 'clamp(9px, 1.15vw, 12.5px)', fontWeight: 500, color: 'var(--portal-text)', textAlign: 'center', lineHeight: 1.15, marginTop: forma === 'triangulo' ? '30%' : forma === 'L' ? '35%' : 0 }}>{nome}</span>
              {destino.gestorNome && <span style={{ position: 'relative', fontSize: 'clamp(8px, 0.95vw, 11px)', color: 'var(--portal-text-secondary)', textAlign: 'center', lineHeight: 1.1 }}>{destino.gestorNome.split(' ').slice(0, 2).join(' ')}</span>}
              {n > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px', background: '#dc2626', color: '#fefefe', fontSize: 11.5, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{n}</span>
              )}
              {editandoLugares && <Alcas lados={sel} onPuxar={(e, px) => comecar(e, 'lugar', p.local_id, px, p)} />}
            </div>
          )
        })}

        {/* estrutura: paredes, portas, janelas, corredores, escadas (por cima dos lugares) */}
        {estruturas.map((b: Bloco) => {
          const r = ret('bloco', b.id, b)
          const sel = editandoBlocos && eSel('bloco', b.id)
          const min = minDoTipo(b.tipo)
          return (
            <div key={b.id} onPointerDown={(e) => comecar(e, 'bloco', b.id, 'mover', b, min)} title={b.nome}
              style={{ ...pos(r), ...visualEstrutura(b.tipo!, b.cor), outline: sel ? '2px solid #dc2626' : 'none', outlineOffset: 2,
                cursor: editandoBlocos ? 'move' : 'default', zIndex: sel ? 9 : 8, pointerEvents: editandoBlocos ? 'auto' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: editandoBlocos ? 'visible' : 'hidden' }}>
              {(b.tipo === 'corredor' || b.tipo === 'escada') && r.h >= 3 && r.w >= 5 && (
                <span style={{ fontSize: 10.5, fontWeight: 500, color: b.cor || 'var(--portal-text-muted)', background: 'var(--portal-bg-card)', padding: '0 4px', borderRadius: 4 }}>{b.nome}</span>
              )}
              {editandoBlocos && <Alcas lados={sel} onPuxar={(e, px) => comecar(e, 'bloco', b.id, px, b, min)} />}
            </div>
          )
        })}

        {/* prévia do que está sendo desenhado */}
        {previa && ferramenta && (
          <div style={{ ...pos(previa), zIndex: 20, pointerEvents: 'none', ...(ferramenta.tipo === 'estrutura' ? { ...visualEstrutura(ferramenta.estrutura), opacity: 0.8 } : {}) }}>
            {ferramenta.tipo !== 'estrutura' && <FormaSvg forma={formaPrevia} preenche="color-mix(in srgb, #dc2626 14%, transparent)" borda="#dc2626" tracejada />}
          </div>
        )}
        {livre && pontos.length > 0 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: 'none' }}>
            <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(' ')} fill="color-mix(in srgb, #dc2626 12%, transparent)" stroke="#dc2626" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />
          </svg>
        )}
        {livre && pontos.map((p, i) => (
          <span key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: i === 0 ? 16 : 10, height: i === 0 ? 16 : 10, margin: i === 0 ? '-8px 0 0 -8px' : '-5px 0 0 -5px', borderRadius: '50%', background: i === 0 ? '#fefefe' : '#dc2626', border: '2px solid #dc2626', zIndex: 21, pointerEvents: 'none' }} />
        ))}

        {lugares.length === 0 && andar.blocos.length === 0 && !desenhando && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)', fontSize: 14, padding: 20, textAlign: 'center', pointerEvents: 'none' }}>
            {modo === 'editar' ? 'Planta vazia: desenhe as áreas deste andar e depois os lugares.' : 'Nada desenhado neste andar ainda.'}
          </div>
        )}
      </div>

      {/* forma personalizada: fechar / desfazer ponto */}
      {livre && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: 'var(--portal-text-secondary)' }}>
          <span style={{ flex: 1, minWidth: 180 }}>
            {pontos.length === 0 ? 'Toque nos cantos da sala, um por um.' : pontos.length < 3 ? `${pontos.length} ponto(s): faltam ${3 - pontos.length} pelo menos.` : `${pontos.length} pontos. Toque no 1º ponto (branco) ou em Fechar.`}
          </span>
          <button type="button" disabled={pontos.length === 0} onClick={() => setPontos((l) => l.slice(0, -1))} style={botaoAndar(pontos.length === 0)}><Undo2 size={15} /> Desfazer ponto</button>
          <button type="button" disabled={pontos.length < 3} onClick={() => terminarLivre()} style={{ ...botaoAndar(pontos.length < 3), background: pontos.length >= 3 ? '#dc2626' : 'var(--portal-bg-card)', color: pontos.length >= 3 ? '#fefefe' : 'var(--portal-text-secondary)', border: 'none' }}><Check size={15} /> Fechar forma</button>
          <button type="button" onClick={() => { setPontos([]); onCancelarDesenho?.() }} style={botaoAndar(false)}><X size={15} /> Cancelar</button>
        </div>
      )}
    </div>
  )
}

/** Forma desenhada em SVG dentro da caixa (a caixa estica, o traço não). */
function FormaSvg({ forma, pontos, preenche, borda, espessura = 2, tracejada }: {
  forma: Forma; pontos?: Ponto[] | null; preenche: string; borda: string; espessura?: number; tracejada?: boolean
}) {
  const traco = { fill: preenche, stroke: borda, strokeWidth: espessura, vectorEffect: 'non-scaling-stroke' as const, strokeDasharray: tracejada ? '6 4' : undefined, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      {forma === 'circulo' ? <ellipse cx={50} cy={50} rx={50} ry={50} {...traco} /> : <polygon points={pontosDaForma(forma, pontos)} {...traco} />}
    </svg>
  )
}

/** Visual de cada estrutura (cores fixas que funcionam nos dois temas). */
function visualEstrutura(tipo: TipoBloco, cor?: string | null): React.CSSProperties {
  const c = cor || 'var(--portal-text-muted)'
  switch (tipo) {
    case 'parede': return { background: cor || '#475569', borderRadius: 2 }
    case 'porta': return { background: cor || '#D97706', borderRadius: 3, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${cor || '#D97706'} 60%, #000)` }
    case 'janela': return { background: `repeating-linear-gradient(90deg, color-mix(in srgb, ${cor || '#0EA5E9'} 45%, #fefefe) 0 6px, ${cor || '#0EA5E9'} 6px 8px)`, borderRadius: 2 }
    case 'corredor': return { background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${c} 14%, transparent) 0 6px, transparent 6px 12px)`, border: `1.5px dashed color-mix(in srgb, ${c} 60%, transparent)`, borderRadius: 4 }
    case 'escada': return { background: `repeating-linear-gradient(0deg, color-mix(in srgb, ${c} 55%, transparent) 0 2px, transparent 2px 9px)`, border: `1.5px solid color-mix(in srgb, ${c} 70%, transparent)`, borderRadius: 3 }
    default: return {}
  }
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
        style={{ ...base, right: -8, bottom: -8, width: 16, height: 16, borderRadius: 4, cursor: 'nwse-resize' }} />
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
