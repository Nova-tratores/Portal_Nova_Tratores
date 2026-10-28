'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Onde foi o furo de km (José, 28/10/2026): "clicar nos km rodados que não foram cobrados e mostrar no mapa todos os
// pontos e as rotas não cobradas, e pedir pro Tratorilson resumir onde basicamente foi o furo".
// Esquerda: o resumo do Tratorilson e os dias (GPS × cobrado). Direita: o mapa dos dias marcados (rota + paradas).
import { useEffect, useMemo, useRef, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { carregarLeaflet, CENTRO_PADRAO } from '@/components/feedbacks/leaflet'
import { filtrarEspetos, segmentarTrajeto } from '@/lib/frota/gps'
import type { FuroKm, DiaFuro, AnaliseFuro } from '@/lib/mecanicos/furo-km-server'
import { Janela } from './JanelasInfo'

const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const fmtDia = (d: string) => `${SEM[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const CORES = ['#ef4444', '#2563eb', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#16a34a', '#ea580c']

export default function FuroKmJanela({ tecnico, mes, onFechar }: { tecnico: string; mes: string; onFechar: () => void }) {
  const [d, setD] = useState<FuroKm | null>(null)
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [rotas, setRotas] = useState<Record<string, { lat: number; lng: number; dt: string }[]>>({})
  const [buscando, setBuscando] = useState(0)
  const [ia, setIa] = useState<AnaliseFuro | null>(null)
  const [pensando, setPensando] = useState(false)
  const [okMapa, setOkMapa] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<any>(null)
  const camada = useRef<any>(null)

  const pedirIA = async (forcar = false) => {
    setPensando(true)
    try {
      const r = await fetch('/api/mecanicos/fantasmas/furo', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico, mes, forcar }) })
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
        // começa com os 3 dias de maior furo no mapa e já pede o resumo
        setSel((j as FuroKm).dias.filter((x) => x.furo > 5).slice(0, 3).map((x) => x.data))
        void pedirIA()
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecnico, mes])

  useEffect(() => { carregarLeaflet(() => setOkMapa(true)) }, [])
  useEffect(() => {
    if (!okMapa || !caixa.current || mapa.current) return
    const L = (window as any).L
    mapa.current = L.map(caixa.current).setView(CENTRO_PADRAO, 9)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapa.current)
    camada.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current?.remove(); mapa.current = null }
  }, [okMapa, d])

  // busca a rota de cada dia marcado
  useEffect(() => {
    const faltam = sel.filter((x) => !rotas[x])
    if (!faltam.length) return
    let vivo = true
    setBuscando((n) => n + faltam.length)
    for (const dia of faltam) {
      void (async () => {
        try {
          const r = await fetch(`/api/mecanicos/fantasmas/furo?tecnico=${encodeURIComponent(tecnico)}&mes=${mes}&rota=${dia}`, { headers: await authHeaders(), cache: 'no-store' })
          const j = r.ok ? await r.json() : { pontos: [] }
          if (vivo) setRotas((p) => ({ ...p, [dia]: filtrarEspetos(j.pontos || []) }))
        } catch { if (vivo) setRotas((p) => ({ ...p, [dia]: [] })) }
        if (vivo) setBuscando((n) => Math.max(0, n - 1))
      })()
    }
    return () => { vivo = false }
  }, [sel, rotas, tecnico, mes])

  const cor = useMemo(() => Object.fromEntries(sel.map((x, i) => [x, CORES[i % CORES.length]])), [sel])

  // desenha: rota de cada dia na cor dele + paradas (vermelho = atípica)
  useEffect(() => {
    if (!mapa.current || !camada.current || !d) return
    const L = (window as any).L
    camada.current.clearLayers()
    const b: [number, number][] = []
    for (const dia of sel) {
      const c = cor[dia]
      const pts = rotas[dia] || []
      const { segmentos } = segmentarTrajeto(pts as any)
      for (const s of segmentos) if (s.length >= 2) L.polyline(s.map((p: any) => [p.lat, p.lng]), { color: c, weight: 4, opacity: 0.85 }).addTo(camada.current)
      for (const p of pts) b.push([p.lat, p.lng])
      const info = d.dias.find((x) => x.data === dia)
      for (const pa of info?.paradas || []) {
        if (pa.min < 5) continue
        L.circleMarker([pa.lat, pa.lng], { radius: pa.min >= 60 ? 9 : 6, weight: 2, color: '#fff', fillColor: pa.atipica ? '#dc2626' : c, fillOpacity: 1 })
          .bindPopup(`<div style="font-size:12.5px"><b>${fmtDia(dia)} · ${hora(pa.inicio)}${pa.fim ? ` → ${hora(pa.fim)}` : ''}</b><br>${pa.onde} · parado ${pa.min} min${pa.atipica ? '<br><b style="color:#dc2626">parada atípica</b>' : ''}</div>`)
          .addTo(camada.current)
        b.push([pa.lat, pa.lng])
      }
    }
    if (b.length > 1) mapa.current.fitBounds(b, { padding: [30, 30] })
  }, [sel, rotas, cor, d, okMapa])

  const alternar = (dia: string) => setSel((s) => (s.includes(dia) ? s.filter((x) => x !== dia) : [...s, dia]))
  const comFuro = d?.dias.filter((x) => x.furo > 5) || []
  const semOS = comFuro.filter((x) => !x.os.length)

  return (
    <Janela titulo={`Onde foi o furo de km · ${tecnico.split(' ').slice(0, 2).join(' ')}`} sub="km rodados pelo GPS do carro que não viraram km cobrado na OS" ic="fa-route" cor="#dc2626" onFechar={onFechar}>
      <style>{ESTILO_FK}</style>
      {erro && <div className="fk-erro">{erro}</div>}
      {!d && !erro && <div className="fk-carr"><i className="fas fa-circle-notch fa-spin" /> juntando GPS, OS e paradas…</div>}
      {d && (
        <>
          <div className="fk-topo">
            <div><small><i className="fas fa-satellite-dish" /> rodou (GPS)</small><b>{km(d.kmGps)}</b></div>
            <i className="fas fa-minus fk-op" />
            <div><small><i className="fas fa-file-invoice" /> cobrou nas OS</small><b>{km(d.kmCobrado)}</b></div>
            <i className="fas fa-equals fk-op" />
            <div className="furo"><small><i className="fas fa-triangle-exclamation" /> furo</small><b>{km(d.furo)}</b><em>{d.kmGps ? `${Math.round((d.furo / d.kmGps) * 100)}% do que rodou` : ''}</em></div>
            <div className="sem"><small><i className="fas fa-calendar-xmark" /> dias rodando sem OS</small><b>{semOS.length}</b><em>{km(semOS.reduce((s, x) => s + x.kmGps, 0))}</em></div>
          </div>

          <section className="fk-ia">
            <header>
              <span className="fk-robo"><i className="fas fa-robot" /></span>
              <b>Tratorilson: onde foi o furo</b>
              <button type="button" onClick={() => void pedirIA(true)} disabled={pensando} title="analisar de novo"><i className={`fas fa-rotate${pensando ? ' fa-spin' : ''}`} /></button>
            </header>
            {pensando && !ia ? <p className="fk-pensa"><i className="fas fa-circle-notch fa-spin" /> lendo os dias, as OS e as paradas do carro…</p> : ia && (
              <>
                <p className="fk-resumo">{ia.resumo}</p>
                {ia.pontos.length > 0 && (
                  <div className="fk-pontos">
                    {ia.pontos.map((p, i) => (
                      <button key={i} type="button" className="fk-ponto" onClick={() => p.dias.length && setSel(p.dias.filter((x) => d.dias.some((y) => y.data === x)))} title={p.dias.length ? 'ver esses dias no mapa' : ''}>
                        <span>{i + 1}</span>
                        <div><b>{p.titulo}{p.km ? <em> · ~{km(p.km)}</em> : null}</b><small>{p.explicacao}</small>{p.dias.length > 0 && <u><i className="fas fa-map-location-dot" /> {p.dias.length === 1 ? fmtDia(p.dias[0]) : `${p.dias.length} dias`} no mapa</u>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="fk-corpo">
            <div className="fk-dias">
              <div className="fk-dias-cab"><b>Dias com furo</b><small>marque para ver no mapa</small></div>
              {comFuro.length === 0 && <p className="fk-vazio">Nenhum dia com km rodado sem cobrança.</p>}
              {comFuro.map((x) => <LinhaDia key={x.data} x={x} on={sel.includes(x.data)} cor={cor[x.data]} carregando={sel.includes(x.data) && !rotas[x.data]} onClick={() => alternar(x.data)} />)}
            </div>
            <div className="fk-mapa-c">
              <div ref={caixa} className="fk-mapa" />
              {buscando > 0 && <span className="fk-mapa-carr"><i className="fas fa-circle-notch fa-spin" /> buscando as rotas…</span>}
              {!sel.length && <span className="fk-mapa-vazio">Marque um dia ao lado para ver a rota</span>}
              <div className="fk-leg"><span><i style={{ background: '#2563eb' }} /> rota do dia</span><span><i className="bola" style={{ background: '#2563eb' }} /> parada</span><span><i className="bola" style={{ background: '#dc2626' }} /> parada atípica</span></div>
            </div>
          </div>
        </>
      )}
    </Janela>
  )
}

function LinhaDia({ x, on, cor, carregando, onClick }: { x: DiaFuro; on: boolean; cor?: string; carregando: boolean; onClick: () => void }) {
  const pc = x.kmGps ? Math.min(100, (x.kmCobrado / x.kmGps) * 100) : 0
  return (
    <button type="button" className={`fk-dia ${on ? 'on' : ''}`} style={{ '--c': cor || '#cbd5e1' } as React.CSSProperties} onClick={onClick}>
      <span className="fk-chk">{carregando ? <i className="fas fa-circle-notch fa-spin" /> : on ? <i className="fas fa-check" /> : null}</span>
      <div className="fk-dia-m">
        <div className="fk-dia-t"><b>{fmtDia(x.data)}</b><em>{km(x.furo)} sem cobrar</em></div>
        <div className="fk-dia-bar" title={`cobrado ${km(x.kmCobrado)} de ${km(x.kmGps)} rodados`}><i style={{ width: `${pc}%` }} /></div>
        <small>{km(x.kmGps)} rodados · {km(x.kmCobrado)} cobrados · {x.os.length ? x.os.map((o) => `${o.os} ${o.cliente.split(' ').slice(0, 2).join(' ')}`).join(', ') : <b className="sem">nenhuma OS no dia</b>}</small>
      </div>
    </button>
  )
}

const ESTILO_FK = `
.fk-erro { background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px 14px }
.fk-carr { padding: 40px; text-align: center; color: #475569 }
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
.fk-ponto div { display: grid; gap: 3px } .fk-ponto b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-ponto b em { font-style: normal; color: #b91c1c } .fk-ponto small { font-size: 13px; color: #475569; line-height: 1.45 } .fk-ponto u { text-decoration: none; font-size: 12.5px; color: #6d28d9 }
.fk-corpo { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 14px; min-height: 460px }
@media (max-width: 900px) { .fk-corpo { grid-template-columns: 1fr } }
.fk-dias { display: grid; gap: 6px; align-content: start; max-height: 560px; overflow: auto; padding-right: 4px }
.fk-dias-cab { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px 4px } .fk-dias-cab b { font-size: 14.5px; font-weight: 500 } .fk-dias-cab small { font-size: 12.5px; color: #64748b }
.fk-vazio { color: #475569; font-size: 14px }
.fk-dia { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; text-align: left; border: 1px solid #e8edf3; background: #fefefe; border-radius: 12px; padding: 9px 11px; font-family: inherit; cursor: pointer; transition: border-color .2s, box-shadow .2s; animation: fkSobe .35s both }
.fk-dia:hover { border-color: #cbd5e1 } .fk-dia.on { border-color: var(--c); box-shadow: inset 0 0 0 1px var(--c) }
.fk-chk { width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1; display: grid; place-items: center; font-size: 10px; color: #fefefe; margin-top: 1px } .fk-dia.on .fk-chk { background: var(--c); border-color: var(--c) }
.fk-dia-m { display: grid; gap: 4px; min-width: 0 } .fk-dia-t { display: flex; justify-content: space-between; gap: 8px } .fk-dia-t b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-dia-t em { font-style: normal; font-size: 13px; font-weight: 600; color: #b91c1c; white-space: nowrap }
.fk-dia-bar { height: 6px; border-radius: 99px; background: repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px); overflow: hidden } .fk-dia-bar i { display: block; height: 100%; background: #10b981; border-radius: 99px }
.fk-dia small { font-size: 12.5px; color: #475569; line-height: 1.4 } .fk-dia small .sem { color: #b91c1c; font-weight: 500 }
.fk-mapa-c { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; min-height: 460px }
.fk-mapa { position: absolute; inset: 0 }
.fk-mapa-carr, .fk-mapa-vazio { position: absolute; z-index: 500; top: 10px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fefefe; border-radius: 99px; padding: 6px 14px; font-size: 13px }
.fk-leg { position: absolute; z-index: 500; left: 10px; bottom: 10px; display: flex; gap: 10px; background: rgba(254,254,254,.94); border-radius: 10px; padding: 6px 10px; font-size: 12px; color: #334155 }
.fk-leg i { display: inline-block; width: 16px; height: 4px; border-radius: 2px; vertical-align: middle; margin-right: 4px } .fk-leg i.bola { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fefefe; box-shadow: 0 0 0 1px #cbd5e1 }
@keyframes fkSobe { from { opacity: 0; transform: translateY(6px) } }
`
