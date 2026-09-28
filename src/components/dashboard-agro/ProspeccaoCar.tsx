'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Target, RefreshCw, Download, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Search, Link2, SlidersHorizontal } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { CONF_COR, CONF_ROTULO, codCarCurto, corCultura, fmtBRL, fmtData, fmtHa, gerarCSVProspeccao, nomeCultura, type ImovelProspeccao } from '@/lib/agro/prospeccao'
import FichaImovel from './FichaImovel'
import RegrasOportunidade from './RegrasOportunidade'

// Guia "Prospecção" do /dashboard-agro: os imóveis rurais (CAR) ativos dos
// municípios da NOVA, ordenados pelo score de oportunidade. É a lista que o
// vendedor trabalha; clique na linha abre a ficha (validar cultura, vincular cliente).

const VERDE = '#16a34a'
const VERDE_ESCURO = '#15803d'
const txt = 'var(--portal-text,#111111)'
const mut = 'var(--portal-text-muted,#6b7280)'
const borda = '1px solid var(--portal-border,#e5e7eb)'
const td: React.CSSProperties = { padding: '7px 9px', fontSize: 13, verticalAlign: 'top', borderBottom: borda, color: txt }
const th: React.CSSProperties = { ...td, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary,#374151)', background: 'var(--portal-bg-secondary,#f3f4f6)', whiteSpace: 'nowrap', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none' }
const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: borda, background: 'var(--portal-bg-input,#fefefe)', color: txt, fontSize: 13 }
const botao = (cor: string, cheio: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fefefe' : cor, cursor: 'pointer',
})

type Ordem = 'score' | 'municipio' | 'cultura' | 'confianca' | 'area' | 'cultura_area' | 'credito' | 'invest'
const COLUNAS: { ordem?: Ordem; rotulo: string; dir?: 'asc' | 'desc'; direita?: boolean }[] = [
  { ordem: 'score', rotulo: 'Score', dir: 'desc' }, { ordem: 'municipio', rotulo: 'Município', dir: 'asc' }, { rotulo: 'CAR' },
  { ordem: 'cultura', rotulo: 'Cultura principal', dir: 'asc' }, { ordem: 'confianca', rotulo: 'Confiança', dir: 'asc' },
  { ordem: 'area', rotulo: 'Área', dir: 'desc', direita: true }, { ordem: 'cultura_area', rotulo: 'Área da cultura', dir: 'desc', direita: true },
  { ordem: 'credito', rotulo: 'Crédito 36 m', dir: 'desc', direita: true }, { ordem: 'invest', rotulo: 'Investimento', dir: 'desc', direita: true },
  { rotulo: 'Cliente' },
]
const FILTROS_KEY = 'agro-prospeccao-filtros'
type Filtros = { municipio: string; cultura: string; confianca: string; areaMin: string; areaMax: string; credito: boolean; invest: boolean; vinculo: string; q: string }
const FILTROS_PADRAO: Filtros = { municipio: '', cultura: '', confianca: 'alta,media', areaMin: '', areaMax: '', credito: false, invest: false, vinculo: '', q: '' }

export default function ProspeccaoCar() {
  const [f, setF] = useState<Filtros>(() => { try { return { ...FILTROS_PADRAO, ...JSON.parse(localStorage.getItem(FILTROS_KEY) || '{}') } } catch { return FILTROS_PADRAO } })
  const [ordem, setOrdem] = useState<{ col: Ordem; dir: 'asc' | 'desc' }>({ col: 'score', dir: 'desc' })
  const [pagina, setPagina] = useState(0)
  const [dados, setDados] = useState<ImovelProspeccao[]>([])
  const [total, setTotal] = useState(0)
  const [apoio, setApoio] = useState<{ culturas: any[]; municipios: any[] } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const [regras, setRegras] = useState(false)
  const LIMITE = 100

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ordem: ordem.col, dir: ordem.dir, ...extra })
    if (f.municipio) p.set('municipio', f.municipio)
    if (f.cultura) p.set('cultura', f.cultura)
    if (f.confianca) p.set('confianca', f.confianca)
    if (f.areaMin) p.set('area_min', f.areaMin)
    if (f.areaMax) p.set('area_max', f.areaMax)
    if (f.credito) p.set('credito', '1')
    if (f.invest) p.set('invest', '1')
    if (f.vinculo) p.set('vinculo', f.vinculo)
    if (f.q.trim().length >= 3) p.set('q', f.q.trim())
    return p
  }, [f, ordem])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try {
      try { localStorage.setItem(FILTROS_KEY, JSON.stringify(f)) } catch { /* ok */ }
      const p = params({ pagina: String(pagina), limite: String(LIMITE), ...(apoio ? {} : { apoio: '1' }) })
      const r = await fetch(`/api/agro/prospeccao?${p}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setDados(j.imoveis || []); setTotal(j.total || 0)
      if (j.apoio) setApoio(j.apoio)
    } catch (e: any) { setErro(e?.message || 'Falha ao carregar'); setDados([]) }
    finally { setCarregando(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pagina])
  useEffect(() => { const t = setTimeout(carregar, 350); return () => clearTimeout(t) }, [carregar])

  const mudar = (parcial: Partial<Filtros>) => { setPagina(0); setF((a) => ({ ...a, ...parcial })) }
  const ordenarPor = (c: typeof COLUNAS[number]) => {
    if (!c.ordem) return
    setPagina(0)
    setOrdem((o) => (o.col === c.ordem ? { col: o.col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col: c.ordem!, dir: c.dir || 'asc' }))
  }

  const exportar = async () => {
    setExportando(true); setErro(null)
    try {
      const r = await fetch(`/api/agro/prospeccao?${params({ exportar: '1' })}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      const blob = new Blob([gerarCSVProspeccao(j.imoveis || [])], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `prospeccao_car_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      if ((j.total || 0) > (j.imoveis || []).length) setErro(`Exportadas as ${j.imoveis.length.toLocaleString('pt-BR')} primeiras de ${j.total.toLocaleString('pt-BR')} — refine o filtro para exportar o resto.`)
    } catch (e: any) { setErro(e?.message || 'Falha ao exportar') }
    finally { setExportando(false) }
  }

  const confAtivas = new Set(f.confianca.split(',').filter(Boolean))
  const alternarConf = (c: string) => { const n = new Set(confAtivas); if (n.has(c)) n.delete(c); else n.add(c); mudar({ confianca: Array.from(n).join(',') }) }
  const paginas = Math.max(Math.ceil(total / LIMITE), 1)

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '16px 16px 60px' }}>
      <div style={{ background: 'var(--portal-bg-card,#fefefe)', border: borda, borderTop: `4px solid ${VERDE}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Target size={22} style={{ color: VERDE }} />
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: txt }}>Lista de prospecção por imóvel rural</h1>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: txt }}><b>{total.toLocaleString('pt-BR')}</b> imóveis no filtro</span>
          <button type="button" onClick={() => setRegras(true)} style={botao(VERDE_ESCURO, false)}><SlidersHorizontal size={13} /> Regras de oportunidade</button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--portal-text-secondary,#374151)' }}>
          Cultura estimada por satélite (MapBiomas) e conferida com o crédito rural (SICOR). A confiança aparece em toda linha: por padrão a lista mostra só alta e média.
          Clique num imóvel para abrir a ficha, confirmar a cultura e vincular o cliente.
        </p>
      </div>

      {/* filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <select value={f.municipio} onChange={(e) => mudar({ municipio: e.target.value })} style={input}>
          <option value="">Todos os municípios</option>
          {(apoio?.municipios || []).map((m) => <option key={m.ibge} value={String(m.ibge)}>{m.nome}</option>)}
        </select>
        <select value={f.cultura} onChange={(e) => mudar({ cultura: e.target.value })} style={input}>
          <option value="">Todas as culturas</option>
          {(apoio?.culturas || []).filter((c) => !['mosaico', 'outro'].includes(c.codigo)).map((c) => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}
          <option value="_div">Diversificado</option>
        </select>
        {(['alta', 'media', 'baixa'] as const).map((c) => (
          <button key={c} type="button" onClick={() => alternarConf(c)} style={{ ...botao(CONF_COR[c], confAtivas.has(c)), opacity: confAtivas.has(c) ? 1 : .6 }}>{CONF_ROTULO[c]}</button>
        ))}
        <input value={f.areaMin} onChange={(e) => mudar({ areaMin: e.target.value.replace(/\D/g, '') })} placeholder="área mín. (ha)" style={{ ...input, width: 110 }} inputMode="numeric" />
        <input value={f.areaMax} onChange={(e) => mudar({ areaMax: e.target.value.replace(/\D/g, '') })} placeholder="área máx. (ha)" style={{ ...input, width: 110 }} inputMode="numeric" />
        <label style={{ ...botao(VERDE_ESCURO, f.credito), opacity: f.credito ? 1 : .6 }} onClick={() => mudar({ credito: !f.credito })}>com crédito 36 m</label>
        <label style={{ ...botao(VERDE_ESCURO, f.invest), opacity: f.invest ? 1 : .6 }} onClick={() => mudar({ invest: !f.invest })}>com investimento</label>
        <select value={f.vinculo} onChange={(e) => mudar({ vinculo: e.target.value })} style={input}>
          <option value="">Com ou sem cliente</option><option value="sem">Sem cliente vinculado</option><option value="com">Com cliente vinculado</option><option value="sugestao">Com sugestão pendente</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: borda, borderRadius: 6, padding: '3px 8px', background: 'var(--portal-bg-input,#fefefe)' }}>
          <Search size={14} style={{ color: mut }} />
          <input value={f.q} onChange={(e) => mudar({ q: e.target.value })} placeholder="código do CAR" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: txt, width: 140 }} />
        </div>
        <button type="button" onClick={() => { setPagina(0); setF(FILTROS_PADRAO) }} style={botao('#6b7280', false)}>Limpar</button>
        <button type="button" onClick={carregar} style={botao('#6b7280', false)}><RefreshCw size={13} /> Atualizar</button>
        <button type="button" disabled={exportando || !total} onClick={exportar} style={{ ...botao(VERDE_ESCURO, true), marginLeft: 'auto' }}><Download size={13} /> {exportando ? 'Exportando…' : 'Exportar CSV'}</button>
      </div>

      {erro && <div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, marginBottom: 10, background: 'rgba(245,158,11,.12)', borderLeft: '4px solid #f59e0b', color: txt, fontSize: 13 }}><AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} /> {erro}</div>}

      <div style={{ overflowX: 'auto', background: 'var(--portal-bg-card,#fefefe)', border: borda, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1150 }}>
          <thead>
            <tr>
              {COLUNAS.map((c) => {
                const ativa = !!c.ordem && ordem.col === c.ordem
                return (
                  <th key={c.rotulo} style={{ ...th, textAlign: c.direita ? 'right' : 'left', cursor: c.ordem ? 'pointer' : 'default', color: ativa ? VERDE_ESCURO : th.color }} onClick={() => ordenarPor(c)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {c.rotulo}
                      {c.ordem && (ativa ? (ordem.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: .35 }} />)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={COLUNAS.length} style={{ ...td, textAlign: 'center', color: mut }}>Carregando…</td></tr>}
            {!carregando && dados.length === 0 && <tr><td colSpan={COLUNAS.length} style={{ ...td, textAlign: 'center', color: mut }}>Nenhum imóvel neste filtro.</td></tr>}
            {!carregando && dados.map((i) => (
              <tr key={i.cod_car} onClick={() => setFicha(i.cod_car)} style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(22,163,74,.07)')} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{i.score_oportunidade != null ? Number(i.score_oportunidade).toFixed(1) : '—'}</td>
                <td style={td}>{i.municipio}</td>
                <td style={{ ...td, fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12 }} title={i.cod_car}>
                  {codCarCurto(i.cod_car)}
                  {Number(i.sobreposicao_pct) > 20 && <div style={{ fontSize: 11, color: '#b45309', fontFamily: 'inherit' }}>⚠ {Number(i.sobreposicao_pct).toFixed(0)}% sobreposto</div>}
                </td>
                <td style={td}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: corCultura(i.cultura_principal), marginRight: 6, border: '1px solid rgba(0,0,0,.2)' }} />
                  <b>{nomeCultura(i)}</b>
                  {i.pct_area_util != null && <span style={{ color: mut, fontSize: 12 }}> · {Number(i.pct_area_util).toFixed(0)}%</span>}
                  <div style={{ fontSize: 11, color: mut, maxWidth: 300 }}>{i.motivo_confianca}</div>
                </td>
                <td style={td}>{i.confianca && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#fefefe', background: CONF_COR[i.confianca] }}>{CONF_ROTULO[i.confianca]}</span>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtHa(i.area_ha)}<div style={{ fontSize: 11, color: mut }}>útil {fmtHa(i.area_util_ha)}</div></td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtHa(i.area_cultura_ha)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{Number(i.credito_36m) > 0 ? fmtBRL(i.credito_36m) : <span style={{ color: mut }}>—</span>}{i.ultimo_credito_em && <div style={{ fontSize: 11, color: mut }}>último {fmtData(i.ultimo_credito_em)}</div>}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: Number(i.credito_invest_36m) > 0 ? 800 : 400, color: Number(i.credito_invest_36m) > 0 ? VERDE_ESCURO : mut }}>{Number(i.credito_invest_36m) > 0 ? fmtBRL(i.credito_invest_36m) : '—'}</td>
                <td style={td}>
                  {(i.clientes || []).length > 0 ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#1d4ed8', fontWeight: 700 }}><Link2 size={12} /> {i.clientes!.join(' / ')}</span>
                    : i.sugestoes_pendentes ? <span style={{ color: '#b45309', fontSize: 12 }}>{i.sugestoes_pendentes} sugestão(ões)</span>
                    : <span style={{ color: mut, fontSize: 12 }}>sem vínculo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12, color: mut }}>
        <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => Math.max(p - 1, 0))} style={{ ...botao('#6b7280', false), opacity: pagina === 0 ? .4 : 1 }}>← Anterior</button>
        <span>página {pagina + 1} de {paginas.toLocaleString('pt-BR')}</span>
        <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)} style={{ ...botao('#6b7280', false), opacity: pagina + 1 >= paginas ? .4 : 1 }}>Próxima →</button>
        <span style={{ marginLeft: 'auto' }}>O CSV não leva dado de pessoa física de fonte pública — só o imóvel, a estimativa e o cliente vinculado pela Nova. Toda exportação fica registrada.</span>
      </div>

      {ficha && <FichaImovel codCar={ficha} onFechar={() => setFicha(null)} onMudou={carregar} />}
      {regras && <RegrasOportunidade onFechar={() => setRegras(false)} />}
    </div>
  )
}
