'use client'
// Peças Não Identificadas (aba do Opa) — peças comuns às telas: abas do Opa,
// sub-navegação, selos, carregamento base (permissão + cadastros) e miniaturas.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ChevronRight, LayoutList, Package, Plus } from 'lucide-react'
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
import { COR_STATUS, ROTULO_QUALIDADE, ROTULO_STATUS, type Local, type Lookup, type Qualidade, type Status } from '@/lib/opa-pecas/tipos'

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

/**
 * Cabeçalho do Opa: as duas frentes (Ocorrências × Peças S/Estoque) em
 * cartões com contador e, dentro de Peças, as etapas de trabalho numeradas.
 */
export function OpaBarra({ acao, podeGerir = false }: { acao?: React.ReactNode; podeGerir?: boolean }) {
  const pathname = usePathname() || ''
  const isMobile = useIsMobile()
  const emPecas = pathname.startsWith('/opa/pecas')
  const c = useContagens()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <AbaModulo href="/opa" ativo={!emPecas} cor="#dc2626" icone={<AlertCircle size={20} />} titulo="Ocorrências"
          detalhe={c ? (c.opasAbertos === 1 ? '1 aberta' : `${c.opasAbertos} abertas`) : ''} />
        <AbaModulo href="/opa/pecas" ativo={emPecas} cor={LARANJA} icone={<Package size={20} />} titulo="Peças S/Estoque"
          detalhe={c ? `${c.emAberto} em andamento` : ''} />
        {acao && <div style={{ marginLeft: isMobile ? 0 : 'auto', alignSelf: 'center', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>{acao}</div>}
      </div>
      {emPecas && <EtapasPecas podeGerir={podeGerir} c={c} />}
    </div>
  )
}

function AbaModulo({ href, ativo, cor, icone, titulo, detalhe }: {
  href: string; ativo: boolean; cor: string; icone: React.ReactNode; titulo: string; detalhe: string
}) {
  return (
    <Link href={href} aria-current={ativo ? 'page' : undefined} style={{
      flex: '1 1 0', minWidth: 0, maxWidth: 340, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
      textDecoration: 'none', border: '1.5px solid ' + (ativo ? cor : 'var(--portal-border)'),
      background: ativo ? cor : 'var(--portal-bg-card)', boxShadow: ativo ? '0 4px 14px rgba(0,0,0,.12)' : 'none',
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ativo ? 'rgba(255,255,255,.18)' : 'var(--portal-bg-secondary)', color: ativo ? '#fff' : cor,
      }}>{icone}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: ativo ? 'rgba(255,255,255,.8)' : 'var(--portal-text-muted)' }}>OPA</span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: ativo ? '#fff' : 'var(--portal-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: 12, color: ativo ? 'rgba(255,255,255,.85)' : 'var(--portal-text-muted)', minHeight: 15 }}>{detalhe}</span>
      </span>
    </Link>
  )
}

/** Etapas de trabalho: 1 Captação → 2 Separação → 3 Verificação → 4 Destino, e a lista completa. */
function EtapasPecas({ podeGerir, c }: { podeGerir: boolean; c: Contagens | null }) {
  const pathname = usePathname() || ''
  const etapas = [
    { n: 1, href: '/opa/pecas/novo', titulo: 'Captação', detalhe: 'Cadastrar peças', conta: null as number | null, livre: true },
    { n: 2, href: '/opa/pecas/separacao', titulo: 'Separação', detalhe: 'Decidir o destino', conta: c?.separacao ?? null, livre: podeGerir },
    { n: 3, href: '/opa/pecas/verificacao', titulo: 'Verificação', detalhe: 'Valor e aplicação', conta: c?.verificacao ?? null, livre: podeGerir },
    { n: 4, href: '/opa/pecas/destino', titulo: 'Destino', detalhe: 'Finalizar a peça', conta: c?.destino ?? null, livre: podeGerir },
  ].filter((e) => e.livre)
  const todas = pathname === '/opa/pecas'

  return (
    <nav aria-label="Etapas das peças" style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
      {etapas.map((e, i) => {
        const ativo = pathname.startsWith(e.href)
        return (
          <div key={e.href} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {i > 0 && <ChevronRight size={16} style={{ color: 'var(--portal-text-muted)', flexShrink: 0 }} />}
            <Link href={e.href} aria-current={ativo ? 'step' : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px', borderRadius: 10, textDecoration: 'none',
              border: '1.5px solid ' + (ativo ? LARANJA : 'var(--portal-border)'), background: ativo ? '#FFF7ED' : 'var(--portal-bg-card)',
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                background: ativo ? LARANJA : 'var(--portal-bg-secondary)', color: ativo ? '#fff' : 'var(--portal-text-secondary)',
              }}>{e.n}</span>
              <span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: ativo ? '#9A3412' : 'var(--portal-text)' }}>
                  {e.titulo}
                  {e.conta != null && e.conta > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 9, background: LARANJA, color: '#fff' }}>{e.conta}</span>
                  )}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{e.detalhe}</span>
              </span>
            </Link>
          </div>
        )
      })}
      <Link href="/opa/pecas" aria-current={todas ? 'page' : undefined} style={{
        marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, textDecoration: 'none',
        border: '1.5px solid ' + (todas ? '#111827' : 'var(--portal-border)'), background: todas ? '#111827' : 'var(--portal-bg-card)',
        color: todas ? '#fff' : 'var(--portal-text-secondary)', fontSize: 13.5, fontWeight: 800,
      }}><LayoutList size={16} /> Todas as peças</Link>
      <Link href="/opa/pecas/novo" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, textDecoration: 'none',
        background: LARANJA, color: '#fff', fontSize: 13.5, fontWeight: 800, border: '1.5px solid ' + LARANJA,
      }}><Plus size={16} /> Novo item</Link>
      {podeGerir && <ImprimirTodas />}
      <BotaoLerCodigo />
    </nav>
  )
}

/** Ação principal da barra (Novo item / Novo Opa). */
export function BotaoPrincipal({ href, onClick, cor, children }: { href?: string; onClick?: () => void; cor: string; children: React.ReactNode }) {
  const estilo: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 16px', borderRadius: 10,
    textDecoration: 'none', background: cor, color: '#fff', fontSize: 14, fontWeight: 800, border: 'none',
    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }
  return href ? <Link href={href} style={estilo}>{children}</Link> : <button type="button" onClick={onClick} style={estilo}>{children}</button>
}

/** Código da peça; antes do Destino mostra "Sem código" e o nº de captação. */
export function CodigoPeca({ codigo, tamanho = 14 }: { codigo: string; tamanho?: number }) {
  if (codigoDefinitivo(codigo)) {
    return <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: tamanho, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{codigo}</span>
  }
  return (
    <span title="O código definitivo e a etiqueta são gerados no Destino" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 800, fontSize: tamanho * 0.86, color: 'var(--portal-text-muted)' }}>Sem código</span>
      <span style={{ fontSize: Math.max(11, tamanho * 0.72), color: 'var(--portal-text-muted)' }}>captação nº {Number(codigo.slice(4)) || codigo.slice(4)}</span>
    </span>
  )
}

/** Situação da etiqueta: gerada (com data) ou pendente. */
export function SeloEtiqueta({ em }: { em: string | null }) {
  return em
    ? <span title={'Etiqueta gerada em ' + new Date(em).toLocaleString('pt-BR')} style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: '#ECFDF5', color: '#047857' }}>etiqueta gerada</span>
    : <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: '#FFFBEB', color: '#B45309' }}>etiqueta pendente</span>
}

export function SeloStatus({ status }: { status: Status }) {
  const c = COR_STATUS[status]
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{ROTULO_STATUS[status]}</span>
}

export function SeloQualidade({ qualidade }: { qualidade: Qualidade }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>{ROTULO_QUALIDADE[qualidade]}</span>
}

export interface Base {
  userId: string | null
  podeGerir: boolean
  carregando: boolean
  tipos: Lookup[]
  marcas: Lookup[]
  locais: Local[]
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
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarLookups()
      .then((r) => { if (vivo) { setTipos(r.tipos); setMarcas(r.marcas); setLocais(r.locais); setErro(null) } })
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
    tipos, marcas, locais, nomesTipos, nomesMarcas, nomesLocais, erro,
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
    <div style={{ width: tamanho, height: tamanho, borderRadius: 8, overflow: 'hidden', background: 'var(--portal-bg-secondary)', flexShrink: 0, border: '1px solid var(--portal-border)' }}>
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
