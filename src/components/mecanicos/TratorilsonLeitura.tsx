'use client'
// Tratorilson no topo do Centro do Pós-Vendas (José, 16/10/2026) — sem aba própria.
// Faixa: a manchete de agora (situação boa/atenção/crítica) + os pontos que ele ligou.
// Clicar abre o painel lateral com a leitura completa e o lugar para ENSINAR o Tratorilson.
// A análise se refaz sozinha quando passa de 3 h (o servidor gera por trás; aqui só pergunta de novo).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { Analise, TipoDestaque } from '@/lib/mecanicos/analise'
import { leituraRapida, porDiaDe } from '@/lib/mecanicos/fita'
import { useBasePosVendas } from './useBasePosVendas'

interface Ensinamento { id: number; conteudo: string }
interface Guardada { analise: Analise; geradaEm: string; por: string | null }

const ETAPAS = ['Lendo as horas das últimas 8 semanas…', 'Conferindo faturamento, km e OS internas…', 'Cruzando com as ocorrências de cada um…', 'Olhando a agenda dos próximos 14 dias…', 'Ligando os pontos…', 'Escrevendo a leitura…']
const SIT: Record<TipoDestaque, { cor: string; fundo: string; rotulo: string; icone: string }> = {
  bom: { cor: '#047857', fundo: '#ecfdf5', rotulo: 'Situação boa', icone: 'fa-circle-check' },
  atencao: { cor: '#b45309', fundo: '#fffbeb', rotulo: 'Atenção', icone: 'fa-triangle-exclamation' },
  critico: { cor: '#b91c1c', fundo: '#fef2f2', rotulo: 'Situação crítica', icone: 'fa-circle-exclamation' },
}
const TXT = 'var(--portal-text, #0f172a)', MUDO = 'var(--portal-text-muted, #64748b)', BORDA = 'var(--portal-border, #e5e7eb)'
const EXEMPLOS = [
  'Semana fechada com menos de 25 h faturadas por técnico é preocupante; menos de 15 h é crítico.',
  'Técnico com dia livre na agenda deve receber revisão de cliente com revisão vencendo.',
  'Excesso de velocidade 2 vezes no mês: sugerir conversa individual.',
]

async function api(body?: object) {
  const r = await fetch('/api/mecanicos/analise', body
    ? { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: await authHeaders(), cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
  return j
}

export default function TratorilsonLeitura() {
  const [ultima, setUltima] = useState<Guardada | null>(null)
  const [ens, setEns] = useState<Ensinamento[]>([])
  const [gerando, setGerando] = useState(false)
  const [carregou, setCarregou] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [agoraMs, setAgoraMs] = useState(0)
  // enquanto a leitura do Tratorilson não chega, a faixa já mostra os números do momento
  const { base } = useBasePosVendas()
  const rapida = useMemo(() => (base ? leituraRapida(porDiaDe(base.faturadas), new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) : null), [base])

  const carregar = useCallback(async () => {
    try { const j = await api(); setUltima(j.ultima); setEns(j.ensinamentos || []); setGerando(!!j.gerando); setErro('') }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setCarregou(true) }
  }, [])
  useEffect(() => { let vivo = true; Promise.resolve().then(() => { if (vivo) void carregar() }); return () => { vivo = false } }, [carregar])
  // enquanto o servidor gera, pergunta de novo a cada 6 s
  useEffect(() => { if (!gerando) return; const t = setTimeout(() => void carregar(), 6000); return () => clearTimeout(t) }, [gerando, carregar, ultima])
  useEffect(() => { if (!gerando) return; const t = setInterval(() => setEtapa((e) => (e + 1) % ETAPAS.length), 1800); return () => clearInterval(t) }, [gerando])
  useEffect(() => { const tick = () => setAgoraMs(Date.now()); const t0 = setTimeout(tick, 0), t = setInterval(tick, 60_000); return () => { clearTimeout(t0); clearInterval(t) } }, [ultima])

  const refazer = async () => {
    setGerando(true); setErro('')
    try { const j = await api({ acao: 'analisar' }); setUltima(j.ultima) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setGerando(false) }
  }

  const a = ultima?.analise
  const sit = SIT[a?.situacao || 'atencao']
  const ha = ultima && agoraMs ? Math.max(0, Math.round((agoraMs - Date.parse(ultima.geradaEm)) / 60_000)) : null
  const quando = ha == null ? '' : ha < 1 ? 'agora' : ha < 60 ? `há ${ha} min` : `há ${Math.round(ha / 60)} h`
  const pontos = a ? [...a.conexoes.map((c) => c.titulo || c.texto), ...a.destaques.filter((d) => d.tipo !== 'bom').map((d) => d.titulo)].filter(Boolean).slice(0, 3) : []

  return (
    <>
      <style>{ESTILO}</style>
      <div className={`tl-faixa cpv-entra ${gerando ? 'tl-pensando' : ''}`} role="button" tabIndex={0}
        onClick={() => setAberto(true)} onKeyDown={(e) => { if (e.key === 'Enter') setAberto(true) }}
        style={{ borderLeftColor: a ? sit.cor : '#cbd5e1' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tl-rotulo">
            Tratorilson · leitura de agora
            {a && !gerando && <span className="tl-sit" style={{ color: sit.cor, background: sit.fundo }}><i className={`fas ${sit.icone}`} /> {sit.rotulo}</span>}
          </div>
          {!a && rapida ? (
            <>
              <div className="tl-manchete">{rapida.texto}</div>
              <div className="tl-chips"><span className="tl-chip" style={{ color: MUDO, background: 'transparent', paddingLeft: 0 }}>{gerando ? <><span className="tl-pontos"><span /><span /><span /></span> <span key={etapa} className="tl-etapa">{ETAPAS[etapa]}</span></> : 'leitura rápida dos números'}</span></div>
            </>
          ) : gerando && !a ? (
            <div className="tl-manchete" style={{ color: MUDO }}><span className="tl-pontos"><span /><span /><span /></span> <span key={etapa} className="tl-etapa">{ETAPAS[etapa]}</span></div>
          ) : a ? (
            <>
              <div className="tl-manchete">{a.manchete}</div>
              {pontos.length > 0 && (
                <div className="tl-chips">
                  {pontos.map((p, i) => <span key={i} className="tl-chip" style={{ animationDelay: `${200 + i * 90}ms` }}><i className="fas fa-link" /> {p}</span>)}
                </div>
              )}
            </>
          ) : (
            <div className="tl-manchete" style={{ color: MUDO }}>{carregou ? (erro || 'Ainda não há leitura. Clique para pedir.') : 'Carregando…'}</div>
          )}
        </div>
        <div className="tl-lado">
          <span className="tl-abrir">Ver leitura completa <i className="fas fa-chevron-right" /></span>
          <span className="tl-quando">{gerando ? <><i className="fas fa-circle-notch fa-spin" /> {a ? 'atualizando…' : ''}</> : quando && `lida ${quando}`}</span>
        </div>
      </div>

      {aberto && <Painel ultima={ultima} ens={ens} setEns={setEns} gerando={gerando} etapa={etapa} quando={quando} onRefazer={refazer} onFechar={() => setAberto(false)} erro={erro} />}
    </>
  )
}

function Painel({ ultima, ens, setEns, gerando, etapa, quando, onRefazer, onFechar, erro }: {
  ultima: Guardada | null; ens: Ensinamento[]; setEns: (e: Ensinamento[]) => void; gerando: boolean; etapa: number; quando: string
  onRefazer: () => void; onFechar: () => void; erro: string
}) {
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  const mexer = async (body: object, depois?: () => void) => {
    setSalvando(true)
    try { const j = await api(body); setEns(j.ensinamentos || []); depois?.() }
    catch (e) { alert(e instanceof Error ? e.message : 'Falha') } finally { setSalvando(false) }
  }
  const a = ultima?.analise
  const sit = SIT[a?.situacao || 'atencao']
  return (
    <div className="tl-fundo" onClick={onFechar}>
      <aside className="tl-painel" onClick={(e) => e.stopPropagation()}>
        <div className="tl-cab">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: TXT }}>Leitura do Tratorilson</div>
            <div style={{ fontSize: 13, color: MUDO }}>{gerando ? ETAPAS[etapa] : quando ? `lida ${quando}${ultima?.por ? ` · ${ultima.por}` : ''}` : ''}</div>
          </div>
          <button type="button" className="tl-btn" onClick={onRefazer} disabled={gerando}><i className={`fas ${gerando ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} /> Ler de novo</button>
          <button type="button" className="tl-btn tl-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>

        <div className="tl-corpo">
          {erro && <div style={{ background: '#fef2f2', color: '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>{erro}</div>}
          {a && (
            <>
              <section className="tl-sec" style={{ background: sit.fundo, borderColor: `${sit.cor}33` }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: sit.cor, textTransform: 'uppercase', letterSpacing: .5 }}><i className={`fas ${sit.icone}`} /> {sit.rotulo}</div>
                <div style={{ fontSize: 19, fontWeight: 900, color: TXT, margin: '6px 0' }}>{a.manchete}</div>
                <div style={{ fontSize: 15, lineHeight: 1.65, color: TXT }}>{a.resumo}</div>
              </section>

              {a.conexoes.length > 0 && (
                <section className="tl-sec">
                  <h3><i className="fas fa-diagram-project" /> Ligando os pontos</h3>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {a.conexoes.map((c, i) => (
                      <div key={i} className="tl-conexao cpv-entra" style={{ animationDelay: `${i * 80}ms` }}>
                        {c.titulo && <b>{c.titulo}</b>}
                        <span>{c.texto}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {a.acoes.length > 0 && (
                <section className="tl-sec">
                  <h3><i className="fas fa-list-check" /> O que fazer</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {a.acoes.map((x, i) => (
                      <div key={i} className="tl-acao cpv-entra" style={{ animationDelay: `${i * 70}ms` }}>
                        <span className="tl-num">{i + 1}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: TXT }}>{x.oque}</div>
                          <div style={{ fontSize: 13, color: MUDO, display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                            {x.quem && <span><i className="fas fa-user" /> {x.quem}</span>}{x.quando && <span><i className="fas fa-clock" /> {x.quando}</span>}
                          </div>
                          {x.porque && <div style={{ fontSize: 13.5, color: TXT, marginTop: 4 }}>{x.porque}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {a.destaques.length > 0 && (
                <section className="tl-sec">
                  <h3><i className="fas fa-star" /> Destaques</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {a.destaques.map((d, i) => (
                      <div key={i} style={{ borderLeft: `4px solid ${SIT[d.tipo].cor}`, background: SIT[d.tipo].fundo, borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5, color: TXT }}>{d.titulo}</div>
                        <div style={{ fontSize: 14, color: TXT, marginTop: 2 }}>{d.texto}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {a.porTecnico.length > 0 && (
                <section className="tl-sec">
                  <h3><i className="fas fa-user-gear" /> Pessoa por pessoa</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {a.porTecnico.map((t, i) => (
                      <div key={i} style={{ border: `1px solid ${BORDA}`, borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5, color: TXT }}>{t.tecnico}</div>
                        <div style={{ fontSize: 14, color: TXT, marginTop: 2, lineHeight: 1.5 }}>{t.leitura}</div>
                        {t.acao && <div style={{ fontSize: 13.5, marginTop: 5, color: '#0369a1', fontWeight: 700 }}><i className="fas fa-arrow-right" /> {t.acao}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(a.proximosDias.leitura || a.proximosDias.alertas.length > 0) && (
                <section className="tl-sec">
                  <h3><i className="fas fa-calendar-days" /> Próximos 14 dias</h3>
                  {a.proximosDias.leitura && <div style={{ fontSize: 14.5, lineHeight: 1.6, color: TXT }}>{a.proximosDias.leitura}</div>}
                  {a.proximosDias.alertas.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: TXT }}>{a.proximosDias.alertas.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                </section>
              )}
            </>
          )}

          {/* ensinar */}
          <section className="tl-sec" style={{ borderStyle: 'dashed' }}>
            <h3><i className="fas fa-graduation-cap" /> Ensinar o Tratorilson</h3>
            <div style={{ fontSize: 13.5, color: MUDO, lineHeight: 1.5, marginBottom: 8 }}>
              Ele já sabe as regras da casa (meta de 40 h, o que é OS interna, como ler hora ociosa, pontuação). Aqui você ensina <b>como a gestão pensa</b>: o que é bom, o que é ruim e o que fazer. Vale para as próximas leituras.
            </div>
            <textarea value={novo} onChange={(e) => setNovo(e.target.value)} rows={3} placeholder={`Ex.: ${EXEMPLOS[0]}`}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && novo.trim()) void mexer({ acao: 'ensinar', conteudo: novo }, () => setNovo('')) }}
              className="tl-texto" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 10px' }}>
              <button type="button" className="tl-btn tl-roxo" disabled={salvando || novo.trim().length < 5} onClick={() => mexer({ acao: 'ensinar', conteudo: novo }, () => setNovo(''))}><i className="fas fa-plus" /> Ensinar</button>
              <span style={{ fontSize: 12, color: MUDO }}>Ctrl+Enter</span>
            </div>
            {ens.length === 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: MUDO }}>Ideias (clique para usar):</div>
                {EXEMPLOS.map((x) => <button key={x} type="button" className="tl-ens" style={{ cursor: 'pointer', textAlign: 'left', borderStyle: 'dashed' }} onClick={() => setNovo(x)}>{x}</button>)}
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {ens.map((e, i) => (
                <div key={e.id} className="tl-ens">
                  {editando?.id === e.id ? (
                    <>
                      <textarea value={editando.texto} onChange={(ev) => setEditando({ id: e.id, texto: ev.target.value })} rows={3} autoFocus className="tl-texto" />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button type="button" className="tl-btn tl-roxo" disabled={salvando} onClick={() => mexer({ acao: 'editar', id: e.id, conteudo: editando.texto }, () => setEditando(null))}>Salvar</button>
                        <button type="button" className="tl-btn" onClick={() => setEditando(null)}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <b style={{ color: '#7c3aed' }}>{i + 1}.</b>
                      <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{e.conteudo}</span>
                      <button type="button" className="tl-mini" title="Editar" onClick={() => setEditando({ id: e.id, texto: e.conteudo })}><i className="fas fa-pen" /></button>
                      <button type="button" className="tl-mini" title="Apagar" disabled={salvando} onClick={() => { if (confirm('Apagar este ensinamento?')) void mexer({ acao: 'apagar', id: e.id }) }}><i className="fas fa-trash" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

const ESTILO = `
.tl-faixa { display: flex; align-items: center; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-left: 5px solid; border-radius: 16px; padding: 12px 16px; margin-bottom: 16px; cursor: pointer; transition: box-shadow .2s, transform .2s; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.tl-faixa:hover { box-shadow: 0 10px 26px rgba(15,23,42,.10); transform: translateY(-1px) }
.tl-rotulo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--portal-text-muted, #64748b) }
.tl-sit { text-transform: none; letter-spacing: 0; font-size: 12.5px; border-radius: 99px; padding: 2px 10px }
.tl-manchete { font-size: 17.5px; font-weight: 800; color: var(--portal-text, #0f172a); margin-top: 3px; line-height: 1.35; animation: tlEntra .5s ease both }
@keyframes tlEntra { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: none } }
.tl-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px }
.tl-chip { font-size: 12.5px; font-weight: 700; color: #0369a1; background: rgba(3,105,161,.07); border-radius: 99px; padding: 3px 10px; animation: tlEntra .5s ease both; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tl-lado { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0 }
.tl-abrir { font-size: 13.5px; font-weight: 800; color: #0369a1; white-space: nowrap }
.tl-quando { font-size: 12px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap }
.tl-pontos span { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #0369a1; margin: 0 2px; animation: tlPonto 1.2s infinite }
.tl-pontos span:nth-child(2) { animation-delay: .15s } .tl-pontos span:nth-child(3) { animation-delay: .3s }
@keyframes tlPonto { 0%, 80%, 100% { opacity: .2; transform: none } 40% { opacity: 1; transform: translateY(-4px) } }
.tl-etapa { animation: tlEntra .4s ease both; display: inline-block }
.tl-fundo { position: fixed; inset: 0; z-index: 9300; background: rgba(15,23,42,.35); backdrop-filter: blur(2px); display: flex; justify-content: flex-end; animation: tlFade .25s ease both }
@keyframes tlFade { from { opacity: 0 } to { opacity: 1 } }
.tl-painel { width: min(620px, 100%); height: 100%; background: var(--portal-bg, #f8fafc); box-shadow: -20px 0 50px rgba(15,23,42,.2); display: flex; flex-direction: column; animation: tlDesliza .35s cubic-bezier(.2,.8,.2,1) both }
@keyframes tlDesliza { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }
.tl-cab { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--portal-bg-card, #fefefe); border-bottom: 1px solid var(--portal-border, #e5e7eb) }
.tl-corpo { flex: 1; overflow-y: auto; padding: 16px 18px 40px; display: grid; gap: 14px; align-content: start }
.tl-sec { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 14px 16px }
.tl-sec h3 { margin: 0 0 10px; font-size: 13px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; color: var(--portal-text-muted, #475569) }
.tl-sec h3 i { color: #0369a1; margin-right: 6px }
.tl-conexao { display: grid; gap: 3px; border-left: 3px solid #0369a1; padding: 4px 0 4px 12px; font-size: 14.5px; line-height: 1.55; color: var(--portal-text, #0f172a) }
.tl-acao { display: flex; gap: 12px; align-items: flex-start }
.tl-num { width: 26px; height: 26px; border-radius: 50%; background: #0369a1; color: #fefefe; font-weight: 900; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.tl-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); border-radius: 10px; padding: 8px 12px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit }
.tl-btn:hover:not(:disabled) { border-color: #0369a1; color: #0369a1 }
.tl-btn:disabled { opacity: .5; cursor: default }
.tl-x { width: 36px; height: 36px; padding: 0; justify-content: center }
.tl-roxo { background: #7c3aed; color: #fefefe; border-color: #7c3aed } .tl-roxo:hover:not(:disabled) { color: #fefefe; background: #6d28d9 }
.tl-texto { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--portal-border, #d1d5db); padding: 9px 11px; font-size: 14px; font-family: inherit; resize: vertical; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a) }
.tl-ens { border: 1px solid var(--portal-border, #e5e7eb); border-radius: 10px; padding: 9px 11px; font-size: 14px; line-height: 1.5; background: var(--portal-bg-secondary, #f8fafc); color: var(--portal-text, #0f172a); font-family: inherit }
.tl-mini { border: none; background: transparent; cursor: pointer; color: var(--portal-text-muted, #64748b); padding: 2px 6px; border-radius: 6px }
.tl-mini:hover { background: rgba(100,116,139,.12) }
@media (max-width: 720px) { .tl-lado { display: none } .tl-manchete { font-size: 15.5px } }
`
