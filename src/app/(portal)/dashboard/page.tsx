'use client'
// DASHBOARD POR SETOR — José, 10/11/2026.
// Entrada: saudação + busca geral + favoritos + um cartão por setor (Comercial, Pós-Vendas, Peças,
// Financeiro, Adicionais). Clicou → entra no setor (?setor=x na URL; o "voltar" do navegador
// funciona) e vê os módulos em cartões com frase, busca só do setor e estrela de favoritar.
// Visual escolhido pelo José (testes de 10/11/2026): foto da fachada da loja na tela toda com véu escuro, topo do portal
// transparente por cima da foto, saudação + busca grande no meio, "Seus atalhos" em pílulas e os setores como
// cartões sólidos na cor de cada um; clicar abre o bloco do setor (módulos em ícones grandes). O setor da
// pessoa (Categoria no /admin) já começa aberto.
// SAÍRAM de propósito ("estão poluindo"): Minha semana, atalhos redondos da Agenda/Central,
// Faturamento ao vivo, pastas, modos de exibição, vitrine rotativa.
// Mesmo layout no celular (responsivo) — o DashboardMobile não é mais usado aqui.
// Lista de setores/módulos/permissões: src/lib/dashboard/setores.ts
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import { TELAS, buscarTelas, normalizar, relevancia, type Tela } from '@/lib/dashboard/telas'
import { NAV_HREF_POR_ID } from '@/components/PortalLayout'
import { DOCA_ID } from '@/components/dashboard/AtalhosDashboard'
import { SETORES, SUBS_ADICIONAIS, MODULOS, corDoSetor, type ModuloDash, type SetorKey } from '@/lib/dashboard/setores'
import { Search, Star, ArrowLeft, ChevronRight, RefreshCw, Database, X, Check, Building2, ExternalLink } from 'lucide-react'

const rotulo: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ds-rotulo)', marginBottom: 8 }

// nota de busca: nome novo, nome antigo (quem decorou "PPV" ou "Lousa" continua achando) e a frase
const notaBusca = (m: ModuloDash, q: string) => Math.min(
  relevancia(m.nome, q) ?? Infinity,
  relevancia(m.nomeAntigo ?? '', q) ?? Infinity,
  normalizar(m.frase).includes(q) ? 50 : Infinity,
)

// Vidro fosco (cartões e cabeçalho do setor)
// Cores do vidro/fundo em variáveis (--ds-*) para o tema escuro trocar tudo de uma vez (ver <style> da página).
const VIDRO: React.CSSProperties = {
  background: 'var(--ds-vidro)', backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)',
  border: '1px solid var(--ds-vidro-borda)', boxShadow: 'var(--ds-vidro-sombra)',
}
/** Vidro com um toque da cor do setor — minimalista (José: "mais minimalista e profissional"):
 *  só um reflexo bem leve no canto; borda e sombra neutras (a cor aparece no hover, no ícone e no traço). */
const vidroDaCor = (cor: string, forte = true): React.CSSProperties => forte
  ? { ...VIDRO, background: `linear-gradient(155deg, ${cor}10 0%, transparent 40%), var(--ds-vidro)` }
  : VIDRO

// Fotos reais da Nova Tratores (vindas do site) — public/dashboard/
// Foto da fachada da loja (a mesma do site) na tela toda — escolhida pelo José em 10/11/2026
const FOTO_FUNDO = { url: '/dashboard/fachada-loja.jpg', pos: 'center 30%' }
const SETOR_DA_CATEGORIA: Record<string, SetorKey> = { 'Comercial': 'comercial', 'Pós Vendas': 'posvendas', 'Peças': 'pecas', 'Financeiro': 'financeiro' }

export default function DashboardPage() {
  const { userProfile, router } = useAuth()
  const isMobile = useIsMobile()
  const { permissoes, isAdmin, isDev, temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  // Diretor (portal_permissoes.is_diretor) ou admin: ganha o botão da Visão da empresa (/empresa)
  const ehDiretor = isAdmin || isDev || (permissoes as unknown as { is_diretor?: boolean } | null)?.is_diretor === true
  // Só para a Pollyane (José, 12/11): sem os atalhos e, no lugar do botão da Visão da empresa, um botão grande e azul
  // para o Omie completo. Pelo e-mail do login (o perfil não traz o e-mail).
  const [emailLogin, setEmailLogin] = useState<string | null>(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmailLogin(data.user?.email?.toLowerCase() || null)).catch(() => {}) }, [])
  const soOmie = emailLogin === 'pollyane@novatratores.com.br'
  const { log: auditLog } = useAuditLog()

  const [busca, setBusca] = useState('')
  const [favoritos, setFavoritos] = useState<string[]>([])
  const [setorAberto, setSetorAberto] = useState<SetorKey | null>(null)
  const [buscaSetor, setBuscaSetor] = useState('')
  const entrouPorClique = useRef(false)

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (userProfile?.nome || '').trim().split(/\s+/)[0]

  // bloco do setor aberto na entrada (null = todos fechados)
  const [foco, setFoco] = useState<SetorKey | null>(null)

  const [showSync, setShowSync] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncStep, setSyncStep] = useState('')
  const [syncResults, setSyncResults] = useState<any>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSelection, setSyncSelection] = useState<{ clientes: boolean; projetos: boolean; produtos: boolean }>({
    clientes: true, projetos: true, produtos: true,
  })

  // Favoritos: mesma chave de antes (ninguém perde os que já marcou)
  useEffect(() => {
    if (!userProfile?.id) return
    try { const s = localStorage.getItem(`portal-favoritos-${userProfile.id}`); if (s) setFavoritos(JSON.parse(s)) } catch { /* sem localStorage */ }
  }, [userProfile?.id])
  const toggleFav = (id: string) => setFavoritos(prev => {
    const novo = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    try { if (userProfile?.id) localStorage.setItem(`portal-favoritos-${userProfile.id}`, JSON.stringify(novo)) } catch { /* sem localStorage */ }
    return novo
  })

  // Setor aberto vive na URL (?setor=pecas): dá para voltar com o navegador e mandar o link
  useEffect(() => {
    const ler = () => {
      const k = new URLSearchParams(window.location.search).get('setor') as SetorKey | null
      setSetorAberto(k && SETORES.some(s => s.key === k) ? k : null)
      setBuscaSetor('')
    }
    ler()
    window.addEventListener('popstate', ler)
    return () => window.removeEventListener('popstate', ler)
  }, [])
  const entrarSetor = (k: SetorKey) => {
    setSetorAberto(k); setBuscaSetor('')
    entrouPorClique.current = true
    window.history.pushState(null, '', `?setor=${k}`)
    window.scrollTo({ top: 0 })
  }
  const trocarSetor = (k: SetorKey) => {
    setSetorAberto(k); setBuscaSetor('')
    window.history.replaceState(null, '', `?setor=${k}`)
    window.scrollTo({ top: 0 })
  }
  const voltarSetores = () => {
    if (entrouPorClique.current) { entrouPorClique.current = false; window.history.back(); return }
    setSetorAberto(null); setBuscaSetor('')
    window.history.replaceState(null, '', window.location.pathname)
  }

  const permitidos = useMemo(
    () => MODULOS.filter(m => !m.modulo || (m.acao ? pode(m.modulo, m.acao) : temAcesso(m.modulo))),
    [temAcesso, pode],
  )
  const setoresVisiveis = useMemo(() => SETORES.filter(s => permitidos.some(m => m.setor === s.key)), [permitidos])
  // Setor da pessoa (Categoria no /admin): o bloco dele já começa aberto; os outros ficam fechados.
  const meuSetor: SetorKey | null = useMemo(() => {
    const k = SETOR_DA_CATEGORIA[(permissoes?.categoria || '').trim()]
    return k && setoresVisiveis.some(s => s.key === k) ? k : null
  }, [permissoes?.categoria, setoresVisiveis])
  const focoIniciado = useRef(false)
  useEffect(() => {
    if (focoIniciado.current || loadingPerm || !permissoes) return
    focoIniciado.current = true
    if (meuSetor) setFoco(meuSetor)
  }, [loadingPerm, permissoes, meuSetor])
  const doSetor = (k: SetorKey) => permitidos.filter(m => m.setor === k)
  const favs = favoritos.map(id => permitidos.find(m => m.id === id)).filter((m): m is ModuloDash => !!m)
  // Seus atalhos: favoritos primeiro, depois os mais usados (contagem que o menu já guarda por visita)
  const [uso, setUso] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!userProfile?.id) return
    try { setUso(JSON.parse(localStorage.getItem(`portal-uso-${userProfile.id}`) || '{}')) } catch { /* sem localStorage */ }
  }, [userProfile?.id])
  const atalhos = useMemo(() => {
    const porHref = new Map(permitidos.map(m => [m.href, m]))
    const usados = Object.entries(uso).sort((a, b) => b[1] - a[1])
      .map(([id]) => porHref.get(NAV_HREF_POR_ID[id] || ''))
      .filter((m): m is ModuloDash => !!m)
    const lista: ModuloDash[] = []
    for (const m of [...favs, ...usados]) if (!lista.includes(m)) lista.push(m)
    return lista.slice(0, 6)
  }, [favs, uso, permitidos])

  const abrir = (m: ModuloDash) => {
    auditLog({ sistema: m.id.replace('sistema-', ''), acao: 'acesso', entidade_label: m.nome })
    if (m.externo) window.open(m.href, '_blank')
    else router.push(m.href)
  }

  // Busca geral: módulos + telas (sub-páginas e abas que a pessoa pode abrir)
  const q = normalizar(busca)
  const achados = useMemo(
    () => q ? permitidos.filter(m => notaBusca(m, q) !== Infinity).sort((a, b) => notaBusca(a, q) - notaBusca(b, q)) : [],
    [permitidos, q],
  )
  const telasPermitidas = useMemo(() => TELAS.filter(t =>
    !t.modulo || (t.acao ? pode(t.modulo, t.acao) : temAcesso(t.modulo))
  ), [temAcesso, pode])
  const telasEncontradas = useMemo(() => buscarTelas(telasPermitidas, busca), [telasPermitidas, busca])
  type Resultado = { chave: string; nome: string; onde: string; cor: string; icon: ModuloDash['icon']; abrir: () => void }
  const resultados: Resultado[] = useMemo(() => {
    const lista: Resultado[] = telasEncontradas.map(tela => {
      const mod = MODULOS.find(m => m.id === tela.sistema)
      return { chave: 't' + tela.href + tela.nome, nome: tela.nome, onde: mod?.nome ?? tela.area, cor: mod ? corDoSetor(mod.setor) : '#64748b', icon: mod?.icon ?? Search, abrir: () => abrirTela(tela) }
    })
    const temTela = new Set(telasEncontradas.map(t => t.sistema))
    for (const m of achados) if (!temTela.has(m.id)) {
      lista.push({ chave: 'm' + m.id, nome: m.nome, onde: SETORES.find(st => st.key === m.setor)?.nome ?? '', cor: corDoSetor(m.setor), icon: m.icon, abrir: () => abrir(m) })
    }
    return lista
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telasEncontradas, achados])
  const abrirTela = (tela: Tela) => {
    auditLog({ sistema: tela.sistema || 'dashboard', acao: 'acesso', entidade_label: tela.nome })
    router.push(tela.href)
  }

  // Busca dentro do setor
  const setorInfo = setorAberto ? SETORES.find(s => s.key === setorAberto) ?? null : null
  const qSetor = normalizar(buscaSetor)
  const modsSetor = setorAberto ? doSetor(setorAberto) : []
  const modsSetorFiltrados = qSetor
    ? modsSetor.filter(m => notaBusca(m, qSetor) !== Infinity).sort((a, b) => notaBusca(a, qSetor) - notaBusca(b, qSetor))
    : modsSetor

  const executarSync = async () => {
    // Monta apenas os steps selecionados, distribuindo o progresso igualmente
    const tiposEscolhidos = (['clientes', 'projetos', 'produtos'] as const).filter(t => syncSelection[t])
    if (tiposEscolhidos.length === 0) {
      setSyncError('Selecione pelo menos um item para sincronizar')
      return
    }

    setSyncRunning(true)
    setSyncProgress(0)
    setSyncResults(null)
    setSyncError('')
    const results: any = {}

    const fatia = 100 / tiposEscolhidos.length
    const steps = tiposEscolhidos.map((tipo, i) => ({
      tipo,
      label: `Sincronizando ${tipo}...`,
      peso: Math.round(fatia * (i + 1)),
      prev: Math.round(fatia * i),
    }))

    try {
      for (const step of steps) {
        setSyncStep(step.label)
        let current = step.prev
        const interval = setInterval(() => {
          current = Math.min(current + 1, step.peso - 2)
          setSyncProgress(current)
        }, 300)

        const res = await fetch(`/api/pos/sync?tipo=${step.tipo}`, {
          method: 'POST',
          headers: await authHeaders(),
        })
        clearInterval(interval)
        const data = await res.json()

        if (!data.sucesso) {
          setSyncError(data.erro || `Erro em ${step.tipo}`)
          setSyncProgress(step.peso)
          setSyncRunning(false)
          return
        }

        results[step.tipo] = data.resultado
        setSyncProgress(step.peso)
      }

      setSyncProgress(100)
      setSyncStep('Concluído!')
      setSyncResults(results)
    } catch (err: any) {
      setSyncError(err.message || 'Erro desconhecido')
    } finally {
      setSyncRunning(false)
    }
  }

  const cabecaSetor = (s: typeof SETORES[number], tamanho = 44) => {
    const Ic = s.icon
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ width: tamanho, height: tamanho, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${s.cor}, ${s.cor}b0)`, color: '#fff', boxShadow: `0 6px 14px ${s.cor}40` }}><Ic size={tamanho * 0.48} /></span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 750, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{s.nome}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.resumo}</span>
        </span>
      </span>
    )
  }

  const botaoAbrirSetor = (s: typeof SETORES[number]) => (
    <button onClick={() => entrarSetor(s.key)} className="ds-abrir"
      style={{ ['--cor' as string]: s.cor, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
      Abrir {s.nome} <ChevronRight size={15} />
    </button>
  )

  // estrela pequena (nos ícones grandes só aparece no hover, ou sempre se já é favorito)
  const estrela = (m: ModuloDash, tam = 15, extra: React.CSSProperties = {}) => { const fav = favoritos.includes(m.id); return (
    <button className={`ds-fav${fav ? '' : ' ds-fav-h'}`} aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar'} onClick={e => { e.stopPropagation(); toggleFav(m.id) }}
      style={{ width: tam + 15, height: tam + 15, flexShrink: 0, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', ...extra }}>
      <Star size={tam} fill={fav ? '#F59E0B' : 'none'} color={fav ? '#F59E0B' : '#cbd5e1'} />
    </button>
  ) }

  // ícone grande (lançador de apps): ícone em cima, nome embaixo
  const iconeModulo = (m: ModuloDash, i: number) => { const cor = corDoSetor(m.setor); const Ic = m.icon; return (
    <div key={m.id} className="ds-tile ds-entra" title={m.frase} style={{ position: 'relative', animationDelay: `${i * 25}ms`, ['--cor' as string]: cor }}>
      <button onClick={() => abrir(m)} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '16px 8px 12px', borderRadius: 16, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
        <span className="ds-ico" style={{ width: isMobile ? 50 : 58, height: isMobile ? 50 : 58, borderRadius: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${cor}, ${cor}b0)`, color: '#fff', boxShadow: `0 8px 18px ${cor}40` }}><Ic size={isMobile ? 23 : 26} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', lineHeight: 1.25 }}>{m.nome}</span>
      </button>
      {estrela(m, 14, { position: 'absolute', top: 4, right: 4 })}
    </div>
  ) }

  /** Módulos de um setor: ícones grandes (lançador de apps). */
  const blocoModulos = (itens: ModuloDash[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 96 : 128}px, 1fr))`, gap: 4 }}>{itens.map((m, i) => iconeModulo(m, i))}</div>
  )

  // ── topo no meio da tela: saudação + busca grande
  const topoCentro = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: isMobile ? '10px 0 20px' : '34px 0 28px' }}>
      <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 800, color: '#fff', letterSpacing: -.8, textShadow: '0 2px 18px rgba(0,0,0,.35)' }}>{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}</div>
      <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.88)', marginTop: 4, textShadow: '0 1px 10px rgba(0,0,0,.35)' }}>O que você quer abrir hoje?</div>
      <div style={{ position: 'relative', width: 'min(680px, 100%)', marginTop: 20 }}>
        <Search size={18} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1, pointerEvents: 'none' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar tela em todos os setores…" aria-label="Procurar tela ou módulo"
          onKeyDown={e => {
            if (e.key === 'Enter' && resultados[0]) resultados[0].abrir()
            if (e.key === 'Escape') setBusca('')
          }}
          style={{ ...VIDRO, background: 'var(--portal-bg-card)', border: '1px solid transparent', boxShadow: '0 12px 36px rgba(0,0,0,.22)', width: '100%', padding: '16px 18px 16px 48px', borderRadius: 16, fontSize: 15.5, outline: 'none', fontFamily: 'inherit', color: 'var(--portal-text)' }} />
      </div>
      {soOmie ? (
        <a href="https://app.omie.com.br/" target="_blank" rel="noreferrer"
          style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 14, padding: isMobile ? '18px 26px' : '22px 40px', borderRadius: 18, textDecoration: 'none', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontSize: isMobile ? 20 : 26, fontWeight: 800, letterSpacing: -.3, boxShadow: '0 16px 40px rgba(37,99,235,.45)' }}>
          <Database size={isMobile ? 24 : 30} /> Sistema Omie Completo <ExternalLink size={isMobile ? 18 : 22} />
        </a>
      ) : ehDiretor && (
        <button onClick={() => router.push('/empresa')} className='ds-empresa'
          style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff', fontSize: 14.5, fontWeight: 700, boxShadow: '0 10px 26px rgba(220,38,38,.35)' }}>
          <Building2 size={17} /> Visão da empresa <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
  // faixa "Seus atalhos": 1 clique até o que a pessoa mais usa
  const blocoAtalhos = () => !soOmie && !q && atalhos.length > 0 && (
    <div style={{ marginBottom: isMobile ? 18 : 30, marginTop: isMobile ? -6 : -10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {atalhos.map((m, i) => { const Ic = m.icon; const cor = corDoSetor(m.setor); const fav = favoritos.includes(m.id); return (
          <button key={m.id} onClick={() => abrir(m)} className="ds-chip ds-entra ds-card" title={m.frase}
            style={{ ...VIDRO, ['--cor' as string]: cor, animationDelay: `${i * 35}ms`, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${cor}, ${cor}b0)`, color: '#fff' }}><Ic size={14} /></span>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{m.nome}</span>
            {fav && <Star size={12} fill="#F59E0B" color="#F59E0B" />}
          </button>
        ) })}
      </div>
    </div>
  )
  const layoutCentro = () => {
    const aberto = foco && setoresVisiveis.some(s => s.key === foco) ? SETORES.find(s => s.key === foco) ?? null : null
    return (
    <div>
      {blocoAtalhos()}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : `repeat(${setoresVisiveis.length}, minmax(0, 1fr))`, gap: isMobile ? 10 : 14, marginBottom: 16 }}>
        {setoresVisiveis.map(s => { const ativo = s.key === aberto?.key; const Ic = s.icon; const prev = doSetor(s.key).slice(0, 3).map(m => m.nome).join(', '); const meu = s.key === meuSetor; return (
          <button key={s.key} onClick={() => setFoco(ativo ? null : s.key)} aria-expanded={ativo}
            className={`ds-item-setor ds-setor-grande ds-card ds-card-setor${ativo ? ' ds-ativo' : ''}`}
            style={{ ...(ativo ? { ...vidroDaCor(s.cor), border: `1.5px solid ${s.cor}` } : VIDRO), ['--cor' as string]: s.cor, position: 'relative', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14,
              padding: isMobile ? '14px 12px' : '20px 18px', minHeight: isMobile ? 76 : 96, borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span className="ds-ico" style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${s.cor}, ${s.cor}b0)`, color: '#fff', boxShadow: `0 6px 16px ${s.cor}45` }}><Ic size={isMobile ? 20 : 24} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="ds-nome" style={{ display: 'block', fontSize: isMobile ? 15.5 : 18, fontWeight: 750, color: ativo ? s.cor : 'var(--portal-text)', letterSpacing: -.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nome}</span>
              {!isMobile && <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12.5, lineHeight: 1.4, color: 'var(--portal-text-secondary)', marginTop: 4 }}>{prev}</span>}
            </span>
            {meu && <span className="ds-selo" style={{ position: 'absolute', top: 8, right: 10, fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: s.cor, background: `${s.cor}18`, padding: '2px 7px', borderRadius: 20 }}>Seu setor</span>}
          </button>
        ) })}
      </div>
      {aberto && (
        <div key={aberto.key} className="ds-entra ds-card ds-card-painel" style={{ ...VIDRO, borderRadius: 20, padding: isMobile ? 14 : 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {cabecaSetor(aberto)}
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {botaoAbrirSetor(aberto)}
              <button onClick={() => setFoco(null)} aria-label={`Fechar ${aberto.nome}`} title="Fechar" className="ds-abrir"
                style={{ ['--cor' as string]: aberto.cor, width: 38, height: 38, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={17} />
              </button>
            </span>
          </div>
          {blocoModulos(doSetor(aberto.key))}
        </div>
      )}
    </div>
    )
  }

  // O <html> ganha data-topo-dash: o CSS abaixo deixa o topo do PortalLayout transparente por cima da foto.
  useEffect(() => {
    const h = document.documentElement
    h.dataset.topoDash = 'transparente'
    return () => { delete h.dataset.topoDash }
  }, [])

  const inputBusca: React.CSSProperties = { width: '100%', padding: '11px 14px 11px 36px', borderRadius: 12, fontSize: 14, outline: 'none', fontFamily: 'inherit' }

  return (
    <div className="ds-pagina ds-sobre-foto ds-texto-branco" style={{ padding: 'clamp(12px, 2vw, 28px)', marginTop: -84, paddingTop: 'calc(84px + clamp(12px, 2vw, 28px))', background: 'var(--ds-base)', minHeight: '100vh', position: 'relative', isolation: 'isolate', display: 'flex', flexDirection: 'column' }}>
      {/* foto na tela toda, com leve desfoque e véu escuro (texto branco lê bem) */}

      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: -12, background: `url(${FOTO_FUNDO.url}) ${FOTO_FUNDO.pos} / cover no-repeat`, filter: 'blur(3px) saturate(1.1)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--ds-veu)' }} />
      </div>
      <style>{`
        .ds-mod>button:first-child{transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s,border-color .18s}
        .ds-mod:hover>button:first-child{transform:translateY(-2px);box-shadow:0 10px 24px rgba(16,24,40,.09)!important;border-color:var(--cor)!important}
        .ds-mod>button:first-child:active{transform:scale(.98)}
        .ds-mod>button:first-child:focus-visible{outline:2px solid var(--cor);outline-offset:2px}
        .ds-mod .ds-ico{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}.ds-mod:hover .ds-ico{transform:scale(1.08) rotate(-4deg)}
        .ds-setor-grande:hover{transform:translateY(-3px)}.ds-setor-grande:hover .ds-ico{transform:scale(1.06)}.ds-setor-grande .ds-ico{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
        .ds-item-setor.ds-ativo{box-shadow:0 10px 26px rgba(16,24,40,.10)!important}
        .ds-abrir{transition:border-color .15s,color .15s}.ds-abrir:hover{border-color:var(--cor)!important;color:var(--cor)!important}
        .ds-tile>button{transition:background .15s,border-color .15s}.ds-tile:hover>button{background:var(--ds-vidro)!important;border-color:var(--ds-vidro-borda)!important}
        .ds-tile .ds-ico{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}.ds-tile:hover .ds-ico{transform:translateY(-3px) scale(1.05)}
        .ds-fav-h{opacity:0}.ds-tile:hover .ds-fav-h,.ds-mod:hover .ds-fav-h,.ds-fav-h:focus-visible{opacity:1}
        @media (hover: none){.ds-fav-h{opacity:1}}
        /* véu por cima da foto da tela toda: a foto aparece, o texto continua lendo bem */
        .ds-pagina{--ds-rotulo:var(--portal-text-secondary);--ds-veu:linear-gradient(180deg,rgba(10,14,22,.62) 0%,rgba(10,14,22,.34) 38%,rgba(10,14,22,.40) 75%,rgba(10,14,22,.62) 100%)}
        [data-theme="dark"] .ds-pagina{--ds-veu:linear-gradient(180deg,rgba(6,8,12,.78) 0%,rgba(6,8,12,.58) 40%,rgba(6,8,12,.66) 75%,rgba(6,8,12,.85) 100%)}
        .ds-texto-branco{--ds-rotulo:rgba(255,255,255,.88)}
        .ds-pagina.ds-sobre-foto{--ds-solido:#fff;--ds-vidro:#fff;--ds-vidro-borda:transparent;--ds-vidro-sombra:0 10px 30px rgba(0,0,0,.18),inset 0 1px 0 #fff;--ds-pilula:rgba(15,23,42,.06)}
        [data-theme="dark"] .ds-pagina.ds-sobre-foto{--ds-solido:#17191f;--ds-vidro:#17191f;--ds-vidro-borda:rgba(255,255,255,.10);--ds-vidro-sombra:0 10px 30px rgba(0,0,0,.4);--ds-pilula:rgba(255,255,255,.07)}
        /* topo do portal por cima da foto (só nesta página): sem fundo nem linha, logo nas cores originais,
           ícones em botões brancos sólidos */
        html[data-topo-dash="transparente"] .portal-header{--portal-header-bg:transparent;background:linear-gradient(180deg,rgba(0,0,0,.38),rgba(0,0,0,0))!important;border-bottom:none!important;box-shadow:none!important}
        html[data-topo-dash="transparente"] .portal-hamburger{color:#fff!important}
        html[data-topo-dash="transparente"] .portal-header-right{--portal-bg-secondary:#fff;--portal-border:transparent;--portal-text:#1a1a1a;--portal-text-secondary:#475569}
        html[data-topo-dash="transparente"] .portal-header-right>button,html[data-topo-dash="transparente"] .portal-header-right>div>button{box-shadow:0 4px 14px rgba(0,0,0,.18)}
        /* ── cartões ── */
        .ds-card{transition:background .2s,border-color .2s,box-shadow .2s}
        .ds-pagina .ds-card{background:#fff!important;backdrop-filter:none!important;border:1px solid transparent!important;box-shadow:0 10px 28px rgba(0,0,0,.2)!important}
        [data-theme="dark"] .ds-pagina .ds-card{background:#17191f!important}
        .ds-pagina .ds-card-setor{background:linear-gradient(135deg,var(--cor),color-mix(in srgb,var(--cor) 72%,#000))!important;--portal-text:#fff;--portal-text-secondary:rgba(255,255,255,.85)}
        .ds-pagina .ds-card-setor .ds-ico{background:rgba(255,255,255,.18)!important;box-shadow:none!important}
        .ds-pagina .ds-card-setor .ds-nome{color:#fff!important}
        .ds-pagina .ds-card-setor .ds-selo{color:#fff!important;background:rgba(255,255,255,.2)!important}
        .ds-pagina .ds-card-setor.ds-ativo{box-shadow:0 0 0 3px #fff,0 12px 30px rgba(0,0,0,.3)!important}
        .ds-texto-branco .ds-rodape{color:rgba(255,255,255,.75)!important;opacity:1!important}
        .ds-resultado{transition:transform .18s cubic-bezier(.34,1.56,.64,1),border-color .18s}.ds-resultado:hover{transform:translateY(-2px);border-color:var(--cor)!important}
        .ds-resultado .ds-ico{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}.ds-resultado:hover .ds-ico{transform:scale(1.06)}
        .ds-fav{transition:background .15s,transform .15s}.ds-fav:hover{background:#F59E0B1f!important;transform:scale(1.1)}
        .ds-chip{transition:transform .15s,border-color .15s}.ds-chip:hover{transform:translateY(-2px);border-color:var(--cor)!important}
        /* tema escuro: o vidro vira grafite translúcido */
        /* claro: fundo um pouco mais escuro que o resto do portal, para o vidro aparecer */
        .ds-pagina{--ds-base:#e7ebf1;--ds-vidro:rgba(255,255,255,.66);--ds-vidro-borda:rgba(255,255,255,.8);
          --ds-vidro-brilho:inset 0 1px 0 rgba(255,255,255,.85);--ds-vidro-sombra:0 8px 30px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.85);--ds-pilula:rgba(255,255,255,.72)}
        /* escuro: base quase preta, vidro grafite translúcido, formas um pouco mais vivas para não sumirem */
        [data-theme="dark"] .ds-pagina{--ds-base:#0b0d12;--ds-vidro:rgba(24,26,32,.62);--ds-vidro-borda:rgba(255,255,255,.08);
          --ds-vidro-brilho:inset 0 1px 0 rgba(255,255,255,.05);--ds-vidro-sombra:0 8px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.05);--ds-pilula:rgba(255,255,255,.07)}
        @keyframes dsEntra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .ds-entra{animation:dsEntra .28s ease both}
        @media (prefers-reduced-motion: reduce){.ds-entra{animation:none}.ds-mod>button,.ds-ico,.ds-fav,.ds-chip{transition:none}}
      `}</style>

      {/* doca do canto: hoje só o atalho "comissões para autorizar" do diretor entra aqui (AvisoComissoesDiretor).
          Agenda e Central de Trabalho saíram do canto — são botões em Adicionais › Dia a dia. */}
      <div id={DOCA_ID} className="print-hidden"
        style={{ position: 'fixed', right: 22, bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: 900, display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12, pointerEvents: 'none' }} />

      {setorInfo ? (
        /* ══════════ DENTRO DE UM SETOR ══════════ */
        <div key={setorInfo.key} className="ds-entra">
          <div style={{ ...vidroDaCor(setorInfo.cor), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18, padding: 14, borderRadius: 18, color: 'var(--portal-text)' }}>
            <button onClick={voltarSetores} aria-label="Voltar para os setores"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 11, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              <ArrowLeft size={16} /> Setores
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${setorInfo.cor}, ${setorInfo.cor}b0)`, color: '#fff', boxShadow: `0 6px 14px ${setorInfo.cor}40` }}><setorInfo.icon size={21} /></span>
              <span>
                <span style={{ display: 'block', fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{setorInfo.nome}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{setorInfo.resumo}</span>
              </span>
            </span>
            <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : 260, maxWidth: isMobile ? '100%' : 420, marginLeft: isMobile ? 0 : 'auto' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input autoFocus={!isMobile} value={buscaSetor} onChange={e => setBuscaSetor(e.target.value)}
                placeholder={`Procurar em ${setorInfo.nome}…`} aria-label={`Procurar em ${setorInfo.nome}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' && modsSetorFiltrados[0]) abrir(modsSetorFiltrados[0])
                  if (e.key === 'Escape') { if (buscaSetor) setBuscaSetor(''); else voltarSetores() }
                }}
                style={{ ...inputBusca, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }} />
            </div>
          </div>

          {qSetor ? (
            modsSetorFiltrados.length ? blocoModulos(modsSetorFiltrados) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 14 }}>
                Nada com “{buscaSetor}” em {setorInfo.nome}.{' '}
                <button onClick={() => { setBusca(buscaSetor); voltarSetores() }}
                  style={{ border: 'none', background: 'none', color: setorInfo.cor, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                  Procurar em todos os setores
                </button>
              </div>
            )
          ) : setorInfo.key === 'adicionais' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {SUBS_ADICIONAIS.map(sub => {
                const daSub = modsSetor.filter(m => m.sub === sub)
                if (!daSub.length) return null
                return <div key={sub}><div style={rotulo}>{sub}</div>{blocoModulos(daSub)}</div>
              })}
            </div>
          ) : blocoModulos(modsSetor)}

          {setoresVisiveis.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>Outros setores:</span>
              {setoresVisiveis.filter(s => s.key !== setorInfo.key).map(s => (
                <button key={s.key} onClick={() => trocarSetor(s.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: 'none', background: `${s.cor}16`, color: s.cor, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <s.icon size={14} /> {s.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ══════════ ENTRADA ══════════ */
        <>
          <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
          {topoCentro()}

          {q ? (
            /* resultado da busca geral: só as telas (cartões brancos grandes, um clique abre a tela).
               Módulo entra só quando nenhuma tela dele bateu (ex.: "Central de Trabalho" pelo nome). Enter abre o 1º. */
            resultados.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${isMobile ? 240 : 290}px, 100%), 1fr))`, gap: 12 }}>
                {resultados.map((r, i) => { const Ic = r.icon; return (
                  <button key={r.chave} onClick={r.abrir} className="ds-resultado ds-entra"
                    style={{ ['--cor' as string]: r.cor, animationDelay: `${i * 25}ms`, display: 'flex', alignItems: 'center', gap: 14, minHeight: 84, padding: '16px 18px', borderRadius: 16,
                      border: '1px solid transparent', background: 'var(--ds-solido)', boxShadow: '0 10px 28px rgba(0,0,0,.20)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0 }}>
                    <span className="ds-ico" style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${r.cor}, ${r.cor}b0)`, color: '#fff', boxShadow: `0 6px 14px ${r.cor}40` }}><Ic size={22} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 16, fontWeight: 750, color: 'var(--portal-text)', lineHeight: 1.3 }}>{r.nome}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 3 }}>{r.onde}</span>
                    </span>
                  </button>
                ) })}
              </div>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 14.5, borderRadius: 16, background: 'var(--ds-solido)', boxShadow: '0 10px 28px rgba(0,0,0,.20)' }}>Nada com “{busca}”.</div>
            )
          ) : !loadingPerm && setoresVisiveis.length === 0 ? (
            <div className="ds-vidro" style={{ ...VIDRO, padding: '50px 30px', textAlign: 'center', borderRadius: 18 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text)', margin: '0 0 6px' }}>Aguardando liberação</h3>
              <p style={{ fontSize: 14, color: 'var(--portal-text-secondary)', margin: 0 }}>Fale com o administrador para liberar os módulos.</p>
            </div>
          ) : (
            layoutCentro()
          )}
          </div>

          {/* Sincronizar com Omie: no pé da tela, no meio (José, 10/11/2026) */}
          <div style={{ marginTop: 'auto', paddingTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setShowSync(true)} className="ds-vidro"
              style={{ ...VIDRO, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
              <RefreshCw size={14} /> Sincronizar com Omie
            </button>
            <span className="ds-rodape" style={{ fontSize: 12, color: 'var(--portal-text-secondary)', opacity: .7 }}>Nova Tratores © {new Date().getFullYear()}</span>
          </div>
        </>
      )}

      {/* Modal Sync Omie */}
      {showSync && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !syncRunning) setShowSync(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '480px',
            maxHeight: '90vh', overflowY: 'auto',
            padding: 'clamp(20px, 5vw, 40px)', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Database size={22} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>Sync Omie</h3>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Clientes, projetos e produtos</p>
                </div>
              </div>
              {!syncRunning && (
                <button onClick={() => setShowSync(false)} style={{
                  background: '#f5f5f5', border: 'none', borderRadius: '10px',
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#737373'
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Barra de progresso */}
            <div style={{
              background: '#f5f5f5', borderRadius: '12px', height: '12px',
              overflow: 'hidden', marginBottom: '16px'
            }}>
              <div style={{
                height: '100%', borderRadius: '12px',
                background: syncError ? '#ef4444' : syncProgress === 100 ? '#22c55e' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                width: `${syncProgress}%`,
                transition: 'width 0.4s ease-out'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '13px', color: syncError ? '#ef4444' : '#737373', fontWeight: '500' }}>
                {syncError || syncStep || 'Pronto para sincronizar'}
              </span>
              <span style={{ fontSize: '20px', fontWeight: '700', color: syncProgress === 100 ? '#22c55e' : '#1a1a1a' }}>
                {syncProgress}%
              </span>
            </div>

            {/* Etapas + seleção (checkboxes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {([
                { label: 'Clientes', key: 'clientes' as const },
                { label: 'Projetos', key: 'projetos' as const },
                { label: 'Produtos', key: 'produtos' as const },
              ]).map(s => {
                const selected = syncSelection[s.key]
                const hasResult = !!syncResults?.[s.key]
                const done = hasResult
                const active = syncRunning && selected && !done && syncStep.toLowerCase().includes(s.key)
                const disabledVisual = !selected && !syncRunning
                return (
                  <label key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: '12px',
                    background: done ? '#f0fdf4' : active ? '#fef2f2' : disabledVisual ? '#fafafa' : '#fff7ed',
                    border: `1px solid ${done ? '#bbf7d0' : active ? '#fecaca' : disabledVisual ? '#f0f0f0' : '#fed7aa'}`,
                    transition: 'all 0.3s',
                    cursor: syncRunning ? 'not-allowed' : 'pointer',
                    opacity: disabledVisual ? 0.6 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={syncRunning}
                      onChange={e => setSyncSelection(prev => ({ ...prev, [s.key]: e.target.checked }))}
                      style={{
                        width: 18, height: 18, accentColor: '#dc2626',
                        cursor: syncRunning ? 'not-allowed' : 'pointer', flexShrink: 0,
                      }}
                    />
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? '#22c55e' : active ? '#dc2626' : '#e5e5e5',
                      color: '#fff', flexShrink: 0
                    }}>
                      {done ? <Check size={14} /> : active ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                    </div>
                    <span style={{
                      fontSize: '14px', fontWeight: done ? '600' : '500',
                      color: done ? '#16a34a' : active ? '#dc2626' : '#525252'
                    }}>
                      {s.label}
                    </span>
                    {done && syncResults?.[s.key] && (
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                        {syncResults[s.key].total} registros
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {/* Botão */}
            {!syncRunning && syncProgress < 100 && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={18} /> Iniciar Sincronizacao
              </button>
            )}

            {syncProgress === 100 && !syncError && (
              <button
                onClick={() => { setShowSync(false); setSyncProgress(0); setSyncStep(''); setSyncResults(null) }}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#22c55e', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <Check size={18} /> Concluido — Fechar
              </button>
            )}

            {syncError && !syncRunning && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#ef4444', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <RefreshCw size={18} /> Tentar Novamente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
