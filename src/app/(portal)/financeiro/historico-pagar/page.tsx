'use client'
// DESPESAS — resumo, gráficos e lista mês → semana → dia.
//
// Esta tela é só orquestração: busca os dados, guarda o estado dos filtros e
// compõe os blocos. Toda a conta mora em lib/financeiro/despesas (puro e
// testado), e é isso que permite conferir os números no vitest em vez de no
// olho — e mover pra uma rota de API quando o volume crescer (hoje são ~38
// despesas concluídas; o gatilho é a ordem de 5 mil).
//
// Três defeitos da versão anterior corrigidos aqui: valor saía sem formatação
// (`R$ 2673.46`), `error` do Supabase era ignorado (falha virava "nenhuma
// despesa", indistinguível de vazio) e o `select('*')` sem `range` batia no
// teto silencioso de 1000 linhas do PostgREST.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, History, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import ModalLogs from '@/components/financeiro/despesas/LogAlteracoes'
import { detalhesCategoria, type LogDespesa } from '@/lib/financeiro/despesas/logs'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import BuscaInteligente from '@/components/financeiro/despesas/BuscaInteligente'
import EvolucaoMensalChart from '@/components/financeiro/despesas/EvolucaoMensalChart'
import ListaDespesas from '@/components/financeiro/despesas/ListaDespesas'
import RankingBarras from '@/components/financeiro/despesas/RankingBarras'
import ResumoPeriodo from '@/components/financeiro/despesas/ResumoPeriodo'
import SeletorCategoria, { type OpcaoCategoria } from '@/components/financeiro/despesas/SeletorCategoria'
import { mapaDeCores } from '@/lib/charts/paleta'
import { authHeaders } from '@/lib/auth/client'
import {
  enriquecer, indexarTitulos, montarArvore, montarDicionario, rankingCategorias,
  rankingFornecedores, resumir, serieMensal,
} from '@/lib/financeiro/despesas/agregar'
import { codigosLancamento } from '@/lib/financeiro/despesas/omie'
import {
  hojeISO, intervaloDoPreset, mesesDoIntervalo, PRESETS, rotuloIntervalo, type Preset,
} from '@/lib/financeiro/despesas/periodo'
import type { Despesa, DespesaRow, TituloOmie } from '@/lib/financeiro/despesas/tipos'
import { formatarDataBR } from '@/lib/financeiro/utils'

// Colunas EXPLÍCITAS (o `select('*')` da versão anterior trazia motivo, CSVs de
// anexo e jsonb à toa). Conferidas contra a tabela real: o timestamp aqui é
// `criado_em`, não `created_at`.
const COLUNAS = [
  'id', 'fornecedor', 'valor', 'data_vencimento', 'numero_NF', 'metodo', 'motivo',
  'qtd_parcelas', 'anexo_nf', 'anexo_boleto', 'anexo_requisicao', 'anexo_comprovante', 'status', 'status_envio',
  'omie_categoria', 'omie_cod_lancamento', 'omie_empresa', 'omie_sync_em', 'criado_por', 'criado_em',
].join(',')

const TETO = 5000

interface Chips { mes?: string; categoria?: string; fornecedor?: string; foraOmie?: boolean }

export default function HistoricoPagar() {
  const router = useRouter()
  const [preset, setPreset] = useState<Preset>('12m')
  const [rows, setRows] = useState<DespesaRow[]>([])
  const [cache, setCache] = useState<OpcaoCategoria[]>([])
  const [titulos, setTitulos] = useState<TituloOmie[]>([])
  const [carregando, setCarregando] = useState(true)
  const [recarregando, setRecarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [chips, setChips] = useState<Chips>({})
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [classificando, setClassificando] = useState<Despesa | null>(null)
  const [logs, setLogs] = useState<LogDespesa[]>([])
  const [verLogs, setVerLogs] = useState(false)
  const { log } = useAuditLog()

  const hoje = hojeISO()
  const mesAtual = hoje.slice(0, 7)
  const { de, ate } = useMemo(() => intervaloDoPreset(preset, hoje), [preset, hoje])
  const meses = useMemo(() => mesesDoIntervalo(de, ate), [de, ate])

  const carregar = useCallback(async (primeira: boolean) => {
    if (primeira) setCarregando(true); else setRecarregando(true)
    setErro('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const despesas = await supabase.from('finan_pagar').select(COLUNAS)
      .eq('status', 'concluido')
      .gte('data_vencimento', de).lte('data_vencimento', ate)
      .order('data_vencimento', { ascending: false })
      .range(0, TETO - 1)

    if (despesas.error) {
      setErro(despesas.error.message)
      setRows([]); setCarregando(false); setRecarregando(false)
      return
    }
    const lista = (despesas.data || []) as unknown as DespesaRow[]
    setRows(lista)

    // `omie_cache` e `contas_pagar` respondem 0 linhas pra chave do navegador —
    // a permissão delas é de servidor. Por isso essa parte vem por rota, e não
    // por query direta: sem ela o chip da categoria mostrava o código cru.
    try {
      const lancamentos = [...new Set(lista.flatMap((r) => codigosLancamento(r)))].join(',')
      const res = await fetch(`/api/financeiro/despesas/omie?lancamentos=${lancamentos}`, {
        headers: await authHeaders(),
      })
      if (res.ok) {
        const json = await res.json()
        setCache((json.categorias || []) as OpcaoCategoria[])
        setTitulos((json.titulos || []) as TituloOmie[])
      }
    } catch { /* a tela funciona sem isso: cai no código da categoria */ }

    await carregarLogs()
    setCarregando(false)
    setRecarregando(false)
  }, [router, de, ate])

  // histórico das alterações feitas por esta tela (vem por rota: o RLS do
  // audit_log não deixa o navegador ler, e um histórico vazio por bloqueio
  // seria indistinguível de "nada foi alterado")
  const carregarLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/financeiro/despesas/logs', { headers: await authHeaders() })
      if (res.ok) setLogs(((await res.json()).logs || []) as LogDespesa[])
    } catch { /* histórico é acessório — não derruba a tela */ }
  }, [])

  useEffect(() => { carregar(rows.length === 0) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [carregar])

  // ── derivados ─────────────────────────────────────────────────────────────
  const dicionario = useMemo(() => montarDicionario(cache), [cache])
  const porLancamento = useMemo(() => indexarTitulos(titulos), [titulos])
  const doPeriodo = useMemo(
    () => rows.map((r) => enriquecer(r, dicionario, porLancamento)),
    [rows, dicionario, porLancamento],
  )

  // mapa de cores sobre TODAS as categorias do período (não só as visíveis):
  // é o que impede as cores de se remexerem quando um filtro entra
  const cores = useMemo(() => mapaDeCores(doPeriodo.map((d) => d.categoria)), [doPeriodo])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return doPeriodo.filter((d) => {
      if (chips.mes && String(d.data_vencimento).slice(0, 7) !== chips.mes) return false
      if (chips.categoria && d.categoria !== chips.categoria) return false
      if (chips.fornecedor && d.fornecedorChave !== chips.fornecedor) return false
      if (chips.foraOmie && d.situacaoOmie === 'enviado') return false
      if (!q) return true
      return [
        d.fornecedorRotulo, d.numero_NF, d.categoria, d.metodo, d.motivo,
        d.data_vencimento, formatarDataBR(d.data_vencimento), d.valorNum, `#${d.id}`, d.id,
      ].some((v) => v != null && String(v).toLowerCase().includes(q))
    })
  }, [doPeriodo, busca, chips])

  const resumo = useMemo(() => resumir(filtradas, meses), [filtradas, meses])
  const serie = useMemo(() => serieMensal(filtradas, meses, mesAtual), [filtradas, meses, mesAtual])
  const porCategoria = useMemo(() => rankingCategorias(filtradas), [filtradas])
  const porFornecedor = useMemo(() => rankingFornecedores(filtradas), [filtradas])
  const arvore = useMemo(() => montarArvore(filtradas), [filtradas])
  const logsPorDespesa = useMemo(() => {
    const m = new Map<string, LogDespesa[]>()
    for (const l of logs) {
      const k = String(l.entidade_id || '')
      const lista = m.get(k)
      if (lista) lista.push(l); else m.set(k, [l])
    }
    return m
  }, [logs])

  const rotuloChips: [string, string, () => void][] = []
  if (chips.mes) rotuloChips.push(['Mês', chips.mes, () => setChips((c) => ({ ...c, mes: undefined }))])
  if (chips.categoria) rotuloChips.push(['Categoria', chips.categoria, () => setChips((c) => ({ ...c, categoria: undefined }))])
  if (chips.fornecedor) {
    const nome = porFornecedor.find((f) => f.chave === chips.fornecedor)?.rotulo || chips.fornecedor
    rotuloChips.push(['Fornecedor', nome, () => setChips((c) => ({ ...c, fornecedor: undefined }))])
  }
  if (chips.foraOmie) rotuloChips.push(['Situação', 'Fora do Omie', () => setChips((c) => ({ ...c, foraOmie: undefined }))])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--portal-bg)' }}>
      <FinanceiroNav />

      <main style={{ padding: 'clamp(12px, 4vw, 24px) clamp(12px, 4vw, 32px)', maxWidth: 1440, margin: '0 auto' }}>
        {/* controle: busca inteligente + período + chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
          <BuscaInteligente valor={busca} onChange={setBusca} achados={filtradas.length} />
          <div style={{ display: 'flex', gap: 4, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 3 }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                style={{
                  padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, font: 'inherit', fontFamily: 'inherit',
                  background: preset === p.id ? 'var(--portal-bg-card)' : 'transparent',
                  color: preset === p.id ? 'var(--portal-text)' : 'var(--portal-text-muted)',
                  boxShadow: preset === p.id ? '0 1px 3px var(--portal-shadow)' : 'none',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setVerLogs(true)}
              title="Ver o que foi alterado por esta tela"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px',
                borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700,
                border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
              }}
            >
              <History size={15} /> Alterações ({logs.length})
            </button>
          )}
        </div>

        {rotuloChips.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {rotuloChips.map(([tipo, valor, remover]) => (
              <button
                key={tipo + valor}
                onClick={remover}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  borderRadius: 20, fontSize: 12, font: 'inherit', cursor: 'pointer',
                  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
                }}
              >
                <span style={{ color: 'var(--portal-text-muted)' }}>{tipo}:</span>
                <strong style={{ fontWeight: 700 }}>{valor}</strong>
                <X size={13} />
              </button>
            ))}
          </div>
        )}

        {erro && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, marginBottom: 16,
            background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: '#b91c1c', fontSize: 13,
          }}>
            <AlertTriangle size={18} />
            <span style={{ flex: 1 }}>Não deu para carregar as despesas: {erro}</span>
            <button onClick={() => carregar(true)} style={{ border: 'none', background: '#b91c1c', color: '#fff', padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Tentar de novo
            </button>
          </div>
        )}

        {rows.length >= TETO && (
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 12.5, background: 'rgba(217,119,6,.1)', border: '1px solid rgba(217,119,6,.3)', color: '#b45309' }}>
            O período tem mais de {TETO} despesas e a tela carregou só as mais recentes. Escolha um período menor para os números fecharem.
          </div>
        )}

        {carregando ? (
          <Esqueleto />
        ) : (
          <div style={{ opacity: recarregando ? .55 : 1, pointerEvents: recarregando ? 'none' : 'auto', transition: 'opacity .15s' }}>
            <ResumoPeriodo
              resumo={resumo}
              intervalo={rotuloIntervalo(de, ate)}
              meses={meses.length}
              onVerForaDoOmie={() => setChips((c) => ({ ...c, foraOmie: true }))}
            />

            <EvolucaoMensalChart
              dados={serie}
              media={resumo.mediaMensal}
              mesAtivo={chips.mes}
              onSelecionarMes={(mes) => setChips((c) => ({ ...c, mes: c.mes === mes ? undefined : mes }))}
            />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <RankingBarras
                titulo="Maiores gastos por categoria"
                dados={porCategoria}
                colorir="identidade"
                mapaCores={cores}
                ativo={chips.categoria}
                onSelecionar={(_, rotulo) => setChips((c) => ({ ...c, categoria: c.categoria === rotulo ? undefined : rotulo }))}
                rodape={resumo.semCategoria.qtd > 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {resumo.semCategoria.qtd} despesa{resumo.semCategoria.qtd === 1 ? '' : 's'} sem categoria — clique em
                    {' '}<strong>Classificar</strong> na linha para escolher. Isso corrige o relatório do portal, não o Omie.
                  </p>
                )}
              />
              <RankingBarras
                titulo="Maiores gastos por fornecedor"
                dados={porFornecedor}
                colorir="serie"
                ativo={chips.fornecedor}
                onSelecionar={(chave) => setChips((c) => ({ ...c, fornecedor: c.fornecedor === chave ? undefined : chave }))}
              />
            </div>

            {arvore.length === 0 ? (
              <Vazio comFiltro={!!busca.trim() || rotuloChips.length > 0} onLimpar={() => { setBusca(''); setChips({}) }} intervalo={rotuloIntervalo(de, ate)} />
            ) : (
              <ListaDespesas
                arvore={arvore}
                mesAtual={mesAtual}
                abertos={abertos}
                onAlternarMes={(mes) => setAbertos((a) => ({ ...a, [mes]: !(a[mes] ?? (mes === mesAtual)) }))}
                mapaCores={cores}
                logsPorDespesa={logsPorDespesa}
                onClassificar={setClassificando}
                onFiltrarCategoria={(categoria) => setChips((c) => ({ ...c, categoria: c.categoria === categoria ? undefined : categoria }))}
              />
            )}
          </div>
        )}
      </main>

      {verLogs && <ModalLogs logs={logs} carregando={false} onFechar={() => setVerLogs(false)} />}

      {classificando && (
        <SeletorCategoria
          despesaId={classificando.id}
          empresa={classificando.omie_empresa}
          opcoes={cache}
          codigoAtual={classificando.omie_categoria}
          jaNoOmie={classificando.situacaoOmie === 'enviado'}
          onFechar={() => setClassificando(null)}
          onGravado={async (codigo) => {
            const alvo = classificando
            setRows((rs) => rs.map((r) => (r.id === alvo.id ? { ...r, omie_categoria: codigo } : r)))
            setClassificando(null)
            // registra QUEM mudou O QUÊ: guarda código e nome dos dois lados —
            // o nome é o que a pessoa entende hoje, o código é o que ainda
            // identifica a categoria se ela for renomeada no Omie amanhã
            const nomeDe = cache.find((o) => o.codigo === alvo.omie_categoria)?.descricao || null
            const nomePara = cache.find((o) => o.codigo === codigo)?.descricao || codigo
            await log({
              sistema: 'financeiro',
              acao: 'editar',
              entidade: 'finan_pagar',
              entidade_id: String(alvo.id),
              entidade_label: `Despesa #${alvo.id} — ${alvo.fornecedorRotulo}`,
              detalhes: detalhesCategoria({
                campo: 'omie_categoria',
                de: alvo.omie_categoria, deNome: nomeDe,
                para: codigo, paraNome: nomePara,
              }),
            })
            carregarLogs()
          }}
        />
      )}
    </div>
  )
}

function Esqueleto() {
  const bloco = (h: number) => (
    <div style={{ height: h, borderRadius: 16, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', marginBottom: 16 }} />
  )
  return (
    <div aria-busy="true">
      {bloco(150)}
      {bloco(300)}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', height: 280, borderRadius: 16, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }} />
        <div style={{ flex: '1 1 320px', height: 280, borderRadius: 16, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }} />
      </div>
    </div>
  )
}

function Vazio({ comFiltro, onLimpar, intervalo }: { comFiltro: boolean; onLimpar: () => void; intervalo: string }) {
  return (
    <div style={{
      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16,
      padding: '64px 24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 15, color: 'var(--portal-text-secondary)', margin: 0 }}>
        {comFiltro ? 'Nenhuma despesa com esses filtros.' : `Nenhuma despesa concluída em ${intervalo}.`}
      </p>
      {comFiltro && (
        <button onClick={onLimpar} style={{ marginTop: 14, padding: '9px 18px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Limpar filtros
        </button>
      )}
    </div>
  )
}
