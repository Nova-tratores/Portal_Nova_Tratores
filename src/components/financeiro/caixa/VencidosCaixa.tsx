'use client'
// Vencidos da aba Caixa: interface nova (estilo NewPortal) sobre a MESMA rota do DRE Financeiro,
// GET /api/dre-financeiro/vencidos — totais, faixas de atraso, títulos e ranking vêm prontos de lá.
// Nada de conta aqui além de filtrar, ordenar e somar o que a busca mostra.
import { useCallback, useEffect, useMemo, useState } from 'react'
import ContasCliente, { type ClienteAberto } from './ContasCliente'
import { useEmpresaFinanceiro } from '../empresaFinanceiro'
import { COR, Documento, ESTILO_CAIXA, SegTipo, Seta, brl, contas, dataBR, empresa, nomeDe, pegarDre, sem, semZeros, type Tipo } from './comum'

type Faixa = '1-30' | '31-60' | '61-90' | '90+'

interface Titulo {
  tipo: 'pagar' | 'receber'
  codigo_lancamento: number
  conta_omie: string
  nome: string | null
  codigo_contraparte: number | null
  numero_documento: string | null
  numero_documento_fiscal: string | null
  numero_parcela: string | null
  descricao_categoria: string | null
  data_vencimento: string
  valor_documento: number
  valor_pago: number
  valor_aberto: number
  parcial: boolean
  dias_atraso: number
  faixa: Faixa
  documento: string | null       // CPF/CNPJ formatado
  documento_norm: string | null  // só os dígitos: junta o cliente da Nova com o da Castro
  telefone: string | null
}
interface FaixaResumo { faixa: Faixa; total: number; count: number }
interface Resposta {
  kpis: { total: number; count: number; totalPagar: number; totalReceber: number; maiorAtraso: number }
  faixas: FaixaResumo[]
  titulos: Titulo[]
}
type Coluna = 'nome' | 'venc' | 'atraso' | 'valor'

const FAIXAS: Array<{ id: Faixa; nome: string; cor: string }> = [
  { id: '1-30', nome: '1 a 30 dias', cor: '#d97706' },
  { id: '31-60', nome: '31 a 60 dias', cor: '#ea580c' },
  { id: '61-90', nome: '61 a 90 dias', cor: '#dc2626' },
  { id: '90+', nome: 'Mais de 90 dias', cor: '#9f1239' },
]
const COR_FAIXA = Object.fromEntries(FAIXAS.map((f) => [f.id, f.cor])) as Record<Faixa, string>
const POR_VEZ = 60
const quem = (tipo: Tipo) => (tipo === 'receber' ? 'cliente' : tipo === 'pagar' ? 'fornecedor' : 'cliente ou fornecedor')

// Juros de atraso para cobrar do cliente (José, 05/11/2026): taxa ao mês dividida pelos dias em atraso,
// juros simples — 6% a.m. = 0,2% por dia (mês de 30 dias). Só nas contas a receber.
const juros = (t: Titulo, taxaMes: number) => (t.tipo === 'receber' ? t.valor_aberto * (taxaMes / 100) * (t.dias_atraso / 30) : 0)
const lerTaxa = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }
const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

interface Grupo { chave: string; tipo: 'pagar' | 'receber'; nome: string; documento: string | null; telefone: string | null; empresas: Set<string>; total: number; juros: number; maxAtraso: number; titulos: Titulo[] }

/** Texto pronto para mandar ao cliente (WhatsApp/e-mail): cada conta com atraso e juros, e o total. */
function textoCobranca(g: Grupo, taxaMes: number) {
  const linhas = [...g.titulos].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).map((t) => {
    const j = juros(t, taxaMes)
    const doc = t.numero_documento_fiscal ? `NF ${semZeros(t.numero_documento_fiscal)}` : t.numero_documento || 'Documento'
    const parc = t.numero_parcela && t.numero_parcela !== '001/001' ? ` parc. ${t.numero_parcela}` : ''
    return `• ${doc}${parc} — venceu ${dataBR(t.data_vencimento)} (${t.dias_atraso} ${t.dias_atraso === 1 ? 'dia' : 'dias'}): ${brl(t.valor_aberto)} + juros ${brl(j)} = ${brl(t.valor_aberto + j)}`
  })
  return [
    `${g.nome}${g.documento ? ` — ${g.documento}` : ''}`,
    '',
    ...linhas,
    '',
    `Total em aberto: ${brl(g.total)}`,
    `Juros (${pct(taxaMes)}% ao mês, proporcional aos dias): ${brl(g.juros)}`,
    `Total atualizado em ${dataBR(new Date(Date.now() - 3 * 3600e3).toISOString())}: ${brl(g.total + g.juros)}`,
  ].join('\n')
}

function Atraso({ t }: { t: Titulo }) {
  return <span className="cx-pilula" style={{ color: COR_FAIXA[t.faixa] }}>{t.dias_atraso} {t.dias_atraso === 1 ? 'dia' : 'dias'}</span>
}

function Valor({ t }: { t: Titulo }) {
  return (
    <span style={{ fontWeight: 500 }}>
      {brl(t.valor_aberto)}
      {t.parcial && <small className="cx-apagado" style={{ display: 'block', fontWeight: 400 }}>pago {brl(t.valor_pago)} de {brl(t.valor_documento)}</small>}
    </span>
  )
}

function ComJuros({ t, taxa }: { t: Titulo; taxa: number }) {
  if (t.tipo !== 'receber') return <span className="cx-apagado">—</span>
  const j = juros(t, taxa)
  return (
    <span style={{ fontWeight: 500 }}>
      {brl(t.valor_aberto + j)}
      <small className="cx-apagado" style={{ display: 'block', fontWeight: 400 }}>+ {brl(j)} de juros</small>
    </span>
  )
}

export default function VencidosCaixa() {
  const [tipo, setTipo] = useState<Tipo>('receber')
  // a empresa vem do topo do Financeiro (06/11/2026: sem 'Todas')
  const [conta] = useEmpresaFinanceiro()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [faixa, setFaixa] = useState<Faixa | null>(null)
  // abre por cliente: é onde aparece tudo o que cada um deve, com os juros
  const [visao, setVisao] = useState<'lista' | 'terceiro'>('terceiro')
  const [taxaTxt, setTaxaTxt] = useState('6')
  const taxa = lerTaxa(taxaTxt)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean }>({ col: 'atraso', desc: true })
  const [limite, setLimite] = useState(POR_VEZ)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try { setDados(await pegarDre<Resposta>(`/api/dre-financeiro/vencidos?conta=${conta}&tipo=${tipo}`)) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar') }
    finally { setCarregando(false) }
  }, [conta, tipo])
  useEffect(() => { carregar() }, [carregar])

  const termo = sem(busca.trim())
  // faixa + busca valem para a lista e para o ranking
  // a busca acha também pelo CPF/CNPJ, com ou sem pontos
  const termoDig = busca.replace(/\D/g, '')
  const filtrados = useMemo(() => (dados?.titulos || []).filter((t) => (!faixa || t.faixa === faixa) && (!termo
    || sem(`${nomeDe(t.nome)} ${semZeros(t.numero_documento_fiscal || '')} ${t.numero_documento || ''} ${t.descricao_categoria || ''} ${t.documento || ''}`).includes(termo)
    || (termoDig.length >= 4 && !!t.documento_norm?.includes(termoDig)))), [dados, faixa, termo, termoDig])

  const lista = useMemo(() => {
    const v = (t: Titulo) => (ordem.col === 'nome' ? sem(nomeDe(t.nome)) : ordem.col === 'venc' ? t.data_vencimento : ordem.col === 'atraso' ? t.dias_atraso : t.valor_aberto)
    return [...filtrados].sort((a, b) => { const x = v(a), y = v(b); const c = x < y ? -1 : x > y ? 1 : b.valor_aberto - a.valor_aberto; return ordem.desc ? -c : c })
  }, [filtrados, ordem])

  // por cliente/fornecedor, montado do que está filtrado (a rota manda o geral; aqui respeita faixa e busca).
  // Junta pelo CPF/CNPJ: o mesmo cliente na Nova e na Castro vira uma linha só; sem documento, pelo código do Omie.
  const terceiros = useMemo(() => {
    const m = new Map<string, Grupo>()
    for (const t of filtrados) {
      const chave = `${t.tipo}|${t.documento_norm ? `doc:${t.documento_norm}` : t.codigo_contraparte ?? `nome:${t.nome || 'sem'}`}`
      const g = m.get(chave) || { chave, tipo: t.tipo, nome: nomeDe(t.nome), documento: t.documento, telefone: t.telefone, empresas: new Set<string>(), total: 0, juros: 0, maxAtraso: 0, titulos: [] }
      g.total += t.valor_aberto; g.juros += juros(t, taxa); g.maxAtraso = Math.max(g.maxAtraso, t.dias_atraso); g.titulos.push(t)
      g.empresas.add(empresa(t.conta_omie)); g.telefone ||= t.telefone
      m.set(chave, g)
    }
    return [...m.values()].sort((a, b) => b.total + b.juros - (a.total + a.juros))
  }, [filtrados, taxa])

  const somaFiltrada = filtrados.reduce((a, t) => a + t.valor_aberto, 0)
  const jurosTotal = (dados?.titulos || []).reduce((a, t) => a + juros(t, taxa), 0)
  const comJuros = tipo !== 'pagar'
  // clique no cliente: janela com TODAS as contas em aberto dele e a baixa no Omie
  const [cliente, setCliente] = useState<ClienteAberto | null>(null)
  const abrirCliente = (g: Grupo) => {
    setAberto(g.chave)
    setCliente({ nome: g.nome, documento: g.documento, telefone: g.telefone, tipo: g.tipo, codigos: [...new Set(g.titulos.map((t) => Number(t.codigo_contraparte)).filter(Boolean))] })
  }
  const copiar = async (g: Grupo) => {
    try { await navigator.clipboard.writeText(textoCobranca(g, taxa)); setCopiado(g.chave); setTimeout(() => setCopiado((c) => (c === g.chave ? null : c)), 2500) }
    catch { alert('Não deu para copiar. Tente de novo.') }
  }
  const maiorFaixa = Math.max(1, ...(dados?.faixas || []).map((f) => f.total))
  const maiorTerceiro = Math.max(1, ...terceiros.map((g) => g.total))
  const k = dados?.kpis
  const ano = new Date().getFullYear()
  const rotuloQuem = tipo === 'receber' ? 'Cliente' : tipo === 'pagar' ? 'Fornecedor' : 'Cliente ou fornecedor'

  const ordenar = (col: Coluna) => { setOrdem((o) => ({ col, desc: o.col === col ? !o.desc : col !== 'nome' })); setLimite(POR_VEZ) }
  const cab = (col: Coluna, rotulo: string, direita = false) => (
    <th aria-sort={ordem.col === col ? (ordem.desc ? 'descending' : 'ascending') : 'none'} style={direita ? { textAlign: 'right' } : undefined}>
      <button type="button" className="cx-ord" onClick={() => ordenar(col)}>{rotulo}{ordem.col === col && <i className={`fa-solid fa-arrow-${ordem.desc ? 'down' : 'up'}`} />}</button>
    </th>
  )
  const recomeca = () => { setAberto(null); setLimite(POR_VEZ) }
  // trocou a empresa no topo: fecha o cliente aberto e volta ao começo da lista
  const [contaVista, setContaVista] = useState(conta)
  if (contaVista !== conta) { setContaVista(conta); recomeca() }

  return (
    <div className="cx">
      <style>{ESTILO_CAIXA + ESTILO_VENCIDOS}</style>
      <section className="cx-card cx-topo">
        <SegTipo valor={tipo} onMudar={(t) => { setTipo(t); recomeca() }} />
        <div className="cx-grupo">
          {carregando && <i className="fa-solid fa-circle-notch fa-spin cx-apagado" />}
        </div>
      </section>

      {erro && <div className="cx-card cx-erro">{erro} <button type="button" className="cx-link" onClick={carregar}>Tentar de novo</button></div>}
      {!dados && !erro && <div className="cx-card cx-vazio">Carregando os vencidos…</div>}

      {dados && k && (
        <>
          <section className="cx-card cx-resumo">
            <div className="cx-res">
              <span className="cx-rot">Total vencido</span>
              <strong style={{ color: COR.vencido }}>{brl(k.total)}</strong>
              <span className="cx-det">{contas(k.count)}</span>
            </div>
            {tipo === 'ambos' ? (
              <>
                <div className="cx-res"><span className="cx-rot"><Seta tipo="receber" /> Falta receber</span><strong>{brl(k.totalReceber)}</strong><span className="cx-det">dos clientes</span></div>
                <div className="cx-res"><span className="cx-rot"><Seta tipo="pagar" /> Falta pagar</span><strong>{brl(k.totalPagar)}</strong><span className="cx-det">aos fornecedores</span></div>
              </>
            ) : !comJuros && (
              <div className="cx-res"><span className="cx-rot">Valor médio</span><strong>{brl(k.count ? k.total / k.count : 0)}</strong><span className="cx-det">por conta</span></div>
            )}
            {comJuros && (
              <div className="cx-res">
                <span className="cx-rot">Receber com juros</span>
                <strong style={{ color: COR.receber }}>{brl(k.totalReceber + jurosTotal)}</strong>
                <span className="cx-det">+ {brl(jurosTotal)} de juros ({pct(taxa)}% ao mês)</span>
              </div>
            )}
            <div className="cx-res">
              <span className="cx-rot">Maior atraso</span>
              <strong>{k.maiorAtraso} {k.maiorAtraso === 1 ? 'dia' : 'dias'}</strong>
              <span className="cx-det">{dados.titulos[0] ? nomeDe(dados.titulos[0].nome) : '—'}</span>
            </div>
          </section>

          <section className="cx-card cx-faixas" aria-label="Faixas de atraso">
            {FAIXAS.map((f) => {
              const r = dados.faixas.find((x) => x.faixa === f.id)
              const on = faixa === f.id
              return (
                <button key={f.id} type="button" aria-pressed={on} className={`cx-faixa${on ? ' cx-faixa-on' : ''}`} style={{ ['--c' as string]: f.cor }} onClick={() => { setFaixa(on ? null : f.id); setLimite(POR_VEZ) }}>
                  <span className="cx-rot"><span className="cx-bola" /> {f.nome}</span>
                  <strong>{brl(r?.total || 0)}</strong>
                  <span className="cx-barra"><span style={{ width: `${((r?.total || 0) / maiorFaixa) * 100}%` }} /></span>
                  <span className="cx-det">{contas(r?.count || 0)}{k.total ? ` · ${Math.round(((r?.total || 0) / k.total) * 100)}% do total` : ''}</span>
                </button>
              )
            })}
          </section>

          <section className="cx-card cx-barra-filtros">
            <div className="cx-grupo">
              <button type="button" aria-pressed={visao === 'terceiro'} className={`cx-chip${visao === 'terceiro' ? ' cx-chip-on' : ''}`} onClick={() => setVisao('terceiro')}><i className="fa-solid fa-users" /> Por {quem(tipo)} <span>{terceiros.length}</span></button>
              <button type="button" aria-pressed={visao === 'lista'} className={`cx-chip${visao === 'lista' ? ' cx-chip-on' : ''}`} onClick={() => setVisao('lista')}><i className="fa-solid fa-list" /> Conta por conta <span>{filtrados.length}</span></button>
              {comJuros && (
                <label className="cx-campo" title="Juros simples: a taxa do mês dividida por 30 e multiplicada pelos dias em atraso">
                  Juros <input value={taxaTxt} onChange={(e) => setTaxaTxt(e.target.value)} inputMode="decimal" aria-label="Juros ao mês, em %" style={{ width: 44, textAlign: 'right' }} /> % ao mês
                  <span className="cx-apagado" style={{ fontSize: 14 }}>· {pct(taxa / 30)}% por dia</span>
                </label>
              )}
              {(faixa || termo) && <span className="cx-filtro">Mostrando {contas(filtrados.length)}, {brl(somaFiltrada)}{faixa ? ` · ${FAIXAS.find((f) => f.id === faixa)?.nome}` : ''} <button type="button" className="cx-link" onClick={() => { setFaixa(null); setBusca('') }}>Ver tudo</button></span>}
            </div>
            <label className="cx-busca">
              <i className="fa-solid fa-magnifying-glass" />
              <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_VEZ) }} placeholder={`Buscar ${quem(tipo)}, CPF/CNPJ ou NF`} aria-label={`Buscar ${quem(tipo)}, CPF, CNPJ, nota fiscal ou categoria`} />
            </label>
          </section>

          {visao === 'lista' ? (
            <section className="cx-card cx-rola">
              <table className="cx-tab">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    {cab('nome', rotuloQuem)}
                    <th>Documento</th>
                    {cab('venc', 'Venceu em')}
                    {cab('atraso', 'Atraso')}
                    {cab('valor', 'Em aberto', true)}
                    {comJuros && <th style={{ textAlign: 'right' }}>Com juros</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, limite).map((t) => (
                    <tr key={`${t.tipo}-${t.codigo_lancamento}`}>
                      <td>{empresa(t.conta_omie)}</td>
                      <td className="cx-nome">
                        {tipo === 'ambos' && <><Seta tipo={t.tipo} />{' '}</>}{nomeDe(t.nome)}
                        <small>{[t.documento, t.descricao_categoria].filter(Boolean).join(' · ')}</small>
                      </td>
                      <td><Documento nf={t.numero_documento_fiscal} doc={t.numero_documento} parcela={t.numero_parcela} /></td>
                      <td>{dataBR(t.data_vencimento)}</td>
                      <td><Atraso t={t} /></td>
                      <td style={{ textAlign: 'right' }}><Valor t={t} /></td>
                      {comJuros && <td style={{ textAlign: 'right' }}><ComJuros t={t} taxa={taxa} /></td>}
                    </tr>
                  ))}
                  {lista.length === 0 && <tr><td colSpan={comJuros ? 7 : 6} className="cx-vazio">{termo || faixa ? 'Nada com esse filtro' : 'Nenhuma conta vencida'}</td></tr>}
                </tbody>
              </table>
              {lista.length > limite && <div className="cx-mais"><button type="button" className="cx-chip" onClick={() => setLimite((n) => n + POR_VEZ)}>Ver mais {Math.min(POR_VEZ, lista.length - limite)} de {lista.length - limite}</button></div>}
            </section>
          ) : (
            <section className="cx-card cx-rola">
              <table className="cx-tab">
                <thead>
                  <tr>
                    <th>{rotuloQuem}</th><th>Contas</th><th>Maior atraso</th><th style={{ width: comJuros ? '22%' : '32%' }}>Em aberto</th>
                    {comJuros && <><th style={{ textAlign: 'right' }}>Juros</th><th style={{ textAlign: 'right' }}>Total com juros</th><th /></>}
                  </tr>
                </thead>
                <tbody>
                  {terceiros.slice(0, limite).map((g) => {
                    const on = aberto === g.chave
                    return [
                      <tr key={g.chave} className={on ? 'cx-tr-on' : ''} onClick={() => abrirCliente(g)} style={{ cursor: 'pointer' }} title="Abrir todas as contas deste cliente">
                        <td className="cx-nome">
                          <i className="fa-solid fa-up-right-from-square cx-apagado" style={{ fontSize: 11, width: 14 }} /> {tipo === 'ambos' && <><Seta tipo={g.tipo} />{' '}</>}{g.nome}
                          <small style={{ paddingLeft: 18 }}>{[g.documento || 'sem CPF/CNPJ no cadastro', [...g.empresas].join(' e '), g.telefone].filter(Boolean).join(' · ')}</small>
                        </td>
                        <td>{g.titulos.length}</td>
                        <td><span className="cx-pilula" style={{ color: COR_FAIXA[g.titulos.find((t) => t.dias_atraso === g.maxAtraso)?.faixa || '1-30'] }}>{g.maxAtraso} {g.maxAtraso === 1 ? 'dia' : 'dias'}</span></td>
                        <td>
                          <div className="cx-valor-barra">
                            <span className="cx-barra"><span style={{ width: `${(g.total / maiorTerceiro) * 100}%`, background: COR[g.tipo] }} /></span>
                            <span style={{ fontWeight: 500, minWidth: 120, textAlign: 'right' }}>{brl(g.total)}</span>
                          </div>
                        </td>
                        {comJuros && (
                          <>
                            <td style={{ textAlign: 'right', color: '#b45309' }}>{g.tipo === 'receber' ? `+ ${brl(g.juros)}` : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{brl(g.total + g.juros)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {g.tipo === 'receber' && (
                                <button type="button" className="cx-chip" onClick={(e) => { e.stopPropagation(); copiar(g) }} title="Copia a lista das contas com os juros, para mandar ao cliente">
                                  <i className={`fa-solid ${copiado === g.chave ? 'fa-check' : 'fa-copy'}`} /> {copiado === g.chave ? 'Copiado' : 'Copiar cobrança'}
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>,
                    ]
                  })}
                  {terceiros.length === 0 && <tr><td colSpan={comJuros ? 7 : 4} className="cx-vazio">{termo || faixa ? 'Nada com esse filtro' : 'Nenhuma conta vencida'}</td></tr>}
                </tbody>
              </table>
              {terceiros.length > limite && <div className="cx-mais"><button type="button" className="cx-chip" onClick={() => setLimite((n) => n + POR_VEZ)}>Ver mais {Math.min(POR_VEZ, terceiros.length - limite)} de {terceiros.length - limite}</button></div>}
            </section>
          )}

          <p className="cx-nota">
            Mesmo cálculo do DRE Financeiro: contas que o Omie marca como atrasadas e que venceram a partir de 01/01/{ano}, sem as contas entre Nova e Castro.
            Os dados vêm do espelho do Omie, atualizado algumas vezes por dia. Por cliente, as contas se juntam pelo CPF/CNPJ (o mesmo cliente na Nova e na Castro vira uma linha só).
            {comJuros && ` Juros simples só nas contas a receber: ${pct(taxa)}% ao mês dividido por 30 (${pct(taxa / 30)}% por dia) vezes os dias em atraso, sobre o valor em aberto.`}
          </p>
        </>
      )}
      {/* baixou alguma conta: recarrega a lista (o espelho já foi atualizado pela própria baixa) */}
      {cliente && <ContasCliente cliente={cliente} taxa={taxa} onFechar={() => setCliente(null)} onBaixou={carregar} />}
    </div>
  )
}

const ESTILO_VENCIDOS = `
.cx-faixas { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); overflow: hidden }
.cx-faixa { --c: #d97706; display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 14px 18px; border: none; border-left: 1px solid var(--border, #e2e8f0); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background .2s }
.cx-faixa:first-child { border-left: none }
.cx-faixa:hover { background: color-mix(in srgb, var(--c) 5%, var(--surface, #fefefe)) }
.cx-faixa-on, .cx-faixa-on:hover { background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)) }
.cx-faixa strong { font-size: 23px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap }
.cx-bola { width: 10px; height: 10px; border-radius: 50%; background: var(--c) }
.cx-barra-filtros { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; padding: 12px 16px }
.cx-filtro { font-size: 15px; color: var(--portal-text-secondary, #475569) }
.cx-busca { display: flex; align-items: center; gap: 8px; width: min(320px, 100%); height: 36px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; color: var(--portal-text-muted, #64748b) }
.cx-busca input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--portal-text, #0f172a); font-size: 15.5px }
.cx-ord { display: inline-flex; align-items: center; gap: 6px; border: none; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer }
.cx-ord i { font-size: 11px; color: #2563eb }
.cx-valor-barra { display: flex; align-items: center; gap: 12px }
.cx-tr-on { background: color-mix(in srgb, #2563eb 6%, var(--surface, #fefefe)) }
.cx-sub > td { padding: 0 0 0 30px !important; background: var(--portal-bg-secondary, #f8fafc) }
.cx-tab-sub { min-width: 0; font-size: 15px }
.cx-tab-sub td { padding: 8px 12px }
`
