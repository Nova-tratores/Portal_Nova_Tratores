'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Onde foi o furo de km (José, 28/10/2026): "clicar nos km rodados que não foram cobrados e mostrar no mapa todos os
// pontos e as rotas não cobradas, e pedir pro Tratorilson resumir onde basicamente foi o furo".
// 2º pedido: "mostrar o caminho que ele fez, a cidade, horário e tudo que for possível" + "quanto tempo o carro ficou no
// cliente": o dia em foco ganha uma linha do tempo (saída, trechos em km, paradas com cidade e hora, cliente da OS).
import { useEffect, useMemo, useRef, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { carregarLeaflet, CENTRO_PADRAO } from '@/components/feedbacks/leaflet'
import { filtrarEspetos, segmentarTrajeto } from '@/lib/frota/gps'
import { distanciaM } from '@/lib/pos/localizacao-cliente'
import type { FuroKm, DiaFuro, AnaliseFuro, DiaDetalhado, ParadaFuro, ConfCliente } from '@/lib/mecanicos/furo-km-server'
import { Janela } from './JanelasInfo'
import { DIVERGENCIAS, type Divergencia } from '@/lib/mecanicos/divergencias'

/** OS envolvidas numa divergência de OS (km ou horas do relatório que não foram cobrados) */
const osDaDiv = (fk: FuroKm, div: Divergencia) => (fk.osTotais || []).filter((o) =>
  div === 'km-nao-cobrado' ? o.kmRel - o.kmCobrado > 0.5 : div === 'horas-nao-cobradas' ? o.horasRel - o.horasCobradas > 0.05 : false)
/** os dias que entram na lista para cada divergência */
function filtroDia(fk: FuroKm, div: Divergencia): (x: DiaFuro) => boolean {
  if (div === 'km-fora-relatorio') return (x) => x.kmGps - x.kmRel > 5
  if (div === 'dias-sem-os') return (x) => !x.os.length && x.kmGps > 5
  if (div === 'sem-cliente') return (x) => x.os.some((o) => !o.noCliente)
  if (div === 'ligado-sem-os') return (x) => !x.os.length && (x.ligadoH || 0) > 0.05
  if (div === 'colega-fora-os') return (x) => x.colegas.some((o) => o.noCliente && !o.naOS)
  if (div === 'km-nao-cobrado' || div === 'horas-nao-cobradas') { const ids = new Set(osDaDiv(fk, div).map((o) => o.os)); return (x) => x.os.some((o) => ids.has(o.os)) }
  return (x) => x.furo > 5
}
const TITULO_LISTA: Record<Divergencia, string> = { 'geral': 'Dias com furo', 'km-fora-relatorio': 'Dias com km fora do relatório', 'km-nao-cobrado': 'Dias dessas OS', 'dias-sem-os': 'Dias sem OS', 'horas-nao-cobradas': 'Dias dessas OS', 'sem-cliente': 'Dias de OS sem passar no cliente', 'colega-fora-os': 'Dias no cliente de um colega', 'ligado-sem-os': 'Dias com o carro ligado sem OS' }
const fmtValor = (v: number, u: 'km' | 'h' | 'dias') => (u === 'h' ? `${String(v).replace('.', ',')} h` : u === 'dias' ? `${v} dia${v === 1 ? '' : 's'}` : `${Math.round(v).toLocaleString('pt-BR')} km`)

const km = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')} km`
const kmI = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const fmtDia = (d: string) => `${SEM[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`)
const CORES = ['#2563eb', '#ef4444', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#16a34a', '#ea580c']
const CONF: Record<ConfCliente, string> = { confirmado: 'local confirmado no faturar', cadastro: 'local do cadastro do cliente', provavel: 'provável: parada mais longa do dia' }
const corParada = (p: ParadaFuro, c: string) => (p.cliente ? '#059669' : p.loja ? '#0f172a' : p.atipica ? '#dc2626' : c)

export default function FuroKmJanela({ tecnico, mes, onFechar, divergencia = 'geral' }: { tecnico: string; mes: string; onFechar: () => void; divergencia?: Divergencia }) {
  const [d, setD] = useState<FuroKm | null>(null)
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [foco, setFoco] = useState<string | null>(null)
  const [det, setDet] = useState<Record<string, DiaDetalhado | null>>({})
  const [ia, setIa] = useState<AnaliseFuro | null>(null)
  const [pensando, setPensando] = useState(false)
  const [okMapa, setOkMapa] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<any>(null)
  const camada = useRef<any>(null)
  const pedidos = useRef(new Set<string>())
  // animação do dia em foco (José, 28/10/2026: "dentro do mapa coloca a animação para ficar fácil de entender")
  const [anim, setAnim] = useState<{ t: number; km: number; fim?: boolean } | null>(null)
  const animRef = useRef<{ raf: number; marca: any; rastro: any } | null>(null)

  const pedirIA = async (forcar = false) => {
    setPensando(true)
    try {
      const r = await fetch('/api/mecanicos/fantasmas/furo', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico, mes, forcar, divergencia }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha')
      setIa(j)
    } catch (e) { setIa({ resumo: `O Tratorilson não conseguiu analisar agora (${e instanceof Error ? e.message : 'erro'}).`, pontos: [], geradoEm: '' }) }
    setPensando(false)
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas/furo?tecnico=${encodeURIComponent(tecnico)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha')
        if (!vivo) return
        setD(j)
        // começa com o dia de maior furo aberto e já pede o resumo
        const primeiro = (j as FuroKm).dias.find(filtroDia(j as FuroKm, divergencia))?.data
        if (primeiro) { setSel([primeiro]); setFoco(primeiro) }
        void pedirIA()
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecnico, mes, divergencia])

  useEffect(() => { carregarLeaflet(() => setOkMapa(true)) }, [])
  useEffect(() => {
    if (!okMapa || !caixa.current || mapa.current) return
    const L = (window as any).L
    mapa.current = L.map(caixa.current).setView(CENTRO_PADRAO, 9)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapa.current)
    camada.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current?.remove(); mapa.current = null }
  }, [okMapa, d])

  // busca o detalhe (rota + paradas com cidade + trechos) de cada dia marcado
  useEffect(() => {
    for (const dia of sel) {
      if (pedidos.current.has(dia)) continue
      pedidos.current.add(dia)
      void (async () => {
        try {
          const r = await fetch(`/api/mecanicos/fantasmas/furo?tecnico=${encodeURIComponent(tecnico)}&mes=${mes}&rota=${dia}`, { headers: await authHeaders(), cache: 'no-store' })
          const j = r.ok ? await r.json() : null
          setDet((p) => ({ ...p, [dia]: j && j.data ? { ...j, pontos: filtrarEspetos(j.pontos || []) } : null }))
        } catch { setDet((p) => ({ ...p, [dia]: null })) }
      })()
    }
  }, [sel, tecnico, mes])

  const cor = useMemo(() => Object.fromEntries(sel.map((x, i) => [x, CORES[i % CORES.length]])), [sel])

  // desenha: rota de cada dia na cor dele (o dia em foco mais forte) + paradas
  useEffect(() => {
    if (!mapa.current || !camada.current) return
    const L = (window as any).L
    camada.current.clearLayers()
    const b: [number, number][] = []
    for (const dia of sel) {
      const dd = det[dia]
      if (!dd) continue
      const c = cor[dia], forte = dia === foco
      const { segmentos } = segmentarTrajeto(dd.pontos as any)
      for (const s of segmentos) if (s.length >= 2) L.polyline(s.map((p: any) => [p.lat, p.lng]), { color: c, weight: forte ? 5 : 3, opacity: forte ? 0.9 : 0.45 }).addTo(camada.current)
      if (forte) for (const p of dd.pontos) b.push([p.lat, p.lng])
      dd.paradas.forEach((pa) => {
        if (pa.min < 5) return
        const nome = pa.cliente ? `<b style="color:#059669">${pa.cliente.nome}</b> · ${pa.cliente.os}${pa.cliente.colega ? ` (OS do ${pa.cliente.colega.split(' ')[0]})` : ''}<br><small>${CONF[pa.cliente.conf]}</small>` : `<b>${pa.onde}</b>`
        L.circleMarker([pa.lat, pa.lng], { radius: pa.min >= 60 ? 9 : 6, weight: 2, color: '#fff', fillColor: corParada(pa, c), fillOpacity: forte ? 1 : 0.6 })
          .bindPopup(`<div style="font-size:12.5px;line-height:1.45"><b>${fmtDia(dia)} · ${hora(pa.inicio)} → ${hora(pa.fim)}</b> (${dur(pa.min)})<br>${nome}${pa.cidade ? `<br>📍 ${pa.cidade}` : ''}${pa.kmAntes ? `<br>🚗 ${km(pa.kmAntes)} até aqui` : ''}${pa.atipica ? '<br><b style="color:#dc2626">parada atípica</b>' : ''}</div>`)
          .addTo(camada.current)
        if (forte) b.push([pa.lat, pa.lng])
      })
    }
    if (b.length > 1) mapa.current.fitBounds(b, { padding: [30, 30] })
  }, [sel, det, cor, foco, okMapa])

  const parar = () => {
    const a = animRef.current
    if (a) { cancelAnimationFrame(a.raf); a.marca?.remove(); a.rastro?.remove() }
    animRef.current = null
    setAnim(null)
  }
  const tocar = () => {
    const dd = foco ? det[foco] : null
    if (!dd || dd.pontos.length < 2 || !mapa.current) return
    parar()
    const L = (window as any).L
    // só os pontos em que o carro andou (parado não precisa de quadro)
    const pts = dd.pontos.filter((p, i, a) => i === 0 || distanciaM(a[i - 1], p) > 15)
    const acum: number[] = [0]
    for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + distanciaM(pts[i - 1], pts[i]) / 1000)
    const marca = L.marker([pts[0].lat, pts[0].lng], { icon: L.divIcon({ className: '', html: '<div class="fk-carro"><i class="fas fa-car-side"></i></div>', iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000 }).addTo(mapa.current)
    const rastro = L.polyline([], { color: '#0f172a', weight: 6, opacity: 0.8 }).addTo(mapa.current)
    const DUR = Math.min(32000, Math.max(12000, pts.length * 45))
    const t0 = performance.now()
    let ultimo = 0
    const passo = (agora: number) => {
      const fr = Math.min(1, (agora - t0) / DUR), k = fr * (pts.length - 1), i = Math.floor(k), q = k - i
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)]
      const pos = [a.lat + (b.lat - a.lat) * q, a.lng + (b.lng - a.lng) * q]
      marca.setLatLng(pos)
      rastro.setLatLngs([...pts.slice(0, i + 1).map((p) => [p.lat, p.lng]), pos])
      if (agora - ultimo > 120 || fr >= 1) { ultimo = agora; setAnim({ t: Date.parse(a.dt), km: acum[i], fim: fr >= 1 }) }
      if (fr < 1 && animRef.current) animRef.current.raf = requestAnimationFrame(passo)
    }
    animRef.current = { raf: requestAnimationFrame(passo), marca, rastro }
  }
  // trocou de dia ou fechou: para a animação
  useEffect(() => () => { const a = animRef.current; if (a) { cancelAnimationFrame(a.raf); a.marca?.remove(); a.rastro?.remove() } animRef.current = null }, [foco])
  useEffect(() => { setAnim(null) }, [foco])

  // um dia por vez no mapa (José, 28/10/2026: marcar vários caminhos juntos "é ruim, tira isso")
  const abrirDia = (dia: string) => { setSel([dia]); setFoco(dia) }
  const comFuro = d ? d.dias.filter(filtroDia(d, divergencia)) : []
  const semOS = d ? d.dias.filter((x) => !x.os.length && x.kmGps > 5) : []
  const osDiv = d ? osDaDiv(d, divergencia) : []
  const un = DIVERGENCIAS[divergencia].unidade
  const diasDasOS = (ids: string[]) => (d?.dias || []).filter((x) => x.os.some((o) => ids.includes(o.os))).map((x) => x.data)
  const df = foco ? det[foco] : null

  return (
    <Janela titulo={`${divergencia === 'geral' ? 'Onde foi o furo de km' : DIVERGENCIAS[divergencia].titulo.replace(/^./, (c) => c.toUpperCase())} · ${tecnico.split(' ').slice(0, 2).join(' ')}`} sub="o Tratorilson explica a divergência; o mapa mostra o caminho do carro em cada dia" ic="fa-route" cor="#dc2626" onFechar={onFechar}>
      <style>{ESTILO_FK}</style>
      {erro && <div className="fk-erro">{erro}</div>}
      {!d && !erro && <div className="fk-carr"><i className="fas fa-circle-notch fa-spin" /> juntando GPS, OS e paradas…</div>}
      {d && (
        <>
          <div className="fk-topo">
            <div><small><i className="fas fa-satellite-dish" /> rodou (GPS)</small><b>{kmI(d.kmGps)}</b></div>
            <i className="fas fa-minus fk-op" />
            <div><small><i className="fas fa-file-invoice" /> cobrou nas OS</small><b>{kmI(d.kmCobrado)}</b></div>
            <i className="fas fa-equals fk-op" />
            <div className="furo"><small><i className="fas fa-triangle-exclamation" /> furo</small><b>{kmI(d.furo)}</b><em>{d.kmGps ? `${Math.round((d.furo / d.kmGps) * 100)}% do que rodou` : ''}</em></div>
            <div className="sem"><small><i className="fas fa-calendar-xmark" /> dias rodando sem OS</small><b>{semOS.length}</b><em>{kmI(semOS.reduce((s, x) => s + x.kmGps, 0))}</em></div>
          </div>

          <section className="fk-ia">
            <header>
              <span className="fk-robo"><i className="fas fa-robot" /></span>
              <b>Tratorilson: {DIVERGENCIAS[divergencia].titulo}</b>
              <button type="button" onClick={() => void pedirIA(true)} disabled={pensando} title="analisar de novo"><i className={`fas fa-rotate${pensando ? ' fa-spin' : ''}`} /></button>
            </header>
            {pensando && !ia ? <p className="fk-pensa"><i className="fas fa-circle-notch fa-spin" /> lendo os dias, as OS e as paradas do carro…</p> : ia && (
              <>
                <p className="fk-resumo">{ia.resumo}</p>
                {ia.pontos.length > 0 && (
                  <div className="fk-pontos">
                    {ia.pontos.map((p, i) => (
                      <button key={i} type="button" className="fk-ponto" onClick={() => { const ds = [...new Set([...p.dias, ...diasDasOS(p.os || [])])].filter((x) => d.dias.some((y) => y.data === x)); if (ds.length) abrirDia(ds[0]) }} title="ver no mapa">
                        <span>{i + 1}</span>
                        <div><b>{p.titulo}{p.valor ? <em> · ~{fmtValor(p.valor, un)}</em> : null}</b><small>{p.explicacao}</small>{(p.os || []).length > 0 && <u className="os"><i className="fas fa-file-lines" /> {p.os.join(', ')}</u>}{p.dias.length > 0 && <span className="fk-ponto-dias">{p.dias.filter((x) => d.dias.some((y) => y.data === x)).map((x) => <u key={x} role="link" className={foco === x ? 'on' : ''} onClick={(e) => { e.stopPropagation(); abrirDia(x) }}><i className="fas fa-map-location-dot" /> {fmtDia(x)}</u>)}</span>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="fk-corpo">
            <div className="fk-dias">
              {osDiv.length > 0 && (
                <div className="fk-osdiv">
                  <div className="fk-dias-cab"><b>OS com a divergência</b><small>relatório × cobrado</small></div>
                  {osDiv.map((o) => {
                    const rel = divergencia === 'km-nao-cobrado' ? o.kmRel : o.horasRel, cob = divergencia === 'km-nao-cobrado' ? o.kmCobrado : o.horasCobradas
                    return (
                      <button key={o.os} type="button" className="fk-osl" onClick={() => { const ds = diasDasOS([o.os]); if (ds.length) abrirDia(ds[0]) }}>
                        <b>{o.os}</b><span>{o.cliente}</span>
                        <small>relatório {fmtValor(rel, un)} · cobrado {fmtValor(cob, un)}</small><em>−{fmtValor(Math.round((rel - cob) * 10) / 10, un)}</em>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="fk-dias-cab"><b>{TITULO_LISTA[divergencia]}</b><small>clique num dia para ver no mapa</small></div>
              {comFuro.length === 0 && <p className="fk-vazio">Nenhum dia com essa divergência.</p>}
              {comFuro.map((x) => <LinhaDia key={x.data} x={x} on={sel.includes(x.data)} foco={foco === x.data} cor={cor[x.data]} carregando={sel.includes(x.data) && !(x.data in det)} onClick={() => abrirDia(x.data)} />)}
            </div>
            <div className="fk-dir">
              <div className="fk-mapa-c">
                <div ref={caixa} className="fk-mapa" />
                {sel.some((x) => !(x in det)) && <span className="fk-mapa-carr"><i className="fas fa-circle-notch fa-spin" /> buscando rota e cidades…</span>}
                {!sel.length && <span className="fk-mapa-carr">Clique num dia ao lado para ver o caminho</span>}
                {foco && df && df.pontos.length > 1 && (
                  <div className="fk-play">
                    <button type="button" onClick={() => (anim && !anim.fim ? parar() : tocar())} title={anim && !anim.fim ? 'parar' : 'ver o carro andando'}>
                      <i className={`fas ${anim && !anim.fim ? 'fa-stop' : anim?.fim ? 'fa-rotate-right' : 'fa-play'}`} />
                    </button>
                    {anim ? <span><b>{hora(new Date(anim.t).toISOString())}</b> · {km(anim.km)} rodados{anim.fim ? ' · fim do dia' : ''}</span> : <span>ver o carro andando em {fmtDia(foco)}</span>}
                  </div>
                )}
                <div className="fk-leg"><span><i className="bola" style={{ background: '#059669' }} /> cliente da OS</span><span><i className="bola" style={{ background: '#0f172a' }} /> loja</span><span><i className="bola" style={{ background: '#2563eb' }} /> outra parada</span><span><i className="bola" style={{ background: '#dc2626' }} /> atípica</span></div>
              </div>
              {foco && <LinhaDoTempo dia={foco} dd={df} cor={cor[foco]} agora={anim?.t ?? null} />}
            </div>
          </div>
        </>
      )}
    </Janela>
  )
}

function LinhaDia({ x, on, foco, cor, carregando, onClick }: { x: DiaFuro; on: boolean; foco: boolean; cor?: string; carregando: boolean; onClick: () => void }) {
  const pc = x.kmGps ? Math.min(100, (x.kmCobrado / x.kmGps) * 100) : 0
  return (
    <button type="button" className={`fk-dia ${on ? 'on' : ''} ${foco ? 'foco' : ''}`} style={{ '--c': cor || '#cbd5e1' } as React.CSSProperties} onClick={onClick}>
      <span className="fk-chk">{carregando ? <i className="fas fa-circle-notch fa-spin" /> : on ? <i className="fas fa-eye" /> : null}</span>
      <div className="fk-dia-m">
        <div className="fk-dia-t"><b>{fmtDia(x.data)}</b><em>{kmI(x.furo)} sem cobrar</em></div>
        <div className="fk-dia-bar" title={`cobrado ${kmI(x.kmCobrado)} de ${kmI(x.kmGps)} rodados`}><i style={{ width: `${pc}%` }} /></div>
        <small>{kmI(x.kmGps)} rodados · {kmI(x.kmCobrado)} cobrados{x.ligadoH ? ` · ligado ${String(x.ligadoH).replace('.', ',')} h` : ''}{x.saida ? ` · ligou ${hora(x.saida)}` : ''}{x.volta ? `, desligou ${hora(x.volta)}` : ''}</small>
        {x.os.length ? x.os.map((o) => (
          <small key={o.os} className={`fk-os ${o.noCliente ? (o.noCliente.conf === 'provavel' ? 'prov' : 'sim') : 'nao'}`}>
            <i className={`fas ${o.noCliente ? 'fa-location-dot' : 'fa-location-crosshairs'}`} /> {o.os} {o.cliente.split(' ').slice(0, 3).join(' ')}
            {o.noCliente ? <> · no cliente {hora(o.noCliente.inicio)}–{hora(o.noCliente.fim)} ({dur(o.noCliente.min)}){o.noCliente.conf === 'provavel' ? ' provável' : ''}</> : <> · carro não passou no cliente</>}
          </small>
        )) : <small className="fk-os nao"><i className="fas fa-ban" /> nenhuma OS dele neste dia</small>}
        {/* colegas em OS no mesmo dia: sem OS dele, todos; com OS, só quando o carro passou no cliente do colega */}
        {(x.colegas || []).filter((o) => !x.os.length || o.noCliente).map((o) => (
          <small key={o.os} className={`fk-os ${o.noCliente ? (o.noCliente.conf === 'provavel' ? 'prov' : 'sim') : 'col'}`}>
            <i className="fas fa-user-group" /> {o.tecnico.split(' ')[0]}{o.semCarro ? ' (sem carro)' : ''} na {o.os} {o.cliente.split(' ').slice(0, 3).join(' ')}
            {o.noCliente ? <> · este carro foi lá {hora(o.noCliente.inicio)}–{hora(o.noCliente.fim)} ({dur(o.noCliente.min)}){o.noCliente.conf === 'provavel' ? ' provável' : ''}: o km pode estar na OS do colega</> : <> · este carro não passou lá</>}
            {o.noCliente && <b className={`fk-naos ${o.naOS ? 'sim' : 'nao'}`}>{o.naOS ? <><i className="fas fa-check" /> {x.os.length ? '' : 'e '}ele consta na OS</> : <><i className="fas fa-triangle-exclamation" /> o nome dele não está na OS</>}</b>}
          </small>
        ))}
      </div>
    </button>
  )
}

/** O dia contado em ordem: ligou, cada trecho (km) e cada parada (hora, quanto tempo, onde, cidade), desligou. */
function LinhaDoTempo({ dia, dd, cor, agora }: { dia: string; dd: DiaDetalhado | null | undefined; cor?: string; agora: number | null }) {
  if (dd === undefined) return <div className="fk-lt"><p className="fk-carr"><i className="fas fa-circle-notch fa-spin" /> montando o dia {fmtDia(dia)}…</p></div>
  if (!dd) return <div className="fk-lt"><p className="fk-vazio">Sem GPS para {fmtDia(dia)}.</p></div>
  const ps = dd.paradas.filter((p) => p.min >= 5)
  const noCli = dd.paradas.filter((p) => p.cliente).reduce((s, p) => s + p.min, 0)
  const naLoja = dd.paradas.filter((p) => p.loja).reduce((s, p) => s + p.min, 0)
  const fora = dd.paradas.filter((p) => !p.loja && !p.cliente).reduce((s, p) => s + p.min, 0)
  return (
    <div className="fk-lt" style={{ '--c': cor || '#2563eb' } as React.CSSProperties}>
      <div className="fk-lt-cab">
        <b><i className="fas fa-timeline" /> {fmtDia(dia)}: o dia do carro</b>
        <span><i className="fas fa-location-dot" style={{ color: '#059669' }} /> no cliente {dur(noCli)}</span>
        <span><i className="fas fa-store" /> na loja {dur(naLoja)}</span>
        <span><i className="fas fa-circle-question" style={{ color: '#b45309' }} /> em outros lugares {dur(fora)}</span>
      </div>
      <ol className="fk-lt-l">
        <li className="ev"><span className="h">{hora(dd.saida)}</span><i className="pt liga" /><div><b>Ligou o carro</b></div></li>
        {ps.map((p, i) => (
          <li key={i} className="grupo">
            {p.kmAntes != null && p.kmAntes > 0.2 && <div className="tr"><span className="h" /><i className="fio" /><small><i className="fas fa-car-side" /> rodou {km(p.kmAntes)}</small></div>}
            <div className={`ev ${p.cliente ? 'cli' : p.loja ? 'loja' : p.atipica ? 'atip' : ''} ${agora == null ? '' : Date.parse(p.inicio) > agora ? 'depois' : Date.parse(p.fim || p.inicio) >= agora ? 'agora' : ''}`}>
              <span className="h">{hora(p.inicio)}<small>{hora(p.fim)}</small></span>
              <i className="pt" />
              <div>
                <b>{p.cliente ? (p.cliente.colega ? <>No cliente do {p.cliente.colega.split(' ')[0]}: {p.cliente.nome}</> : <>No cliente: {p.cliente.nome}</>) : p.loja ? 'Na loja' : p.onde}</b>
                <small>parado {dur(p.min)}{p.cidade ? ` · ${p.cidade}` : ''}{p.cliente ? ` · ${p.cliente.os} · ${CONF[p.cliente.conf]}` : ''}{p.atipica ? ' · parada atípica' : ''}</small>
                {p.cliente?.colega && (() => { const c = dd.colegas.find((o) => o.os === p.cliente!.os); return c ? <small className={`fk-naos ${c.naOS ? 'sim' : 'nao'}`}>{c.naOS ? <><i className="fas fa-check" /> ele consta como técnico na {c.os}</> : <><i className="fas fa-triangle-exclamation" /> o nome dele não está na {c.os}: incluir como técnico?</>}</small> : null })()}
              </div>
            </div>
          </li>
        ))}
        {dd.kmFinal > 0.2 && <li className="grupo"><div className="tr"><span className="h" /><i className="fio" /><small><i className="fas fa-car-side" /> rodou {km(dd.kmFinal)}</small></div></li>}
        <li className="ev"><span className="h">{hora(dd.volta)}</span><i className="pt liga" /><div><b>Desligou o carro</b><small>{kmI(dd.kmGps)} no dia · {kmI(dd.kmCobrado)} cobrados</small></div></li>
      </ol>
    </div>
  )
}

const ESTILO_FK = `
.fk-erro { background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px 14px }
.fk-carr { padding: 30px; text-align: center; color: #475569; margin: 0 }
.fk-topo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.fk-topo > div { display: grid; gap: 1px; background: #fefefe; border: 1px solid #e8edf3; border-radius: 14px; padding: 10px 16px; min-width: 150px; animation: fkSobe .4s both }
.fk-topo small { font-size: 12.5px; color: #475569 } .fk-topo small i { margin-right: 4px; color: #64748b } .fk-topo b { font-size: 22px; font-weight: 500; color: #0f172a; font-variant-numeric: tabular-nums } .fk-topo em { font-style: normal; font-size: 12px; color: #475569 }
.fk-topo .furo { background: #fef2f2; border-color: #fecaca } .fk-topo .furo b { color: #b91c1c } .fk-topo .furo small i { color: #dc2626 }
.fk-topo .sem { margin-left: auto } .fk-op { color: #94a3b8; font-size: 13px }
.fk-ia { background: linear-gradient(135deg, #f5f3ff, #fefefe); border: 1px solid #ddd6fe; border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; animation: fkSobe .45s .1s both }
.fk-ia header { display: flex; gap: 10px; align-items: center } .fk-ia header b { font-size: 15px; font-weight: 500; flex: 1 }
.fk-ia header button { border: 0; background: #ede9fe; color: #6d28d9; width: 32px; height: 32px; border-radius: 10px; cursor: pointer }
.fk-robo { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #7c3aed; color: #fefefe }
.fk-pensa { margin: 0; color: #6d28d9; font-size: 14px } .fk-resumo { margin: 0; font-size: 15px; line-height: 1.55; color: #1e293b }
.fk-pontos { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px }
.fk-ponto { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; text-align: left; border: 1px solid #e9e5ff; background: #fefefe; border-radius: 12px; padding: 10px 12px; font-family: inherit; cursor: pointer; transition: border-color .2s, transform .2s } .fk-ponto:hover { border-color: #a78bfa; transform: translateY(-1px) }
.fk-ponto > span { width: 26px; height: 26px; border-radius: 50%; background: #ede9fe; color: #6d28d9; display: grid; place-items: center; font-size: 13px; font-weight: 600 }
.fk-ponto div { display: grid; gap: 3px } .fk-ponto b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-ponto b em { font-style: normal; color: #b91c1c } .fk-ponto small { font-size: 13px; color: #475569; line-height: 1.45 } .fk-ponto u { text-decoration: none; font-size: 12.5px; color: #6d28d9 } .fk-ponto u.os { color: #334155 }
.fk-ponto-dias { display: flex; gap: 4px 8px; flex-wrap: wrap } .fk-ponto-dias u { cursor: pointer; border-radius: 99px; padding: 1px 8px; background: #f5f3ff } .fk-ponto-dias u:hover, .fk-ponto-dias u.on { background: #7c3aed; color: #fefefe }
.fk-osdiv { display: grid; gap: 6px; margin-bottom: 10px }
.fk-osl { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 8px; align-items: baseline; text-align: left; border: 1px solid #fde68a; background: #fffbeb; border-radius: 12px; padding: 8px 11px; font-family: inherit; cursor: pointer }
.fk-osl b { font-size: 13.5px; font-weight: 600; color: #0f172a } .fk-osl span { font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .fk-osl small { grid-column: 1 / 3; font-size: 12.5px; color: #475569 } .fk-osl em { grid-row: 1 / 3; grid-column: 3; align-self: center; font-style: normal; font-weight: 600; color: #b91c1c; font-size: 14px }
.fk-corpo { display: grid; grid-template-columns: minmax(290px, 390px) minmax(0, 1fr); gap: 14px; align-items: start }
@media (max-width: 900px) { .fk-corpo { grid-template-columns: 1fr } }
.fk-dias { display: grid; gap: 6px; align-content: start; max-height: 860px; overflow: auto; padding-right: 4px }
.fk-dias-cab { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px 4px } .fk-dias-cab b { font-size: 14.5px; font-weight: 500 } .fk-dias-cab small { font-size: 12.5px; color: #64748b }
.fk-vazio { color: #475569; font-size: 14px; margin: 0; padding: 14px }
.fk-dia { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; text-align: left; border: 1px solid #e8edf3; background: #fefefe; border-radius: 12px; padding: 9px 11px; font-family: inherit; cursor: pointer; transition: border-color .2s, box-shadow .2s; animation: fkSobe .35s both }
.fk-dia:hover { border-color: #cbd5e1 } .fk-dia.on { border-color: var(--c) } .fk-dia.foco { box-shadow: inset 0 0 0 2px var(--c); background: color-mix(in srgb, var(--c) 4%, #fefefe) }
.fk-chk { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #cbd5e1; display: grid; place-items: center; font-size: 10px; color: #fefefe; margin-top: 1px } .fk-dia.on .fk-chk { background: var(--c); border-color: var(--c) }
.fk-dia-m { display: grid; gap: 4px; min-width: 0 } .fk-dia-t { display: flex; justify-content: space-between; gap: 8px } .fk-dia-t b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-dia-t em { font-style: normal; font-size: 13px; font-weight: 600; color: #b91c1c; white-space: nowrap }
.fk-dia-bar { height: 6px; border-radius: 99px; background: repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px); overflow: hidden } .fk-dia-bar i { display: block; height: 100%; background: #10b981; border-radius: 99px }
.fk-dia small { font-size: 12.5px; color: #475569; line-height: 1.4 }
.fk-os { display: block; border-radius: 8px; padding: 3px 8px } .fk-os i { font-size: 11px; margin-right: 2px } .fk-os.sim { background: #ecfdf5; color: #065f46 !important } .fk-os.prov { background: #fffbeb; color: #92400e !important } .fk-os.nao { background: #fef2f2; color: #991b1b !important } .fk-os.col { background: #eff6ff; color: #1e40af !important }
.fk-dir { display: grid; gap: 12px; min-width: 0 }
.fk-mapa-c { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; height: 440px }
.fk-mapa { position: absolute; inset: 0 }
.fk-mapa-carr { position: absolute; z-index: 500; top: 10px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fefefe; border-radius: 99px; padding: 6px 14px; font-size: 13px; white-space: nowrap }
.fk-leg { position: absolute; z-index: 500; left: 10px; bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap; background: rgba(254,254,254,.94); border-radius: 10px; padding: 6px 10px; font-size: 12px; color: #334155 }
.fk-leg i.bola { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fefefe; box-shadow: 0 0 0 1px #cbd5e1; vertical-align: middle; margin-right: 4px }
.fk-lt { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; animation: fkSobe .35s both }
.fk-lt-cab { display: flex; gap: 6px 12px; align-items: center; flex-wrap: wrap } .fk-lt-cab b { font-size: 15px; font-weight: 500; margin-right: auto } .fk-lt-cab b i { color: var(--c); margin-right: 4px } .fk-lt-cab span { font-size: 12.5px; color: #334155; background: #f8fafc; border-radius: 99px; padding: 3px 10px }
.fk-lt-l { list-style: none; margin: 0; padding: 0; display: grid }
.fk-lt-l .ev, .fk-lt-l .tr { display: grid; grid-template-columns: 52px 18px minmax(0, 1fr); gap: 10px; align-items: start }
.fk-lt-l .h { font-size: 13px; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums; display: grid; text-align: right } .fk-lt-l .h small { font-size: 11.5px; font-weight: 400; color: #64748b }
.fk-lt-l .pt { position: relative; justify-self: center; width: 14px; height: 14px; border-radius: 50%; background: var(--c); border: 3px solid #fefefe; box-shadow: 0 0 0 1px #cbd5e1; margin-top: 2px }
.fk-lt-l .pt.liga { background: #64748b } .fk-lt-l .ev.cli .pt { background: #059669 } .fk-lt-l .ev.loja .pt { background: #0f172a } .fk-lt-l .ev.atip .pt { background: #dc2626 }
.fk-lt-l .ev > div { display: grid; gap: 1px; padding-bottom: 8px } .fk-lt-l .ev b { font-size: 14px; font-weight: 500 } .fk-lt-l .ev.cli b { color: #047857 } .fk-lt-l .ev.atip b { color: #b91c1c } .fk-lt-l .ev small { font-size: 12.5px; color: #475569 }
.fk-lt-l .fio { justify-self: center; width: 3px; height: 26px; background: repeating-linear-gradient(var(--c) 0 4px, transparent 4px 7px); border-radius: 2px }
.fk-lt-l .tr small { align-self: center; font-size: 12.5px; color: #475569 } .fk-lt-l .tr small i { color: #94a3b8; margin-right: 3px }
.fk-play { position: absolute; z-index: 600; top: 10px; left: 10px; display: flex; gap: 10px; align-items: center; background: rgba(254,254,254,.96); border-radius: 99px; padding: 5px 14px 5px 5px; box-shadow: 0 6px 18px -8px rgba(15,23,42,.4); font-size: 13px; color: #334155 }
.fk-play button { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #0f172a; color: #fefefe; cursor: pointer; font-size: 12px } .fk-play b { font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums }
.fk-carro { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #0f172a; color: #fefefe; font-size: 14px; border: 3px solid #fefefe; box-shadow: 0 4px 12px rgba(15,23,42,.45) }
.fk-lt-l .ev.depois { opacity: .35 } .fk-lt-l .ev.agora { background: #eff6ff; border-radius: 10px } .fk-lt-l .ev.agora .pt { transform: scale(1.35); box-shadow: 0 0 0 4px #bfdbfe } .fk-lt-l .ev { transition: opacity .3s, background .3s }
.fk-naos { display: block; margin-top: 3px; font-size: 12.5px; font-weight: 500 } .fk-naos.sim { color: #047857 } .fk-naos.nao { color: #b91c1c } .fk-naos i { font-size: 11px; margin-right: 3px }
@keyframes fkSobe { from { opacity: 0; transform: translateY(6px) } }
`
