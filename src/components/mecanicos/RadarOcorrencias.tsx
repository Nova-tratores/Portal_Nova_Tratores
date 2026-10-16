'use client'
// Radar de Ocorrências do pós-vendas (José, 16/10/2026) — no MESMO estilo das outras abas
// (cartões e indicadores do ./ui, tema do portal).
//  • Escudos: cada técnico começa o mês com 100 pontos; o anel esvazia com o que vale.
//  • Radar: cada ponto é uma ocorrência — quadrante = categoria, distância do centro = há
//    quanto tempo (centro = agora), tamanho = pontos. A varredura acende os pontos ao passar.
//  • Tribunal: defesas dos técnicos esperando julgamento (aceitar anula os pontos).
//  • Linha do tempo do mês, motivos mais comuns e os últimos 6 meses.
// Atualiza sozinho pelo Realtime (tecnico_ocorrencias / tecnico_justificativas).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { authHeaders } from '@/lib/auth/client'
import { supabase } from '@/lib/supabase'
import { BASE_PONTOS, faixa, type Cat, type HistoricoPessoa, type LinhaEscudo, type OcorrenciaPainel } from '@/lib/mecanicos/ocorrencias-painel'
import { Kpi, Cartao, EstilosCPV, useContador, brl } from './ui'

interface Resp {
  mes: string
  periodo: { de: string; ate: string }
  ocorrencias: OcorrenciaPainel[]
  linhas: LinhaEscudo[]
  motivos: { rotulo: string; cor: string; qtd: number; pontos: number }[]
  serie: ({ mes: string; qtd: number } & Record<Cat, number>)[]
  pendentes: OcorrenciaPainel[]
  meses?: string[]
  historico?: HistoricoPessoa[]
  podeJulgar: boolean
}

// valor do ponto em R$ — por enquanto só simulação, lembrado neste navegador
const CHAVE_VALOR = 'cpv-valor-ponto'
const lerValor = () => { try { return Number(localStorage.getItem(CHAVE_VALOR)) || 0 } catch { return 0 } }

// cores das categorias = as do catálogo de ocorrências
const COR_CAT: Record<Cat, string> = { os: '#0c63e4', pv: '#7c3aed', rh: '#d97706', frota: '#0d9488', legado: '#71717a' }
const NOME_CAT: Record<Cat, string> = { os: 'OS', pv: 'PV', rh: 'RH', frota: 'Frota', legado: 'Antigas' }
const FAIXA = { ok: '#059669', atencao: '#d97706', critico: '#dc2626' }
const QUAD: Cat[] = ['os', 'pv', 'rh', 'frota'] // sentido horário a partir do topo
const VARREDURA = 6 // segundos por volta
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const TXT = 'var(--portal-text, #0f172a)'
const MUDO = 'var(--portal-text-muted, #64748b)'
const BORDA = 'var(--portal-border, #e5e7eb)'

const mesSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}`
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const andarMes = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const hash = (n: number) => { let x = n * 2654435761; x ^= x >>> 13; return Math.abs(x) % 1000 / 1000 }
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const haQuanto = (iso: string | null) => {
  if (!iso) return ''
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`
}

export default function RadarOcorrencias() {
  const [mes, setMes] = useState(mesSP)
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [tec, setTec] = useState<string | null>(null)
  const [cat, setCat] = useState<Cat | null>(null)
  const [aberta, setAberta] = useState<OcorrenciaPainel | null>(null)
  const [hover, setHover] = useState<{ o: OcorrenciaPainel; x: number; y: number } | null>(null)
  const [julgando, setJulgando] = useState<number | null>(null)
  const [saindo, setSaindo] = useState<Set<number>>(new Set())
  // animação do julgamento: o número sobe no card e o escudo da pessoa treme
  const [efeito, setEfeito] = useState<{ ocId: number; texto: string; ok: boolean } | null>(null)
  const [tremer, setTremer] = useState<string | null>(null)
  const [valorPonto, setValorPonto] = useState(0)
  useEffect(() => { const t = setTimeout(() => setValorPonto(lerValor()), 0); return () => clearTimeout(t) }, [])
  const mudarValor = (v: number) => { setValorPonto(v); try { localStorage.setItem(CHAVE_VALOR, String(v)) } catch { /* sem armazenamento */ } }

  const carregar = useCallback(async (m: string) => {
    setCarregando(true)
    try {
      const r = await fetch(`/api/mecanicos/ocorrencias-painel?mes=${m}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setD(j); setErro('')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setCarregando(false) }
  }, [])

  useEffect(() => {
    let vivo = true
    Promise.resolve().then(() => { if (vivo) void carregar(mes) })
    let t: ReturnType<typeof setTimeout> | null = null
    const recarregar = () => { if (t) clearTimeout(t); t = setTimeout(() => { if (vivo) void carregar(mes) }, 800) }
    const canal = supabase.channel(`radar-ocorrencias-${mes}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_ocorrencias' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_justificativas' }, recarregar)
      .subscribe()
    return () => { vivo = false; if (t) clearTimeout(t); void supabase.removeChannel(canal) }
  }, [mes, carregar])

  const julgar = async (justificativaId: number, aprovada: boolean, ocId: number) => {
    setJulgando(justificativaId)
    try {
      const r = await fetch('/api/mecanicos/ocorrencias-painel', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ justificativaId, aprovada }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      const oc = [...(d?.pendentes || []), ...(d?.ocorrencias || [])].find((o) => o.id === ocId)
      const pts = oc?.pontos || 0
      setAberta(null)
      setEfeito({ ocId, ok: aprovada, texto: aprovada ? `+${pts} pts devolvidos` : `−${pts} pts confirmados${valorPonto ? ` · ${brl(pts * valorPonto)}` : ''}` })
      if (oc) setTremer(oc.tecnico)
      setTimeout(() => setSaindo((s) => new Set(s).add(ocId)), 1100)
      setTimeout(() => { void carregar(mes); setSaindo(new Set()); setEfeito(null); setTremer(null) }, 1800)
    } catch (e) { alert(e instanceof Error ? e.message : 'Falha ao julgar') } finally { setJulgando(null) }
  }

  const filtradas = useMemo(() => (d?.ocorrencias || []).filter((o) => (!tec || o.tecnico === tec) && (!cat || o.categoria === cat)), [d, tec, cat])
  const tot = useMemo(() => {
    const oc = d?.ocorrencias || []
    return {
      qtd: oc.length,
      pontos: oc.filter((o) => o.vale).reduce((s, o) => s + o.pontos, 0),
      anulados: oc.filter((o) => !o.vale).reduce((s, o) => s + o.pontos, 0),
      pend: d?.pendentes.length || 0,
      auto: oc.filter((o) => o.origem === 'auto').length,
    }
  }, [d])

  const ehAtual = mes === mesSP()
  // antigas × atuais (totais do mês escolhido, do anterior e média dos anteriores)
  const comp = useMemo(() => {
    const h = d?.historico || [], n = d?.meses?.length || 0
    if (!h.length || n < 2) return null
    const soma = (k: 'qtd' | 'pontos', i: number) => h.reduce((s, x) => s + x[k][i], 0)
    const media = (k: 'qtd' | 'pontos') => Math.round((Array.from({ length: n - 1 }, (_, i) => soma(k, i)).reduce((a, b) => a + b, 0) / (n - 1)) * 10) / 10
    return { qtdAnt: soma('qtd', n - 2), ptsAnt: soma('pontos', n - 2), qtdMedia: media('qtd'), ptsMedia: media('pontos') }
  }, [d])
  const filtro = (tec || cat) && <button type="button" className="rdr-chip" onClick={() => { setCat(null); setTec(null) }}>limpar filtro ✕</button>
  return (
    <div>
      <EstilosCPV />
      <EstilosRadar />

      {/* mês */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" className="rdr-btn rdr-seta" onClick={() => setMes(andarMes(mes, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
        <div style={{ fontSize: 15, fontWeight: 800, color: TXT, minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>{nomeMes(mes)}</div>
        <button type="button" className="rdr-btn rdr-seta" onClick={() => setMes(andarMes(mes, 1))} disabled={ehAtual} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
        {!ehAtual && <button type="button" className="rdr-btn" onClick={() => setMes(mesSP())}>Mês atual</button>}
        {carregando && <span style={{ fontSize: 12.5, color: MUDO }}><i className="fas fa-spinner fa-spin" /> carregando…</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: MUDO, display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cpv-pulso" style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} /> ao vivo · cada técnico começa o mês com {BASE_PONTOS} pontos</span>
      </div>

      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}

      {d && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi titulo="Ocorrências no mês" valor={tot.qtd} formato={(v) => String(Math.round(v))} cor="#0369a1" icone="fa-crosshairs" sub={comp ? <Seta atual={tot.qtd} antes={comp.qtdAnt} rotulo={`mês anterior ${comp.qtdAnt} · média ${comp.qtdMedia.toLocaleString('pt-BR')}`} /> : `${tot.auto} automáticas`} />
            <Kpi titulo="Pontos descontados" valor={tot.pontos} formato={(v) => `−${Math.round(v)}`} cor="#dc2626" icone="fa-arrow-trend-down" atraso={60} sub={comp ? <Seta atual={tot.pontos} antes={comp.ptsAnt} rotulo={`mês anterior −${comp.ptsAnt} · média −${comp.ptsMedia.toLocaleString('pt-BR')}${valorPonto ? ` · ${brl(tot.pontos * valorPonto)}` : ''}`} /> : `média ${d.linhas.length ? Math.round(tot.pontos / d.linhas.length) : 0} por pessoa`} />
            <Kpi titulo="Defesas para julgar" valor={tot.pend} formato={(v) => String(Math.round(v))} cor="#d97706" icone="fa-scale-balanced" atraso={120} destaque={tot.pend > 0} sub={tot.pend ? 'aguardando decisão' : 'nada pendente'} />
            <Kpi titulo="Pontos anulados" valor={tot.anulados} formato={(v) => String(Math.round(v))} cor="#059669" icone="fa-shield-halved" atraso={180} sub="defesas aceitas" />
          </div>

          <div className="rdr-duas">
            <Cartao titulo="Radar do mês" atraso={120} extra={filtro}>
              <Radar ocs={filtradas} periodo={d.periodo} atual={ehAtual} cat={cat} onCat={(c) => setCat(cat === c ? null : c)} onHover={setHover} onAbrir={setAberta} />
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', fontSize: 11.5, color: MUDO, marginTop: 6 }}>
                <span>centro = agora · borda = início do mês</span><span>tamanho = pontos</span><span>○ vazio = anulada</span><span>clique no quadrante para filtrar</span>
              </div>
            </Cartao>
            <Cartao titulo="Escudos" atraso={180} extra={<span style={{ fontSize: 11.5, color: MUDO }}>clique para focar</span>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 10 }}>
                {d.linhas.map((l, i) => <Escudo key={l.tecnico} l={l} i={i} treme={tremer === l.tecnico} ativo={tec === l.tecnico} apagado={!!tec && tec !== l.tecnico} onClick={() => setTec(tec === l.tecnico ? null : l.tecnico)} />)}
              </div>
            </Cartao>
          </div>

          <div className="rdr-duas">
            <Cartao titulo={<>Tribunal de defesas {d.pendentes.length > 0 && <span className="rdr-badge">{d.pendentes.length}</span>}</>} atraso={240}>
              {d.pendentes.length === 0 ? (
                <Vazio icone="fa-circle-check" texto="Nenhuma defesa esperando julgamento." />
              ) : (
                <div style={{ display: 'grid', gap: 10, maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
                  {d.pendentes.map((o, i) => {
                    const def = o.defesas.find((x) => x.status === 'pendente')!
                    return (
                      <div key={o.id} className={`rdr-caso ${saindo.has(o.id) ? 'rdr-sai' : ''}`} style={{ animationDelay: `${i * 60}ms`, borderLeftColor: COR_CAT[o.categoria], position: 'relative' }}>
                        {efeito?.ocId === o.id && <div className={`rdr-efeito ${efeito.ok ? 'rdr-efeito-ok' : ''}`}>{efeito.texto}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nome={o.tecnico} cor={COR_CAT[o.categoria]} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: TXT }}>{o.tecnico}</div>
                            <div style={{ fontSize: 12, color: MUDO }}>{o.rotulo} · {br(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</div>
                          </div>
                          <span className="rdr-pts">−{o.pontos}</span>
                        </div>
                        <div className="rdr-fala">“{def.texto || 'sem texto'}”<span style={{ display: 'block', fontSize: 11, color: MUDO, marginTop: 4, fontStyle: 'normal' }}>defesa enviada {haQuanto(def.criadaEm)}{def.anexos.length ? ` · ${def.anexos.length} anexo(s)` : ''}</span></div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="rdr-btn" onClick={() => setAberta(o)}><i className="fas fa-eye" /> Ver tudo</button>
                          {d.podeJulgar && <>
                            <button type="button" className="rdr-btn rdr-ok" disabled={julgando != null} onClick={() => julgar(def.id, true, o.id)}><i className="fas fa-check" /> Aceitar · anula {o.pontos} pts</button>
                            <button type="button" className="rdr-btn rdr-nao" disabled={julgando != null} onClick={() => julgar(def.id, false, o.id)}><i className="fas fa-xmark" /> Recusar</button>
                          </>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Cartao>
            <Cartao titulo={tec ? `Linha do tempo · ${tec}` : 'Linha do tempo do mês'} atraso={300} extra={<>{filtro}<span style={{ fontSize: 11.5, color: MUDO }}>{filtradas.length} registro(s)</span></>}>
              {filtradas.length === 0 ? <Vazio icone="fa-face-smile" texto="Nenhuma ocorrência neste filtro." /> : (
                <div className="rdr-linha" style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
                  {filtradas.map((o, i) => (
                    <button key={o.id} type="button" className="rdr-evento" onClick={() => setAberta(o)} style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}>
                      <span className="rdr-no" style={{ background: o.vale ? COR_CAT[o.categoria] : 'var(--portal-bg-card, #fefefe)', borderColor: COR_CAT[o.categoria] }} />
                      <span style={{ fontSize: 11.5, color: MUDO, width: 42, flexShrink: 0 }}>{br(o.data)}</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ fontWeight: 700, textDecoration: o.vale ? 'none' : 'line-through', color: o.vale ? TXT : MUDO }}>{o.rotulo}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: MUDO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {!tec && `${o.tecnico} · `}{NOME_CAT[o.categoria]}{o.origem === 'auto' ? ' · automática' : ''}{o.defesas.some((x) => x.status === 'pendente') ? ' · defesa em julgamento' : ''}
                        </span>
                      </span>
                      <span className="rdr-pts" style={{ opacity: o.vale ? 1 : .4 }}>{o.vale ? `−${o.pontos}` : 'anulada'}</span>
                    </button>
                  ))}
                </div>
              )}
            </Cartao>
          </div>

          {d.historico && d.meses && <Comparacao h={d.historico} meses={d.meses} valorPonto={valorPonto} onValor={mudarValor} onFoco={(t) => setTec(tec === t ? null : t)} foco={tec} />}

          <div className="rdr-duas">
            <Cartao titulo="O que mais tira pontos" atraso={360}>
              {d.motivos.length === 0 ? <Vazio icone="fa-face-smile" texto="Mês limpo até agora." /> : (
                <div style={{ display: 'grid', gap: 9 }}>
                  {d.motivos.slice(0, 8).map((m, i) => {
                    const max = d.motivos[0].pontos || 1
                    return (
                      <div key={m.rotulo + i}>
                        <div style={{ display: 'flex', fontSize: 12.5, marginBottom: 4, color: TXT }}>
                          <span style={{ flex: 1, fontWeight: 700 }}>{m.rotulo}</span>
                          <span style={{ color: MUDO }}>{m.qtd}× · <b style={{ color: '#dc2626' }}>−{m.pontos}</b></span>
                        </div>
                        <div style={{ height: 8, background: 'var(--portal-bg-secondary, #f1f5f9)', borderRadius: 99, overflow: 'hidden' }}>
                          <div className="rdr-barra" style={{ width: `${(m.pontos / max) * 100}%`, background: m.cor, animationDelay: `${i * 80}ms` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Cartao>
            <Cartao titulo="Pontos descontados · últimos 6 meses" atraso={420}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={d.serie.map((s) => ({ ...s, rot: mesCurto(s.mes) }))} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <XAxis dataKey="rot" tick={{ fontSize: 11.5 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v: number, n: string) => [`−${v} pts`, NOME_CAT[n as Cat] || n]} />
                    {(['os', 'pv', 'rh', 'frota', 'legado'] as Cat[]).map((c, i, arr) => (
                      <Bar key={c} dataKey={c} stackId="p" fill={COR_CAT[c]} radius={i === arr.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} animationDuration={900} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>
          </div>
        </div>
      )}

      {hover && <Dica o={hover.o} x={hover.x} y={hover.y} />}
      {aberta && <Detalhe o={aberta} podeJulgar={!!d?.podeJulgar} julgando={julgando} onJulgar={julgar} onFechar={() => setAberta(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- peças

/** ▲▼ comparando com antes (mais ocorrência = vermelho). */
function Seta({ atual, antes, rotulo }: { atual: number; antes: number; rotulo: string }) {
  const dif = atual - antes
  const cor = dif > 0 ? '#dc2626' : dif < 0 ? '#059669' : MUDO
  return <span><b style={{ color: cor }}>{dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {Math.abs(Math.round(dif))}</b> · {rotulo}</span>
}

function Comparacao({ h, meses, valorPonto, onValor, onFoco, foco }: { h: HistoricoPessoa[]; meses: string[]; valorPonto: number; onValor: (v: number) => void; onFoco: (t: string) => void; foco: string | null }) {
  const n = meses.length
  const max = Math.max(1, ...h.flatMap((x) => x.qtd))
  const visiveis = h.filter((x) => x.qtd.some((v) => v > 0))
  return (
    <Cartao titulo="Antigas × atuais · últimos 6 meses" atraso={330}
      extra={<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUDO }} title="Simulação: quanto os pontos representariam em dinheiro">
        Valor do ponto R$
        <input type="number" min={0} step={1} value={valorPonto || ''} placeholder="0" onChange={(e) => onValor(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 70, padding: '5px 8px', borderRadius: 8, border: `1px solid ${BORDA}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, background: 'var(--portal-bg-card, #fefefe)', color: TXT }} />
      </label>}>
      <div style={{ overflowX: 'auto' }}>
        <table className="rdr-tab">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Pessoa</th>
              <th>Ocorrências por mês</th>
              <th>Média antes</th>
              <th>{mesCurto(meses[n - 1])}</th>
              <th>Variação</th>
              <th>Pontos {mesCurto(meses[n - 1])}</th>
              {valorPonto > 0 && <th>Em R$ (mês)</th>}
              {valorPonto > 0 && <th>Média R$/mês</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((x, i) => {
              const atual = x.qtd[n - 1], ptsAtual = x.pontos[n - 1]
              const dif = atual - x.mediaQtdAntes
              return (
                <tr key={x.tecnico} className="cpv-entra" style={{ animationDelay: `${i * 40}ms`, opacity: foco && foco !== x.tecnico ? .45 : 1, cursor: 'pointer' }} onClick={() => onFoco(x.tecnico)}>
                  <td style={{ textAlign: 'left', fontWeight: 800 }}>{x.tecnico}</td>
                  <td>
                    <div className="rdr-mini">
                      {x.qtd.map((v, j) => (
                        <span key={j} title={`${mesCurto(meses[j])}: ${v} ocorrência(s) · −${x.pontos[j]} pts`}
                          style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: j === n - 1 ? '#0369a1' : v ? '#93c5fd' : 'var(--portal-bg-secondary, #eef2f7)', animationDelay: `${j * 60}ms` }} />
                      ))}
                    </div>
                  </td>
                  <td>{x.mediaQtdAntes.toLocaleString('pt-BR')} <span style={{ color: MUDO, fontSize: 11 }}>(−{x.mediaPontosAntes.toLocaleString('pt-BR')} pts)</span></td>
                  <td style={{ fontWeight: 900 }}>{atual}</td>
                  <td><span className="rdr-var" style={{ color: dif > 0 ? '#dc2626' : dif < 0 ? '#059669' : MUDO, background: dif > 0 ? '#fef2f2' : dif < 0 ? '#ecfdf5' : 'var(--portal-bg-secondary, #f1f5f9)' }}>{dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {Math.abs(Math.round(dif * 10) / 10).toLocaleString('pt-BR')}</span></td>
                  <td style={{ color: ptsAtual ? '#dc2626' : MUDO, fontWeight: 800 }}>{ptsAtual ? `−${ptsAtual}` : '0'}</td>
                  {valorPonto > 0 && <td style={{ fontWeight: 800 }}>{brl(ptsAtual * valorPonto)}</td>}
                  {valorPonto > 0 && <td style={{ color: MUDO }}>{brl(x.mediaPontosAntes * valorPonto)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: MUDO, marginTop: 8 }}>
        Média antes = média dos 5 meses anteriores ao mês escolhido (o mês atual ainda está em andamento). ▲ = mais ocorrências que a média.
        {valorPonto > 0 ? ' Os valores em R$ são simulação — o valor do ponto ainda não foi definido.' : ' Informe um valor do ponto para ver quanto isso representa em R$.'}
      </div>
    </Cartao>
  )
}

function Vazio({ icone, texto }: { icone: string; texto: string }) {
  return <div style={{ textAlign: 'center', padding: '36px 10px', color: MUDO }}><i className={`fas ${icone}`} style={{ fontSize: 26, color: '#059669', opacity: .7 }} /><div style={{ marginTop: 10, fontSize: 13 }}>{texto}</div></div>
}

function Avatar({ nome, cor }: { nome: string; cor: string }) {
  return <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#fefefe', background: cor }}>{iniciais(nome)}</span>
}

function Escudo({ l, i, ativo, apagado, treme, onClick }: { l: LinhaEscudo; i: number; ativo: boolean; apagado: boolean; treme?: boolean; onClick: () => void }) {
  const saldo = useContador(l.saldo, 1300)
  const f = faixa(l.saldo)
  const cor = FAIXA[f]
  const R = 38, C = 2 * Math.PI * R
  const perdido = Math.max(1, l.descontado)
  return (
    <button type="button" onClick={onClick} className={`rdr-escudo cpv-entra ${f === 'critico' ? 'rdr-alerta' : ''} ${treme ? 'rdr-treme' : ''}`}
      style={{ animationDelay: `${i * 45}ms`, opacity: apagado ? .4 : 1, borderColor: ativo ? cor : undefined, boxShadow: ativo ? `0 0 0 2px ${cor}55` : undefined }}>
      <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto' }}>
        <svg viewBox="0 0 96 96" width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="48" cy="48" r={R} fill="none" stroke="var(--portal-bg-secondary, #eef2f7)" strokeWidth="7" />
          <circle cx="48" cy="48" r={R} fill="none" stroke={cor} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - saldo / BASE_PONTOS)} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 23, fontWeight: 900, color: cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{Math.round(saldo)}</span>
          <span style={{ fontSize: 9.5, color: MUDO, letterSpacing: 1 }}>PONTOS</span>
        </div>
        {l.pendentes > 0 && <span className="rdr-badge" style={{ position: 'absolute', top: -2, right: -6 }} title="defesas aguardando">{l.pendentes}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 8, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.tecnico}</div>
      <div style={{ fontSize: 11, color: MUDO }}>{l.qtd ? `${l.qtd} ocorrência${l.qtd > 1 ? 's' : ''}` : 'sem ocorrências'}</div>
      <div style={{ display: 'flex', height: 4, borderRadius: 99, overflow: 'hidden', marginTop: 7, background: 'var(--portal-bg-secondary, #f1f5f9)' }}>
        {l.descontado > 0 && (Object.keys(l.porCategoria) as Cat[]).filter((c) => l.porCategoria[c] > 0).map((c) => (
          <span key={c} title={`${NOME_CAT[c]}: −${l.porCategoria[c]}`} style={{ width: `${(l.porCategoria[c] / perdido) * 100}%`, background: COR_CAT[c] }} />
        ))}
      </div>
    </button>
  )
}

function Radar({ ocs, periodo, atual, cat, onCat, onHover, onAbrir }: {
  ocs: OcorrenciaPainel[]; periodo: { de: string; ate: string }; atual: boolean; cat: Cat | null
  onCat: (c: Cat) => void; onHover: (h: { o: OcorrenciaPainel; x: number; y: number } | null) => void; onAbrir: (o: OcorrenciaPainel) => void
}) {
  const S = 400, M = S / 2, RMIN = 26, RMAX = 168
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const ref = atual && hoje < periodo.ate ? hoje : periodo.ate
  const span = Math.max(1, diasEntre(periodo.de, ref))
  const pontos = ocs.map((o) => {
    const q = QUAD.indexOf(o.categoria)
    const ang = q >= 0 ? q * 90 + 8 + hash(o.id) * 74 : 315 + hash(o.id) * 40 // antigas no fim do último quadrante
    const r = RMIN + Math.min(1, Math.max(0, diasEntre(o.data, ref) / span)) * (RMAX - RMIN)
    const rad = ((ang - 90) * Math.PI) / 180
    return { o, ang, x: M + r * Math.cos(rad), y: M + r * Math.sin(rad), tam: 4 + Math.min(10, o.pontos) * .55 }
  })
  const porCat = (c: Cat) => ocs.filter((o) => o.categoria === c && o.vale).reduce((s, o) => s + o.pontos, 0)
  const R = RMAX + 8
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto', aspectRatio: '1' }}>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" height="100%" onMouseLeave={() => onHover(null)}>
        <defs>
          <linearGradient id="rdrVarre" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0891b2" stopOpacity="0" /><stop offset="100%" stopColor="#0891b2" stopOpacity=".22" /></linearGradient>
        </defs>
        {QUAD.map((c, q) => {
          const a0 = ((q * 90 - 90) * Math.PI) / 180, a1 = (((q + 1) * 90 - 90) * Math.PI) / 180
          const dPath = `M${M},${M} L${M + R * Math.cos(a0)},${M + R * Math.sin(a0)} A${R},${R} 0 0 1 ${M + R * Math.cos(a1)},${M + R * Math.sin(a1)} Z`
          const meio = ((q * 90 + 45 - 90) * Math.PI) / 180
          const apaga = cat && cat !== c
          return (
            <g key={c} style={{ cursor: 'pointer' }} onClick={() => onCat(c)}>
              <path d={dPath} fill={COR_CAT[c]} fillOpacity={cat === c ? .12 : apaga ? .015 : .045} />
              <text x={M + (RMAX + 2) * Math.cos(meio)} y={M + (RMAX + 2) * Math.sin(meio)} fill={COR_CAT[c]} fontSize="13" fontWeight="800" textAnchor="middle" dominantBaseline="middle" opacity={apaga ? .35 : 1}>{NOME_CAT[c].toUpperCase()}</text>
              <text x={M + (RMAX - 16) * Math.cos(meio)} y={M + (RMAX - 16) * Math.sin(meio)} fill="#64748b" fontSize="10.5" textAnchor="middle" dominantBaseline="middle" opacity={apaga ? .35 : 1}>−{porCat(c)}</text>
            </g>
          )
        })}
        {[.25, .5, .75, 1].map((k) => <circle key={k} cx={M} cy={M} r={RMIN + (RMAX - RMIN) * k} fill="none" stroke="#94a3b8" strokeOpacity={k === 1 ? .55 : .3} strokeDasharray={k === 1 ? undefined : '3 5'} />)}
        <line x1={M} y1={M - R} x2={M} y2={M + R} stroke="#94a3b8" strokeOpacity=".3" />
        <line x1={M - R} y1={M} x2={M + R} y2={M} stroke="#94a3b8" strokeOpacity=".3" />
        <g className="rdr-varre" style={{ transformOrigin: `${M}px ${M}px`, animationDuration: `${VARREDURA}s` }}>
          <path d={`M${M},${M} L${M},${M - R} A${R},${R} 0 0 1 ${M + R * Math.sin(Math.PI / 5)},${M - R * Math.cos(Math.PI / 5)} Z`} fill="url(#rdrVarre)" transform={`rotate(-36 ${M} ${M})`} />
          <line x1={M} y1={M} x2={M} y2={M - R} stroke="#0891b2" strokeWidth="1.6" strokeOpacity=".7" />
        </g>
        {pontos.map(({ o, ang, x, y, tam }) => {
          const cor = COR_CAT[o.categoria]
          return (
            <g key={o.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(o)}
              onMouseEnter={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); onHover({ o, x: r.left + (x / S) * r.width, y: r.top + (y / S) * r.height }) }}>
              <circle cx={x} cy={y} r={tam + 7} fill="transparent" />
              {o.vale
                ? <circle cx={x} cy={y} r={tam} fill={cor} stroke="#fefefe" strokeWidth="1.5" className="rdr-blip" style={{ animationDelay: `${(ang / 360) * VARREDURA}s`, animationDuration: `${VARREDURA}s`, transformOrigin: `${x}px ${y}px` }} />
                : <circle cx={x} cy={y} r={tam} fill="#fefefe" stroke={cor} strokeOpacity=".7" strokeWidth="1.6" />}
            </g>
          )
        })}
        <circle cx={M} cy={M} r="5" fill="#0891b2" className="rdr-centro" />
      </svg>
    </div>
  )
}

function Dica({ o, x, y }: { o: OcorrenciaPainel; x: number; y: number }) {
  const cor = COR_CAT[o.categoria]
  return (
    <div style={{ position: 'fixed', left: Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280), top: y + 12, zIndex: 9500, pointerEvents: 'none', width: 260, background: 'var(--portal-bg-card, #fefefe)', border: `1px solid ${BORDA}`, borderTop: `3px solid ${cor}`, borderRadius: 12, padding: '10px 12px', boxShadow: '0 12px 30px rgba(15,23,42,.18)', color: TXT }}>
      <div style={{ fontSize: 11, color: cor, fontWeight: 800, letterSpacing: .6 }}>{NOME_CAT[o.categoria].toUpperCase()} · {br(o.data)}</div>
      <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 2 }}>{o.rotulo}</div>
      <div style={{ fontSize: 12, color: MUDO }}>{o.tecnico} · {o.vale ? <b style={{ color: '#dc2626' }}>−{o.pontos} pts</b> : 'anulada'}</div>
      {o.descricao && <div style={{ fontSize: 12, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.descricao}</div>}
    </div>
  )
}

function Detalhe({ o, podeJulgar, julgando, onJulgar, onFechar }: { o: OcorrenciaPainel; podeJulgar: boolean; julgando: number | null; onJulgar: (j: number, a: boolean, oc: number) => void; onFechar: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  const cor = COR_CAT[o.categoria]
  const pend = o.defesas.find((x) => x.status === 'pendente')
  const mapa = typeof o.detalhes.maps_url === 'string' ? o.detalhes.maps_url : null
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rdr-abre" style={{ width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 22, color: TXT, background: 'var(--portal-bg-card, #fefefe)', borderRadius: 16, borderTop: `4px solid ${cor}`, boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Avatar nome={o.tecnico} cor={cor} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: cor, fontWeight: 800, letterSpacing: .8 }}>{NOME_CAT[o.categoria].toUpperCase()}{o.origem === 'auto' ? ' · AUTOMÁTICA' : ''}</div>
            <div style={{ fontSize: 19, fontWeight: 900 }}>{o.rotulo}</div>
            <div style={{ fontSize: 13, color: MUDO }}>{o.tecnico} · {br(o.data)}/{o.data.slice(0, 4)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}{o.criadoPor ? ` · lançada por ${o.criadoPor}` : ''}</div>
          </div>
          <span className="rdr-pts" style={{ fontSize: 18, opacity: o.vale ? 1 : .4 }}>{o.vale ? `−${o.pontos}` : 'anulada'}</span>
          <button type="button" className="rdr-btn rdr-seta" onClick={onFechar} title="Fechar (Esc)"><i className="fas fa-xmark" /></button>
        </div>
        {o.descricao && <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.55, background: 'var(--portal-bg-secondary, #f8fafc)', border: `1px solid ${BORDA}`, borderRadius: 12, padding: '12px 14px', whiteSpace: 'pre-wrap' }}>{o.descricao}</div>}
        {(o.anexos.length > 0 || mapa) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {o.anexos.map((a, i) => a.tipo === 'imagem'
              // eslint-disable-next-line @next/next/no-img-element
              ? <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.nome} style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDA}` }} /></a>
              : <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rdr-btn"><i className="fas fa-film" /> {a.nome || 'vídeo'}</a>)}
            {mapa && <a href={mapa} target="_blank" rel="noreferrer" className="rdr-btn"><i className="fas fa-location-dot" /> Ver no mapa</a>}
          </div>
        )}
        <div style={{ fontSize: 11.5, letterSpacing: .8, fontWeight: 800, color: MUDO, margin: '18px 0 8px' }}>DEFESA DO TÉCNICO</div>
        {o.defesas.length === 0 ? <div style={{ fontSize: 13, color: MUDO }}>O técnico não mandou defesa.</div> : o.defesas.map((j) => (
          <div key={j.id} className="rdr-fala" style={{ marginBottom: 8 }}>
            “{j.texto}”
            <span style={{ display: 'block', fontSize: 11.5, marginTop: 6, fontStyle: 'normal', fontWeight: 700, color: j.status === 'aprovada' ? '#059669' : j.status === 'recusada' ? '#dc2626' : '#d97706' }}>
              {j.status === 'pendente' ? `aguardando julgamento · enviada ${haQuanto(j.criadaEm)}` : `${j.status === 'aprovada' ? 'aceita' : 'recusada'}${j.avaliadoPor ? ` por ${j.avaliadoPor}` : ''}${j.dataAvaliacao ? ` em ${br(j.dataAvaliacao.slice(0, 10))}` : ''}`}
            </span>
            {j.anexos.length > 0 && <span style={{ display: 'flex', gap: 6, marginTop: 6, fontStyle: 'normal' }}>{j.anexos.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontSize: 12 }}>📎 {a.nome || 'anexo'}</a>)}</span>}
          </div>
        ))}
        {pend && podeJulgar && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="rdr-btn rdr-ok" disabled={julgando != null} onClick={() => onJulgar(pend.id, true, o.id)}><i className="fas fa-check" /> Aceitar defesa · anula {o.pontos} pts</button>
            <button type="button" className="rdr-btn rdr-nao" disabled={julgando != null} onClick={() => onJulgar(pend.id, false, o.id)}><i className="fas fa-xmark" /> Recusar · pontos continuam</button>
          </div>
        )}
      </div>
    </div>
  )
}

function EstilosRadar() {
  return (
    <style>{`
      .rdr-duas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px }
      @media (max-width: 1000px) { .rdr-duas { grid-template-columns: 1fr } }
      .rdr-btn { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); border-radius: 10px; padding: 7px 12px; font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: inherit; text-decoration: none; transition: border-color .15s, box-shadow .15s, transform .1s }
      .rdr-btn:hover:not(:disabled) { border-color: #0891b2; box-shadow: 0 2px 10px rgba(8,145,178,.18) }
      .rdr-btn:active:not(:disabled) { transform: scale(.97) }
      .rdr-btn:disabled { opacity: .4; cursor: default }
      .rdr-seta { width: 34px; height: 34px; padding: 0; justify-content: center }
      .rdr-ok { border-color: #a7f3d0; color: #047857; background: #ecfdf5 } .rdr-ok:hover:not(:disabled) { border-color: #10b981; box-shadow: 0 2px 10px rgba(16,185,129,.25) }
      .rdr-nao { border-color: #fecaca; color: #b91c1c; background: #fef2f2 } .rdr-nao:hover:not(:disabled) { border-color: #ef4444; box-shadow: 0 2px 10px rgba(239,68,68,.22) }
      .rdr-chip { border: 1px solid #bae6fd; background: #f0f9ff; color: #0369a1; border-radius: 99px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; font-family: inherit; font-weight: 700 }
      .rdr-badge { display: inline-flex; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; align-items: center; justify-content: center; background: #f59e0b; color: #fefefe; font-weight: 900; font-size: 11px; vertical-align: middle; animation: rdrPisca 1.8s ease-in-out infinite }
      @keyframes rdrPisca { 50% { box-shadow: 0 0 0 5px rgba(245,158,11,.18) } }
      .rdr-pts { font-weight: 900; color: #dc2626; font-variant-numeric: tabular-nums; white-space: nowrap }
      .rdr-varre { animation-name: rdrGira; animation-timing-function: linear; animation-iteration-count: infinite }
      @keyframes rdrGira { to { transform: rotate(360deg) } }
      .rdr-blip { animation-name: rdrBlip; animation-timing-function: ease-out; animation-iteration-count: infinite }
      @keyframes rdrBlip { 0% { opacity: 1; transform: scale(1.7) } 18% { opacity: 1; transform: scale(1) } 100% { opacity: .55; transform: scale(1) } }
      .rdr-centro { animation: rdrPisca2 2s ease-in-out infinite } @keyframes rdrPisca2 { 50% { opacity: .35 } }
      .rdr-escudo { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 12px 10px 10px; cursor: pointer; font-family: inherit; text-align: center; transition: transform .2s, opacity .25s, box-shadow .2s, border-color .2s; min-width: 0 }
      .rdr-escudo:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(15,23,42,.08) }
      .rdr-alerta { animation: cpvEntra .5s cubic-bezier(.2,.8,.2,1) both, rdrAlerta 2.4s ease-in-out .6s infinite }
      @keyframes rdrAlerta { 50% { box-shadow: 0 0 0 3px rgba(220,38,38,.18); border-color: #fca5a5 } }
      .rdr-caso { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-left: 4px solid; border-radius: 12px; padding: 12px; display: grid; gap: 10px; animation: cpvEntra .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .6s cubic-bezier(.6,0,.4,1), opacity .6s }
      .rdr-sai { transform: translateX(110%) !important; opacity: 0 !important }
      .rdr-fala { font-size: 13px; line-height: 1.5; color: var(--portal-text, #334155); background: var(--portal-bg-secondary, #f8fafc); border: 1px dashed var(--portal-border, #cbd5e1); border-radius: 10px; padding: 9px 11px; font-style: italic }
      .rdr-linha { position: relative; display: grid; gap: 2px }
      .rdr-linha::before { content: ''; position: absolute; left: 6px; top: 6px; bottom: 6px; width: 2px; background: var(--portal-border, #e5e7eb) }
      .rdr-evento { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 8px 8px 8px 0; color: inherit; cursor: pointer; font-family: inherit; font-size: 13px; animation: cpvEntra .45s ease both; transition: background .15s, border-color .15s }
      .rdr-evento:hover { background: var(--portal-bg-secondary, #f8fafc); border-color: var(--portal-border, #e5e7eb) }
      .rdr-no { position: relative; z-index: 1; width: 14px; height: 14px; border-radius: 50%; border: 2px solid; flex-shrink: 0 }
      .rdr-barra { height: 100%; border-radius: 99px; animation: rdrBarra 1s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
      @keyframes rdrBarra { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      .rdr-tab { width: 100%; border-collapse: collapse; font-size: 13px; color: var(--portal-text, #0f172a) }
      .rdr-tab th { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #64748b); font-weight: 800; padding: 6px 8px; border-bottom: 1px solid var(--portal-border, #e5e7eb); text-align: center; white-space: nowrap }
      .rdr-tab td { padding: 8px; border-bottom: 1px solid var(--portal-border, #f1f5f9); text-align: center; white-space: nowrap }
      .rdr-tab tbody tr:hover { background: var(--portal-bg-secondary, #f8fafc) }
      .rdr-mini { display: inline-flex; align-items: flex-end; gap: 3px; height: 26px }
      .rdr-mini span { width: 10px; border-radius: 3px 3px 1px 1px; animation: rdrBarraV .6s cubic-bezier(.2,.8,.2,1) both; transform-origin: bottom }
      @keyframes rdrBarraV { from { transform: scaleY(0) } to { transform: scaleY(1) } }
      .rdr-var { display: inline-block; border-radius: 99px; padding: 2px 9px; font-weight: 900; font-size: 12px }
      .rdr-efeito { position: absolute; right: 14px; top: 8px; z-index: 3; font-weight: 900; font-size: 18px; color: #dc2626; pointer-events: none; animation: rdrSobe 1.6s cubic-bezier(.2,.8,.2,1) both; white-space: nowrap; background: var(--portal-bg-card, #fefefe); padding: 2px 8px; border-radius: 8px; box-shadow: 0 4px 14px rgba(15,23,42,.12) }
      .rdr-efeito-ok { color: #059669 }
      @keyframes rdrSobe { 0% { opacity: 0; transform: translateY(14px) scale(.7) } 20% { opacity: 1; transform: translateY(0) scale(1.15) } 70% { opacity: 1; transform: translateY(-10px) scale(1) } 100% { opacity: 0; transform: translateY(-30px) } }
      .rdr-treme { animation: rdrTreme .5s ease-in-out 3 !important; border-color: #fca5a5 !important }
      @keyframes rdrTreme { 0%, 100% { transform: none } 20% { transform: translateX(-5px) rotate(-2deg) } 40% { transform: translateX(5px) rotate(2deg) } 60% { transform: translateX(-3px) } 80% { transform: translateX(3px) } }
      .rdr-abre { animation: rdrAbre .3s cubic-bezier(.2,.8,.2,1) both }
      @keyframes rdrAbre { from { opacity: 0; transform: scale(.94) } to { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) { .rdr-varre, .rdr-blip, .rdr-alerta, .rdr-badge { animation: none !important } }
    `}</style>
  )
}
