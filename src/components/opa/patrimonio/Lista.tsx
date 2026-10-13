'use client'
// Patrimônio Loja — lista: busca, filtros (categoria, local, estado, tag),
// totais (itens e valor) e um cartão com foto para cada item.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Inbox, Landmark, MapPin, Plus, Search, UserRound } from 'lucide-react'
import { urlsMiniaturas } from '@/lib/opa-pecas/fotos'
import { BUCKET_PATRIMONIO } from '@/lib/patrimonio/fotos-regra'
import { ESTADOS, FILTROS_VAZIOS, filtrarItens, INFO_ESTADO, textoOnde, totais, type FiltrosPat } from '@/lib/patrimonio/tipos'
import { Aviso, INP, SECAO, useTelaLarga } from '../pecas/comum'
import { COR_PAT, fmtReal, SeloEstado, type BasePat } from './comum'

export default function Lista({ base }: { base: BasePat }) {
  const larga = useTelaLarga()
  const [f, setF] = useState<FiltrosPat>(FILTROS_VAZIOS)
  const visiveis = useMemo(() => filtrarItens(base.itens, f, base.nomeLocal), [base.itens, f, base.nomeLocal])
  const t = totais(visiveis)
  const [minis, setMinis] = useState<Record<string, string>>({})

  useEffect(() => {
    const paths = base.itens.map((i) => i.fotos[0]?.storage_path).filter((p): p is string => !!p)
    if (!paths.length) return
    let vivo = true
    urlsMiniaturas(paths, BUCKET_PATRIMONIO).then((r) => { if (vivo) setMinis(r) }).catch(() => null)
    return () => { vivo = false }
  }, [base.itens])

  const muda = <K extends keyof FiltrosPat>(k: K, v: FiltrosPat[K]) => setF((x) => ({ ...x, [k]: v }))
  const sel: React.CSSProperties = { ...INP, width: 'auto', minWidth: 140, flex: larga ? '0 0 auto' : '1 1 140px' }

  if (base.erro) return <Aviso>{base.erro}</Aviso>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* totais */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile titulo="Itens" valor={String(t.itens)} />
        <Tile titulo="Valor do patrimônio" valor={fmtReal(t.valor)} dica={t.semValor ? `${t.semValor} sem valor` : undefined} />
      </div>

      {/* busca e filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input value={f.texto} onChange={(e) => muda('texto', e.target.value)} placeholder="Buscar: código, descrição, marca, modelo, série, pessoa, tag…" style={{ ...INP, paddingLeft: 34 }} />
        </div>
        <select value={f.categoria} onChange={(e) => muda('categoria', e.target.value)} style={sel}>
          <option value="">Todas as categorias</option>
          {[...new Set(base.itens.map((i) => i.categoria).filter(Boolean) as string[])].sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={f.local} onChange={(e) => muda('local', e.target.value)} style={sel}>
          <option value="">Todos os locais</option>
          {base.locais.filter((l) => base.itens.some((i) => i.local_id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select value={f.estado} onChange={(e) => muda('estado', e.target.value)} style={sel}>
          <option value="">Qualquer estado</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{INFO_ESTADO[e].rotulo}</option>)}
        </select>
        {base.tags.length > 0 && (
          <select value={f.tag} onChange={(e) => muda('tag', e.target.value)} style={sel}>
            <option value="">Qualquer tag</option>
            {base.tags.map((tg) => <option key={tg} value={tg}>#{tg}</option>)}
          </select>
        )}
      </div>

      {base.carregando ? (
        <div style={{ ...SECAO, alignItems: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div style={{ ...SECAO, alignItems: 'center', gap: 10, padding: 28, color: 'var(--portal-text-muted)', textAlign: 'center' }}>
          <Inbox size={28} />
          {base.itens.length === 0 ? 'Nenhum item cadastrado ainda.' : 'Nada encontrado com esses filtros.'}
          {base.itens.length === 0 && (
            <Link href="/opa/patrimonio/novo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: COR_PAT, color: '#fff', fontWeight: 800, textDecoration: 'none' }}>
              <Plus size={16} /> Cadastrar o primeiro
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larga ? 280 : 240}px, 1fr))`, gap: 10 }}>
          {visiveis.map((i) => {
            const foto = i.fotos[0]?.storage_path
            return (
              <Link key={i.id} href={`/opa/patrimonio/${i.id}`} style={{ ...SECAO, padding: 12, gap: 8, textDecoration: 'none', color: 'inherit', flexDirection: 'row', alignItems: 'flex-start' }}>
                <div style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {foto && minis[foto] ? <img src={minis[foto]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Landmark size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 800, color: COR_PAT }}>{i.codigo}</span>
                    <SeloEstado estado={i.estado} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descricao}</div>
                  {(i.marca || i.modelo) && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{[i.marca, i.modelo].filter(Boolean).join(' · ')}</div>}
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {textoOnde(i.local_id, i.local_tecnico, base.nomeLocal)}
                  </div>
                  {i.responsavel && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><UserRound size={12} /> {i.responsavel}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {(i.valor_atual ?? i.valor_compra) != null && <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)' }}>{fmtReal(i.valor_atual ?? i.valor_compra)}</span>}
                    {i.tags.slice(0, 3).map((tg) => <span key={tg} style={{ fontSize: 11, fontWeight: 700, color: COR_PAT, background: '#EEF2FF', borderRadius: 999, padding: '1px 7px' }}>#{tg}</span>)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Tile({ titulo, valor, dica }: { titulo: string; valor: string; dica?: string }) {
  return (
    <div style={{ ...SECAO, padding: '10px 14px', gap: 2, minWidth: 160 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-muted)' }}>{titulo}</span>
      <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--portal-text)' }}>{valor}</span>
      {dica && <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{dica}</span>}
    </div>
  )
}
