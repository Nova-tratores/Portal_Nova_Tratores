'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, MapPin, Check, AlertTriangle, Link2, Unlink, Search, ExternalLink } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { ROTULO_TIPO_VINCULO, TIPOS_VINCULO, rotuloTipoVinculo } from '@/lib/agro/vinculo'
import { CONF_COR, CONF_ROTULO, corCultura, explicarScore, fmtBRL, fmtData, fmtHa, linkMaps, pivotUso, type Confianca } from '@/lib/agro/prospeccao'

// Ficha do imóvel rural (CAR): abre da lista de prospecção e do mapa.
// Mostra SEMPRE a fonte e a confiança de cada dado; a validação de campo e o
// vínculo com cliente são as duas únicas escritas humanas do módulo.

const VERDE = '#16a34a'
const txt = 'var(--portal-text,#111111)'
const mut = 'var(--portal-text-muted,#6b7280)'
const borda = '1px solid var(--portal-border,#e5e7eb)'

const secao: React.CSSProperties = { border: borda, borderRadius: 10, padding: '12px 14px', background: 'var(--portal-bg-card,#fefefe)', minWidth: 0 }
const h3: React.CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: txt, textTransform: 'uppercase', letterSpacing: .4 }
const td: React.CSSProperties = { padding: '5px 8px', fontSize: 12, borderBottom: borda, color: txt, verticalAlign: 'top' }
const th: React.CSSProperties = { ...td, fontWeight: 700, color: 'var(--portal-text-secondary,#374151)', background: 'var(--portal-bg-secondary,#f3f4f6)', whiteSpace: 'nowrap' }
const botao = (cor: string, cheio: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fefefe' : cor, cursor: 'pointer',
})
const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: borda, background: 'var(--portal-bg-input,#fefefe)', color: txt, fontSize: 13, maxWidth: '100%' }

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 130px) minmax(0, 1fr)', gap: 8, fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: mut }}>{rotulo}</span><span style={{ color: txt, fontWeight: 600, wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

export default function FichaImovel({ codCar, onFechar, onMudou }: { codCar: string; onFechar: () => void; onMudou?: () => void }) {
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false)
  const [culturaReal, setCulturaReal] = useState('')
  const [obs, setObs] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [q, setQ] = useState('')
  const [achados, setAchados] = useState<any[]>([])
  const [tipoVinculo, setTipoVinculo] = useState('')   // obrigatório pra aceitar sugestão ou vincular

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const r = await fetch(`/api/agro/imovel/${encodeURIComponent(codCar)}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setD(j)
    } catch (e: any) { setErro(e?.message || 'Falha ao carregar a ficha') }
  }, [codCar])
  useEffect(() => { setD(null); carregar() }, [carregar])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  // busca de cliente (debounce)
  useEffect(() => {
    if (!buscando || q.trim().length < 3) { setAchados([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/agro/clientes/buscar?q=${encodeURIComponent(q.trim())}`, { headers: await authHeaders() })
        const j = await r.json(); setAchados(j.clientes || [])
      } catch { setAchados([]) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, buscando])

  const acao = async (body: any, url = `/api/agro/imovel/${encodeURIComponent(codCar)}`) => {
    setOcupado(true); setErro(null)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setCorrigindo(false); setBuscando(false); setQ(''); setObs('')
      await carregar(); onMudou?.()
    } catch (e: any) { setErro(e?.message || 'Falha ao gravar') }
    finally { setOcupado(false) }
  }

  const p = d?.perfil
  const nomes = useMemo(() => Object.fromEntries((d?.culturas || []).map((c: any) => [c.codigo, c.nome])), [d])
  const pivot = useMemo(() => pivotUso(d?.uso || [], nomes), [d, nomes])
  const maps = linkMaps(p?.centroide)
  const conf = p?.confianca as Confianca | undefined
  const pendentes = (d?.sugestoes || []).filter((s: any) => s.status === 'pendente')

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 12px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 100%)', background: 'var(--portal-bg,#f9fafb)', borderRadius: 12, border: borda, boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        {/* cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '14px clamp(12px, 3vw, 16px)', borderBottom: borda, borderTop: `4px solid ${corCultura(p?.cultura_principal)}`, borderRadius: '12px 12px 0 0', background: 'var(--portal-bg-card,#fefefe)' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: corCultura(p?.cultura_principal), border: '1px solid rgba(0,0,0,.25)' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: txt }}>{p?.cultura_nome || (d ? 'Diversificado' : 'Carregando…')}</h2>
              {conf && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#fefefe', background: CONF_COR[conf] }}>confiança {CONF_ROTULO[conf]}</span>}
              {p?.score_oportunidade != null && <span style={{ fontSize: 12, fontWeight: 800, color: txt }}>score {Number(p.score_oportunidade).toFixed(1)}</span>}
            </div>
            <div style={{ fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12, color: mut, marginTop: 4, wordBreak: 'break-all' }}>{codCar}</div>
            <div style={{ fontSize: 13, color: txt, marginTop: 2 }}>{d?.imovel?.municipio}{d?.imovel ? ` · ${fmtHa(d.imovel.area_ha)} (${d.imovel.modulos_fiscais ? Number(d.imovel.modulos_fiscais).toFixed(1) + ' módulos fiscais' : '—'})` : ''}</div>
          </div>
          {maps && <a href={maps} target="_blank" rel="noreferrer" style={{ ...botao('#1d4ed8', false), textDecoration: 'none' }}><MapPin size={13} /> Google Maps <ExternalLink size={11} /></a>}
          <button type="button" onClick={onFechar} style={{ ...botao('#6b7280', false), padding: 6, minWidth: 36, minHeight: 36, justifyContent: 'center' }} title="Fechar (Esc)"><X size={16} /></button>
        </div>

        {erro && <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'rgba(220,38,38,.10)', borderLeft: '4px solid #dc2626', color: txt, fontSize: 13 }}><AlertTriangle size={16} style={{ color: '#dc2626' }} /> {erro}</div>}
        {!d && !erro && <div style={{ padding: 30, textAlign: 'center', color: mut }}>Carregando a ficha…</div>}

        {d && (
          <div style={{ padding: 'clamp(8px, 2.5vw, 14px)', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))' }}>
            {/* perfil */}
            <section style={secao}>
              <h3 style={h3}>Perfil estimado · safra {p?.ano_safra ?? '—'}</h3>
              <Dado rotulo="Cultura principal">{p?.cultura_nome || 'Diversificado'} {p?.area_cultura_ha != null && <span style={{ fontWeight: 400, color: mut }}>· {fmtHa(p.area_cultura_ha)} · {p.pct_area_util != null ? Number(p.pct_area_util).toFixed(0) + '% da área útil' : ''}</span>}</Dado>
              <Dado rotulo="Fonte">{p?.fonte_principal === 'campo' ? 'Validação de campo' : p?.fonte_principal === 'sicor' ? 'Crédito rural (SICOR)' : 'MapBiomas (satélite)'}</Dado>
              <Dado rotulo="Por que esta confiança"><span style={{ fontWeight: 400 }}>{p?.motivo_confianca || '—'}</span></Dado>
              <Dado rotulo="Área útil">{fmtHa(d.imovel.area_util_ha)} <span style={{ fontWeight: 400, color: mut }}>de {fmtHa(d.imovel.area_ha)} (sem mata, APP e água)</span></Dado>
              <Dado rotulo="SICAR">{d.imovel.condicao || '—'}</Dado>
              {explicarScore(p?.score_detalhe).length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 12, color: mut, cursor: 'pointer' }}>Como o score {p?.score_oportunidade != null ? Number(p.score_oportunidade).toFixed(1) : ''} foi calculado</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: txt, listStyle: 'disc' }}>{explicarScore(p?.score_detalhe).map((l, i) => <li key={i}>{l}</li>)}</ul>
                </details>
              )}
              {p?.cultura_principal === 'milho' || (d.operacoes || []).some((o: any) => o.cultura_codigo === 'milho') ? null : (
                <div style={{ fontSize: 11, color: mut, marginTop: 8 }}>Milho não aparece no satélite (MapBiomas não separa); só entra quando há crédito rural de milho.</div>
              )}

              {/* validação de campo */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: borda }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 6 }}>Você conhece este imóvel? A cultura está certa?</div>
                {!corrigindo ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" disabled={ocupado || !p?.cultura_principal} onClick={() => acao({ acao: 'validar', cultura_real: p.cultura_principal, confirmou: true })} style={botao(VERDE, true)} title={p?.cultura_principal ? '' : 'Sem cultura estimada para confirmar — use "Cultura errada"'}><Check size={13} /> Cultura confirmada</button>
                    <button type="button" disabled={ocupado} onClick={() => { setCorrigindo(true); setCulturaReal('') }} style={botao('#dc2626', false)}>Cultura errada → qual é?</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={culturaReal} onChange={(e) => setCulturaReal(e.target.value)} style={input}>
                      <option value="">escolha a cultura real…</option>
                      {(d.culturas || []).filter((c: any) => c.codigo !== 'mosaico').map((c: any) => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}
                    </select>
                    <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="observação (opcional)" style={{ ...input, flex: 1, minWidth: 140 }} />
                    <button type="button" disabled={ocupado || !culturaReal} onClick={() => acao({ acao: 'validar', cultura_real: culturaReal, confirmou: false, observacao: obs })} style={botao(VERDE, true)}>Gravar</button>
                    <button type="button" onClick={() => setCorrigindo(false)} style={botao('#6b7280', false)}>Cancelar</button>
                  </div>
                )}
                {(d.validacoes || []).slice(0, 3).map((v: any) => (
                  <div key={v.id} style={{ fontSize: 11, color: mut, marginTop: 4 }}>
                    {fmtData(v.informado_em)} · {v.informado_por} {v.confirmou ? 'confirmou' : 'corrigiu para'} <b>{nomes[v.cultura_real] || v.cultura_real}</b>{v.observacao ? ` — ${v.observacao}` : ''}
                  </div>
                ))}
              </div>
            </section>

            {/* cliente */}
            <section style={secao}>
              <h3 style={h3}>Cliente da Nova</h3>
              {(d.vinculos || []).length === 0 && <div style={{ fontSize: 13, color: mut }}>Nenhum cliente vinculado a este imóvel.</div>}
              {(d.vinculos || []).map((v: any) => (
                <div key={`${v.cliente_omie_id}|${v.tipo || ''}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: borda }}>
                  <Link2 size={14} style={{ color: '#1d4ed8', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: txt }}>{v.cliente_nome || 'cliente'} <span style={{ fontWeight: 400, color: mut, fontSize: 11 }}>Omie {v.cliente_omie_id}</span></div>
                    <div style={{ fontSize: 11, color: mut }}>{'tipo' in v ? `${rotuloTipoVinculo(v.tipo)} · ` : ''}{v.origem === 'sugerido' ? 'sugestão aceita' : v.origem} · {v.confirmado_por} · {fmtData(v.confirmado_em)}{v.observacao ? ` · ${v.observacao}` : ''}</div>
                  </div>
                  <a href={`/feedbacks/atendimento/${encodeURIComponent('omie_' + v.cliente_omie_id)}`} style={{ ...botao('#d97706', false), textDecoration: 'none' }} title="Abrir o cockpit de atendimento deste cliente">Cockpit</a>
                  <button type="button" disabled={ocupado} onClick={() => { if (confirm('Remover o vínculo deste cliente com o imóvel?')) acao({ acao: 'desvincular', cliente_omie_id: v.cliente_omie_id, tipo: v.tipo }) }} style={{ ...botao('#dc2626', false), padding: 6 }} title="Remover vínculo"><Unlink size={13} /></button>
                </div>
              ))}
              {pendentes.map((s: any) => (
                <div key={s.cliente_ref} style={{ padding: '8px 10px', marginTop: 8, borderRadius: 8, background: 'rgba(245,158,11,.10)', borderLeft: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: 13, color: txt }}><b>Sugestão:</b> {s.cliente_nome} <span style={{ color: mut, fontSize: 11 }}>· {s.motivo}</span></div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={tipoVinculo} onChange={(e) => setTipoVinculo(e.target.value)} style={{ ...input, fontSize: 12 }} title="Papel do cliente neste imóvel">
                      <option value="">Tipo de vínculo…</option>
                      {TIPOS_VINCULO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_VINCULO[t]}</option>)}
                    </select>
                    <button type="button" disabled={ocupado || !tipoVinculo} title={tipoVinculo ? undefined : 'Escolha o tipo de vínculo antes de aceitar'} onClick={() => acao({ cod_car: codCar, cliente_ref: s.cliente_ref, aceitar: true, tipo: tipoVinculo }, '/api/agro/vinculos/sugestoes')} style={{ ...botao(VERDE, true), opacity: tipoVinculo ? 1 : .5 }}><Check size={13} /> Aceitar</button>
                    <button type="button" disabled={ocupado} onClick={() => acao({ cod_car: codCar, cliente_ref: s.cliente_ref, aceitar: false }, '/api/agro/vinculos/sugestoes')} style={botao('#dc2626', false)}><X size={13} /> Rejeitar</button>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                {!buscando ? (
                  <button type="button" onClick={() => setBuscando(true)} style={botao('#1d4ed8', false)}><Search size={13} /> Vincular um cliente</button>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select value={tipoVinculo} onChange={(e) => setTipoVinculo(e.target.value)} style={{ ...input, fontSize: 12 }} title="Papel do cliente neste imóvel">
                      <option value="">Tipo de vínculo…</option>
                      {TIPOS_VINCULO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_VINCULO[t]}</option>)}
                    </select>
                      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, fazenda ou CPF/CNPJ (mín. 3 letras)" style={{ ...input, flex: 1 }} />
                      <button type="button" onClick={() => { setBuscando(false); setQ('') }} style={botao('#6b7280', false)}>Cancelar</button>
                    </div>
                    <div style={{ maxHeight: 190, overflowY: 'auto', marginTop: 6 }}>
                      {achados.map((c) => (
                        <button key={c.cliente_omie_id} type="button" disabled={ocupado || !tipoVinculo} title={tipoVinculo ? undefined : 'Escolha o tipo de vínculo primeiro'} onClick={() => acao({ acao: 'vincular', cliente_omie_id: c.cliente_omie_id, cliente_nome: c.nome, tipo: tipoVinculo })}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: borda, borderRadius: 6, marginBottom: 4, background: 'var(--portal-bg-card,#fefefe)', cursor: 'pointer', color: txt }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nome}</div>
                          <div style={{ fontSize: 11, color: mut }}>{[c.razao_social !== c.nome ? c.razao_social : null, c.documento, c.cidade, `Omie ${c.cliente_omie_id}`].filter(Boolean).join(' · ')}</div>
                        </button>
                      ))}
                      {q.trim().length >= 3 && achados.length === 0 && <div style={{ fontSize: 12, color: mut, padding: 6 }}>Nenhum cliente encontrado.</div>}
                    </div>
                  </div>
                )}
              </div>
              {(d.visitas || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: txt, marginBottom: 4 }}>Visitas do CRM dentro deste imóvel</div>
                  {d.visitas.slice(0, 6).map((v: any) => (
                    <div key={v.id} style={{ fontSize: 12, color: txt, padding: '4px 0', borderBottom: borda }}>
                      <b>{fmtData(v.data_visita)}</b> · {v.vendedor_nome} · {v.cliente_nome}{v.propriedade_nome ? ` (${v.propriedade_nome})` : ''}
                      {v.resumo && <div style={{ color: mut, fontSize: 11 }}>{v.resumo}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* uso do solo */}
            <section style={secao}>
              <h3 style={h3}>Uso do solo por safra <span style={{ fontWeight: 400, textTransform: 'none', color: mut }}>· MapBiomas, hectares</span></h3>
              {pivot.linhas.length === 0 ? <div style={{ fontSize: 13, color: mut }}>Sem classe de uso agropecuário no satélite.</div> : (
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Cultura</th>{pivot.anos.map((a) => <th key={a} style={{ ...th, textAlign: 'right' }}>{a}</th>)}</tr></thead>
                  <tbody>
                    {pivot.linhas.map((l) => (
                      <tr key={l.codigo}>
                        <td style={td}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: corCultura(l.codigo), marginRight: 6 }} />{l.nome}</td>
                        {pivot.anos.map((a) => <td key={a} style={{ ...td, textAlign: 'right' }}>{l.porAno[a] != null ? Number(l.porAno[a]).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>

            {/* crédito */}
            <section style={secao}>
              <h3 style={h3}>Crédito rural <span style={{ fontWeight: 400, textTransform: 'none', color: mut }}>· SICOR, via {d.glebas} gleba(s) dentro do imóvel</span></h3>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: txt, marginBottom: 6 }}>
                <span>12 meses: <b>{fmtBRL(p?.credito_12m)}</b></span><span>36 meses: <b>{fmtBRL(p?.credito_36m)}</b></span>
                <span>investimento 36 m: <b style={{ color: Number(p?.credito_invest_36m) > 0 ? VERDE : txt }}>{fmtBRL(p?.credito_invest_36m)}</b></span>
              </div>
              {(d.operacoes || []).length === 0 ? <div style={{ fontSize: 13, color: mut }}>Nenhuma operação com gleba neste imóvel (só 1 em cada 3 operações de SP tem gleba registrada).</div> : (
                <div style={{ maxHeight: 230, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Emissão</th><th style={th}>Finalidade</th><th style={th}>Produto</th><th style={{ ...th, textAlign: 'right' }}>Valor no imóvel</th></tr></thead>
                    <tbody>
                      {d.operacoes.map((o: any) => (
                        <tr key={`${o.ref_bacen}-${o.nu_ordem}`}>
                          <td style={td}>{fmtData(o.dt_emissao)}</td>
                          <td style={{ ...td, fontWeight: (o.finalidade || '').startsWith('Invest') ? 800 : 400 }}>{o.finalidade}</td>
                          <td style={td}>{o.produto}</td>
                          <td style={{ ...td, textAlign: 'right' }} title={o.fracao < 0.999 ? `contrato de ${fmtBRL(o.valor)}; ${o.glebas_no_imovel} de ${o.glebas_na_operacao} glebas caem aqui` : ''}>{fmtBRL(o.valor_rateado)}{o.fracao < 0.999 && <span style={{ color: mut }}> *</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: mut, marginTop: 4 }}>* contrato com glebas em mais de um imóvel: valor rateado pela área das glebas.</div>
                </div>
              )}
            </section>

            {/* sobreposições */}
            {(d.sobreposicoes || []).length > 0 && (
              <section style={{ ...secao, gridColumn: '1 / -1' }}>
                <h3 style={h3}>Sobreposição com outros CARs <span style={{ fontWeight: 400, textTransform: 'none', color: mut }}>· acima de 20% a confiança cai</span></h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {d.sobreposicoes.slice(0, 12).map((s: any) => {
                    const outro = s.cod_car_a === codCar ? s.cod_car_b : s.cod_car_a
                    const pct = s.cod_car_a === codCar ? s.pct_a : s.pct_b
                    return <span key={outro} title={outro} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: borda, color: txt, background: Number(pct) > 20 ? 'rgba(245,158,11,.15)' : 'transparent', fontFamily: 'ui-monospace,Consolas,monospace' }}>{outro.slice(0, 11)}…{outro.slice(-4)} · {fmtHa(s.area_sobreposta_ha)} · {Number(pct).toFixed(0)}%</span>
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
