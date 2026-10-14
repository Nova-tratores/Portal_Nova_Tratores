'use client'
// Patrimônio Loja — lista: busca, filtros (categoria, local, estado, tag),
// totais (itens e valor) e um cartão com foto para cada item — ou, no modo
// Lista, uma tabela com filtro e ordem A→Z/Z→A no cabeçalho de cada coluna.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Inbox, Landmark, MapPin, Plus, Search, UserRound } from 'lucide-react'
import { urlsMiniaturas } from '@/lib/opa-pecas/fotos'
import { BUCKET_PATRIMONIO } from '@/lib/patrimonio/fotos-regra'
import { ESTADOS, FILTROS_VAZIOS, filtrarItens, INFO_ESTADO, ROTULO_SITUACAO, textoOnde, totais, type FiltrosPat, type ItemPat } from '@/lib/patrimonio/tipos'
import { Aviso, INP, SECAO, useTelaLarga } from '../pecas/comum'
import TabelaFiltravel, { SeletorVisao, useListaFiltrada, useModoVisao, type ColunaTabela } from '../pecas/TabelaFiltravel'
import { COR_PAT, fmtData, fmtReal, SeloEstado, type BasePat } from './comum'

export default function Lista({ base }: { base: BasePat }) {
  const larga = useTelaLarga()
  const [f, setF] = useState<FiltrosPat>(FILTROS_VAZIOS)
  const router = useRouter()
  const [modoSalvo, setModo] = useModoVisao('opa-patrimonio-visao')
  const modo = modoSalvo ?? 'cards'
  const emLista = modo === 'lista'
  // Lista: só a busca aqui; categoria/local/estado/tag viram filtro no cabeçalho
  const fBase = useMemo(() => (emLista ? { ...FILTROS_VAZIOS, texto: f.texto } : f), [emLista, f])
  const preFiltrados = useMemo(() => filtrarItens(base.itens, fBase, base.nomeLocal), [base.itens, fBase, base.nomeLocal])
  const [minis, setMinis] = useState<Record<string, string>>({})
  const colunas = useColunasPat(base, minis)
  const tabela = useListaFiltrada('opa-patrimonio-lista', preFiltrados, colunas)
  const visiveis = emLista ? tabela.visiveis : preFiltrados
  const t = totais(visiveis)

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
        <SeletorVisao modo={modo} onChange={setModo} cor={COR_PAT} />
        {emLista && tabela.ativos > 0 && (
          <button type="button" onClick={tabela.limpar} style={{ height: 34, padding: '0 11px', borderRadius: 9, border: `1px solid ${COR_PAT}`, background: 'transparent', color: COR_PAT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Limpar filtros das colunas ({tabela.ativos})
          </button>
        )}
        {!emLista && <>
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
        </>}
      </div>

      {base.carregando ? (
        <div style={{ ...SECAO, alignItems: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>
      ) : emLista && base.itens.length > 0 ? (
        <TabelaFiltravel colunas={colunas} todas={preFiltrados} lista={tabela} chaveLinha={(i) => i.id} cor={COR_PAT}
          onAbrir={(i) => router.push(`/opa/patrimonio/${i.id}`)} />
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

const vazio = (s: string | null | undefined) => s || <span style={{ color: 'var(--portal-text-muted)' }}>—</span>

function useColunasPat(base: BasePat, minis: Record<string, string>): ColunaTabela<ItemPat>[] {
  const { nomeLocal } = base
  return useMemo(() => [
    { chave: 'foto', titulo: '', semFiltro: true, semOrdem: true, ordem: () => null,
      render: (i) => {
        const foto = i.fotos[0]?.storage_path
        return (
          <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {foto && minis[foto] ? <img src={minis[foto]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Landmark size={18} />}
          </div>
        )
      } },
    { chave: 'codigo', titulo: 'Código', ordem: (i) => i.codigo,
      render: (i) => <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 800, color: COR_PAT, whiteSpace: 'nowrap' }}>{i.codigo}</span> },
    { chave: 'descricao', titulo: 'Descrição', maxLargura: 280, ordem: (i) => i.descricao,
      render: (i) => <div style={{ minWidth: 160, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descricao}</div> },
    { chave: 'categoria', titulo: 'Categoria', ordem: (i) => i.categoria || '', render: (i) => vazio(i.categoria) },
    { chave: 'marca', titulo: 'Marca', ordem: (i) => i.marca || '', render: (i) => vazio(i.marca) },
    { chave: 'modelo', titulo: 'Modelo', ordem: (i) => i.modelo || '', render: (i) => vazio(i.modelo) },
    { chave: 'serie', titulo: 'Nº série', ordem: (i) => i.numero_serie || '', render: (i) => <span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{vazio(i.numero_serie)}</span> },
    { chave: 'estado', titulo: 'Estado', ordem: (i) => INFO_ESTADO[i.estado]?.rotulo || i.estado, render: (i) => <SeloEstado estado={i.estado} /> },
    { chave: 'situacao', titulo: 'Situação', ordem: (i) => ROTULO_SITUACAO[i.situacao] || i.situacao, render: (i) => <span style={{ whiteSpace: 'nowrap' }}>{ROTULO_SITUACAO[i.situacao] || i.situacao}</span> },
    { chave: 'local', titulo: 'Onde está', maxLargura: 200, ordem: (i) => textoOnde(i.local_id, i.local_tecnico, nomeLocal),
      render: (i) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}><MapPin size={12} style={{ flexShrink: 0 }} /> {textoOnde(i.local_id, i.local_tecnico, nomeLocal)}</span> },
    { chave: 'responsavel', titulo: 'Responsável', ordem: (i) => i.responsavel || '', render: (i) => <span style={{ whiteSpace: 'nowrap' }}>{vazio(i.responsavel)}</span> },
    { chave: 'valor', titulo: 'Valor', direita: true, ordem: (i) => i.valor_atual ?? i.valor_compra,
      valores: (i) => ((i.valor_atual ?? i.valor_compra) == null ? [] : [fmtReal(i.valor_atual ?? i.valor_compra)]),
      render: (i) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(i.valor_atual ?? i.valor_compra) != null ? fmtReal(i.valor_atual ?? i.valor_compra) : vazio('')}</span> },
    { chave: 'tags', titulo: 'Tags', ordem: (i) => i.tags.join(', '), valores: (i) => i.tags.map((tg) => `#${tg}`),
      render: (i) => (i.tags.length
        ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{i.tags.slice(0, 3).map((tg) => <span key={tg} style={{ fontSize: 11, fontWeight: 700, color: COR_PAT, background: '#EEF2FF', borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}>#{tg}</span>)}{i.tags.length > 3 && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>+{i.tags.length - 3}</span>}</span>
        : vazio('')) },
    { chave: 'compra', titulo: 'Compra', ordem: (i) => i.data_compra || '', valores: (i) => (i.data_compra ? [fmtData(i.data_compra)] : []),
      render: (i) => <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--portal-text-secondary)' }}>{i.data_compra ? fmtData(i.data_compra) : vazio('')}</span> },
  ] as ColunaTabela<ItemPat>[], [nomeLocal, minis])
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
