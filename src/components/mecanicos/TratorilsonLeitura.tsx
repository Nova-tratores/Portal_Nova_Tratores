'use client'
// Tratorilson no topo do Centro do Pós-Vendas (José, 16/10/2026) — sem aba própria.
// Faixa: situação de agora + as 3 ações mais urgentes + cada técnico com a cor da situação dele.
// Clicar abre o RELATÓRIO: plano de ação (com "feito"), técnico por técnico (pontos fortes,
// atenção, dicas e como puxar a conversa), ligações causa → efeito e "ensinar o Tratorilson".
// A análise se refaz sozinha quando passa de 3 h (o servidor gera por trás; aqui só pergunta de novo).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import type { Analise, TipoDestaque } from '@/lib/mecanicos/analise'
import { leituraRapida, porDiaDe } from '@/lib/mecanicos/fita'
import { useBasePosVendas } from './useBasePosVendas'

interface Ensinamento { id: number; conteudo: string }
interface Guardada { analise: Analise; geradaEm: string; por: string | null }
type Aba = 'plano' | 'tecnicos' | 'ligacoes' | 'ensinar'

const ETAPAS = ['Lendo as horas das últimas 8 semanas…', 'Conferindo faturamento, km e OS internas…', 'Cruzando com as ocorrências de cada um…', 'Olhando a agenda dos próximos 14 dias…', 'Ligando os pontos…', 'Escrevendo as dicas de cada técnico…']
const SIT: Record<TipoDestaque, { cor: string; fundo: string; rotulo: string; icone: string }> = {
  bom: { cor: '#047857', fundo: '#ecfdf5', rotulo: 'Situação boa', icone: 'fa-circle-check' },
  atencao: { cor: '#b45309', fundo: '#fffbeb', rotulo: 'Atenção', icone: 'fa-triangle-exclamation' },
  critico: { cor: '#b91c1c', fundo: '#fef2f2', rotulo: 'Situação crítica', icone: 'fa-circle-exclamation' },
}
const PRIO = { alta: { cor: '#dc2626', rotulo: 'Esta semana', fundo: '#fef2f2' }, media: { cor: '#d97706', rotulo: 'Este mês', fundo: '#fffbeb' }, baixa: { cor: '#0369a1', rotulo: 'Quando der', fundo: '#eff6ff' } } as const
const MUDO = 'var(--portal-text-muted, #64748b)'
const EXEMPLOS = [
  'Semana fechada com menos de 25 h faturadas por técnico é preocupante; menos de 15 h é crítico.',
  'Técnico com dia livre na agenda deve receber revisão de cliente com revisão vencendo.',
  'Excesso de velocidade 2 vezes no mês: sugerir conversa individual.',
]
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

async function api(body?: object) {
  const r = await fetch('/api/mecanicos/analise', body
    ? { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: await authHeaders(), cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
  return j
}

// ações marcadas como "feito" — por leitura, lembradas neste navegador
const chaveFeito = (g: string) => `tratorilson-feito:${g}`
const lerFeitos = (g: string): number[] => { try { return JSON.parse(localStorage.getItem(chaveFeito(g)) || '[]') } catch { return [] } }

/** Perguntas-chave: as do Tratorilson abrem o relatório; as outras levam até a parte da tela que responde. */
const PERGUNTAS: { txt: string; ic: string; relatorio?: Aba; alvo?: string }[] = [
  { txt: 'O que fazer agora?', ic: 'fa-list-check', relatorio: 'plano' },
  { txt: 'Quem precisa de atenção?', ic: 'fa-user-clock', relatorio: 'tecnicos' },
  { txt: 'Quanto faturamos?', ic: 'fa-chart-column', alvo: 'sec-1' },
  { txt: 'Para onde foi o dinheiro?', ic: 'fa-sack-dollar', alvo: 'sec-2' },
  { txt: 'Quanto falta para empatar?', ic: 'fa-scale-balanced', alvo: 'sim-alvos' },
  { txt: 'Quanto está parado sem faturar?', ic: 'fa-hourglass-half', alvo: 'sec-3' },
  { txt: 'Como estão as horas da equipe?', ic: 'fa-clock', alvo: 'aba:ocorrencias' },
]

export default function TratorilsonLeitura({ onIr }: { onIr?: (alvo: string) => void }) {
  const [ultima, setUltima] = useState<Guardada | null>(null)
  const [ens, setEns] = useState<Ensinamento[]>([])
  const [gerando, setGerando] = useState(false)
  const [carregou, setCarregou] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [aberto, setAberto] = useState<{ aba: Aba; tecnico?: string } | null>(null)
  const [erro, setErro] = useState('')
  const [agoraMs, setAgoraMs] = useState(0)
  const { base } = useBasePosVendas()
  const rapida = useMemo(() => (base ? leituraRapida(porDiaDe(base.faturadas), new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) : null), [base])

  const carregar = useCallback(async () => {
    try { const j = await api(); setUltima(j.ultima); setEns(j.ensinamentos || []); setGerando(!!j.gerando); setErro('') }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setCarregou(true) }
  }, [])
  useEffect(() => { let vivo = true; Promise.resolve().then(() => { if (vivo) void carregar() }); return () => { vivo = false } }, [carregar])
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
  const urgentes = (a?.acoes || []).slice(0, 3)

  return (
    <>
      <style>{ESTILO}</style>
      {/* só o rosto do Tratorilson + perguntas-chave que levam direto à resposta (José 19/10) */}
      <div className={`tl3 cpv-entra ${gerando ? 'tl3-pensando' : ''}`} style={{ '--c': a ? sit.cor : '#0369a1' } as React.CSSProperties}>
        <button type="button" className="tl3-bot" onClick={() => setAberto({ aba: 'plano' })}
          title={a ? `${sit.rotulo}: ${a.manchete}${quando ? ` (lida ${quando})` : ''}` : gerando ? 'Tratorilson lendo…' : rapida?.texto || 'Tratorilson'}>
          <span className="tl3-rosto"><i className="fas fa-robot" /></span>
          <i className="tl3-st"><i className={`fas ${a ? sit.icone : 'fa-circle'}`} /></i>
        </button>
        <div className="tl3-perg">
          <small>{gerando ? 'Tratorilson está lendo…' : 'Pergunte ao Tratorilson'}</small>
          <div>
            {PERGUNTAS.map((q, i) => (
              <button key={q.txt} type="button" className="tl3-q" style={{ animationDelay: `${150 + i * 60}ms` }}
                onClick={() => (q.relatorio ? setAberto({ aba: q.relatorio }) : onIr?.(q.alvo!))}>
                <i className={`fas ${q.ic}`} />{q.txt}{q.relatorio === 'plano' && urgentes.length > 0 && <em>{urgentes.length}</em>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {aberto && <Relatorio ultima={ultima} ens={ens} setEns={setEns} gerando={gerando} etapa={etapa} quando={quando} onRefazer={refazer} erro={erro}
        abaInicial={aberto.aba} tecnicoInicial={aberto.tecnico} onFechar={() => setAberto(null)} />}
    </>
  )
}

function Relatorio({ ultima, ens, setEns, gerando, etapa, quando, onRefazer, erro, abaInicial, tecnicoInicial, onFechar }: {
  ultima: Guardada | null; ens: Ensinamento[]; setEns: (e: Ensinamento[]) => void; gerando: boolean; etapa: number; quando: string
  onRefazer: () => void; erro: string; abaInicial: Aba; tecnicoInicial?: string; onFechar: () => void
}) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [feitos, setFeitos] = useState<number[]>([])
  const [copiado, setCopiado] = useState<string | null>(null)
  const a = ultima?.analise
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  useEffect(() => { if (!ultima) return; const t = setTimeout(() => setFeitos(lerFeitos(ultima.geradaEm)), 0); return () => clearTimeout(t) }, [ultima])
  useEffect(() => {
    if (aba !== 'tecnicos' || !tecnicoInicial) return
    const t = setTimeout(() => document.getElementById(`tl-tec-${tecnicoInicial}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
    return () => clearTimeout(t)
  }, [aba, tecnicoInicial])
  const marcar = (i: number) => {
    if (!ultima) return
    const n = feitos.includes(i) ? feitos.filter((x) => x !== i) : [...feitos, i]
    setFeitos(n); try { localStorage.setItem(chaveFeito(ultima.geradaEm), JSON.stringify(n)) } catch { /* sem armazenamento */ }
  }
  const copiar = async (t: string, k: string) => { try { await navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(null), 1500) } catch { /* sem clipboard */ } }
  const sit = SIT[a?.situacao || 'atencao']
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="rl-fundo" onClick={onFechar}>
      <div className="rl-caixa" onClick={(e) => e.stopPropagation()}>
        <style>{ESTILO}</style>
        <header className="rl-cab" style={{ background: `linear-gradient(120deg, ${sit.fundo}, var(--portal-bg-card, #fefefe) 60%)` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rl-sit" style={{ color: sit.cor }}><i className={`fas ${sit.icone}`} /> {sit.rotulo} · Tratorilson {quando && <small>· lida {quando}{ultima?.por ? ` por ${ultima.por}` : ''}</small>}</div>
            <h2>{a?.manchete || (gerando ? ETAPAS[etapa] : 'Sem leitura ainda')}</h2>
            {a?.resumo && <p>{a.resumo}</p>}
          </div>
          <div className="rl-cab-acoes">
            <button type="button" className="rl-btn" onClick={onRefazer} disabled={gerando}><i className={`fas ${gerando ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} /> {gerando ? 'Lendo…' : 'Ler de novo'}</button>
            <button type="button" className="rl-btn rl-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
          </div>
        </header>

        <nav className="rl-abas">
          {([['plano', 'Plano de ação', 'fa-list-check', a?.acoes.length], ['tecnicos', 'Técnico por técnico', 'fa-user-gear', a?.porTecnico.length], ['ligacoes', 'Ligando os pontos', 'fa-diagram-project', a?.conexoes.length], ['ensinar', 'Ensinar o Tratorilson', 'fa-graduation-cap', ens.length]] as [Aba, string, string, number | undefined][]).map(([k, r, ic, n]) => (
            <button key={k} type="button" className={aba === k ? 'on' : ''} onClick={() => setAba(k)}><i className={`fas ${ic}`} /> {r}{n ? <em>{n}</em> : null}</button>
          ))}
        </nav>

        <div className="rl-corpo">
          {erro && <div className="rl-erro">{erro}</div>}

          {aba === 'plano' && a && (
            <div className="rl-plano">
              {(['alta', 'media', 'baixa'] as const).map((p) => {
                const itens = a.acoes.map((x, i) => ({ x, i })).filter(({ x }) => x.prioridade === p)
                return (
                  <div key={p} className="rl-col">
                    <div className="rl-col-cab" style={{ color: PRIO[p].cor }}><i style={{ background: PRIO[p].cor }} /> {PRIO[p].rotulo} <em>{itens.length}</em></div>
                    {itens.length === 0 && <div className="rl-vazio">nada aqui</div>}
                    {itens.map(({ x, i }, k) => {
                      const ok = feitos.includes(i)
                      return (
                        <label key={i} className={`rl-acao ${ok ? 'rl-feito' : ''}`} style={{ animationDelay: `${k * 70}ms`, borderLeftColor: PRIO[p].cor }}>
                          <input type="checkbox" checked={ok} onChange={() => marcar(i)} />
                          <div>
                            <b>{x.oque}</b>
                            {x.porque && <span>{x.porque}</span>}
                            <div className="rl-meta">{x.quem && <span><i className="fas fa-user" /> {x.quem}</span>}{x.quando && <span><i className="fas fa-clock" /> {x.quando}</span>}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {aba === 'tecnicos' && a && (
            <div className="rl-tecs">
              {a.porTecnico.map((t, i) => {
                const s = SIT[t.situacao]
                return (
                  <article key={t.tecnico} id={`tl-tec-${t.tecnico}`} className={`rl-tec ${tecnicoInicial === t.tecnico ? 'rl-tec-foco' : ''}`} style={{ animationDelay: `${i * 70}ms`, borderTopColor: s.cor }}>
                    <div className="rl-tec-cab">
                      <span className="rl-av" style={{ background: s.cor }}>{iniciais(t.tecnico)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><b>{t.tecnico}</b><small style={{ color: s.cor }}><i className={`fas ${s.icone}`} /> {s.rotulo}</small></div>
                    </div>
                    {t.leitura && <p className="rl-leitura">{t.leitura}</p>}
                    <div className="rl-duas">
                      {t.pontosFortes.length > 0 && <div><h4 style={{ color: '#047857' }}><i className="fas fa-thumbs-up" /> Pontos fortes</h4><ul>{t.pontosFortes.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                      {t.atencao.length > 0 && <div><h4 style={{ color: '#b45309' }}><i className="fas fa-triangle-exclamation" /> Atenção</h4><ul>{t.atencao.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                    </div>
                    {t.dicas.length > 0 && (
                      <div className="rl-dicas">
                        <h4><i className="fas fa-lightbulb" /> O que fazer com ele</h4>
                        <ol>{t.dicas.map((x, k) => <li key={k}><span>{k + 1}</span>{x}</li>)}</ol>
                      </div>
                    )}
                    {t.conversa && (
                      <div className="rl-conversa">
                        <i className="fas fa-comment-dots" />
                        <p>“{t.conversa}”</p>
                        <button type="button" onClick={() => copiar(t.conversa, t.tecnico)} title="Copiar a frase">{copiado === t.tecnico ? <><i className="fas fa-check" /> copiada</> : <><i className="fas fa-copy" /> copiar</>}</button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          {aba === 'ligacoes' && a && (
            <div style={{ display: 'grid', gap: 12 }}>
              {a.conexoes.map((c, i) => {
                const nos = (c.titulo || '').split(/\s*(?:→|->|>)\s*/).filter(Boolean)
                return (
                  <div key={i} className="rl-lig" style={{ animationDelay: `${i * 90}ms` }}>
                    {nos.length > 1 ? <div className="rl-cadeia">{nos.map((n, k) => <span key={k}>{k > 0 && <i className="fas fa-arrow-right-long" />}<b>{n}</b></span>)}</div> : c.titulo && <b className="rl-lig-tit">{c.titulo}</b>}
                    <p>{c.texto}</p>
                  </div>
                )
              })}
              {a.destaques.length > 0 && (
                <div className="rl-dest">
                  {a.destaques.map((d, i) => <div key={i} style={{ borderLeftColor: SIT[d.tipo].cor, background: SIT[d.tipo].fundo }}><b>{d.titulo}</b><span>{d.texto}</span></div>)}
                </div>
              )}
              {(a.proximosDias.leitura || a.proximosDias.alertas.length > 0) && (
                <div className="rl-lig"><b className="rl-lig-tit"><i className="fas fa-calendar-days" /> Próximos 14 dias</b><p>{a.proximosDias.leitura}</p>{a.proximosDias.alertas.length > 0 && <ul>{a.proximosDias.alertas.map((x, k) => <li key={k}>{x}</li>)}</ul>}</div>
              )}
            </div>
          )}

          {aba === 'ensinar' && <Ensinar ens={ens} setEns={setEns} />}
          {!a && aba !== 'ensinar' && <div className="rl-vazio" style={{ padding: 40 }}>{gerando ? ETAPAS[etapa] : 'Clique em "Ler de novo" para o Tratorilson fazer a primeira leitura.'}</div>}
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

function Ensinar({ ens, setEns }: { ens: Ensinamento[]; setEns: (e: Ensinamento[]) => void }) {
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const mexer = async (body: object, depois?: () => void) => {
    setSalvando(true)
    try { const j = await api(body); setEns(j.ensinamentos || []); depois?.() }
    catch (e) { alert(e instanceof Error ? e.message : 'Falha') } finally { setSalvando(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
      <p style={{ margin: 0, color: MUDO, fontSize: 14, lineHeight: 1.55 }}>Ele já sabe as regras da casa (meta de 40 h, OS interna, como ler hora parada, pontuação, custo de terceiros, salários). Aqui você ensina <b>como a gestão pensa</b>: o que é bom, o que é ruim e o que fazer. Vale para as próximas leituras.</p>
      <textarea value={novo} onChange={(e) => setNovo(e.target.value)} rows={3} placeholder={`Ex.: ${EXEMPLOS[0]}`} className="rl-texto"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && novo.trim()) void mexer({ acao: 'ensinar', conteudo: novo }, () => setNovo('')) }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="rl-btn rl-roxo" disabled={salvando || novo.trim().length < 5} onClick={() => mexer({ acao: 'ensinar', conteudo: novo }, () => setNovo(''))}><i className="fas fa-plus" /> Ensinar</button>
        <span style={{ fontSize: 12, color: MUDO }}>Ctrl+Enter</span>
      </div>
      {ens.length === 0 && EXEMPLOS.map((x) => <button key={x} type="button" className="rl-ens rl-ex" onClick={() => setNovo(x)}><i className="fas fa-wand-magic-sparkles" /> {x}</button>)}
      {ens.map((e, i) => (
        <div key={e.id} className="rl-ens">
          {editando?.id === e.id ? (
            <div style={{ display: 'grid', gap: 6, width: '100%' }}>
              <textarea value={editando.texto} onChange={(ev) => setEditando({ id: e.id, texto: ev.target.value })} rows={3} autoFocus className="rl-texto" />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="rl-btn rl-roxo" disabled={salvando} onClick={() => mexer({ acao: 'editar', id: e.id, conteudo: editando.texto }, () => setEditando(null))}>Salvar</button>
                <button type="button" className="rl-btn" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <b style={{ color: '#7c3aed' }}>{i + 1}.</b>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{e.conteudo}</span>
              <button type="button" className="rl-mini" title="Editar" onClick={() => setEditando({ id: e.id, texto: e.conteudo })}><i className="fas fa-pen" /></button>
              <button type="button" className="rl-mini" title="Apagar" disabled={salvando} onClick={() => { if (confirm('Apagar este ensinamento?')) void mexer({ acao: 'apagar', id: e.id }) }}><i className="fas fa-trash" /></button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** A frase aparece sendo digitada (quando chega uma leitura nova ou ao abrir a tela). */
function Digitando({ texto }: { texto: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const passo = Math.max(1, Math.round(texto.length / 70))
    const t = setInterval(() => setN((x) => { if (x >= texto.length) { clearInterval(t); return x } return x + passo }), 18)
    return () => clearInterval(t)
  }, [texto])
  return <>{texto.slice(0, n)}{n < texto.length && <span className="tl-cursor" />}</>
}

const ESTILO = `
.tl3 { display: flex; gap: 14px; align-items: center; margin-bottom: 16px }
.tl3-bot { position: relative; width: 52px; height: 52px; flex-shrink: 0; border: none; background: transparent; padding: 0; cursor: pointer }
.tl3-rosto { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; font-size: 24px; color: #fefefe; background: linear-gradient(140deg, #0ea5e9, #0369a1); box-shadow: 0 8px 20px rgba(3,105,161,.3); transition: transform .25s }
.tl3-bot:hover .tl3-rosto { transform: translateY(-2px) rotate(-6deg) } .tl3-rosto i { animation: tl3Pisca 5s infinite } @keyframes tl3Pisca { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(.15) } }
.tl3-pensando .tl3-rosto i { animation: tlGira 1.4s linear infinite }
.tl3-st { position: absolute; right: -5px; bottom: -5px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fefefe; font-size: 11px; border: 3px solid var(--portal-bg, #f8fafc); font-style: normal }
.tl3-perg { flex: 1; min-width: 0; display: grid; gap: 5px } .tl3-perg > small { font-size: 11.5px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; color: var(--portal-text-muted, #64748b) }
.tl3-perg > div { display: flex; gap: 6px; flex-wrap: wrap }
.tl3-q { position: relative; display: inline-flex; gap: 7px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 6px 13px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--portal-text, #334155); cursor: pointer; animation: tlEntra .4s both; transition: border-color .2s, color .2s, transform .2s, box-shadow .2s }
.tl3-q i { color: #0369a1; font-size: 12px } .tl3-q:hover { border-color: #7dd3fc; color: #0369a1; transform: translateY(-2px); box-shadow: 0 6px 14px rgba(3,105,161,.12) }
.tl3-q em { font-style: normal; min-width: 17px; height: 17px; border-radius: 99px; background: #dc2626; color: #fefefe; font-size: 10.5px; font-weight: 900; display: grid; place-items: center; padding: 0 4px }
.tl2 { display: flex; align-items: stretch; gap: 0; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.05); transition: box-shadow .2s }
.tl2:hover { box-shadow: 0 12px 28px rgba(15,23,42,.08) }
.tl2-sit { width: 128px; flex-shrink: 0; border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-family: inherit; cursor: pointer; padding: 12px 8px }
.tl2-sit i { font-size: 26px } .tl2-sit b { font-size: 13.5px; font-weight: 900; text-align: center } .tl2-sit small { font-size: 11px; opacity: .8 }
.tl2-pensando .tl2-sit i { animation: tlGira 1.4s linear infinite } @keyframes tlGira { to { transform: rotate(360deg) } }
.tl2-meio { flex: 1; min-width: 0; padding: 12px 16px; cursor: pointer }
.tl2-rot { font-size: 11.5px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--portal-text-muted, #94a3b8) }
.tl2-manchete { font-size: 17px; font-weight: 800; color: var(--portal-text, #0f172a); margin-top: 2px; line-height: 1.35 }
.tl2-urg { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px }
.tl2-urg li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--portal-text, #334155); animation: tlEntra .45s ease both; min-width: 0 }
.tl2-urg li i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.tl2-urg li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.tl2-urg li em { font-style: normal; font-size: 12px; font-weight: 800; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 1px 8px; white-space: nowrap; flex-shrink: 0 }
@keyframes tlEntra { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: none } }
.tl2-lado { display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 10px; padding: 12px 16px; border-left: 1px solid var(--portal-border, #f1f5f9) }
.tl2-avs { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 260px }
.tl2-av { position: relative; width: 38px; height: 38px; border-radius: 50%; border: 3px solid; background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #0f172a); font-family: inherit; font-weight: 900; font-size: 12.5px; cursor: pointer; animation: tlPop .4s cubic-bezier(.3,1.5,.5,1) both; transition: transform .15s }
.tl2-av:hover { transform: scale(1.12) }
.tl2-av i { position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--portal-bg-card, #fefefe) }
@keyframes tlPop { from { opacity: 0; transform: scale(.4) } to { opacity: 1; transform: none } }
.tl2 { overflow: visible } .tl2-sit { border-radius: 17px 0 0 17px }
.tl2-botoes { display: flex; gap: 8px; align-items: center }
.tl2-dicas { position: relative }
.tl2-dicas-btn { position: relative; width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: #0369a1; cursor: pointer; transition: all .2s }
.tl2-dicas-btn:hover, .tl2-dicas-btn.on { background: #e0f2fe; border-color: #7dd3fc }
.tl2-dicas-btn em { position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; border-radius: 99px; background: #dc2626; color: #fefefe; font-style: normal; font-size: 10.5px; font-weight: 900; display: grid; place-items: center; padding: 0 4px; border: 2px solid var(--portal-bg-card, #fefefe) }
.tl2-balao { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; width: min(440px, 80vw); background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; box-shadow: 0 18px 40px rgba(15,23,42,.18); padding: 12px 14px; display: grid; gap: 8px; text-align: left; animation: tlBalao .25s cubic-bezier(.2,1.1,.3,1) both }
.tl2-balao::before { content: ''; position: absolute; top: -6px; right: 13px; width: 10px; height: 10px; background: inherit; border-left: 1px solid var(--portal-border, #e5e7eb); border-top: 1px solid var(--portal-border, #e5e7eb); transform: rotate(45deg) }
@keyframes tlBalao { from { opacity: 0; transform: translateY(-6px) scale(.97) } }
.tl2-balao > b { font-size: 13.5px; color: var(--portal-text, #0f172a) } .tl2-balao > b i { color: #0369a1 }
.tl2-balao ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px }
.tl2-balao li { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; color: var(--portal-text, #334155); animation: tlEntra .35s ease both }
.tl2-balao li > i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 6px }
.tl2-balao li em { display: inline-block; margin-left: 6px; font-style: normal; font-size: 11.5px; font-weight: 800; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 0 8px }
.tl2-balao > button { justify-self: start; border: none; background: transparent; color: #0369a1; font-family: inherit; font-weight: 800; font-size: 12.5px; cursor: pointer; padding: 0 }
.tl2-abrir { border: none; background: #0369a1; color: #fefefe; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap }
.tl2-abrir:hover { background: #075985 }
.tl-cursor { display: inline-block; width: 2px; height: 1em; background: #0369a1; margin-left: 2px; vertical-align: -2px; animation: tlPisca .8s steps(2) infinite }
@keyframes tlPisca { 50% { opacity: 0 } }
.tl-pontos span { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #0369a1; margin: 0 2px; animation: tlPonto 1.2s infinite }
.tl-pontos span:nth-child(2) { animation-delay: .15s } .tl-pontos span:nth-child(3) { animation-delay: .3s }
@keyframes tlPonto { 0%, 80%, 100% { opacity: .2 } 40% { opacity: 1; transform: translateY(-3px) } }
.rl-fundo { position: fixed; inset: 0; z-index: 100055; background: rgba(15,23,42,.45); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: rlFade .2s ease both }
@keyframes rlFade { from { opacity: 0 } }
.rl-caixa { width: min(1160px, 100%); height: min(88vh, 900px); background: var(--portal-bg, #f8fafc); border-radius: 22px; box-shadow: 0 30px 80px rgba(15,23,42,.35); display: flex; flex-direction: column; overflow: hidden; animation: rlAbre .35s cubic-bezier(.2,1,.3,1) both }
@keyframes rlAbre { from { opacity: 0; transform: translateY(16px) scale(.98) } to { opacity: 1; transform: none } }
.rl-cab { display: flex; gap: 16px; padding: 18px 22px 14px; align-items: flex-start }
.rl-sit { font-size: 13px; font-weight: 900 } .rl-sit small { font-weight: 600; color: var(--portal-text-muted, #64748b) }
.rl-cab h2 { margin: 4px 0 6px; font-size: 22px; font-weight: 900; color: var(--portal-text, #0f172a); line-height: 1.25 }
.rl-cab p { margin: 0; font-size: 14.5px; line-height: 1.6; color: var(--portal-text, #334155); max-width: 860px }
.rl-cab-acoes { display: flex; gap: 8px }
.rl-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); border-radius: 10px; padding: 8px 12px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit }
.rl-btn:hover:not(:disabled) { border-color: #0369a1; color: #0369a1 } .rl-btn:disabled { opacity: .5 }
.rl-x { width: 38px; justify-content: center; padding: 0 }
.rl-roxo { background: #7c3aed; color: #fefefe; border-color: #7c3aed } .rl-roxo:hover:not(:disabled) { background: #6d28d9; color: #fefefe }
.rl-abas { display: flex; gap: 4px; padding: 0 22px; border-bottom: 1px solid var(--portal-border, #e5e7eb); overflow-x: auto }
.rl-abas button { position: relative; border: none; background: transparent; font-family: inherit; font-size: 14.5px; font-weight: 800; color: var(--portal-text-muted, #64748b); padding: 10px 12px 12px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px }
.rl-abas button em { font-style: normal; font-size: 11px; background: var(--portal-bg-secondary, #e2e8f0); border-radius: 99px; padding: 1px 7px }
.rl-abas button.on { color: #0369a1 } .rl-abas button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 3px; border-radius: 3px; background: #0369a1 }
.rl-corpo { flex: 1; overflow-y: auto; padding: 18px 22px 28px }
.rl-erro { background: #fef2f2; color: #991b1b; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px }
.rl-vazio { text-align: center; color: var(--portal-text-muted, #94a3b8); font-size: 13px; padding: 12px }
.rl-plano { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start }
.rl-col { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 12px; display: grid; gap: 8px }
.rl-col-cab { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px }
.rl-col-cab i { width: 10px; height: 10px; border-radius: 50% } .rl-col-cab em { font-style: normal; margin-left: auto; color: var(--portal-text-muted, #94a3b8) }
.rl-acao { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--portal-border, #eef2f7); border-left: 4px solid; border-radius: 12px; padding: 10px; cursor: pointer; animation: tlEntra .4s ease both; transition: opacity .2s, background .2s }
.rl-acao:hover { background: var(--portal-bg-secondary, #f8fafc) }
.rl-acao input { margin-top: 3px; width: 17px; height: 17px; accent-color: #059669; flex-shrink: 0 }
.rl-acao b { display: block; font-size: 14px; color: var(--portal-text, #0f172a); line-height: 1.35 }
.rl-acao > div > span { display: block; font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin-top: 3px; line-height: 1.4 }
.rl-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--portal-text-muted, #94a3b8); margin-top: 5px }
.rl-feito { opacity: .5 } .rl-feito b { text-decoration: line-through }
.rl-tecs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 14px; align-items: start }
.rl-tec { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-top: 4px solid; border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; animation: tlEntra .45s ease both }
.rl-tec-foco { box-shadow: 0 0 0 3px rgba(3,105,161,.25) }
.rl-tec-cab { display: flex; gap: 10px; align-items: center }
.rl-tec-cab b { display: block; font-size: 16px; color: var(--portal-text, #0f172a) } .rl-tec-cab small { font-size: 12px; font-weight: 800 }
.rl-av { width: 40px; height: 40px; border-radius: 50%; color: #fefefe; font-weight: 900; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.rl-leitura { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--portal-text, #334155) }
.rl-duas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.rl-tec h4 { margin: 0 0 4px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .4px }
.rl-tec ul { margin: 0; padding-left: 16px; font-size: 13px; line-height: 1.5; color: var(--portal-text, #334155) }
.rl-dicas { background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 12px }
.rl-dicas h4 { color: #a16207 }
.rl-dicas ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.rl-dicas li { display: flex; gap: 8px; font-size: 13.5px; line-height: 1.45; color: var(--portal-text, #1f2937) }
.rl-dicas li span { width: 20px; height: 20px; border-radius: 50%; background: #eab308; color: #fefefe; font-size: 11px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.rl-conversa { display: flex; gap: 10px; align-items: flex-start; background: #eff6ff; border-radius: 14px 14px 14px 4px; padding: 10px 12px }
.rl-conversa > i { color: #0369a1; font-size: 18px; margin-top: 2px }
.rl-conversa p { margin: 0; flex: 1; font-size: 13.5px; line-height: 1.5; font-style: italic; color: #0c4a6e }
.rl-conversa button { border: none; background: #fefefe; color: #0369a1; border-radius: 99px; padding: 4px 10px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap }
.rl-lig { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 12px 14px; animation: tlEntra .45s ease both }
.rl-lig p { margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: var(--portal-text, #334155) }
.rl-lig ul { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px }
.rl-lig-tit { font-size: 14.5px; color: var(--portal-text, #0f172a) }
.rl-cadeia { display: flex; flex-wrap: wrap; align-items: center; gap: 6px }
.rl-cadeia span { display: inline-flex; align-items: center; gap: 6px }
.rl-cadeia b { background: #eff6ff; color: #0369a1; border-radius: 99px; padding: 4px 12px; font-size: 13.5px }
.rl-cadeia i { color: #94a3b8 }
.rl-dest { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px }
.rl-dest > div { border-left: 4px solid; border-radius: 12px; padding: 10px 12px; display: grid; gap: 3px; font-size: 13.5px }
.rl-texto { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--portal-border, #d1d5db); padding: 9px 11px; font-size: 14px; font-family: inherit; resize: vertical; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a) }
.rl-ens { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 12px; padding: 10px 12px; font-size: 14px; line-height: 1.5; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); font-family: inherit; text-align: left }
.rl-ex { border-style: dashed; cursor: pointer; color: var(--portal-text-muted, #475569) } .rl-ex i { color: #7c3aed; margin-top: 4px }
.rl-mini { border: none; background: transparent; cursor: pointer; color: var(--portal-text-muted, #64748b); padding: 3px 6px; border-radius: 6px }
.rl-mini:hover { background: rgba(100,116,139,.12) }
@media (max-width: 900px) { .rl-plano { grid-template-columns: 1fr } .tl2 { flex-wrap: wrap } .tl2-sit { width: 100%; flex-direction: row; padding: 8px } .tl2-lado { border-left: none; width: 100%; flex-direction: row; justify-content: space-between } .rl-duas { grid-template-columns: 1fr } }
`
