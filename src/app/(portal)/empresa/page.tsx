'use client'
// COMO ESTÁ A EMPRESA — tela dos diretores (José, 10/11/2026).
// Pedido: "números de cada setor: Peças faturou isso até agora, mas está perdendo isso; mesma coisa para o Pós-Vendas e
// o Comercial; com gráficos de pizza e explicando tudo — não precisa na mesma página: um modal explica uma coisa, e o
// modal que explica o modal…". Aplicando:
//   • Controller  → a conta de cada setor (faturou − para onde foi = sobrou), igual a um DRE por setor
//   • FP&A        → realizado × mês passado e projeção ("no ritmo atual, fecha o mês em…")
//   • BI          → pizza clicável e drill-down em janelas empilhadas (setor → fatia → família/técnico → itens/OS)
//   • Analista    → cada janela tem "o que é isso?" (outra janela explicando o termo)
//
// Mesmas contas das telas oficiais (nada novo):
//   • Empresa     → /api/dre-financeiro/home/kpis (DRE do Financeiro)
//   • Pós-Vendas  → /api/mecanicos/base + montarPainel (= Gestão Pós-Vendas)
//   • Comercial e Peças → /api/gestao-vendas/familias + /custos; itens sob demanda em /api/gestao-vendas/mes
//   • "Deixando de ganhar" → Planta Viva (/api/planta e /api/planta/kpi/<id>) + descontos das OS + Pátio
// Quem vê: admin, dev ou diretor (portal_permissoes.is_diretor).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, HelpCircle, RefreshCw, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { SETORES, corDoSetor } from '@/lib/dashboard/setores'
import { montarPainel } from '@/lib/mecanicos/painel'
import { totalCusto } from '@/lib/gestao-vendas/calculos'
import type { CustoMensalVendedor, VendaEnriquecida } from '@/lib/gestao-vendas/tipos'
import type { DadosComercial } from '@/lib/empresa/comercial'
import { PainelComercial, JanelaComercial, CSS_CM, type JanelaCm } from './comercial'
import { CSS_CML } from './comercial-assuntos'
import { CSS_CMT2 } from './comercial-telas'
import { CSS_CDP } from './comercial-despesas'
import { CSS_CPF } from './comercial-propostas'
import { PainelPosVendas, CSS_CPV } from './posvendas'
import { PainelPecas, CSS_CPC } from './pecas'
import { FrotaMapaCards, CSS_CFR } from './frota'
import { PainelRequisicoes, CSS_CRQ } from './requisicoes'

// ── fontes ─────────────────────────────────────────────────────────────────────
type Sit = 'verde' | 'amarelo' | 'vermelho'
// /api/dre-financeiro/dre → consolidado[tipo].grupos[grupo].contas[conta] (valores de despesa vêm negativos)
interface NoDre { total: number; count: number; por_mes: Record<string, number> }
interface ArvDre { [tipo: string]: NoDre & { grupos: { [g: string]: NoDre & { contas: { [c: string]: NoDre } } } } }
interface Kpi { kpi_id: string; contagem: number; valor: number | null; lacrado: boolean; detalhe?: Record<string, unknown> }
// GET /api/frota/hoje (a aba Hoje da Frota)
interface FrotaHoje {
  ativos: number; parados: { placa: string; modelo: string; motivos: string[] }[]
  graves: { placa: string; titulo: string; modelo: string }[]
  documentos: { placa: string; modelo: string; tipo: string; vigencia_fim: string; vencido: boolean; dias: number }[]
  checklists?: { resumo: { total: number; pendente: number } }
  combustivel?: { ultimos30: { gasto: number; litros: number; abastecimentos: number }; anteriores30: { gasto: number; litros: number; abastecimentos: number } }
}
interface Familia { nome: string; venda: number; cmc: number; qtd: number; vendaMesAnt: number }
interface Res { receitaBruta: number; cmv: number; lucroBruto: number; despesas: number; resultado: number }
interface Home { resultado_mes: Res | null; resultado_mes_anterior: Res | null; vencimentos_7d?: { a_receber: number; a_pagar: number; liquido: number }; capital_parado?: { valor: number; corrosao_mes: number } }
interface Maquina { codigo_produto: number; descricao: string; familia_nome: string; valor_estoque: number; custo_capital_mes: number; dias_em_estoque: number; estoque: number }
interface Registro { chave: string; titulo: string; sub: string; valor: number | null }
type Painel = ReturnType<typeof montarPainel>
type K = 'comercial' | 'posvendas' | 'pecas'

// ── janelas (empilham: cada uma pode abrir outra) ───────────────────────────────
type Janela =
  | { tipo: 'setor'; k: K }
  | { tipo: 'fatia'; k: K; id: string }
  | { tipo: 'familia'; nome: string }
  | { tipo: 'tecnico'; nome: string }
  | { tipo: 'kpi'; id: string; nome: string }
  | { tipo: 'cm'; id: JanelaCm; nome: string }
  | { tipo: 'maquinas'; so90: boolean }
  | { tipo: 'termo'; id: keyof typeof TERMOS }
  | { tipo: 'empresa' }
  | { tipo: 'ajuste'; nome: string; explica: string; valor: number; qtd: number }
  | { tipo: 'dreGrupo'; tipoDre: string; grupo: string }
  | { tipo: 'dreConta'; tipoDre: string; grupo: string; conta: string }

interface Fatia { id: string; nome: string; valor: number; cor: string }
interface Perda { id: string; nome: string; valor: number; dinheiro: boolean; sub: string; abre: Janela | null }
interface Setor { k: K; nome: string; faturou: number; ant: number | null; fatias: Fatia[]; sobrou: number; perdas: Perda[]; ok: boolean; aviso: string }

const NOME: Record<K, string> = { comercial: 'Comercial', posvendas: 'Pós-Vendas', pecas: 'Peças' }
const COR: Record<Sit, string> = { verde: '#16a34a', amarelo: '#d97706', vermelho: '#dc2626' }
const LUCRO = '#16a34a'
const E_PECA = /pe[çc]a/i
const NAO_E_MAQUINA = /requisi[cç][aã]o/i

// glossário: o "o que é isso?" de cada janela
const TERMOS = {
  faturou: { t: 'Faturou', x: 'Tudo o que saiu com nota no mês até hoje: as notas de produto (máquinas e peças) e, na oficina, as notas de serviço. É o dinheiro que a empresa tem direito de receber, mesmo que o cliente ainda não tenha pago.' },
  sobrou: { t: 'Sobrou (lucro do setor)', x: 'O que fica depois de tirar do faturado tudo o que o setor gastou para faturar: o custo do que foi vendido, o pessoal e os gastos do próprio setor. Não inclui as despesas gerais da empresa (aluguel, contador, etc.), que aparecem só no resultado da empresa.' },
  custo_mercadoria: { t: 'Custo da mercadoria', x: 'Quanto a empresa pagou pela máquina ou pela peça que foi vendida (o CMC, custo médio do Omie). Se uma peça foi vendida por R$ 100 e custou R$ 60, o custo da mercadoria é R$ 60 e sobraram R$ 40.' },
  margem: { t: 'Margem', x: 'Quanto sobra de cada R$ 100 vendidos. Margem de 30% quer dizer que, de cada R$ 100, ficaram R$ 30 depois do custo. Quanto maior, melhor.' },
  projecao: { t: 'No ritmo atual', x: 'Conta simples de quem planeja: pega o que foi faturado até hoje, divide pelos dias que já passaram e multiplica pelos dias do mês. Mostra onde o mês vai fechar se continuar no mesmo passo. Não considera vendas grandes que ainda vão acontecer.' },
  deixando: { t: 'Deixando de ganhar', x: 'Dinheiro que já devia estar na empresa e não está: serviço pronto sem nota, pedido aberto sem faturar, máquina parada custando juros, desconto dado. Não é prejuízo ainda, mas é dinheiro travado ou que escapou.' },
  terceiros: { t: 'Pago a terceiros', x: 'O que a oficina pagou para outras empresas para fazer o serviço do cliente (torno, peça comprada fora, frete). Vem das requisições ligadas às OS.' },
  gastos_fora: { t: 'Gastos fora das OS', x: 'Combustível, manutenção dos carros, alimentação e materiais dos técnicos que não foram cobrados de nenhum cliente. É custo do setor.' },
  equipe: { t: 'Equipe', x: 'Salário com encargos (INSS, FGTS, férias), comissões e rescisões das pessoas do setor no mês. A comissão do mês que ainda não foi lançada no RH entra como prevista.' },
  vendedores: { t: 'Vendedores', x: 'Salário, encargos, carro, combustível e manutenção de cada vendedor no mês, como estão lançados na Gestão de Vendas → Custos.' },
  descontos: { t: 'Descontos dados', x: 'Quanto foi abatido nas OS faturadas: desconto na hora, no km, desconto geral e desconto nas peças. É dinheiro que a empresa abriu mão.' },
  dre: { t: 'Resultado da empresa (DRE)', x: 'A conta oficial do Financeiro: tudo o que entrou menos o custo do que foi vendido menos TODAS as despesas da empresa (pessoal, contas, impostos, aluguel…). Por isso é diferente da soma dos setores.' },
  gerencial: { t: 'DRE gerencial', x: 'É o DRE do Omie com três correções de controladoria: (1) compras de máquinas e peças para revenda saem do custo, porque são estoque — o custo entra quando a venda acontece; (2) o pagamento do principal dos empréstimos sai das despesas, porque só os juros são despesa; (3) compra de bens da empresa (investimentos) fica fora. Cada lançamento vai para o setor pelo departamento do Omie ou pela categoria da venda, e o que é da empresa toda (administrativo, financeiro) é dividido pela parte de cada setor na receita do mês.' },
  rateio: { t: 'Parte das despesas gerais', x: 'Despesas que são da empresa toda (administrativo, pessoal sem departamento, despesas financeiras gerais) divididas entre os setores pela parte de cada um na receita do mês. Se o Comercial vendeu 80% do total, ele leva 80% dessas despesas.' },
  capital: { t: 'Dinheiro parado', x: 'Máquina no estoque é dinheiro que já saiu do caixa e ainda não voltou. Calculamos quanto esse dinheiro renderia na taxa Selic: é o custo de deixar a máquina parada.' },
} as const

// ── formatação ─────────────────────────────────────────────────────────────────
const compacto = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`
  return `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const num = (v: number) => Math.round(v).toLocaleString('pt-BR')
const pct = (v: number, c = 0) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: c })}%`
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// itens vendidos do mês (pesado: só busca quando alguém abre uma família)
let vendasMesCache: Promise<VendaEnriquecida[]> | null = null
function carregarVendasMes(): Promise<VendaEnriquecida[]> {
  if (!vendasMesCache) {
    const d = new Date()
    vendasMesCache = authHeaders().then((h) => fetch(`/api/gestao-vendas/mes?mes=${d.getMonth() + 1}&ano=${d.getFullYear()}&conta=TODAS`, { headers: h, cache: 'no-store' }))
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => (j.vendas || []) as VendaEnriquecida[])
      .catch((e) => { vendasMesCache = null; throw e })
  }
  return vendasMesCache
}

// ── pizza (rosca) clicável ─────────────────────────────────────────────────────
function Pizza({ fatias, tam = 150, onFatia, centro }: { fatias: Fatia[]; tam?: number; onFatia?: (f: Fatia) => void; centro?: ReactNode }) {
  const pos = fatias.filter((f) => f.valor > 0)
  const total = pos.reduce((a, f) => a + f.valor, 0)
  const R = 40, C = 2 * Math.PI * R
  const inicio = pos.map((_, i) => pos.slice(0, i).reduce((a, f) => a + f.valor, 0) / (total || 1))
  return (
    <div className="ce-pizza" style={{ width: tam, height: tam }}>
      <svg viewBox="0 0 100 100" width={tam} height={tam}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--portal-bg-secondary)" strokeWidth="16" />
        {pos.map((f, i) => (
          <circle key={f.id} cx="50" cy="50" r={R} fill="none" stroke={f.cor} strokeWidth="16" className="ce-fatia"
            strokeDasharray={`${(f.valor / total) * C} ${C}`} strokeDashoffset={-inicio[i] * C} transform="rotate(-90 50 50)"
            onClick={onFatia ? () => onFatia(f) : undefined} style={{ cursor: onFatia ? 'pointer' : 'default' }}>
            <title>{f.nome}: {brl(f.valor)} ({pct((f.valor / total) * 100)})</title>
          </circle>
        ))}
      </svg>
      {centro && <div className="ce-pizza-centro">{centro}</div>}
    </div>
  )
}

// ── DRE GERENCIAL (src/lib/empresa/dre-gerencial.ts via /api/empresa/dre-gerencial) ─────────────────────
interface LinhasG { receita: number; deducoes: number; custos: number; margem: number; outrasReceitas: number; despesas: number; rateio: number; resultado: number }
interface MesG { mes: string; parcial: boolean; setores: Record<K, LinhasG>; empresa: LinhasG; omie: number; ajustes: Array<{ id: string; nome: string; explica: string; valor: number; qtd: number }>; parteReceita: Record<K, number> }
const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotMes = (k: string) => NOME_MES[Number(k.slice(5, 7)) - 1]
/** valor em mil, no padrão de relatório gerencial (IBCS): sem "R$", unidade no cabeçalho */
const mil = (v: number) => { const x = Math.round(v / 1000); return x === 0 ? '0' : `${x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('pt-BR')}` }
const CINZA_AC = '#404040' // realizado (IBCS: cinza escuro cheio)

/** IBCS — colunas de resultado por mês. Mesma escala entre os gráficos (escala), mês parcial hachurado. */
function ColunasMes({ meses, valor, escala, alto = 92, rotulos = true }: { meses: MesG[]; valor: (m: MesG) => number; escala: number; alto?: number; rotulos?: boolean }) {
  const w = 30, gap = 10, W = meses.length * (w + gap), base = alto / 2, k = (alto / 2 - 14) / (escala || 1)
  return (
    <svg viewBox={`0 0 ${W} ${alto + (rotulos ? 14 : 0)}`} className="ib-col" style={{ width: '100%', maxWidth: W * 1.6 }}>
      <defs><pattern id="ib-hach" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff" /><line x1="0" y1="0" x2="0" y2="4" stroke={CINZA_AC} strokeWidth="2" /></pattern></defs>
      <line x1="0" x2={W} y1={base} y2={base} stroke={CINZA_AC} strokeWidth="1" />
      {meses.map((m, i) => {
        const v = valor(m), h = Math.max(1.5, Math.abs(v) * k), x = i * (w + gap) + gap / 2, y = v >= 0 ? base - h : base
        return (
          <g key={m.mes}>
            <rect x={x} y={y} width={w} height={h} fill={m.parcial ? 'url(#ib-hach)' : CINZA_AC} stroke={CINZA_AC} strokeWidth={m.parcial ? 1 : 0} className="ib-barra" style={{ animationDelay: `${i * 60}ms` }} />
            <text x={x + w / 2} y={v >= 0 ? y - 3 : y + h + 10} textAnchor="middle" className={`ib-num${v < 0 ? ' ib-neg' : ''}`}>{mil(v)}</text>
            {rotulos && <text x={x + w / 2} y={alto + 11} textAnchor="middle" className="ib-rot">{rotMes(m.mes)}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** IBCS — conta do setor em barras horizontais (cascata): cada linha soma ou tira do resultado. */
function CascataH({ linhas }: { linhas: Array<{ nome: string; v: number; total?: boolean; onClick?: () => void }> }) {
  // acumulado de cada passo calculado antes do render (sem reatribuir variável dentro do map)
  // cada passo começa onde o anterior terminou: no último total (ex.: resultado do Omie) mais o que veio depois dele
  const passos = linhas.map((l, i) => {
    if (l.total) return { ...l, ini: 0, fim: l.v }
    let j = i - 1, soma = 0
    while (j >= 0 && !linhas[j].total) { soma += linhas[j].v; j-- }
    const ini = (j >= 0 ? linhas[j].v : 0) + soma
    return { ...l, ini, fim: ini + l.v }
  })
  const vals = passos.flatMap((p) => [p.ini, p.fim, 0]), min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1
  const x = (v: number) => ((v - min) / amp) * 100
  return (
    <div className="ib-cascata">
      {passos.map((p, i) => (
        <button key={p.nome} className={`ib-casc-linha${p.total ? ' ib-total' : ''}`} onClick={p.onClick} disabled={!p.onClick}>
          <span className="ib-casc-nome">{p.nome}</span>
          <span className="ib-casc-trilho"><span className="ib-zero" style={{ left: `${x(0)}%` }} />
            <span className="ib-casc-barra" style={{ left: `${x(Math.min(p.ini, p.fim))}%`, width: `${Math.max(.6, Math.abs(x(p.fim) - x(p.ini)))}%`,
              background: p.total ? CINZA_AC : p.v >= 0 ? '#7f7f7f' : '#c0c0c0', animationDelay: `${i * 70}ms` }} /></span>
          <span className={`ib-casc-val${p.v < 0 ? ' ib-neg' : ''}`}>{p.total ? '' : p.v >= 0 ? '+' : ''}{mil(p.v)}</span>
        </button>
      ))}
    </div>
  )
}

function Conta({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  const [v, setV] = useState(0)
  const de = useRef(0)
  useEffect(() => {
    const ini = de.current, t0 = performance.now()
    let raf = 0
    const passo = (t: number) => { const p = Math.min(1, (t - t0) / 800); setV(ini + (valor - ini) * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(passo); else de.current = valor }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor])
  return <>{formato(v)}</>
}

export default function ComoEstaAEmpresa() {
  const isMobile = useIsMobile()
  const { log } = useAuditLog()
  const { userProfile } = useAuth()
  const { permissoes, isAdmin, isDev, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const ehDiretor = isAdmin || isDev || (permissoes as unknown as { is_diretor?: boolean } | null)?.is_diretor === true

  const [home, setHome] = useState<Home | null>(null)
  const [painel, setPainel] = useState<Painel | null>(null)
  const [familias, setFamilias] = useState<Familia[] | null>(null)
  const [custos, setCustos] = useState<CustoMensalVendedor[] | null>(null)
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [maquinas, setMaquinas] = useState<Maquina[] | null>(null)
  const [frota, setFrota] = useState<FrotaHoje | null>(null)
  const [dre, setDre] = useState<ArvDre | null>(null)
  const [dreG, setDreG] = useState<MesG[] | null>(null)
  const [com, setCom] = useState<DadosComercial | null>(null) // área Comercial: vendas de máquinas, estoque, propostas, vendedores
  const [comErro, setComErro] = useState<string | null>(null)
  const [gravadoEm, setGravadoEm] = useState<{ com?: string | null; dre?: string | null }>({}) // quando o robô gravou cada área
  const [carregando, setCarregando] = useState(true)
  const [atualizado, setAtualizado] = useState<Date | null>(null)
  const [plantaEm, setPlantaEm] = useState<string | null>(null) // quando o agendador calculou a Planta Viva
  const [pilha, setPilha] = useState<Janela[]>([])
  // TESTE de distribuição (?teste=1) — José, 11/11: "preciso de opções"
  type Opcao = 'atual' | 'exec' | 'foco' | 'semaforo'
  const [opcao, setOpcao] = useState<Opcao>('foco')
  const [modoTeste, setModoTeste] = useState(false)
  type Area = 'geral' | 'financeiro' | K | 'patio' | 'frota' | 'requisicoes'
  const [foco, setFoco] = useState<Area>('geral')
  // a área aberta vai para o endereço (?area=comercial) — José, 12/11: "conforme entra nas abas, já muda a url"
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (foco === 'geral') u.searchParams.delete('area'); else u.searchParams.set('area', foco)
      if (u.toString() !== window.location.href) window.history.replaceState(null, '', u.toString())
    } catch { /* sem URL */ }
  }, [foco])
  const [capaOp, setCapaOp] = useState<'lista' | 'colunas' | 'bento' | 'grade'>('bento') // capa escolhida: 3 · Bento (José, 11/11); ?capa= ainda troca
  const [topoOp, setTopoOp] = useState<'lateral' | 'a' | 'b' | 'c' | 'd'>('c') // topo escolhido: C · cartões (José, 11/11); ?topo= ainda troca para comparar
  useEffect(() => {
    const t = setTimeout(() => {
      setModoTeste(new URLSearchParams(window.location.search).get('teste') === '1')
      const cp = new URLSearchParams(window.location.search).get('capa')
      if (cp === 'lista' || cp === 'colunas' || cp === 'bento' || cp === 'grade') setCapaOp(cp)
      const ar = new URLSearchParams(window.location.search).get('area')
      if (ar && ['financeiro', 'comercial', 'posvendas', 'pecas', 'frota', 'requisicoes'].includes(ar)) setFoco(ar as Area)
      const tp = new URLSearchParams(window.location.search).get('topo')
      if (tp === 'lateral' || tp === 'a' || tp === 'b' || tp === 'c' || tp === 'd') setTopoOp(tp)
      try { const o = localStorage.getItem('empresa-opcao'); if (o === 'atual' || o === 'exec' || o === 'foco' || o === 'semaforo') setOpcao(o) } catch { /* */ }
    }, 0)
    return () => clearTimeout(t)
  }, [])
  const escolherOpcao = (o: Opcao) => { setOpcao(o); try { localStorage.setItem('empresa-opcao', o) } catch { /* */ } }

  // forcar = "Atualizar agora": as áreas gravadas (Comercial, resultado dos setores) refazem a conta
  const carregar = useCallback(async (forcar = false) => {
    const recalc = forcar ? '?recalcular=1' : ''
    setCarregando(true)
    const h = await authHeaders()
    const d = new Date(), mes = d.getMonth() + 1, ano = d.getFullYear()
    const get = (u: string) => fetch(u, { headers: h, cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    const ini = new Date(ano, mes - 6, 1)
    // as áreas gravadas (Comercial, resultado dos setores) saem na frente — não esperam as buscas pesadas abaixo
    get(`/api/empresa/dre-gerencial${recalc}`).then((j) => { setDreG(Array.isArray(j?.meses) ? j.meses : null); setGravadoEm((g) => ({ ...g, dre: j?.calculadoEm || null })) }).catch(() => setDreG(null))
    get(`/api/empresa/comercial${recalc}`).then((j) => { if (Array.isArray(j?.vendas)) { setCom(j); setComErro(null); setGravadoEm((g) => ({ ...g, com: j.calculadoEm || null })) } else setComErro('Não deu para carregar o Comercial agora.') }).catch((st) => setComErro(st === 403 ? 'Sem acesso aos números do Comercial.' : 'Não deu para carregar o Comercial agora.'))
    const [rh, rb, rf, rc, rp, rm, rfr, rd] = await Promise.allSettled([
      get('/api/dre-financeiro/home/kpis?conta=todas'), get('/api/mecanicos/base'),
      get(`/api/gestao-vendas/familias?mes=${mes}&ano=${ano}&conta=TODAS`), get(`/api/gestao-vendas/custos?mes=${mes}&ano=${ano}&conta=TODAS`),
      get('/api/planta?conta=TODAS'), get('/api/empresa/maquinas') /* lista gravada (rápida), mesmo formato do pátio */, get('/api/frota/hoje'),
      get(`/api/dre-financeiro/dre?desde=${mesChave(ini)}&ate=${mesChave(d)}`),
    ])
    setHome(rh.status === 'fulfilled' && rh.value?.resultado_mes !== undefined ? rh.value : null)
    if (rb.status === 'fulfilled' && rb.value?.faturadas) { try { const hoje = hojeSP(); setPainel(montarPainel(rb.value, 'mes', hoje, hoje, true)) } catch { setPainel(null) } } else setPainel(null)
    setFamilias(rf.status === 'fulfilled' && Array.isArray(rf.value?.familias) ? rf.value.familias : null)
    setCustos(rc.status === 'fulfilled' && Array.isArray(rc.value?.custos) ? rc.value.custos : null)
    if (rp.status === 'fulfilled' && Array.isArray(rp.value?.kpis)) { setKpis(rp.value.kpis); setPlantaEm(rp.value.calculadoEm || null) }
    setFrota(rfr.status === 'fulfilled' && typeof rfr.value?.ativos === 'number' ? rfr.value : null)
    setDre(rd.status === 'fulfilled' && rd.value?.consolidado ? rd.value.consolidado : null)
    // DRE gerencial (6 meses) — vem depois, sem segurar a tela
    if (rm.status === 'fulfilled' && rm.value?.ambientes) {
      const amb = rm.value.ambientes as Record<string, Maquina[]>
      setMaquinas(Object.entries(amb).filter(([a]) => a !== 'demonstracao').flatMap(([, l]) => l).filter((m) => !NAO_E_MAQUINA.test(m.familia_nome || '')))
    }
    setAtualizado(new Date()); setCarregando(false)
  }, [])
  useEffect(() => { const t0 = setTimeout(() => carregar(), 0); const t = setInterval(() => carregar(), 300_000); return () => { clearTimeout(t0); clearInterval(t) } }, [carregar])
  useEffect(() => { log({ sistema: 'empresa', acao: 'acesso' }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = useCallback((j: Janela) => { setPilha((p) => [...p, j]); log({ sistema: 'empresa', acao: 'abrir', entidade: j.tipo }) }, [log])
  const nova = (j: Janela) => { setPilha([j]); log({ sistema: 'empresa', acao: 'abrir', entidade: j.tipo }) }
  const voltar = useCallback(() => setPilha((p) => p.slice(0, -1)), [])

  const porId = useMemo(() => Object.fromEntries(kpis.map((k) => [k.kpi_id, k])), [kpis])
  const diaHoje = new Date().getDate(), diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()

  // ── a conta de cada setor ──
  const setores = useMemo<Setor[]>(() => {
    const fam = familias || []
    const maq = fam.filter((f) => !E_PECA.test(f.nome)), pec = fam.filter((f) => E_PECA.test(f.nome))
    const soma = (l: Familia[], c: 'venda' | 'cmc' | 'vendaMesAnt') => l.reduce((a, f) => a + (f[c] || 0), 0)
    const kv = (id: string) => { const k = porId[id]; return k && !k.lacrado ? k : null }
    const vendTotal = (custos || []).reduce((a, c) => a + totalCusto(c), 0)
    const perdaKpi = (id: string, nome: string, sub: (k: Kpi) => string, dinheiro: boolean): Perda[] => {
      const k = kv(id); if (!k || !(dinheiro ? k.valor : k.contagem)) return []
      return [{ id, nome, valor: dinheiro ? (k.valor as number) : k.contagem, dinheiro, sub: sub(k), abre: { tipo: 'kpi', id, nome } }]
    }

    // Comercial
    const cFat = soma(maq, 'venda'), cCmc = soma(maq, 'cmc')
    const comercial: Setor = {
      k: 'comercial', nome: 'Comercial', faturou: cFat, ant: familias ? soma(maq, 'vendaMesAnt') : null, ok: !!familias, aviso: '',
      fatias: [{ id: 'custo', nome: 'Custo das máquinas', valor: cCmc, cor: '#f87171' }, { id: 'vendedores', nome: 'Vendedores', valor: vendTotal, cor: '#fb923c' }],
      sobrou: cFat - cCmc - vendTotal,
      perdas: [
        ...perdaKpi('maq_receb_esquecido', 'Recebimento de máquina esquecido', (k) => `${num(k.contagem)} notas da fábrica sem entrada`, true),
        ...perdaKpi('maq_recebida_sem_faturar', 'Máquinas chegaram e não faturaram', () => 'vendidas, ainda sem nota para o cliente', false),
      ],
    }
    // Pós-Vendas (mesma conta da Gestão Pós-Vendas)
    const t = painel?.total, g = painel?.gastos, eq = painel?.equipe, desc = painel?.despesas?.descontos
    const posvendas: Setor = {
      k: 'posvendas', nome: 'Pós-Vendas', faturou: t?.bruto || 0, ok: !!painel, aviso: 'o faturado inclui as peças vendidas nas OS (elas também contam em Peças)',
      ant: painel && painel.serie.length > 1 ? painel.serie[painel.serie.length - 2].total.bruto : null,
      fatias: [
        { id: 'terceiros', nome: 'Pago a terceiros', valor: t ? t.bruto - t.liquido : 0, cor: '#f87171' },
        { id: 'gastos', nome: 'Gastos fora das OS', valor: g?.foraDasOS || 0, cor: '#fb923c' },
        { id: 'salarios', nome: 'Salários e encargos', valor: eq?.salario || 0, cor: '#a78bfa' },
        { id: 'comissoes', nome: 'Comissões', valor: eq ? eq.comissao + eq.comissaoPrevista : 0, cor: '#f472b6' },
        { id: 'rescisoes', nome: 'Rescisões', valor: eq?.rescisao || 0, cor: '#94a3b8' },
      ],
      sobrou: t && g && eq ? t.liquido - g.foraDasOS - eq.total : 0,
      perdas: [
        ...perdaKpi('os_sem_faturar', 'Serviço pronto sem nota', (k) => `${num(k.contagem)} OS concluídas esperando faturar`, true),
        ...(desc?.total ? [{ id: 'desc', nome: 'Descontos dados nas OS', valor: desc.total, dinheiro: true, sub: `em ${num(desc.qtdOS)} OS · hora ${compacto(desc.hora)} · km ${compacto(desc.km)} · peças ${compacto(desc.pecas)}`, abre: { tipo: 'termo', id: 'descontos' } as Janela }] : []),
        ...perdaKpi('os_atrasada', 'OS atrasadas', () => 'passaram da data combinada', false),
      ],
    }
    // Peças
    const pcFat = soma(pec, 'venda'), pcCmc = soma(pec, 'cmc')
    const pecas: Setor = {
      k: 'pecas', nome: 'Peças', faturou: pcFat, ant: familias ? soma(pec, 'vendaMesAnt') : null, ok: !!familias, aviso: 'sem os salários do setor (não estão separados no portal)',
      fatias: [{ id: 'custo', nome: 'Custo das peças', valor: pcCmc, cor: '#f87171' }],
      sobrou: pcFat - pcCmc,
      perdas: [
        ...perdaKpi('ppv_pedido_aberto', 'Pedidos em aberto', () => 'pedidos de peça lançados e ainda sem nota', false),
        ...perdaKpi('ppv_remessa_aberta', 'Remessas em aberto', () => 'peça que saiu e não voltou nem virou venda', false),
        ...perdaKpi('estoque_negativo', 'Peças com estoque negativo', () => 'vendeu o que o sistema diz não ter', false),
      ],
    }
    return [comercial, posvendas, pecas]
  }, [familias, custos, painel, porId])

  const fatiasDe = useCallback((s: Setor): Fatia[] => [...s.fatias.filter((f) => f.valor > 0), ...(s.sobrou > 0 ? [{ id: 'lucro', nome: 'Sobrou', valor: s.sobrou, cor: LUCRO }] : [])], [])

  if (!loadingPerm && userProfile && !ehDiretor) return <SemPermissao />

  const r = home?.resultado_mes, ra = home?.resultado_mes_anterior
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  const origemFatias: Fatia[] = setores.map((s) => ({ id: s.k, nome: s.k === 'posvendas' ? 'Oficina (sem as peças)' : s.nome, valor: s.k === 'posvendas' && painel ? painel.total.servico + painel.total.kmValor + painel.total.outros : s.faturou, cor: corDoSetor(s.k) }))
  const totalFat = origemFatias.reduce((a, f) => a + f.valor, 0)
  const topo = pilha[pilha.length - 1]
  // voltar + mês + atualizar (no lugar do título, que saiu — José, 11/11: "tira esse título")
  const controles = (
    <>
      <Link href="/dashboard" className="ce-ico" aria-label="Voltar para a dashboard" title="Voltar para a dashboard"><ArrowLeft size={16} /></Link>
    </>
  )

  // rodapé: de quando é cada informação + atualizar agora (José, 11/11: "deixa lá embaixo escrito os tempos")
  const hm = (d: Date | string | null) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')
  // parada = mais de 90 min sem recalcular (o agendador roda de hora em hora)
  const plantaParada = !!plantaEm && (atualizado ? atualizado.getTime() : 0) - new Date(plantaEm).getTime() > 90 * 60_000
  const rodape = (
    <footer className="ce-rodape">
      <span><i className="fas fa-rotate" /> Esta tela se atualiza sozinha a cada 5 minutos · última às <b>{hm(atualizado)}</b></span>
      {plantaParada
        ? <span className="ce-rodape-alerta"><i className="fas fa-triangle-exclamation" /> Contas, requisições e situação das áreas: a Planta Viva não recalcula desde <b>{new Date(plantaEm!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</b></span>
        : <span>Contas, requisições e situação das áreas: Planta Viva, recalculada de hora em hora{plantaEm ? <> (última às <b>{hm(plantaEm)}</b>)</> : null}</span>}
      <span>Frota, pátio e oficina: na hora</span>
      <span>Comercial e resultado dos setores: guardados numa tabela, recalculados de 30 em 30 min{gravadoEm.com ? <> (Comercial às <b>{hm(gravadoEm.com)}</b>)</> : null}</span>
      <button className="ce-rodape-bt" onClick={() => carregar(true)} disabled={carregando}><RefreshCw size={13} className={carregando ? 'ce-gira' : ''} /> {carregando ? 'Atualizando…' : 'Atualizar agora'}</button>
    </footer>
  )

  // ── blocos reaproveitados ──
  const blocoEmpresa = (
    <>
        {/* EMPRESA */}
        <section className="ce-empresa">
          <Pizza fatias={origemFatias} tam={isMobile ? 104 : 108} onFatia={(f) => nova({ tipo: 'setor', k: f.id as K })}
            centro={<small>por setor</small>} />
          <div className="ce-emp-texto">
            <div className="ce-rot">A empresa em {mesNome}</div>
            <div className="ce-emp-linha">Faturou <b><Conta valor={totalFat} formato={compacto} /></b>
              {origemFatias.map((f) => <button key={f.id} className="ce-leg" onClick={() => nova({ tipo: 'setor', k: f.id as K })}><i style={{ background: f.cor }} />{f.nome} {totalFat ? pct((f.valor / totalFat) * 100) : ''}</button>)}
            </div>
            {r && (
              <button className="ce-emp-res" onClick={() => nova({ tipo: 'empresa' })}>
                Resultado da empresa até hoje: <b style={{ color: r.resultado >= 0 ? COR.verde : COR.vermelho }}>{r.resultado >= 0 ? 'lucro' : 'prejuízo'} de {compacto(Math.abs(r.resultado))}</b>
                {ra ? <> · mês passado: {ra.resultado >= 0 ? 'lucro' : 'prejuízo'} de {compacto(Math.abs(ra.resultado))}</> : null} <ChevronRight size={14} />
              </button>
            )}
          </div>
        </section>

    </>
  )
  // SETORES — 3 colunas iguais que cabem inteiras na tela (José, 10/11: "como designer sênior")
  const blocoSetores = (
        <div className="ce-setores">
          {setores.map((s) => {
            const Ic = SETORES.find((x) => x.key === s.k)?.icon
            const gastou = s.fatias.reduce((a, f) => a + f.valor, 0)
            // pizza: se sobrou, mostra para onde foi o faturado (custos + sobra); se perdeu, mostra só como se dividiram os gastos
            const fs = fatiasDe(s)
            const somaPizza = fs.reduce((a, f) => a + f.valor, 0) || 1
            const perdeu = s.sobrou < 0
            const perdasOrd = [...s.perdas].sort((x, y) => (y.dinheiro ? y.valor : 0) - (x.dinheiro ? x.valor : 0))
            const perdaR = s.perdas.filter((p) => p.dinheiro).reduce((a, p) => a + p.valor, 0)
            const ritmo = diaHoje ? (s.faturou / diaHoje) * diasMes : 0
            const vezes = s.faturou ? gastou / s.faturou : 0
            return (
              <section key={s.k} className="ce-setor" style={{ ['--cor' as string]: corDoSetor(s.k) }}>
                <button className="ce-setor-cab" onClick={() => nova({ tipo: 'setor', k: s.k })}>
                  {Ic && <span className="ce-setor-ico"><Ic size={16} /></span>}
                  <span className="ce-setor-nome">{s.nome}</span>
                  {s.ok && <span className="ce-selo" style={{ color: perdeu ? COR.vermelho : COR.verde, background: perdeu ? '#fef2f2' : '#f0fdf4' }}>{perdeu ? 'prejuízo' : 'lucro'} {compacto(Math.abs(s.sobrou))}</span>}
                </button>
                {!s.ok ? <div className="ce-mudo">{carregando ? 'Carregando…' : 'Sem acesso a estes números.'}</div> : (
                  <>
                    <div className="ce-meio">
                      <Pizza fatias={fs} tam={isMobile ? 130 : 138} onFatia={(f) => nova(f.id === 'lucro' ? { tipo: 'termo', id: 'sobrou' } : { tipo: 'fatia', k: s.k, id: f.id })}
                        centro={perdeu
                          ? <><small>gastou</small><b style={{ color: COR.vermelho }}>{vezes >= 1.95 ? `${vezes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : compacto(gastou)}</b><small>{vezes >= 1.95 ? 'o que faturou' : `faturou ${compacto(s.faturou)}`}</small></>
                          : <><small>de cada R$ 100</small><b style={{ color: COR.verde }}>{s.faturou ? `R$ ${Math.round((s.sobrou / s.faturou) * 100)}` : '—'}</b><small>sobram</small></>} />
                      <div className="ce-legenda">
                        <div className="ce-leg-tit">{perdeu ? 'Para onde foram os gastos' : 'Para onde foi o faturado'}</div>
                        {fs.map((f) => (
                          <button key={f.id} onClick={() => nova(f.id === 'lucro' ? { tipo: 'termo', id: 'sobrou' } : { tipo: 'fatia', k: s.k, id: f.id })}>
                            <i style={{ background: f.cor }} /><span>{f.nome}</span><em>{compacto(f.valor)}</em><b>{pct((f.valor / somaPizza) * 100)}</b>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ce-tres">
                      <button onClick={() => nova({ tipo: 'fatia', k: s.k, id: 'faturou' })}><small>Faturou</small><b><Conta valor={s.faturou} formato={compacto} /></b></button>
                      <button onClick={() => nova({ tipo: 'setor', k: s.k })}><small>Gastou</small><b style={{ color: COR.vermelho }}>{compacto(gastou)}</b></button>
                      <button onClick={() => nova({ tipo: 'setor', k: s.k })}><small>{perdeu ? 'Perdeu' : 'Sobrou'}</small><b style={{ color: perdeu ? COR.vermelho : COR.verde }}>{compacto(Math.abs(s.sobrou))}</b></button>
                    </div>
                    <div className="ce-perda">
                      <div className="ce-perda-cab"><span>Deixando de ganhar</span>{perdaR > 0 && <b>{compacto(perdaR)}</b>}
                        <button className="ce-oque" onClick={() => nova({ tipo: 'termo', id: 'deixando' })} aria-label="O que é isso?"><HelpCircle size={14} /></button></div>
                      {!s.perdas.length && <div className="ce-mudo">Nada travado agora.</div>}
                      {perdasOrd.slice(0, 2).map((p) => (
                        <button key={p.id} className="ce-perda-item" onClick={() => p.abre && nova(p.abre)}>
                          <span className="ce-dot" /><span className="ce-perda-txt"><b>{p.dinheiro ? compacto(p.valor) : num(p.valor)}</b> {p.nome}</span><ChevronRight size={14} style={{ opacity: .35, flexShrink: 0 }} />
                        </button>
                      ))}
                      {s.perdas.length > 2 && <button className="ce-ver" onClick={() => nova({ tipo: 'setor', k: s.k })}>ver as {s.perdas.length}</button>}
                    </div>
                    <button className="ce-fpa" onClick={() => nova({ tipo: 'termo', id: 'projecao' })}>
                      No ritmo atual fecha o mês em <b>{compacto(ritmo)}</b>
                      {s.ant ? <> · mês passado {compacto(s.ant)} <b style={{ color: ritmo >= s.ant ? COR.verde : COR.vermelho }}>{ritmo >= s.ant ? '▲' : '▼'} {pct(Math.abs(((ritmo - s.ant) / s.ant) * 100))}</b></> : null}
                    </button>
                  </>
                )}
              </section>
            )
          })}
        </div>
  )

  // números de caixa e operação (Planta Viva + Pátio + DRE)
  const kv = (id: string) => { const k = porId[id]; return k && !k.lacrado ? k : null }
  const rv = kv('receber_vencido'), pv = kv('pagar_vencido'), v7 = home?.vencimentos_7d
  const faixas = [
    { nome: 'até 30 dias', min: -1, max: 30, cor: '#16a34a' }, { nome: '31 a 90', min: 30, max: 90, cor: '#d97706' },
    { nome: '91 a 180', min: 90, max: 180, cor: '#ea580c' }, { nome: '+180 dias', min: 180, max: 1e9, cor: '#dc2626' },
  ].map((f) => { const l = (maquinas || []).filter((m) => m.dias_em_estoque > f.min && m.dias_em_estoque <= f.max); return { ...f, qtd: l.length, valor: l.reduce((a, m) => a + m.valor_estoque, 0) } })
  const estValor = faixas.reduce((a, f) => a + f.valor, 0), estQtd = faixas.reduce((a, f) => a + f.qtd, 0)
  const OPER = [
    { id: 'os_atrasada', nome: 'OS atrasadas' }, { id: 'zap_sem_resposta', nome: 'Clientes esperando no WhatsApp' }, { id: 'requisicoes_abertas', nome: 'Requisições em aberto' },
    { id: 'garantias_abertas', nome: 'Garantias abertas' }, { id: 'cheques_revisao_pendentes', nome: 'Cheques de revisão parados' }, { id: 'pecas_a_alocar', nome: 'Peças sem lugar' },
  ].map((o) => ({ ...o, k: kv(o.id) })).filter((o) => o.k)
  // cascata: lucro de cada setor → despesas gerais → resultado da empresa
  const somaSetores = setores.filter((x) => x.ok).reduce((a, x) => a + x.sobrou, 0)
  const passos = r ? [...setores.filter((x) => x.ok).map((x) => ({ nome: x.nome, valor: x.sobrou, cor: corDoSetor(x.k), abre: { tipo: 'setor', k: x.k } as Janela })),
    { nome: 'Despesas gerais e ajustes', valor: r.resultado - somaSetores, cor: '#64748b', abre: { tipo: 'empresa' } as Janela }] : []

  const blocoOperacao = (
    <div className="op">
      <div className="op-sec">
        <div className="op-tit">Pátio de máquinas <button className="ce-oque" onClick={() => nova({ tipo: 'termo', id: 'capital' })}><HelpCircle size={13} /></button></div>
        {maquinas ? (
          <button className="op-patio" onClick={() => nova({ tipo: 'maquinas', so90: false })}>
            <span className="op-grande">{num(estQtd)} máquinas · {compacto(estValor)}</span>
            <span className="op-barra">{faixas.filter((f) => f.valor > 0).map((f) => <span key={f.nome} style={{ width: `${(f.valor / (estValor || 1)) * 100}%`, background: f.cor }} title={`${f.nome}: ${f.qtd} · ${brl(f.valor)}`} />)}</span>
            <span className="op-faixas">{faixas.map((f) => <span key={f.nome}><i style={{ background: f.cor }} />{f.nome} <b>{f.qtd}</b></span>)}</span>
          </button>
        ) : <div className="ce-mudo">sem acesso ao Pátio</div>}
      </div>
      <div className="op-sec">
        <div className="op-tit">Caixa</div>
        {rv && <button className="op-linha" onClick={() => nova({ tipo: 'kpi', id: 'receber_vencido', nome: 'A receber vencido' })}><span className="op-dot op-pisca" style={{ background: COR.vermelho }} /><span>Clientes devem (vencido)</span><b>{compacto(rv.valor || 0)}</b></button>}
        {pv && <button className="op-linha" onClick={() => nova({ tipo: 'kpi', id: 'pagar_vencido', nome: 'A pagar vencido' })}><span className="op-dot" style={{ background: COR.amarelo }} /><span>Nós devemos (vencido)</span><b>{compacto(pv.valor || 0)}</b></button>}
        {v7 && <div className="op-linha"><span className="op-dot" style={{ background: v7.liquido >= 0 ? COR.verde : COR.vermelho }} /><span>Próximos 7 dias: entra {compacto(v7.a_receber)} · sai {compacto(v7.a_pagar)}</span><b style={{ color: v7.liquido >= 0 ? COR.verde : COR.vermelho }}>{compacto(v7.liquido)}</b></div>}
        {!rv && !pv && !v7 && <div className="ce-mudo">sem acesso ao Financeiro</div>}
      </div>
      <div className="op-sec">
        <div className="op-tit">Operação agora · Planta Viva</div>
        {OPER.map((o) => (
          <button key={o.id} className="op-linha" onClick={() => nova({ tipo: 'kpi', id: o.id, nome: o.nome })}>
            <span className={`op-dot${o.k!.contagem ? ' op-pisca' : ''}`} style={{ background: o.k!.contagem ? COR.amarelo : COR.verde }} /><span>{o.nome}</span><b>{o.k!.valor != null ? compacto(o.k!.valor) : num(o.k!.contagem)}</b>
          </button>
        ))}
      </div>
    </div>
  )

  const Kpi = ({ rot, val, cor, sub, onClick }: { rot: string; val: string; cor?: string; sub?: string; onClick?: () => void }) => (
    <button className="op-kpi" onClick={onClick}><small>{rot}</small><b style={{ color: cor }}>{val}</b>{sub && <span>{sub}</span>}</button>
  )
  const fileiraKpis = (
    <div className="op-kpis">
      <Kpi rot="Faturou no mês" val={compacto(totalFat)} sub={`até o dia ${diaHoje}`} onClick={() => nova({ tipo: 'empresa' })} />
      <Kpi rot="Resultado da empresa" val={r ? compacto(r.resultado) : '—'} cor={r ? (r.resultado >= 0 ? COR.verde : COR.vermelho) : undefined} sub={ra ? `mês passado ${compacto(ra.resultado)}` : undefined} onClick={() => nova({ tipo: 'empresa' })} />
      <Kpi rot="Clientes devem (vencido)" val={rv ? compacto(rv.valor || 0) : '—'} cor={COR.vermelho} sub={rv ? `${num(rv.contagem)} contas` : undefined} onClick={() => nova({ tipo: 'kpi', id: 'receber_vencido', nome: 'A receber vencido' })} />
      <Kpi rot="Caixa próximos 7 dias" val={v7 ? compacto(v7.liquido) : '—'} cor={v7 ? (v7.liquido >= 0 ? COR.verde : COR.vermelho) : undefined} sub={v7 ? `entra ${compacto(v7.a_receber)} · sai ${compacto(v7.a_pagar)}` : undefined} />
      <Kpi rot="Máquinas no pátio" val={maquinas ? compacto(estValor) : '—'} sub={maquinas ? `${num(estQtd)} un · ${faixas[3].qtd} com +180 dias` : undefined} onClick={() => nova({ tipo: 'maquinas', so90: false })} />
    </div>
  )

  // cascata (waterfall) — ponte entre o lucro dos setores e o resultado da empresa
  const cascata = () => {
    if (!r || !passos.length) return <div className="ce-mudo">Sem o resultado do Financeiro para montar a cascata.</div>
    let acc = 0
    const barras = passos.map((p) => { const ini = acc; acc += p.valor; return { ...p, ini, fim: acc } })
    const vals = [0, ...barras.flatMap((b) => [b.ini, b.fim])]
    const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1
    const y = (v: number) => ((max - v) / amp) * 100
    return (
      <div className="op-cascata">
        {[...barras, { nome: 'Resultado da empresa', valor: r.resultado, cor: r.resultado >= 0 ? COR.verde : COR.vermelho, ini: 0, fim: r.resultado, abre: { tipo: 'empresa' } as Janela }].map((b, i) => {
          const top = y(Math.max(b.ini, b.fim)), h = Math.max(1.5, Math.abs(y(b.ini) - y(b.fim)))
          const ultimo = i === barras.length
          return (
            <button key={b.nome} className="op-casc-col" onClick={() => nova(b.abre)}>
              <span className="op-casc-area"><span className="op-casc-zero" style={{ top: `${y(0)}%` }} />
                <span className="op-casc-barra" style={{ top: `${top}%`, height: `${h}%`, background: ultimo ? b.cor : b.valor >= 0 ? b.cor : '#ef4444', opacity: ultimo ? 1 : .85, animationDelay: `${i * 90}ms` }} />
              </span>
              <b style={{ color: b.valor >= 0 ? COR.verde : COR.vermelho }}>{b.valor >= 0 ? '+' : ''}{compacto(b.valor)}</b>
              <small>{b.nome}</small>
            </button>
          )
        })}
      </div>
    )
  }

  // ── opção 2: executivo ──
  const layoutExec = () => (
    <div className="ce-painel op-exec">
      {fileiraKpis}
      <div className="op-exec-meio">
        <div className="op-exec-casc"><div className="op-tit">Do lucro dos setores ao resultado da empresa <button className="ce-oque" onClick={() => nova({ tipo: 'termo', id: 'dre' })}><HelpCircle size={13} /></button></div>{cascata()}</div>
      </div>
      <div className="op-exec-baixo">{blocoSetores}{blocoOperacao}</div>
    </div>
  )

  // ── opção 3: FOCO (escolhida 11/11) — lista de áreas à esquerda, um painel grande à direita.
  // Regra: cada número aparece num lugar só (José: "muitas informações iguais em vários lugares confunde").
  //   Financeiro = resultado da empresa + caixa · cada setor = a sua conta · Pátio = máquinas · Frota · Requisições
  //   Visão geral = só a situação de cada área (o "mapa" da empresa, como a Planta Viva) — o detalhe fica na área.
  const ctx = { abrir, setores, fatiasDe, painel, familias, custos, home, maquinas, mes: mesNome, dre }
  const rq = kv('requisicoes_abertas')
  const rqd = (rq?.detalhe || {}) as { por_fase?: Record<string, number>; por_idade?: Record<string, number>; por_tipo?: Record<string, number>; paradas_30?: number; valor_informado?: number; com_valor?: number }
  const comb = frota?.combustivel
  const combDelta = comb && comb.anteriores30.gasto ? ((comb.ultimos30.gasto - comb.anteriores30.gasto) / comb.anteriores30.gasto) * 100 : null
  const docVenc = (frota?.documentos || []).filter((d) => d.vencido).length, docLogo = (frota?.documentos || []).filter((d) => !d.vencido).length
  const setorDe = (k: K) => setores.find((x) => x.k === k)!
  const sitSetor = (x: Setor): Sit => (!x.ok ? 'amarelo' : x.sobrou < 0 ? 'vermelho' : x.perdas.length ? 'amarelo' : 'verde')
  const pos = setorDe('posvendas')

  // situação + frase de cada área (a Visão geral só mostra isto)
  const AREAS: Array<{ k: Area; nome: string; ic: ReactNode; cor: string; num: string; sit: Sit; frase: string }> = [
    // situação do Financeiro pelo resultado GERENCIAL (o do Omie vem distorcido — ver dre-gerencial.ts)
    { k: 'financeiro' as Area, nome: 'Financeiro', ic: <span className="op-letra">R$</span>, cor: '#10B981', num: rv ? compacto(rv.valor || 0) : '—',
      sit: (!rv && !pv ? 'amarelo' : (rv?.valor || 0) > 500000 || (pv?.valor || 0) > 100000 ? 'vermelho' : (rv?.valor || 0) > 0 || (pv?.valor || 0) > 0 ? 'amarelo' : 'verde') as Sit,
      frase: rv ? `clientes devem ${compacto(rv.valor || 0)} vencido${pv ? ` · nós devemos ${compacto(pv.valor || 0)}` : ''}` : 'sem acesso às contas' },
    ...setores.map((x) => {
      const Ic = SETORES.find((y) => y.key === x.k)?.icon
      return { k: x.k as Area, nome: x.nome, ic: Ic ? <Ic size={17} /> : null, cor: corDoSetor(x.k), num: x.ok ? compacto(x.sobrou) : '—', sit: sitSetor(x),
        frase: x.ok ? `Faturou ${compacto(x.faturou)} e ${x.sobrou >= 0 ? 'sobrou' : 'perdeu'} ${compacto(Math.abs(x.sobrou))}${x.perdas.length ? ` · ${x.perdas.length} ${x.perdas.length === 1 ? 'ponto travado' : 'pontos travados'}` : ''}` : 'sem acesso' }
    }),
    // Pátio saiu das áreas (José, 12/11: 'remove esse módulo pátio, não vamos usar ele')
    { k: 'frota', nome: 'Frota', ic: <span className="op-letra">⛟</span>, cor: '#0891B2', num: frota ? `${frota.parados.length} parados` : '—', sit: !frota ? 'amarelo' : frota.parados.length || docVenc ? 'vermelho' : frota.graves.length || docLogo ? 'amarelo' : 'verde',
      frase: frota ? `${frota.ativos} veículos · ${frota.parados.length} parados · ${docVenc} documento(s) vencido(s)` : 'sem acesso à Frota' },
    { k: 'requisicoes', nome: 'Requisições', ic: <span className="op-letra">✎</span>, cor: '#64748B', num: rq ? num(rq.contagem) : '—', sit: !rq ? 'amarelo' : (rqd.paradas_30 || 0) > 0 ? 'amarelo' : 'verde',
      frase: rq ? `${num(rq.contagem)} em aberto${rqd.paradas_30 ? ` · ${rqd.paradas_30} paradas há mais de 30 dias` : ''}` : 'sem acesso' },
  ]
  const ruins = AREAS.filter((x) => x.sit !== 'verde')
  const LISTA = [{ k: 'geral' as Area, nome: 'Visão geral', ic: <span className="op-letra">◎</span>, cor: '#0f172a', num: ruins.length ? `${ruins.length} ${ruins.length === 1 ? 'área' : 'áreas'} com atenção` : 'tudo em dia', sit: (ruins.some((x) => x.sit === 'vermelho') ? 'vermelho' : ruins.length ? 'amarelo' : 'verde') as Sit }, ...AREAS]

  const Barras = ({ dados, cor }: { dados: Record<string, number>; cor: string }) => {
    const l = Object.entries(dados).filter(([, v]) => v).sort((x, y) => y[1] - x[1]); const max = Math.max(1, ...l.map(([, v]) => v))
    return <div className="fx-barras">{l.map(([k, v]) => <div key={k} className="fx-barra"><span>{k}</span><span className="fx-trilho"><span style={{ width: `${(v / max) * 100}%`, background: cor }} /></span><b>{num(v)}</b></div>)}</div>
  }
  const Linha = ({ dot, txt, val, onClick }: { dot: Sit; txt: ReactNode; val: string; onClick?: () => void }) => (
    <button className="op-linha" onClick={onClick} disabled={!onClick}><span className={`op-dot${dot === 'vermelho' ? ' op-pisca' : ''}`} style={{ background: COR[dot] }} /><span>{txt}</span><b>{val}</b></button>
  )

  const ICONE_FA: Record<Area, string> = {
    geral: 'fa-compass', financeiro: 'fa-sack-dollar', comercial: 'fa-tractor', posvendas: 'fa-screwdriver-wrench',
    pecas: 'fa-gears', patio: 'fa-warehouse', frota: 'fa-truck', requisicoes: 'fa-clipboard-list',
  }
  // VISÃO GERAL: cada área é um gráfico grande + o número + 2 ou 3 palavras (José, 11/11: "mais visual e menos texto")
  const graficoArea = (k: Area): ReactNode => {
    if (dreG && (k === 'comercial' || k === 'posvendas' || k === 'pecas' || k === 'financeiro')) {
      return <ColunasMes meses={dreG} valor={(m) => (k === 'financeiro' ? m.empresa.resultado : m.setores[k].resultado)} escala={escalaG} alto={96} />
    }
    if (k === 'comercial' || k === 'posvendas' || k === 'pecas') {
      const x = setorDe(k), fs2 = fatiasDe(x)
      return <Pizza fatias={fs2} tam={120} centro={<><b style={{ color: x.sobrou >= 0 ? COR.verde : COR.vermelho }}>{x.faturou ? `${Math.round((x.sobrou / x.faturou) * 100)}%` : '—'}</b><small>{x.sobrou >= 0 ? 'sobra' : 'perde'}</small></>} />
    }
    if (k === 'financeiro') {
      const l = [...ponte, ...(r ? [{ nome: 'Resultado', v: r.resultado, cor: r.resultado >= 0 ? '#16a34a' : '#b91c1c' }] : [])]
      const mx = Math.max(1, ...l.map((x) => Math.abs(x.v)))
      return (
        <svg viewBox="0 0 200 120" className="fx-g">
          <line x1="100" y1="2" x2="100" y2="118" stroke="currentColor" strokeOpacity=".2" />
          {l.map((x, i) => { const w = (Math.abs(x.v) / mx) * 92; const y = 6 + i * (108 / l.length); const h = Math.min(16, 108 / l.length - 5)
            return <rect key={i} className="fx-g-barra-h" x={x.v >= 0 ? 100 : 100 - w} y={y} width={Math.max(2, w)} height={h} rx="4" fill={i === l.length - 1 ? (x.v >= 0 ? '#16a34a' : '#b91c1c') : x.v >= 0 ? '#4ade80' : '#f87171'} style={{ animationDelay: `${i * 80}ms` }} /> })}
        </svg>
      )
    }
    if (k === 'patio') {
      const mx = Math.max(1, ...faixas.map((f) => f.qtd))
      return (
        <svg viewBox="0 0 200 120" className="fx-g">
          {faixas.map((f, i) => { const h = (f.qtd / mx) * 86; return <g key={i}>
            <rect className="fx-g-barra-v" x={14 + i * 46} y={98 - h} width="34" height={Math.max(2, h)} rx="5" fill={f.cor} style={{ animationDelay: `${i * 80}ms` }} />
            <text x={31 + i * 46} y={92 - h} textAnchor="middle" className="fx-g-num">{f.qtd}</text>
            <text x={31 + i * 46} y="114" textAnchor="middle" className="fx-g-rot">{['30d', '90d', '180d', '+180d'][i]}</text></g> })}
        </svg>
      )
    }
    if (k === 'frota') {
      const n = frota?.ativos || 0, parados = frota?.parados.length || 0, cols = 8
      return (
        <svg viewBox="0 0 200 120" className="fx-g">
          {Array.from({ length: Math.min(n, 40) }).map((_, i) => <circle key={i} className="fx-g-ponto" cx={22 + (i % cols) * 22} cy={18 + Math.floor(i / cols) * 22} r="7.5" fill={i < parados ? '#dc2626' : '#0891b2'} style={{ animationDelay: `${i * 20}ms` }} />)}
        </svg>
      )
    }
    if (k === 'requisicoes') {
      const l = Object.entries(rqd.por_idade || rqd.por_fase || {}).filter(([, v]) => v), mx = Math.max(1, ...l.map(([, v]) => v))
      return (
        <svg viewBox="0 0 200 120" className="fx-g">
          {l.slice(0, 5).map(([nome, v], i, arr) => { const h = (v / mx) * 86, w = 160 / arr.length; return <g key={nome}>
            <rect className="fx-g-barra-v" x={20 + i * w + 4} y={98 - h} width={w - 8} height={Math.max(2, h)} rx="5" fill={i >= arr.length - 2 ? '#d97706' : '#94a3b8'} style={{ animationDelay: `${i * 80}ms` }} />
            <text x={20 + i * w + w / 2} y={92 - h} textAnchor="middle" className="fx-g-num">{v}</text>
            <text x={20 + i * w + w / 2} y="114" textAnchor="middle" className="fx-g-rot">{nome}</text></g> })}
        </svg>
      )
    }
    return null
  }
  // número + rótulo curto de cada área
  const resumoArea = (k: Area): { num: string; rot: string; cor?: string } => {
    if (gAtual && (k === 'financeiro' || k === 'comercial' || k === 'posvendas' || k === 'pecas')) {
      const v = k === 'financeiro' ? gAtual.empresa.resultado : gAtual.setores[k].resultado
      return { num: compacto(v), rot: `resultado em ${rotMes(gAtual.mes)} (gerencial)`, cor: v >= 0 ? COR.verde : COR.vermelho }
    }
    if (k === 'financeiro') return { num: r ? compacto(r.resultado) : '—', rot: r ? (r.resultado >= 0 ? 'lucro no mês' : 'prejuízo no mês') : 'sem acesso', cor: r ? (r.resultado >= 0 ? COR.verde : COR.vermelho) : undefined }
    if (k === 'comercial' || k === 'posvendas' || k === 'pecas') { const x = setorDe(k); return { num: compacto(x.faturou), rot: 'faturado no mês' } }
    if (k === 'patio') return { num: compacto(estValor), rot: `em ${num(estQtd)} máquinas` }
    if (k === 'frota') return { num: `${frota?.parados.length ?? '—'}`, rot: `parados de ${frota?.ativos ?? '—'} veículos`, cor: frota?.parados.length ? COR.vermelho : undefined }
    return { num: rq ? num(rq.contagem) : '—', rot: 'requisições abertas' }
  }
  const painelGeral = () => (
    <div className="fx-geral">
      <div className="fx-mapa">
        {AREAS.map((x, i) => { const rs = resumoArea(x.k); return (
          <button key={x.k} className={`fx-sala fx-${x.sit}`} style={{ ['--cor' as string]: x.cor, animationDelay: `${i * 50}ms` }} onClick={() => setFoco(x.k)} title={x.frase}>
            <span className="fx-sala-topo"><span className="fx-sala-ico"><i className={`fas ${ICONE_FA[x.k]}`} /></span><span className="fx-sala-nome">{x.nome}</span><span className="fx-sala-sit" style={{ background: COR[x.sit] }} /></span>
            <span className="fx-sala-graf">{graficoArea(x.k)}</span>
            <span className="fx-sala-rodape"><span className="fx-sala-num" style={{ color: rs.cor }}>{rs.num}</span><span className="fx-sala-rot">{rs.rot}</span></span>
          </button>
        ) })}
      </div>
    </div>
  )

  // ── FINANCEIRO: gráficos que se explicam sozinhos (José, 11/11: "a explicação não é de palavras") ──
  const mk = mesChave()
  // despesas da empresa por grupo, deste mês, com a linha dos últimos 6 meses
  const despesas = (() => {
    if (!dre) return []
    const out: Array<{ tipo: string; grupo: string; v: number; serie: number[] }> = []
    const meses = Object.keys(Object.values(dre)[0]?.por_mes || {}).sort()
    for (const [t, no] of Object.entries(dre)) {
      if (!t.startsWith('2')) continue
      for (const [g, gn] of Object.entries(no.grupos)) { const v = Math.abs(gn.por_mes[mk] || 0); if (v) out.push({ tipo: t, grupo: g, v, serie: meses.map((m) => Math.abs(gn.por_mes[m] || 0)) }) }
    }
    return out.sort((x, y) => y.v - x.v)
  })()
  const despTotal = despesas.reduce((a2, x) => a2 + x.v, 0)
  // ponte do resultado: barras para os dois lados a partir do zero
  const ponte = r ? [
    ...setores.filter((x) => x.ok).map((x) => ({ nome: x.nome, v: x.sobrou, cor: x.sobrou >= 0 ? '#16a34a' : '#dc2626', abre: { tipo: 'setor', k: x.k } as Janela, sub: x.sobrou >= 0 ? 'lucro do setor' : 'prejuízo do setor' })),
    { nome: 'Despesas gerais e ajustes', v: r.resultado - somaSetores, cor: '#dc2626', abre: null as Janela | null, sub: 'o que a empresa gasta além dos setores' },
  ] : []
  // aging (vencidos por tempo de atraso): soma NOVA + CASTRO quando vem por conta
  const aging = (k: Kpi | null) => {
    const d = (k?.detalhe || {}) as Record<string, { aging?: Record<string, number> } | undefined> & { aging?: Record<string, number> }
    const partes = d.NOVA || d.CASTRO ? [d.NOVA, d.CASTRO] : [d]
    const fx = ['1-30', '31-60', '61-90', '90+']
    return fx.map((f) => ({ f, v: partes.reduce((a2, x) => a2 + (Number(x?.aging?.[f]) || 0), 0) }))
  }
  const CORES_AGING = ['#fbbf24', '#f97316', '#ef4444', '#991b1b']
  const BarraAging = ({ k, titulo, id, nome }: { k: Kpi | null; titulo: string; id: string; nome: string }) => {
    if (!k) return null
    const ag = aging(k), tot = ag.reduce((a2, x) => a2 + x.v, 0) || 1
    return (
      <button className="fx-aging" onClick={() => nova({ tipo: 'kpi', id, nome })}>
        <span className="fx-aging-topo"><span>{titulo}</span><b>{compacto(k.valor || 0)}</b><small>{num(k.contagem)} contas</small></span>
        <span className="fx-aging-barra">{ag.filter((x) => x.v > 0).map((x, i) => <span key={x.f} style={{ width: `${(x.v / tot) * 100}%`, background: CORES_AGING[['1-30', '31-60', '61-90', '90+'].indexOf(x.f)], animationDelay: `${i * 80}ms` }} title={`${x.f} dias: ${brl(x.v)}`} />)}</span>
        <span className="fx-aging-leg">{ag.map((x, i) => <span key={x.f}><i style={{ background: CORES_AGING[i] }} />{x.f === '90+' ? '+90' : x.f} dias <b>{compacto(x.v)}</b></span>)}</span>
      </button>
    )
  }
  // próximas semanas: entra × sai + saldo acumulado
  const fluxo = (() => {
    const k = kv('fluxo_30d'); if (!k) return null
    const d = (k.detalhe || {}) as Record<string, { semanas?: Array<{ receber: number; pagar: number }> } | undefined> & { semanas?: Array<{ receber: number; pagar: number }> }
    const partes = d.NOVA || d.CASTRO ? [d.NOVA, d.CASTRO] : [d]
    return [0, 1, 2, 3, 4].map((i) => partes.reduce((acc, x) => { const w = x?.semanas?.[i]; return w ? { receber: acc.receber + w.receber, pagar: acc.pagar + w.pagar } : acc }, { receber: 0, pagar: 0 }))
  })()
  const GraficoFluxo = () => {
    if (!fluxo) return null
    const max = Math.max(1, ...fluxo.flatMap((w) => [w.receber, w.pagar]))
    let saldo = 0
    const saldos = fluxo.map((w) => (saldo += w.receber - w.pagar))
    const smax = Math.max(1, ...saldos.map(Math.abs))
    const pts = saldos.map((v, i) => `${10 + i * 20},${50 - (v / smax) * 40}`).join(' ')
    return (
      <div className="fx-fluxo">
        <div className="fx-fluxo-cols">
          {fluxo.map((w, i) => (
            <div key={i} className="fx-fluxo-col">
              <div className="fx-fluxo-barras">
                <span style={{ height: `${(w.receber / max) * 100}%`, background: '#16a34a', animationDelay: `${i * 70}ms` }} title={`entra ${brl(w.receber)}`} />
                <span style={{ height: `${(w.pagar / max) * 100}%`, background: '#ef4444', animationDelay: `${i * 70 + 35}ms` }} title={`sai ${brl(w.pagar)}`} />
              </div>
              <small>{i === 4 ? 'dias 29–30' : `${i + 1}ª semana`}</small>
              <b style={{ color: w.receber - w.pagar >= 0 ? COR.verde : COR.vermelho }}>{compacto(w.receber - w.pagar)}</b>
            </div>
          ))}
          <svg className="fx-fluxo-linha" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50" className="fx-zero" /><polyline points={pts} /></svg>
        </div>
        <div className="fx-leg"><span><i style={{ background: '#16a34a' }} /> entra</span><span><i style={{ background: '#ef4444' }} /> sai</span><span><i className="fx-leg-linha" /> saldo acumulado: <b style={{ color: saldos[4] >= 0 ? COR.verde : COR.vermelho }}>{compacto(saldos[4])}</b> em 30 dias</span></div>
      </div>
    )
  }

  // ── FINANCEIRO no padrão IBCS (José, 11/11: "faça como um controller e depois como um designer") ──
  const gAtual = dreG?.[dreG.length - 1], gAnt = dreG && dreG.length > 1 ? dreG[dreG.length - 2] : null
  const escalaG = dreG ? Math.max(1, ...dreG.flatMap((m) => [Math.abs(m.empresa.resultado), ...(['comercial', 'posvendas', 'pecas'] as K[]).map((k) => Math.abs(m.setores[k].resultado))])) : 1
  const LINHAS_TAB: Array<{ id: keyof LinhasG; nome: string; total?: boolean; termo?: keyof typeof TERMOS }> = [
    { id: 'receita', nome: 'Receita', termo: 'faturou' }, { id: 'deducoes', nome: 'Devoluções, descontos e impostos' }, { id: 'custos', nome: 'Custo do que foi vendido', termo: 'custo_mercadoria' },
    { id: 'margem', nome: 'Margem', total: true, termo: 'margem' }, { id: 'despesas', nome: 'Despesas do setor' }, { id: 'rateio', nome: 'Parte das despesas gerais', termo: 'rateio' },
    { id: 'resultado', nome: 'Resultado', total: true, termo: 'sobrou' },
  ]
  const COLS: Array<{ k: K | 'empresa'; nome: string }> = [{ k: 'comercial', nome: 'Comercial' }, { k: 'posvendas', nome: 'Pós-Vendas' }, { k: 'pecas', nome: 'Peças' }, { k: 'empresa', nome: 'Empresa' }]
  const linhaDe = (m: MesG, k: K | 'empresa') => (k === 'empresa' ? m.empresa : m.setores[k])
  const msgMes = gAtual ? `${cap(rotMes(gAtual.mes))} até o dia ${diaHoje}: resultado de ${mil(gAtual.empresa.resultado)} mil. ${(['comercial', 'posvendas', 'pecas'] as K[]).map((k) => `${NOME[k]} ${mil(gAtual.setores[k].resultado)}`).join(', ')}.` : ''

  // ── FINANCEIRO: só o que a Planta Viva mostra, no "guia de apresentação para leigo" do José (11/11):
  // uma mensagem por cartão, o título é a conclusão, número grande arredondado, uma linha concreta e a ação.
  // O detalhe (conta por conta, dia por dia) fica na janela que abre ao clicar.
  const painelFinanceiro = () => {
    if (!rv && !pv && !fluxo) return <div className="pf"><div className="ce-mudo">{carregando ? 'Carregando as contas…' : 'Sem acesso às contas do financeiro.'}</div></div>
    const v90 = (k: Kpi | null) => aging(k).find((x) => x.f === '90+')?.v || 0
    const ent30 = (fluxo || []).reduce((a2, w) => a2 + w.receber, 0), sai30 = (fluxo || []).reduce((a2, w) => a2 + w.pagar, 0), saldo = ent30 - sai30
    const fila = kv('fila_financeiro')
    const cards: Array<{ cor: string; ic: string; titulo: string; num: string; linha: ReactNode; acao: string; abre: Janela } | null> = [
      rv ? { cor: '#15803d', ic: 'fa-hand-holding-dollar', titulo: 'Clientes estão nos devendo', num: compacto(rv.valor || 0),
        linha: <>{v90(rv) ? <><b>{compacto(v90(rv))}</b> disso está atrasado há mais de 3 meses</> : <>tudo atrasado há menos de 3 meses</>}</>,
        acao: 'Ver quem deve', abre: { tipo: 'kpi', id: 'receber_vencido', nome: 'Clientes nos devem (vencido)' } } : null,
      pv ? { cor: '#b91c1c', ic: 'fa-file-invoice-dollar', titulo: 'Estamos devendo a fornecedores', num: compacto(pv.valor || 0),
        linha: <>{v90(pv) ? <><b>{compacto(v90(pv))}</b> disso está atrasado há mais de 3 meses</> : <>tudo atrasado há menos de 3 meses</>}</>,
        acao: 'Ver o que devemos', abre: { tipo: 'kpi', id: 'pagar_vencido', nome: 'Nós devemos (vencido)' } } : null,
      fluxo ? { cor: saldo >= 0 ? '#15803d' : '#b45309', ic: 'fa-calendar-days', titulo: saldo >= 0 ? 'Nos próximos 30 dias sobra dinheiro' : 'Nos próximos 30 dias falta dinheiro', num: compacto(Math.abs(saldo)),
        linha: <>entra <b>{compacto(ent30)}</b> e sai <b>{compacto(sai30)}</b></>,
        acao: 'Ver dia a dia', abre: { tipo: 'kpi', id: 'fluxo_30d', nome: 'O que entra e sai nos próximos 30 dias' } } : null,
    ]
    return (
      <div className="pf">
        <div className="pf-tres-g">
          {cards.filter(Boolean).map((c) => (
            <button key={c!.titulo} className="pf-card pf-g" style={{ ['--c' as string]: c!.cor }} onClick={() => nova(c!.abre)}>
              <span className="pf-ic"><i className={`fas ${c!.ic}`} /></span>
              <span className="pf-tit">{c!.titulo}</span>
              <span className="pf-num">{c!.num}</span>
              <span className="pf-sub">{c!.linha}</span>
              <span className="pf-acao">{c!.acao} <i className="fas fa-arrow-right" /></span>
            </button>
          ))}
        </div>
        {fila?.contagem ? (
          <button className="pf-card pf-fila" onClick={() => nova({ tipo: 'kpi', id: 'fila_financeiro', nome: 'Pedidos esperando o financeiro' })}>
            <span className="pf-ic" style={{ ['--c' as string]: '#d97706' }}><i className="fas fa-inbox" /></span>
            <span><b>{num(fila.contagem)} pedidos</b> esperando o financeiro aprovar</span>
            <i className="fas fa-chevron-right pf-seta" />
          </button>
        ) : null}
      </div>
    )
  }


  const contaGerencial = (k: K) => {
    if (!dreG || !gAtual) return <div className="ce-mudo" style={{ padding: '0 22px' }}>{carregando ? 'Montando o DRE gerencial…' : 'Sem acesso ao DRE.'}</div>
    const l = gAtual.setores[k]
    return (
      <div className="fx-pad ib" style={{ paddingBottom: 0 }}>
        <div className="ib-msg">{NOME[k]}, {rotMes(gAtual.mes)} até o dia {diaHoje}: resultado de {mil(l.resultado)} mil{l.receita ? ` · margem de ${pct((l.margem / l.receita) * 100)}` : ''}.</div>
        <div className="fx-duas">
          <section className="fx-bloco">
            <div className="ib-tab-cab"><span>A conta do setor · R$ mil</span><button className="ce-oque" onClick={() => nova({ tipo: 'termo', id: 'gerencial' })}><HelpCircle size={13} /></button></div>
            <CascataH linhas={[
              { nome: 'Receita', v: l.receita }, { nome: 'Devoluções, descontos e impostos', v: l.deducoes }, { nome: 'Custo do vendido', v: l.custos },
              { nome: 'Margem', v: l.margem, total: true }, { nome: 'Despesas do setor', v: l.despesas + l.outrasReceitas }, { nome: 'Parte das despesas gerais', v: l.rateio, onClick: () => nova({ tipo: 'termo', id: 'rateio' }) },
              { nome: 'Resultado', v: l.resultado, total: true },
            ]} />
          </section>
          <section className="fx-bloco">
            <div className="ib-tab-cab"><span>Resultado por mês · R$ mil</span><span className="ib-leg"><i className="ib-leg-ac" /> fechado <i className="ib-leg-pa" /> em andamento</span></div>
            <ColunasMes meses={dreG} valor={(m) => m.setores[k].resultado} escala={escalaG} alto={130} />
          </section>
        </div>
      </div>
    )
  }

  const OPER_PEC = [{ id: 'ppv_pedido_aberto', nome: 'Pedidos em aberto' }, { id: 'ppv_aberto', nome: 'PPVs em aberto' }, { id: 'ppv_remessa_aberta', nome: 'Remessas em aberto' }, { id: 'estoque_negativo', nome: 'Peças com estoque negativo' }]
  const OPER_POS = [{ id: 'os_atrasada', nome: 'OS atrasadas' }, { id: 'garantias_abertas', nome: 'Garantias abertas' }, { id: 'zap_sem_resposta', nome: 'Clientes esperando no WhatsApp' }, { id: 'cheques_revisao_pendentes', nome: 'Cheques de revisão parados' }]
  const painelSetor = (k: K) => (
    <>
      {contaGerencial(k)}
      <div className="ib-sub">Detalhe da operação (telas do setor)</div>
      <ConteudoJanela j={{ tipo: 'setor', k }} {...ctx} />
      {k === 'posvendas' && (
        <div className="fx-pad" style={{ paddingTop: 0 }}>
          <div className="op-tit">Oficina agora</div>
          {/* o que já está em Deixando de ganhar (OS atrasadas, serviço sem nota) não se repete aqui */}
          {OPER_POS.filter((o) => !pos.perdas.some((pp) => pp.id === o.id)).map((o) => { const x = kv(o.id); return x
            ? <Linha key={o.id} dot={x.contagem ? 'amarelo' : 'verde'} txt={o.nome} val={num(x.contagem)} onClick={() => nova({ tipo: 'kpi', id: o.id, nome: o.nome })} /> : null })}
        </div>
      )}
    </>
  )

  const painelPatio = () => (
    <div className="fx-pad">
      {maquinas ? (
        <>
          <div className="fx-grande">{num(estQtd)} máquinas · {compacto(estValor)} <button className="ce-oque" onClick={() => nova({ tipo: 'termo', id: 'capital' })}><HelpCircle size={14} /></button></div>
          <div className="fx-sub">custam {compacto((maquinas || []).reduce((a, m) => a + m.custo_capital_mes, 0))} por mês em juros enquanto estão paradas</div>
          <div className="op-tit" style={{ marginTop: 14 }}>Há quanto tempo estão paradas</div>
          <div className="fx-idades">
            {faixas.map((f) => (
              <button key={f.nome} className="fx-idade" onClick={() => nova({ tipo: 'maquinas', so90: f.min >= 90 })}>
                <span className="fx-idade-barra"><span style={{ height: `${(f.valor / Math.max(1, ...faixas.map((x) => x.valor))) * 100}%`, background: f.cor }} /></span>
                <b>{f.qtd}</b><small>{f.nome}</small><small>{compacto(f.valor)}</small>
              </button>
            ))}
          </div>
          <div className="op-tit" style={{ marginTop: 16 }}>Chegando</div>
          {[{ id: 'maq_pedido_fabrica', nome: 'Pedidas à fábrica' }, { id: 'maq_em_transito', nome: 'A caminho (nota faturada)' }].map((o) => { const x = kv(o.id); return x ? <Linha key={o.id} dot="verde" txt={o.nome} val={num(x.contagem)} onClick={() => nova({ tipo: 'kpi', id: o.id, nome: o.nome })} /> : null })}
          <button className="ce-ver" style={{ marginTop: 10 }} onClick={() => nova({ tipo: 'maquinas', so90: false })}>ver todas as máquinas ›</button>
        </>
      ) : <div className="ce-mudo">Sem acesso ao Pátio.</div>}
    </div>
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- painel antigo da Frota, guardado (José, 12/11: "remove por enquanto")
  const painelFrota = () => (
    <div className="fx-pad">
      {frota ? (
        <>
          <div className="fx-grande">{frota.ativos} veículos · <span style={{ color: frota.parados.length ? COR.vermelho : COR.verde }}>{frota.parados.length} parados</span></div>
          {comb && <div className="fx-sub">Combustível nos últimos 30 dias: <b>{compacto(comb.ultimos30.gasto)}</b> ({num(comb.ultimos30.litros)} L){combDelta != null && <b style={{ color: combDelta > 0 ? COR.vermelho : COR.verde }}> {combDelta > 0 ? '▲' : '▼'} {pct(Math.abs(combDelta))} vs 30 dias antes</b>}</div>}
          <div className="fx-duas">
            <div>
              <div className="op-tit" style={{ marginTop: 14 }}>Parados</div>
              {!frota.parados.length && <div className="ce-mudo">Nenhum veículo parado.</div>}
              <div className="ce-lista">{frota.parados.map((v) => <div key={v.placa} className="ce-reg"><span className="ce-reg-tit">{v.placa} · {v.modelo}</span><span /><span className="ce-reg-sub">{v.motivos.join(' · ')}</span></div>)}</div>
              {frota.graves.length > 0 && <><div className="op-tit" style={{ marginTop: 14 }}>Problemas graves</div>
                <div className="ce-lista">{frota.graves.slice(0, 8).map((g, i) => <div key={i} className="ce-reg"><span className="ce-reg-tit">{g.placa} · {g.titulo}</span><span /><span className="ce-reg-sub">{g.modelo}</span></div>)}</div></>}
            </div>
            <div>
              <div className="op-tit" style={{ marginTop: 14 }}>Documentos</div>
              {!frota.documentos.length && <div className="ce-mudo">Nada vencendo nos próximos 30 dias.</div>}
              <div className="ce-lista">{frota.documentos.map((d, i) => <div key={i} className="ce-reg"><span className="ce-reg-tit">{d.placa} · {d.tipo}</span><span className="ce-reg-val" style={{ color: d.vencido ? COR.vermelho : COR.amarelo }}>{d.vencido ? 'vencido' : `vence em ${d.dias} d`}</span><span className="ce-reg-sub">{d.modelo}</span></div>)}</div>
              {frota.checklists && <div className="fx-sub" style={{ marginTop: 12 }}>Checklists do mês: {frota.checklists.resumo.pendente} de {frota.checklists.resumo.total} ainda não feitos.</div>}
            </div>
          </div>
        </>
      ) : <div className="ce-mudo">Sem acesso à Frota.</div>}
    </div>
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- painel antigo das Requisições, guardado (José, 12/11)
  const painelRequisicoes = () => (
    <div className="fx-pad">
      {rq ? (
        <>
          <div className="fx-grande">{num(rq.contagem)} requisições em aberto{rq.valor != null ? <> · {compacto(rq.valor)}</> : null}</div>
          <div className="fx-sub">{rqd.paradas_30 ? <><b style={{ color: COR.amarelo }}>{rqd.paradas_30} paradas há mais de 30 dias</b> · </> : null}{rqd.com_valor != null ? `${rqd.com_valor} já com valor informado (${compacto(rqd.valor_informado || 0)})` : ''}</div>
          <div className="fx-tres">
            {rqd.por_fase && <div><div className="op-tit" style={{ marginTop: 14 }}>Em que fase estão</div><Barras dados={rqd.por_fase} cor="#64748b" /></div>}
            {rqd.por_idade && <div><div className="op-tit" style={{ marginTop: 14 }}>Há quanto tempo (dias)</div><Barras dados={rqd.por_idade} cor="#d97706" /></div>}
            {rqd.por_tipo && <div><div className="op-tit" style={{ marginTop: 14 }}>De que tipo</div><Barras dados={rqd.por_tipo} cor="#0ea5e9" /></div>}
          </div>
          <button className="ce-ver" style={{ marginTop: 12 }} onClick={() => nova({ tipo: 'kpi', id: 'requisicoes_abertas', nome: 'Requisições em aberto' })}>ver uma por uma ›</button>
        </>
      ) : <div className="ce-mudo">Sem acesso às requisições.</div>}
    </div>
  )

  // ── CAPA (estilo E · Bento colorido, 11/11) ──
  // José, 11/11: "deixando só os nomes e cartões/cores de cada setor, com umas formas geométricas no fundo".
  // A capa é só a porta de entrada: cada cartão leva à área (os números ficam dentro dela).
  // formas de fundo (branco translúcido), uma composição diferente por cartão
  const formas = (i: number) => {
    const v = i % 4
    return (
      <svg className="bt-formas" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {v === 0 && <>
          <circle cx="330" cy="40" r="130" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
          <circle cx="330" cy="40" r="80" fill="rgba(255,255,255,.08)" />
          <rect x="40" y="170" width="90" height="90" rx="18" fill="rgba(255,255,255,.07)" transform="rotate(18 85 215)" />
          <path d="M250 300 L330 170 L410 300 Z" fill="rgba(255,255,255,.06)" />
        </>}
        {v === 1 && <>
          <rect x="230" y="-40" width="200" height="200" rx="36" fill="rgba(255,255,255,.08)" transform="rotate(24 330 60)" />
          <circle cx="60" cy="260" r="70" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" />
          <circle cx="300" cy="230" r="14" fill="rgba(255,255,255,.18)" />
        </>}
        {v === 2 && <>
          <path d="M260 -20 L420 -20 L420 140 Z" fill="rgba(255,255,255,.1)" />
          <circle cx="340" cy="230" r="90" fill="rgba(255,255,255,.07)" />
          <rect x="20" y="20" width="60" height="60" rx="14" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" transform="rotate(-12 50 50)" />
        </>}
        {v === 3 && <>
          <circle cx="360" cy="260" r="150" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
          <circle cx="360" cy="260" r="100" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
          <rect x="250" y="20" width="70" height="70" rx="16" fill="rgba(255,255,255,.09)" transform="rotate(30 285 55)" />
          {[0, 1, 2, 3].flatMap((a) => [0, 1, 2].map((b) => <circle key={`${a}-${b}`} cx={40 + a * 22} cy={40 + b * 22} r="3" fill="rgba(255,255,255,.28)" />))}
        </>}
      </svg>
    )
  }
  const GRADE_BENTO: Record<Area, string> = { geral: '', financeiro: 'fin', comercial: 'com', posvendas: 'pos', pecas: 'pec', frota: 'fro', patio: 'pat', requisicoes: 'req' }
  const capaBento = () => (
    <div className="ce-painel bt">
      <div className="bt-topo"><div className="bt-ctrl">{controles}</div></div>
      <div className={`bt-grade cp-${capaOp}`}>
        {AREAS.map((x, i) => (
          <button key={x.k} className="bt-card bt-so-nome"
            style={{ gridArea: capaOp === 'bento' ? GRADE_BENTO[x.k] : undefined, background: `linear-gradient(140deg, ${x.cor}, color-mix(in srgb, ${x.cor} 62%, #000))`, animationDelay: `${i * 50}ms` }}
            onClick={() => setFoco(x.k)}>
            {formas(i)}
            <span className="bt-nome-g">{x.nome}<i className="fas fa-arrow-right" /></span>
          </button>
        ))}
      </div>
      {rodape}
    </div>
  )


  const itensLista = LISTA.map((it) => (
          <button key={it.k} className={`op-foco-item${foco === it.k ? ' on' : ''}`} onClick={() => setFoco(it.k)} style={{ ['--cor' as string]: it.cor }}>
            <span className="op-foco-ico"><i className={`fas ${ICONE_FA[it.k]}`} /></span>
            <span style={{ flex: 1, minWidth: 0 }}><span className="op-foco-nome">{it.nome}</span><span className="op-foco-val">{it.num}</span></span>
            <span className={`op-dot${it.sit === 'vermelho' ? ' op-pisca' : ''}`} style={{ background: COR[it.sit] }} />
          </button>
  ))
  const layoutFoco = () => foco === 'geral' ? capaBento() : (
    <div className={`ce-painel op-foco${topoOp === 'lateral' ? '' : ` tp tp-${topoOp}`}`}>
      <nav className="op-foco-lista">
        <div className="fx-ctrl">{controles}</div>
        {topoOp === 'b' ? <div className="op-foco-pista">{itensLista}</div> : itensLista}
      </nav>
      <div className="op-foco-painel" key={foco}>
        {foco === 'financeiro' ? painelFinanceiro() : foco === 'patio' ? painelPatio() : foco === 'frota' ? <div className="fx-pad"><FrotaMapaCards /></div> /* só as abas novas; o painel antigo (parados, documentos…) saiu — José, 12/11 */
          : foco === 'requisicoes' ? <div className="fx-pad"><PainelRequisicoes /></div> /* cartões por assunto (José, 12/11) */
          : foco === 'comercial' ? <PainelComercial d={com} setD={setCom} dreG={dreG} erro={comErro} />
          // Pós-Vendas no mesmo jeito do Comercial: cartões por assunto (José, 12/11)
          : foco === 'posvendas' ? <PainelPosVendas dreG={dreG} oficina={OPER_POS.flatMap((o) => { const x = kv(o.id); return x ? [{ id: o.id, nome: o.nome, n: x.contagem, onClick: () => nova({ tipo: 'kpi', id: o.id, nome: o.nome }) }] : [] })} />
          // Peças no mesmo jeito (José, 12/11)
          : foco === 'pecas' ? <PainelPecas dreG={dreG} atencao={OPER_PEC.flatMap((o) => { const x = kv(o.id); return x ? [{ id: o.id, nome: o.nome, n: x.contagem, valor: typeof x.valor === 'number' ? x.valor : null, onClick: () => nova({ tipo: 'kpi', id: o.id, nome: o.nome }) }] : [] })} />
          : painelSetor(foco)}
      </div>
    </div>
  )

  // ── opção 4: semáforo (todos os números como blocos coloridos) ──
  type Bloco = { nome: string; val: string; sit: Sit | 'neutro'; abre: Janela; grande?: boolean }
  const grupos: Array<{ nome: string; cor: string; blocos: Bloco[] }> = [
    { nome: 'Empresa', cor: '#334155', blocos: [
      { nome: 'Faturou no mês', val: compacto(totalFat), sit: 'neutro', abre: { tipo: 'empresa' }, grande: true },
      ...(r ? [{ nome: 'Resultado', val: compacto(r.resultado), sit: (r.resultado >= 0 ? 'verde' : 'vermelho') as Sit, abre: { tipo: 'empresa' } as Janela, grande: true }] : []),
      ...(rv ? [{ nome: 'Clientes devem (vencido)', val: compacto(rv.valor || 0), sit: 'vermelho' as Sit, abre: { tipo: 'kpi', id: 'receber_vencido', nome: 'A receber vencido' } as Janela }] : []),
      ...(pv ? [{ nome: 'Nós devemos (vencido)', val: compacto(pv.valor || 0), sit: 'amarelo' as Sit, abre: { tipo: 'kpi', id: 'pagar_vencido', nome: 'A pagar vencido' } as Janela }] : []),
    ] },
    ...setores.filter((x) => x.ok).map((x) => ({ nome: x.nome, cor: corDoSetor(x.k), blocos: [
      { nome: 'Faturou', val: compacto(x.faturou), sit: 'neutro' as const, abre: { tipo: 'fatia', k: x.k, id: 'faturou' } as Janela, grande: true },
      { nome: x.sobrou >= 0 ? 'Sobrou' : 'Perdeu', val: compacto(Math.abs(x.sobrou)), sit: (x.sobrou >= 0 ? 'verde' : 'vermelho') as Sit, abre: { tipo: 'setor', k: x.k } as Janela, grande: true },
      ...x.perdas.map((pp) => ({ nome: pp.nome, val: pp.dinheiro ? compacto(pp.valor) : num(pp.valor), sit: (pp.dinheiro && pp.valor > 50000 ? 'vermelho' : 'amarelo') as Sit, abre: (pp.abre || { tipo: 'setor', k: x.k }) as Janela })),
    ] })),
    { nome: 'Operação', cor: '#334155', blocos: [
      ...(maquinas ? [{ nome: 'Máquinas com +180 dias', val: `${faixas[3].qtd} · ${compacto(faixas[3].valor)}`, sit: (faixas[3].qtd ? 'vermelho' : 'verde') as Sit, abre: { tipo: 'maquinas', so90: true } as Janela }] : []),
      ...OPER.map((o) => ({ nome: o.nome, val: o.k!.valor != null ? compacto(o.k!.valor) : num(o.k!.contagem), sit: (o.k!.contagem ? 'amarelo' : 'verde') as Sit, abre: { tipo: 'kpi', id: o.id, nome: o.nome } as Janela })),
    ] },
  ]
  const FUNDO: Record<Sit | 'neutro', string> = { verde: '#dcfce7', amarelo: '#fef3c7', vermelho: '#fee2e2', neutro: 'var(--portal-bg-secondary)' }
  const layoutSemaforo = () => (
    <div className="ce-painel op-sem">
      {grupos.map((g) => (
        <section key={g.nome} className="op-sem-grupo">
          <div className="op-sem-nome" style={{ color: g.cor }}>{g.nome}</div>
          <div className="op-sem-blocos">
            {g.blocos.map((b) => (
              <button key={b.nome} className={`op-sem-bloco${b.grande ? ' g' : ''}${b.sit === 'vermelho' ? ' op-alerta' : ''}`} style={{ background: FUNDO[b.sit] }} onClick={() => nova(b.abre)}>
                <small>{b.nome}</small><b style={{ color: b.sit === 'neutro' ? undefined : COR[b.sit as Sit] }}>{b.val}</b>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )

  return (
    <div className="ce" style={isMobile ? undefined : { height: 'calc(100vh - 84px)' }}>
      <style>{CSS + CSS_OPCOES + CSS_FOCO + CSS_FIN + CSS_NP + CSS_GERAL + CSS_IBCS + CSS_BENTO + CSS_PF + CSS_KD + CSS_CM + CSS_CML + CSS_CMT2 + CSS_CDP + CSS_CPF + CSS_CPV + CSS_CPC + CSS_CFR + CSS_CRQ}</style>
      {opcao !== 'foco' && (
        <div className="ce-topo" style={{ justifyContent: 'flex-end' }}>{controles}</div>
      )}

      {opcao === 'exec' ? layoutExec() : opcao === 'foco' ? layoutFoco() : opcao === 'semaforo' ? layoutSemaforo() : (
        <div className="ce-painel">
          {blocoEmpresa}
          {blocoSetores}
        </div>
      )}
      {modoTeste && (
        <div className="print-hidden ce-teste">
          <span>Opções</span>
          {([['atual', '1 · Atual'], ['exec', '2 · Executivo'], ['foco', '3 · Foco'], ['semaforo', '4 · Semáforo']] as const).map(([k, n]) => (
            <button key={k} className={opcao === k ? 'on' : ''} onClick={() => escolherOpcao(k)}>{n}</button>
          ))}
        </div>
      )}

      {topo && (
        <div className="ce-fundo" onClick={() => setPilha([])}>
          <div className="ce-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ce-m-barra">
              {pilha.length > 1 && <button className="ce-ico" onClick={voltar} aria-label="Voltar"><ArrowLeft size={16} /></button>}
              <div className="ce-trilha">{pilha.map((j, i) => <span key={i}>{i > 0 && ' › '}{tituloCurto(j)}</span>)}</div>
              <button className="ce-ico" onClick={() => setPilha([])} aria-label="Fechar"><X size={16} /></button>
            </div>
            <ConteudoJanela j={topo} abrir={abrir} setores={setores} fatiasDe={fatiasDe} painel={painel} familias={familias} custos={custos} home={home} maquinas={maquinas} mes={mesNome} com={com} setCom={setCom} />
          </div>
        </div>
      )}
      <TeclaEsc ativo={!!topo} onEsc={voltar} />
    </div>
  )
}

function TeclaEsc({ ativo, onEsc }: { ativo: boolean; onEsc: () => void }) {
  useEffect(() => {
    if (!ativo) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onEsc() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [ativo, onEsc])
  return null
}

function tituloCurto(j: Janela): string {
  switch (j.tipo) {
    case 'setor': return NOME[j.k]
    case 'fatia': return ({ faturou: 'Faturou', custo: 'Custo da mercadoria', vendedores: 'Vendedores', terceiros: 'Terceiros', gastos: 'Gastos fora das OS', salarios: 'Salários', comissoes: 'Comissões', rescisoes: 'Rescisões' } as Record<string, string>)[j.id] || j.id
    case 'familia': return j.nome
    case 'tecnico': return j.nome
    case 'kpi': return j.nome
    case 'cm': return j.nome
    case 'maquinas': return j.so90 ? 'Máquinas paradas' : 'Máquinas'
    case 'termo': return `O que é: ${TERMOS[j.id].t}`
    case 'empresa': return 'Resultado da empresa'
    case 'ajuste': return j.nome
    case 'dreGrupo': return limparDre(j.grupo)
    case 'dreConta': return limparDre(j.conta)
  }
}

// ── conteúdo das janelas ───────────────────────────────────────────────────────
interface Ctx { abrir: (j: Janela) => void; setores: Setor[]; fatiasDe: (s: Setor) => Fatia[]; painel: Painel | null; familias: Familia[] | null; custos: CustoMensalVendedor[] | null; home: Home | null; maquinas: Maquina[] | null; mes: string; dre?: ArvDre | null; com?: DadosComercial | null; setCom?: (f: (x: DadosComercial | null) => DadosComercial | null) => void }
/** "22. Despesas com Pessoal" → "Despesas com Pessoal" */
const limparDre = (s: string) => String(s || '').replace(/^\s*[\d.]+\s*/, '').trim() || s
const mesChave = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
/** Linha dos últimos meses (sparkline) */
function Linhazinha({ serie, cor, w = 90, h = 26 }: { serie: number[]; cor: string; w?: number; h?: number }) {
  if (serie.length < 2) return null
  const max = Math.max(...serie), min = Math.min(...serie), amp = max - min || 1
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * w},${h - 3 - ((v - min) / amp) * (h - 6)}`).join(' ')
  const [ux, uy] = pts.split(' ').pop()!.split(',').map(Number)
  return <svg width={w} height={h} className="fx-linhazinha"><polyline points={pts} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><circle cx={ux} cy={uy} r="3" fill={cor} /></svg>
}

function Cab({ titulo, valor, cor, sub, termo, abrir }: { titulo: string; valor?: string; cor?: string; sub?: string; termo?: keyof typeof TERMOS; abrir?: (j: Janela) => void }) {
  return (
    <div className="ce-m-cab">
      <div className="ce-m-tit">{titulo}{termo && abrir && <button className="ce-oque" onClick={() => abrir({ tipo: 'termo', id: termo })}><HelpCircle size={15} /> o que é isso?</button>}</div>
      {valor && <div className="ce-m-val" style={{ color: cor }}>{valor}</div>}
      {sub && <div className="ce-m-sub">{sub}</div>}
    </div>
  )
}
function LinhaConta({ rot, val, menos, forte, cor, onClick, termo, abrir }: { rot: string; val: number; menos?: boolean; forte?: boolean; cor?: string; onClick?: () => void; termo?: keyof typeof TERMOS; abrir?: (j: Janela) => void }) {
  return (
    <div className={`ce-conta${forte ? ' ce-conta-forte' : ''}${onClick ? ' ce-conta-click' : ''}`} onClick={onClick}>
      <span>{menos ? '− ' : ''}{rot}{termo && abrir && <button className="ce-oque" onClick={(e) => { e.stopPropagation(); abrir({ tipo: 'termo', id: termo }) }}><HelpCircle size={13} /></button>}</span>
      <b style={{ color: cor }}>{brl(Math.abs(val))}</b>{onClick && <ChevronRight size={14} style={{ opacity: .4 }} />}
    </div>
  )
}
const TERMO_DA_FATIA: Record<string, keyof typeof TERMOS> = { custo: 'custo_mercadoria', vendedores: 'vendedores', terceiros: 'terceiros', gastos: 'gastos_fora', salarios: 'equipe', comissoes: 'equipe', rescisoes: 'equipe', faturou: 'faturou' }

function ConteudoJanela({ j, ...c }: { j: Janela } & Ctx) {
  const { abrir } = c
  if (j.tipo === 'termo') {
    const t = TERMOS[j.id]
    return <><Cab titulo={t.t} /><div className="ce-m-corpo"><p className="ce-explica">{t.x}</p></div></>
  }
  if (j.tipo === 'empresa') {
    const r = c.home?.resultado_mes, ra = c.home?.resultado_mes_anterior
    if (!r) return <Cab titulo="Resultado da empresa" sub="Sem acesso ao DRE do Financeiro." />
    const col = (x: Res, nome: string) => (
      <div className="ce-m-col"><div className="ce-m-sec">{nome}</div>
        <LinhaConta rot="Entrou" val={x.receitaBruta} termo="faturou" abrir={abrir} />
        <LinhaConta rot="Custo do que foi vendido" val={x.cmv} menos termo="custo_mercadoria" abrir={abrir} />
        <LinhaConta rot="Despesas da empresa" val={x.despesas} menos />
        <LinhaConta rot={x.resultado >= 0 ? 'Lucro' : 'Prejuízo'} val={x.resultado} forte cor={x.resultado >= 0 ? COR.verde : COR.vermelho} />
      </div>
    )
    return (
      <><Cab titulo="Resultado da empresa" valor={brl(r.resultado)} cor={r.resultado >= 0 ? COR.verde : COR.vermelho} sub="A conta oficial do Financeiro, com todas as despesas" termo="dre" abrir={abrir} />
        <div className="ce-m-corpo"><div className="ce-m-cols">{col(r, `${c.mes} (até hoje)`)}{ra && col(ra, 'mês passado (fechado)')}</div></div></>
    )
  }
  if (j.tipo === 'setor') {
    const s = c.setores.find((x) => x.k === j.k)!
    const fs = c.fatiasDe(s)
    return (
      <>
        <Cab titulo={`A conta do ${s.nome} em ${c.mes}`} valor={`${s.sobrou >= 0 ? 'Sobrou' : 'Perdeu'} ${brl(Math.abs(s.sobrou))}`} cor={s.sobrou >= 0 ? COR.verde : COR.vermelho}
          sub={s.aviso ? `Obs.: ${s.aviso}` : undefined} termo="sobrou" abrir={abrir} />
        <div className="ce-m-corpo">
          <div className="ce-m-dois">
            <Pizza fatias={fs} tam={170} onFatia={(f) => abrir(f.id === 'lucro' ? { tipo: 'termo', id: 'sobrou' } : { tipo: 'fatia', k: s.k, id: f.id })}
              centro={<><small>faturou</small><b>{compacto(s.faturou)}</b></>} />
            <div className="ce-m-col" style={{ flex: 1, minWidth: 260 }}>
              <LinhaConta rot="Faturou" val={s.faturou} onClick={() => abrir({ tipo: 'fatia', k: s.k, id: 'faturou' })} termo="faturou" abrir={abrir} />
              {s.fatias.filter((f) => f.valor > 0).map((f) => <LinhaConta key={f.id} rot={f.nome} val={f.valor} menos onClick={() => abrir({ tipo: 'fatia', k: s.k, id: f.id })} termo={TERMO_DA_FATIA[f.id]} abrir={abrir} />)}
              <LinhaConta rot={s.sobrou >= 0 ? 'Sobrou' : 'Perdeu'} val={s.sobrou} forte cor={s.sobrou >= 0 ? COR.verde : COR.vermelho} termo="sobrou" abrir={abrir} />
              <div className="ce-m-nota">{s.faturou ? `Margem do setor: ${pct((s.sobrou / s.faturou) * 100, 1)}` : ''} <button className="ce-oque" onClick={() => abrir({ tipo: 'termo', id: 'margem' })}><HelpCircle size={13} /></button></div>
            </div>
          </div>
          {s.perdas.length > 0 && (
            <>
              <div className="ce-m-sec" style={{ marginTop: 16 }}>Deixando de ganhar <button className="ce-oque" onClick={() => abrir({ tipo: 'termo', id: 'deixando' })}><HelpCircle size={13} /></button></div>
              <div className="ce-lista">{s.perdas.map((p) => (
                <button key={p.id} className="ce-reg ce-reg-click" onClick={() => p.abre && abrir(p.abre)}>
                  <span className="ce-reg-tit">{p.nome}</span><span className="ce-reg-val">{p.dinheiro ? brl(p.valor) : num(p.valor)}</span><span className="ce-reg-sub">{p.sub}</span>
                </button>
              ))}</div>
            </>
          )}
        </div>
      </>
    )
  }
  if (j.tipo === 'fatia') return <JanelaFatia k={j.k} id={j.id} {...c} />
  if (j.tipo === 'familia') return <JanelaFamilia nome={j.nome} abrir={abrir} />
  if (j.tipo === 'tecnico') {
    const os = (c.painel?.os || []).filter((o) => o.tecnicos.includes(j.nome)).sort((a, b) => b.bruto - a.bruto)
    const l = c.painel?.linhas.find((x) => x.tecnico === j.nome)
    return (
      <><Cab titulo={j.nome} valor={l ? brl(l.bruto) : undefined} sub={l ? `${num(l.os)} OS faturadas · ${num(l.faturadas)} h cobradas${l.meta ? ` de ${num(l.meta)} h da meta` : ''}` : undefined} />
        <div className="ce-m-corpo"><div className="ce-lista">{os.map((o) => (
          <div key={o.os} className="ce-reg"><span className="ce-reg-tit">{o.os} · {o.cliente}</span><span className="ce-reg-val">{brl(o.bruto / (o.tecnicos.length || 1))}</span>
            <span className="ce-reg-sub">{o.data.slice(8, 10)}/{o.data.slice(5, 7)} · {num(o.horasCobradas)} h{o.tecnicos.length > 1 ? ` · dividida com ${o.tecnicos.filter((x) => x !== j.nome).join(', ')}` : ''}{o.garantia ? ' · garantia' : ''}</span></div>
        ))}</div></div></>
    )
  }
  if (j.tipo === 'kpi') return <JanelaKpi id={j.id} nome={j.nome} />
  if (j.tipo === 'cm') return <JanelaComercial key={j.id} id={j.id} d={c.com} setD={c.setCom} />
  if (j.tipo === 'ajuste') return <><Cab titulo={`Por que tiramos: ${j.nome.toLowerCase()}`} valor={brl(j.valor)} sub={`${j.qtd} lançamentos no mês`} /><div className="ce-m-corpo"><p className="ce-explica">{j.explica}</p><p className="ce-explica" style={{ marginTop: 12, fontSize: 14, color: '#475569' }}>O Omie lança isso como custo ou despesa no DRE, o que faz o mês parecer pior do que é. O DRE gerencial tira o lançamento para mostrar o resultado real da operação. A correção definitiva é no plano de contas do Omie (categoria → DRE), com o contador.</p></div></>
  if (j.tipo === 'dreGrupo') {
    const g = c.dre?.[j.tipoDre]?.grupos?.[j.grupo]
    if (!g) return <Cab titulo={limparDre(j.grupo)} sub="Sem dados." />
    const mk = mesChave(), contas = Object.entries(g.contas).map(([n, x]) => ({ n, v: Math.abs(x.por_mes[mk] || 0), x })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
    const max = Math.max(1, ...contas.map((x) => x.v)), meses = Object.keys(g.por_mes).sort()
    return (
      <><Cab titulo={limparDre(j.grupo)} valor={brl(Math.abs(g.por_mes[mk] || 0))} sub="Neste mês, por conta · a linha mostra os últimos meses · clique para ver os lançamentos" />
        <div className="ce-m-corpo"><div className="ce-lista">{contas.map((x) => (
          <button key={x.n} className="fx-desp" onClick={() => abrir({ tipo: 'dreConta', tipoDre: j.tipoDre, grupo: j.grupo, conta: x.n })}>
            <span className="fx-desp-nome">{limparDre(x.n)}</span>
            <span className="fx-trilho"><span style={{ width: `${(x.v / max) * 100}%`, background: '#ef4444' }} /></span>
            <Linhazinha serie={meses.map((m) => Math.abs(x.x.por_mes[m] || 0))} cor="#ef4444" />
            <b>{compacto(x.v)}</b>
          </button>
        ))}</div></div></>
    )
  }
  if (j.tipo === 'dreConta') return <JanelaLancamentos tipoDre={j.tipoDre} grupo={j.grupo} conta={j.conta} />
  if (j.tipo === 'maquinas') {
    const l = (c.maquinas || []).filter((m) => !j.so90 || m.dias_em_estoque > 90).sort((a, b) => b.dias_em_estoque - a.dias_em_estoque)
    return (
      <><Cab titulo={j.so90 ? 'Máquinas paradas há mais de 90 dias' : 'Máquinas no estoque'} valor={brl(l.reduce((a, m) => a + m.valor_estoque, 0))}
        sub={`${num(l.length)} itens · custam ${compacto(l.reduce((a, m) => a + m.custo_capital_mes, 0))} por mês parados`} termo="capital" abrir={abrir} />
        <div className="ce-m-corpo"><div className="ce-lista">{l.map((m) => (
          <div key={m.codigo_produto} className="ce-reg"><span className="ce-reg-tit">{m.descricao}</span><span className="ce-reg-val">{compacto(m.valor_estoque)}</span>
            <span className="ce-reg-sub"><b style={{ color: m.dias_em_estoque > 90 ? COR.vermelho : undefined }}>{num(m.dias_em_estoque)} dias</b> · {m.familia_nome} · custa {compacto(m.custo_capital_mes)}/mês</span></div>
        ))}</div></div></>
    )
  }
  return null
}

function JanelaFatia({ k, id, abrir, setores, painel, familias, custos }: { k: K; id: string } & Ctx) {
  const s = setores.find((x) => x.k === k)!
  const termo = TERMO_DA_FATIA[id]
  if ((k === 'comercial' || k === 'pecas') && (id === 'faturou' || id === 'custo')) {
    const l = (familias || []).filter((f) => (k === 'pecas' ? E_PECA.test(f.nome) : !E_PECA.test(f.nome))).filter((f) => f.venda || f.vendaMesAnt).sort((a, b) => b.venda - a.venda)
    const max = Math.max(1, ...l.map((f) => (id === 'custo' ? f.cmc : f.venda)))
    return (
      <><Cab titulo={id === 'faturou' ? `${s.nome}: o que foi vendido` : `${s.nome}: quanto custou o que foi vendido`} valor={brl(id === 'faturou' ? s.faturou : l.reduce((a, f) => a + f.cmc, 0))} sub="Por família · clique para ver item por item" termo={termo} abrir={abrir} />
        <div className="ce-m-corpo"><div className="ce-tab">
          <div className="ce-tr ce-th"><span>Família</span><span>Qtd</span><span>Venda</span><span>Custo</span><span>Margem</span></div>
          {l.map((f) => (
            <button key={f.nome} className="ce-tr ce-tr-click" onClick={() => abrir({ tipo: 'familia', nome: f.nome })}>
              <span><b>{f.nome}</b><span className="ce-mini"><span style={{ width: `${((id === 'custo' ? f.cmc : f.venda) / max) * 100}%`, background: corDoSetor(k) }} /></span></span>
              <span>{num(f.qtd)}</span><span>{compacto(f.venda)}</span><span>{compacto(f.cmc)}</span><span>{f.venda ? pct(((f.venda - f.cmc) / f.venda) * 100) : '—'}</span>
            </button>
          ))}
        </div></div></>
    )
  }
  if (k === 'comercial' && id === 'vendedores') {
    const l = [...(custos || [])].sort((a, b) => totalCusto(b) - totalCusto(a))
    return (
      <><Cab titulo="Custo dos vendedores no mês" valor={brl(l.reduce((a, x) => a + totalCusto(x), 0))} termo="vendedores" abrir={abrir} />
        <div className="ce-m-corpo"><div className="ce-lista">{l.map((v) => (
          <div key={v.id} className="ce-reg"><span className="ce-reg-tit">{v.nome}</span><span className="ce-reg-val">{brl(totalCusto(v))}</span>
            <span className="ce-reg-sub">salário {compacto(v.salario)} · encargos {compacto(v.encargos)} · carro {compacto(v.carro_aluguel + v.combustivel + v.manutencao)}{v.custos_extras ? ` · extras ${compacto(v.custos_extras)}` : ''}</span></div>
        ))}</div></div></>
    )
  }
  if (k === 'posvendas' && painel) {
    if (id === 'faturou') {
      const l = painel.linhas.filter((x) => x.bruto > 0).sort((a, b) => b.bruto - a.bruto)
      const t = painel.total
      return (
        <><Cab titulo="Pós-Vendas: o que foi faturado" valor={brl(t.bruto)} sub={`mão de obra ${compacto(t.servico)} · km ${compacto(t.kmValor)} · peças ${compacto(t.pecas)} · outros ${compacto(t.outros)} · clique num técnico para ver as OS`} termo="faturou" abrir={abrir} />
          <div className="ce-m-corpo"><div className="ce-lista">{l.map((x) => (
            <button key={x.tecnico} className="ce-reg ce-reg-click" onClick={() => abrir({ tipo: 'tecnico', nome: x.tecnico })}>
              <span className="ce-reg-tit">{x.tecnico}</span><span className="ce-reg-val">{brl(x.bruto)}</span>
              <span className="ce-reg-sub">{num(x.os)} OS · {num(x.faturadas)} h cobradas{x.meta ? ` de ${num(x.meta)} h da meta` : ''}</span>
            </button>
          ))}</div></div></>
      )
    }
    if (id === 'terceiros') {
      const reqs = painel.os.flatMap((o) => (o.requisicoes || []).map((rq) => ({ ...rq, os: o.os, cliente: o.cliente }))).sort((a, b) => b.valor - a.valor)
      return (
        <><Cab titulo="Pago a terceiros" valor={brl(painel.total.bruto - painel.total.liquido)} sub={`${num(reqs.length)} requisições ligadas às OS faturadas`} termo="terceiros" abrir={abrir} />
          <div className="ce-m-corpo"><div className="ce-lista">{reqs.map((rq) => (
            <div key={`${rq.os}-${rq.id}`} className="ce-reg"><span className="ce-reg-tit">{rq.titulo || rq.tipo}</span><span className="ce-reg-val">{brl(rq.valor)}</span>
              <span className="ce-reg-sub">{rq.fornecedor || 'sem fornecedor'} · {rq.os} · {rq.cliente}</span></div>
          ))}</div></div></>
      )
    }
    if (id === 'gastos') {
      const g = painel.gastos
      return (
        <><Cab titulo="Gastos fora das OS" valor={brl(g.foraDasOS)} sub={`combustível ${compacto(g.abastecimento)} · manutenção ${compacto(g.manutencao)} · alimentação ${compacto(g.alimentacao)} · materiais ${compacto(g.materiais)}`} termo="gastos_fora" abrir={abrir} />
          <div className="ce-m-corpo"><div className="ce-lista">{g.porPessoa.filter((p) => p.foraDasOS > 0).sort((a, b) => b.foraDasOS - a.foraDasOS).map((p) => (
            <div key={p.pessoa} className="ce-reg"><span className="ce-reg-tit">{p.pessoa}</span><span className="ce-reg-val">{brl(p.foraDasOS)}</span>
              <span className="ce-reg-sub">combustível {compacto(p.abastecimento)} ({num(p.litros)} L) · manutenção {compacto(p.manutencao)} · alimentação {compacto(p.alimentacao)} · materiais {compacto(p.materiais)}</span></div>
          ))}</div></div></>
      )
    }
    if (id === 'salarios' || id === 'comissoes' || id === 'rescisoes') {
      const eq = painel.equipe
      const val = (d: Painel['equipe']['detalhe'][string]) => (id === 'salarios' ? d.salario : id === 'comissoes' ? d.comissao + d.comissaoPrevista : d.rescisao)
      const l = Object.entries(eq.detalhe).map(([p, d]) => ({ p, d, v: val(d) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
      return (
        <><Cab titulo={id === 'salarios' ? 'Salários e encargos' : id === 'comissoes' ? 'Comissões' : 'Rescisões'} valor={brl(l.reduce((a, x) => a + x.v, 0))}
          sub={id === 'salarios' ? `dos quais encargos: ${compacto(eq.encargos)}` : id === 'comissoes' ? `lançada no RH ${compacto(eq.comissao)} · prevista ${compacto(eq.comissaoPrevista)}` : undefined} termo="equipe" abrir={abrir} />
          <div className="ce-m-corpo"><div className="ce-lista">{l.map((x) => (
            <div key={x.p} className="ce-reg"><span className="ce-reg-tit">{x.p}</span><span className="ce-reg-val">{brl(x.v)}</span>
              <span className="ce-reg-sub">{id === 'salarios' ? `encargos ${compacto(x.d.encargos)}` : id === 'comissoes' ? (x.d.comissaoPrevista ? 'prevista (ainda não lançada no RH)' : 'lançada no RH') : 'rescisão no mês'}</span></div>
          ))}</div></div></>
      )
    }
  }
  return <Cab titulo="Sem detalhe para este número" />
}

function JanelaFamilia({ nome, abrir }: { nome: string; abrir: (j: Janela) => void }) {
  const [itens, setItens] = useState<VendaEnriquecida[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    carregarVendasMes().then((v) => { if (vivo) setItens(v.filter((x) => (x.produto_familia_real ?? x.familia ?? '') === nome)) }).catch(() => { if (vivo) setErro('Não deu para carregar os itens agora.') })
    return () => { vivo = false }
  }, [nome])
  const l = [...(itens || [])].sort((a, b) => b.valor_total - a.valor_total)
  const venda = l.reduce((a, x) => a + x.valor_total, 0), custo = l.reduce((a, x) => a + (x.cmc_unitario || 0) * x.quantidade, 0)
  return (
    <><Cab titulo={`${nome}: item por item`} valor={itens ? brl(venda) : undefined} sub={itens ? `${num(l.length)} itens · margem ${venda ? pct(((venda - custo) / venda) * 100, 1) : '—'}` : 'Buscando os itens do mês (pode levar alguns segundos)…'} termo="margem" abrir={abrir} />
      <div className="ce-m-corpo">
        {erro && <div className="ce-mudo">{erro}</div>}
        <div className="ce-lista">{l.map((x) => {
          const c = (x.cmc_unitario || 0) * x.quantidade, m = x.valor_total ? ((x.valor_total - c) / x.valor_total) * 100 : 0
          return (
            <div key={x.id} className="ce-reg"><span className="ce-reg-tit">{x.descricao}</span><span className="ce-reg-val">{brl(x.valor_total)}</span>
              <span className="ce-reg-sub">{x.cliente_nome || 'cliente'} · pedido {x.numero_pedido} · {x.vendedor || 'sem vendedor'} · {num(x.quantidade)} un · <b style={{ color: m < 0 ? COR.vermelho : m < 10 ? COR.amarelo : COR.verde }}>margem {pct(m)}</b></span></div>
          )
        })}</div>
      </div></>
  )
}

function JanelaLancamentos({ tipoDre, grupo, conta }: { tipoDre: string; grupo: string; conta: string }) {
  const [itens, setItens] = useState<Array<Record<string, unknown>> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const d = new Date()
        const q = new URLSearchParams({ ano: String(d.getFullYear()), mes: String(d.getMonth() + 1), dre_tipo: tipoDre, dre_grupo: grupo, dre_conta: conta })
        const r = await fetch(`/api/dre-financeiro/dre/detalhe?${q}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); return }
        setItens(j.movimentos || [])
      } catch { if (vivo) setErro('Não deu para carregar os lançamentos agora.') }
    })()
    return () => { vivo = false }
  }, [tipoDre, grupo, conta])
  const txt = (m: Record<string, unknown>, ...k: string[]) => { for (const x of k) if (m[x]) return String(m[x]); return '' }
  const total = (itens || []).reduce((a, m) => a + Math.abs(Number(m.valor) || 0), 0)
  return (
    <><Cab titulo={limparDre(conta)} valor={itens ? brl(total) : undefined} sub={itens ? `${itens.length} lançamentos neste mês, do maior para o menor` : 'Carregando…'} />
      <div className="ce-m-corpo">
        {erro && <div className="ce-mudo">{erro}</div>}
        {itens && !itens.length && <div className="ce-mudo">Nenhum lançamento.</div>}
        <div className="ce-lista">{(itens || []).map((m, i) => (
          <div key={i} className="ce-reg">
            <span className="ce-reg-tit">{txt(m, 'nome_fornecedor', 'razao_social', 'fornecedor', 'nome', 'cliente', 'cnpj_cpf') || 'sem nome'}</span>
            <span className="ce-reg-val">{brl(Math.abs(Number(m.valor) || 0))}</span>
            <span className="ce-reg-sub">{[txt(m, 'data_emissao', 'data', 'data_vencimento', 'data_pagamento'), txt(m, 'observacao', 'descricao', 'historico', 'numero_documento')].filter(Boolean).join(' · ')}</span>
          </div>
        ))}</div>
      </div></>
  )
}

function JanelaKpi({ id, nome }: { id: string; nome: string }) {
  const [itens, setItens] = useState<Registro[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/planta/kpi/${id}?conta=TODAS`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); return }
        setItens(j.itens || []); setTotal(j.total || 0)
      } catch { if (vivo) setErro('Não deu para carregar os registros agora.') }
    })()
    return () => { vivo = false }
  }, [id])
  const soma = (itens || []).reduce((a, x) => a + (x.valor || 0), 0)
  // contas com data (vencimento/previsão): agrupa por dia, com o total do dia em destaque (José, 11/11: "destaca os dias e valores")
  const corVal = id.startsWith('receber') ? '#15803d' : id.startsWith('pagar') ? '#b91c1c' : '#0f172a'
  const DATA = /(\d{2})\/(\d{2})\/(\d{4})/
  const dias = (() => {
    if (!itens?.length || !itens.every((it) => DATA.test(it.sub))) return null
    const hoje = new Date(hojeSP() + 'T12:00:00')
    const g = new Map<string, { data: string; rotulo: string; quando: string; total: number; itens: Array<Registro & { resto: string }> }>()
    for (const it of itens) {
      const m = it.sub.match(DATA)!, chave = `${m[3]}-${m[2]}-${m[1]}`
      if (!g.has(chave)) {
        const dt = new Date(chave + 'T12:00:00'), dif = Math.round((dt.getTime() - hoje.getTime()) / 864e5)
        const sem = dt.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '')
        g.set(chave, { data: chave, rotulo: `${cap(sem)}, ${m[1]}/${m[2]}`, total: 0, itens: [],
          quando: dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : dif === -1 ? 'ontem' : dif > 0 ? `daqui a ${dif} dias` : `há ${-dif} dias` })
      }
      const d = g.get(chave)!
      d.total += it.valor || 0
      d.itens.push({ ...it, resto: it.sub.replace(/\s*·?\s*(previs[ãa]o|vencimento|venceu|venc\.?|vence)?\s*\d{2}\/\d{2}\/\d{4}/i, '').replace(/^\s*·\s*/, '') })
    }
    const out = [...g.values()].sort((a, b) => a.data.localeCompare(b.data))
    for (const d of out) d.itens.sort((a, b) => (b.valor || 0) - (a.valor || 0))
    return out
  })()
  const maxDia = Math.max(1, ...(dias || []).map((d) => Math.abs(d.total)))
  // nos 30 dias a lista mistura entra (+) e sai (−): a cor segue o sinal
  const corDe = (v: number) => (id === 'fluxo_30d' ? (v >= 0 ? '#15803d' : '#b91c1c') : corVal)
  return (
    <><Cab titulo={nome} valor={soma ? brl(soma) : undefined} sub={itens ? (total > itens.length ? `${itens.length} de ${total} registros` : `${total} registros`) : 'Carregando…'} />
      <div className="ce-m-corpo">
        {erro && <div className="ce-mudo">{erro}</div>}
        {itens && !itens.length && <div className="ce-mudo">Nada aqui agora.</div>}
        {dias ? (
          <div className="kd">
            {dias.map((d) => (
              <section key={d.data} className="kd-dia">
                <div className="kd-cab">
                  <span className="kd-data"><b>{d.rotulo}</b><small>{d.quando}</small></span>
                  <span className="kd-trilho"><span style={{ width: `${(Math.abs(d.total) / maxDia) * 100}%`, background: corDe(d.total) }} /></span>
                  <span className="kd-total" style={{ color: corDe(d.total) }}>{brl(d.total)}</span>
                </div>
                {d.itens.map((it) => (
                  <div key={it.chave} className="kd-item"><span className="kd-tit">{it.titulo}</span><span className="kd-val" style={id === 'fluxo_30d' && (it.valor || 0) < 0 ? { color: '#b91c1c' } : undefined}>{it.valor == null ? '' : brl(it.valor)}</span><span className="kd-sub">{it.resto}</span></div>
                ))}
              </section>
            ))}
          </div>
        ) : (
        <div className="ce-lista">{(itens || []).map((it) => (
          <div key={it.chave} className="ce-reg"><span className="ce-reg-tit">{it.titulo}</span><span className="ce-reg-val">{it.valor == null ? '' : brl(it.valor)}</span><span className="ce-reg-sub">{it.sub}</span></div>
        ))}</div>
        )}
      </div></>
  )
}

/* ESTILO POS NEWPORTAL NA PÁGINA INTEIRA (José, 11/11: "coloca tudo com o estilo new portal")
   sem negrito (400/500), sem caixa alta, texto escuro, cartões brancos com borda e cantos 16, números 500 tabulares,
   ícone em quadradinho na cor com fundo a 9%. O Font Awesome sólido continua com peso 900 (senão vira quadradinho). */
// janela de contas agrupada por dia
const CSS_KD = `
.kd{display:flex;flex-direction:column;gap:14px}
.kd-dia{border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;background:#fefefe}
.kd-cab{display:grid;grid-template-columns:minmax(150px,auto) 1fr auto;align-items:center;gap:14px;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
.kd-data{display:flex;flex-direction:column;line-height:1.2}
.kd-data b{font-size:16px;font-weight:500;color:#0f172a}
.kd-data small{font-size:12.5px;color:#64748b}
.kd-trilho{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}
.kd-trilho span{display:block;height:100%;border-radius:99px;opacity:.75}
.kd-total{font-size:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.kd-item{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:10px 16px;border-top:1px solid #f1f5f9}
.kd-item:first-of-type{border-top:0}
.kd-tit{font-size:14px;color:#0f172a}
.kd-val{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;text-align:right}
.kd-sub{grid-column:1/-1;font-size:12.5px;color:#64748b}
@media (max-width:620px){.kd-cab{grid-template-columns:1fr auto}.kd-trilho{display:none}.kd-total{font-size:17px}}
`

// painel do Financeiro (só Planta Viva, 11/11)
const CSS_PF = `
.pf{padding:18px 22px 26px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.ce .pf-card{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;color:#0f172a;font-family:inherit;transition:box-shadow .25s,transform .25s,border-color .25s;animation:ceFade .3s both}
.ce button.pf-card{cursor:pointer}
.ce button.pf-card:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c,#64748b) 35%,#e2e8f0)}
.ce .pf-venc{background:linear-gradient(165deg,color-mix(in srgb,var(--c) 7%,#fefefe),#fefefe 55%)}
.pf-dois{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pf-cab{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:500;color:#0f172a}
.pf-ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:15px;color:var(--c,#64748b);background:color-mix(in srgb,var(--c,#64748b) 10%,#fefefe);border:1px solid color-mix(in srgb,var(--c,#64748b) 18%,transparent);flex:none}
.pf-seta{margin-left:auto;color:#94a3b8;font-size:13px}
.pf-num{font-size:40px;font-weight:500;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--c);line-height:1.1;margin-top:4px}
.pf-sub{font-size:13.5px;color:#475569}
.pf-barra{display:flex;height:12px;border-radius:99px;overflow:hidden;gap:2px;margin-top:6px}
.pf-barra span{display:block;height:100%;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.pf-leg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.pf-leg span{display:flex;flex-direction:column;font-size:12px;color:#64748b;gap:2px}
.pf-leg i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-bottom:2px}
.pf-leg b{font-size:14px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.pf-tres{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:4px}
.pf-per{background:#f8fafc;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.pf-per-nome{font-size:14px;font-weight:500;color:#0f172a}
.ce .pf-linha{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:10px;font-size:13px;color:#475569;cursor:pointer;border-radius:8px;padding:2px 4px}
.ce .pf-linha:hover{background:#eef2f7}
.pf-linha b{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;min-width:84px;text-align:right}
.pf-trilho{height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden}
.pf-trilho span{display:block;height:100%;border-radius:99px;animation:btCresce .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.pf-dif{align-self:flex-start;font-size:12.5px;font-weight:500;padding:4px 10px;border-radius:99px;display:inline-flex;gap:6px;align-items:center}
.pf-tag{margin-left:auto;font-size:12.5px;font-weight:500;padding:4px 10px;border-radius:99px}
.ce .pf-fila{flex-direction:row;align-items:center;gap:12px;font-size:14.5px;color:#334155}
.pf-fila b{font-weight:500;color:#0f172a}
@media (max-width:1100px){.pf-tres{grid-template-columns:1fr}}
.pf-tres-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.ce .pf-card.pf-g{gap:8px;padding:24px 24px 20px;background:linear-gradient(165deg,color-mix(in srgb,var(--c) 8%,#fefefe),#fefefe 60%)}
.pf-g .pf-ic{width:44px;height:44px;font-size:18px;border-radius:13px;margin-bottom:6px}
.pf-tit{font-size:17px;font-weight:500;color:#0f172a}
.pf-g .pf-num{font-size:46px}
.pf-g .pf-sub{font-size:14.5px;line-height:1.4}
.pf-g .pf-sub b{font-weight:500;color:#0f172a}
.pf-acao{margin-top:auto;padding-top:12px;font-size:14px;font-weight:500;color:var(--c);display:inline-flex;align-items:center;gap:8px}
.pf-acao i{transition:transform .2s}
.ce button.pf-g:hover .pf-acao i{transform:translateX(4px)}
@media (max-width:1100px){.pf-tres-g{grid-template-columns:1fr}.pf-g .pf-num{font-size:38px}}
@media (max-width:700px){.pf{padding:12px}.pf-dois{grid-template-columns:1fr}.pf-num{font-size:32px}.pf-leg{grid-template-columns:repeat(2,1fr)}}
`
// capa estilo E · Bento colorido (11/11) — mesmo visual de public/teste-estilos.html
const CSS_BENTO = `
.bt{overflow-y:auto;padding:16px 20px 24px;display:flex;flex-direction:column;gap:14px}
.bt-topo{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bt-ctrl{display:flex;align-items:center;gap:10px}
.bt-meses{display:flex;align-items:center;gap:2px;background:var(--portal-bg-secondary,#f1f5f9);border-radius:12px;padding:4px;overflow-x:auto;max-width:100%}
.bt-meses>i{color:#64748b;padding:0 8px 0 6px}
.bt .bt-meses button{border:0;background:transparent;border-radius:9px;padding:6px 12px;font:inherit;font-size:13.5px;font-weight:500;color:#475569;cursor:pointer}
.bt .bt-meses button.on{background:#fefefe;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.15)}
.bt-meses span{font-size:12px;color:#64748b;padding:0 8px;white-space:nowrap}
.bt-grade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(225px,auto);gap:14px;grid-template-areas:"fin fin com pos" "fin fin pec fro" "pat pat req req"}
.bt .bt-card{all:unset;box-sizing:border-box;border-radius:22px;padding:20px;color:#fff;position:relative;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;gap:14px;transition:transform .25s,box-shadow .25s;animation:ceFade .35s both;font-family:inherit}
.bt .bt-card:hover{transform:scale(1.012);box-shadow:0 18px 34px -22px rgba(15,23,42,.7)}
.bt .bt-card:focus-visible{outline:3px solid #0f172a;outline-offset:2px}
.bt .bt-card.bt-din{justify-content:flex-start}
.bt-cab{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bt-nome{font-size:15px;font-weight:500;display:flex;align-items:center;gap:8px}
.bt-sit{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.95);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.bt-corpo{flex:1;display:flex;flex-direction:column;gap:10px}
.bt-ve{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bt-g .bt-ve{margin-top:22px}
.bt-ve small{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:rgba(255,255,255,.9)}
.bt-ve small i{width:10px;height:10px;border-radius:3px;display:inline-block}
.bt-ve b{display:block;font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.18);white-space:nowrap}
.bt-g .bt-ve b{font-size:46px}
.bt-barras{display:flex;flex-direction:column;gap:6px}
.bt-barras span{display:block;height:10px;border-radius:99px;animation:btCresce .9s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
@keyframes btCresce{from{transform:scaleX(0)}}
.bt-res{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:5px 12px;border-radius:99px;background:#fff}
.bt-curva{display:block;width:100%;height:46px;margin-top:auto;padding-top:8px;opacity:.85}
.bt-g .bt-curva{flex:1;min-height:140px;max-height:240px;height:auto}
.bt-op{margin-top:auto}
.bt-num{font-size:34px;font-weight:600;letter-spacing:-.02em}
.bt-rot{font-size:13px;opacity:.9}
.bt-det{font-size:13.5px;font-weight:500;margin-top:4px}
.bt-aviso{font-size:13px;color:#64748b}
.ce-rodape{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;font-size:12.5px;color:#64748b;padding:10px 4px 2px;margin-top:auto}
.op-foco-painel .ce-rodape{padding:10px 22px 16px}
.ce-rodape b{font-weight:500;color:#475569}
.ce-rodape-alerta{color:#b45309}.ce-rodape-alerta b{color:#92400e}
.ce-rodape i{margin-right:4px}
.ce .ce-rodape-bt{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#475569;border:1px solid var(--portal-border);border-radius:99px;padding:5px 12px;cursor:pointer;background:var(--portal-bg-card,#fefefe)}
.ce .ce-rodape-bt:hover{border-color:#94a3b8;color:#0f172a}
.ce .ce-rodape-bt:disabled{opacity:.6;cursor:default}
@media (max-width:620px){.ce .ce-rodape-bt{margin-left:0}}
/* CAPA SÓ COM NOMES — opções em teste (José, 11/11) */
.bt .bt-card.bt-so-nome{justify-content:flex-end;min-height:0;padding:16px 20px;border-radius:18px}
.bt-formas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:transform .6s cubic-bezier(.22,1,.36,1)}
.bt .bt-card.bt-so-nome:hover .bt-formas{transform:scale(1.06) rotate(-1.5deg)}
.bt-nome-g{position:relative;z-index:1;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:600;letter-spacing:-.02em;text-shadow:0 1px 2px rgba(0,0,0,.15)}
.bt-nome-g i{font-size:.6em;opacity:0;transform:translateX(-8px);transition:opacity .25s,transform .25s}
.bt .bt-card.bt-so-nome:hover .bt-nome-g i{opacity:.9;transform:none}
/* 1 · lista: um embaixo do outro, faixas baixas na largura toda */
.bt-grade.cp-lista{grid-template-areas:none;grid-template-columns:minmax(0,1fr);grid-auto-rows:64px;gap:8px;max-width:760px;width:100%;margin:0 auto}
.cp-lista .bt-card.bt-so-nome{justify-content:center;padding:0 22px;border-radius:14px}
.cp-lista .bt-nome-g{font-size:18px;font-weight:500}
.cp-lista .bt-nome-g i{margin-left:auto;opacity:.7;transform:none}
/* 2 · colunas em pé */
.bt-grade.cp-colunas{grid-template-areas:none;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:min(62vh,440px);gap:12px}
.cp-colunas .bt-nome-g{font-size:19px}
/* 3 · bento pequeno (Financeiro maior) */
.bt-grade.cp-bento{flex:1;min-height:0;grid-template-rows:repeat(3,minmax(110px,1fr));grid-auto-rows:auto;gap:12px} /* ocupa a altura toda da tela (sem espaço branco embaixo) */
.cp-bento .bt-card.bt-so-nome:first-child .bt-nome-g{font-size:34px}
/* 4 · grade simples 4 × 2 */
.bt-grade.cp-grade{grid-template-areas:none;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:150px;gap:12px}
@media (max-width:1100px){.bt-grade.cp-bento{grid-template-rows:repeat(4,minmax(110px,1fr))}}
@media (max-width:1100px){.bt-grade.cp-colunas,.bt-grade.cp-grade{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:170px}}
@media (max-width:620px){.bt-grade.cp-colunas,.bt-grade.cp-grade,.bt-grade.cp-bento{grid-template-areas:none;grid-template-rows:none;flex:none;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:110px}.bt-nome-g,.cp-bento .bt-card.bt-so-nome:first-child .bt-nome-g{font-size:19px}.bt-grade.cp-lista{grid-auto-rows:56px}}
/* OPÇÕES DE TOPO em teste (José, 11/11: "coloca no testes, opções para deixar no topo") — classe tp-a/b/c/d no .op-foco */
.op-foco.tp{flex-direction:column}
.tp .op-foco-lista{width:auto;flex-direction:row;align-items:center;gap:6px;padding:10px 16px;border-right:0;border-bottom:1px solid var(--portal-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;flex-shrink:0}
.tp .op-foco-lista .fx-ctrl{border:0;margin:0;padding:0 10px 0 0;flex:none;gap:6px}
.tp .op-foco-lista .fx-ctrl-mes{white-space:nowrap;font-size:12.5px;padding:0 4px}
.ce .tp .op-foco-item{flex:none;min-width:0;white-space:nowrap}
.tp .op-foco-nome,.tp .op-foco-val{white-space:nowrap}
/* A · abas do Chrome: a aba aberta "cola" no painel */
.tp-a .op-foco-lista{align-items:flex-end;padding:10px 14px 0;gap:2px;background:var(--portal-bg-secondary)}
.tp-a .op-foco-lista .fx-ctrl{align-self:center;padding-bottom:6px}
.ce .tp-a .op-foco-item{border:1px solid transparent;border-bottom:0;border-radius:12px 12px 0 0;background:transparent;padding:9px 16px 10px;gap:8px;margin-bottom:-1px;box-shadow:none;transform:none}
.ce .tp-a .op-foco-item:hover{background:color-mix(in srgb,var(--portal-text) 5%,transparent);transform:none;box-shadow:none}
.ce .tp-a .op-foco-item.on{background:var(--portal-bg);border-color:var(--portal-border)}
.tp-a .op-foco-ico{width:26px;height:26px;font-size:12px;border-radius:8px}
.tp-a .op-foco-nome{font-size:14px}.tp-a .op-foco-val{display:none!important}
.tp-a .op-dot{width:7px;height:7px}
/* B · pílulas (controle segmentado) */
.tp-b .op-foco-lista{background:var(--portal-bg);border-bottom:0;padding:14px 16px 6px}
.tp-b .op-foco-pista{display:flex;gap:2px;background:var(--portal-bg-secondary);border:1px solid var(--portal-border);border-radius:99px;padding:4px}
.ce .tp-b .op-foco-item{border:0;background:transparent;border-radius:99px;padding:7px 14px;gap:8px;box-shadow:none;transform:none}
.ce .tp-b .op-foco-item:hover{background:color-mix(in srgb,var(--portal-text) 5%,transparent);transform:none;box-shadow:none}
.ce .tp-b .op-foco-item.on{background:var(--portal-bg-card,#fefefe);box-shadow:0 1px 4px rgba(15,23,42,.18)}
.tp-b .op-foco-ico{width:auto;height:auto;background:none!important;border:0!important;font-size:14px}
.tp-b .op-foco-nome{font-size:14px}.tp-b .op-foco-val{display:none!important}
.tp-b .op-dot{width:7px;height:7px}
/* C · mini-cartões coloridos (o Bento em miniatura) */
.tp-c .op-foco-lista{gap:8px;padding:12px 16px}
.ce .tp-c .op-foco-item{border:0;border-radius:14px;padding:9px 14px;gap:10px;min-width:150px;color:#fff;background:linear-gradient(140deg,var(--cor),color-mix(in srgb,var(--cor) 65%,#000));opacity:.78;box-shadow:none}
.ce .tp-c .op-foco-item:hover{opacity:1;transform:translateY(-2px)}
.ce .tp-c .op-foco-item.on{opacity:1;box-shadow:0 0 0 3px var(--portal-bg),0 0 0 5px var(--cor)}
.tp-c .op-foco-ico{background:rgba(255,255,255,.18)!important;border:0!important;color:#fff!important;width:32px;height:32px;font-size:13px}
.tp-c .op-foco-nome{color:#fff;font-size:13.5px}.tp-c .op-foco-val{color:rgba(255,255,255,.9);font-size:12.5px}
.tp-c .op-foco-val,.tp-c .op-dot{display:none!important} /* sem valor e sem bolinha piscando (José, 11/11) */
.ce .tp-c .op-foco-item{min-width:0;padding:9px 16px 9px 10px}
/* D · ícones em cima, nome embaixo, sublinhado na aberta */
.tp-d .op-foco-lista{gap:4px;padding:8px 16px 0;align-items:flex-end}
.tp-d .op-foco-lista .fx-ctrl{align-self:center;padding-bottom:8px}
.ce .tp-d .op-foco-item{flex-direction:column;gap:5px;border:0;border-radius:0;background:transparent;padding:6px 14px 10px;box-shadow:none;transform:none;position:relative;border-bottom:3px solid transparent}
.ce .tp-d .op-foco-item:hover{background:transparent;transform:none;box-shadow:none}
.ce .tp-d .op-foco-item.on{border-bottom-color:var(--cor)}
.tp-d .op-foco-item>span:nth-child(2){flex:none!important;text-align:center}
.tp-d .op-foco-ico{width:40px;height:40px;font-size:16px;transition:transform .2s}
.ce .tp-d .op-foco-item:hover .op-foco-ico{transform:translateY(-2px)}
.ce .tp-d .op-foco-item.on .op-foco-ico{background:var(--cor)!important;color:#fff!important}
.tp-d .op-foco-nome{font-size:12.5px}.tp-d .op-foco-val{display:none!important}
.tp-d .op-dot{position:absolute;top:6px;right:12px;width:8px;height:8px;box-shadow:0 0 0 2px var(--portal-bg)}
/* seletor flutuante das opções (só para escolher) */
.tp-teste{position:fixed;right:18px;bottom:18px;z-index:50;display:flex;align-items:center;gap:4px;background:#0f172a;color:#fff;border-radius:14px;padding:6px;box-shadow:0 12px 30px -10px rgba(15,23,42,.6);font-size:13px}
.tp-teste span{padding:0 8px;color:#94a3b8}
.ce .tp-teste button{color:#cbd5e1;padding:6px 10px;border-radius:9px;cursor:pointer;font-size:13px}
.ce .tp-teste button.on{background:#fefefe;color:#0f172a}
@media (max-width:620px){.tp .op-foco-lista .fx-ctrl-mes{display:none}.tp-teste{left:12px;right:12px;bottom:12px;overflow-x:auto}}
.bt .bt-card.bt-fin{justify-content:flex-start}
.bt-fin-dest{margin-top:14px}
.bt-fin-dest small,.bt-fin-lista small{display:block;font-size:13px;font-weight:500;color:rgba(255,255,255,.9)}
.bt-fin-dest b{display:block;font-size:46px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.18)}
.bt-fin-dest span,.bt-fin-lista span{font-size:12.5px;color:rgba(255,255,255,.8)}
.bt-fin-lista{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:auto}
.bt-fin-lista>div{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:10px 14px}
.bt-fin-lista b{display:block;font-size:22px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin:2px 0}
@media (max-width:620px){.bt-fin-dest b{font-size:32px}.bt-fin-lista b{font-size:18px}}
@media (max-width:1100px){.bt-grade{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"fin fin" "com pos" "pec fro" "pat req"}.bt-g .bt-ve b{font-size:36px}}
@media (max-width:620px){.bt{padding:12px}.bt-grade{grid-template-columns:minmax(0,1fr);grid-template-areas:"fin" "com" "pos" "pec" "fro" "pat" "req";grid-auto-rows:auto}.bt .bt-card{min-height:190px}.bt-g .bt-ve b,.bt-ve b{font-size:26px}.bt-g .bt-curva{min-height:90px}}
`

const CSS_IBCS = `
/* padrão IBCS: cinza para o realizado, hachurado para o mês em andamento, verde/vermelho só na variação,
   unidade no cabeçalho, números alinhados à direita, mensagem em cima de cada gráfico */
.ib-msg{font-size:17px;line-height:1.45;color:var(--portal-text);margin-bottom:12px}
.ib-tab-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13.5px;color:#475569;margin-bottom:8px}
[data-theme="dark"] .ib-tab-cab{color:var(--portal-text-secondary)}
.ib-tab{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}
.ib-tab th{font-weight:500;text-align:right;padding:6px 10px;border-bottom:2px solid ${CINZA_AC};color:var(--portal-text);white-space:nowrap}
.ib-tab th:first-child{text-align:left}
.ib-tab td{text-align:right;padding:7px 10px;border-bottom:1px solid var(--portal-border);white-space:nowrap}
.ib-tab td:hover{background:var(--portal-bg-secondary)}
.ib-nome{text-align:left!important;color:var(--portal-text)}
.ib-tot td{font-weight:500;border-top:1px solid ${CINZA_AC};border-bottom:1px solid ${CINZA_AC}}
.ib-emp{background:color-mix(in srgb,var(--portal-text) 4%,transparent)}
.ib-sep{border-left:1px solid var(--portal-border);color:#64748b}
.ib-neg{color:#b91c1c}
.ib-delta{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;width:110px}
.ib-delta-barra{display:inline-block;height:10px;max-width:60px;animation:fxPonte .7s cubic-bezier(.22,1,.36,1) both}
.ib-multiplos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.ce .ib-mult{display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:12px;cursor:pointer}
.ce .ib-mult:hover{background:var(--portal-bg-secondary)}
.ib-mult-nome{font-size:14px;font-weight:500;text-align:left}
.ib-col{display:block;overflow:visible}
.ib-barra{animation:fxGv .7s cubic-bezier(.22,1,.36,1) both;transform-box:fill-box;transform-origin:center}
.ib-num{font-size:9.5px;fill:var(--portal-text)}.ib-num.ib-neg{fill:#b91c1c}
.ib-rot{font-size:9.5px;fill:#64748b}
.ib-leg{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#64748b}
.ib-leg i{display:inline-block;width:12px;height:10px}
.ib-leg-ac{background:${CINZA_AC}}.ib-leg-pa{border:1px solid ${CINZA_AC};background:repeating-linear-gradient(45deg,${CINZA_AC} 0 1.5px,#fff 1.5px 4px)}
.ib-cascata{display:flex;flex-direction:column;gap:3px}
.ce .ib-casc-linha{display:grid;grid-template-columns:minmax(150px,1fr) 2fr 70px;align-items:center;gap:10px;padding:5px 6px;border-radius:8px}
.ce .ib-casc-linha:not(:disabled){cursor:pointer}.ce .ib-casc-linha:not(:disabled):hover{background:var(--portal-bg-secondary)}
.ib-casc-nome{font-size:13.5px;text-align:left}
.ib-total .ib-casc-nome,.ib-total .ib-casc-val{font-weight:500}
.ib-casc-trilho{position:relative;height:16px}
.ib-zero{position:absolute;top:-4px;bottom:-4px;width:1px;background:${CINZA_AC}}
.ib-casc-barra{position:absolute;top:0;bottom:0;animation:fxPonte .7s cubic-bezier(.22,1,.36,1) both}
.ib-casc-val{text-align:right;font-size:13.5px;font-variant-numeric:tabular-nums}
.ib-sub{padding:16px 22px 0;font-size:13.5px;color:#64748b}
@media (max-width:1100px){.ib-multiplos{grid-template-columns:repeat(2,minmax(0,1fr))}.ib-tab{font-size:12.5px}.ib-tab th,.ib-tab td{padding:6px 6px}}
@media (max-width:768px){.ib .fx-bloco{overflow-x:auto}.ce .ib-casc-linha{grid-template-columns:110px 1fr 56px}}
`

const CSS_GERAL = `
.fx-geral{padding:18px 20px}
.fx-mapa{grid-auto-rows:minmax(220px,1fr)!important}
.fx-sala-sit{width:11px;height:11px;border-radius:50%;flex-shrink:0}
.fx-vermelho .fx-sala-sit{animation:opPisca 1.4s ease-in-out infinite}
.fx-sala-graf{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 0;color:var(--portal-text)}
.fx-g{width:100%;max-width:240px;height:auto;max-height:130px;overflow:visible}
.fx-g-barra-h{animation:fxGh .8s cubic-bezier(.22,1,.36,1) both;transform-box:fill-box;transform-origin:left}
.fx-g-barra-v{animation:fxGv .8s cubic-bezier(.22,1,.36,1) both;transform-box:fill-box;transform-origin:bottom}
.fx-g-ponto{animation:fxGp .5s cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center}
@keyframes fxGh{from{transform:scaleX(0)}}@keyframes fxGv{from{transform:scaleY(0)}}@keyframes fxGp{from{transform:scale(0)}}
.fx-g-num{font-size:13px;font-weight:500;fill:var(--portal-text)}
.fx-g-rot{font-size:11px;fill:var(--portal-text-secondary)}
.fx-sala-rodape{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.fx-sala-rodape .fx-sala-num{font-size:22px;margin:0}
.fx-sala-rot{font-size:13px;color:var(--portal-text-secondary)}
.fx-sala .ce-pizza-centro b{font-size:20px}
`

const CSS_NP = `
.ce,.ce *{text-transform:none!important}
.ce b,.ce strong,.ce [class*="-tit"],.ce [class*="-val"],.ce [class*="-nome"],.ce [class*="-num"],.ce-m-tit,.ce-m-val,.fx-grande,.fx-cab>b,.ce-tres b,.op-kpi b,
.ce-conta-forte,.ce-conta-forte b,.ce-perda-cab,.ce-perda-cab b,.fx-status,.op-tit,.ce-m-sec,.fx-geral-frase b,.ce-setor-cab,.ce-emp-linha>b,.ce-rot{font-weight:500!important}
.ce i.fas,.ce i[class*="fa-"]{font-weight:900!important}
.ce-m-sec,.ce-rot,.ce-perda-cab,.op-tit,.ce-leg-tit{letter-spacing:0!important;font-size:13.5px!important;color:#475569!important}
[data-theme="dark"] .ce-m-sec,[data-theme="dark"] .ce-rot,[data-theme="dark"] .ce-perda-cab,[data-theme="dark"] .op-tit{color:var(--portal-text-secondary)!important}
.ce [class*="-val"],.ce b,.fx-grande,.fx-cab>b,.ce-m-val{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ce-m-val,.fx-cab>b,.fx-grande{font-size:26px!important}
/* painel da direita: fundo cinza clarinho e tudo em cartão branco */
.op-foco-painel{background:var(--portal-bg)}
.fx-bloco,.ce-m-col,.fx-sala,.op-sem-bloco{background:var(--portal-bg-card)!important;border:1px solid var(--portal-border)!important;border-radius:16px!important;box-shadow:none}
.fx-bloco,.ce-m-col{transition:box-shadow .25s,transform .25s}
.ce .fx-sala:hover,.ce .ce-reg-click:hover,.ce .fx-desp:hover,.ce .fx-aging:hover,.ce .ce-tr-click:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55)!important}
.ce-reg,.ce .fx-desp,.ce .fx-aging,.ce-tr,.ce .ce-tres button,.ce .fx-idade{background:var(--portal-bg-card)!important;border:1px solid var(--portal-border)!important;border-radius:12px!important;transition:box-shadow .25s,transform .25s}
.ce-th{border:none!important;background:none!important}
.fx-sala::after{display:none}
.fx-sala-ico,.ce-setor-ico{width:40px!important;height:40px!important;border-radius:11px!important;display:grid!important;place-items:center;font-size:16px;flex-shrink:0;
  color:var(--cor)!important;background:color-mix(in srgb,var(--cor) 9%,var(--portal-bg-card))!important;border:1px solid color-mix(in srgb,var(--cor) 18%,transparent)}
.fx-status{font-size:12.5px!important}
.ce-modal{border:1px solid var(--portal-border)}
.ce-m-cab{border-bottom:1px solid var(--portal-border)}
.fx-aviso{border:1px solid #fde68a;font-weight:400}
.ce-explica{color:#0f172a}[data-theme="dark"] .ce-explica{color:var(--portal-text)}
`

const CSS_FIN = `
.fx-fin{display:flex;flex-direction:column;gap:12px}
.fx-aviso{padding:10px 14px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:13px;line-height:1.45}
.fx-fin-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.fx-bloco{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:16px;background:var(--portal-bg-secondary);min-width:0}
.fx-ponte{display:flex;flex-direction:column;gap:4px}
.ce .fx-ponte-linha{display:grid;grid-template-columns:150px 1fr 90px;align-items:center;gap:10px;padding:6px 6px;border-radius:10px;cursor:pointer}
.ce .fx-ponte-linha:hover{background:var(--portal-bg-card)}
.fx-ponte-nome{font-size:13.5px;font-weight:700;line-height:1.2}.fx-ponte-nome small{display:block;font-size:11.5px;font-weight:500;color:var(--portal-text-secondary)}
.fx-ponte-eixo{position:relative;height:18px}
.fx-ponte-eixo::before{content:"";position:absolute;left:50%;top:-6px;bottom:-6px;width:1px;background:var(--portal-text-secondary);opacity:.35}
.fx-ponte-barra{position:absolute;top:0;bottom:0;border-radius:5px;animation:fxPonte .8s cubic-bezier(.22,1,.36,1) both}
@keyframes fxPonte{from{width:0!important}}
.fx-ponte-linha b{text-align:right;font-size:14px}
.ce .fx-ponte-total{border-top:1px solid var(--portal-border);border-radius:0 0 10px 10px;margin-top:2px;padding-top:9px}
.fx-ponte-total .fx-ponte-nome{font-size:14.5px}
.fx-ponte-leg{display:flex;justify-content:space-between;font-size:11px;color:var(--portal-text-secondary);padding:0 96px 0 166px}
.ce .fx-desp{display:grid;grid-template-columns:minmax(120px,1.1fr) 1fr 90px 70px;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;background:var(--portal-bg-card);cursor:pointer;width:100%}
.ce .fx-desp:hover{box-shadow:0 4px 12px rgba(0,0,0,.06)}
.fx-desp-nome{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-desp b{text-align:right;font-size:13.5px}
.fx-linhazinha{display:block;overflow:visible}
.fx-linhazinha polyline{stroke-dasharray:300;stroke-dashoffset:300;animation:fxLinha 1.2s ease forwards}
@keyframes fxLinha{to{stroke-dashoffset:0}}
.ce .fx-aging{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:12px;background:var(--portal-bg-card);cursor:pointer;width:100%}
.ce .fx-aging:hover{box-shadow:0 4px 12px rgba(0,0,0,.06)}
.fx-aging-topo{display:flex;align-items:baseline;gap:10px}.fx-aging-topo span{flex:1;font-size:13.5px;font-weight:700}.fx-aging-topo b{font-size:18px}.fx-aging-topo small{font-size:12px;color:var(--portal-text-secondary)}
.fx-aging-barra{display:flex;height:14px;border-radius:99px;overflow:hidden;gap:2px}
.fx-aging-barra span{animation:opCresce .9s cubic-bezier(.22,1,.36,1) both}
.fx-aging-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--portal-text-secondary)}
.fx-aging-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}.fx-aging-leg b{color:var(--portal-text)}
.fx-fluxo{display:flex;flex-direction:column;gap:8px}
.fx-fluxo-cols{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.fx-fluxo-col{display:flex;flex-direction:column;align-items:center;gap:3px}
.fx-fluxo-barras{height:120px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:4px}
.fx-fluxo-barras span{width:32%;border-radius:5px 5px 0 0;animation:opBarra .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.fx-fluxo-col small{font-size:11.5px;color:var(--portal-text-secondary)}.fx-fluxo-col b{font-size:13px}
.fx-fluxo-linha{position:absolute;left:0;right:0;top:0;height:120px;width:100%;pointer-events:none;overflow:visible}
.fx-fluxo-linha polyline{fill:none;stroke:#0f172a;stroke-width:2.5;vector-effect:non-scaling-stroke;stroke-dasharray:400;stroke-dashoffset:400;animation:fxLinha 1.4s .3s ease forwards}
[data-theme="dark"] .fx-fluxo-linha polyline{stroke:#e2e8f0}
.fx-zero{stroke:var(--portal-text-secondary);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke;opacity:.4}
.fx-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--portal-text-secondary)}
.fx-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.fx-leg-linha{width:16px!important;height:3px!important;background:#0f172a;border-radius:2px;vertical-align:2px!important}
@media (max-width:1280px){.fx-fin-grade{grid-template-columns:1fr}}
@media (max-width:768px){.ce .fx-ponte-linha{grid-template-columns:110px 1fr 74px}.fx-ponte-leg{padding:0 80px 0 120px}.ce .fx-desp{grid-template-columns:1fr 70px;}.ce .fx-desp .fx-trilho,.ce .fx-desp svg{display:none}}
`

const CSS_FOCO = `
.fx-ctrl{display:flex;align-items:center;gap:8px;padding:0 2px 6px;border-bottom:1px solid var(--portal-border);margin-bottom:4px}
.fx-ctrl-mes{flex:1;font-size:13px;font-weight:700;color:var(--portal-text-secondary);text-align:center}
.op-letra{font-size:14px;font-weight:800;line-height:1}
.fx-pad{padding:18px 22px}
.fx-grande{font-size:22px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.fx-sub{font-size:13.5px;color:var(--portal-text-secondary);margin-top:4px}
.fx-duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.fx-tres{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.fx-barras{display:flex;flex-direction:column;gap:6px}
.fx-barra{display:grid;grid-template-columns:minmax(90px,1fr) 1.2fr 40px;gap:10px;align-items:center;font-size:13px}
.fx-barra b{text-align:right}
.fx-trilho{height:8px;border-radius:99px;background:var(--portal-bg-secondary);overflow:hidden}
.fx-trilho>span{display:block;height:100%;border-radius:99px;animation:opCresce .8s cubic-bezier(.22,1,.36,1) both}
.fx-idades{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ce .fx-idade{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px;border-radius:12px;background:var(--portal-bg-secondary);cursor:pointer;text-align:center}
.ce .fx-idade:hover{box-shadow:0 6px 16px rgba(0,0,0,.08)}
.fx-idade-barra{height:90px;width:36px;display:flex;align-items:flex-end;border-radius:8px;background:var(--portal-bg-card);overflow:hidden;margin-bottom:6px}
.fx-idade-barra>span{display:block;width:100%;border-radius:8px 8px 0 0;animation:opBarra .8s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom}
.fx-idade b{font-size:18px}.fx-idade small{font-size:12px;color:var(--portal-text-secondary)}
/* visão geral: o "mapa" das áreas (moderno, no lugar dos cômodos e canos da Planta Viva) */
.fx-geral{padding:20px 22px;display:flex;flex-direction:column;gap:16px;min-height:100%}
.fx-geral-frase{font-size:20px;line-height:1.35}
.fx-geral-sub{font-size:13px;color:var(--portal-text-secondary);margin-top:2px}
.fx-mapa{flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(130px,1fr);gap:12px}
.fx-mapa>.fx-sala:first-child{grid-column:span 2}
.ce .fx-sala{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border);background:var(--portal-bg-card);cursor:pointer;text-align:left;
  animation:fxEntra .45s cubic-bezier(.22,1,.36,1) both;transition:transform .18s,box-shadow .18s}
.ce .fx-sala:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,.09)}
@keyframes fxEntra{from{opacity:0;transform:translateY(10px) scale(.98)}}
.fx-sala::after{content:"";position:absolute;inset:auto -30% -60% auto;width:160px;height:160px;border-radius:50%;background:var(--cor);opacity:.07;pointer-events:none}
.fx-sala-topo{display:flex;align-items:center;gap:9px}
.fx-sala-ico{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.fx-mini{display:block;overflow:visible}
.fx-mini circle,.fx-mini rect{animation:fxMini .7s cubic-bezier(.22,1,.36,1) both}
@keyframes fxMini{from{opacity:0;transform:scale(.6);transform-origin:center}}
.fx-cab{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin-bottom:4px}
.fx-cab>b{font-size:24px;font-weight:800;letter-spacing:-.5px}
.fx-cab>span{font-size:13.5px;color:var(--portal-text-secondary);display:inline-flex;align-items:center}
.fx-sala-nome{flex:1;font-size:15px;font-weight:800}
.fx-status{font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:99px}
.fx-st-verde{background:#dcfce7;color:#15803d}.fx-st-amarelo{background:#fef3c7;color:#b45309}.fx-st-vermelho{background:#fee2e2;color:#b91c1c}
.fx-sala-num{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-top:auto}
.fx-sala-frase{font-size:13px;color:var(--portal-text-secondary);line-height:1.4}
.fx-pulso{position:absolute;top:16px;right:16px;width:0;height:0}
.fx-vermelho .fx-pulso{width:10px;height:10px;border-radius:50%;background:#dc2626;top:10px;right:10px;animation:opPisca 1.4s ease-in-out infinite}
@media (max-width:1100px){.fx-mapa{grid-template-columns:repeat(2,1fr)}.fx-idades{grid-template-columns:repeat(2,1fr)}}
`

const CSS_OPCOES = `
.ce-teste{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:6px;padding:8px;border-radius:14px;border:1px solid #f59e0b;background:var(--portal-bg-card);box-shadow:0 10px 30px rgba(0,0,0,.18)}
.ce-teste span{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#b45309;margin:0 4px}
.ce .ce-teste button{padding:6px 12px;border-radius:9px;border:1px solid var(--portal-border);font-size:13px;font-weight:700;cursor:pointer;background:var(--portal-bg-card)}
.ce .ce-teste button.on{border:1.5px solid #dc2626;color:#dc2626;background:#dc26260d}
.op{display:flex;flex-direction:column;gap:14px;min-width:0}
.op-sec{display:flex;flex-direction:column;gap:4px}
.op-tit{display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--portal-text-secondary);margin-bottom:4px}
.ce .op-patio{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:12px;background:var(--portal-bg-secondary);cursor:pointer}
.op-grande{font-size:17px;font-weight:800}
.op-barra{display:flex;height:12px;border-radius:99px;overflow:hidden;gap:2px}
.op-barra span{animation:opCresce .9s cubic-bezier(.22,1,.36,1) both}
@keyframes opCresce{from{transform:scaleX(0);transform-origin:left}}
.op-faixas{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--portal-text-secondary)}
.op-faixas i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}
.op-faixas b{color:var(--portal-text)}
.ce .op-linha{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;font-size:13.5px;cursor:pointer}
.ce button.op-linha:hover{background:var(--portal-bg-secondary)}
div.op-linha{cursor:default}
.op-linha>span:nth-child(2){flex:1;min-width:0}
.op-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.op-pisca{animation:opPisca 1.4s ease-in-out infinite}@keyframes opPisca{50%{opacity:.3;transform:scale(1.35)}}
.op-kpis{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid var(--portal-border);flex-shrink:0}
.ce .op-kpi{display:flex;flex-direction:column;gap:2px;padding:12px 18px;border-right:1px solid var(--portal-border);cursor:pointer;transition:background .15s}
.ce .op-kpi:last-child{border-right:none}.ce .op-kpi:hover{background:var(--portal-bg-secondary)}
.op-kpi small{font-size:12px;font-weight:700;color:var(--portal-text-secondary)}
.op-kpi b{font-size:21px;font-weight:800;letter-spacing:-.3px}
.op-kpi span{font-size:12px;color:var(--portal-text-secondary)}
.op-exec{overflow-y:auto}
.op-exec-meio{padding:12px 22px;border-bottom:1px solid var(--portal-border);flex-shrink:0}
.op-cascata{display:flex;align-items:stretch;gap:10px;height:150px}
.ce .op-casc-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;cursor:pointer;border-radius:10px;padding:4px}
.ce .op-casc-col:hover{background:var(--portal-bg-secondary)}
.op-casc-area{position:relative;flex:1;width:100%;max-width:90px}
.op-casc-zero{position:absolute;left:-6px;right:-6px;height:1px;background:var(--portal-border)}
.op-casc-barra{position:absolute;left:0;right:0;border-radius:5px;animation:opBarra .7s cubic-bezier(.22,1,.36,1) both}
@keyframes opBarra{from{transform:scaleY(0)}}
.op-casc-col b{font-size:14px;font-weight:800}
.op-casc-col small{font-size:11.5px;color:var(--portal-text-secondary);text-align:center;line-height:1.2}
.op-exec-baixo{display:grid;grid-template-columns:3fr 1fr;min-height:0}
.op-exec-baixo>.ce-setores{border-right:1px solid var(--portal-border)}
.op-exec-baixo>.op{padding:14px 18px}
.op-foco{flex-direction:row}
/* lateral no estilo POS NewPortal (José, 11/11: "deixa a lateral esquerda o estilo new portal por enquanto") */
.op-foco-lista{width:290px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;padding:14px;border-right:1px solid var(--portal-border);background:var(--portal-bg-secondary);overflow-y:auto}
.ce .op-foco-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--portal-border);background:var(--portal-bg-card);cursor:pointer;
  transition:box-shadow .25s,transform .25s,border-color .25s,background .25s}
.ce .op-foco-item:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--cor) 35%,var(--portal-border))}
.ce .op-foco-item.on{border-color:color-mix(in srgb,var(--cor) 45%,var(--portal-border));background:color-mix(in srgb,var(--cor) 6%,var(--portal-bg-card));box-shadow:0 14px 28px -22px rgba(15,23,42,.5)}
.op-foco-ico{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex-shrink:0;font-size:16px;
  color:var(--cor);background:color-mix(in srgb,var(--cor) 9%,var(--portal-bg-card));border:1px solid color-mix(in srgb,var(--cor) 18%,transparent)}
.op-foco-ico i{font-weight:900}
.op-foco-nome{display:block;font-size:15px;font-weight:500;color:var(--portal-text)}
.op-foco-val{display:block;font-size:13.5px;font-weight:400;color:var(--portal-text-secondary);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.fx-ctrl-mes{font-weight:500!important}
.op-foco-painel{flex:1;min-width:0;display:flex;flex-direction:column;overflow-y:auto;animation:ceFade .25s}
.op-sem{overflow-y:auto;padding:14px 18px;gap:14px}
.op-sem-grupo{display:flex;gap:14px;align-items:stretch}
.op-sem-nome{width:110px;flex-shrink:0;font-size:14px;font-weight:800;padding-top:10px}
.op-sem-blocos{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.ce .op-sem-bloco{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:12px;cursor:pointer;transition:transform .15s,box-shadow .15s;min-height:72px}
.ce .op-sem-bloco.g{grid-column:span 2}
.ce .op-sem-bloco:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.08)}
.op-sem-bloco small{font-size:12.5px;font-weight:600;color:#334155}
.op-sem-bloco b{font-size:20px;font-weight:800;letter-spacing:-.3px}
.op-alerta{animation:opAlerta 2.4s ease-in-out infinite}@keyframes opAlerta{50%{box-shadow:0 0 0 4px rgba(220,38,38,.15)}}
[data-theme="dark"] .op-sem-bloco small{color:#e2e8f0}
@media (max-width:1100px){.op-kpis{grid-template-columns:repeat(2,1fr)}.op-exec-baixo{grid-template-columns:1fr}.op-foco{flex-direction:column}.op-foco-lista{width:auto;flex-direction:row;overflow-x:auto}.op-sem-grupo{flex-direction:column;gap:6px}}
`

const CSS = `
.ce{display:flex;flex-direction:column;background:var(--portal-bg);color:var(--portal-text);overflow:hidden}
.ce *{box-sizing:border-box}.ce button{font-family:inherit;color:inherit;background:none;border:none;padding:0;text-align:left}
.ce-topo{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 24px 10px;flex-shrink:0}
.ce-titulo{font-size:22px;font-weight:800;letter-spacing:-.4px}
.ce-sub{font-size:13px;color:var(--portal-text-secondary)}
.ce .ce-ico{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);cursor:pointer;color:var(--portal-text);flex-shrink:0}
.ce .ce-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text-secondary);font-size:13px;font-weight:600;cursor:pointer}
.ce-gira{animation:ceGira 1s linear infinite}@keyframes ceGira{to{transform:rotate(360deg)}}
.ce-painel{flex:1;min-height:0;display:flex;flex-direction:column;margin:0 24px 18px;border-radius:18px;background:var(--portal-bg-card);border:1px solid var(--portal-border);overflow:hidden}
.ce-empresa{display:flex;align-items:center;gap:20px;padding:10px 22px;border-bottom:1px solid var(--portal-border);flex-shrink:0}
.ce-emp-texto{display:flex;flex-direction:column;gap:6px;min-width:0}
.ce-rot{font-size:12px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--portal-text-secondary)}
.ce-emp-linha{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;font-size:18px}
.ce-emp-linha>b{font-size:22px;font-weight:800}
.ce .ce-leg{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:var(--portal-text-secondary);cursor:pointer}
.ce .ce-leg:hover{color:var(--portal-text)}
.ce-leg i{width:10px;height:10px;border-radius:3px;display:inline-block}
.ce .ce-emp-res{display:inline-flex;align-items:center;gap:4px;font-size:14px;color:var(--portal-text-secondary);cursor:pointer}
.ce .ce-emp-res:hover{color:var(--portal-text)}
/* 3 colunas iguais, tudo cabe sem rolar (sem cortar, sem barra de rolagem dentro) */
.ce-setores{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.ce-setor{display:flex;flex-direction:column;gap:12px;padding:14px 20px;border-right:1px solid var(--portal-border);min-height:0;min-width:0}
.ce-setor:last-child{border-right:none}
.ce-setor-nome{flex:1;min-width:0}
.ce-selo{font-size:12.5px;font-weight:800;padding:4px 10px;border-radius:99px;white-space:nowrap}
[data-theme="dark"] .ce-selo{background:var(--portal-bg-secondary)!important}
.ce-leg-tit{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--portal-text-secondary);margin:0 0 2px 6px}
.ce .ce-legenda button em{font-style:normal;font-size:12.5px;color:var(--portal-text-secondary);white-space:nowrap}
.ce .ce-legenda button b{min-width:38px;text-align:right}
.ce .ce-tres button{padding:7px 10px}
.ce-tres b{font-size:17px}
.ce-perda{border-top:1px solid var(--portal-border);padding-top:10px}
.ce-perda-txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce .ce-ver{font-size:12.5px;font-weight:700;color:var(--portal-text-secondary);cursor:pointer;padding:2px 6px}
.ce .ce-ver:hover{color:var(--portal-text)}
.ce .ce-fpa{display:block;margin-top:auto;padding-top:8px;border-top:1px solid var(--portal-border);font-size:12.5px;line-height:1.5}
.ce .ce-setor-cab{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:800;cursor:pointer}
.ce-setor-ico{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--cor);color:#fff}
.ce-tres{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ce .ce-tres button{display:flex;flex-direction:column;gap:1px;padding:8px 10px;border-radius:12px;background:var(--portal-bg-secondary);cursor:pointer;transition:filter .15s}
.ce .ce-tres button:hover{filter:brightness(.97)}
.ce-tres small{font-size:11.5px;color:var(--portal-text-secondary);font-weight:600}
.ce-tres b{font-size:18px;font-weight:800;letter-spacing:-.3px}
.ce-meio{display:flex;align-items:center;gap:16px}
.ce-pizza{position:relative;flex-shrink:0}
.ce-fatia{transition:stroke-width .15s}.ce-fatia:hover{stroke-width:19}
.ce-pizza-centro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center;line-height:1.15}
.ce-pizza-centro small{font-size:10.5px;color:var(--portal-text-secondary)}.ce-pizza-centro b{font-size:16px;font-weight:800}
.ce-legenda{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ce .ce-legenda button{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:8px;font-size:13.5px;cursor:pointer}
.ce .ce-legenda button:hover{background:var(--portal-bg-secondary)}
.ce-legenda i{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.ce-legenda span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce-legenda b{font-weight:700}
.ce-perda{display:flex;flex-direction:column;gap:2px;padding-top:10px;border-top:1px solid var(--portal-border)}
.ce-perda-cab{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#b91c1c;margin-bottom:2px}
.ce-perda-cab b{font-size:15px;letter-spacing:0}
.ce .ce-perda-item{display:flex;align-items:center;gap:9px;padding:7px 6px;border-radius:8px;font-size:13.5px;cursor:pointer}
.ce .ce-perda-item:hover{background:var(--portal-bg-secondary)}
.ce-perda-item small{display:block;font-size:12px;color:var(--portal-text-secondary)}
.ce-dot{width:8px;height:8px;border-radius:50%;background:#dc2626;flex-shrink:0}
.ce .ce-fpa{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--portal-text-secondary);padding-top:8px;border-top:1px solid var(--portal-border);cursor:pointer;margin-top:auto}
.ce-fpa b{color:var(--portal-text)}
.ce .ce-oque{display:inline-flex;align-items:center;gap:4px;margin-left:6px;color:var(--portal-text-secondary);font-size:12.5px;font-weight:600;cursor:pointer;vertical-align:middle;text-transform:none;letter-spacing:0}
.ce .ce-oque:hover{color:#2563eb}
.ce-mudo{font-size:13.5px;color:var(--portal-text-secondary)}
.ce-fundo{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:ceFade .15s}
@keyframes ceFade{from{opacity:0}}
.ce-modal{width:min(820px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:20px;background:var(--portal-bg-card);box-shadow:0 30px 80px rgba(0,0,0,.3);animation:ceSobe .2s cubic-bezier(.22,1,.36,1)}
@keyframes ceSobe{from{opacity:0;transform:translateY(10px)}}
.ce-m-barra{display:flex;align-items:center;gap:10px;padding:12px 14px 0}
.ce-trilha{flex:1;min-width:0;font-size:12.5px;color:var(--portal-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce-trilha span:last-child{color:var(--portal-text);font-weight:700}
.ce-m-cab{padding:8px 22px 12px;border-bottom:1px solid var(--portal-border)}
.ce-m-tit{display:flex;align-items:center;flex-wrap:wrap;font-size:18px;font-weight:800}
.ce-m-val{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-top:2px}
.ce-m-sub{font-size:13px;color:var(--portal-text-secondary);margin-top:2px}
.ce-m-corpo{flex:1;min-height:0;overflow-y:auto;padding:16px 22px 22px}
.ce-m-dois{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.ce-m-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.ce-m-col{display:flex;flex-direction:column;gap:1px;padding:10px 12px;border-radius:14px;background:var(--portal-bg-secondary)}
.ce-m-sec{display:flex;align-items:center;font-size:11.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--portal-text-secondary);margin-bottom:6px}
.ce-m-nota{font-size:13px;color:var(--portal-text-secondary);margin-top:6px}
.ce-explica{font-size:16px;line-height:1.6;margin:0}
.ce-conta{display:flex;align-items:center;gap:8px;padding:7px 4px;font-size:14.5px;color:var(--portal-text-secondary);border-radius:8px}
.ce-conta>span{flex:1}.ce-conta b{color:var(--portal-text)}
.ce-conta-click{cursor:pointer}.ce-conta-click:hover{background:var(--portal-bg-card)}
.ce-conta-forte{border-top:1px solid var(--portal-border);margin-top:4px;padding-top:9px;font-weight:800;color:var(--portal-text)}.ce-conta-forte b{font-size:16px}
.ce-lista{display:flex;flex-direction:column;gap:6px}
.ce-reg{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:10px 12px;border-radius:11px;background:var(--portal-bg-secondary);width:100%}
.ce .ce-reg-click{cursor:pointer;border:1px solid transparent}.ce .ce-reg-click:hover{border-color:var(--portal-border);background:var(--portal-bg-card)}
.ce-reg-tit{font-size:13.5px;font-weight:700}.ce-reg-val{font-size:13.5px;font-weight:800;text-align:right}.ce-reg-sub{grid-column:1/-1;font-size:12px;color:var(--portal-text-secondary)}
.ce-tab{display:flex;flex-direction:column;gap:4px}
.ce-tr{display:grid;grid-template-columns:2fr 50px 1fr 1fr 70px;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;background:var(--portal-bg-secondary);font-size:13.5px;width:100%}
.ce-tr>span:not(:first-child){text-align:right}
.ce .ce-tr-click{cursor:pointer;border:1px solid transparent}.ce .ce-tr-click:hover{border-color:var(--portal-border);background:var(--portal-bg-card)}
.ce-th{background:none;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--portal-text-secondary)}
.ce-mini{display:block;height:4px;border-radius:99px;background:var(--portal-border);margin-top:5px}.ce-mini>span{display:block;height:100%;border-radius:99px}
@media (max-width:1280px){.ce-meio{flex-direction:column;align-items:stretch}.ce-meio .ce-pizza{align-self:center}}
@media (max-width:1100px){.ce{height:auto!important;overflow:visible}.ce-setores{grid-template-columns:1fr}.ce-setor{border-right:none;border-bottom:1px solid var(--portal-border)}.ce-meio{flex-direction:row}}
@media (max-width:768px){.ce-topo{padding:12px}.ce-painel{margin:0 10px 14px}.ce-empresa{flex-direction:column;align-items:flex-start}.ce-setor{padding:14px}.ce-tr{grid-template-columns:1.6fr 40px 1fr}.ce-tr>span:nth-child(4),.ce-tr>span:nth-child(5){display:none}}
`
