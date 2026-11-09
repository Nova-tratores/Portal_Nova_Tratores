'use client'
// Financeiro → Contas do cliente/fornecedor (09/11/2026). Consulta tudo o que a pessoa
// deve e tem a receber nas duas empresas (espelho contas_pagar/contas_receber) e
// a calculadora de dívida consolidada: marca títulos a receber em aberto (uma
// empresa por vez) → valor atualizado com multa + juros pro-rata → demonstrativo
// em PDF / texto para WhatsApp. Nada é gravado na Omie (decisão do usuário).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Calculator, Settings2, FileDown, Copy, Info, X, RotateCcw, AlertTriangle, ArrowDownLeft, ArrowUpRight, Scale, Clock } from 'lucide-react'
import { fetchAuth } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { REGRA_PADRAO, consolidar, normalizarRegra, validarSelecao, atualizarTitulo, type RegraJuros } from '@/lib/financeiro/divida'
import { brl, dataBR, gerarDemonstrativoPdf, resumoTexto, type DadosDemonstrativo } from '@/lib/financeiro/demonstrativo-pdf'
import { tempoRelativo } from '@/lib/ajustes/tempo-relativo'

type Conta = 'NOVA' | 'CASTRO'
interface Pessoa {
  chave: string; nome: string; fantasia: string | null; documento: string | null; cidade: string | null; estado: string | null
  telefone: string | null; email: string | null; codigos: Record<Conta, number[]>
}
interface Titulo {
  id: string; tipo: 'receber' | 'pagar'; conta: Conta; codigoLancamento: number; numeroDoc: string | null; notaFiscal: string | null
  parcela: string | null; emissao: string | null; vencimento: string | null; previsao: string | null; pagamento: string | null
  valorDocumento: number; valorPago: number; valorAberto: number; status: string; aberto: boolean; categoria: string | null
  observacao: string | null; origem: string | null
}
type RegraComMeta = RegraJuros & { atualizado_por?: string | null; atualizado_em?: string | null }

const COR = '#059669'
const NOME_EMPRESA: Record<Conta, string> = { NOVA: 'Nova Tratores', CASTRO: 'Castro Peças' }
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const umAnoAtras = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const proximoMes = () => { const d = new Date(); d.setDate(d.getDate() + 30); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const numeroTitulo = (t: Titulo) => [t.numeroDoc || t.notaFiscal || `#${t.codigoLancamento}`, t.parcela && t.parcela !== '000/000' ? t.parcela : null].filter(Boolean).join(' · ')

const cartao: React.CSSProperties = { background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 14, padding: '14px 16px' }
const campo: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', fontSize: 13.5, outline: 'none' }
const rotulo: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }

// --- número que sobe contando (respeita prefers-reduced-motion)
function useContador(alvo: number, ms = 600) {
  const [v, setV] = useState(alvo)
  const de = useRef(alvo)
  useEffect(() => {
    const reduz = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dur = reduz ? 0 : ms
    const inicio = performance.now(); const a = de.current
    let raf = 0
    const passo = (t: number) => {
      const k = dur ? Math.min(1, (t - inicio) / dur) : 1; const e = 1 - Math.pow(1 - k, 3)
      setV(a + (alvo - a) * e)
      if (k < 1) raf = requestAnimationFrame(passo); else de.current = alvo
    }
    raf = requestAnimationFrame(passo)
    return () => { cancelAnimationFrame(raf); de.current = alvo }
  }, [alvo, ms])
  return v
}
function Valor({ n, cor, tam = 20 }: { n: number; cor?: string; tam?: number }) {
  const v = useContador(n)
  return <span style={{ fontSize: tam, fontWeight: 700, color: cor || 'var(--portal-text, #111111)', fontVariantNumeric: 'tabular-nums' }}>{brl(v)}</span>
}

function Selo({ cor, children, title }: { cor: string; children: React.ReactNode; title?: string }) {
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${cor} 25%, transparent)` }}>{children}</span>
}
const corStatus = (s: string) => s === 'ATRASADO' ? '#dc2626' : s === 'VENCE HOJE' ? '#d97706' : s === 'A VENCER' ? '#2563eb' : s === 'CANCELADO' ? '#64748b' : '#059669'
const corEmpresa = (c: Conta) => c === 'NOVA' ? '#b91c1c' : '#7c3aed'

function Icone({ children, cor }: { children: React.ReactNode; cor: string }) {
  return <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: cor, flexShrink: 0,
    background: `color-mix(in srgb, ${cor} 10%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 20%, transparent)` }}>{children}</span>
}

type ColOrdem = 'conta' | 'numero' | 'emissao' | 'vencimento' | 'dias' | 'valor' | 'aberto' | 'atualizado' | 'status' | 'categoria'

export default function ContasCliente() {
  const router = useRouter()
  const params = useSearchParams()
  const { userProfile } = useAuth()
  const { pode, isAdmin } = usePermissoes(userProfile?.id)
  const { log } = useAuditLog()
  const podeRegra = isAdmin || pode('financeiro', 'contas-cliente-regra')

  // busca
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Pessoa[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [abertoBusca, setAbertoBusca] = useState(false)

  // dados
  const chave = params.get('doc') || ''
  const [situacao, setSituacao] = useState<'abertos' | 'todos'>('abertos')
  const [de, setDe] = useState(umAnoAtras())
  const [ate, setAte] = useState(proximoMes())
  const [pessoa, setPessoa] = useState<Pessoa | null>(null)
  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [sinc, setSinc] = useState<Record<string, string | null>>({})
  const [regras, setRegras] = useState<Record<Conta, RegraComMeta>>({ NOVA: REGRA_PADRAO, CASTRO: REGRA_PADRAO })
  const [semMigracao, setSemMigracao] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  // lista
  const [aba, setAba] = useState<'receber' | 'pagar'>('receber')
  const [filtroConta, setFiltroConta] = useState<'todas' | Conta>('todas')
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [ordem, setOrdem] = useState<{ col: ColOrdem; dir: 1 | -1 }>({ col: 'vencimento', dir: 1 })

  // calculadora
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [dataBase, setDataBase] = useState(hojeISO())
  const [regraSim, setRegraSim] = useState<RegraJuros>(REGRA_PADRAO)
  const [regraEditada, setRegraEditada] = useState(false)
  const [parcelar, setParcelar] = useState(false)
  const [qtdParcelas, setQtdParcelas] = useState(3)
  const [primeiroVenc, setPrimeiroVenc] = useState(proximoMes())
  const [modoParcela, setModoParcela] = useState<'sem_juros' | 'price'>('sem_juros')
  const [aviso, setAviso] = useState('')
  const [janelaRegra, setJanelaRegra] = useState(false)
  const [comoLer, setComoLer] = useState(false)

  // ---------------------------------------------------------------- busca
  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 3) { setResultados(null); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await fetchAuth(`/api/financeiro/contas-cliente/buscar?q=${encodeURIComponent(termo)}`)
        const j = await r.json()
        setResultados(j.ok ? j.pessoas : [])
      } catch { setResultados([]) } finally { setBuscando(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const escolher = (p: Pessoa) => {
    setAbertoBusca(false); setQ('')
    const sp = new URLSearchParams(params.toString()); sp.set('doc', p.chave)
    router.replace(`?${sp.toString()}`)
  }

  // ---------------------------------------------------------------- carregar
  const carregar = useCallback(async () => {
    if (!chave) { setPessoa(null); setTitulos([]); return }
    setCarregando(true); setErro('')
    try {
      const qs = new URLSearchParams({ chave, situacao })
      if (situacao === 'todos') { if (de) qs.set('de', de); if (ate) qs.set('ate', ate) }
      const r = await fetchAuth(`/api/financeiro/contas-cliente?${qs}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || 'Erro ao carregar')
      setPessoa(j.pessoa); setTitulos(j.titulos); setSinc(j.sincronizadoEm || {}); setRegras(j.regras); setSemMigracao(!!j.migracaoFaltando)
      setMarcados((m) => new Set([...m].filter((id) => j.titulos.some((t: Titulo) => t.id === id && t.aberto))))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally { setCarregando(false) }
  }, [chave, situacao, de, ate])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setMarcados(new Set()) }, [chave])

  // ---------------------------------------------------------------- derivados
  const marcadosLista = useMemo(() => titulos.filter((t) => marcados.has(t.id)), [titulos, marcados])
  const contaSel: Conta | null = marcadosLista[0]?.conta ?? null

  // regra da simulação acompanha a empresa escolhida (enquanto a pessoa não editou)
  useEffect(() => {
    if (!regraEditada) setRegraSim(normalizarRegra(regras[contaSel || 'NOVA']))
  }, [contaSel, regras, regraEditada])

  const resumo = useMemo(() => {
    const base = { receber: 0, receberAtrasado: 0, nAtrasados: 0, pagar: 0, pagarAtrasado: 0, recebido: 0, pago: 0 }
    const porConta: Record<Conta, typeof base> = { NOVA: { ...base }, CASTRO: { ...base } }
    const hoje = hojeISO()
    for (const t of titulos) {
      const c = porConta[t.conta]
      const atrasado = t.aberto && !!t.vencimento && t.vencimento < hoje
      if (t.tipo === 'receber') {
        if (t.aberto) { c.receber += t.valorAberto; if (atrasado) { c.receberAtrasado += t.valorAberto; c.nAtrasados++ } }
        c.recebido += t.valorPago
      } else {
        if (t.aberto) { c.pagar += t.valorAberto; if (atrasado) c.pagarAtrasado += t.valorAberto }
        c.pago += t.valorPago
      }
    }
    const tot = Object.keys(base).reduce((acc, k) => ({ ...acc, [k]: porConta.NOVA[k as keyof typeof base] + porConta.CASTRO[k as keyof typeof base] }), {} as typeof base)
    return { porConta, tot }
  }, [titulos])

  const regraDe = (c: Conta) => (contaSel === c ? regraSim : normalizarRegra(regras[c]))
  const visiveis = useMemo(() => {
    const hoje = hojeISO()
    const lista = titulos.filter((t) => t.tipo === aba && (filtroConta === 'todas' || t.conta === filtroConta) && (!soAtrasados || (t.aberto && !!t.vencimento && t.vencimento < hoje)))
    const val = (t: Titulo): string | number => {
      switch (ordem.col) {
        case 'conta': return t.conta
        case 'numero': return numeroTitulo(t)
        case 'emissao': return t.emissao || ''
        case 'vencimento': return t.vencimento || ''
        case 'dias': return t.aberto ? atualizarTitulo(t, REGRA_PADRAO, dataBase).dias : -1
        case 'valor': return t.valorDocumento
        case 'aberto': return t.valorAberto
        case 'atualizado': return t.aberto ? atualizarTitulo(t, regraDe(t.conta), dataBase).total : 0
        case 'status': return t.status
        case 'categoria': return t.categoria || ''
      }
    }
    return [...lista].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * ordem.dir })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulos, aba, filtroConta, soAtrasados, ordem, dataBase, regraSim, regras, contaSel])

  const calc = useMemo(() => consolidar(
    marcadosLista, regraSim, dataBase,
    parcelar ? { quantidade: qtdParcelas, primeiroVencimento: primeiroVenc, modo: modoParcela } : null,
  ), [marcadosLista, regraSim, dataBase, parcelar, qtdParcelas, primeiroVenc, modoParcela])

  // ---------------------------------------------------------------- ações
  const alternar = (t: Titulo) => {
    setAviso('')
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(t.id)) { n.delete(t.id); return n }
      const erroSel = validarSelecao([...titulos.filter((x) => n.has(x.id)), t])
      if (erroSel) { setAviso(erroSel); return m }
      n.add(t.id); return n
    })
  }
  const marcarAtrasados = (conta: Conta) => {
    const hoje = hojeISO()
    setAviso('')
    setMarcados(new Set(titulos.filter((t) => t.tipo === 'receber' && t.aberto && t.conta === conta && t.vencimento && t.vencimento < hoje).map((t) => t.id)))
    setAba('receber')
  }

  const dadosDemo = (): DadosDemonstrativo | null => {
    if (!pessoa || !contaSel) return null
    return {
      empresa: NOME_EMPRESA[contaSel], cliente: pessoa.nome, documento: pessoa.documento, dataBase, regra: regraSim, consolidado: calc,
      titulos: marcadosLista.map((t) => ({ id: t.id, numero: numeroTitulo(t), vencimento: t.vencimento, valorOriginal: t.valorAberto })),
      emitidoPor: userProfile?.nome || 'portal',
    }
  }
  const registrar = (acao: string) => {
    if (!pessoa || !contaSel) return
    log({ sistema: 'financeiro', acao, entidade: 'contas_cliente', entidade_id: pessoa.chave, entidade_label: pessoa.nome,
      detalhes: { conta: contaSel, dataBase, regra: regraSim, titulos: marcadosLista.map((t) => t.codigoLancamento), principal: calc.principal, total: calc.total, parcelas: calc.parcelas.length } })
  }
  const gerarPdf = async () => {
    const d = dadosDemo(); if (!d) return
    try {
      const blob = await gerarDemonstrativoPdf(d)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      registrar('demonstrativo')
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui gerar o PDF') }
  }
  const copiar = async () => {
    const d = dadosDemo(); if (!d) return
    try { await navigator.clipboard.writeText(resumoTexto(d)); setAviso('Resumo copiado — é só colar no WhatsApp.'); registrar('demonstrativo_copiado') }
    catch { setAviso('O navegador não deixou copiar.') }
  }

  // ---------------------------------------------------------------- render
  const th = (col: ColOrdem, txt: string, num = false) => (
    <th onClick={() => setOrdem((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))}
      aria-sort={ordem.col === col ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none'} title="Clique para ordenar A→Z / Z→A"
      style={{ textAlign: num ? 'right' : 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
      {txt} <span style={{ opacity: ordem.col === col ? 1 : 0.35 }}>{ordem.col === col ? (ordem.dir === 1 ? '▲' : '▼') : '⇅'}</span>
    </th>
  )
  const sincTexto = Object.entries(sinc).map(([k, v]) => ({ k, t: tempoRelativo(v) }))
  const pior = sincTexto.find((s) => s.t.nivel === 'critico') || sincTexto.find((s) => s.t.nivel === 'atencao') || sincTexto[0]

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'grid', gap: 14 }}>
      <style>{`
        @keyframes cc-entra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .cc-entra { animation: cc-entra .35s ease both }
        @media (prefers-reduced-motion: reduce) { .cc-entra { animation: none } }
        .cc-linha:hover { background: color-mix(in srgb, ${COR} 5%, transparent) }
        .cc-res:hover { background: color-mix(in srgb, ${COR} 8%, var(--surface, #fefefe)) }
        .cc-grade { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; align-items: start }
        @media (max-width: 1100px) { .cc-grade { grid-template-columns: minmax(0, 1fr) } }
      `}</style>

      {/* ------------------------------------------------ busca */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 380px', maxWidth: 640 }}>
          <Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: '#94a3b8' }} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setAbertoBusca(true) }} onFocus={() => setAbertoBusca(true)}
            placeholder="Buscar cliente ou fornecedor por nome, CPF ou CNPJ…" style={{ ...campo, padding: '10px 12px 10px 34px', fontSize: 14 }} autoFocus={!chave} />
          {abertoBusca && q.trim().length >= 3 && (
            <div style={{ position: 'absolute', zIndex: 30, top: 44, left: 0, right: 0, ...cartao, padding: 6, maxHeight: 380, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.15)' }}>
              {buscando && <div style={{ padding: 10, fontSize: 13, color: '#64748b' }}>Buscando…</div>}
              {!buscando && resultados?.length === 0 && <div style={{ padding: 10, fontSize: 13, color: '#64748b' }}>Ninguém com esse nome ou documento no cadastro da Omie.</div>}
              {!buscando && resultados?.map((p) => (
                <button key={p.chave} className="cc-res" onClick={() => escolher(p)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'inherit' }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nome}</div>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    {p.documento && <span>{p.documento}</span>}
                    {p.cidade && <span>{p.cidade}{p.estado ? `/${p.estado}` : ''}</span>}
                    {(['NOVA', 'CASTRO'] as Conta[]).filter((c) => p.codigos[c].length).map((c) => <Selo key={c} cor={corEmpresa(c)}>{c}</Selo>)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setComoLer((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fefefe)', color: 'inherit', cursor: 'pointer', fontSize: 13 }}>
          <Info size={15} /> Como ler esta tela
        </button>
        {pior && (
          <span title={sincTexto.map((s) => `${s.k}: ${s.t.texto}`).join('\n')} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, color: pior.t.nivel === 'critico' ? '#dc2626' : pior.t.nivel === 'atencao' ? '#d97706' : '#64748b' }}>
            <Clock size={13} /> espelho da Omie atualizado {pior.t.texto}
          </span>
        )}
      </div>

      {comoLer && (
        <div className="cc-entra" style={{ ...cartao, fontSize: 13.5, lineHeight: 1.55 }}>
          <b>Como ler esta tela</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Busque a pessoa pelo nome ou CPF/CNPJ. O mesmo cadastro aparece nas duas empresas (NOVA e CASTRO) e na Omie serve tanto de cliente quanto de fornecedor.</li>
            <li>Os cartões do topo mostram o que <b>ele nos deve</b> (a receber), o que <b>nós devemos a ele</b> (a pagar) e o saldo. Clique num cartão para filtrar a lista.</li>
            <li>Os valores vêm do espelho da Omie, atualizado algumas vezes por dia (veja o horário no topo). Um título baixado agora pode demorar para sair daqui.</li>
            <li>Na lista <b>A receber</b>, marque os títulos em aberto de <b>uma empresa</b>: a calculadora soma o valor em aberto, a multa (uma vez) e os juros por dia de atraso até a data-base.</li>
            <li>A regra (multa, juros, carência, desconto) vem da empresa; você pode mexer só nesta simulação. Nada é gravado na Omie: o PDF é um demonstrativo para mandar ao cliente, o boleto continua sendo feito como hoje.</li>
          </ul>
        </div>
      )}

      {!chave && (
        <div className="cc-entra" style={{ ...cartao, display: 'flex', gap: 14, alignItems: 'center', padding: 22 }}>
          <Icone cor={COR}><Calculator size={17} /></Icone>
          <div style={{ fontSize: 13.5, color: '#475569' }}>Escolha um cliente ou fornecedor na busca para ver as contas dele nas duas empresas e calcular a dívida atualizada.</div>
        </div>
      )}

      {erro && <div style={{ ...cartao, color: '#dc2626', fontSize: 13.5 }}>{erro}</div>}

      {pessoa && (
        <>
          {/* ------------------------------------------------ cabeçalho da pessoa */}
          <div className="cc-entra" style={{ ...cartao, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{pessoa.nome}</div>
              <div style={{ fontSize: 12.5, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
                {pessoa.fantasia && pessoa.fantasia !== pessoa.nome && <span>{pessoa.fantasia}</span>}
                {pessoa.documento && <span>{pessoa.documento}</span>}
                {pessoa.cidade && <span>{pessoa.cidade}{pessoa.estado ? `/${pessoa.estado}` : ''}</span>}
                {pessoa.telefone && <span>{pessoa.telefone}</span>}
                {pessoa.email && <span>{pessoa.email}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['NOVA', 'CASTRO'] as Conta[]).map((c) => pessoa.codigos[c].length
                ? <Selo key={c} cor={corEmpresa(c)} title={`Código na Omie: ${pessoa.codigos[c].join(', ')}`}>{c} · {pessoa.codigos[c].join(', ')}</Selo>
                : <Selo key={c} cor="#94a3b8">sem cadastro na {c}</Selo>)}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, overflow: 'hidden' }}>
                {([['abertos', 'Em aberto'], ['todos', 'Todos (período)']] as const).map(([v, t]) => (
                  <button key={v} onClick={() => setSituacao(v)} style={{ padding: '7px 11px', border: 0, fontSize: 12.5, cursor: 'pointer', fontWeight: situacao === v ? 700 : 500,
                    background: situacao === v ? COR : 'transparent', color: situacao === v ? '#fefefe' : 'inherit' }}>{t}</button>
                ))}
              </div>
              {situacao === 'todos' && (
                <>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={{ ...campo, width: 140 }} title="Vencimento a partir de" />
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ ...campo, width: 140 }} title="Vencimento até" />
                </>
              )}
            </div>
          </div>

          {/* ------------------------------------------------ resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
            <button className="cc-entra" onClick={() => { setAba('receber'); setSoAtrasados(false) }} style={{ ...cartao, textAlign: 'left', cursor: 'pointer', color: 'inherit', outline: aba === 'receber' && !soAtrasados ? `2px solid ${COR}` : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone cor={COR}><ArrowDownLeft size={16} /></Icone><span style={rotulo}>Ele nos deve (a receber)</span></div>
              <div style={{ marginTop: 6 }}><Valor n={resumo.tot.receber} cor={COR} /></div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>NOVA {brl(resumo.porConta.NOVA.receber)} · CASTRO {brl(resumo.porConta.CASTRO.receber)}</div>
            </button>
            <button className="cc-entra" onClick={() => { setAba('receber'); setSoAtrasados(true) }} style={{ ...cartao, textAlign: 'left', cursor: 'pointer', color: 'inherit', outline: soAtrasados ? '2px solid #dc2626' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone cor="#dc2626"><AlertTriangle size={16} /></Icone><span style={rotulo}>Atrasado a receber</span></div>
              <div style={{ marginTop: 6 }}><Valor n={resumo.tot.receberAtrasado} cor="#dc2626" /></div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{resumo.tot.nAtrasados} título(s) vencido(s)</div>
            </button>
            <button className="cc-entra" onClick={() => { setAba('pagar'); setSoAtrasados(false) }} style={{ ...cartao, textAlign: 'left', cursor: 'pointer', color: 'inherit', outline: aba === 'pagar' ? '2px solid #2563eb' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone cor="#2563eb"><ArrowUpRight size={16} /></Icone><span style={rotulo}>Nós devemos (a pagar)</span></div>
              <div style={{ marginTop: 6 }}><Valor n={resumo.tot.pagar} cor="#2563eb" /></div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>NOVA {brl(resumo.porConta.NOVA.pagar)} · CASTRO {brl(resumo.porConta.CASTRO.pagar)}</div>
            </button>
            <div className="cc-entra" style={cartao}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone cor="#7c3aed"><Scale size={16} /></Icone><span style={rotulo}>Saldo (receber − pagar)</span></div>
              <div style={{ marginTop: 6 }}><Valor n={resumo.tot.receber - resumo.tot.pagar} cor={resumo.tot.receber - resumo.tot.pagar >= 0 ? COR : '#dc2626'} /></div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{resumo.tot.receber - resumo.tot.pagar >= 0 ? 'A favor da empresa' : 'A favor dele'}{situacao === 'todos' ? ` · recebido ${brl(resumo.tot.recebido)} · pago ${brl(resumo.tot.pago)}` : ''}</div>
            </div>
          </div>

          <div className="cc-grade">
            {/* ------------------------------------------------ lista */}
            <div className="cc-entra" style={{ ...cartao, padding: 0, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, overflow: 'hidden' }}>
                  {([['receber', 'A receber'], ['pagar', 'A pagar']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => setAba(v)} style={{ padding: '7px 12px', border: 0, fontSize: 13, cursor: 'pointer', fontWeight: aba === v ? 700 : 500,
                      background: aba === v ? '#111111' : 'transparent', color: aba === v ? '#fefefe' : 'inherit' }}>
                      {t} ({titulos.filter((x) => x.tipo === v).length})
                    </button>
                  ))}
                </div>
                <select value={filtroConta} onChange={(e) => setFiltroConta(e.target.value as 'todas' | Conta)} style={{ ...campo, width: 'auto' }}>
                  <option value="todas">Todas as empresas</option><option value="NOVA">NOVA</option><option value="CASTRO">CASTRO</option>
                </select>
                <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} /> só atrasados
                </label>
                {aba === 'receber' && (['NOVA', 'CASTRO'] as Conta[]).filter((c) => resumo.porConta[c].nAtrasados > 0).map((c) => (
                  <button key={c} onClick={() => marcarAtrasados(c)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${COR}`, background: 'transparent', color: COR, cursor: 'pointer', fontWeight: 600 }}>
                    Marcar atrasados da {c}
                  </button>
                ))}
                {carregando && <span style={{ fontSize: 12, color: '#64748b' }}>Carregando…</span>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {aba === 'receber' && <th style={{ width: 34, borderBottom: '1px solid var(--border, #e2e8f0)' }} />}
                      {th('conta', 'Empresa')}{th('numero', 'Título')}{th('emissao', 'Emissão')}{th('vencimento', 'Vencimento')}{th('dias', 'Atraso', true)}
                      {th('valor', 'Valor', true)}{th('aberto', 'Em aberto', true)}{aba === 'receber' && th('atualizado', 'Atualizado', true)}{th('status', 'Situação')}{th('categoria', 'Categoria')}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((t) => {
                      const at = t.aberto ? atualizarTitulo(t, regraDe(t.conta), dataBase) : null
                      const pode = aba === 'receber' && t.aberto
                      const bloqueado = pode && !!contaSel && contaSel !== t.conta
                      return (
                        <tr key={t.id} className="cc-linha" onClick={() => pode && !bloqueado && alternar(t)}
                          style={{ cursor: pode && !bloqueado ? 'pointer' : 'default', opacity: bloqueado ? 0.45 : 1, background: marcados.has(t.id) ? `color-mix(in srgb, ${COR} 10%, transparent)` : undefined }}
                          title={bloqueado ? `A simulação está com a ${contaSel}: uma empresa por vez` : t.observacao || undefined}>
                          {aba === 'receber' && (
                            <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                              {pode && <input type="checkbox" checked={marcados.has(t.id)} disabled={bloqueado} onChange={() => alternar(t)} onClick={(e) => e.stopPropagation()} />}
                            </td>
                          )}
                          <td style={td}><Selo cor={corEmpresa(t.conta)}>{t.conta}</Selo></td>
                          <td style={td}>{numeroTitulo(t)}{t.notaFiscal && t.numeroDoc && t.notaFiscal !== t.numeroDoc ? <div style={{ fontSize: 11, color: '#64748b' }}>NF {t.notaFiscal}</div> : null}</td>
                          <td style={td}>{dataBR(t.emissao)}</td>
                          <td style={td}>{dataBR(t.vencimento)}{t.previsao && t.previsao !== t.vencimento ? <div style={{ fontSize: 11, color: '#d97706' }} title="Data de previsão na Omie">prev. {dataBR(t.previsao)}</div> : null}{!t.aberto && t.pagamento ? <div style={{ fontSize: 11, color: '#64748b' }}>pago {dataBR(t.pagamento)}</div> : null}</td>
                          <td style={{ ...td, textAlign: 'right', color: at && at.dias > 0 ? '#dc2626' : undefined }}>{at && at.dias > 0 ? `${at.dias} d` : '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{brl(t.valorDocumento)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{t.aberto ? brl(t.valorAberto) : '—'}</td>
                          {aba === 'receber' && <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: at && at.total > at.principal ? '#dc2626' : undefined }}>{at ? brl(at.total) : '—'}</td>}
                          <td style={td}><Selo cor={corStatus(t.status)}>{t.status || '—'}</Selo></td>
                          <td style={{ ...td, color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.categoria || '—'}</td>
                        </tr>
                      )
                    })}
                    {!visiveis.length && !carregando && (
                      <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        {situacao === 'abertos' ? 'Nenhum título em aberto aqui.' : 'Nenhum título com vencimento nesse período.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ------------------------------------------------ calculadora */}
            <div className="cc-entra" style={{ ...cartao, position: 'sticky', top: 96, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icone cor={COR}><Calculator size={16} /></Icone>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Calculadora da dívida</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{contaSel ? `${marcadosLista.length} título(s) da ${contaSel}` : 'Marque títulos a receber em aberto'}</div>
                </div>
                {podeRegra && (
                  <button onClick={() => setJanelaRegra(true)} title="Regra de juros da empresa" style={{ border: '1px solid var(--border, #e2e8f0)', background: 'transparent', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'inherit' }}>
                    <Settings2 size={16} />
                  </button>
                )}
              </div>

              {aviso && <div style={{ fontSize: 12.5, padding: '7px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 12%, transparent)', color: '#92400e' }}>{aviso}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label><span style={rotulo}>Data-base</span><input type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value || hojeISO())} style={campo} /></label>
                <label><span style={rotulo}>Juros</span>
                  <select value={regraSim.tipo_juros} onChange={(e) => { setRegraSim({ ...regraSim, tipo_juros: e.target.value as 'simples' | 'composto' }); setRegraEditada(true) }} style={campo}>
                    <option value="simples">Simples</option><option value="composto">Compostos</option>
                  </select>
                </label>
                {([['multa_pct', 'Multa %'], ['juros_mes_pct', 'Juros % a.m.'], ['carencia_dias', 'Carência (dias)'], ['desconto_pct', 'Desconto nos encargos %']] as const).map(([k, t]) => (
                  <label key={k}><span style={rotulo}>{t}</span>
                    <input type="number" min={0} step={k === 'carencia_dias' ? 1 : 0.1} value={regraSim[k]}
                      onChange={(e) => { setRegraSim(normalizarRegra({ ...regraSim, [k]: e.target.value === '' ? 0 : Number(e.target.value) })); setRegraEditada(true) }} style={campo} />
                  </label>
                ))}
              </div>
              {regraEditada && (
                <button onClick={() => { setRegraEditada(false); setRegraSim(normalizarRegra(regras[contaSel || 'NOVA'])) }}
                  style={{ justifySelf: 'start', display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, border: 0, background: 'transparent', color: COR, cursor: 'pointer', padding: 0 }}>
                  <RotateCcw size={13} /> voltar à regra da {contaSel || 'empresa'}
                </button>
              )}

              {marcadosLista.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 9 }}>
                  {calc.itens.map((i) => {
                    const t = marcadosLista.find((x) => x.id === i.id)!
                    return (
                      <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{numeroTitulo(t)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>venc. {dataBR(i.vencimento)} · {i.dias} d · {brl(i.principal)}</div>
                        </div>
                        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(i.total)}</b>
                        <button onClick={() => alternar(t)} title="Tirar da simulação" style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <Linha r="Valor em aberto" v={calc.principal} />
                <Linha r="Multa" v={calc.multa} />
                <Linha r="Juros" v={calc.juros} />
                {calc.desconto > 0 && <Linha r="Desconto" v={-calc.desconto} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 6, marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Total atualizado</span><Valor n={calc.total} cor={COR} tam={20} />
                </div>
              </div>

              <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={parcelar} onChange={(e) => setParcelar(e.target.checked)} /> Simular parcelamento
              </label>
              {parcelar && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label><span style={rotulo}>Parcelas</span><input type="number" min={1} max={60} value={qtdParcelas} onChange={(e) => setQtdParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} style={campo} /></label>
                    <label><span style={rotulo}>1º vencimento</span><input type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value || proximoMes())} style={campo} /></label>
                  </div>
                  <select value={modoParcela} onChange={(e) => setModoParcela(e.target.value as 'sem_juros' | 'price')} style={campo}>
                    <option value="sem_juros">Parcelas iguais, sem juros no parcelamento</option>
                    <option value="price">Com juros de {String(regraSim.juros_mes_pct).replace('.', ',')} % a.m. (tabela Price)</option>
                  </select>
                  {calc.parcelas.length > 1 && (
                    <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, maxHeight: 160, overflowY: 'auto' }}>
                      {calc.parcelas.map((p) => (
                        <div key={p.numero} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', fontSize: 12.5, borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                          <span>{p.numero}/{calc.parcelas.length} · {dataBR(p.vencimento)}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor)}</b>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', fontSize: 12, color: '#64748b' }}>
                        <span>Soma das parcelas</span><span>{brl(calc.parcelas.reduce((s, p) => s + p.valor, 0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={gerarPdf} disabled={!contaSel} style={{ ...botao, background: contaSel ? COR : '#cbd5e1', color: '#fefefe', borderColor: 'transparent' }}><FileDown size={15} /> Demonstrativo (PDF)</button>
                <button onClick={copiar} disabled={!contaSel} style={{ ...botao, opacity: contaSel ? 1 : 0.5 }}><Copy size={15} /> Copiar resumo</button>
                {marcadosLista.length > 0 && <button onClick={() => { setMarcados(new Set()); setAviso('') }} style={{ ...botao, color: '#64748b' }}>Limpar</button>}
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>Só simulação: nada é gravado na Omie. O boleto continua sendo emitido como hoje.</div>
            </div>
          </div>
        </>
      )}

      {janelaRegra && (
        <JanelaRegra regras={regras} semMigracao={semMigracao} inicial={contaSel || 'NOVA'} onFechar={() => setJanelaRegra(false)}
          onSalvo={(c, r) => { setRegras((x) => ({ ...x, [c]: r })); setRegraEditada(false) }} />
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border, #e2e8f0)', whiteSpace: 'nowrap', verticalAlign: 'top' }
const botao: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border, #e2e8f0)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600 }

function Linha({ r, v }: { r: string; v: number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>{r}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v < 0 ? `- ${brl(-v)}` : brl(v)}</span></div>
}

function JanelaRegra({ regras, semMigracao, inicial, onFechar, onSalvo }: {
  regras: Record<Conta, RegraComMeta>; semMigracao: boolean; inicial: Conta; onFechar: () => void; onSalvo: (c: Conta, r: RegraJuros) => void
}) {
  const [conta, setConta] = useState<Conta>(inicial)
  const [r, setR] = useState<RegraJuros>(normalizarRegra(regras[inicial]))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => { setR(normalizarRegra(regras[conta])) }, [conta, regras])
  const meta = regras[conta]

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const resp = await fetchAuth('/api/financeiro/contas-cliente/regra', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conta, regra: r }) })
      const j = await resp.json()
      if (!j.ok) throw new Error(j.erro || 'Erro ao salvar')
      onSalvo(conta, j.regra); onFechar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSalvando(false) }
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...cartao, width: 'min(460px, 100%)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <b style={{ flex: 1, fontSize: 15 }}>Regra de juros da empresa</b>
          <button onClick={onFechar} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit' }}><X size={18} /></button>
        </div>
        {semMigracao && <div style={{ fontSize: 12.5, padding: '7px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 12%, transparent)', color: '#92400e' }}>
          A tabela da regra ainda não foi criada no banco (sql/financeiro-regra-juros.sql). Enquanto isso, vale o padrão: multa 2 % + juros 1 % ao mês.
        </div>}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, overflow: 'hidden', justifySelf: 'start' }}>
          {(['NOVA', 'CASTRO'] as Conta[]).map((c) => (
            <button key={c} onClick={() => setConta(c)} style={{ padding: '7px 14px', border: 0, fontSize: 13, cursor: 'pointer', fontWeight: conta === c ? 700 : 500, background: conta === c ? '#111111' : 'transparent', color: conta === c ? '#fefefe' : 'inherit' }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([['multa_pct', 'Multa %'], ['juros_mes_pct', 'Juros % ao mês'], ['carencia_dias', 'Carência (dias)'], ['desconto_pct', 'Desconto nos encargos %']] as const).map(([k, t]) => (
            <label key={k}><span style={rotulo}>{t}</span>
              <input type="number" min={0} step={k === 'carencia_dias' ? 1 : 0.1} value={r[k]} onChange={(e) => setR(normalizarRegra({ ...r, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))} style={campo} />
            </label>
          ))}
          <label style={{ gridColumn: '1 / -1' }}><span style={rotulo}>Tipo de juros</span>
            <select value={r.tipo_juros} onChange={(e) => setR({ ...r, tipo_juros: e.target.value as 'simples' | 'composto' })} style={campo}>
              <option value="simples">Simples (pro-rata por dia)</option><option value="composto">Compostos (pro-rata por dia)</option>
            </select>
          </label>
        </div>
        {meta?.atualizado_por && <div style={{ fontSize: 11.5, color: '#64748b' }}>Última alteração: {meta.atualizado_por}{meta.atualizado_em ? ` em ${new Date(meta.atualizado_em).toLocaleString('pt-BR')}` : ''}</div>}
        {erro && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onFechar} style={botao}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || semMigracao} style={{ ...botao, background: semMigracao ? '#cbd5e1' : COR, color: '#fefefe', borderColor: 'transparent' }}>{salvando ? 'Salvando…' : 'Salvar regra'}</button>
        </div>
      </div>
    </div>
  )
}
