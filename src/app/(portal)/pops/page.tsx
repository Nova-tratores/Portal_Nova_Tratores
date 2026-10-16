'use client'
// POPs — lista por área com filtros (estado, dono, revisão vencida).
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import ModalNovoPop from '@/components/pops/ModalNovoPop'
import {
  COR_POPS, EstadoChip, areasQuePossoCriar, botao, br, campo, cartao, chamar, chip, pagina, primeiroNome, vazio,
  type AreasResp, type PopLista, type UsuarioMapa,
} from '@/components/pops/comum'

type FiltroEstado = '' | 'publicado' | 'edicao' | 'em_revisao' | 'sem_publicacao'

export default function PopsLista() {
  const { userProfile } = useAuth()
  const [areas, setAreas] = useState<AreasResp | null>(null)
  const [pops, setPops] = useState<PopLista[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioMapa>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)
  const [paraLer, setParaLer] = useState<{ versao_id: string; numero: number; pop: { id: string; codigo: string; titulo: string } | null }[]>([])
  // filtros
  const [area, setArea] = useState('')
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('')
  const [dono, setDono] = useState('')
  const [vencida, setVencida] = useState(false)
  const [arquivados, setArquivados] = useState(false)
  // Celular: busca sempre à vista; o resto dos filtros abre num bloco (botão com contador).
  const isMobile = useIsMobile()
  const [verFiltros, setVerFiltros] = useState(false)
  const nFiltros = [area, estado, dono].filter(Boolean).length + (vencida ? 1 : 0) + (arquivados ? 1 : 0)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const [a, l] = await Promise.all([
        chamar<AreasResp>('/api/pops/areas'),
        chamar<{ pops: PopLista[]; usuarios: UsuarioMapa }>(`/api/pops${arquivados ? '?arquivados=1' : ''}`),
      ])
      setAreas(a); setPops(l.pops); setUsuarios(l.usuarios)
      chamar<{ pendentes: typeof paraLer }>('/api/pops/ciencia').then((r) => setParaLer(r.pendentes)).catch(() => {})
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [arquivados])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return pops.filter((p) => {
      if (area && p.area_id !== area) return false
      if (dono && p.dono_id !== dono) return false
      if (vencida && !p.revisao_vencida) return false
      if (q && !`${p.codigo} ${p.titulo}`.toLowerCase().includes(q)) return false
      if (estado === 'publicado' && !p.publicada) return false
      if (estado === 'edicao' && p.edicao?.estado !== 'rascunho') return false
      if (estado === 'em_revisao' && p.edicao?.estado !== 'em_revisao') return false
      if (estado === 'sem_publicacao' && p.publicada) return false
      return true
    })
  }, [pops, area, dono, vencida, busca, estado])

  const porArea = useMemo(() => {
    const grupos = new Map<string, PopLista[]>()
    for (const p of filtrados) grupos.set(p.area_id, [...(grupos.get(p.area_id) || []), p])
    return (areas?.areas || []).filter((a) => grupos.has(a.id)).map((a) => ({ area: a, pops: grupos.get(a.id)! }))
  }, [filtrados, areas])

  const donos = useMemo(() => [...new Set(pops.map((p) => p.dono_id))]
    .map((id) => ({ id, nome: usuarios[id]?.nome || '—' })).sort((a, b) => a.nome.localeCompare(b.nome)), [pops, usuarios])
  const posso = areasQuePossoCriar(areas)
  const vencidos = pops.filter((p) => p.revisao_vencida).length

  return (
    <div style={pagina}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--portal-text-muted,#888)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou título" style={{ ...campo, paddingLeft: 32 }} />
        </div>
        {isMobile && (
          <button onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              border: `1px solid ${nFiltros ? COR_POPS : 'var(--portal-border,#e5e7eb)'}`, background: nFiltros ? 'rgba(15,118,110,.08)' : 'var(--portal-surface,#fff)', color: nFiltros ? COR_POPS : 'var(--portal-text,#111)' }}>
            <SlidersHorizontal size={15} /> Filtros{nFiltros ? ` (${nFiltros})` : ''}
          </button>
        )}
        {(!isMobile || verFiltros) && <>
        <select value={area} onChange={(e) => setArea(e.target.value)} style={{ ...campo, width: isMobile ? '100%' : 'auto' }}>
          <option value="">Todas as áreas</option>
          {(areas?.areas || []).filter((a) => a.ativo).map((a) => <option key={a.id} value={a.id}>{a.sigla} — {a.nome}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} style={{ ...campo, width: isMobile ? 'calc(50% - 5px)' : 'auto' }}>
          <option value="">Qualquer estado</option>
          <option value="publicado">Publicado</option>
          <option value="edicao">Com rascunho</option>
          <option value="em_revisao">Em revisão</option>
          <option value="sem_publicacao">Nunca publicado</option>
        </select>
        <select value={dono} onChange={(e) => setDono(e.target.value)} style={{ ...campo, width: isMobile ? 'calc(50% - 5px)' : 'auto' }}>
          <option value="">Qualquer dono</option>
          {donos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary,#555)' }}>
          <input type="checkbox" checked={vencida} onChange={(e) => setVencida(e.target.checked)} /> Revisão vencida {vencidos ? `(${vencidos})` : ''}
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary,#555)' }}>
          <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Arquivados
        </label>
        </>}
        {posso.length > 0 && (
          <button onClick={() => setNovo(true)} style={{ ...botao(COR_POPS), ...(isMobile ? { minHeight: 42, marginLeft: 'auto' } : {}) }}><Plus size={15} /> Novo POP</button>
        )}
      </div>

      {paraLer.length > 0 && (
        <div style={{ ...cartao, marginBottom: 14, borderLeft: '4px solid #0f766e', display: 'grid', gap: 6 }}>
          <strong>Você precisa ler {paraLer.length === 1 ? 'este procedimento' : `estes ${paraLer.length} procedimentos`} e dar ciência</strong>
          {paraLer.map((x) => x.pop && (
            <Link key={x.versao_id} href={`/pops/${x.pop.id}`} style={{ color: COR_POPS, fontWeight: 700, textDecoration: 'none' }}>
              {x.pop.codigo} v{x.numero} · {x.pop.titulo} →
            </Link>
          ))}
        </div>
      )}
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      {carregando && !pops.length ? <div style={vazio}>Carregando…</div>
        : !porArea.length ? (
          <div style={vazio}>
            {pops.length ? 'Nenhum POP com esses filtros.' : 'Ainda não há POP publicado.'}
            {posso.length > 0 && !pops.length && <> Comece por <Link href="/pops/modelos" style={{ color: COR_POPS, fontWeight: 700 }}>um modelo</Link> ou crie do zero.</>}
          </div>
        ) : porArea.map(({ area: a, pops: lista }) => (
          <section key={a.id} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 14, fontWeight: 900, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--portal-text-secondary,#555)', margin: '0 0 8px' }}>
              {a.sigla} · {a.nome} <span style={{ fontWeight: 600 }}>({lista.length})</span>
            </h2>
            <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
              {lista.map((p, i) => (
                <Link key={p.id} href={`/pops/${p.id}`} style={{
                  // Celular: código + selos em cima, título (até 2 linhas) e dono embaixo
                  display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) auto' : 'minmax(90px,110px) 1fr auto', gap: isMobile ? '4px 10px' : 12, alignItems: 'center',
                  padding: '11px 14px', textDecoration: 'none', color: 'inherit',
                  borderTop: i ? '1px solid var(--portal-border,#e5e7eb)' : 'none', opacity: p.arquivado ? .55 : 1,
                }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 800, color: COR_POPS, fontSize: 13 }}>{p.codigo}</span>
                  <span style={{ minWidth: 0, gridColumn: isMobile ? '1 / -1' : undefined, gridRow: isMobile ? 2 : undefined }}>
                    <span style={{ display: 'block', fontWeight: 700, color: 'var(--portal-text,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', overflowWrap: 'anywhere' }}>{p.titulo}</span>
                    <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                      dono {primeiroNome(usuarios[p.dono_id]?.nome)}
                      {p.publicada && <> · revisar até {br(p.proxima_revisao_em)}</>}
                      {p.eh_template && <> · modelo</>}
                      {p.arquivado && <> · arquivado</>}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {p.revisao_vencida && <span style={chip('#b45309', 'rgba(217,119,6,.14)')}><AlertTriangle size={12} /> revisão vencida</span>}
                    {p.publicada && <EstadoChip estado="publicado" numero={p.publicada.numero} />}
                    {p.edicao && <EstadoChip estado={p.edicao.estado} numero={p.edicao.numero} />}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

      {novo && areas && <ModalNovoPop areas={posso} admin={areas.eu.admin} onFechar={() => setNovo(false)} />}
    </div>
  )
}
