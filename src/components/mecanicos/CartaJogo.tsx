'use client'
// "Detalhes" do técnico como CARTA DE JOGO (José, 16/10/2026): abre no centro da tela, com nota
// geral, raridade pela nota, atributos (0–99), brilho holográfico seguindo o mouse e verso com os
// detalhes. ‹ › (ou as setas do teclado) passam para o próximo técnico; espaço/clique vira a carta.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LinhaTecnico } from '@/lib/mecanicos/painel'
import { brl, horas, kmFmt, useContador } from './ui'

export interface DadosCarta {
  l: LinhaTecnico
  gasto: { abastecimento: number; manutencao: number; alimentacao: number; materiais: number; total: number; litros: number }
  /** salário + comissão + encargos (+ rescisão) no período */
  salario: number
  comissao: number
  /** a comissão ainda é previsão (o RH não lançou o mês) */
  comissaoPrevista?: boolean
  pontos?: number
  parado: number
  clientes: [string, number][]
  maxBruto: number
}

/** Atributos de 0 a 99 e a nota geral (média ponderada). */
export function atributos(d: DadosCarta) {
  const { l } = d
  const custo = d.salario + d.gasto.total + l.custo
  const porReal = custo > 0 ? (l.bruto - custo) / custo : 0
  const c = (v: number) => Math.max(0, Math.min(99, Math.round(v)))
  const at = {
    PRO: c(l.meta ? ((l.faturadas + l.aguardando + l.internas) / l.meta) * 100 : 0),
    FAT: c((l.bruto / Math.max(1, d.maxBruto)) * 99),
    RET: c(porReal < 0 ? 50 + porReal * 50 : 50 + Math.min(49, porReal * 16)),
    ECO: c(l.bruto > 0 ? 99 - (d.gasto.total / l.bruto) * 300 : 0),
    DIS: c(d.pontos ?? 99),
  }
  const geral = c(at.PRO * 0.25 + at.FAT * 0.25 + at.RET * 0.2 + at.ECO * 0.1 + at.DIS * 0.2)
  return { at, geral, custo, porReal, resultado: l.bruto - custo }
}

const RARIDADE = (g: number) => g >= 80 ? { nome: 'Lendário', cor: '#f59e0b', fundo: 'linear-gradient(160deg, #fef3c7, #fde68a 40%, #f59e0b)' }
  : g >= 60 ? { nome: 'Épico', cor: '#7c3aed', fundo: 'linear-gradient(160deg, #ede9fe, #c4b5fd 45%, #7c3aed)' }
    : g >= 40 ? { nome: 'Raro', cor: '#0369a1', fundo: 'linear-gradient(160deg, #e0f2fe, #7dd3fc 45%, #0369a1)' }
      : { nome: 'Comum', cor: '#64748b', fundo: 'linear-gradient(160deg, #f1f5f9, #cbd5e1 45%, #64748b)' }
const NOME_AT: Record<string, string> = { PRO: 'Produção', FAT: 'Faturamento', RET: 'Retorno', ECO: 'Economia', DIS: 'Disciplina' }
const DICA_AT: Record<string, string> = {
  PRO: '% da meta de horas (faturadas + aguardando faturar + internas)', FAT: 'faturado comparado ao que mais faturou no período',
  RET: 'lucro para cada R$ 1 que ele custa (50 = empata)', ECO: 'quanto gasta (carro, alimentação) perto do que fatura', DIS: 'pontos de ocorrência do mês',
}
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

function Barra({ v, cor, atraso }: { v: number; cor: string; atraso: number }) {
  const x = useContador(v, 1100)
  return <span className="cj-barra"><i style={{ width: `${x}%`, background: cor, transitionDelay: `${atraso}ms` }} /></span>
}

export default function CartaJogo({ lista, inicio, onFechar }: { lista: DadosCarta[]; inicio: number; onFechar: () => void }) {
  const [i, setI] = useState(inicio)
  const [virada, setVirada] = useState(false)
  const [dir, setDir] = useState<1 | -1>(1)
  const carta = useRef<HTMLDivElement>(null)
  const ir = (n: number) => { setDir(n > 0 ? 1 : -1); setVirada(false); setI((x) => (x + n + lista.length) % lista.length) }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      else if (e.key === 'ArrowRight') ir(1)
      else if (e.key === 'ArrowLeft') ir(-1)
      else if (e.key === ' ') { e.preventDefault(); setVirada((v) => !v) }
    }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  })
  const d = lista[i]
  if (!d || typeof document === 'undefined') return null
  const { at, geral, custo, porReal, resultado } = atributos(d)
  const rar = RARIDADE(geral)
  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    const el = carta.current; if (!el) return
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`); el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--hx', `${x * 100}%`); el.style.setProperty('--hy', `${y * 100}%`)
  }
  const soltar = () => { const el = carta.current; if (!el) return; el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg') }
  return createPortal(
    <div className="cj-fundo" onClick={onFechar}>
      <style>{ESTILO}</style>
      <button type="button" className="cj-nav cj-esq" onClick={(e) => { e.stopPropagation(); ir(-1) }} aria-label="Anterior"><i className="fas fa-chevron-left" /></button>
      <div className="cj-palco" onClick={(e) => e.stopPropagation()} onMouseMove={mover} onMouseLeave={soltar}>
        <div key={i} className={`cj-entra ${dir < 0 ? 'cj-entra-esq' : ''}`}>
          <div ref={carta} className={`cj ${virada ? 'cj-virada' : ''}`} onClick={() => setVirada((v) => !v)} style={{ ['--cor' as string]: rar.cor }}>
            {/* frente */}
            <div className="cj-face cj-frente" style={{ background: rar.fundo }}>
              <div className="cj-holo" />
              <div className="cj-topo">
                <div className="cj-geral"><b>{geral}</b><small>geral</small></div>
                <span className="cj-rar">{rar.nome}</span>
              </div>
              <div className="cj-av">{iniciais(d.l.tecnico)}</div>
              <div className="cj-nome">{d.l.tecnico}</div>
              <div className="cj-papel">Técnico de campo · {horas(d.l.faturadas)} faturadas</div>
              <div className="cj-ats">
                {Object.entries(at).map(([k, v], n) => (
                  <div key={k} className="cj-at" title={DICA_AT[k]}>
                    <span>{NOME_AT[k]}</span>
                    <Barra v={v} cor={v >= 70 ? '#059669' : v >= 45 ? '#d97706' : '#dc2626'} atraso={n * 90} />
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <div className="cj-nums">
                <span><small>Faturou</small><b>{brl(d.l.bruto)}</b></span>
                <span><small>Custou</small><b>{brl(custo)}</b></span>
                <span><small>{resultado >= 0 ? 'Sobrou' : 'Faltou'}</small><b style={{ color: resultado >= 0 ? '#047857' : '#b91c1c' }}>{brl(resultado)}</b></span>
              </div>
              <div className="cj-rodape">{porReal >= 0 ? `+R$ ${porReal.toFixed(2).replace('.', ',')} de lucro por R$ 1 que custa` : `−R$ ${Math.abs(porReal).toFixed(2).replace('.', ',')} por R$ 1 — não se pagou`}{d.parado > 0 ? ` · ${brl(d.parado)} parado` : ''}</div>
              <div className="cj-dica-virar"><i className="fas fa-rotate" /> clique para virar</div>
            </div>
            {/* verso */}
            <div className="cj-face cj-verso">
              <div className="cj-v-cab"><b>{d.l.tecnico}</b><span>detalhes do período</span></div>
              <div className="cj-v-bloco">
                <small>De onde veio</small>
                <div><span>Mão de obra ({horas(d.l.faturadas)})</span><b>{brl(d.l.servico)}</b></div>
                <div><span>Deslocamento ({kmFmt(d.l.km)})</span><b>{brl(d.l.kmValor)}</b></div>
                <div><span>Peças</span><b>{brl(d.l.pecas)}</b></div>
                <div className="cj-tot"><span>Total faturado · {Math.round(d.l.os)} OS</span><b>{brl(d.l.bruto)}</b></div>
              </div>
              <div className="cj-v-bloco">
                <small>Para onde foi</small>
                <div><span>Salário + encargos</span><b>{brl(d.salario - d.comissao)}</b></div>
                {d.comissao > 0 && <div><span>{d.comissaoPrevista ? 'Comissão PREVISTA + encargos' : 'Comissão + encargos'}</span><b>{brl(d.comissao)}</b></div>}
                <div><span>Abastecimento{d.gasto.litros ? ` (${Math.round(d.gasto.litros)} L)` : ''}</span><b>{brl(d.gasto.abastecimento)}</b></div>
                <div><span>Manutenção do carro</span><b>{brl(d.gasto.manutencao)}</b></div>
                <div><span>Alimentação</span><b>{brl(d.gasto.alimentacao)}</b></div>
                {d.gasto.materiais > 0 && <div><span>Materiais da oficina</span><b>{brl(d.gasto.materiais)}</b></div>}
                <div><span>Terceiros</span><b>{brl(d.l.custo)}</b></div>
              </div>
              <div className="cj-v-bloco">
                <small>Principais clientes</small>
                {d.clientes.length ? d.clientes.map(([c, v]) => <div key={c}><span className="cj-cli">{c}</span><b>{brl(v)}</b></div>) : <div><span>nenhuma OS faturada</span></div>}
              </div>
              <div className="cj-v-bloco">
                <small>Horas</small>
                <div><span>Faturadas · internas · paradas</span><b>{horas(d.l.faturadas)} · {horas(d.l.internas)} · {horas(d.l.ociosas)}</b></div>
                {d.pontos != null && <div><span>Pontos de ocorrência no mês</span><b>{d.pontos}</b></div>}
              </div>
              <div className="cj-dica-virar" style={{ color: 'var(--portal-text-muted, #94a3b8)' }}><i className="fas fa-rotate" /> clique para voltar</div>
            </div>
          </div>
        </div>
        <div className="cj-pos">{lista.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => { setDir(k > i ? 1 : -1); setVirada(false); setI(k) }} />)}</div>
        <div className="cj-teclas">← → troca o técnico · espaço vira · Esc fecha</div>
      </div>
      <button type="button" className="cj-nav cj-dir" onClick={(e) => { e.stopPropagation(); ir(1) }} aria-label="Próximo"><i className="fas fa-chevron-right" /></button>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

const ESTILO = `
.cj-fundo { position: fixed; inset: 0; z-index: 100065; background: radial-gradient(circle at 50% 40%, rgba(15,23,42,.55), rgba(2,6,23,.85)); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; gap: 24px; animation: cjFade .25s ease both }
@keyframes cjFade { from { opacity: 0 } }
.cj-palco { perspective: 1400px; display: flex; flex-direction: column; align-items: center; gap: 14px }
.cj-entra { animation: cjVoa .6s cubic-bezier(.2,1.1,.3,1) both }
.cj-entra-esq { animation-name: cjVoaEsq }
@keyframes cjVoa { from { opacity: 0; transform: translateX(120px) rotateY(-50deg) scale(.8) } to { opacity: 1; transform: none } }
@keyframes cjVoaEsq { from { opacity: 0; transform: translateX(-120px) rotateY(50deg) scale(.8) } to { opacity: 1; transform: none } }
.cj { --rx: 0deg; --ry: 0deg; --hx: 50%; --hy: 50%; position: relative; width: 360px; height: 560px; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .5s cubic-bezier(.2,.8,.2,1); cursor: pointer }
.cj-palco:hover .cj { transition: transform .08s linear }
.cj.cj-virada { transform: rotateY(180deg) }
.cj-face { position: absolute; inset: 0; border-radius: 24px; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; box-shadow: 0 0 0 4px var(--cor), 0 0 0 8px rgba(255,255,255,.85), 0 30px 80px rgba(0,0,0,.5), 0 0 60px var(--cor) }
.cj-frente { display: flex; flex-direction: column; align-items: center; padding: 18px 20px; color: #0f172a }
.cj-holo { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color-dodge; opacity: .55; background: radial-gradient(circle at var(--hx) var(--hy), rgba(255,255,255,.9), transparent 35%), conic-gradient(from 0deg at var(--hx) var(--hy), rgba(255,0,128,.25), rgba(0,200,255,.25), rgba(140,255,0,.25), rgba(255,200,0,.25), rgba(255,0,128,.25)) }
.cj-topo { width: 100%; display: flex; justify-content: space-between; align-items: flex-start; position: relative }
.cj-geral { display: flex; flex-direction: column; align-items: center; line-height: 1; background: rgba(255,255,255,.75); border-radius: 14px; padding: 6px 10px; box-shadow: 0 4px 12px rgba(0,0,0,.15) }
.cj-geral b { font-size: 40px; font-weight: 900 } .cj-geral small { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px }
.cj-rar { background: #0f172a; color: #fefefe; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; border-radius: 99px; padding: 5px 12px }
.cj-av { width: 110px; height: 110px; border-radius: 50%; margin-top: -6px; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 900; color: #fefefe; background: radial-gradient(circle at 30% 30%, #334155, #0f172a); border: 5px solid rgba(255,255,255,.9); box-shadow: 0 10px 30px rgba(0,0,0,.35); position: relative }
.cj-nome { margin-top: 10px; font-size: 24px; font-weight: 900; text-align: center; position: relative }
.cj-papel { font-size: 12.5px; font-weight: 700; opacity: .75; position: relative }
.cj-ats { width: 100%; margin-top: 14px; display: grid; gap: 7px; background: rgba(255,255,255,.82); border-radius: 16px; padding: 10px 12px; position: relative }
.cj-at { display: grid; grid-template-columns: 86px 1fr 26px; gap: 8px; align-items: center; font-size: 12.5px; font-weight: 800 }
.cj-at b { text-align: right; font-size: 15px; font-variant-numeric: tabular-nums }
.cj-barra { height: 9px; background: #e2e8f0; border-radius: 99px; overflow: hidden }
.cj-barra i { display: block; height: 100%; border-radius: 99px }
.cj-nums { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; position: relative }
.cj-nums span { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,.82); border-radius: 12px; padding: 6px 4px }
.cj-nums small { font-size: 10.5px; font-weight: 900; text-transform: uppercase; opacity: .7 } .cj-nums b { font-size: 14.5px; font-variant-numeric: tabular-nums }
.cj-rodape { margin-top: 8px; font-size: 12px; font-weight: 800; text-align: center; position: relative }
.cj-dica-virar { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 800; opacity: .6 }
.cj-verso { transform: rotateY(180deg); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); padding: 18px 20px; display: grid; gap: 10px; align-content: start; font-size: 13px }
.cj-v-cab b { display: block; font-size: 19px; font-weight: 900 } .cj-v-cab span { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.cj-v-bloco { display: grid; gap: 3px }
.cj-v-bloco small { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; color: var(--cor) }
.cj-v-bloco > div { display: flex; justify-content: space-between; gap: 10px } .cj-v-bloco b { font-variant-numeric: tabular-nums; white-space: nowrap }
.cj-tot { border-top: 1px dashed var(--portal-border, #e2e8f0); padding-top: 3px; font-weight: 800 }
.cj-cli { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cj-nav { width: 52px; height: 52px; border-radius: 50%; border: none; background: rgba(255,255,255,.14); color: #fefefe; font-size: 20px; cursor: pointer; transition: background .15s, transform .15s; flex-shrink: 0 }
.cj-nav:hover { background: rgba(255,255,255,.28); transform: scale(1.08) }
.cj-pos { display: flex; gap: 6px } .cj-pos i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.35); cursor: pointer } .cj-pos i.on { background: #fefefe; width: 22px; border-radius: 99px }
.cj-teclas { font-size: 12px; color: rgba(255,255,255,.65) }
@media (max-width: 600px) { .cj { width: 300px; height: 520px } .cj-nav { position: absolute; bottom: 20px } .cj-esq { left: 20px } .cj-dir { right: 20px } }
`
