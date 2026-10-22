'use client'
// Camada "Vias fora do mapa" do mapa da frota (MapaCarros em modo frota):
// trechos que os carros andaram longe das vias do OpenStreetMap — estrada de
// fazenda, carreador, atalho de terra. Desenha as linhas (mais grossa e mais
// vermelha = mais passagens), o painel com período/carro/legenda, as vias mais
// usadas e a exportação GPX. Dados: GET /api/frota/mapa/vias (calculados uma
// vez por dia pelo agendador — lib/frota/vias-fora-mapa-server).
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { fetchAuth } from '@/lib/auth/client'
import { resolverPlaca } from '@/lib/frota/placa'
import { estiloPassagens, frequenciaTrechos, gerarGpx, type PontaTrecho } from '@/lib/frota/vias-fora-mapa'

export interface TrechoVia {
  id: number
  placa: string
  placa_exibicao: string
  modelo: string | null
  motorista: string | null
  data: string
  inicio: string
  fim: string
  pontos: [number, number, number][]
  km: number
  vel_mediana: number | null
  dist_max_m: number | null
  de: PontaTrecho | null
  para: PontaTrecho | null
}

interface Resposta {
  de: string
  ate: string
  trechos: TrechoVia[]
  cobertura?: { dias_ok: number; dias_pendentes: number; primeiro_dia: string | null; ultimo_processamento: string | null }
  migracaoFaltando?: boolean
  error?: string
}

const PERIODOS = [30, 90, 180, 365]
const LS_PERIODO = 'frota-vias-periodo'

const esc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const diaBR = (d: string) => d.split('-').reverse().join('/')
const kmBR = (km: number) => `${km.toLocaleString('pt-BR', { maximumFractionDigits: km < 10 ? 2 : 1 })} km`

function lerPeriodo(): number {
  try { const n = Number(localStorage.getItem(LS_PERIODO)); return PERIODOS.includes(n) ? n : 90 } catch { return 90 }
}

function htmlPonta(rotulo: string, p: PontaTrecho | null, verbo: string): string {
  if (!p) return `<div style="color:#94a3b8">${rotulo}: sem parada registrada perto</div>`
  return `<div>${rotulo}: <b style="color:${p.conhecido ? '#0f172a' : '#92400e'}">${esc(p.rotulo)}</b> <span style="color:#94a3b8">(${verbo} ${hora(p.hora)})</span></div>`
}

interface Props {
  mapaRef: MutableRefObject<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  LRef: MutableRefObject<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  pronto: boolean
  isMobile: boolean
  /** a timeline do dia ocupa o canto direito: o painel chega para o lado */
  timelineAberta: boolean
  onFechar: () => void
  onVerDia: (placa: string, data: string) => void
}

export default function CamadaViasForaMapa({ mapaRef, LRef, pronto, isMobile, timelineAberta, onFechar, onVerDia }: Props) {
  const [periodo, setPeriodo] = useState(lerPeriodo)
  const [placa, setPlaca] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [minimizado, setMinimizado] = useState(false)
  const camadaRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const onVerDiaRef = useRef(onVerDia)
  onVerDiaRef.current = onVerDia

  // carrega o período (o filtro de carro é na tela: trocar de carro não busca de novo)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetchAuth(`/api/frota/mapa/vias?dias=${periodo}`)
        const d = (await r.json().catch(() => ({}))) as Resposta
        if (!vivo) return
        if (!r.ok && !d.migracaoFaltando) { setErro(d.error || 'Não foi possível carregar as vias agora.'); setDados(null); return }
        setErro(null)
        setDados(d)
      } catch {
        if (vivo) setErro('Não foi possível carregar as vias agora.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [periodo])

  const todos = useMemo(() => dados?.trechos || [], [dados])
  const placas = useMemo(() => {
    const conta = new Map<string, { exib: string; n: number }>()
    for (const t of todos) {
      const p = resolverPlaca(t.placa)
      const c = conta.get(p)
      if (c) c.n++; else conta.set(p, { exib: t.placa_exibicao, n: 1 })
    }
    return [...conta].sort((a, b) => b[1].n - a[1].n)
  }, [todos])
  const visiveis = useMemo(() => (placa ? todos.filter((t) => resolverPlaca(t.placa) === placa) : todos), [todos, placa])
  // a frequência considera TODOS os carros: "esta via teve 5 passagens" vale mesmo filtrando um carro
  const freq = useMemo(() => frequenciaTrechos(todos), [todos])
  const porId = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos])

  const resumo = useMemo(() => ({
    km: visiveis.reduce((s, t) => s + t.km, 0),
    carros: new Set(visiveis.map((t) => resolverPlaca(t.placa))).size,
  }), [visiveis])

  // vias mais usadas: o trecho de mais passagens de cada via (sem repetir a mesma via)
  const maisUsadas = useMemo(() => {
    const usados = new Set<number>()
    const out: { t: TrechoVia; passagens: number; carros: number }[] = []
    const ordenados = [...visiveis].sort((a, b) => (freq.passagens.get(b.id) || 1) - (freq.passagens.get(a.id) || 1) || b.km - a.km)
    for (const t of ordenados) {
      if (usados.has(t.id)) continue
      const grupo = [t.id, ...(freq.mesmaVia.get(t.id) || [])]
      grupo.forEach((id) => usados.add(id))
      const passagens = freq.passagens.get(t.id) || 1
      if (passagens < 2) continue
      out.push({ t, passagens, carros: new Set(grupo.map((id) => resolverPlaca(porId.get(id)?.placa || ''))).size })
      if (out.length >= 5) break
    }
    return out
  }, [visiveis, freq, porId])

  // desenho
  useEffect(() => {
    const mapa = mapaRef.current, L = LRef.current
    if (!pronto || !mapa || !L) return
    if (!camadaRef.current) camadaRef.current = L.layerGroup().addTo(mapa)
    const camada = camadaRef.current
    camada.clearLayers()
    const renderer = L.canvas({ padding: 0.5, tolerance: 6 })
    const ordenados = [...visiveis].sort((a, b) => (freq.passagens.get(a.id) || 1) - (freq.passagens.get(b.id) || 1))
    for (const t of ordenados) {
      const n = freq.passagens.get(t.id) || 1
      const est = estiloPassagens(n)
      const linha = L.polyline(t.pontos.map(([lat, lng]) => [lat, lng]), { renderer, color: est.cor, weight: est.peso, opacity: 0.85, lineCap: 'round', lineJoin: 'round' })
      // outras passagens = outro carro ou outro dia (a volta do mesmo carro no mesmo dia é a mesma passagem)
      const outros = ((freq.mesmaVia.get(t.id) || []).map((id) => porId.get(id)).filter(Boolean) as TrechoVia[])
        .filter((o) => !(o.data === t.data && resolverPlaca(o.placa) === resolverPlaca(t.placa)))
        .filter((o, i, arr) => arr.findIndex((x) => x.data === o.data && resolverPlaca(x.placa) === resolverPlaca(o.placa)) === i)
      const meio = t.pontos[Math.floor(t.pontos.length / 2)]
      const listaOutros = outros.length
        ? `<div style="margin-top:4px;color:#475569">Também passaram aqui: ${outros.slice(0, 6).map((o) => `${esc(o.placa_exibicao)} ${diaBR(o.data).slice(0, 5)}`).join(' · ')}${outros.length > 6 ? ` e mais ${outros.length - 6}` : ''}</div>`
        : ''
      linha.bindPopup(
        `<div style="font-size:12.5px;line-height:1.45;min-width:220px">` +
        `<div style="font-weight:800;color:#b91c1c">Fora das vias do mapa · ${kmBR(t.km)}</div>` +
        `<div style="font-weight:700;color:#0f172a;margin-top:2px">${esc(t.placa_exibicao)}${t.modelo ? ` · ${esc(t.modelo)}` : ''}</div>` +
        (t.motorista ? `<div style="color:#334155">${esc(t.motorista)}</div>` : '') +
        `<div style="color:#334155;margin-top:2px">${diaBR(t.data)} · ${hora(t.inicio)}–${hora(t.fim)}` +
        `${t.vel_mediana != null ? ` · ~${Math.round(t.vel_mediana)} km/h` : ''}${t.dist_max_m != null ? ` · até ${t.dist_max_m >= 500 ? '500+' : t.dist_max_m} m da via` : ''}</div>` +
        `<div style="margin-top:4px">${htmlPonta('Vinha de', t.de, 'saiu')}${htmlPonta('Ia para', t.para, 'chegou')}</div>` +
        `<div style="margin-top:4px;font-weight:700;color:${est.cor}">${n} passage${n === 1 ? 'm' : 'ns'} nesta via</div>` + listaOutros +
        `<div style="display:flex;gap:6px;margin-top:8px">` +
        `<button data-ver-dia style="flex:1;padding:5px 8px;border:none;border-radius:6px;background:#1e40af;color:#fff;font-weight:700;cursor:pointer;font-size:12px">Ver o dia do carro</button>` +
        `<a href="https://www.google.com/maps/search/?api=1&query=${meio[0]},${meio[1]}" target="_blank" rel="noreferrer" style="padding:5px 8px;border-radius:6px;background:#f1f5f9;color:#0f172a;font-weight:700;text-decoration:none;font-size:12px">Google Maps</a>` +
        `</div></div>`,
        { maxWidth: 320 },
      )
      linha.on('popupopen', (ev: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const b = ev.popup.getElement()?.querySelector('[data-ver-dia]')
        if (b) b.onclick = () => { mapa.closePopup(); onVerDiaRef.current(t.placa, t.data) }
      })
      linha.options.bubblingMouseEvents = false
      linha.addTo(camada)
    }
  }, [pronto, mapaRef, LRef, visiveis, freq, porId])

  // desligar a camada tira as linhas do mapa
  useEffect(() => () => {
    camadaRef.current?.remove()
    camadaRef.current = null
  }, [])

  const trocarPeriodo = (n: number) => {
    setCarregando(true)
    setPeriodo(n)
    try { localStorage.setItem(LS_PERIODO, String(n)) } catch { /* preferência opcional */ }
  }

  const voarPara = (t: TrechoVia) => {
    const mapa = mapaRef.current
    if (!mapa) return
    mapa.flyToBounds(t.pontos.map(([lat, lng]) => [lat, lng]), { padding: [80, 80], maxZoom: 16, duration: 1 })
  }

  // enquadra o mapa em todos os trechos do filtro (ou de um carro escolhido agora)
  const enquadrar = (lista: TrechoVia[]) => {
    const mapa = mapaRef.current
    if (!mapa || !lista.length) return
    mapa.flyToBounds(lista.flatMap((t) => t.pontos.map(([lat, lng]) => [lat, lng])), { padding: [60, 60], maxZoom: 15, duration: 1 })
  }
  const trocarPlaca = (p: string) => {
    setPlaca(p)
    if (p) enquadrar(todos.filter((t) => resolverPlaca(t.placa) === p))
  }

  const baixarGpx = () => {
    const nome = placa ? `vias-fora-do-mapa-${placa}-${dados?.ate || ''}.gpx` : `vias-fora-do-mapa-${dados?.de || ''}_${dados?.ate || ''}.gpx`
    const blob = new Blob([gerarGpx(visiveis)], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const posicao: React.CSSProperties = isMobile
    ? { bottom: 12, left: 8, right: 8, maxHeight: '48%' }
    : { top: 10, right: timelineAberta ? 312 : 10, width: 290, maxHeight: 'calc(100% - 80px)' }

  const caixa: React.CSSProperties = {
    position: 'absolute', zIndex: 1001, ...posicao, background: 'rgba(255,255,255,0.98)', borderRadius: 12,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#334155', fontSize: 12.5,
  }
  const sel: React.CSSProperties = { flex: 1, minWidth: 0, padding: '5px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 12.5 }

  return (
    <div style={caixa}>
      <div style={{ padding: '9px 12px', borderBottom: minimizado ? 'none' : '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: '#b91c1c' }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, flex: 1 }}>
          VIAS FORA DO MAPA{!carregando && dados && !dados.migracaoFaltando ? ` · ${visiveis.length}` : ''}
        </span>
        <span
          title={'Trechos que os carros andaram a mais de 40 m de qualquer via do OpenStreetMap (o mapa de fundo): estrada de fazenda, carreador, atalho de terra. '
            + 'Calculado uma vez por dia a partir do GPS (o dia de hoje entra amanhã). Mais grossa e mais vermelha = mais passagens (carro + dia diferentes).'}
          style={{ cursor: 'help', fontWeight: 800, color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '50%', width: 17, height: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
        >?</span>
        <button onClick={() => setMinimizado((m) => !m)} title={minimizado ? 'Abrir o painel' : 'Recolher o painel'} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0 }}>{minimizado ? '▾' : '▴'}</button>
        <button onClick={onFechar} title="Desligar a camada" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
      </div>

      {!minimizado && (
        <div style={{ padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={periodo} onChange={(e) => trocarPeriodo(Number(e.target.value))} style={sel} aria-label="Período">
              {PERIODOS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
            </select>
            <select value={placa} onChange={(e) => trocarPlaca(e.target.value)} style={sel} aria-label="Carro">
              <option value="">Todos os carros</option>
              {placas.map(([p, c]) => <option key={p} value={p}>{c.exib} ({c.n})</option>)}
            </select>
          </div>

          {carregando && <div style={{ color: '#64748b' }}>Carregando as vias…</div>}
          {!carregando && erro && <div style={{ color: '#b91c1c', fontWeight: 600 }}>{erro}</div>}
          {!carregando && dados?.migracaoFaltando && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 10px', color: '#92400e' }}>
              A camada está pronta, mas o banco ainda não tem as tabelas: falta aplicar <b>sql/frota-vias-fora-mapa.sql</b> no Supabase.
            </div>
          )}

          {!carregando && dados && !dados.migracaoFaltando && (
            <>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                {visiveis.length
                  ? `${visiveis.length} trecho${visiveis.length === 1 ? '' : 's'} · ${kmBR(resumo.km)} · ${resumo.carros} carro${resumo.carros === 1 ? '' : 's'}`
                  : 'Nenhum trecho fora do mapa no período.'}
              </div>
              {dados.cobertura && (
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: -5 }}>
                  {dados.cobertura.dias_ok === 0 && dados.cobertura.dias_pendentes === 0
                    ? 'O histórico deste período ainda não foi calculado.'
                    : `Calculado até ${diaBR(dados.ate)}`}
                  {dados.cobertura.dias_pendentes > 0 && ` · ${dados.cobertura.dias_pendentes} dia(s)-carro aguardando o mapa de fundo`}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[1, 2, 5].map((n) => {
                  const e = estiloPassagens(n)
                  return (
                    <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                      <span style={{ width: 26, height: e.peso, borderRadius: 3, background: e.cor }} />{e.rotulo}
                    </span>
                  )
                })}
              </div>

              {maisUsadas.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 0.3, marginBottom: 4 }}>MAIS USADAS</div>
                  {maisUsadas.map(({ t, passagens, carros }) => (
                    <button
                      key={t.id}
                      onClick={() => voarPara(t)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 6px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#0f172a', fontSize: 12 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <b style={{ color: estiloPassagens(passagens).cor }}>{passagens}×</b>{' '}
                      {t.para?.conhecido ? `perto de ${t.para.rotulo}` : t.de?.conhecido ? `saindo de ${t.de.rotulo}` : `${kmBR(t.km)} · ${diaBR(t.data)}`}
                      <span style={{ color: '#94a3b8' }}> · {carros} carro{carros === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
              )}

              {visiveis.length > 0 && (
                <button
                  onClick={() => enquadrar(visiveis)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Enquadrar no mapa
                </button>
              )}
              {visiveis.length > 0 && (
                <button
                  onClick={baixarGpx}
                  title="Arquivo GPX com as linhas: abre no Google My Maps, OsmAnd, Maps.me ou GPS Garmin para seguir o caminho"
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #1e40af', background: '#fff', color: '#1e40af', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Baixar as rotas (GPX)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
