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
import type { FuroKm, DiaFuro, AnaliseFuro, DiaDetalhado, ParadaFuro, ConfCliente } from '@/lib/mecanicos/furo-km-server'
import { Janela } from './JanelasInfo'

const km = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')} km`
const kmI = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const fmtDia = (d: string) => `${SEM[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`)
const CORES = ['#2563eb', '#ef4444', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#16a34a', '#ea580c']
const CONF: Record<ConfCliente, string> = { confirmado: 'local confirmado no faturar', cadastro: 'local do cadastro do cliente', provavel: 'provável: parada mais longa do dia' }
const corParada = (p: ParadaFuro, c: string) => (p.cliente ? '#059669' : p.loja ? '#0f172a' : p.atipica ? '#dc2626' : c)

export default function FuroKmJanela({ tecnico, mes, onFechar }: { tecnico: string; mes: string; onFechar: () => void }) {
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
        // começa com o dia de maior furo aberto e já pede o resumo
        const primeiro = (j as FuroKm).dias.find((x) => x.furo > 5)?.data
        if (primeiro) { setSel([primeiro]); setFoco(primeiro) }
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
        const nome = pa.cliente ? `<b style="color:#059669">${pa.cliente.nome}</b> · ${pa.cliente.os}<br><small>${CONF[pa.cliente.conf]}</small>` : `<b>${pa.onde}</b>`
        L.circleMarker([pa.lat, pa.lng], { radius: pa.min >= 60 ? 9 : 6, weight: 2, color: '#fff', fillColor: corParada(pa, c), fillOpacity: forte ? 1 : 0.6 })
          .bindPopup(`<div style="font-size:12.5px;line-height:1.45"><b>${fmtDia(dia)} · ${hora(pa.inicio)} → ${hora(pa.fim)}</b> (${dur(pa.min)})<br>${nome}${pa.cidade ? `<br>📍 ${pa.cidade}` : ''}${pa.kmAntes ? `<br>🚗 ${km(pa.kmAntes)} até aqui` : ''}${pa.atipica ? '<br><b style="color:#dc2626">parada atípica</b>' : ''}</div>`)
          .addTo(camada.current)
        if (forte) b.push([pa.lat, pa.lng])
      })
    }
    if (b.length > 1) mapa.current.fitBounds(b, { padding: [30, 30] })
  }, [sel, det, cor, foco, okMapa])

  const alternar = (dia: string) => {
    if (sel.includes(dia) && foco !== dia) { setFoco(dia); return }
    setSel((s) => (s.includes(dia) ? s.filter((x) => x !== dia) : [...s, dia]))
    setFoco((f) => (sel.includes(dia) ? (f === dia ? sel.filter((x) => x !== dia).slice(-1)[0] || null : f) : dia))
  }
  const comFuro = d?.dias.filter((x) => x.furo > 5) || []
  const semOS = comFuro.filter((x) => !x.os.length)
  const df = foco ? det[foco] : null

  return (
    <Janela titulo={`Onde foi o furo de km · ${tecnico.split(' ').slice(0, 2).join(' ')}`} sub="km rodados pelo GPS do carro que não viraram km cobrado na OS" ic="fa-route" cor="#dc2626" onFechar={onFechar}>
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
              <b>Tratorilson: onde foi o furo</b>
              <button type="button" onClick={() => void pedirIA(true)} disabled={pensando} title="analisar de novo"><i className={`fas fa-rotate${pensando ? ' fa-spin' : ''}`} /></button>
            </header>
            {pensando && !ia ? <p className="fk-pensa"><i className="fas fa-circle-notch fa-spin" /> lendo os dias, as OS e as paradas do carro…</p> : ia && (
              <>
                <p className="fk-resumo">{ia.resumo}</p>
                {ia.pontos.length > 0 && (
                  <div className="fk-pontos">
                    {ia.pontos.map((p, i) => (
                      <button key={i} type="button" className="fk-ponto" onClick={() => { const ds = p.dias.filter((x) => d.dias.some((y) => y.data === x)); if (ds.length) { setSel(ds); setFoco(ds[0]) } }} title={p.dias.length ? 'ver esses dias no mapa' : ''}>
                        <span>{i + 1}</span>
                        <div><b>{p.titulo}{p.km ? <em> · ~{kmI(p.km)}</em> : null}</b><small>{p.explicacao}</small>{p.dias.length > 0 && <u><i className="fas fa-map-location-dot" /> {p.dias.length === 1 ? fmtDia(p.dias[0]) : `${p.dias.length} dias`} no mapa</u>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="fk-corpo">
            <div className="fk-dias">
              <div className="fk-dias-cab"><b>Dias com furo</b><small>clique para abrir no mapa</small></div>
              {comFuro.length === 0 && <p className="fk-vazio">Nenhum dia com km rodado sem cobrança.</p>}
              {comFuro.map((x) => <LinhaDia key={x.data} x={x} on={sel.includes(x.data)} foco={foco === x.data} cor={cor[x.data]} carregando={sel.includes(x.data) && !(x.data in det)} onClick={() => alternar(x.data)} />)}
            </div>
            <div className="fk-dir">
              <div className="fk-mapa-c">
                <div ref={caixa} className="fk-mapa" />
                {sel.some((x) => !(x in det)) && <span className="fk-mapa-carr"><i className="fas fa-circle-notch fa-spin" /> buscando rota e cidades…</span>}
                {!sel.length && <span className="fk-mapa-carr">Clique num dia ao lado para ver o caminho</span>}
                <div className="fk-leg"><span><i className="bola" style={{ background: '#059669' }} /> cliente da OS</span><span><i className="bola" style={{ background: '#0f172a' }} /> loja</span><span><i className="bola" style={{ background: '#2563eb' }} /> outra parada</span><span><i className="bola" style={{ background: '#dc2626' }} /> atípica</span></div>
              </div>
              {foco && <LinhaDoTempo dia={foco} dd={df} cor={cor[foco]} />}
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
      <span className="fk-chk">{carregando ? <i className="fas fa-circle-notch fa-spin" /> : on ? <i className="fas fa-check" /> : null}</span>
      <div className="fk-dia-m">
        <div className="fk-dia-t"><b>{fmtDia(x.data)}</b><em>{kmI(x.furo)} sem cobrar</em></div>
        <div className="fk-dia-bar" title={`cobrado ${kmI(x.kmCobrado)} de ${kmI(x.kmGps)} rodados`}><i style={{ width: `${pc}%` }} /></div>
        <small>{kmI(x.kmGps)} rodados · {kmI(x.kmCobrado)} cobrados{x.saida ? ` · saiu ${hora(x.saida)}` : ''}{x.volta ? `, desligou ${hora(x.volta)}` : ''}</small>
        {x.os.length ? x.os.map((o) => (
          <small key={o.os} className={`fk-os ${o.noCliente ? (o.noCliente.conf === 'provavel' ? 'prov' : 'sim') : 'nao'}`}>
            <i className={`fas ${o.noCliente ? 'fa-location-dot' : 'fa-location-crosshairs'}`} /> {o.os} {o.cliente.split(' ').slice(0, 3).join(' ')}
            {o.noCliente ? <> · no cliente {hora(o.noCliente.inicio)}–{hora(o.noCliente.fim)} ({dur(o.noCliente.min)}){o.noCliente.conf === 'provavel' ? ' provável' : ''}</> : <> · carro não passou no cliente</>}
          </small>
        )) : <small className="fk-os nao"><i className="fas fa-ban" /> nenhuma OS neste dia</small>}
      </div>
    </button>
  )
}

/** O dia contado em ordem: ligou, cada trecho (km) e cada parada (hora, quanto tempo, onde, cidade), desligou. */
function LinhaDoTempo({ dia, dd, cor }: { dia: string; dd: DiaDetalhado | null | undefined; cor?: string }) {
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
            <div className={`ev ${p.cliente ? 'cli' : p.loja ? 'loja' : p.atipica ? 'atip' : ''}`}>
              <span className="h">{hora(p.inicio)}<small>{hora(p.fim)}</small></span>
              <i className="pt" />
              <div>
                <b>{p.cliente ? <>No cliente: {p.cliente.nome}</> : p.loja ? 'Na loja' : p.onde}</b>
                <small>parado {dur(p.min)}{p.cidade ? ` · ${p.cidade}` : ''}{p.cliente ? ` · ${p.cliente.os} · ${CONF[p.cliente.conf]}` : ''}{p.atipica ? ' · parada atípica' : ''}</small>
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
.fk-ponto div { display: grid; gap: 3px } .fk-ponto b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-ponto b em { font-style: normal; color: #b91c1c } .fk-ponto small { font-size: 13px; color: #475569; line-height: 1.45 } .fk-ponto u { text-decoration: none; font-size: 12.5px; color: #6d28d9 }
.fk-corpo { display: grid; grid-template-columns: minmax(290px, 390px) minmax(0, 1fr); gap: 14px; align-items: start }
@media (max-width: 900px) { .fk-corpo { grid-template-columns: 1fr } }
.fk-dias { display: grid; gap: 6px; align-content: start; max-height: 860px; overflow: auto; padding-right: 4px }
.fk-dias-cab { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px 4px } .fk-dias-cab b { font-size: 14.5px; font-weight: 500 } .fk-dias-cab small { font-size: 12.5px; color: #64748b }
.fk-vazio { color: #475569; font-size: 14px; margin: 0; padding: 14px }
.fk-dia { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; text-align: left; border: 1px solid #e8edf3; background: #fefefe; border-radius: 12px; padding: 9px 11px; font-family: inherit; cursor: pointer; transition: border-color .2s, box-shadow .2s; animation: fkSobe .35s both }
.fk-dia:hover { border-color: #cbd5e1 } .fk-dia.on { border-color: var(--c) } .fk-dia.foco { box-shadow: inset 0 0 0 2px var(--c); background: color-mix(in srgb, var(--c) 4%, #fefefe) }
.fk-chk { width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1; display: grid; place-items: center; font-size: 10px; color: #fefefe; margin-top: 1px } .fk-dia.on .fk-chk { background: var(--c); border-color: var(--c) }
.fk-dia-m { display: grid; gap: 4px; min-width: 0 } .fk-dia-t { display: flex; justify-content: space-between; gap: 8px } .fk-dia-t b { font-size: 14px; font-weight: 500; color: #0f172a } .fk-dia-t em { font-style: normal; font-size: 13px; font-weight: 600; color: #b91c1c; white-space: nowrap }
.fk-dia-bar { height: 6px; border-radius: 99px; background: repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px); overflow: hidden } .fk-dia-bar i { display: block; height: 100%; background: #10b981; border-radius: 99px }
.fk-dia small { font-size: 12.5px; color: #475569; line-height: 1.4 }
.fk-os { display: block; border-radius: 8px; padding: 3px 8px } .fk-os i { font-size: 11px; margin-right: 2px } .fk-os.sim { background: #ecfdf5; color: #065f46 !important } .fk-os.prov { background: #fffbeb; color: #92400e !important } .fk-os.nao { background: #fef2f2; color: #991b1b !important }
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
@keyframes fkSobe { from { opacity: 0; transform: translateY(6px) } }
`
