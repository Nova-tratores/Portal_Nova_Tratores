'use client'
// Painel do pós-vendas (José, 16/10/2026) — uma história só, de cima para baixo:
//  1. Faturamento ao vivo (hoje · semana · mês)
//  2. Fita do tempo (escolhe o período)
//  3. A CONTA do período: faturado − terceiros − gastos (abastecimento/alimentação) = resultado
//  4. Um CARTÃO por técnico: horas × meta, faturado, gastos, km, pontos de ocorrência e resultado
//  5. Evolução com UM gráfico (escolhe o que ver; clicar na barra vai para aquele período)
// Dados: base inteira de GET /api/mecanicos/base (gravada no banco), calculada na tela por montarPainel.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, CartesianGrid } from 'recharts'
import type { LinhaTecnico, OSFaturada, DiaRegistrado } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, kmFmt, COR, Kpi, Cartao, EstilosCPV, Numero, useContador } from './ui'
import { SeletorCartoes, ESTILO_SO } from './SeletorOpcoes'
import { DinheiroSimulador, contaDe, ESTILO_DX } from './DinheiroOpcoes'
import { ESTILO_LD } from './LadoDireitoOpcoes'
import { FaturamentoPeriodo, ESTILO_FP } from './FaturamentoPeriodo'
import FaturamentoVivo from './FaturamentoVivo'
import { useParadoVivo } from './DinheiroParado'
import { ParadoFilaEstilo, ESTILO_PA } from './ParadoOpcoes'
import { GarantiasNoPainel, ESTILO_GX } from './GarantiaOpcoes'
import Comparador, { type PessoaComparada } from './Comparador'
import CartaJogo, { type DadosCarta } from './CartaJogo'
import { faltasCartao, montarPainel, agruparBase, andarPeriodo, grupoDe, SEM_META, SEM_TECNICO, GRUPO_GARANTIA, type Escala, type PainelMontado } from '@/lib/mecanicos/painel'
import { faixa } from '@/lib/mecanicos/ocorrencias-painel'
import { authHeaders } from '@/lib/auth/client'
import { useBasePosVendas } from './useBasePosVendas'
import { EvolucaoViva, pontosDoPainel, ESTILO_EV } from './EvolucaoOpcoes'
import type { Pendencia } from '@/lib/mecanicos/pendencias'
import { useComAguardando, CaixaAguardando } from './useComAguardando'
import { useCarreira } from './useCarreira'

type Resp = PainelMontado & { geradoEm?: string }

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
interface OSInterna { os: string; cliente: string; motivo: string; horas: number; tecnicos: string[] }
const MUDO = 'var(--portal-text-muted, #64748b)'
const COR_GASTO = '#ea580c'
const COR_RESULT = '#0f766e'
const ESTILO_SECAO = `.pt-secao { display: flex; gap: 12px; align-items: center; margin: 34px 0 14px; animation: cpvEntra .45s both } .pt-secao.primeira { margin-top: 6px }
.pt-secao-ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--c) 12%, var(--portal-bg-card, #fefefe)); color: var(--c); font-size: 15px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 22%, transparent) }
.pt-secao > div { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: baseline; flex-shrink: 0 } .pt-secao em { font-style: normal; font-size: 11px; font-weight: 900; color: var(--c); letter-spacing: .06em } .pt-secao small { grid-column: 2 } .pt-secao b { font-size: 16px; font-weight: 900; color: var(--portal-text, #0f172a); letter-spacing: -.01em } .pt-secao small { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.pt-secao-linha { flex: 1; height: 2px; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, transparent), transparent 70%); align-self: center; margin-left: 6px; transform-origin: left; animation: ptLinha .8s .15s cubic-bezier(.2,.8,.2,1) both } @keyframes ptLinha { from { transform: scaleX(0) } }`
const ESTILO_SIM = `.pt-horas2 { display: flex; gap: 6px 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; padding: 8px 12px; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; background: var(--portal-bg-card, #fefefe) } .pt-horas2 > b { font-size: 14px; color: var(--portal-text, #0f172a); margin-right: 4px } .pt-horas2 > b i { color: #0891b2 } .pt-horas2 > span, .pt-horas2 > button { display: inline-flex; gap: 6px; align-items: center; font-family: inherit; font-size: 13px; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f8fafc); border: 1px solid transparent; border-radius: 99px; padding: 4px 11px } .pt-horas2 > button { cursor: pointer } .pt-horas2 > button:hover { border-color: #8b5cf6 } .pt-horas2 i { width: 9px; height: 9px; border-radius: 3px; display: inline-block } .pt-horas2 span b, .pt-horas2 button b { color: var(--portal-text, #0f172a); font-size: 13.5px } .pt-horas2 em { font-style: normal; font-size: 11.5px; font-weight: 800; color: #0891b2 } .pt-horas2 > small { margin-left: auto; font-size: 12px; color: var(--portal-text-muted, #64748b) }
.pt-sim-claro { margin: 10px 0 18px }
.pt-sim { margin: 14px 0; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; background: var(--portal-bg-card, #fefefe); overflow: hidden } .pt-sim > summary { cursor: pointer; list-style: none; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 14px 18px; font-size: 16px; font-weight: 900; color: var(--portal-text, #0f172a) } .pt-sim > summary::-webkit-details-marker { display: none } .pt-sim > summary i { color: #7c3aed } .pt-sim > summary small { font-size: 12.5px; font-weight: 600; color: var(--portal-text-muted, #64748b) } .pt-sim > summary::after { content: "▸"; margin-left: auto; transition: transform .25s } .pt-sim[open] > summary::after { transform: rotate(90deg) } .pt-sim > .dx-caixa { border: none; border-top: 1px dashed var(--portal-border, #e5e7eb); border-radius: 0; animation: dxEntra .35s both }`
const ROTULO_HIST: Record<Escala, string> = { dia: 'últimos 14 dias', semana: 'últimas 8 semanas', mes: 'últimos 6 meses', ano: 'últimos 3 anos' }

export default function PainelTecnicos() {
  const [tipo, setTipo] = useState<Escala>('semana')
  const [ref, setRef] = useState(hojeSP)
  const [ficha, setFicha] = useState<string | null>(null)
  const [listaOS, setListaOS] = useState<{ titulo: string; os: OSFaturada[] } | null>(null)
  const [verInternas, setVerInternas] = useState(false)
  const [verReqs, setVerReqs] = useState(false)
  const [verGastos, setVerGastos] = useState<false | 'todos' | 'abastecimento' | 'manutencao' | 'alimentacao' | 'materiais'>(false)
  const [verSal, setVerSal] = useState(false)
  const [focoFita, setFocoFita] = useState<string | null>(null)
  const [cmp, setCmp] = useState<[string, string] | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [carta, setCarta] = useState<number | null>(null)
  const [busca, setBusca] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [pontos, setPontos] = useState<Record<string, number>>({})

  // base baixada uma vez; cada período é calculado aqui mesmo (troca de data instantânea)
  const { base, carregando, erro, recarregar } = useBasePosVendas()
  const agrupada = useMemo(() => (base ? agruparBase(base) : null), [base])
  // passando o mouse num cartão de técnico, os cartões de período mostram só ele (valor dividido quando a OS tem 2)
  const fatFita = useMemo(() => {
    if (!agrupada) return null
    if (!focoFita) return agrupada.faturadas
    return agrupada.faturadas.filter((o) => o.tecnicos.includes(focoFita)).map((o) => {
      const n = o.tecnicos.length
      return { ...o, bruto: o.bruto / n, horasCobradas: o.horasCobradas / n, servico: o.servico / n, km: o.km / n, kmValor: o.kmValor / n, pecas: o.pecas / n, outros: o.outros / n }
    })
  }, [agrupada, focoFita])
  const comAg = useComAguardando()
  const d: Resp | null = useMemo(() => (base ? { ...montarPainel(base, tipo, ref, hojeSP(), comAg), geradoEm: base.geradoEm } : null), [base, tipo, ref, comAg])
  // "Para onde foi o dinheiro" é SEMPRE do mês (José, 21/10/2026: "tem que ser somente mensal") — o mês do
  // período escolhido — e a comissão prevista vem da mesma regra da ficha do técnico (/api/mecanicos/carreira).
  const { dados: car } = useCarreira()
  const comissaoOficial = useMemo(() => {
    if (!car) return undefined
    const [a, m] = car.mesAtual.split('-').map(Number)
    const mesAnt = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    const r: Record<string, Record<string, number>> = {}
    for (const c of car.comissoes) r[c.tecnico] = { [car.mesAtual]: c.atual.total, [mesAnt]: c.anterior.total }
    return r
  }, [car])
  const dMes = useMemo(() => (base ? montarPainel(base, 'mes', ref, hojeSP(), comAg, comissaoOficial) : null), [base, ref, comAg, comissaoOficial])

  // pontos de ocorrência do mês do período (escudo de 100)
  const mesRef = ref.slice(0, 7)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/ocorrencias-painel?mes=${mesRef}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (r.ok && vivo) setPontos(Object.fromEntries((j.linhas || []).map((l: { tecnico: string; saldo: number }) => [l.tecnico, l.saldo])))
      } catch { /* sem pontos: o cartão não mostra o selo */ }
    })()
    return () => { vivo = false }
  }, [mesRef])

  const t = d?.total
  // requisições que formam o custo de terceiros do período
  const reqsDoPeriodo = useMemo(() => (d?.os || []).flatMap((o) => (o.requisicoes || []).map((r) => ({ ...r, os: o.os, cliente: o.cliente }))).sort((a, b) => b.valor - a.valor), [d])
  const g = d?.gastos
  const salarios = d?.equipe.total || 0
  const resultado = t && g ? t.liquido - g.foraDasOS - salarios : 0
  // quanto ficou de cada R$ 100 no período anterior (para o medidor comparar)
  const anteriorPor100 = useMemo(() => {
    if (!d || d.serie.length < 2) return null
    const i = d.serie.length - 2, tt = d.serie[i].total
    if (!tt.bruto) return null
    return ((tt.liquido - (d.gastosSerie[i]?.total || 0) - (d.equipeSerie[i] || 0)) / tt.bruto) * 100
  }, [d])
  const tecnicos = useMemo(() => (d?.linhas || []).filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico)), [d])
  // Garantia (Vinicius) e Outros (José Ortiz) não são técnicos de campo: ficam na faixa "Apoio"
  const apoio = useMemo(() => (d?.linhas || []).filter((l) => l.tecnico !== SEM_TECNICO && SEM_META.has(l.tecnico)), [d])
  const semTecnico = d?.linhas.find((l) => l.tecnico === SEM_TECNICO)
  const osDoTecnico = (tec: string) => (d?.os || []).filter((o) => (o.tecnicos.length ? o.tecnicos : [SEM_TECNICO]).includes(tec))
  // cartão-frota importado por planilha: avisa o que ainda não chegou no período
  const cartao = useMemo(() => (base && d ? faltasCartao(base.gastos || [], d.periodo.de, d.periodo.ate > hojeSP() ? hojeSP() : d.periodo.ate) : null), [base, d])
  const gastosDoPeriodo = useMemo(() => { if (!base || !d) return []; const fim = d.periodo.ate > hojeSP() ? hojeSP() : d.periodo.ate; return (base.gastos || []).filter((x) => x.data >= d.periodo.de && x.data <= fim).map((x) => ({ ...x, pessoa: grupoDe(x.pessoa) })) }, [base, d])
  const versoDe = (l: LinhaTecnico): VersoCartao => {
    const gp = gastoDe(l.tecnico)
    const cli = new Map<string, number>()
    for (const o of osDoTecnico(l.tecnico)) cli.set(o.cliente || 'Omie', (cli.get(o.cliente || 'Omie') || 0) + o.bruto / Math.max(1, o.tecnicos.length))
    return { abastecimento: gp?.abastecimento || 0, manutencao: gp?.manutencao || 0, alimentacao: gp?.alimentacao || 0, litros: gp?.litros || 0, internas: l.internas, clientes: [...cli.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3) }
  }
  // mouse entrando/saindo dos cartões sem piscar a fita
  const focoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focar = (t: string | null) => { if (focoTimer.current) clearTimeout(focoTimer.current); focoTimer.current = setTimeout(() => setFocoFita(t), t ? 120 : 250) }
  const abrirComparar = (nome: string) => { const outro = tecnicos.find((x) => x.tecnico !== nome); if (outro) setCmp([nome, outro.tecnico]) }
  const pessoaCmp = (nome: string): PessoaComparada => ({ nome, l: d?.linhas.find((x) => x.tecnico === nome), gastos: gastoDe(nome)?.total || 0, salario: d?.equipe.porPessoa[nome] || 0, pontos: pontos[nome] })
  const gastoDe = (tec: string) => d?.gastos.porPessoa.find((p) => p.pessoa === tec)

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true); return }
      if (e.ctrlKey || e.metaKey || e.altKey || busca || ficha || cmp || carta != null) return
      const k = e.key.toLowerCase()
      const esc: Record<string, Escala> = { d: 'dia', s: 'semana', m: 'mes', a: 'ano' }
      if (esc[k]) setTipo(esc[k])
      else if (k === '/') { e.preventDefault(); setBusca(true) }
      else if (e.key === '?') setAjuda(true)
      else if (k === 'h') setRef(hojeSP())
      else if (k === 'c' && tecnicos.length > 1) setCmp([tecnicos[0].tecnico, tecnicos[1].tecnico])
      else if (e.key === 'ArrowLeft') setRef((r) => andarPeriodo(tipo, r, -1))
      else if (e.key === 'ArrowRight') setRef((r) => { const n = andarPeriodo(tipo, r, 1); return n > hojeSP() ? r : n })
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [busca, ficha, cmp, carta, tecnicos, tipo])

  const itensBusca = (q: string): ItemBusca[] => {
    const n = q.trim().toLowerCase()
    const out: ItemBusca[] = []
    for (const l of tecnicos) if (!n || l.tecnico.toLowerCase().includes(n)) out.push({ grupo: 'Técnicos', titulo: l.tecnico, sub: `${brl(l.bruto)} no período`, icone: 'fa-user-gear', acao: () => setFicha(l.tecnico) })
    if (n.length >= 2 && agrupada) {
      const lista = agrupada.faturadas.filter((o) => o.os.toLowerCase().includes(n) || (o.numeroOmie || '').includes(n) || o.cliente.toLowerCase().includes(n)).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 8)
      for (const o of lista) out.push({
        grupo: 'OS faturadas', titulo: `${o.os} · ${o.cliente || 'Omie'}`, sub: `${br(o.data)}/${o.data.slice(2, 4)} · ${brl(o.bruto)} · ${o.tecnicos.join(' + ') || 'sem técnico'}`,
        icone: 'fa-file-invoice-dollar', acao: () => { if (!o.os.startsWith('OMIE')) window.open(`/pos?id=${encodeURIComponent(o.os)}`, '_blank') },
      })
    }
    const acoes: ItemBusca[] = [
      { grupo: 'Ir para', titulo: 'Hoje', icone: 'fa-location-crosshairs', acao: () => { setTipo('dia'); setRef(hojeSP()) } },
      { grupo: 'Ir para', titulo: 'Esta semana', icone: 'fa-calendar-week', acao: () => { setTipo('semana'); setRef(hojeSP()) } },
      { grupo: 'Ir para', titulo: 'Este mês', icone: 'fa-calendar', acao: () => { setTipo('mes'); setRef(hojeSP()) } },
      { grupo: 'Ir para', titulo: 'Este ano', icone: 'fa-calendar-days', acao: () => { setTipo('ano'); setRef(hojeSP()) } },
      ...(tecnicos.length > 1 ? [{ grupo: 'Ir para', titulo: `Comparar ${tecnicos[0].tecnico} × ${tecnicos[1].tecnico}`, icone: 'fa-code-compare', acao: () => setCmp([tecnicos[0].tecnico, tecnicos[1].tecnico]) }] : []),
      { grupo: 'Ir para', titulo: 'Gastos do período', icone: 'fa-gas-pump', acao: () => setVerGastos('todos') },
      { grupo: 'Ir para', titulo: 'Requisições de terceiros', icone: 'fa-receipt', acao: () => setVerReqs(true) },
    ]
    out.push(...acoes.filter((x) => !n || x.titulo.toLowerCase().includes(n)))
    return out.slice(0, 18)
  }

  const maxBruto = Math.max(1, ...tecnicos.map((l) => l.bruto))
  const cartas: DadosCarta[] = tecnicos.map((l) => {
    const gp = gastoDe(l.tecnico), v = versoDe(l)
    const parado = (base?.pendencias || []).filter((p) => p.tecnicos.map(grupoDe).includes(l.tecnico)).reduce((a, p) => a + p.total / Math.max(1, p.tecnicos.length), 0)
    return {
      l, maxBruto, parado, clientes: v.clientes, salario: d?.equipe.porPessoa[l.tecnico] || 0, pontos: pontos[l.tecnico],
      gasto: { abastecimento: gp?.abastecimento || 0, manutencao: gp?.manutencao || 0, alimentacao: gp?.alimentacao || 0, materiais: gp?.materiais || 0, total: gp?.total || 0, litros: gp?.litros || 0 },
      comissao: (d?.equipe.detalhe[l.tecnico]?.comissao || 0) + (d?.equipe.detalhe[l.tecnico]?.comissaoPrevista || 0),
      comissaoPrevista: (d?.equipe.detalhe[l.tecnico]?.comissaoPrevista || 0) > 0,
    }
  })


  return (
    <div>
      <EstilosCPV />
      <style>{ESTILO_EV}</style>
      <style>{ESTILO}</style>
      <FaturamentoVivo compacto />
      <style>{ESTILO_SO}</style>
      <style>{ESTILO_DX}</style>
      <style>{ESTILO_LD}</style>
      <style>{ESTILO_FP}</style>
      <style>{ESTILO_SIM}</style>
      <style>{ESTILO_PA}</style>
      <style>{ESTILO_GX}</style>
      <style>{ESTILO_TRILHO}</style>
      <style>{ESTILO_SECAO}</style>
      <div className="pt-amb">
      <TrilhoAssuntos topo soAoRolar />
      <div className="pt-corpo">
      {/* P3 "Cartões de período" escolhida na página de teste (19/10) no lugar da fita antiga (SeletorTempo) */}
      <Secao n={1} cor="#2563eb" ic="fa-chart-column" titulo="Faturamento por período" sub="escolha a semana, o mês ou o ano: o resto da tela segue" primeira />
      {/* José, 21/10/2026: "já pode colocar no portal, no lugar desse" — os 4 cartões (dia, semana, mês, ano), metas,
          "o que entra na conta" e a comparação lado a lado; a antiga (SeletorCartoes) ficou no código */}
      {base && <div style={{ marginBottom: 14 }}><FaturamentoPeriodo base={base} hoje={hojeSP()} forma="escada" escala={tipo} refDia={ref} onMudar={(e, r) => { setTipo(e); setRef(r) }} /></div>}
      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}
      {!d && carregando && <div style={{ padding: 40, textAlign: 'center', color: MUDO }}><i className="fas fa-circle-notch fa-spin" /> carregando o histórico…</div>}

      {t && g && (
        <div key={`${tipo}|${ref}`} className="pt-troca">
          {cartao && (cartao.depoisDe || cartao.mesesSem.length > 0) && (
            <div className="pt-aviso-cartao">
              <i className="fas fa-gas-pump" />
              <span>
                <b>Abastecimento do cartão incompleto neste período.</b>{' '}
                {cartao.depoisDe && <>A planilha do cartão-frota foi importada só até <b>{br(cartao.depoisDe)}/{cartao.depoisDe.slice(2, 4)}</b> — o que foi abastecido depois ainda não está aqui (só as requisições). </>}
                {cartao.mesesSem.length > 0 && <>Sem nenhuma transação do cartão em <b>{cartao.mesesSem.map((m) => `${m.slice(5)}/${m.slice(2, 4)}`).join(', ')}</b>. </>}
                Importe a planilha em <a href="/frota/abastecimento" target="_blank" rel="noreferrer">Frota → Abastecimento</a>.
              </span>
            </div>
          )}
          <Secao n={2} cor="#0f766e" ic="fa-sack-dollar" titulo="Para onde foi o dinheiro" sub={`o mês inteiro${dMes ? ` (${dMes.periodo.rotulo})` : ''} · mexa nos números para simular`} />
          {/* simulador "e se…" (D5 da página de teste, 19/10): mexe nas entradas, gastos e pessoal e vê o que ficaria */}
          {/* José, 21/10/2026: "melhora essas informações, remove o que não for necessário" — sem a barra do simulador
              (fica sempre aberto), sem a frase grande e sem o guia de 3 passos */}
          <div className="pt-sim-claro cpv-entra">
            {dMes && <DinheiroSimulador key={`mes|${dMes.periodo.de}|${comissaoOficial ? 1 : 0}`} c={contaDe(dMes, dMes.periodo.rotulo)} claro forma={1} />}
          </div>

          {/* dinheiro parado: OS feitas e não faturadas / passou da data sem preencher (foto de agora) */}
          <Secao n={3} cor="#d97706" ic="fa-hourglass-half" titulo="Dinheiro parado" sub="OS feitas e ainda não faturadas, agora" />
          {base && <ParadoNoPainel inicial={base.pendencias || []} />}

          <Secao n={4} cor="#7c3aed" ic="fa-users-gear" titulo="Garantias" sub="garantias direto do módulo" />
          <GarantiasNoPainel />
          {/* bloco "Apoio ao pós-vendas" (Outros) removido a pedido do José, 19/10/2026 */}
          {semTecnico && semTecnico.bruto > 0 && (
            <button type="button" className="pt-sem" onClick={() => setListaOS({ titulo: 'sem técnico (abertas direto no Omie)', os: osDoTecnico(SEM_TECNICO) })}>
              <i className="fas fa-circle-info" /> {brl(semTecnico.bruto)} faturados em {Math.round(semTecnico.os)} OS sem técnico (abertas direto no Omie) <u>ver</u>
            </button>
          )}

          <Secao n={5} cor="#0891b2" ic="fa-chart-line" titulo="Evolução" sub="faturado, resultado, horas e gastos ao longo dos períodos" />
          {/* 5. evolução */}
          <Cartao titulo="Evolução" atraso={200}>
            {/* E1 animada (José, 19/10/2026: "pode ser esse, mas deixa animado") */}
            {d && <EvolucaoViva pontos={pontosDoPainel(d, ref)} onIr={setRef} />}
          </Cartao>
        </div>
      )}
      </div>
      </div>

      {ficha && d && <FichaTecnico tecnico={ficha} linha={d.linhas.find((l) => l.tecnico === ficha)} dias={d.dias.filter((x) => x.tecnico === ficha)} os={osDoTecnico(ficha)} gasto={gastoDe(ficha)} salario={d.equipe.porPessoa[ficha] || 0} onFechar={() => setFicha(null)} />}
      {listaOS && <ListaOS titulo={listaOS.titulo} os={listaOS.os} onFechar={() => setListaOS(null)} />}
      {cmp && d && <Comparador a={pessoaCmp(cmp[0])} b={pessoaCmp(cmp[1])} pessoas={tecnicos.map((x) => x.tecnico)} onTrocar={(lado, nome) => setCmp((cc) => (cc ? (lado ? [cc[0], nome] : [nome, cc[1]]) : cc))} onFechar={() => setCmp(null)} />}
      {carta != null && cartas.length > 0 && <CartaJogo lista={cartas} inicio={Math.min(carta, cartas.length - 1)} onFechar={() => setCarta(null)} />}
      {busca && <BuscaRapida itens={itensBusca} onFechar={() => setBusca(false)} />}
      {ajuda && <Atalhos onFechar={() => setAjuda(false)} />}
      <button type="button" className="bq-flutua" onClick={() => setBusca(true)} title="Busca rápida (Ctrl+K) · ? = atalhos"><i className="fas fa-magnifying-glass" /> Buscar <kbd>Ctrl K</kbd></button>
      {verGastos && <ListaGastos gastos={gastosDoPeriodo} inicial={verGastos} onFechar={() => setVerGastos(false)} />}
      {verSal && d && <ListaSalarios porPessoa={d.equipe.porPessoa} detalhe={d.equipe.detalhe} equipe={(base?.equipe || []).map((e) => ({ ...e, pessoa: grupoDe(e.pessoa) }))} onFechar={() => setVerSal(false)} />}
      {verReqs && <ListaRequisicoes reqs={reqsDoPeriodo} onFechar={() => setVerReqs(false)} />}
      {verInternas && <ListaInternas internas={d?.internas || []} onFechar={() => setVerInternas(false)} />}
    </div>
  )
}

const COR_AGUARDANDO = '#f59e0b'


/** Dinheiro parado ao vivo, no estilo E1b escolhido na página de teste (19/10). */
function ParadoNoPainel({ inicial }: { inicial: import('@/lib/mecanicos/pendencias').Pendencia[] }) {
  const pend = useParadoVivo(inicial)
  return <div style={{ marginBottom: 14 }}><ParadoFilaEstilo estilo="cheio" pendencias={pend} /></div>
}

export interface Assunto { n: number; cor: string; ic: string; titulo: string }
const ASSUNTOS: Assunto[] = [
  { n: 1, cor: '#2563eb', ic: 'fa-chart-column', titulo: 'Faturamento por período' },
  { n: 2, cor: '#0f766e', ic: 'fa-sack-dollar', titulo: 'Para onde foi o dinheiro' },
  { n: 3, cor: '#d97706', ic: 'fa-hourglass-half', titulo: 'Dinheiro parado' },
  { n: 4, cor: '#7c3aed', ic: 'fa-users-gear', titulo: 'Garantias' },
  { n: 5, cor: '#0891b2', ic: 'fa-chart-line', titulo: 'Evolução' },
]

/** Trilho de assuntos ao lado (N3 escolhida na página de teste, 19/10): a bolinha do assunto em que você está
 *  acende, a linha vai enchendo conforme rola e clicar leva até o assunto. */
/** `soAoRolar`: a barra de cima só aparece depois que o assunto 01 passa por baixo do cabeçalho (José, 21/10/2026:
 *  "isso aqui só aparece quando rolar para baixo") — não ocupa espaço no topo da tela. */
export function TrilhoAssuntos({ mostrar = true, topo = false, soAoRolar = false, assuntos = ASSUNTOS }: { mostrar?: boolean; topo?: boolean; soAoRolar?: boolean; assuntos?: Assunto[] }) {
  const [atual, setAtual] = useState(1)
  const [rolou, setRolou] = useState(false)
  const [prog, setProg] = useState(0)
  const [existe, setExiste] = useState<number[]>([1])
  useEffect(() => {
    const medir = () => {
      const els = assuntos.map((a) => document.getElementById(`sec-${a.n}`)).filter((x): x is HTMLElement => !!x)
      if (!els.length) return
      const linha = window.innerHeight * 0.35
      const tops = els.map((e) => e.getBoundingClientRect().top)
      setRolou(tops[0] < 110)
      let i = 0
      tops.forEach((t, k) => { if (t < linha) i = k })
      const ate = tops[i + 1] ?? tops[i] + 600
      const parcial = Math.max(0, Math.min(1, (linha - tops[i]) / Math.max(1, ate - tops[i])))
      setAtual(Number(els[i].id.slice(4)))
      document.documentElement.style.setProperty('--cpv-amb', assuntos.find((a) => a.n === Number(els[i].id.slice(4)))?.cor || '#2563eb')
      els.forEach((e, k) => e.classList.toggle('pt-atual', k === i))
      setProg(els.length > 1 ? Math.min(1, (i + parcial) / (els.length - 1)) : 0)
      setExiste(els.map((e) => Number(e.id.slice(4))))
      els.forEach((e) => { if (e.getBoundingClientRect().top < window.innerHeight * 0.9) e.classList.add('pt-visto') })
    }
    medir()
    const t = setInterval(medir, 1500) // as seções aparecem quando os dados chegam
    document.addEventListener('scroll', medir, { capture: true, passive: true })
    window.addEventListener('resize', medir)
    return () => { clearInterval(t); document.removeEventListener('scroll', medir, { capture: true }); window.removeEventListener('resize', medir); document.documentElement.style.removeProperty('--cpv-amb') }
  }, [assuntos])
  const lista = assuntos.filter((a) => existe.includes(a.n))
  const cor = assuntos.find((a) => a.n === atual)?.cor || '#2563eb'
  const ir = (n: number) => document.getElementById(`sec-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // barra fina de abas em texto (José 22/10: "um outro estilo, algo mais simples") — sem bolinhas numeradas nem linha;
  // a seção atual fica em texto escuro com um sublinhado fino na cor dela
  if (topo) {
    const nav = (
    <nav className="pt-atalhos" aria-label="Assuntos do painel">
      {lista.map((a) => (
        <button key={a.n} type="button" className={atual === a.n ? 'on' : ''} aria-current={atual === a.n ? 'true' : undefined} style={{ '--c': a.cor } as React.CSSProperties} onClick={() => ir(a.n)}>
          <i className={`fas ${a.ic}`} /><span>{a.titulo}</span>
        </button>
      ))}
    </nav>
    )
    return soAoRolar ? <div className={`pt-atalhos-ancora ${rolou ? 'on' : ''}`} aria-hidden={!rolou}>{nav}</div> : nav
  }
  if (!mostrar) return null

  return (
    <nav className="pt-trilho" aria-label="Assuntos do painel">
      <div className="pt-trilho-in" style={{ '--c': cor } as React.CSSProperties}>
        <small>Assuntos</small>
        <div className="pt-trilho-lista">
          <i className="pt-trilho-fundo" />
          <i className="pt-trilho-cheio" style={{ transform: `scaleY(${prog})` }} />
          {lista.map((a, k) => (
            <button key={a.n} type="button" className={atual === a.n ? 'on' : atual > a.n ? 'feito' : ''} style={{ '--c': a.cor, animationDelay: `${k * 90}ms` } as React.CSSProperties}
              onClick={() => document.getElementById(`sec-${a.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <span><i className={`fas ${a.ic}`} /></span><b>{a.titulo}</b>
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
const ESTILO_TRILHO = `
.pt-com-trilho { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 18px; align-items: start } .pt-corpo { min-width: 0 }
@media (max-width: 1100px) { .pt-com-trilho { grid-template-columns: minmax(0, 1fr) } .pt-trilho { display: none } }
/* 27/10/2026: número da seção discreto (sem o círculo grande) */
.pt-amb .pt-secao em { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, transparent); border: 0; font-size: 12px; line-height: 1; font-weight: 700; color: var(--c); grid-row: span 2; align-self: center; margin-right: 4px; box-shadow: none; font-variant-numeric: tabular-nums; transition: background .3s }
.pt-amb .pt-secao.pt-atual em { background: var(--c); color: #fefefe }
.pt-amb .pt-secao:not(.pt-visto) em { transform: scale(.4); opacity: 0 } .pt-amb .pt-secao em { opacity: 1 }
.pt-atalhos-ancora { position: sticky; top: 92px; z-index: 30; height: 0 }
.pt-atalhos-ancora > .pt-atalhos { position: absolute; left: 0; right: 0; top: 0; margin: 0; opacity: 0; transform: translateY(-12px); pointer-events: none; transition: opacity .25s, transform .25s }
.pt-atalhos-ancora.on > .pt-atalhos { opacity: 1; transform: none; pointer-events: auto }
/* barra de cima: abas em texto, fina e quieta (22/10/2026) */
/* 27/10/2026 (José: "tira essa faixona branca, algo mais simples e bonito"): sem faixa — pílulas soltas sobre o fundo */
.pt-atalhos { position: sticky; top: 92px; z-index: 30; box-sizing: border-box; display: flex; align-items: center; gap: 6px; min-height: 40px; margin: 0 0 14px; padding: 4px 0; background: transparent; overflow-x: auto; overflow-y: hidden; scrollbar-width: none }
.pt-atalhos::-webkit-scrollbar { display: none }
.pt-atalhos button { flex: none; display: inline-flex; align-items: center; gap: 7px; border: 1px solid transparent; border-radius: 99px; background: transparent; padding: 6px 13px; font-family: inherit; font-size: 13.5px; font-weight: 400; color: var(--portal-text-muted, #64748b); cursor: pointer; white-space: nowrap; transition: color .15s, background .15s, border-color .15s }
.pt-atalhos button i { font-size: 12px; color: var(--c); opacity: .7; transition: opacity .15s }
.pt-atalhos button:hover { color: var(--portal-text, #0f172a); background: color-mix(in srgb, var(--c) 6%, transparent) } .pt-atalhos button:hover i { opacity: 1 }
.pt-atalhos button.on { color: var(--portal-text, #0f172a); font-weight: 500; background: var(--portal-bg-card, #fefefe); border-color: color-mix(in srgb, var(--c) 30%, transparent); box-shadow: 0 1px 3px rgba(15,23,42,.06) } .pt-atalhos button.on i { opacity: 1 }
.pt-atalhos button:focus-visible { outline: 2px solid var(--c); outline-offset: -2px }
.pt-trilho { position: sticky; top: 96px; align-self: start; padding-top: 4px }
.pt-trilho-in > small { display: block; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: var(--portal-text-muted, #64748b); margin: 0 0 8px 4px }
.pt-trilho-lista { position: relative; display: grid; gap: 6px }
.pt-trilho-fundo, .pt-trilho-cheio { position: absolute; left: 21px; top: 22px; bottom: 22px; width: 3px; border-radius: 99px }
.pt-trilho-fundo { background: var(--portal-border, #e2e8f0) }
.pt-trilho-cheio { background: linear-gradient(180deg, #2563eb, var(--c)); transform-origin: top; transition: transform .35s cubic-bezier(.2,.8,.2,1), background .4s }
.pt-trilho-lista button { position: relative; display: flex; gap: 10px; align-items: center; border: none; background: transparent; padding: 4px; border-radius: 12px; font-family: inherit; text-align: left; cursor: pointer; animation: ptTrEntra .5s cubic-bezier(.2,.8,.2,1) both; transition: background .25s }
@keyframes ptTrEntra { from { opacity: 0; transform: translateX(-14px) } }
.pt-trilho-lista button:hover { background: color-mix(in srgb, var(--c) 7%, transparent) }
.pt-trilho-lista button span { position: relative; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; background: var(--portal-bg-card, #fefefe); border: 2px solid var(--portal-border, #e2e8f0); color: var(--portal-text-muted, #94a3b8); font-size: 13.5px; transition: all .4s cubic-bezier(.3,1.4,.5,1) }
.pt-trilho-lista button b { font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #64748b); transition: color .3s, transform .3s }
.pt-trilho-lista button:hover span { transform: scale(1.08); border-color: var(--c); color: var(--c) }
.pt-trilho-lista button.feito span { border-color: color-mix(in srgb, var(--c) 50%, transparent); color: var(--c) }
.pt-trilho-lista button.on span { background: var(--c); border-color: var(--c); color: #fefefe; transform: scale(1.16) }
.pt-trilho-lista button.on span::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--c); opacity: 0; animation: ptTrPulso 2s ease-out infinite }
@keyframes ptTrPulso { 0% { transform: scale(.85); opacity: .55 } 100% { transform: scale(1.35); opacity: 0 } }
.pt-trilho-lista button.on b { color: var(--portal-text, #0f172a); font-weight: 900; transform: translateX(3px) }
/* seção entra quando aparece na tela: ícone dá um pulinho e a linha se desenha */
.pt-secao .pt-secao-ic { transition: transform .5s cubic-bezier(.3,1.6,.5,1), opacity .4s } .pt-secao:not(.pt-visto) .pt-secao-ic { transform: scale(.5); opacity: 0 }
.pt-secao > div { transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s } .pt-secao:not(.pt-visto) > div { transform: translateX(-12px); opacity: 0 }
.pt-secao:not(.pt-visto) .pt-secao-linha { animation: none; transform: scaleX(0) } .pt-secao.pt-visto .pt-secao-linha { animation: ptLinha .9s .15s cubic-bezier(.2,.8,.2,1) both }
@media (prefers-reduced-motion: reduce) { .pt-trilho-lista button, .pt-trilho-lista button.on span::after { animation: none } }
`

/** Título de seção: deixa claro que começa "outro assunto" (José 19/10: "visível, clean, moderno e profissional"). */
export function Secao({ ic, titulo, sub, primeira, cor, n }: { ic: string; titulo: string; sub?: string; primeira?: boolean; cor: string; n: number }) {
  return (
    <div id={`sec-${n}`} className={`pt-secao ${primeira ? 'primeira' : ''}`} style={{ '--c': cor } as React.CSSProperties}>
      <div><em>{String(n).padStart(2, '0')}</em><b>{titulo}</b>{sub && <small>{sub}</small>}</div>
      <i className="pt-secao-linha" />
    </div>
  )
}

// ---------------------------------------------------------------- "Para onde foi o dinheiro"

type Parte = { chave: string; rotulo: string; valor: number; cor: string; onClick?: () => void; detalhe?: [string, number][] }

/** Medidor de meia-lua: quanto de cada R$ 100 ficou (agulha anima até o valor). */
function Medidor({ pct, anterior }: { pct: number; anterior: number | null }) {
  const v = useContador(Math.max(-50, Math.min(100, pct)), 1200)
  const ang = (Math.max(0, Math.min(100, v)) / 100) * 180 - 90 // -90 = 0%, +90 = 100%
  const cor = pct >= 50 ? COR_RESULT : pct >= 20 ? '#d97706' : '#dc2626'
  const R = 70, C = Math.PI * R
  const dif = anterior == null ? null : Math.round(pct - anterior)
  return (
    <div className="dm-medidor">
      <svg viewBox="0 0 180 104" width="190" height="110">
        <path d={`M 20 92 A ${R} ${R} 0 0 1 160 92`} fill="none" stroke="var(--portal-bg-secondary, #eef2f7)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M 20 92 A ${R} ${R} 0 0 1 160 92`} fill="none" stroke={cor} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, v)) / 100)} />
        <g transform={`rotate(${ang} 90 92)`}>
          <line x1="90" y1="92" x2="90" y2="34" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
          <circle cx="90" cy="92" r="6" fill="#0f172a" />
        </g>
        <text x="20" y="104" fontSize="9" fill="#94a3b8" textAnchor="middle">0</text>
        <text x="160" y="104" fontSize="9" fill="#94a3b8" textAnchor="middle">100</text>
      </svg>
      <div className="dm-med-txt">
        <b style={{ color: cor }}>R$ {Math.round(v)}</b>
        <small>de cada R$ 100 ficaram</small>
        {dif != null && <span style={{ color: dif > 0 ? '#047857' : dif < 0 ? '#b91c1c' : MUDO }}>{dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {Math.abs(dif)} vs período anterior (R$ {Math.round(anterior!)})</span>}
      </div>
    </div>
  )
}

function Dinheiro({ t, g, salarios, eq, notas, resultado, nOS, nReqs, anterior, onOS, onTerceiros, onGastos, onSalarios }: {
  t: LinhaTecnico; g: { abastecimento: number; manutencao: number; alimentacao: number; materiais: number; total: number; emAberto: number }; salarios: number
  eq: PainelMontado['equipe']; notas: PainelMontado['notas']; resultado: number
  nOS: number; nReqs: number; anterior: number | null
  onOS: () => void; onTerceiros: () => void; onGastos: () => void; onSalarios: () => void
}) {
  const [aceso, setAceso] = useState<{ lado: 'e' | 's'; chave: string; x: number; y: number } | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const por100 = t.bruto ? (resultado / t.bruto) * 100 : 0
  const custos = t.custo + g.total + salarios
  const entradas = ([
    { chave: 'mo', rotulo: 'Mão de obra', valor: t.servico, cor: COR.servico, onClick: onOS, detalhe: [[`${horas(t.faturadas)} cobradas`, t.servico]] },
    { chave: 'km', rotulo: 'Deslocamento', valor: t.kmValor, cor: COR.km, onClick: onOS, detalhe: [[kmFmt(t.km), t.kmValor]] },
    { chave: 'pc', rotulo: 'Peças (oficina)', valor: t.pecas, cor: COR.pecas, onClick: onOS },
    { chave: 'ou', rotulo: 'Outros', valor: Math.max(0, t.outros), cor: COR.outros, onClick: onOS },
  ] as Parte[]).filter((p) => p.valor > 0.5)
  const saidas = ([
    { chave: 'te', rotulo: 'Terceiros', valor: t.custo, cor: '#dc2626', onClick: onTerceiros, detalhe: [[`${nReqs} requisição(ões) não cobradas`, t.custo]] },
    { chave: 'ga', rotulo: 'Gastos', valor: g.total, cor: COR_GASTO, onClick: onGastos, detalhe: [['Abastecimento', g.abastecimento], ['Manutenção do carro', g.manutencao], ['Alimentação', g.alimentacao], ['Materiais da oficina', g.materiais], ...(g.emAberto > 0.5 ? [[`Em aberto, fora do total: ${brl(g.emAberto)}`, 0] as [string, number]] : [])] },
    { chave: 'sa', rotulo: 'Pessoal', valor: salarios, cor: '#7c3aed', onClick: onSalarios, detalhe: [['Salários + encargos (mês inteiro)', eq.salario], ['Comissão lançada no RH', eq.comissao], ['Comissão PREVISTA (ainda não no RH)', eq.comissaoPrevista], ['Rescisões e acertos', eq.rescisao]] },
    { chave: 're', rotulo: resultado >= 0 ? 'Ficou para a empresa' : 'Faltou', valor: Math.abs(resultado), cor: resultado >= 0 ? COR_RESULT : '#fca5a5' },
  ] as Parte[]).filter((p) => p.valor > 0.5)
  const baseE = entradas.reduce((s, p) => s + p.valor, 0) || 1
  const baseS = saidas.reduce((s, p) => s + p.valor, 0) || 1
  // faixas: cada entrada se divide nas saídas na mesma proporção (o dinheiro "escorre")
  const W = 1000, H = 130
  const fitas: { e: string; s: string; d: string; cor: string; valor: number }[] = []
  if (resultado >= 0) {
    const offS = new Map<string, number>(); let accS = 0
    for (const s of saidas) { offS.set(s.chave, accS); accS += s.valor }
    const dentroS = new Map<string, number>(saidas.map((s) => [s.chave, 0]))
    let accE = 0
    for (const e of entradas) {
      let dentroE = 0
      for (const s of saidas) {
        const v = e.valor * (s.valor / baseS)
        const x0 = ((accE + dentroE) / baseE) * W, x1 = ((accE + dentroE + v) / baseE) * W
        const y0 = ((offS.get(s.chave)! + dentroS.get(s.chave)!) / baseS) * W, y1 = ((offS.get(s.chave)! + dentroS.get(s.chave)! + v) / baseS) * W
        fitas.push({ e: e.chave, s: s.chave, cor: s.cor, valor: v, d: `M${x0},0 C${x0},${H / 2} ${y0},${H / 2} ${y0},${H} L${y1},${H} C${y1},${H / 2} ${x1},${H / 2} ${x1},0 Z` })
        dentroE += v; dentroS.set(s.chave, dentroS.get(s.chave)! + v)
      }
      accE += e.valor
    }
  }
  const ligada = (f: { e: string; s: string }) => !aceso || (aceso.lado === 'e' ? f.e === aceso.chave : f.s === aceso.chave)
  const acender = (lado: 'e' | 's', chave: string) => (ev: React.MouseEvent) => {
    const r = caixa.current?.getBoundingClientRect()
    setAceso({ lado, chave, x: r ? Math.min(Math.max(ev.clientX - r.left, 160), r.width - 160) : 0, y: r ? ev.clientY - r.top : 0 })
  }
  const parteAcesa = aceso ? (aceso.lado === 'e' ? entradas : saidas).find((p) => p.chave === aceso.chave) : null
  const barra = (lista: Parte[], base: number, lado: 'e' | 's') => (
    <div className="dm-barra">
      {lista.map((p, i) => {
        const pct = (p.valor / base) * 100
        const apagada = aceso && !(aceso.lado === lado ? aceso.chave === p.chave : fitas.some((f) => ligada(f) && (lado === 'e' ? f.e === p.chave : f.s === p.chave)))
        return (
          <button key={p.chave} type="button" className={`dm-fatia ${apagada ? 'dm-apagada' : ''}`} style={{ width: `${pct}%`, background: p.cor, animationDelay: `${i * 110}ms` }}
            onMouseEnter={acender(lado, p.chave)} onMouseMove={acender(lado, p.chave)} onMouseLeave={() => setAceso(null)} onClick={p.onClick} disabled={!p.onClick}>
            {pct >= 8 && <span><b>{brl(p.valor)}</b><small>{p.rotulo} · {Math.round(pct)}%</small></span>}
          </button>
        )
      })}
    </div>
  )
  return (
    <section className="dm-caixa cpv-entra" ref={caixa}>
      <div className="dm-topo">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="dn-rot">Para onde foi o dinheiro</div>
          <div className="dn-frase">
            De cada <b>R$ 100</b> faturados, {resultado >= 0
              ? <>ficaram <b style={{ color: COR_RESULT }}>R$ {Math.round(por100)}</b> para a empresa</>
              : <>faltaram <b style={{ color: '#b91c1c' }}>R$ {Math.abs(Math.round(por100))}</b> — o pós-vendas não se pagou</>}
          </div>
          <div className="dm-resumo">
            <span><small>Entrou</small><b style={{ color: '#0369a1' }}><Numero valor={t.bruto} formato={brl} /></b><em title="Com NFS-e = o número do Dashboard de Vendas (serviços); recibo = faturada sem nota">{nOS} OS · com nota {brl(notas.comNota)} · recibo {brl(notas.recibo)}</em></span>
            <i className="fas fa-minus" />
            <span><small>Saiu</small><b style={{ color: '#be123c' }}><Numero valor={custos} formato={brl} /></b><em>terceiros + gastos + pessoal</em></span>
            <i className="fas fa-equals" />
            <span><small>Resultado</small><b style={{ color: resultado >= 0 ? COR_RESULT : '#b91c1c' }}><Numero valor={resultado} formato={brl} /></b><em>passe o mouse nas barras</em></span>
          </div>
        </div>
        <Medidor pct={por100} anterior={anterior} />
      </div>

      <div className="dm-fluxo">
        <div className="dm-lado"><small>Entrou</small></div>
        {barra(entradas, baseE, 'e')}
        {fitas.length > 0 && (
          <svg className="dm-fitas" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {fitas.map((f, i) => (
              <path key={i} d={f.d} fill={f.cor} className={aceso && ligada(f) ? 'dm-fita-on' : ''} style={{ opacity: aceso ? (ligada(f) ? 0.55 : 0.04) : 0.16, animationDelay: `${300 + i * 25}ms` }} />
            ))}
          </svg>
        )}
        <div className="dm-lado"><small>Para onde foi</small></div>
        {barra(saidas, baseS, 's')}
      </div>

      {aceso && parteAcesa && (
        <div className="dm-dica" style={{ left: aceso.x, top: aceso.lado === 'e' ? aceso.y + 22 : undefined, bottom: aceso.lado === 's' ? `calc(100% - ${aceso.y - 22}px)` : undefined }}>
          <b style={{ color: parteAcesa.cor }}>{parteAcesa.rotulo} · {brl(parteAcesa.valor)}</b>
          {aceso.lado === 'e' && resultado >= 0 ? (
            <>
              <small>Desse dinheiro:</small>
              {fitas.filter((f) => f.e === aceso.chave).map((f) => { const s = saidas.find((x) => x.chave === f.s)!; return <div key={f.s} className="dm-dl"><i style={{ background: s.cor }} /><span>{s.rotulo}</span><b>{brl(f.valor)}</b></div> })}
            </>
          ) : (
            <>
              {(parteAcesa.detalhe || []).filter(([, v]) => v > 0).map(([r, v]) => <div key={r} className="dm-dl"><span>{r}</span><b>{brl(v)}</b></div>)}
              {aceso.lado === 's' && resultado >= 0 && <><small>Veio de:</small>{fitas.filter((f) => f.s === aceso.chave).map((f) => { const e = entradas.find((x) => x.chave === f.e)!; return <div key={f.e} className="dm-dl"><i style={{ background: e.cor }} /><span>{e.rotulo}</span><b>{brl(f.valor)}</b></div> })}</>}
            </>
          )}
          {parteAcesa.onClick && <em>clique para ver a lista</em>}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- cartão do técnico

function Anel({ pct, tam = 64 }: { pct: number; tam?: number }) {
  const R = tam / 2 - 6, C = 2 * Math.PI * R
  const cor = pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626'
  const v = useContador(Math.min(pct, 100))
  return (
    <div style={{ position: 'relative', width: tam, height: tam, flexShrink: 0 }}>
      <svg width={tam} height={tam} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke="var(--portal-bg-secondary, #eef2f7)" strokeWidth="6" />
        <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke={cor} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <b style={{ fontSize: 16, color: cor }}>{Math.round(pct)}%</b>
        <small style={{ fontSize: 9, color: MUDO, marginTop: 2 }}>da meta</small>
      </div>
    </div>
  )
}

function Faisca({ valores, cor = '#0369a1' }: { valores: number[]; cor?: string }) {
  const W = 120, H = 34
  const max = Math.max(1, ...valores)
  const pts = valores.map((v, i) => [valores.length > 1 ? (i / (valores.length - 1)) * W : W / 2, H - 3 - (v / max) * (H - 8)])
  if (!pts.length) return null
  const ult = pts[pts.length - 1]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="ct-faisca">
      <polyline points={`0,${H} ${pts.map((p) => p.join(',')).join(' ')} ${W},${H}`} fill={`${cor}18`} stroke="none" />
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ult[0]} cy={ult[1]} r="3.5" fill={cor} />
    </svg>
  )
}

interface VersoCartao { abastecimento: number; manutencao: number; alimentacao: number; litros: number; clientes: [string, number][]; internas: number }

function CartaoTecnico({ l, gasto, salario, pontos, historico, rotuloHist, i, onDetalhes, arrastando, alvo, onClick, onComparar, onFoco, onArrastar, onAlvo, onSoltar }: {
  l: LinhaTecnico; gasto: number; salario: number; pontos?: number; historico: number[]; rotuloHist: string; i: number; onDetalhes: () => void
  arrastando: string | null; alvo: string | null
  onClick: () => void; onComparar: () => void; onFoco: (t: string | null) => void
  onArrastar: (t: string | null) => void; onAlvo: (t: string | null) => void; onSoltar: (de: string, para: string) => void
}) {
  const pct = l.meta ? ((l.faturadas + l.aguardando + l.internas) / l.meta) * 100 : 0
  const custo = salario + gasto + l.custo
  // para cada R$ 1 que ele custa, quanto SOBRA (negativo = prejuízo)
  const porReal = custo > 0 ? (l.bruto - custo) / custo : null
  const resultado = l.bruto - custo
  const corRende = porReal == null ? MUDO : porReal >= 1 ? '#047857' : porReal >= 0 ? '#b45309' : '#b91c1c'
  const fx = pontos == null ? null : faixa(pontos)
  const grupo = SEM_META.has(l.tecnico)
  const souAlvo = alvo === l.tecnico && arrastando && arrastando !== l.tecnico
  // inclinação 3D acompanhando o mouse (sem re-render: mexe direto no estilo)
  const inclinar = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
    e.currentTarget.style.setProperty('--ry', `${x * 10}deg`); e.currentTarget.style.setProperty('--rx', `${-y * 10}deg`)
    e.currentTarget.style.setProperty('--gx', `${(x + 0.5) * 100}%`); e.currentTarget.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
  }
  const soltarInclinacao = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg') }
  return (
    <div className={`ct-palco cpv-entra ${souAlvo ? 'ct-alvo' : ''} ${arrastando === l.tecnico ? 'ct-arrastado' : ''}`} style={{ animationDelay: `${120 + i * 60}ms` }}
      draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.tecnico); e.dataTransfer.effectAllowed = 'link'; onArrastar(l.tecnico) }}
      onDragEnd={() => { onArrastar(null); onAlvo(null) }}
      onDragOver={(e) => { if (arrastando && arrastando !== l.tecnico) { e.preventDefault(); onAlvo(l.tecnico) } }}
      onDragLeave={() => onAlvo(null)}
      onDrop={(e) => { e.preventDefault(); const de = e.dataTransfer.getData('text/plain'); if (de && de !== l.tecnico) onSoltar(de, l.tecnico); onArrastar(null); onAlvo(null) }}
      onMouseEnter={() => onFoco(l.tecnico)} onMouseLeave={(e) => { soltarInclinacao(e); onFoco(null) }} onMouseMove={inclinar}>
      {souAlvo && <div className="ct-solte"><i className="fas fa-code-compare" /> solte para comparar com {arrastando}</div>}
      <div className="ct">
        {/* frente */}
        <div className="ct-face ct-frente" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}>
          <div className="ct-brilho" />
          <div className="ct-topo">
            {grupo ? <span className="ct-grupo"><i className={`fas ${l.tecnico === GRUPO_GARANTIA ? 'fa-shield-heart' : 'fa-users'}`} /></span> : <Anel pct={pct} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ct-nome">{l.tecnico}</div>
              <div className="ct-sub">{grupo && <b style={{ color: '#7c3aed' }}>grupo · </b>}{horas(l.faturadas)} faturadas{l.aguardando ? ` · ${horas(l.aguardando)} aguardando faturar` : ''}{l.internas ? ` · ${horas(l.internas)} internas` : ''} · {grupo ? 'sem meta de horas' : `${horas(l.ociosas)} paradas`}</div>
            </div>
            {fx && <span className="ct-pts" title="Pontos de ocorrência no mês (começa com 100)" style={{ color: { ok: '#047857', atencao: '#b45309', critico: '#b91c1c' }[fx], background: { ok: '#ecfdf5', atencao: '#fffbeb', critico: '#fef2f2' }[fx] }}><i className="fas fa-shield-halved" /> {pontos}</span>}
          </div>
          <div className="ct-rende">
            <div>
              <small>{porReal == null ? 'Sem custo no período' : porReal >= 0 ? 'Lucro para cada R$ 1 que custa' : 'Prejuízo para cada R$ 1 que custa'}</small>
              <b style={{ color: corRende }} title={`faturou ${brl(l.bruto)} ÷ custou ${brl(custo)}`}>{porReal == null ? '—' : `${porReal >= 0 ? '+' : '−'}R$ ${Math.abs(porReal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</b>
              <small>{porReal == null ? '' : porReal >= 0 ? 'ele se paga' : 'não se pagou no período'}</small>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Faisca valores={historico} />
              <small style={{ display: 'block' }}>faturado · {rotuloHist}</small>
            </div>
          </div>
          <div className="ct-dinheiro" title={`faturou ${brl(l.bruto)} · custou ${brl(custo)} (pessoal ${brl(salario)} + gastos ${brl(gasto)} + terceiros ${brl(l.custo)})`}>
            <i style={{ width: `${l.bruto ? Math.min(100, (custo / Math.max(l.bruto, custo)) * 100) : 100}%`, background: '#fda4af' }} />
            <i style={{ flex: 1, background: resultado >= 0 ? '#5eead4' : 'transparent' }} />
          </div>
          <div className="ct-nums">
            <span><small>Faturou</small><b style={{ color: '#0369a1' }}>{brl(l.bruto)}</b></span>
            <span><small>Custou</small><b style={{ color: '#be123c' }}>{brl(custo)}</b></span>
            <span><small>Sobrou</small><b style={{ color: resultado >= 0 ? COR_RESULT : '#b91c1c' }}>{brl(resultado)}</b></span>
          </div>
          <div className="ct-acoes" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={onDetalhes} title="Abrir a carta do técnico"><i className="fas fa-id-badge" /> detalhes</button>
            <button type="button" onClick={onComparar} title="Comparar com outro técnico (ou arraste o cartão sobre outro)"><i className="fas fa-code-compare" /> comparar</button>
            <span><i className="fas fa-up-down-left-right" /> arraste para comparar</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- apoio ao pós-vendas (Garantia / Outros)
// Não são técnicos de campo (sem meta de horas): mostra o que custam e o que passa por eles, sem "lucro".

function Apoio({ linhas, salarios, gastoDe, pendencias, garantias, onOS, onGarantias }: {
  linhas: LinhaTecnico[]; salarios: Record<string, number>; gastoDe: (n: string) => number; pendencias: Pendencia[]
  garantias: OSFaturada[]; onOS: (n: string) => void; onGarantias: () => void
}) {
  // garantia é pelo TIPO da OS: quem executa são os técnicos de campo
  const fezGarantia = new Map<string, number>()
  for (const o of garantias) for (const t of o.tecnicos.length ? o.tecnicos : ['Sem técnico']) fezGarantia.set(t, (fezGarantia.get(t) || 0) + 1 / Math.max(1, o.tecnicos.length))
  const brutoGar = garantias.reduce((a, o) => a + o.bruto, 0)
  return (
    <section className="ap cpv-entra" style={{ animationDelay: '160ms' }}>
      <div className="ap-cab"><b>Apoio ao pós-vendas</b><span>não são técnicos de campo: sem meta de horas e sem conta de lucro — aqui só o que custam e o que passa por eles</span></div>
      <div className="ap-grade">
        {linhas.map((l) => {
          const garantia = l.tecnico === GRUPO_GARANTIA
          const custo = (salarios[l.tecnico] || 0) + gastoDe(l.tecnico) + l.custo
          const aguardando = garantia ? pendencias : []
          const valorAguardando = aguardando.reduce((a, p) => a + p.total, 0)
          return (
            <div key={l.tecnico} className={`ap-item ${garantia ? 'ap-gar' : 'ap-out'}`}>
              <div className="ap-ic"><i className={`fas ${garantia ? 'fa-shield-heart' : 'fa-users'}`} /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ap-nome">{garantia ? 'Vinicius Correa' : 'Outros'} <small>{garantia ? 'garantias' : 'José Ortiz'}</small></div>
                <div className="ap-desc">{garantia ? 'OS do tipo garantia (quem paga é a montadora). Quem executa são os técnicos; o Vinicius cuida do processo.' : 'Serviços que não são de um técnico de campo.'}</div>
                <div className="ap-nums">
                  {garantia
                    ? <button type="button" onClick={onGarantias} disabled={!garantias.length}><small>Garantias faturadas</small><b>{garantias.length} OS · {brl(brutoGar)}</b></button>
                    : <button type="button" onClick={() => onOS(l.tecnico)} disabled={!l.os}><small>OS faturadas</small><b>{Math.round(l.os)} OS · {brl(l.bruto)}</b></button>}
                  {garantia && <span><small>Aguardando faturar</small><b style={{ color: aguardando.length ? '#b45309' : undefined }}>{aguardando.length} OS · {brl(valorAguardando)}</b></span>}
                  {garantia && l.os > 0 && <button type="button" onClick={() => onOS(l.tecnico)}><small>Faturadas pelo Vinicius</small><b>{Math.round(l.os)} OS · {brl(l.bruto)}</b></button>}
                  <span title={`pessoal ${brl(salarios[l.tecnico] || 0)} · gastos ${brl(gastoDe(l.tecnico))} · terceiros ${brl(l.custo)}`}><small>Custo no período</small><b style={{ color: '#be123c' }}>{brl(custo)}</b></span>
                </div>
                {garantia && fezGarantia.size > 0 && <div className="ap-quem">Quem fez: {[...fezGarantia.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t.split(' ')[0]} ${Math.round(n * 10) / 10}`).join(' · ')}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- busca rápida (Ctrl+K) e atalhos

type ItemBusca = { grupo: string; titulo: string; sub?: string; icone: string; acao: () => void }

function BuscaRapida({ itens, onFechar }: { itens: (q: string) => ItemBusca[]; onFechar: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const lista = itens(q)
  const executar = (it?: ItemBusca) => { if (it) { it.acao(); onFechar() } }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="bq-fundo" onClick={onFechar}>
      <div className="bq-caixa" onClick={(e) => e.stopPropagation()}>
        <div className="bq-campo">
          <i className="fas fa-magnifying-glass" />
          <input autoFocus value={q} placeholder="Técnico, nº da OS, cliente ou um comando…" onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              if (e.key === 'Enter') executar(lista[sel])
              if (e.key === 'Escape') onFechar()
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="bq-lista">
          {lista.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: MUDO }}>Nada encontrado.</div>}
          {lista.map((it, i) => (
            <div key={i}>
              {(i === 0 || lista[i - 1].grupo !== it.grupo) && <div className="bq-grupo">{it.grupo}</div>}
              <button type="button" className={`bq-item ${i === sel ? 'bq-on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => executar(it)}>
                <i className={`fas ${it.icone}`} />
                <span>{it.titulo}</span>
                {it.sub && <small>{it.sub}</small>}
                {i === sel && <kbd>Enter</kbd>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

function Atalhos({ onFechar }: { onFechar: () => void }) {
  const lista: [string, string][] = [['Ctrl + K  ou  /', 'busca rápida'], ['D · S · M · A', 'dia, semana, mês, ano'], ['← →', 'período anterior / seguinte'], ['H', 'voltar para hoje'], ['C', 'comparar os dois que mais faturaram'], ['?', 'esta ajuda'], ['Esc', 'fechar']]
  return (
    <Janela titulo="Atalhos do teclado" onFechar={onFechar} largura={460}>
      <div style={{ display: 'grid', gap: 8 }}>
        {lista.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}><kbd className="bq-kbd">{k}</kbd><span style={{ color: MUDO }}>{v}</span></div>)}
        <div style={{ fontSize: 12.5, color: MUDO, marginTop: 6 }}>Passe o mouse num técnico para a fita do tempo mostrar só ele. Arraste um cartão sobre outro para comparar.</div>
      </div>
    </Janela>
  )
}

// ---------------------------------------------------------------- janelas de gastos e salários

type GastoLinha = { data: string; pessoa: string; tipo: 'abastecimento' | 'manutencao' | 'alimentacao' | 'materiais'; origem: string; valor: number; litros: number; placa?: string; ref?: string; aberto?: boolean }
const NOME_GASTO = { abastecimento: 'Abastecimento', manutencao: 'Manutenção do carro', alimentacao: 'Alimentação', materiais: 'Materiais da oficina' } as const
const COR_TIPO_GASTO = { abastecimento: '#ea580c', manutencao: '#a16207', alimentacao: '#ca8a04', materiais: '#0d9488' } as const

function ListaGastos({ gastos, inicial = 'todos', onFechar }: { gastos: GastoLinha[]; inicial?: 'todos' | GastoLinha['tipo']; onFechar: () => void }) {
  const [tipo, setTipo] = useState<'todos' | 'aberto' | GastoLinha['tipo']>(inicial)
  const lista = gastos.filter((g) => tipo === 'todos' ? !g.aberto : tipo === 'aberto' ? g.aberto : g.tipo === tipo && !g.aberto).sort((a, b) => b.data.localeCompare(a.data))
  const porPessoa = new Map<string, { total: number; itens: GastoLinha[] }>()
  for (const g of lista) { const x = porPessoa.get(g.pessoa) || { total: 0, itens: [] }; x.total += g.valor; x.itens.push(g); porPessoa.set(g.pessoa, x) }
  const total = lista.reduce((s, g) => s + g.valor, 0)
  const nAberto = gastos.filter((g) => g.aberto).length
  return (
    <Janela titulo={<>Gastos do pós-vendas · {brl2(total)}</>} onFechar={onFechar} largura={900}>
      <div className="pt-metricas" style={{ marginBottom: 12 }}>
        {(['todos', 'abastecimento', 'manutencao', 'alimentacao', 'materiais'] as const).map((k) => (
          <button key={k} type="button" className={tipo === k ? 'pt-m-on' : ''} onClick={() => setTipo(k)}>{k === 'todos' ? 'Todos' : NOME_GASTO[k]}</button>
        ))}
        {nAberto > 0 && <button type="button" className={tipo === 'aberto' ? 'pt-m-on' : ''} onClick={() => setTipo('aberto')}>Em aberto ({nAberto})</button>}
      </div>
      <div style={{ fontSize: 12.5, color: MUDO, marginBottom: 10 }}>
        Gasto do carro vai para o dono do carro (vínculo da Frota); sem dono, para quem abasteceu ou pediu. Gasto da Oficina de quem não é técnico fica em &quot;Oficina (geral)&quot;.
        Requisição só conta quando chega ao financeiro; o que o funcionário devolveu (desconto em folha/caixinha) já sai do valor.
        {tipo === 'aberto' && <b> Em aberto: ainda não chegaram ao financeiro — fora do total.</b>}
      </div>
      {[...porPessoa.entries()].sort((a, b) => b[1].total - a[1].total).map(([pessoa, x]) => (
        <details key={pessoa} className="gl-pessoa" open={porPessoa.size <= 3}>
          <summary><b>{pessoa}</b><span>{x.itens.length} lançamento(s)</span><b style={{ color: COR_GASTO }}>{brl2(x.total)}</b></summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {x.itens.map((g, i) => (
              <div key={i} className="gl-item">
                <i style={{ background: COR_TIPO_GASTO[g.tipo] }} />
                <span style={{ width: 46 }}>{br(g.data)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{NOME_GASTO[g.tipo]}{g.placa ? ` · ${g.placa}` : ''}{g.litros ? ` · ${Math.round(g.litros)} L` : ''} <small>({g.origem === 'cartao' ? 'cartão-frota' : g.ref?.split(' · ')[0].replace('req:', 'requisição #')})</small></span>
                <b>{brl2(g.valor)}</b>
              </div>
            ))}
          </div>
        </details>
      ))}
      {!lista.length && <div style={{ padding: 20, textAlign: 'center', color: MUDO }}>Nenhum gasto no período.</div>}
    </Janela>
  )
}

function ListaSalarios({ porPessoa, detalhe, equipe, onFechar }: { porPessoa: Record<string, number>; detalhe: Record<string, { salario: number; comissao: number; comissaoPrevista: number; rescisao: number }>; equipe: { pessoa: string; salario: number; encargos: number }[]; onFechar: () => void }) {
  const linhas = Object.entries(porPessoa).sort((a, b) => b[1] - a[1])
  return (
    <Janela titulo={<>Pessoal no período · {brl2(linhas.reduce((s, [, v]) => s + v, 0))}</>} onFechar={onFechar} largura={720}>
      <div style={{ fontSize: 12.5, color: MUDO, marginBottom: 10 }}>Do RH (departamento Pós Vendas). Salário + encargos do <b>mês inteiro</b> (na semana e no dia, a parte daqueles dias), só entre a admissão e a demissão. Comissão: a lançada no RH; se o mês ainda não tem, a <b>prevista</b> pela regra do painel do Omie (no mês em andamento, projetada até o fim do mês). Rescisões/acertos pagos no Omie.</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {linhas.map(([p, v]) => {
          const e = equipe.find((x) => x.pessoa === p)
          return (
            <div key={p} className="gl-item" style={{ padding: '10px 12px' }}>
              <i style={{ background: '#7c3aed' }} />
              <b style={{ flex: 1 }}>{p}</b>
              <span style={{ color: MUDO, fontSize: 12.5 }}>
                {e ? `salário ${brl(detalhe[p]?.salario || 0)} (${brl(e.salario)} + ${brl(e.encargos)}/mês)` : ''}
                {detalhe[p]?.comissao ? ` · comissão (RH) ${brl(detalhe[p].comissao)}` : ''}
                {detalhe[p]?.comissaoPrevista ? ` · comissão PREVISTA ${brl(detalhe[p].comissaoPrevista)}` : ''}
                {detalhe[p]?.rescisao ? ` · rescisão/acertos ${brl(detalhe[p].rescisao)}` : ''}
              </span>
              <b style={{ color: '#7c3aed', minWidth: 90, textAlign: 'right' }}>{brl2(v)}</b>
            </div>
          )
        })}
      </div>
    </Janela>
  )
}

const ESTILO = `
.dm-caixa { position: relative; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 18px 20px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.dm-topo { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; margin-bottom: 14px }
.dm-resumo { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 12px }
.dm-resumo > i { color: var(--portal-text-muted, #cbd5e1); font-size: 13px }
.dm-resumo span { display: flex; flex-direction: column; line-height: 1.15 }
.dm-resumo small { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted, #94a3b8) }
.dm-resumo b { font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums }
.dm-resumo em { font-style: normal; font-size: 11.5px; color: var(--portal-text-muted, #94a3b8) }
.dm-medidor { display: flex; align-items: center; gap: 4px; background: var(--portal-bg-secondary, #f8fafc); border-radius: 16px; padding: 8px 14px 8px 8px }
.dm-med-txt { display: flex; flex-direction: column; line-height: 1.15 }
.dm-med-txt b { font-size: 30px; font-weight: 900 } .dm-med-txt small { font-size: 12.5px; color: var(--portal-text-muted, #64748b); font-weight: 700 }
.dm-med-txt span { font-size: 12px; font-weight: 800; margin-top: 4px }
.dm-fluxo { display: grid; grid-template-columns: 1fr; gap: 0 }
.dm-lado small { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted, #94a3b8); display: block; margin: 4px 0 6px }
.dm-barra { display: flex; height: 52px; gap: 3px }
.dm-fatia { border: none; border-radius: 10px; padding: 0 12px; color: #fefefe; font-family: inherit; display: flex; align-items: center; min-width: 0; cursor: pointer; transform-origin: left; animation: dnCresce .9s cubic-bezier(.2,.8,.2,1) both; transition: opacity .2s, filter .2s, transform .2s }
.dm-fatia:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-2px) }
.dm-fatia:disabled { cursor: default }
.dm-apagada { opacity: .25 }
.dm-fatia span { display: flex; flex-direction: column; line-height: 1.15; white-space: nowrap; overflow: hidden; text-align: left }
.dm-fatia b { font-size: 15px; font-weight: 900 } .dm-fatia small { font-size: 11.5px; opacity: .92; overflow: hidden; text-overflow: ellipsis }
@keyframes dnCresce { from { transform: scaleX(0); opacity: .3 } to { transform: none; opacity: 1 } }
.dm-fitas { width: 100%; height: 110px; display: block; margin: 3px 0 0 }
.dm-fitas path { transition: opacity .25s; animation: dmFita .7s ease both }
@keyframes dmFita { from { opacity: 0 } }
.dm-fita-on { animation: dmPulsa 1.6s ease-in-out infinite !important }
@keyframes dmPulsa { 50% { opacity: .75 } }
.dm-dica { position: absolute; z-index: 6; transform: translateX(-50%); width: 300px; pointer-events: none; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 12px 14px; box-shadow: 0 16px 40px rgba(15,23,42,.18); display: grid; gap: 4px; font-size: 13px; animation: stEntra .2s ease both }
.dm-dica > b { font-size: 15px } .dm-dica small { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #94a3b8); margin-top: 4px }
.dm-dica em { font-style: normal; font-size: 11.5px; color: #0369a1; font-weight: 700; margin-top: 4px }
.dm-dl { display: flex; align-items: center; gap: 8px } .dm-dl span { flex: 1; color: var(--portal-text-muted, #475569) } .dm-dl b { font-variant-numeric: tabular-nums }
.dm-dl i { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0 }
@media (max-width: 720px) { .dm-medidor { width: 100% } .dm-resumo b { font-size: 19px } .dm-fatia small { display: none } }

.ct-palco { position: relative; perspective: 1000px; --rx: 0deg; --ry: 0deg; --gx: 50%; --gy: 50% }
.ct-palco .ct { transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .2s, border-color .2s; transform-style: preserve-3d; display: grid; padding: 0; gap: 0 }
.ct-palco:hover .ct { transition: transform .08s linear, box-shadow .2s }
.ct-palco .ct.ct-virado { transform: rotateY(180deg) }
.ct-face { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; padding: 14px 16px 12px; display: grid; gap: 10px; border-radius: 18px; position: relative; overflow: hidden; align-content: start }
.ct-frente { cursor: pointer }
.ct-verso { transform: rotateY(180deg); background: linear-gradient(160deg, #f8fafc, #eef2ff); font-size: 13.5px }
.ct-brilho { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .2s; background: radial-gradient(400px circle at var(--gx) var(--gy), rgba(3,105,161,.10), transparent 45%) }
.ct-palco:hover .ct-brilho { opacity: 1 }
.ct-acoes { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--portal-border, #f1f5f9); padding-top: 8px }
.ct-acoes button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 4px 10px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--portal-text-muted, #475569); cursor: pointer }
.ct-acoes button:hover { border-color: #0369a1; color: #0369a1 }
.ct-acoes span { margin-left: auto; font-size: 11.5px; color: var(--portal-text-muted, #cbd5e1) }
.ct-volta { border: 1px solid #c7d2fe; background: #fefefe; color: #4f46e5; border-radius: 99px; padding: 4px 10px; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.ct-vbloco { display: grid; gap: 3px }
.ct-vbloco small { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #94a3b8) }
.ct-vl { display: flex; justify-content: space-between; gap: 10px } .ct-vl b { font-variant-numeric: tabular-nums; white-space: nowrap }
.ct-palco[draggable="true"] { cursor: grab }
.ct-arrastado { opacity: .45; transform: scale(.97) }
.ct-alvo .ct { border-color: #7c3aed !important; box-shadow: 0 0 0 4px rgba(124,58,237,.18), 0 18px 40px rgba(124,58,237,.18) }
.ct-solte { position: absolute; z-index: 5; inset: 10px 10px auto 10px; background: #7c3aed; color: #fefefe; border-radius: 12px; padding: 8px 12px; font-size: 13px; font-weight: 800; text-align: center; pointer-events: none; animation: stEntra .25s ease both }
.bq-flutua { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 9000; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); border-radius: 99px; padding: 8px 14px; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: 0 10px 28px rgba(15,23,42,.16) }
.bq-flutua:hover { border-color: #0369a1; color: #0369a1 }
.bq-flutua kbd, .bq-campo kbd, .bq-item kbd, .bq-kbd { font-family: inherit; font-size: 11px; font-weight: 800; background: var(--portal-bg-secondary, #f1f5f9); border: 1px solid var(--portal-border, #e2e8f0); border-bottom-width: 2px; border-radius: 6px; padding: 1px 6px; color: var(--portal-text-muted, #64748b) }
.bq-fundo { position: fixed; inset: 0; z-index: 100070; background: rgba(15,23,42,.4); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 0; animation: cmpFade .15s ease both }
@keyframes cmpFade { from { opacity: 0 } to { opacity: 1 } }
.bq-caixa { width: min(640px, 100%); background: var(--portal-bg-card, #fefefe); border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; animation: bqEntra .25s cubic-bezier(.2,1.1,.3,1) both }
@keyframes bqEntra { from { transform: translateY(-12px) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
.bq-campo { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb) }
.bq-campo i { color: #0369a1; font-size: 16px }
.bq-campo input { flex: 1; border: none; outline: none; font-family: inherit; font-size: 17px; background: transparent; color: var(--portal-text, #0f172a) }
.bq-lista { max-height: 55vh; overflow-y: auto; padding: 6px }
.bq-grupo { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted, #94a3b8); padding: 8px 12px 4px }
.bq-item { width: 100%; display: flex; align-items: center; gap: 10px; border: none; background: transparent; border-radius: 10px; padding: 9px 12px; font-family: inherit; font-size: 14px; color: var(--portal-text, #0f172a); cursor: pointer; text-align: left }
.bq-item i { width: 18px; color: var(--portal-text-muted, #94a3b8) }
.bq-item small { color: var(--portal-text-muted, #94a3b8); font-size: 12.5px; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.bq-on { background: #eff6ff } .bq-on i { color: #0369a1 }
@media (max-width: 720px) { .bq-flutua { display: none } .ct-acoes span { display: none } }

.dn-caixa { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 18px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.dn-topo { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: space-between; margin-bottom: 14px }
.dn-rot { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--portal-text-muted, #64748b) }
.dn-frase { font-size: 21px; font-weight: 700; color: var(--portal-text, #0f172a); margin-top: 2px }
.dn-frase b { font-weight: 900 }
.dn-resultado { display: flex; flex-direction: column; align-items: flex-end; border-radius: 14px; padding: 10px 16px }
.dn-resultado b { font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1 }
.dn-resultado small { font-size: 11.5px; font-weight: 700; opacity: .8 }
.dn-linha { display: flex; gap: 16px; align-items: flex-start; padding: 12px 0; border-top: 1px dashed var(--portal-border, #e5e7eb) }
.dn-lado { width: 150px; flex-shrink: 0; display: flex; flex-direction: column }
.dn-lado small { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.dn-lado small:first-child { font-weight: 800; text-transform: uppercase; letter-spacing: .5px }
.dn-lado b { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums }
.dn-barra { display: flex; height: 44px; border-radius: 12px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9); gap: 2px }
.dn-fatia { border: none; padding: 0 10px; color: #fefefe; font-family: inherit; display: flex; align-items: center; min-width: 0; cursor: pointer; transform-origin: left; animation: dnCresce .9s cubic-bezier(.2,.8,.2,1) both; transition: filter .15s }
.dn-fatia:hover:not(:disabled) { filter: brightness(1.12) }
.dn-fatia:disabled { cursor: default }
.dn-fatia span { display: flex; flex-direction: column; line-height: 1.1; white-space: nowrap; overflow: hidden; text-align: left }
.dn-fatia b { font-size: 14px; font-weight: 900 } .dn-fatia small { font-size: 11px; opacity: .9 }
@keyframes dnCresce { from { transform: scaleX(0); opacity: .3 } to { transform: none; opacity: 1 } }
.dn-legenda { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px }
.dn-legenda button { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; font-family: inherit; font-size: 13.5px; color: var(--portal-text-muted, #475569); padding: 3px 6px; border-radius: 8px; cursor: pointer }
.dn-legenda button:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9) }
.dn-legenda button:disabled { cursor: default }
.dn-legenda i { width: 11px; height: 11px; border-radius: 3px; display: inline-block }
.dn-legenda b { color: var(--portal-text, #0f172a) } .dn-legenda small { color: var(--portal-text-muted, #94a3b8) }
.dn-legenda em { font-style: normal; font-size: 12px; font-weight: 800; color: #0369a1 } .dn-legenda em i { width: auto; height: auto; background: none; font-size: 10px }
.ct { text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px 16px 12px; cursor: pointer; font-family: inherit; color: inherit; transition: box-shadow .2s, transform .2s, border-color .2s; min-width: 0; display: grid; gap: 10px }
.ct:hover { box-shadow: 0 14px 30px rgba(15,23,42,.10); border-color: #93c5fd }
.pt-troca { animation: ptTroca .45s cubic-bezier(.2,.8,.2,1) both }
@keyframes ptTroca { from { opacity: 0; transform: translateY(14px) scale(.995); filter: blur(2px) } to { opacity: 1; transform: none; filter: none } }
.pt-aviso-cartao { display: flex; gap: 10px; align-items: flex-start; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; font-size: 13.5px; line-height: 1.45 }
.pt-aviso-cartao i { margin-top: 3px } .pt-aviso-cartao a { color: #b45309; font-weight: 800 }
.ap { margin: 14px 0; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; background: var(--portal-bg-card, #fefefe); padding: 14px 16px }
.ap-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 10px } .ap-cab b { font-size: 16px } .ap-cab span { font-size: 13px; color: var(--portal-text-muted, #64748b) }
.ap-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px }
.ap-item { display: flex; gap: 12px; border-radius: 14px; padding: 12px; border: 1px solid transparent }
.ap-gar { background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-color: #ddd6fe } .ap-out { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border-color: #e2e8f0 }
.ap-ic { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 19px; flex-shrink: 0; background: #fefefe; color: #7c3aed }
.ap-out .ap-ic { color: #475569 }
.ap-nome { font-size: 15.5px; font-weight: 900; color: #0f172a } .ap-nome small { font-size: 12.5px; font-weight: 700; color: #64748b; margin-left: 4px }
.ap-desc { font-size: 12.5px; color: #64748b; margin: 2px 0 8px }
.ap-quem { margin-top: 8px; font-size: 12.5px; color: #6d28d9; font-weight: 700 }
.ap-nums { display: flex; gap: 8px; flex-wrap: wrap }
.ap-nums > * { display: flex; flex-direction: column; background: rgba(255,255,255,.8); border: none; border-radius: 10px; padding: 6px 10px; font-family: inherit; text-align: left; color: #0f172a }
.ap-nums button { cursor: pointer } .ap-nums button:hover:not(:disabled) { box-shadow: 0 0 0 2px #c4b5fd }
.ap-nums small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b } .ap-nums b { font-size: 14px; font-variant-numeric: tabular-nums }
.ct-grupo { width: 64px; height: 64px; border-radius: 50%; background: #f5f3ff; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0 }
.ct-topo { display: flex; gap: 12px; align-items: center }
.ct-nome { font-size: 17px; font-weight: 900; color: var(--portal-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ct-sub { font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin-top: 2px }
.ct-pts { font-size: 12.5px; font-weight: 800; border-radius: 99px; padding: 3px 9px; white-space: nowrap; align-self: flex-start }
.ct-rende { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; background: var(--portal-bg-secondary, #f8fafc); border-radius: 12px; padding: 8px 12px }
.ct-rende > div:first-child { display: flex; flex-direction: column; line-height: 1.1 }
.ct-rende small { font-size: 11.5px; color: var(--portal-text-muted, #64748b); font-weight: 700 }
.ct-rende b { font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums }
.ct-faisca { display: block }
.ct-dinheiro { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9) }
.ct-dinheiro i { display: block; height: 100%; transition: width .8s cubic-bezier(.2,.8,.2,1) }
.ct-nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.ct-nums span { display: flex; flex-direction: column }
.ct-nums small { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #94a3b8) }
.ct-nums b { font-size: 15.5px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ct-rodape { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--portal-text-muted, #94a3b8); border-top: 1px solid var(--portal-border, #f1f5f9); padding-top: 8px }
.gl-pessoa { border: 1px solid var(--portal-border, #e5e7eb); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px }
.gl-pessoa summary { display: flex; gap: 10px; align-items: center; cursor: pointer; font-size: 14px }
.gl-pessoa summary span { flex: 1; color: var(--portal-text-muted, #64748b); font-size: 12.5px }
.gl-item { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 5px 4px; border-radius: 8px }
.gl-item:hover { background: var(--portal-bg-secondary, #f8fafc) }
.gl-item i { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0 }
.gl-item small { color: var(--portal-text-muted, #94a3b8) }
@media (max-width: 720px) { .dn-linha { flex-direction: column; gap: 6px } .dn-lado { width: auto; flex-direction: row; gap: 8px; align-items: baseline } .dn-frase { font-size: 17px } .dn-resultado { align-items: flex-start } }

.pt-conta { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; margin-bottom: 14px }
.pt-passo { flex: 1 1 200px; display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px; font-family: inherit; color: inherit; min-width: 0 }
button.pt-passo { cursor: pointer; transition: box-shadow .2s, transform .2s }
button.pt-passo:hover { box-shadow: 0 8px 20px rgba(15,23,42,.08); transform: translateY(-2px) }
.pt-final { border-width: 2px }
.pt-rot { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted, #64748b) }
.pt-val { font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.15 }
.pt-sub { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.pt-mini { display: flex; height: 6px; border-radius: 4px; overflow: hidden; margin-top: 6px; background: var(--portal-bg-secondary, #f1f5f9) }
.pt-mini i, .pt-barra i { display: block; height: 100%; transition: width .8s cubic-bezier(.2,.8,.2,1) }
.pt-op { align-self: center; font-size: 26px; font-weight: 900; color: var(--portal-text-muted, #94a3b8) }
.pt-horas { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px; margin-bottom: 14px }
.pt-barra { display: flex; border-radius: 6px; overflow: hidden; margin: 10px 0 8px; background: var(--portal-bg-secondary, #f1f5f9) }
.pt-legenda { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13.5px; color: var(--portal-text-muted, #475569) }
.pt-legenda > * { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; font-family: inherit; font-size: 13.5px; color: inherit; padding: 0 }
.pt-legenda button { cursor: pointer } .pt-legenda button:hover { color: #0369a1 }
.pt-legenda i { width: 11px; height: 11px; border-radius: 3px; display: inline-block }
.pt-legenda b { color: var(--portal-text, #0f172a) }
.pt-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; margin-bottom: 12px }
.pt-card { text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px 12px; cursor: pointer; font-family: inherit; color: inherit; transition: box-shadow .2s, transform .2s, border-color .2s; min-width: 0 }
.pt-card:hover { box-shadow: 0 10px 24px rgba(15,23,42,.09); transform: translateY(-2px); border-color: #93c5fd }
.pt-nome { font-size: 16.5px; font-weight: 900; color: var(--portal-text, #0f172a); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pt-pts { font-size: 12.5px; font-weight: 800; border-radius: 99px; padding: 2px 9px; white-space: nowrap }
.pt-nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-top: 4px }
.pt-nums span { display: flex; flex-direction: column }
.pt-nums small { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #94a3b8) }
.pt-nums b { font-size: 16px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) }
.pt-reqs { display: grid; grid-template-columns: minmax(260px, 380px) 1fr; gap: 14px; height: min(72vh, 760px) }
.pt-reqs-lista { overflow-y: auto; display: grid; gap: 8px; align-content: start; padding-right: 4px }
.pt-req { text-align: left; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 10px 12px; cursor: pointer; font-family: inherit; font-size: 13.5px; color: var(--portal-text, #0f172a); transition: border-color .15s, background .15s }
.pt-req:hover { border-color: #93c5fd }
.pt-req-on { border-color: #0369a1; background: #eff6ff; box-shadow: inset 3px 0 0 #0369a1 }
.pt-reqs-doc { display: flex; flex-direction: column; min-width: 0 }
.pt-reqs-frame { flex: 1; width: 100%; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 12px; background: #fefefe }
@media (max-width: 860px) { .pt-reqs { grid-template-columns: 1fr; height: auto } .pt-reqs-frame { height: 70vh } }
.pt-det { font-style: normal; font-size: 11.5px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pt-abrir { display: block; margin-top: 10px; font-size: 12.5px; font-weight: 800; color: #0369a1; opacity: .7 }
.pt-card:hover .pt-abrir { opacity: 1 }
.pt-sem { display: block; width: 100%; text-align: left; border: 1px dashed var(--portal-border, #cbd5e1); background: transparent; border-radius: 12px; padding: 9px 12px; font-family: inherit; font-size: 13px; color: var(--portal-text-muted, #64748b); cursor: pointer; margin-bottom: 14px }
.pt-sem:hover { color: #0369a1; border-color: #0369a1 }
.pt-metricas { display: flex; gap: 4px; flex-wrap: wrap }
.pt-metricas button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #64748b); cursor: pointer }
.pt-metricas .pt-m-on { background: #0369a1; border-color: #0369a1; color: #fefefe }
@media (max-width: 720px) { .pt-op { display: none } .pt-val { font-size: 23px } }
`

const btnSeta: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: '1px solid var(--portal-border, #e2e8f0)', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #334155)', cursor: 'pointer', fontFamily: 'inherit' }


function Janela({ titulo, children, onFechar, largura = 760 }: { titulo: React.ReactNode; children: React.ReactNode; onFechar: () => void; largura?: number }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onFechar} className="cpv-fundo" style={{ position: 'fixed', inset: 0, zIndex: 100050, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="cpv-abre" style={{ width: '100%', maxWidth: largura, maxHeight: '90vh', overflowY: 'auto', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #0f172a)', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--portal-border, #e2e8f0)', position: 'sticky', top: 0, background: 'var(--portal-bg-card, #fefefe)' }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{titulo}</div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ ...btnSeta, borderRadius: 17 }}><i className="fas fa-xmark" /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

function TabelaOS({ os }: { os: OSFaturada[] }) {
  if (!os.length) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted, #94a3b8)', fontSize: 13 }}>Nenhuma OS faturada no período.</div>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {os.map((o) => (
        <a key={o.os} href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer" className="cpv-linha"
          style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--portal-border, #e2e8f0)', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.os}{o.numeroOmie && !o.os.startsWith('OMIE') ? <span style={{ fontWeight: 600, color: 'var(--portal-text-muted, #64748b)' }}> · Omie {o.numeroOmie}</span> : null}</div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{br(o.data)} · {o.cliente || 'cliente no Omie'} · {horas(o.horasCobradas)} · {kmFmt(o.km)}{o.tecnicos.length > 1 ? ` · ${o.tecnicos.join(' + ')}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{brl2(o.bruto)}</div>
            <div style={{ color: 'var(--portal-text-muted, #64748b)' }}>serv {brl(o.servico)} · km {brl(o.kmValor)} · peças {brl(o.pecas)}</div>
            {o.custo > 0 && <div style={{ color: COR.custo }}>custo {brl2(o.custo)} → líquido {brl2(o.bruto - o.custo)}</div>}
          </div>
        </a>
      ))}
    </div>
  )
}

function ListaInternas({ internas, onFechar }: { internas: OSInterna[]; onFechar: () => void }) {
  return (
    <Janela titulo="OS internas no período" onFechar={onFechar}>
      <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginBottom: 12, lineHeight: 1.5 }}>
        Conta como interna (não cobrada do cliente): tipo de serviço interno no portal, conta corrente interna no Omie
        ou Nº do Contrato de Venda interno (entrega técnica, cortesia, pré-entrega…). Contrato “-pgo” não é interno: a montadora paga.
        As horas são as do relatório do app no período.
      </div>
      {!internas.length ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted, #94a3b8)', fontSize: 13 }}>Nenhuma hora em OS interna no período.</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {internas.map((o) => (
            <a key={o.os} href={`/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer" className="cpv-linha"
              style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--portal-border, #e2e8f0)', borderLeft: `4px solid ${COR.internas}`, borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.os} <span style={{ fontWeight: 700, fontSize: 11.5, color: COR.internas, background: 'rgba(139,92,246,.1)', borderRadius: 99, padding: '1px 8px', marginLeft: 4 }}>{o.motivo}</span></div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.cliente || '—'} · {o.tecnicos.join(' + ')}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 15, color: COR.internas, whiteSpace: 'nowrap' }}>{horas(o.horas)}</div>
            </a>
          ))}
        </div>
      )}
    </Janela>
  )
}

type ReqLinha = { id: number; tipo: string; valor: number; status: string; titulo: string; fornecedor: string; data: string; solicitante: string; nota: string | null; os: string; cliente: string }

/** Custo de terceiros: as requisições e o documento de cada uma ali mesmo (sem sair da tela). */
function ListaRequisicoes({ reqs, onFechar }: { reqs: ReqLinha[]; onFechar: () => void }) {
  const [sel, setSel] = useState<ReqLinha | null>(reqs[0] || null)
  const [ver, setVer] = useState<'req' | 'nota'>('req')
  const total = reqs.reduce((s, r) => s + r.valor, 0)
  return (
    <Janela titulo={<>Custo de terceiros · {brl2(total)} <span style={{ fontSize: 13, fontWeight: 600, color: MUDO }}>· requisições Trator-Cliente não cobradas do cliente</span></>} onFechar={onFechar} largura={1240}>
      {!reqs.length ? <div style={{ padding: 30, textAlign: 'center', color: MUDO }}>Nenhuma requisição de terceiros no período.</div> : (
        <div className="pt-reqs">
          <div className="pt-reqs-lista">
            {reqs.map((r) => (
              <button key={r.id} type="button" className={`pt-req ${sel?.id === r.id ? 'pt-req-on' : ''}`} onClick={() => { setSel(r); setVer('req') }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <b style={{ flex: 1 }}>#{r.id} · {r.tipo}</b>
                  <b style={{ color: COR.custo }}>{brl2(r.valor)}</b>
                </div>
                <div style={{ fontSize: 12.5, color: MUDO, marginTop: 2 }}>{r.fornecedor || r.titulo || '—'}</div>
                <div style={{ fontSize: 12, color: MUDO, marginTop: 2 }}>{r.os} · {r.cliente || '—'} · {r.data ? br(r.data) : ''} · {r.solicitante || '—'} · {r.status}</div>
              </button>
            ))}
          </div>
          <div className="pt-reqs-doc">
            {sel && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <div className="pt-metricas">
                    <button type="button" className={ver === 'req' ? 'pt-m-on' : ''} onClick={() => setVer('req')}>Requisição</button>
                    <button type="button" className={ver === 'nota' ? 'pt-m-on' : ''} disabled={!sel.nota} onClick={() => setVer('nota')} title={sel.nota ? 'Ver a nota anexada' : 'Sem nota anexada'}>Nota anexada</button>
                  </div>
                  <a href={ver === 'nota' && sel.nota ? sel.nota : `/requisicoes/imprimir/${sel.id}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#0369a1' }}>abrir em nova aba <i className="fas fa-arrow-up-right-from-square" /></a>
                </div>
                <iframe key={`${sel.id}:${ver}`} src={ver === 'nota' && sel.nota ? sel.nota : `/requisicoes/imprimir/${sel.id}`} title={`Requisição ${sel.id}`} className="pt-reqs-frame" />
              </>
            )}
          </div>
        </div>
      )}
    </Janela>
  )
}

function ListaOS({ titulo, os, onFechar }: { titulo: string; os: OSFaturada[]; onFechar: () => void }) {
  return <Janela titulo={<>OS faturadas · {titulo}</>} onFechar={onFechar}><TabelaOS os={os} /></Janela>
}

function FichaTecnico({ tecnico, linha, dias, os, gasto, salario, onFechar }: { tecnico: string; linha?: LinhaTecnico; dias: DiaRegistrado[]; os: OSFaturada[]; gasto?: { abastecimento: number; manutencao: number; alimentacao: number; materiais: number; total: number; litros: number; foraDasOS: number }; salario: number; onFechar: () => void }) {
  const porDia = Object.entries(dias.reduce<Record<string, { cliente: number; interna: number }>>((m, x) => {
    const k = (m[x.data] ||= { cliente: 0, interna: 0 }); if (x.interna) k.interna += x.horas; else k.cliente += x.horas; return m
  }, {})).sort().map(([data, v]) => ({ dia: br(data), Cliente: Math.round(v.cliente * 10) / 10, Interna: Math.round(v.interna * 10) / 10 }))
  return (
    <Janela titulo={tecnico} onFechar={onFechar} largura={860}>
      {linha && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kpi titulo="Faturadas" valor={linha.faturadas} formato={horas} cor={COR.faturadas} sub={linha.meta ? `${Math.round(((linha.faturadas + linha.aguardando + linha.internas) / linha.meta) * 100)}% da meta` : undefined} />
          <Kpi titulo="Internas" valor={linha.internas} formato={horas} cor={COR.internas} atraso={60} />
          <Kpi titulo="Ociosas" valor={linha.ociosas} formato={horas} cor="#64748b" atraso={120} />
          <Kpi titulo="Km" valor={linha.km} formato={kmFmt} cor={COR.km} atraso={180} />
          <Kpi titulo="Gastos" valor={gasto?.total || 0} formato={brl} cor={COR_GASTO} atraso={210} sub={`abastec. ${brl(gasto?.abastecimento || 0)} · manut. ${brl(gasto?.manutencao || 0)} · alim. ${brl(gasto?.alimentacao || 0)} · mat. ${brl(gasto?.materiais || 0)}`} />
          <Kpi titulo="Pessoal" valor={salario} formato={brl} cor="#7c3aed" atraso={225} sub="salário, comissão e encargos no período" />
          <Kpi titulo="Resultado" valor={linha.liquido - (gasto?.foraDasOS || 0) - salario} formato={brl} cor={COR_RESULT} destaque atraso={240} sub={`faturado ${brl(linha.bruto)} − terceiros − gastos − salário`} />
        </div>
      )}
      <div style={{ fontSize: 13.5, fontWeight: 800, margin: '4px 0 8px' }}>Horas registradas no app, por dia</div>
      {porDia.length ? (
        <div style={{ height: 200, marginBottom: 14 }}>
          <ResponsiveContainer>
            <BarChart data={porDia}>
              <XAxis dataKey="dia" tick={{ fontSize: 11.5 }} />
              <YAxis tick={{ fontSize: 11 }} width={30} />
              <Tooltip formatter={(v: number) => horas(v)} />
              <ReferenceLine y={8} stroke="#0f172a" strokeDasharray="5 4" label={{ value: '8 h', position: 'right', fontSize: 11 }} />
              <Bar dataKey="Cliente" stackId="d" fill={COR.faturadas} radius={[0, 0, 0, 0]} animationDuration={800} />
              <Bar dataKey="Interna" stackId="d" fill={COR.internas} radius={[6, 6, 0, 0]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #94a3b8)', marginBottom: 14 }}>Nenhum relatório do app no período.</div>}
      <div style={{ fontSize: 13.5, fontWeight: 800, margin: '4px 0 8px' }}>OS faturadas no período</div>
      <TabelaOS os={os} />
    </Janela>
  )
}

/** Títulos de seção + bolinhas numeradas, para outras abas do Centro usarem igual ao Painel. */
export const ESTILO_ASSUNTOS = ESTILO_SECAO + ESTILO_TRILHO
