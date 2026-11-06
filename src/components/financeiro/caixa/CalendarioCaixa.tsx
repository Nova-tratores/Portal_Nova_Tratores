'use client'
// Calendário do Caixa (José, 05/11/2026 — escolhido entre 8 visuais: "um dia por vez"): o dia escolhido fica no
// centro de uma faixa que desliza (passados à esquerda, futuros à direita), com dois números grandes — A receber e
// A pagar — e as contas do dia em duas colunas. Mesma rota do Calendário do DRE (/api/dre-financeiro/titulos?de&ate);
// os valores são o que está EM ABERTO (conta paga aparece apagada na lista).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmpresaFinanceiro } from '../empresaFinanceiro'
import { COR, ESTILO_CAIXA, MESES, brl, brlCurto, empresa, hojeISO, nomeDe, pegarDre, type Conta } from './comum'

interface Titulo {
  tipo: 'pagar' | 'receber'; codigo_lancamento: number; conta_omie: string; numero_documento_fiscal: string | null
  data_vencimento: string; valor_documento: number; valor_pago: number; status_derivado: string; descricao_categoria: string | null; nome_contraparte: string | null
}

// ─── datas ────────────────────────────────────────────────────────────────────────────────────────
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const SEM_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const diaSem = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()
const diaMes = (iso: string) => `${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1].toLowerCase()}`
function nomeDia(iso: string, hoje: string) {
  if (iso === hoje) return 'Hoje'
  if (iso === somaDias(hoje, 1)) return 'Amanhã'
  if (iso === somaDias(hoje, -1)) return 'Ontem'
  const s = SEMANA[diaSem(iso)]
  return s[0].toUpperCase() + s.slice(1)
}

// ─── dados ────────────────────────────────────────────────────────────────────────────────────────
const aberto = (t: Titulo) => (t.status_derivado === 'LIQUIDADO' ? 0 : Math.max(0, t.valor_documento - t.valor_pago))
function somar(itens: Titulo[]) {
  let receber = 0, pagar = 0, n = 0
  for (const t of itens) { const v = aberto(t); if (!v) continue; n++; if (t.tipo === 'receber') receber += v; else pagar += v }
  return { receber, pagar, n }
}

// ─── tela ─────────────────────────────────────────────────────────────────────────────────────────
export default function CalendarioCaixa() {
  const hoje = useMemo(() => hojeISO(), [])
  // a empresa vem do topo do Financeiro (06/11/2026: sem 'Todas')
  const [conta] = useEmpresaFinanceiro()
  return (
    <div className="cx">
      <style>{ESTILO_CAIXA + ESTILO}</style>
      <DiaPorDia hoje={hoje} conta={conta} />
    </div>
  )
}

interface Props { hoje: string; conta: Conta }

function Barra({ esquerda }: { esquerda: React.ReactNode }) {
  return (
    <section className="cx-card cx-topo">
      <div className="cx-grupo">{esquerda}</div>
    </section>
  )
}

function Carregando({ erro }: { erro: string }) {
  return erro ? <div className="cx-card cx-erro">{erro}</div> : <div className="cx-card cx-vazio">Carregando…</div>
}

// ─── faixa de dias ───────────────────────────────────────────────────────────────────────────
// Faixa que desliza (José, 05/11/2026): o dia escolhido fica no CENTRO e em destaque; à esquerda os que
// passaram, à direita os que vêm; quanto mais longe do centro, mais apagado. Começa em hoje.
const BLOCO = 14 // as contas vêm em blocos de 14 dias e ficam guardadas: andar pela faixa não pisca "Carregando"
const numDia = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 864e5)
const isoDoNum = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10)
const blocoDe = (iso: string) => Math.floor(numDia(iso) / BLOCO)
const ANTES = 90, DEPOIS = 180 // até onde a faixa vai a partir de hoje

function useBlocos(conta: Conta, dia: string) {
  const [blocos, setBlocos] = useState<Record<string, Titulo[]>>({})
  const [erro, setErro] = useState('')
  const pedidos = useRef(new Set<string>())
  useEffect(() => {
    const precisa = new Set([blocoDe(somaDias(dia, -6)), blocoDe(dia), blocoDe(somaDias(dia, 6))])
    for (const b of precisa) {
      const chave = `${conta}|${b}`
      if (pedidos.current.has(chave)) continue
      pedidos.current.add(chave)
      pegarDre<{ titulos: Titulo[] }>(`/api/dre-financeiro/titulos?de=${isoDoNum(b * BLOCO)}&ate=${isoDoNum(b * BLOCO + BLOCO - 1)}&tipo=ambos&conta=${conta}`)
        .then((j) => setBlocos((x) => ({ ...x, [chave]: j.titulos })))
        .catch((e) => { pedidos.current.delete(chave); setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    }
  }, [conta, dia])
  /** contas do dia, ou null se o bloco dele ainda não chegou */
  const doDia = (d: string) => { const b = blocos[`${conta}|${blocoDe(d)}`]; return b ? b.filter((t) => t.data_vencimento === d) : null }
  return { doDia, erro }
}

function DiaPorDia({ hoje, conta }: Props) {
  const [dia, setDia] = useState(hoje)
  const { doDia, erro } = useBlocos(conta, dia)
  const primeiro = somaDias(hoje, -ANTES)
  const faixa = useMemo(() => Array.from({ length: ANTES + DEPOIS + 1 }, (_, i) => somaDias(primeiro, i)), [primeiro])
  const pos = numDia(dia) - numDia(primeiro)
  const ir = (d: string) => setDia(d < primeiro ? primeiro : d > faixa[faixa.length - 1] ? faixa[faixa.length - 1] : d)
  const itens = doDia(dia)
  const s = somar(itens || [])
  return (
    <>
      <Barra esquerda={<>
        <button type="button" className="cx-seta" onClick={() => ir(somaDias(dia, -1))} aria-label="Dia anterior"><i className="fa-solid fa-chevron-left" /></button>
        <span className="cx-periodo" style={{ minWidth: 220, textAlign: 'center' }}>{nomeDia(dia, hoje)}, {diaMes(dia)}</span>
        <button type="button" className="cx-seta" onClick={() => ir(somaDias(dia, 1))} aria-label="Próximo dia"><i className="fa-solid fa-chevron-right" /></button>
        {dia !== hoje && <button type="button" className="cx-link" onClick={() => setDia(hoje)}>Voltar para hoje</button>}
      </>} />
      {erro && <div className="cx-card cx-erro">{erro}</div>}
      <div className="s5-janela">
        <button type="button" className="s5-lado s5-lado-esq" onClick={() => ir(somaDias(dia, -1))} aria-label="Dia anterior"><i className="fa-solid fa-chevron-left" /></button>
        <div className="s5-trilho" style={{ ['--pos' as string]: pos }}>
          {faixa.map((d, i) => {
            const dist = Math.abs(i - pos)
            if (dist > 6) return <span key={d} className="s5-chip s5-fora" aria-hidden />
            const ts = doDia(d)
            const x = somar(ts || [])
            const rotulo = d === hoje || d === somaDias(hoje, 1) || d === somaDias(hoje, -1) ? nomeDia(d, hoje) : SEM_CURTA[diaSem(d)]
            return (
              <button key={d} type="button" className={`s5-chip s5-d${Math.min(dist, 4)}${d === hoje ? ' s5-hoje' : ''}`} onClick={() => ir(d)} aria-pressed={dist === 0} aria-label={`${nomeDia(d, hoje)}, ${diaMes(d)}`}>
                <span className="s5-chip-cab"><span>{rotulo}</span><b>{Number(d.slice(8))}</b></span>
                {!ts ? <span className="s5-chip-nada">…</span> : x.n === 0 ? <span className="s5-chip-nada">{ts.length ? 'tudo pago' : 'nada'}</span> : (
                  <span className="s5-chip-vals">
                    <span style={{ color: COR.receber }}>+ {brlCurto(x.receber)}</span>
                    <span style={{ color: COR.pagar }}>− {brlCurto(x.pagar)}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button type="button" className="s5-lado s5-lado-dir" onClick={() => ir(somaDias(dia, 1))} aria-label="Próximo dia"><i className="fa-solid fa-chevron-right" /></button>
      </div>
      {!itens ? <Carregando erro="" /> : (
        <>
          <div className="s5-grandes">
            <div className="cx-card s5-grande" style={{ ['--c' as string]: COR.receber }}><span>A receber</span><b>{brl(s.receber)}</b></div>
            <div className="cx-card s5-grande" style={{ ['--c' as string]: COR.pagar }}><span>A pagar</span><b>{brl(s.pagar)}</b></div>
          </div>
          <Contas itens={itens} hoje={hoje} />
        </>
      )}
    </>
  )
}

// ─── lista das contas: A receber | A pagar lado a lado ────────────────────────────────────────────
// em aberto primeiro, da maior para a menor; as pagas por último
function Contas({ itens, hoje }: { itens: Titulo[]; hoje: string }) {
  const lado = (tipo: 'receber' | 'pagar') => itens.filter((t) => t.tipo === tipo)
    .sort((a, b) => Number(aberto(a) === 0) - Number(aberto(b) === 0) || b.valor_documento - a.valor_documento)
  return (
    <>
      <div className="cx-dupla">
        {(['receber', 'pagar'] as const).map((tipo) => {
          const ts = lado(tipo)
          return (
            <section key={tipo} className="cx-card s-lista">
              <div className="s-lista-cab"><span>{tipo === 'receber' ? 'A receber' : 'A pagar'}</span><span className="cx-apagado" style={{ fontSize: 14.5, fontWeight: 400 }}>{ts.length} {ts.length === 1 ? 'conta' : 'contas'}</span></div>
              {ts.length === 0 ? <div className="cx-vazio" style={{ padding: 18 }}>Nada</div> : ts.map((t) => {
                const pago = aberto(t) === 0
                // vencida = venceu ANTES de hoje e segue em aberto (a rota marca as de hoje como vencidas)
                const venc = !pago && t.data_vencimento.slice(0, 10) < hoje
                return (
                  <div key={t.codigo_lancamento} className={`s-conta${pago ? ' s-pago' : ''}`}>
                    <span className="s-quem"><span>{nomeDe(t.nome_contraparte)}</span><small>{empresa(t.conta_omie)}{t.descricao_categoria ? ` · ${t.descricao_categoria}` : ''}</small></span>
                    <span className="s-valor">{brl(pago ? t.valor_documento : aberto(t))}{pago ? <small>pago</small> : venc ? <small style={{ color: COR.vencido }}>vencido</small> : null}</span>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}

const ESTILO = `
@keyframes s-entra { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
.cx > * { animation: s-entra .3s ease }
.s-lista { padding: 4px 0 }
.s-lista-cab { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 16px; font-size: 16.5px; font-weight: 500 }
.s-conta { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--border, #e2e8f0) }
.s-pago { opacity: .45 }
.s-quem { display: flex; flex-direction: column; min-width: 0; flex: 1 }
.s-quem span { font-size: 15.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.s-quem small { font-size: 13.5px; color: var(--portal-text-muted, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.s-valor { display: flex; flex-direction: column; align-items: flex-end; font-size: 15.5px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.s-valor small { font-size: 13px; font-weight: 400; color: var(--portal-text-muted, #64748b) }

.s5-janela { --n: 7; --gap: 12px; position: relative; overflow: hidden; padding: 10px 0 16px }
.s5-trilho { --w: calc((100% - (var(--n) - 1) * var(--gap)) / var(--n)); display: flex; gap: var(--gap); transform: translateX(calc((var(--pos) - (var(--n) - 1) / 2) * -1 * (var(--w) + var(--gap)))); transition: transform .45s cubic-bezier(.2, .8, .2, 1) }
.s5-chip { flex: 0 0 var(--w); position: relative; display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 12px 14px 14px; border: 1px solid var(--border, #e2e8f0); border-radius: 16px; background: var(--surface, #fefefe); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .35s ease, opacity .35s ease, box-shadow .35s ease, border-color .35s ease, background .35s ease }
.s5-fora { visibility: hidden }
.s5-d0 { border-color: #2563eb; background: color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe)); box-shadow: 0 0 0 1px #2563eb inset, 0 10px 24px rgba(37, 99, 235, .16); transform: scale(1.05); z-index: 1; cursor: default }
.s5-d0 .s5-chip-cab span { color: #2563eb }
.s5-d1 { opacity: .8; transform: scale(.97) }
.s5-d2 { opacity: .55; transform: scale(.94) }
.s5-d3 { opacity: .35; transform: scale(.91) }
.s5-d4 { opacity: .2; transform: scale(.88) }
.s5-d1:hover, .s5-d2:hover, .s5-d3:hover, .s5-d4:hover { opacity: 1; border-color: color-mix(in srgb, #2563eb 45%, var(--border, #e2e8f0)) }
.s5-lado { position: absolute; top: 50%; z-index: 2; width: 40px; height: 40px; display: grid; place-items: center; transform: translateY(-50%); border: 1px solid var(--border, #e2e8f0); border-radius: 50%; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); box-shadow: 0 4px 12px rgba(15, 23, 42, .1); cursor: pointer; transition: border-color .2s, transform .2s }
.s5-lado:hover { border-color: #2563eb; transform: translateY(-50%) scale(1.06) }
.s5-lado-esq { left: 4px } .s5-lado-dir { right: 4px }
.s5-chip-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 15px; color: var(--portal-text-muted, #64748b) }
.s5-chip-cab b { font-size: 28px; font-weight: 500; line-height: 1; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
.s5-hoje .s5-chip-cab span { color: #2563eb; font-weight: 500 }
.s5-chip-vals { display: flex; flex-direction: column; gap: 2px; font-size: 15.5px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.s5-chip-nada { font-size: 14.5px; color: var(--portal-text-muted, #94a3b8); padding: 2px 0 11px }
.s5-grandes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.s5-grande { display: flex; flex-direction: column; gap: 4px; padding: 20px 22px }
.s5-grande span { font-size: 16px; color: var(--portal-text-secondary, #475569) }
.s5-grande b { font-size: 34px; font-weight: 500; letter-spacing: -.01em; color: var(--c); font-variant-numeric: tabular-nums }

@media (max-width: 1200px) { .s5-janela { --n: 5 } }
@media (max-width: 900px) { .s5-janela { --n: 3 } .s5-grandes { grid-template-columns: 1fr } .s5-grande b { font-size: 26px } }
`
