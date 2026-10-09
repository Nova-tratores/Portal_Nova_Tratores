'use client'
// Peças Não Identificadas (aba do Opa) — peças comuns às telas: abas do Opa,
// sub-navegação, selos, carregamento base (permissão + cadastros) e miniaturas.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ChevronDown, LayoutList, Package, Plus, Printer } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePermissoes } from '@/hooks/usePermissoes'
import { contagens, listarLookups, type Contagens } from '@/lib/opa-pecas/db'
import { mensagemErro, urlsMiniaturas } from '@/lib/opa-pecas/fotos'
import { codigoDefinitivo } from '@/lib/opa-pecas/regras'
import { BotaoLerCodigo } from './LeitorCodigo'
import dynamic from 'next/dynamic'

// carregado à parte: ele usa a janela/impressão, que importam este arquivo
const ImprimirTodas = dynamic(() => import('./ImprimirTodas'), { ssr: false })
import { COR_STATUS, ROTULO_QUALIDADE, ROTULO_STATUS, type Destino, type Local, type Lookup, type Qualidade, type Status } from '@/lib/opa-pecas/tipos'

export const LARANJA = '#ea580c'

/** Avisa a barra do Opa que algo mudou (para os contadores recarregarem). */
export function avisarMudanca() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('opa-mudou'))
}

function useContagens(): Contagens | null {
  const pathname = usePathname()
  const [c, setC] = useState<Contagens | null>(null)
  useEffect(() => {
    let vivo = true
    const carregar = () => { contagens().then((r) => { if (vivo) setC(r) }).catch(() => null) }
    carregar()
    window.addEventListener('opa-mudou', carregar)
    return () => { vivo = false; window.removeEventListener('opa-mudou', carregar) }
  }, [pathname])
  return c
}

const CHAVE_NAV = 'opa-pecas-navegacao'

/**
 * "Voltar" das telas de Peças: lembra (sessionStorage) a ÚLTIMA página do Opa
 * em que a pessoa estava e volta pra ela — não depende do histórico do
 * navegador (um redirect ou um link aberto direto não deixam a pessoa presa).
 * Sem página anterior conhecida: histórico do navegador; sem histórico, a lista.
 */
function useVoltar(pathname: string) {
  const router = useRouter()
  useEffect(() => {
    try {
      const atual = pathname + window.location.search
      const nav = JSON.parse(sessionStorage.getItem(CHAVE_NAV) || '{}') as { anterior?: string; atual?: string }
      if (nav.atual !== atual) sessionStorage.setItem(CHAVE_NAV, JSON.stringify({ anterior: nav.atual || '', atual }))
    } catch { /* sessionStorage indisponível: o botão cai no histórico */ }
  }, [pathname])
  return () => {
    let anterior = ''
    try { anterior = (JSON.parse(sessionStorage.getItem(CHAVE_NAV) || '{}') as { anterior?: string }).anterior || '' } catch { /* idem */ }
    if (anterior && anterior !== pathname + window.location.search) router.push(anterior)
    else if (window.history.length > 1) router.back()
    else router.push('/opa/pecas')
  }
}

/**
 * Cabeçalho do Opa: faixa em degradê na cor da frente ativa (vermelho =
 * Ocorrências, laranja = Peças), com as duas frentes como GUIAS estilo Chrome
 * (a ativa branca, "colada" no conteúdo — mesmo padrão das faixas de Frota e
 * Serviços). À direita, só os atalhos do dia a dia; em Peças: Etapas ▾, Ler
 * código e Novo produto. Ocupa a largura toda (margens negativas = padding da
 * página, igual em /opa e na Moldura de /opa/pecas).
 */
export function OpaBarra({ acao, podeGerir = false }: { acao?: React.ReactNode; podeGerir?: boolean }) {
  const pathname = usePathname() || ''
  const isMobile = useIsMobile()
  const emPecas = pathname.startsWith('/opa/pecas')
  const c = useContagens()
  const voltar = useVoltar(pathname)
  const temVoltar = emPecas && pathname !== '/opa/pecas'
  const btn = isMobile ? BTN_FAIXA_MOVEL : BTN_FAIXA
  const faixa = emPecas ? 'linear-gradient(135deg, #fb923c 0%, #ea580c 55%, #c2410c 100%)' : 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #991b1b 100%)'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap',
      margin: isMobile ? '-12px -12px 14px' : '-16px -20px 18px', padding: isMobile ? '10px 12px 0' : '12px 24px 0',
      background: faixa, boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    }}>
      <div role="tablist" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, overflowX: 'auto', flexShrink: 0, maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
        <GuiaChrome href="/opa" ativo={!emPecas} cor="#dc2626" icone={<AlertCircle size={16} />} titulo="Ocorrências"
          conta={c?.opasAbertos ?? null} dica={c ? (c.opasAbertos === 1 ? '1 aberta' : `${c.opasAbertos} abertas`) : ''} mobile={isMobile} />
        <GuiaChrome href="/opa/pecas" ativo={emPecas} cor={LARANJA} icone={<Package size={16} />} titulo="Peças S/Estoque"
          conta={c?.emAberto ?? null} dica={c ? `${c.emAberto} em andamento` : ''} mobile={isMobile} />
      </div>
      {/* celular: grade de 2 colunas (os botões ocupam a largura toda, sem sobrar um sozinho na linha) */}
      <div style={isMobile
        ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, paddingBottom: 10, width: '100%' }
        : { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {emPecas ? (
          <>
            {temVoltar && (
              <button type="button" onClick={voltar} title="Voltar para a última página" style={{ ...btn, padding: '0 12px' }}>
                <ArrowLeft size={16} strokeWidth={2.5} /> Voltar
              </button>
            )}
            <MenuEtapas podeGerir={podeGerir} c={c} mobile={isMobile} />
            <BotaoLerCodigo estilo={btn} />
            <Link href="/opa/pecas/novo" style={{ ...btn, background: '#fefefe', color: '#111111', border: '1px solid #fefefe', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', gridColumn: isMobile && !temVoltar ? '1 / -1' : undefined }}>
              <Plus size={16} strokeWidth={2.5} /> Novo produto
            </Link>
          </>
        ) : acao}
      </div>
    </div>
  )
}

/** Botão translúcido para a faixa colorida (branco "de verdade": #fefefe não é remapeado pelo modo escuro). */
export const BTN_FAIXA: React.CSSProperties = {
  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, textDecoration: 'none',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap',
  background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.45)', color: '#fefefe',
}

/** O mesmo botão ocupando a célula inteira da grade do celular. */
const BTN_FAIXA_MOVEL: React.CSSProperties = { ...BTN_FAIXA, width: '100%', justifyContent: 'center', boxSizing: 'border-box', padding: '0 10px' }

/** Guia estilo Chrome: cantos de cima arredondados; a ativa é branca e "gruda" no conteúdo. */
function GuiaChrome({ href, ativo, cor, icone, titulo, conta, dica, mobile }: {
  href: string; ativo: boolean; cor: string; icone: React.ReactNode; titulo: string; conta: number | null; dica: string; mobile: boolean
}) {
  return (
    <Link href={href} role="tab" aria-selected={ativo} aria-current={ativo ? 'page' : undefined} title={dica} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: mobile ? '10px 14px' : '11px 20px', flexShrink: 0,
      borderRadius: '11px 11px 0 0', textDecoration: 'none', whiteSpace: 'nowrap', transition: '0.15s',
      fontSize: mobile ? 13 : 14, fontWeight: ativo ? 700 : 500, color: '#111111', // preta sempre (o escuro remapeia #111827)
      background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)',
      boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
    }}>
      <span style={{ color: ativo ? cor : '#111111', display: 'flex', opacity: ativo ? 1 : 0.75 }}>{icone}</span>
      {titulo}
      {conta != null && conta > 0 && (
        <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 9, background: ativo ? cor : 'rgba(0,0,0,0.14)', color: ativo ? '#fefefe' : '#111111' }}>{conta}</span>
      )}
    </Link>
  )
}

/** Menu suspenso: etapas 1–4 (com o que está esperando em cada), lista completa e etiquetas. */
function MenuEtapas({ podeGerir, c, mobile = false }: { podeGerir: boolean; c: Contagens | null; mobile?: boolean }) {
  const pathname = usePathname() || ''
  const [aberto, setAberto] = useState(false)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [topo, setTopo] = useState(0) // celular: onde o menu começa (logo abaixo do botão)
  const abrir = () => {
    setTopo((botaoRef.current?.getBoundingClientRect().bottom || 0) + 8)
    setAberto((a) => !a)
  }
  const [etiquetas, setEtiquetas] = useState(false)
  const etapas = [
    { n: 1, href: '/opa/pecas/novo', titulo: 'Captação', detalhe: 'Cadastrar peças', conta: null as number | null, livre: true },
    { n: 2, href: '/opa/pecas/verificacao', titulo: 'Verificação', detalhe: 'Valor e aplicação', conta: c?.verificacao ?? null, livre: podeGerir },
    { n: 3, href: '/opa/pecas/separacao', titulo: 'Separação', detalhe: 'Pra onde a peça vai', conta: c?.separacao ?? null, livre: podeGerir },
    { n: 4, href: '/opa/pecas/concluidas', titulo: 'Concluídas', detalhe: 'Tudo da peça, código e QR', conta: null, livre: podeGerir },
  ].filter((e) => e.livre)
  const pendentes = etapas.reduce((s, e) => s + (e.conta || 0), 0)
  const atual = etapas.find((e) => pathname.startsWith(e.href))
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 9, textDecoration: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button ref={botaoRef} type="button" onClick={abrir} aria-haspopup="menu" aria-expanded={aberto}
        style={{ ...(mobile ? BTN_FAIXA_MOVEL : BTN_FAIXA), ...(atual ? { background: '#fefefe', color: '#111111', border: '1px solid #fefefe' } : {}) }}>
        <LayoutList size={16} /> {atual ? `${atual.n}. ${atual.titulo}` : 'Etapas'}
        {pendentes > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 9, background: atual ? LARANJA : '#fefefe', color: atual ? '#fefefe' : '#111111' }}>{pendentes}</span>}
        <ChevronDown size={15} style={{ transition: 'transform 0.15s', transform: aberto ? 'rotate(180deg)' : 'none' }} />
      </button>
      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div role="menu" style={{ ...(mobile ? { position: 'fixed', top: topo, left: 12, right: 12 } : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280 }), zIndex: 51, padding: 6, borderRadius: 14, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', boxShadow: '0 16px 40px rgba(16,24,40,0.16)' }}>
            {etapas.map((e) => {
              const ativo = pathname.startsWith(e.href)
              return (
                <Link key={e.href} href={e.href} role="menuitem" onClick={() => setAberto(false)} style={{ ...item, background: ativo ? '#FFF7ED' : 'transparent' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0, background: ativo ? LARANJA : 'var(--portal-bg-secondary)', color: ativo ? '#fff' : 'var(--portal-text-secondary)' }}>{e.n}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: ativo ? '#9A3412' : 'var(--portal-text)' }}>{e.titulo}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{e.detalhe}</span>
                  </span>
                  {e.conta != null && e.conta > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 9, background: LARANJA, color: '#fff' }}>{e.conta}</span>}
                </Link>
              )
            })}
            <div style={{ height: 1, background: 'var(--portal-border)', margin: '6px 4px' }} />
            <Link href="/opa/pecas" role="menuitem" onClick={() => setAberto(false)} style={{ ...item, background: pathname === '/opa/pecas' ? 'var(--portal-bg-secondary)' : 'transparent' }}>
              <span style={{ width: 26, display: 'flex', justifyContent: 'center', color: 'var(--portal-text-secondary)' }}><LayoutList size={16} /></span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)' }}>Todas as peças</span>
            </Link>
            {podeGerir && (
              <button type="button" role="menuitem" onClick={() => { setAberto(false); setEtiquetas(true) }} style={item}>
                <span style={{ width: 26, display: 'flex', justifyContent: 'center', color: 'var(--portal-text-secondary)' }}><Printer size={16} /></span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)' }}>Imprimir etiquetas</span>
              </button>
            )}
          </div>
        </>
      )}
      {/* a janela das etiquetas vive fora do menu (o menu fecha ao escolher) */}
      {podeGerir && <ImprimirTodas aberto={etiquetas} onFechar={() => setEtiquetas(false)} />}
    </div>
  )
}

/** Ação principal da barra (Novo item / Novo Opa). */
export function BotaoPrincipal({ href, onClick, cor, claro, children }: { href?: string; onClick?: () => void; cor: string; claro?: boolean; children: React.ReactNode }) {
  // claro = dentro da faixa colorida do Opa: branco com texto preto (#fefefe/#111111 escapam do remapeio do modo escuro)
  const estilo: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 16px', borderRadius: 10,
    textDecoration: 'none', background: claro ? '#fefefe' : cor, color: claro ? '#111111' : '#fff', fontSize: 14, fontWeight: 800, border: 'none',
    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
    boxShadow: claro ? '0 2px 8px rgba(0,0,0,0.18)' : undefined,
  }
  return href ? <Link href={href} style={estilo}>{children}</Link> : <button type="button" onClick={onClick} style={estilo}>{children}</button>
}

/** Código da peça; antes de concluir mostra "Sem código" e o nº de captação. */
export function CodigoPeca({ codigo, tamanho = 14 }: { codigo: string; tamanho?: number }) {
  if (codigoDefinitivo(codigo)) {
    return <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: tamanho, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{codigo}</span>
  }
  return (
    <span title="O código definitivo e o QR são gerados quando a peça é concluída (Separação)" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 800, fontSize: tamanho * 0.86, color: 'var(--portal-text-muted)' }}>Sem código</span>
      <span style={{ fontSize: Math.max(11, tamanho * 0.72), color: 'var(--portal-text-muted)' }}>captação nº {Number(codigo.slice(4)) || codigo.slice(4)}</span>
    </span>
  )
}

/** Etiqueta já impressa (com data). Não existe "pendente": imprime quem quiser, quando quiser. */
export function SeloEtiqueta({ em }: { em: string | null }) {
  if (!em) return null
  return <span title={'Etiqueta impressa em ' + new Date(em).toLocaleString('pt-BR')} style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: '#ECFDF5', color: '#047857', whiteSpace: 'nowrap' }}>etiqueta impressa</span>
}

export function SeloStatus({ status }: { status: Status }) {
  const c = COR_STATUS[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.fg, flexShrink: 0 }} />{ROTULO_STATUS[status]}
    </span>
  )
}

export function SeloQualidade({ qualidade }: { qualidade: Qualidade }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', whiteSpace: 'nowrap' }}>{ROTULO_QUALIDADE[qualidade]}</span>
}

export interface Base {
  userId: string | null
  podeGerir: boolean
  carregando: boolean
  tipos: Lookup[]
  marcas: Lookup[]
  locais: Local[]
  /** destinos criados pelo usuário na separação */
  destinos: Destino[]
  nomesTipos: Record<string, string>
  nomesMarcas: Record<string, string>
  nomesLocais: Record<string, string>
  erro: string | null
  recarregarLookups: () => void
}

/** Usuário, permissão do setor de peças (módulo 'opa-pecas') e cadastros de tipo/marca. */
export function useBase(): Base {
  const { userProfile } = useAuth()
  const { pode, loading } = usePermissoes(userProfile?.id)
  const [tipos, setTipos] = useState<Lookup[]>([])
  const [marcas, setMarcas] = useState<Lookup[]>([])
  const [locais, setLocais] = useState<Local[]>([])
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarLookups()
      .then((r) => { if (vivo) { setTipos(r.tipos); setMarcas(r.marcas); setLocais(r.locais); setDestinos(r.destinos); setErro(null) } })
      .catch((e) => { if (vivo) setErro(mensagemErro(e)) })
    return () => { vivo = false }
  }, [versao])

  const nomesTipos = useMemo(() => Object.fromEntries(tipos.map((t) => [t.id, t.nome])), [tipos])
  const nomesMarcas = useMemo(() => Object.fromEntries(marcas.map((m) => [m.id, m.nome])), [marcas])
  const nomesLocais = useMemo(() => Object.fromEntries(locais.map((l) => [l.id, l.nome])), [locais])

  return {
    userId: userProfile?.id || null,
    podeGerir: !loading && pode('opa-pecas'),
    carregando: loading || !userProfile,
    tipos, marcas, locais, destinos, nomesTipos, nomesMarcas, nomesLocais, erro,
    recarregarLookups: () => setVersao((v) => v + 1),
  }
}

/** Signed URLs das miniaturas (um pedido só para a lista toda). */
export function useMiniaturas(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const chave = paths.join('|')
  useEffect(() => {
    let vivo = true
    const lista = chave ? chave.split('|') : []
    if (lista.length === 0) return
    urlsMiniaturas(lista).then((r) => { if (vivo) setUrls((u) => ({ ...u, ...r })) }).catch(() => null)
    return () => { vivo = false }
  }, [chave])
  return urls
}

export function Miniatura({ url, tamanho = 56 }: { url?: string; tamanho?: number }) {
  return (
    <div style={{ width: tamanho, height: tamanho, borderRadius: 10, overflow: 'hidden', background: 'var(--portal-bg-secondary)', flexShrink: 0, border: '1px solid var(--portal-border)' }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}><Package size={tamanho / 2.6} /></div>}
    </div>
  )
}

export function Aviso({ tipo = 'erro', children, acao }: { tipo?: 'erro' | 'ok' | 'info'; children: React.ReactNode; acao?: React.ReactNode }) {
  const cores = { erro: ['#FEF2F2', '#FECACA', '#991B1B'], ok: ['#ECFDF5', '#A7F3D0', '#065F46'], info: ['#FFF7ED', '#FED7AA', '#9A3412'] }[tipo]
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 10, background: cores[0], border: `1px solid ${cores[1]}`, color: cores[2], fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 180, whiteSpace: 'pre-wrap' }}>{children}</div>
      {acao}
    </div>
  )
}

export const INP: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 16,
  boxSizing: 'border-box', background: 'var(--portal-bg-card)', outline: 'none', color: 'var(--portal-text)', fontFamily: 'inherit',
}

export function botao(cor: string, opts: { grande?: boolean; contorno?: boolean; desab?: boolean } = {}): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: opts.grande ? '14px 20px' : '9px 14px', borderRadius: 10, fontSize: opts.grande ? 16 : 13, fontWeight: 800,
    border: opts.contorno ? `1.5px solid ${cor}` : 'none', background: opts.contorno ? 'var(--portal-bg-card)' : cor,
    color: opts.contorno ? cor : '#fff', cursor: opts.desab ? 'not-allowed' : 'pointer', opacity: opts.desab ? 0.5 : 1,
    fontFamily: 'inherit',
  }
}

/** Cartão de seção dos formulários (mesmo visual no PC e no celular). */
export const SECAO: React.CSSProperties = {
  padding: 16, borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
}

export const TITULO_SECAO: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--portal-text-muted)', margin: 0,
}

/** Tela com espaço para duas colunas de formulário (PC). Abaixo disso, uma coluna (celular/tablet em pé). */
export function useTelaLarga(): boolean {
  return !useIsMobile(980)
}

export const ROTULO: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }
