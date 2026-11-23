'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'
import UsoAba from '@/components/atividades/UsoAba'
import PadroesAba from '@/components/atividades/PadroesAba'
import AlertasAba from '@/components/atividades/AlertasAba'
import { podeVerAlertas } from '@/lib/vigia-atividade/regras'
import ProcessosAba from '@/components/atividades/ProcessosAba'
import s from './atividades.module.css'
import {
  Activity, Search, Filter, ChevronDown, ChevronLeft, ChevronRight,
  Clock, User, Settings, ClipboardList, Wrench, DollarSign, Shield, FileText, Tags, BarChart3, Puzzle, Package, Workflow, ShieldAlert
} from 'lucide-react'

interface AuditEntry {
  id: number
  user_id: string
  user_nome: string
  sistema: string
  acao: string
  entidade: string | null
  entidade_id: string | null
  entidade_label: string | null
  detalhes: Record<string, unknown>
  created_at: string
}

const SISTEMAS = [
  { value: '', label: 'Todos os sistemas' },
  { value: 'revisoes', label: 'Controle de Revisões' },
  { value: 'requisicoes', label: 'Requisições' },
  { value: 'pos', label: 'Pós-Vendas (OS)' },
  { value: 'ppv', label: 'Peças (Pedido de Venda)' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'propostas', label: 'Proposta Comercial' },
  { value: 'vendas-modelo', label: 'Vendas por Modelo' },
  { value: 'ajustes', label: 'Ajustes (estoque)' },
  { value: 'recebimentos', label: 'Recebimentos (NF de entrada)' },
]

const SISTEMA_ICONS: Record<string, React.ReactNode> = {
  'vendas-modelo': <Tags size={16} />,
  ajustes: <Package size={16} />,
  recebimentos: <Package size={16} />,
  revisoes: <Wrench size={16} />,
  requisicoes: <ClipboardList size={16} />,
  pos: <Settings size={16} />,
  ppv: <Shield size={16} />,
  financeiro: <DollarSign size={16} />,
  propostas: <FileText size={16} />,
}

const ACAO_COLORS: Record<string, { bg: string; text: string }> = {
  criar: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  editar: { bg: 'bg-blue-50', text: 'text-blue-700' },
  deletar: { bg: 'bg-red-50', text: 'text-red-700' },
  visualizar: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  enviar_email: { bg: 'bg-purple-50', text: 'text-purple-700' },
  mover_status: { bg: 'bg-amber-50', text: 'text-amber-700' },
  upload: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  acesso: { bg: 'bg-zinc-100', text: 'text-zinc-500' },
  enviar_omie: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  adicionar_item: { bg: 'bg-teal-50', text: 'text-teal-700' },
  devolver: { bg: 'bg-orange-50', text: 'text-orange-700' },
  // Vendas por Modelo (uso da tela analítica)
  filtrar: { bg: 'bg-sky-50', text: 'text-sky-700' },
  detalhe: { bg: 'bg-blue-50', text: 'text-blue-700' },
  ver_cmc: { bg: 'bg-amber-50', text: 'text-amber-700' },
  exportar_pdf: { bg: 'bg-rose-50', text: 'text-rose-700' },
  exportar_relatorio_notas: { bg: 'bg-rose-50', text: 'text-rose-700' },
  sincronizar: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  // Ajustes (estoque)
  'ajuste-estoque': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'corrigir-estoque-negativo': { bg: 'bg-amber-50', text: 'text-amber-700' },
  // Recebimentos
  reverter_recebimento: { bg: 'bg-red-50', text: 'text-red-700' },
  reverter_recebimento_recusado: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

const PAGE_SIZE = 30

const fmtQtd = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
const fmtReais = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Texto da coluna Detalhes. Ajuste de estoque vira "antes → depois" por produto;
// o resto segue chave: valor, sem nulos e sem [object Object].
function textoDetalhes(entry: AuditEntry): string {
  const d = entry.detalhes || {}
  if (entry.acao === 'ajuste-estoque' && Array.isArray(d.itens)) {
    const itens = (d.itens as Record<string, unknown>[]).map((it) => {
      const partes = [`${it.conta}`]
      if (Number(it.qtdAntes) !== Number(it.qtdDepois)) partes.push(`qtd ${fmtQtd(it.qtdAntes)} → ${fmtQtd(it.qtdDepois)}`)
      if (Math.abs(Number(it.cmcAntes) - Number(it.cmcDepois)) > 1e-6) partes.push(`custo ${fmtReais(it.cmcAntes)} → ${fmtReais(it.cmcDepois)}`)
      return partes.join(' ')
    })
    const status = d.status === 'aplicado' ? '' : ` · Status: ${d.status}`
    return `${itens.join(' | ')} · Motivo: ${d.motivo ?? '—'}${status}`
  }
  // posição/tamanho de um bloco no mapa (Opa, Planta): frase no lugar de "h: 12 · w: 7.7 · x: 40.2 · y: 83.6"
  // (auditoria 06/11/2026: dados técnicos crus para o usuário)
  const COORD = ['x', 'y', 'w', 'h', 'largura', 'altura']
  const temPos = 'x' in d || 'y' in d, temTam = 'w' in d || 'h' in d || 'largura' in d || 'altura' in d
  const frases: string[] = []
  if (temPos || temTam) {
    const andar = d.andar != null && d.andar !== '' ? ` (andar ${ANDAR[String(d.andar)] ?? String(d.andar)})` : ''
    frases.push(`Mudou ${temPos && temTam ? 'a posição e o tamanho' : temPos ? 'a posição' : 'o tamanho'} no mapa${andar}`)
  }
  const partes = Object.entries(d)
    .filter(([k, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && !((temPos || temTam) && (COORD.includes(k) || k === 'andar')))
    .map(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${ROTULO_CHAVE[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}: ${val}`
    })
  const tudo = [...frases, ...partes]
  return tudo.length ? tudo.join(' · ') : '—'
}

const ANDAR: Record<string, string> = { t: 'térreo', terreo: 'térreo', '1': '1º', '2': '2º', s: 'superior', m: 'mezanino' }
const ROTULO_CHAVE: Record<string, string> = {
  campo: 'Campo', de: 'De', para: 'Para', status: 'Status', tipo: 'Tipo', codigo: 'Código', quantidade: 'Quantidade',
  qtd: 'Quantidade', descricao: 'Descrição', nome: 'Nome', motivo: 'Motivo', obs: 'Observação', observacao: 'Observação',
  valor: 'Valor', setor: 'Setor', local: 'Local', cor: 'Cor', forma: 'Forma', cliente: 'Cliente', os: 'OS', numero: 'Número',
  codigo_produto: 'Cód. Omie', caracteristica: 'Característica', empresa: 'Empresa', conta: 'Conta', usuario: 'Usuário', familia: 'Família',
}

function AtividadesPageInner() {
  const { userProfile } = useAuth()
  const searchParams = useSearchParams()
  // Aba: 'atividades' (audit_log) | 'uso' (monitor de uso) | 'padroes' (onde o usuário monta quebra-cabeça)
  // | 'processos' (fluxograma real das OS). Deep-link ?tab=uso|padroes|processos
  const tabInicial = searchParams.get('tab')
  const [aba, setAba] = useState<'atividades' | 'uso' | 'padroes' | 'processos' | 'alertas'>(tabInicial === 'uso' || tabInicial === 'padroes' || tabInicial === 'processos' || tabInicial === 'alertas' ? tabInicial : 'atividades')
  // Aba Alertas (vigia de atividade suspeita): só quem recebe o aviso e os Devs
  const { isDev } = usePermissoes(userProfile?.id)
  const verAlertas = !!userProfile?.id && podeVerAlertas({ userId: userProfile.id, isDev })
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Filtros
  const [filtroSistema, setFiltroSistema] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroEntidade, setFiltroEntidade] = useState('')
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtroDe, setFiltroDe] = useState('')
  const [filtroAte, setFiltroAte] = useState('')

  // Usuários únicos para o filtro
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    const fetchUsuarios = async () => {
      // Busca da tabela de usuários diretamente em vez de scan da audit_log inteira
      const { data } = await supabase
        .from('financeiro_usu')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      if (data) {
        setUsuarios(data.map(d => ({ id: d.id, nome: d.nome })))
      }
    }
    fetchUsuarios()
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroSistema) query = query.eq('sistema', filtroSistema)
    if (filtroUsuario) query = query.eq('user_id', filtroUsuario)
    if (filtroDe) query = query.gte('created_at', filtroDe + 'T00:00:00-03:00')
    if (filtroAte) query = query.lte('created_at', filtroAte + 'T23:59:59-03:00')
    if (filtroEntidade) {
      const safeEntidade = filtroEntidade.replace(/%/g, '\\%')
      query = query.ilike('entidade_label', `%${safeEntidade}%`)
    }
    if (filtroBusca) {
      const safeBusca = filtroBusca.replace(/%/g, '\\%').replace(/,/g, '')
      query = query.or(`entidade_label.ilike.%${safeBusca}%,acao.ilike.%${safeBusca}%,entidade_id.ilike.%${safeBusca}%`)
    }

    const { data, count } = await query
    if (data) setLogs(data)
    if (count !== null) setTotalCount(count)
    setLoading(false)
  }, [page, filtroSistema, filtroUsuario, filtroEntidade, filtroBusca, filtroDe, filtroAte])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Reset page quando muda filtro
  useEffect(() => { setPage(0) }, [filtroSistema, filtroUsuario, filtroEntidade, filtroBusca, filtroDe, filtroAte])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMs / 3600000)

    if (diffMin < 1) return 'Agora'
    if (diffMin < 60) return `${diffMin}min atrás`
    if (diffH < 24) return `${diffH}h atrás`

    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const acaoLabel = (acao: string) => {
    const map: Record<string, string> = {
      criar: 'Criou',
      editar: 'Editou',
      deletar: 'Deletou',
      visualizar: 'Visualizou',
      enviar_email: 'Enviou email',
      mover_status: 'Moveu status',
      upload: 'Fez upload',
      acesso: 'Acessou',
      enviar_omie: 'Enviou para Omie',
      adicionar_item: 'Adicionou item',
      devolver: 'Devolveu item',
      filtrar: 'Filtrou',
      detalhe: 'Abriu detalhe',
      ver_cmc: 'Viu CMC',
      exportar_pdf: 'Baixou PDF',
      exportar_relatorio_notas: 'Exportou relatório de notas',
      sincronizar: 'Sincronizou',
      'ajuste-estoque': 'Ajustou estoque',
      'corrigir-estoque-negativo': 'Corrigiu estoque negativo',
      reverter_recebimento: 'Reverteu recebimento (reabriu a NF)',
      reverter_recebimento_recusado: 'Tentou reverter recebimento (Omie recusou)',
    }
    return map[acao] || acao
  }

  const sistemaLabel = (key: string) => {
    return SISTEMAS.find(s => s.value === key)?.label || key
  }

  return (
    <div className={s.root}>
      {/* Cabeçalho */}
      <div className={s.cabecalho}>
        <div>
          <h2 className={s.titulo}>Atividades</h2>
          <p className={s.subtitulo}>Histórico de ações dos usuários nos sistemas</p>
        </div>
        <div className={s.contador}>
          <Activity size={16} />
          {totalCount} registros
        </div>
      </div>

      {/* Abas */}
      <div className={s.abas}>
        {([['atividades', 'Atividades', <Activity key="a" size={14} />], ['uso', 'Uso do portal', <BarChart3 key="u" size={14} />], ['padroes', 'Padrões', <Puzzle key="p" size={14} />], ['processos', 'Processos', <Workflow key="f" size={14} />], ...(verAlertas ? [['alertas', 'Alertas', <ShieldAlert key="al" size={14} />]] as const : [])] as const).map(([k, label, icon]) => (
          <button key={k} onClick={() => setAba(k)} className={`${s.aba} ${aba === k ? s.ativa : ''}`}>{icon}{label}</button>
        ))}
      </div>

      {aba === 'uso' && <UsoAba usuarios={usuarios} />}
      {aba === 'padroes' && <PadroesAba usuarios={usuarios} />}
      {aba === 'processos' && <ProcessosAba />}
      {aba === 'alertas' && verAlertas && <AlertasAba />}

      {aba === 'atividades' && (<>
      {/* Filtros */}
      <div className={`${s.cartao} ${s.filtros}`}>
        <div className={s.filtrosLinha}>
          <div className={s.busca}>
            <Search size={14} className={s.buscaIcone} />
            <input
              type="text"
              placeholder="Buscar por card, ID, ação..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className={`${s.campo} ${s.campoLargo} ${s.buscaCampo}`}
            />
          </div>

          <select value={filtroSistema} onChange={(e) => setFiltroSistema(e.target.value)} className={`${s.campo} ${s.select}`}>
            {SISTEMAS.map(si => (
              <option key={si.value} value={si.value}>{si.label}</option>
            ))}
          </select>

          <button onClick={() => setShowFiltros(!showFiltros)} className={`${s.botaoFiltros} ${showFiltros ? s.aberto : ''}`}>
            <Filter size={14} />
            Filtros
            <ChevronDown size={12} className={s.seta} />
          </button>
        </div>

        {showFiltros && (
          <div className={s.filtrosMais}>
            <div className={s.filtroItem}>
              <label className={s.rotulo}>USUÁRIO</label>
              <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className={`${s.campo} ${s.campoLargo}`}>
                <option value="">Todos os usuários</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>

            <div className={s.filtroItem}>
              <label className={s.rotulo}>CARD / ENTIDADE</label>
              <input
                type="text"
                placeholder="Ex: Requisição #45, Trator MF8737..."
                value={filtroEntidade}
                onChange={(e) => setFiltroEntidade(e.target.value)}
                className={`${s.campo} ${s.campoLargo}`}
              />
            </div>

            <div>
              <label className={s.rotulo}>PERÍODO</label>
              <div className={s.periodo}>
                <input type="date" value={filtroDe} max={filtroAte || undefined} onChange={(e) => setFiltroDe(e.target.value)} className={`${s.campo} ${s.campoData}`} />
                <span className={s.ate}>até</span>
                <input type="date" value={filtroAte} min={filtroDe || undefined} onChange={(e) => setFiltroAte(e.target.value)} className={`${s.campo} ${s.campoData}`} />
                {(filtroDe || filtroAte) && (
                  <button onClick={() => { setFiltroDe(''); setFiltroAte('') }} className={s.limpar}>limpar</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabela de registros */}
      <div className={`${s.cartao} ${s.tabela}`}>
        <div className={s.largura}>
        <div className={s.cab}>
          {['Usuário', 'Sistema', 'Ação', 'Entidade', 'Detalhes', 'Quando'].map(h => <span key={h}>{h}</span>)}
        </div>

        {loading && (
          <div className={s.vazio}><p className={s.carregando}>Carregando...</p></div>
        )}

        {!loading && logs.length === 0 && (
          <div className={s.vazio}>
            <Activity size={32} className={s.vazioIcone} />
            <p className={s.vazioTitulo}>Nenhuma atividade encontrada</p>
            <p className={s.vazioTexto}>As ações dos usuários aparecerão aqui</p>
          </div>
        )}

        {!loading && logs.map((entry) => {
          const acaoStyle = ACAO_COLORS[entry.acao] || ACAO_COLORS.acesso
          const detalhesStr = textoDetalhes(entry)

          return (
            <div key={entry.id} className={s.linha}>
              {/* Usuário */}
              <div className={s.usuario}>
                <div className={s.avatar}><User size={13} color="#fff" /></div>
                <span className={s.usuarioNome}>{entry.user_nome?.split(' ')[0] || 'Usuário'}</span>
              </div>

              {/* Sistema */}
              <div className={s.sistema}>
                <span className={s.sistemaIcone}>{SISTEMA_ICONS[entry.sistema] || <Activity size={16} />}</span>
                <span className={s.sistemaNome}>{sistemaLabel(entry.sistema)}</span>
              </div>

              {/* Ação */}
              <span className={`${s.acao} ${acaoStyle.bg} ${acaoStyle.text}`}>{acaoLabel(entry.acao)}</span>

              {/* Entidade */}
              <div>
                {entry.entidade_label
                  ? <p className={s.entidade}>{entry.entidade_label}</p>
                  : <p className={s.entidadeVazia}>—</p>}
                {entry.entidade_id && <p className={s.entidadeId}>ID: {entry.entidade_id}</p>}
              </div>

              {/* Detalhes */}
              <p className={s.detalhes} title={detalhesStr}>{detalhesStr}</p>

              {/* Quando */}
              <div className={s.quando}>
                <Clock size={12} />
                <span>{formatDate(entry.created_at)}</span>
              </div>
            </div>
          )
        })}
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className={s.paginacao}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className={s.pagBotao}>
            <ChevronLeft size={14} /> Anterior
          </button>
          <span className={s.pagTexto}>Página {page + 1} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className={s.pagBotao}>
            Próxima <ChevronRight size={14} />
          </button>
        </div>
      )}
      </>)}
    </div>
  )
}

export default function AtividadesPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('atividades')) return <SemPermissao />;
  return <Suspense fallback={null}><AtividadesPageInner /></Suspense>;
}
