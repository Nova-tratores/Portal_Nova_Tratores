'use client'
// Ajustes por Venda — atribui vendedor e configura custos extras, desconto e
// % de comissão por item. Save no blur → POST /api/gestao-vendas/ajustes
// (o servidor recalcula comissão/margem e grava com status 'ajustado').
//
// Filtros: multi-select de Família acima da tabela (padrão desmarca peças e
// #N/D — sobra praticamente toda família) + filtros por coluna no cabeçalho
// (Pedido/Produto/Cliente/Vendedor/Status) e ordenação A→Z / Z→A ao clicar.

import { useEffect, useMemo, useState } from 'react'
import { useGv } from '../GvProvider'
import {
  adicionarVendedorApi,
  adicionarVendedoresEmLoteApi,
  listarCandidatosOmieApi,
  salvarAjusteApi,
  useGvMes,
} from '../hooks'
import {
  calcular,
  classificarCmcRatio,
  formatBRL,
  formatCompetencia,
  formatPercent,
  type LinhaAjuste,
} from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV, type Vendedor, type VendaEnriquecida } from '@/lib/gestao-vendas/tipos'
import { ErroCard, MultiSelectFiltro } from '../componentes'

type Edits = {
  vendedor?: string | null
  custos_extras?: number
  desconto?: number
  comissao_override_pct?: number | null
  cmc_override?: number | null // CMC total corrigido à mão; null = usa snapshot
}

// famílias de peças e #N/D começam desmarcadas (sobra praticamente todo o resto)
const FAMILIA_EXCLUIDA_PADRAO = /pe[çc]a|#?n\/d/i

const norm = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

// mesma regra do estoque (classificarGrupo em lib/estoque/cruzamento-familia):
// peça / #N/D / sem família / kit-revisão / ativo-imobilizado NÃO são máquina;
// tudo o resto é. Usada pelo atalho "Só máquinas".
function ehFamiliaMaquina(familia: string): boolean {
  const fam = norm(familia)
  if (
    !fam || fam === 'nd' || fam === 'n/d' || fam === '#n/d' ||
    fam.includes('sem famil') || fam.includes('sem nome') || fam.includes('indefinid')
  ) return false
  if (fam.includes('kit') && fam.includes('revis')) return false
  if (fam.includes('ativo') && fam.includes('imobiliz')) return false
  if (fam.includes('peca')) return false
  return true
}

// família real vem do master de produtos; cai no campo da venda; vazio = #N/D
function familiaDe(l: LinhaAjuste): string {
  const v = l.venda as VendaEnriquecida
  const f = (v.produto_familia_real ?? v.familia ?? '').trim()
  return f === '' ? '#N/D' : f
}

const SEM_VENDEDOR = '— sem vendedor —'

function vendedorDe(l: LinhaAjuste): string {
  return (l.ajuste?.vendedor ?? l.venda.vendedor ?? '').trim()
}

function statusDe(l: LinhaAjuste): string {
  return l.ajuste?.status ?? 'sem'
}

// CMC efetivo da linha: override manual (se houver) ou o snapshot do sync
function cmcTotalDe(l: LinhaAjuste): number {
  return l.ajuste?.cmc_override ?? (l.venda.cmc_unitario ?? 0) * l.venda.quantidade
}

// valores derivados (comissão/margem) usados para ordenar as colunas calculadas
function derivar(l: LinhaAjuste) {
  const cmcTotal = cmcTotalDe(l)
  const aj = l.ajuste
  const c = calcular({
    valor_venda: l.venda.valor_total,
    cmc_total: cmcTotal,
    custos_extras: aj?.custos_extras ?? 0,
    desconto: aj?.desconto ?? 0,
    comissao_pct: aj?.comissao_override_pct ?? aj?.comissao_pct ?? 0,
  })
  return { cmcTotal, c }
}

type ColKey =
  | 'pedido'
  | 'produto'
  | 'cliente'
  | 'vendedor'
  | 'cmc'
  | 'venda'
  | 'vmc'
  | 'mrg'
  | 'extra'
  | 'desc'
  | 'pc'
  | 'comissao'
  | 'mrgLoja'
  | 'status'

type Sort = { col: ColKey; dir: 'asc' | 'desc' }

const COLUNAS: { key: ColKey; rotulo: string; numerica?: boolean }[] = [
  { key: 'pedido', rotulo: 'Pedido' },
  { key: 'produto', rotulo: 'Produto' },
  { key: 'cliente', rotulo: 'Cliente' },
  { key: 'vendedor', rotulo: 'Vendedor' },
  { key: 'cmc', rotulo: 'CMC', numerica: true },
  { key: 'venda', rotulo: 'Venda', numerica: true },
  { key: 'vmc', rotulo: 'V−C', numerica: true },
  { key: 'mrg', rotulo: 'Mrg%', numerica: true },
  { key: 'extra', rotulo: 'Extra', numerica: true },
  { key: 'desc', rotulo: 'Desc', numerica: true },
  { key: 'pc', rotulo: '%C', numerica: true },
  { key: 'comissao', rotulo: 'Comissão', numerica: true },
  { key: 'mrgLoja', rotulo: 'Mrg Loja', numerica: true },
  { key: 'status', rotulo: 'St' },
]

function valorColuna(l: LinhaAjuste, col: ColKey): string | number {
  const d = derivar(l)
  switch (col) {
    case 'pedido': return l.venda.numero_pedido ?? ''
    case 'produto': return l.venda.descricao ?? ''
    case 'cliente': return l.venda.cliente_nome ?? `#${l.venda.codigo_cliente ?? ''}`
    case 'vendedor': return vendedorDe(l)
    case 'cmc': return d.cmcTotal
    case 'venda': return l.venda.valor_total
    case 'vmc': return d.c.margem_bruta_valor
    case 'mrg': return d.c.margem_bruta_pct
    case 'extra': return l.ajuste?.custos_extras ?? 0
    case 'desc': return l.ajuste?.desconto ?? 0
    case 'pc': return l.ajuste?.comissao_override_pct ?? l.ajuste?.comissao_pct ?? 0
    case 'comissao': return d.c.valor_comissao
    case 'mrgLoja': return d.c.margem_loja_valor
    case 'status': return statusDe(l)
  }
}

export default function GvAjustesPage() {
  const { mes, ano, conta } = useGv()
  const { linhas, vendedores, loading, error, aplicarAjusteSalvo, aplicarVendedores } = useGvMes()

  // ---------- filtro de família (multi-select, padrão sem peças/#N/D) ----------
  const [familias, setFamilias] = useState<string[]>([])
  const [chaveFamilias, setChaveFamilias] = useState('')

  const opcoesFamilias = useMemo(() => {
    const set = new Set<string>()
    for (const l of linhas) set.add(familiaDe(l))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [linhas])

  useEffect(() => {
    if (loading) return
    const chave = `${mes}-${ano}-${conta}-${opcoesFamilias.join('|')}`
    if (chave === chaveFamilias) return
    setChaveFamilias(chave)
    setFamilias(opcoesFamilias.filter((f) => !FAMILIA_EXCLUIDA_PADRAO.test(f)))
  }, [loading, mes, ano, conta, opcoesFamilias, chaveFamilias])

  // ---------- filtros por coluna (cabeçalho) ----------
  const [fPedido, setFPedido] = useState('')
  const [fProduto, setFProduto] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fVendedor, setFVendedor] = useState('') // '' = todos · SEM_VENDEDOR · nome
  const [fStatus, setFStatus] = useState('') // '' = todos · ajustado · pendente · sem

  const filtradas = useMemo(() => {
    const inclui = (v: string, alvo: string) => alvo.toLowerCase().includes(v.trim().toLowerCase())
    return linhas.filter((l) => {
      if (!familias.includes(familiaDe(l))) return false
      if (fPedido.trim() && !inclui(fPedido, l.venda.numero_pedido ?? '')) return false
      if (fProduto.trim() && !inclui(fProduto, l.venda.descricao ?? '')) return false
      if (fCliente.trim()) {
        const alvo = `${l.venda.cliente_nome ?? ''} ${l.venda.codigo_cliente ?? ''}`
        if (!inclui(fCliente, alvo)) return false
      }
      if (fVendedor) {
        const vend = vendedorDe(l)
        if (fVendedor === SEM_VENDEDOR ? vend !== '' : vend !== fVendedor) return false
      }
      if (fStatus && statusDe(l) !== fStatus) return false
      return true
    })
  }, [linhas, familias, fPedido, fProduto, fCliente, fVendedor, fStatus])

  // ---------- ordenação ----------
  const [sort, setSort] = useState<Sort>({ col: 'venda', dir: 'desc' })

  function clicarColuna(col: ColKey) {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: COLUNAS.find((c) => c.key === col)?.numerica ? 'desc' : 'asc' },
    )
  }

  const ordenadas = useMemo(() => {
    const arr = [...filtradas]
    const mult = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const va = valorColuna(a, sort.col)
      const vb = valorColuna(b, sort.col)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * mult
    })
    return arr
  }, [filtradas, sort])

  const totais = useMemo(() => {
    let venda = 0, cmc = 0, extra = 0, desc = 0, comm = 0, mLoja = 0
    for (const l of ordenadas) {
      const { cmcTotal, c } = derivar(l)
      venda += l.venda.valor_total
      cmc += cmcTotal
      extra += l.ajuste?.custos_extras ?? 0
      desc += l.ajuste?.desconto ?? 0
      comm += c.valor_comissao
      mLoja += c.margem_loja_valor
    }
    return { venda, cmc, extra, desc, comm, mLoja }
  }, [ordenadas])

  const filtroColunaAtivo =
    fPedido.trim() !== '' || fProduto.trim() !== '' || fCliente.trim() !== '' || fVendedor !== '' || fStatus !== ''
  const familiaPadrao = () => setFamilias(opcoesFamilias.filter((f) => !FAMILIA_EXCLUIDA_PADRAO.test(f)))
  const soMaquinas = () => setFamilias(opcoesFamilias.filter(ehFamiliaMaquina))

  // já está no modo "só máquinas"? (exatamente as famílias de máquina selecionadas)
  const opcoesMaquinas = useMemo(() => opcoesFamilias.filter(ehFamiliaMaquina), [opcoesFamilias])
  const modoSoMaquinas =
    opcoesMaquinas.length > 0 &&
    familias.length === opcoesMaquinas.length &&
    opcoesMaquinas.every((f) => familias.includes(f))

  async function salvar(linha: LinhaAjuste, edits: Edits): Promise<{ ok: boolean; error?: string }> {
    const venda = linha.venda
    const aj = linha.ajuste
    try {
      // grava sempre na conta da própria venda (o seletor pode estar em "Todas as Lojas")
      const salvo = await salvarAjusteApi((venda.conta_omie ?? 'NOVA').toUpperCase(), {
        id: aj?.id ?? null,
        venda_id: linha.venda_id_chave,
        data_pedido: venda.data_pedido,
        mes: venda.mes,
        ano: venda.ano,
        cliente: venda.cliente_nome ?? venda.codigo_cliente,
        familia: venda.familia,
        categoria: venda.codigo_categoria,
        departamento: venda.departamento,
        produto_descricao: venda.descricao,
        valor_venda: venda.valor_total,
        // envia sempre o snapshot cru; o servidor aplica o override quando houver
        cmc_total: (venda.cmc_unitario ?? 0) * venda.quantidade,
        cmc_override:
          edits.cmc_override !== undefined ? edits.cmc_override : aj?.cmc_override ?? null,
        vendedor: edits.vendedor !== undefined ? edits.vendedor : aj?.vendedor ?? null,
        custos_extras: edits.custos_extras ?? aj?.custos_extras ?? 0,
        desconto: edits.desconto ?? aj?.desconto ?? 0,
        comissao_override_pct:
          edits.comissao_override_pct !== undefined
            ? edits.comissao_override_pct
            : aj?.comissao_override_pct ?? null,
        comissao_pct_base: aj?.comissao_pct ?? 0,
      })
      aplicarAjusteSalvo(salvo)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const filtroFamiliaAtivo = familias.length !== opcoesFamilias.length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajustes por Venda</h1>
        <p className="text-sm text-gray-500">
          {nomeEmpresaGV(conta)} — {formatCompetencia(mes, ano)} — {ordenadas.length} de {linhas.length} venda(s).
          Save acontece ao sair do campo (blur). Cor da margem: &lt;80% vermelho · 80–89% amarelo ·
          ≥90% verde (CMC/Venda). O CMC é editável — corrija à mão quando o sync trouxer valor
          errado (fica em âmbar); vazio volta a usar o snapshot.
        </p>
      </div>

      {error && <ErroCard msg={error} />}

      <GerenciarVendedores vendedores={vendedores} onChange={aplicarVendedores} />

      {/* Filtro de família — padrão sem peças e #N/D */}
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Família:</span>
        <MultiSelectFiltro
          label="Família"
          values={familias}
          onChange={setFamilias}
          opcoes={opcoesFamilias}
        />
        <button
          type="button"
          onClick={soMaquinas}
          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
            modoSoMaquinas
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
          }`}
          title="Mostrar apenas famílias de máquina (exclui peças, #N/D, kit revisão e ativo imobilizado)"
        >
          🚜 Só máquinas
        </button>
        {filtroFamiliaAtivo && !modoSoMaquinas && (
          <button
            type="button"
            onClick={familiaPadrao}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕ Restaurar padrão (sem peças/#N/D)
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {ordenadas.length} / {linhas.length} venda(s)
        </span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : linhas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">Sem vendas para essa empresa/competência.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clicarColuna(c.key)}
                      className={`cursor-pointer select-none px-2 py-2 font-medium hover:text-gray-800 ${
                        c.numerica ? 'text-right' : ''
                      }`}
                      title="Clique para ordenar (A→Z / Z→A)"
                    >
                      {c.rotulo}
                      <span className="ml-0.5 inline-block w-2 text-[9px]">
                        {sort.col === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </th>
                  ))}
                </tr>
                {/* linha de filtros por coluna */}
                <tr className="border-t border-gray-200">
                  <th className="px-1 py-1 font-normal">
                    <input
                      value={fPedido}
                      onChange={(e) => setFPedido(e.target.value)}
                      placeholder="filtrar…"
                      className={filtroInputClass}
                    />
                  </th>
                  <th className="px-1 py-1 font-normal">
                    <input
                      value={fProduto}
                      onChange={(e) => setFProduto(e.target.value)}
                      placeholder="filtrar…"
                      className={filtroInputClass}
                    />
                  </th>
                  <th className="px-1 py-1 font-normal">
                    <input
                      value={fCliente}
                      onChange={(e) => setFCliente(e.target.value)}
                      placeholder="filtrar…"
                      className={filtroInputClass}
                    />
                  </th>
                  <th className="px-1 py-1 font-normal">
                    <select
                      value={fVendedor}
                      onChange={(e) => setFVendedor(e.target.value)}
                      className={filtroSelectClass}
                    >
                      <option value="">— todos —</option>
                      <option value={SEM_VENDEDOR}>{SEM_VENDEDOR}</option>
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.nome}>{v.nome}</option>
                      ))}
                    </select>
                  </th>
                  <th colSpan={8} className="px-1 py-1 text-right font-normal">
                    {filtroColunaAtivo && (
                      <button
                        type="button"
                        onClick={() => {
                          setFPedido(''); setFProduto(''); setFCliente(''); setFVendedor(''); setFStatus('')
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-800"
                      >
                        ✕ limpar filtros
                      </button>
                    )}
                  </th>
                  <th className="px-1 py-1 font-normal">
                    <select
                      value={fStatus}
                      onChange={(e) => setFStatus(e.target.value)}
                      className={filtroSelectClass}
                    >
                      <option value="">— todos —</option>
                      <option value="ajustado">ajustado</option>
                      <option value="pendente">pendente</option>
                      <option value="sem">sem</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l) => (
                  <LinhaRow key={l.venda.id} linha={l} vendedores={vendedores} onSave={(e) => salvar(l, e)} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td className="px-2 py-2" colSpan={4}>Total ({ordenadas.length} vendas)</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.cmc)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.venda)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.venda - totais.cmc)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.extra)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.desc)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.comm)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.mLoja)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'h-7 rounded-md border border-gray-300 bg-white px-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-red-500'

const filtroInputClass =
  'w-full min-w-[70px] rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-normal normal-case text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500'

const filtroSelectClass =
  'w-full min-w-[90px] rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-normal normal-case text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500'

// Barra de gestão da lista de vendedores: adicionar um manual + puxar do Omie.
function GerenciarVendedores({
  vendedores,
  onChange,
}: {
  vendedores: Vendedor[]
  onChange: (vs: Vendedor[]) => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar() {
    const n = nome.trim()
    if (!n || busy) return
    setBusy(true); setErro(null); setMsg(null)
    try {
      const { vendedores: vs, vendedor } = await adicionarVendedorApi(n, email.trim() || undefined)
      onChange(vs)
      setMsg(`Vendedor "${vendedor.nome}" adicionado à lista.`)
      setNome(''); setEmail(''); setAbrindo(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ---- seleção de candidatos do Omie ----
  const [candidatos, setCandidatos] = useState<string[] | null>(null) // null = painel fechado
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  async function abrirOmie() {
    if (busy) return
    if (candidatos) { setCandidatos(null); return } // toggle fecha
    setBusy(true); setErro(null); setMsg(null)
    try {
      const { candidatos: cs } = await listarCandidatosOmieApi()
      setCandidatos(cs)
      setSelecionados(new Set())
      if (cs.length === 0) setMsg('Nenhum vendedor novo no Omie — já está tudo salvo.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function alternar(nome: string) {
    setSelecionados((s) => {
      const n = new Set(s)
      if (n.has(nome)) n.delete(nome); else n.add(nome)
      return n
    })
  }

  async function adicionarSelecionados() {
    const nomes = [...selecionados]
    if (!nomes.length || busy) return
    setBusy(true); setErro(null); setMsg(null)
    try {
      const { vendedores: vs, criados } = await adicionarVendedoresEmLoteApi(nomes)
      onChange(vs)
      setMsg(`${criados} vendedor(es) adicionado(s) do Omie.`)
      setCandidatos(null)
      setSelecionados(new Set())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Vendedores ({vendedores.length}):
        </span>
        <button
          type="button"
          onClick={() => { setAbrindo((v) => !v); setErro(null); setMsg(null) }}
          disabled={busy}
          className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
        >
          ➕ Adicionar vendedor
        </button>
        <button
          type="button"
          onClick={abrirOmie}
          disabled={busy}
          title="Lista os vendedores do Omie que ainda não estão salvos p/ você escolher quais adicionar (ignora nomes com “/” e remove o cargo)"
          className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
        >
          {busy ? '⏳ Aguarde…' : candidatos ? '✕ Fechar Omie' : '🔄 Puxar do Omie'}
        </button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>

      {/* seleção de candidatos do Omie */}
      {candidatos && candidatos.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-gray-500">
              {candidatos.length} vendedor(es) no Omie ainda não salvo(s). Marque os que quer adicionar:
            </span>
            <button
              type="button"
              onClick={() => setSelecionados(new Set(candidatos))}
              className="text-[10px] text-gray-500 hover:text-gray-800"
            >
              marcar todos
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              className="text-[10px] text-gray-500 hover:text-gray-800"
            >
              limpar
            </button>
          </div>
          <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidatos.map((nome) => (
              <label key={nome} className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={selecionados.has(nome)}
                  onChange={() => alternar(nome)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="truncate" title={nome}>{nome}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={adicionarSelecionados}
              disabled={busy || selecionados.size === 0}
              className="h-8 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Adicionar selecionados ({selecionados.size})
            </button>
          </div>
        </div>
      )}

      {abrindo && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-2">
          <label className="flex flex-col text-[10px] uppercase tracking-wide text-gray-500">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
              placeholder="Nome do vendedor"
              autoFocus
              className="mt-0.5 h-8 w-56 rounded-md border border-gray-300 bg-white px-2 text-xs normal-case text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-wide text-gray-500">
            E-mail (opcional)
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
              placeholder="opcional"
              className="mt-0.5 h-8 w-56 rounded-md border border-gray-300 bg-white px-2 text-xs normal-case text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <button
            type="button"
            onClick={adicionar}
            disabled={busy || !nome.trim()}
            className="h-8 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => { setAbrindo(false); setNome(''); setEmail(''); setErro(null) }}
            disabled={busy}
            className="h-8 rounded-md px-2 text-xs text-gray-500 hover:text-gray-800"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

function LinhaRow({
  linha,
  vendedores,
  onSave,
}: {
  linha: LinhaAjuste
  vendedores: Vendedor[]
  onSave: (edits: Edits) => Promise<{ ok: boolean; error?: string }>
}) {
  const { venda, ajuste } = linha
  const clienteNome = venda.cliente_nome
  const cmcSnapshot = (venda.cmc_unitario ?? 0) * venda.quantidade

  const [vendedor, setVendedor] = useState(ajuste?.vendedor ?? '')
  const [custosExtras, setCustosExtras] = useState(String(ajuste?.custos_extras ?? 0))
  const [desconto, setDesconto] = useState(String(ajuste?.desconto ?? 0))
  const [commPct, setCommPct] = useState(String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0))
  const [cmcOverride, setCmcOverride] = useState(ajuste?.cmc_override == null ? '' : String(ajuste.cmc_override))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const cmcOverridden = cmcOverride.trim() !== ''
  const cmcTotal = cmcOverridden ? parseFloat(cmcOverride) || 0 : cmcSnapshot

  useEffect(() => {
    setVendedor(ajuste?.vendedor ?? '')
    setCustosExtras(String(ajuste?.custos_extras ?? 0))
    setDesconto(String(ajuste?.desconto ?? 0))
    setCommPct(String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0))
    setCmcOverride(ajuste?.cmc_override == null ? '' : String(ajuste.cmc_override))
  }, [ajuste])

  const calc = useMemo(
    () =>
      calcular({
        valor_venda: venda.valor_total,
        cmc_total: cmcTotal,
        custos_extras: parseFloat(custosExtras) || 0,
        desconto: parseFloat(desconto) || 0,
        comissao_pct: parseFloat(commPct) || 0,
      }),
    [venda.valor_total, cmcTotal, custosExtras, desconto, commPct],
  )

  const cor = classificarCmcRatio(calc.cmc_ratio)
  const corClass =
    cor === 'verde' ? 'text-green-600' : cor === 'amarelo' ? 'text-yellow-600' : 'text-red-600'

  const status = ajuste?.status ?? 'sem'
  const statusBadge =
    status === 'ajustado'
      ? 'bg-green-100 text-green-800'
      : status === 'pendente'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-500'

  const avisoMargemNegativa = calc.margem_loja_valor < 0 && calc.valor_comissao > 0

  async function save(edits: Edits) {
    setSaving(true)
    setSaveError(null)
    const result = await onSave(edits)
    setSaving(false)
    if (!result.ok) setSaveError(result.error ?? 'erro')
  }

  return (
    <tr
      className={`border-t border-gray-100 ${saving ? 'opacity-60' : ''} ${avisoMargemNegativa ? 'bg-red-50' : ''}`}
      title={avisoMargemNegativa ? '⚠ Margem negativa com comissão > 0' : undefined}
    >
      <td className="px-2 py-1 tabular-nums text-gray-500">{venda.numero_pedido ?? '—'}</td>
      <td className="max-w-[200px] truncate px-2 py-1" title={venda.descricao ?? ''}>
        {venda.descricao ?? '—'}
      </td>
      <td className="max-w-[160px] truncate px-2 py-1" title={clienteNome ?? venda.codigo_cliente ?? ''}>
        {clienteNome ?? <span className="text-gray-400">#{venda.codigo_cliente}</span>}
      </td>
      <td className="px-2 py-1">
        <select
          value={vendedor}
          onChange={(e) => setVendedor(e.target.value)}
          onBlur={(e) => {
            if ((ajuste?.vendedor ?? '') !== e.target.value) save({ vendedor: e.target.value || null })
          }}
          className="h-7 w-full rounded-md border border-gray-300 bg-white px-1 text-xs"
        >
          <option value="">— escolher —</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.nome}>
              {v.codigo != null ? `${v.codigo} — ${v.nome}` : v.nome}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={cmcOverride}
          onChange={(e) => setCmcOverride(e.target.value)}
          onBlur={(e) => {
            const original = ajuste?.cmc_override == null ? '' : String(ajuste.cmc_override)
            if (original !== e.target.value)
              save({ cmc_override: e.target.value === '' ? null : Number(e.target.value) })
          }}
          placeholder={venda.cmc_unitario == null ? 'CMC' : formatBRL(cmcSnapshot)}
          title={
            cmcOverridden
              ? `CMC corrigido à mão · snapshot do sync: ${venda.cmc_unitario == null ? '—' : formatBRL(cmcSnapshot)}`
              : 'CMC do snapshot — digite para corrigir (recalcula margem/comissão)'
          }
          className={`${inputClass} w-24 ${
            cmcOverridden ? 'font-medium text-amber-700 ring-1 ring-amber-300' : 'text-gray-500'
          }`}
        />
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(venda.valor_total)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(calc.margem_bruta_valor)}</td>
      <td className={`px-2 py-1 text-right tabular-nums ${corClass}`}>
        {formatPercent(calc.margem_bruta_pct, 0)}
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={custosExtras}
          onChange={(e) => setCustosExtras(e.target.value)}
          onBlur={(e) => {
            if (String(ajuste?.custos_extras ?? 0) !== e.target.value)
              save({ custos_extras: Number(e.target.value) || 0 })
          }}
          className={`${inputClass} w-20`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          onBlur={(e) => {
            if (String(ajuste?.desconto ?? 0) !== e.target.value)
              save({ desconto: Number(e.target.value) || 0 })
          }}
          className={`${inputClass} w-20`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={commPct}
          onChange={(e) => setCommPct(e.target.value)}
          onBlur={(e) => {
            const original = String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0)
            if (original !== e.target.value)
              save({ comissao_override_pct: e.target.value === '' ? null : Number(e.target.value) })
          }}
          className={`${inputClass} w-14`}
        />
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(calc.valor_comissao)}</td>
      <td
        className={`px-2 py-1 text-right font-medium tabular-nums ${calc.margem_loja_valor < 0 ? 'text-red-600' : ''}`}
      >
        {formatBRL(calc.margem_loja_valor)}
      </td>
      <td className="px-2 py-1">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge}`}>
          {status === 'sem' ? '—' : status}
        </span>
        {saveError && (
          <div className="max-w-[80px] truncate text-[10px] text-red-600" title={saveError}>
            erro
          </div>
        )}
      </td>
    </tr>
  )
}
