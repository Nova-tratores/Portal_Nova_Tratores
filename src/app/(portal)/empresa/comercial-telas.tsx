'use client'
// Telas cheias do Comercial (/empresa) que buscam dados próprios (José, 11/11):
// • Vendedores: cada vendedor com carro, km, visitas (app NT Vendas), vendas, propostas e meta — /api/empresa/vendedores
// • Estoque: o mapa da loja (mesmas áreas e posições do Visual Estoque → Pátio), valor parado e custo de ficar parado
//   (SELIC acumulada desde a entrada, a conta do Visual Estoque) — /api/visual-estoque/produtos?modo=patio
// • Vitrine: foto, custo, preço de venda e margem de cada máquina; o diretor muda o preço (vai para o Omie) — /api/empresa/preco
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { carregarLeaflet, pinIcon, CENTRO_PADRAO } from '@/components/feedbacks/leaflet'
import { authHeaders } from '@/lib/auth/client'
import type { DadosComercial } from '@/lib/empresa/comercial'
import type { DadosVendedores, VendedorApp, VisitaVend } from '@/lib/empresa/vendedores'
import { ult12, compacto, brl, cap, nomeMes, plural, frasePecas, contar, somar, contas, Metas, type SetD } from './comercial'
import { TelaCheia, Secao, PizzaPropostas, PdfProposta } from './comercial-assuntos'

const COR_FICOU = '#15803d', COR_SAIU = '#be123c'
const dataBR = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
const diasAtras = (s: string | null) => { if (!s) return null; const d = Math.floor((Date.now() - new Date(s).getTime()) / 864e5); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }

// Guarda na memória da página o que já veio do servidor (José, 12/11: "isso tem que ser instantâneo"):
// o Comercial pede as telas pesadas ao abrir (prepararDados) e, ao clicar, a tela já nasce com os dados;
// por trás ela busca de novo e troca se algo mudou.
const memoria = new Map<string, unknown>()
const pedindo = new Map<string, Promise<unknown>>()
async function buscarJson(url: string): Promise<unknown> {
  if (!pedindo.has(url)) {
    pedindo.set(url, (async () => {
      const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw Object.assign(new Error(j.erro || `Erro ${r.status}`), { status: r.status })
      memoria.set(url, j)
      return j
    })().finally(() => pedindo.delete(url)))
  }
  return pedindo.get(url)!
}
/** chamado quando o Comercial abre: deixa as telas cheias prontas antes do clique */
export function prepararDados() {
  for (const u of ['/api/empresa/maquinas', '/api/empresa/vendedores', '/api/empresa/dre-gerencial?meses=24']) adiantar(u)
}
/** busca já e guarda na memória (a janela abre sem esperar) */
export function adiantar(url: string) { if (!memoria.has(url)) void buscarJson(url).catch(() => {}) }

export function useJson<T>(url: string) {
  const [d, setD] = useState<T | null>(() => (memoria.get(url) as T) ?? null), [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    buscarJson(url)
      .then((j) => { if (vivo) setD(j as T) })
      .catch((e: { status?: number; message?: string }) => { if (vivo && !memoria.has(url)) setErro(e?.status === 403 ? 'Sem acesso a esses dados.' : e?.message || 'Não deu para carregar agora.') })
    return () => { vivo = false }
  }, [url])
  return { d, setD, erro }
}

// ── VENDEDORES ───────────────────────────────────────────────────────────────
// Quem aparece vem do servidor (portal + RH: quem saiu não entra). Um cartão por vendedor; ao clicar, o detalhe:
// RH, faturamento, despesas, carro (módulo Frota), rotas, visitas no app e propostas.
const horaBR = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—')
const tempoCasa = (adm: string | null) => {
  if (!adm) return null
  const m = Math.floor((Date.now() - new Date(adm + 'T12:00:00').getTime()) / (30.44 * 864e5))
  return m < 1 ? 'menos de 1 mês' : m < 12 ? plural(m, 'mês', 'meses') : `${(m / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`
}

export function TelaVendedores({ d, setD, onFechar }: { d: DadosComercial | null; setD?: SetD; onFechar: () => void }) {
  const { d: app, erro } = useJson<DadosVendedores>('/api/empresa/vendedores')
  const [sel, setSel] = useState<string | null>(null)
  const c = d ? contas(d) : null
  const nomes = useMemo(() => (app?.vendedores || []).map((v) => v.nome), [app])
  const linha = (nome: string) => {
    const a = app?.vendedores.find((v) => v.nome === nome) || null
    const v12 = d ? ult12(d).filter((v) => v.vendedor === nome) : []
    const meta = c?.metas.find((m) => m.nome === nome)
    const props = d ? d.propostas.filter((p) => p.vendedor === nome) : []
    const doMes = c ? c.doMes.filter((v) => v.vendedor === nome) : []
    return { nome, a, v12, doMes, meta, props }
  }
  const cAtivos = c ? { ...c, metas: c.metas.filter((m) => nomes.includes(m.nome)) } : null
  if (sel) return <DetalheVendedor l={linha(sel)} dadosCom={d} onVoltar={() => setSel(null)} onFechar={onFechar} />
  return (
    <TelaCheia titulo="Vendedores" sub="quem está na equipe hoje (pelo portal e pelo RH)" onFechar={onFechar}>
      {erro && <div className="cm-aviso">{erro}</div>}
      {!app && !erro && <div className="ce-mudo">Carregando os vendedores…</div>}
      <div className="cmv-grade">
        {nomes.map((n) => {
          const l = linha(n), a = l.a!
          const abertas = l.props.filter((p) => p.aberta)
          return (
            <button key={n} className="cmv-card" onClick={() => setSel(n)}>
              <span className="cmv-nome">{n}<small>{a.rh?.cargo ? `${cap(a.rh.cargo.toLowerCase())}${a.rh.admissao ? ` · ${tempoCasa(a.rh.admissao)} de casa` : ''}` : 'Vendedor'}</small></span>
              <span className="cmv-nums">
                <span><b>{compacto(somar(l.doMes))}</b><small>vendeu em {nomeMes(c?.mes || '')}</small></span>
                <span><b>{compacto(somar(l.v12))}</b><small>em 12 meses</small></span>
                <span><b>{a.visitas}</b><small>visitas em 30 dias</small></span>
                <span><b>{abertas.length}</b><small>propostas abertas</small></span>
              </span>
              {l.meta?.meta ? <span className="cmv-meta"><span className="cm-meta-trilho"><span style={{ width: `${Math.min(100, (l.meta.vendeu / l.meta.meta) * 100)}%`, background: '#7c3aed' }} /></span><small>{Math.round((l.meta.vendeu / l.meta.meta) * 100)}% da meta do mês</small></span> : <span className="cmv-meta"><small>sem meta no mês</small></span>}
              <span className="cmv-ver">ver tudo <i className="fas fa-arrow-right" /></span>
            </button>
          )
        })}
      </div>
      {app && d && nomes.length > 1 && <CompararVendedores linhas={nomes.map(linha)} d={d} />}
      {cAtivos && d && <Secao titulo={`Metas de ${nomeMes(cAtivos.mes)}`}><Metas c={cAtivos} d={d} setD={setD} /></Secao>}
      {app && <p className="cma-nota">Entra quem está ativo no portal (Administração) ou no RH e não foi desligado em nenhum dos dois; no RH, cargos fora da venda ficam de fora.</p>}
    </TelaCheia>
  )
}

/** uma visita do app: o local no mapa e o relatório inteiro (José, 12/11: "quando clicar, mostra no mapa e o relatório da visita") */
// ── peças do detalhe do vendedor (José, 12/11) ─────────────────────────────────
/** janela com uma página/arquivo dentro (documento do carro, requisição, checklist) — sem abrir outra aba */
export function JanelaFrame({ titulo, sub, src, fotos, onFechar }: { titulo: string; sub?: string; src?: string | null; fotos?: string[]; onFechar: () => void }) {
  useEffect(() => { const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onFechar])
  const [foto, setFoto] = useState<string | null>(null)
  const ehImagem = (u: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={onFechar}>
      <div className="cmpdf" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{sub}</span>
          {src && <a className="cm-bt" href={src} target="_blank" rel="noreferrer"><i className="fas fa-up-right-from-square" /> Abrir fora</a>}
          <button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        {fotos && fotos.length > 0 && (
          <div className="cmfr-fotos">
            {src && <button className={foto == null ? 'on' : ''} onClick={() => setFoto(null)}><i className="fas fa-file-lines" /> Requisição</button>}
            {fotos.map((f, i) => <button key={f} className={foto === f ? 'on' : ''} onClick={() => setFoto(f)}><i className="fas fa-image" /> Anexo {i + 1}</button>)}
          </div>
        )}
        {foto ? (ehImagem(foto) ? <div className="cmfr-img"><img src={foto} alt="" /></div> : <iframe className="cmpdf-frame" src={foto} title="Anexo" />)
          : src ? (ehImagem(src) ? <div className="cmfr-img"><img src={src} alt="" /></div> : <iframe className="cmpdf-frame" src={src} title={titulo} />)
          : <div className="cmnf-msg">Sem arquivo.</div>}
      </div>
    </div>
  )
}

/** por que a confiança do checklist ficou baixa: cada alerta com quanto tirou e o motivo, na regra do módulo Frota (lib/frota/checklist.ts) */
function explicarAlerta(t: string): { pontos: number; porque: string } {
  const n = Number((t.match(/^(\d+)/) || [])[1] || 1)
  if (/menos de 8 minutos/i.test(t)) return { pontos: 30, porque: 'rápido demais para olhar o carro inteiro' }
  if (/menos de 15 minutos/i.test(t)) return { pontos: 15, porque: 'um checklist bem feito leva mais tempo' }
  if (/tempo médio por item.*muito rápido/i.test(t)) return { pontos: 25, porque: 'cada item respondido em poucos segundos' }
  if (/tempo médio por item/i.test(t)) return { pontos: 10, porque: 'itens respondidos rápido' }
  if (/menos de 10 segundos/i.test(t)) return { pontos: 5, porque: 'vários itens marcados sem parar para olhar' }
  if (/robótico/i.test(t)) return { pontos: 15, porque: 'respostas no mesmo ritmo, como quem marca tudo seguido' }
  if (/todos os itens marcados como ok/i.test(t)) return { pontos: 10, porque: 'é raro um carro sem nenhum detalhe; pode ter marcado sem conferir' }
  if (/nenhuma observação/i.test(t)) return { pontos: 5, porque: 'nada escrito em nenhum item' }
  if (/tamanho idêntico/i.test(t)) return { pontos: Math.min(30, n * 15), porque: 'a mesma foto pode ter sido usada em mais de um item' }
  if (/gps não mudou/i.test(t)) return { pontos: 10, porque: 'não andou em volta do carro durante o checklist' }
  if (/não comprovam/i.test(t)) return { pontos: Math.min(30, n * 10), porque: 'a foto não mostra o pneu pedido' }
  if (/fora do horário/i.test(t)) return { pontos: 5, porque: 'feito de madrugada ou à noite' }
  return { pontos: 0, porque: '' }
}

/** mapa do dia do carro: rota, paradas e onde está agora; troca o dia e filtra entre horas */
type RotaApi = { km: number; inicio: string | null; fim: string | null; pontos: Array<[number, number, string, number, number]>; paradas: Array<{ lat: number; lng: number; inicio: string; fim: string | null; duracao_min: number }>; visitas: Array<{ cliente_nome: string; data_visita: string; lat: number; lng: number }> }
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const horaSP = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).slice(0, 2)) + Number(new Date(iso).toLocaleString('en-GB', { minute: '2-digit', timeZone: 'America/Sao_Paulo' })) / 60
function MapaDia({ placa, onVisita, dia: diaFora, setDia: setDiaFora }: { placa: string; onVisita?: (v: { cliente: string; data: string; lat: number; lng: number }) => void; dia?: string; setDia?: (d: string) => void }) {
  const onVisitaRef = useRef(onVisita); onVisitaRef.current = onVisita
  const [diaInt, setDiaInt] = useState(hojeSP())
  const dia = diaFora ?? diaInt, setDia = setDiaFora ?? setDiaInt
  const [de, setDe] = useState(0), [ate, setAte] = useState(24)
  const [rota, setRota] = useState<RotaApi | null>(null), [erro, setErro] = useState<string | null>(null), [carregando, setCarregando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<{ map: any; camada: any } | null>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const ehHoje = dia === hojeSP()
  // busca a rota do dia (hoje: de novo a cada 60 s — o último ponto é onde o carro está)
  useEffect(() => {
    let vivo = true
    const buscar = async () => {
      setCarregando(true)
      try {
        const r = await fetch(`/api/empresa/rota?placa=${encodeURIComponent(placa)}&data=${dia}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.erro || `Erro ${r.status}`); setRota(null) } else { setErro(null); setRota(j) }
      } catch { if (vivo) setErro('Não deu para buscar a rota agora.') } finally { if (vivo) setCarregando(false) }
    }
    void buscar()
    const t = ehHoje ? setInterval(buscar, 60_000) : null
    return () => { vivo = false; if (t) clearInterval(t) }
  }, [placa, dia, ehHoje])
  const pontos = (rota?.pontos || []).filter((p) => { const h = horaSP(p[2]); return h >= de && h <= ate })
  const paradas = (rota?.paradas || []).filter((p) => { const h = horaSP(p.inicio); return h >= de && h <= ate })
  const kmTrecho = pontos.reduce((acc, p, i) => {
    if (!i) return 0
    const [a1, o1] = pontos[i - 1], [a2, o2] = p, R = 6371, dLa = ((a2 - a1) * Math.PI) / 180, dLo = ((o2 - o1) * Math.PI) / 180
    const x = Math.sin(dLa / 2) ** 2 + Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2
    return acc + 2 * R * Math.asin(Math.sqrt(x))
  }, 0)
  const ultimo = pontos[pontos.length - 1]
  // desenha no Leaflet
  useEffect(() => {
    carregarLeaflet(() => {
      const L = (window as unknown as { L: any }).L // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!caixa.current) return
      if (!mapaRef.current) {
        const map = L.map(caixa.current, { zoomControl: true, attributionControl: false }).setView(CENTRO_PADRAO, 10)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
        mapaRef.current = { map, camada: L.layerGroup().addTo(map) }
      }
      const { map, camada } = mapaRef.current
      camada.clearLayers()
      if (!pontos.length) return
      const ll = pontos.map((p) => [p[0], p[1]])
      L.polyline(ll, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(camada)
      L.circleMarker(ll[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip(`Saiu ${new Date(pontos[0][2]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`).addTo(camada)
      for (const p of paradas) {
        const fim = p.fim ? new Date(p.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'agora'
        L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 })
          .bindTooltip(`Parado ${new Date(p.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}–${fim} · ${Math.round(p.duracao_min)} min`).addTo(camada)
      }
      for (const v of rota?.visitas || []) if (v.lat && v.lng) L.marker([v.lat, v.lng], { icon: pinIcon(L, '#7c3aed') }).bindTooltip(`Visita: ${v.cliente_nome} · clique para abrir`).on('click', () => onVisitaRef.current?.({ cliente: v.cliente_nome, data: v.data_visita, lat: v.lat, lng: v.lng })).addTo(camada)
      const u = ll[ll.length - 1]
      L.marker(u, { icon: L.divIcon({ className: '', html: `<div class="cmmapa-agora${ehHoje && ate >= 23 ? ' vivo' : ''}"><i class="fas fa-car-side"></i></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .bindTooltip(`${ehHoje && ate >= 23 ? 'Agora' : 'Último ponto'} · ${new Date(ultimo![2]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`).addTo(camada)
      map.fitBounds(L.latLngBounds(ll).pad(0.15))
    })
  }, [pontos.length, paradas.length, rota, ehHoje, ate, de]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { mapaRef.current?.map.remove(); mapaRef.current = null }, [])
  const mudarDia = (n: number) => { const d = new Date(`${dia}T12:00:00`); d.setDate(d.getDate() + n); const s = d.toISOString().slice(0, 10); if (s <= hojeSP()) setDia(s) }
  const hh = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:00`
  return (
    <div className="cmmapa">
      <div className="cmmapa-filtros">
        <button className="cma-x" onClick={() => mudarDia(-1)} title="Dia anterior"><i className="fas fa-chevron-left" /></button>
        <input type="date" value={dia} max={hojeSP()} onChange={(e) => e.target.value && setDia(e.target.value)} />
        <button className="cma-x" onClick={() => mudarDia(1)} disabled={ehHoje} title="Próximo dia"><i className="fas fa-chevron-right" /></button>
        {!ehHoje && <button className="cm-bt" onClick={() => setDia(hojeSP())}>Hoje</button>}
        <span className="cmmapa-horas">entre
          <select value={de} onChange={(e) => setDe(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
          e
          <select value={ate} onChange={(e) => setAte(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{h + 1 === 24 ? '24:00' : hh(h + 1)}</option>)}</select>
        </span>
        <span className="cmmapa-res">{carregando ? 'buscando…' : rota ? `${Math.round(kmTrecho)} km · ${paradas.length} paradas${ehHoje ? ' · atualiza sozinho a cada minuto' : ''}` : ''}</span>
      </div>
      <div className="cmmapa-area">
        <div ref={caixa} className="cmmapa-mapa" />
        {(erro || (rota && !pontos.length)) && <div className="cmmapa-aviso">{erro || (rota?.pontos.length ? 'Nenhum ponto nesse horário.' : 'O carro não andou nesse dia.')}</div>}
      </div>
      <div className="cmmapa-leg"><span><i style={{ background: '#16a34a' }} />saída</span><span><i style={{ background: '#f59e0b' }} />parada</span><span><i style={{ background: '#7c3aed' }} />visita no app</span><span><i style={{ background: '#2563eb' }} />{ehHoje ? 'onde está agora' : 'último ponto'}</span></div>
    </div>
  )
}

const cidades = new Map<string, Promise<string | null>>()
function cidadeDe(lat: number, lng: number): Promise<string | null> {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (!cidades.has(k)) cidades.set(k, fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=pt-BR`)
    .then((r) => r.json())
    .then((j: { address?: Record<string, string> }) => {
      const a = j.address || {}
      const cid = a.city || a.town || a.village || a.municipality || a.county
      const uf = (a['ISO3166-2-lvl4'] || '').replace('BR-', '') || a.state
      return cid ? `${cid}${uf ? ` – ${uf}` : ''}` : null
    }).catch(() => null))
  return cidades.get(k)!
}

function JanelaVisita({ v, vendedor, placa, onFechar }: { v: VisitaVend; vendedor: string; placa?: string | null; onFechar: () => void }) {
  useEffect(() => { const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onFechar])
  const temGps = v.lat != null && v.lng != null
  // sem GPS na visita: onde o carro dele estava naquela data e hora (rastreador) — José, 12/11
  const [doCarro, setDoCarro] = useState<{ lat: number; lng: number; hora: string } | null | 'buscando' | 'sem'>(temGps || !placa ? null : 'buscando')
  useEffect(() => {
    if (temGps || !placa) return
    let vivo = true
    ;(async () => {
      try {
        const diaV = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(v.data))
        const r = await fetch(`/api/empresa/rota?placa=${encodeURIComponent(placa)}&data=${diaV}`, { headers: await authHeaders() })
        const j = await r.json()
        const alvo = new Date(v.data).getTime()
        const pts = (j.pontos || []) as Array<[number, number, string]>
        const perto = pts.reduce<[number, number, string] | null>((m, p) => (!m || Math.abs(new Date(p[2]).getTime() - alvo) < Math.abs(new Date(m[2]).getTime() - alvo) ? p : m), null)
        if (vivo) setDoCarro(perto && Math.abs(new Date(perto[2]).getTime() - alvo) < 3 * 3600_000 ? { lat: perto[0], lng: perto[1], hora: perto[2] } : 'sem')
      } catch { if (vivo) setDoCarro('sem') }
    })()
    return () => { vivo = false }
  }, [temGps, placa, v.data])
  const pos = temGps ? { lat: v.lat!, lng: v.lng! } : doCarro && typeof doCarro === 'object' ? doCarro : null
  // a cidade em cima do ponto (José, 12/11: "mostrar a cidade ali em cima do ponto para facilitar")
  const [cidade, setCidade] = useState<string | null>(null)
  useEffect(() => { let vivo = true; if (pos) void cidadeDe(pos.lat, pos.lng).then((c) => { if (vivo) setCidade(c) }); return () => { vivo = false } }, [pos?.lat, pos?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  const d = 0.008 // ~800 m em volta do ponto
  const mapa = pos ? `https://www.openstreetmap.org/export/embed.html?bbox=${pos.lng - d}%2C${pos.lat - d}%2C${pos.lng + d}%2C${pos.lat + d}&layer=mapnik&marker=${pos.lat}%2C${pos.lng}` : null
  const quando = new Date(v.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const tipo = ({ presencial: 'Visita presencial', mensagem: 'Mensagem', telefonema: 'Telefonema', email: 'E-mail' } as Record<string, string>)[v.tipo] || cap(v.tipo || 'Visita')
  return (
    <div className="cmw-fundo cmpdf-fundo" onClick={onFechar}>
      <div className="cmvis" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{v.cliente || v.propriedade || 'Visita'}</h3><span>{tipo} · {quando}{cidade ? ` · ${cidade}` : ''} · {vendedor}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cmvis-corpo">
          <div className="cmvis-mapa">
            {mapa && cidade && <div className="cmvis-cidade"><i className="fas fa-location-dot" /> {cidade}</div>}
            {mapa ? <iframe src={mapa} title="Local da visita" loading="lazy" /> : <div className="cmnf-msg">{doCarro === 'buscando' ? 'A visita veio sem GPS — buscando onde o carro estava nessa hora…' : `Essa visita foi registrada sem GPS${placa ? ' e o rastreador do carro não tem ponto perto desse horário' : ''}.`}</div>}
            {pos && <div className="cmvis-mapa-rodape"><span>{temGps ? (v.precisao != null ? `GPS do celular, precisão de ~${v.precisao} m` : 'GPS do celular') : `Visita sem GPS: posição do carro às ${horaBR((doCarro as { hora: string }).hora)}`}</span><a className="cmnf-bt" href={`https://maps.google.com/?q=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer"><i className="fas fa-location-arrow" /> Google Maps</a></div>}
          </div>
          <div className="cmvis-rel">
            <div className="cmvis-tags">
              {v.primeira && <span className="t-azul">Primeira visita</span>}
              {v.posVendas && <span className="t-laranja">Acionou o Pós-Vendas</span>}
              {v.retroativa && <span className="t-ambar">Lançada depois (retroativa)</span>}
            </div>
            {v.propriedade && <div className="cmvis-l"><small>Propriedade</small><b>{v.propriedade}</b></div>}
            <div className="cmvis-l"><small>O que aconteceu</small><p>{v.resumo || 'Sem relatório escrito.'}</p></div>
            {v.proximos && <div className="cmvis-l"><small>Próximos passos</small><p>{v.proximos}</p></div>}
            {v.proximoContato && <div className="cmvis-l"><small>Próximo contato</small><b>{dataBR(v.proximoContato)}</b></div>}
            {v.foto && <div className="cmvis-l"><small>Foto</small><a href={v.foto} target="_blank" rel="noreferrer"><img src={v.foto} alt="Foto da visita" className="cmvis-foto" /></a></div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** vendedores lado a lado, o melhor de cada linha em verde (José, 12/11: "comparar os vendedores") */
function CompararVendedores({ linhas, d }: { linhas: LinhaVend[]; d: DadosComercial }) {
  // José, 12/11: "melhora a visualização" — barras por vendedor, o melhor de cada linha com estrela
  const meses = d.meses
  const [mes, setMes] = useState(meses[meses.length - 1])
  const CORES = ['#2563eb', '#7c3aed', '#0891b2', '#ea580c', '#db2777']
  type Ind = { nome: string; v: (x: LinhaVend) => number; fmt: (n: number) => string; menor?: boolean }
  const grupos: Array<{ titulo: string; itens: Ind[] }> = [
    { titulo: 'Vendas', itens: [
      { nome: `Vendeu em ${nomeMes(mes)}`, v: (x) => somar(x.v12.filter((y) => y.mes === mes)), fmt: compacto },
      { nome: `Máquinas em ${nomeMes(mes)}`, v: (x) => x.v12.filter((y) => y.mes === mes).reduce((a2, y) => a2 + y.qtd, 0), fmt: (n) => String(n) },
      { nome: 'Vendeu em 12 meses', v: (x) => somar(x.v12), fmt: compacto },
      { nome: 'Ticket médio (12 meses)', v: (x) => { const q = x.v12.reduce((a2, y) => a2 + y.qtd, 0); return q ? somar(x.v12) / q : 0 }, fmt: compacto },
    ] },
    { titulo: 'Propostas', itens: [
      { nome: 'Propostas abertas', v: (x) => x.props.filter((pp) => pp.aberta).length, fmt: (n) => String(n) },
      { nome: 'Viraram venda', v: (x) => x.props.filter((pp) => pp.vendida).length, fmt: (n) => String(n) },
    ] },
    { titulo: 'Na rua', itens: [
      { nome: 'Visitas em 30 dias', v: (x) => x.a?.visitas || 0, fmt: (n) => String(n) },
      { nome: 'Km rodados em 30 dias', v: (x) => x.a?.km || 0, fmt: (n) => `${n.toLocaleString('pt-BR')} km` },
      { nome: 'Km por visita', v: (x) => (x.a?.visitas ? Math.round((x.a.km || 0) / x.a.visitas) : 0), fmt: (n) => (n ? `${n} km` : '—'), menor: true },
    ] },
    { titulo: 'Custos', itens: [
      { nome: 'Despesas em 90 dias', v: (x) => x.a?.despesas.total || 0, fmt: compacto, menor: true },
    ] },
  ]
  return (
    <Secao titulo="Comparar vendedores" sub={<span className="cmvm-ctrl">vendas do mês de <select value={mes} onChange={(e) => setMes(e.target.value)}>{[...meses].reverse().map((k) => <option key={k} value={k}>{cap(nomeMes(k, true))}</option>)}</select></span>}>
      <div className="cmcv" style={{ ['--n' as string]: linhas.length }}>
        <div className="cmcv-l cmcv-cab"><span />{linhas.map((x, k) => <b key={x.nome}><i style={{ background: CORES[k % CORES.length] }} />{x.nome}</b>)}</div>
        {grupos.map((g) => (
          <div key={g.titulo} className="cmcv-grupo">
            <div className="cmcv-gtit">{g.titulo}</div>
            {g.itens.map((it) => {
              const vals = linhas.map((x) => it.v(x))
              const max = Math.max(1, ...vals)
              const positivos = vals.filter((n) => n > 0)
              const melhor = positivos.length && new Set(vals).size > 1 ? (it.menor ? Math.min(...positivos) : Math.max(...vals)) : null
              return (
                <div key={it.nome} className="cmcv-l">
                  <span className="cmcv-nome">{it.nome}</span>
                  {vals.map((n, k) => {
                    const top = melhor != null && n === melhor && n > 0
                    return (
                      <span key={k} className={`cmcv-cel${top ? ' top' : ''}`}>
                        <span className="cmcv-bar"><span style={{ width: `${(n / max) * 100}%`, background: CORES[k % CORES.length] }} /></span>
                        <b>{top && <i className="fas fa-star" />}{it.fmt(n)}</b>
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="cma-nota">A estrela marca o melhor de cada linha. Em km por visita e despesas, o melhor é o menor.</p>
    </Secao>
  )
}

type LinhaVend = { nome: string; a: VendedorApp | null; v12: DadosComercial['vendas']; doMes: DadosComercial['vendas']; meta?: { meta: number; vendeu: number }; props: DadosComercial['propostas'] }
function DetalheVendedor({ l, dadosCom, onVoltar, onFechar }: { l: LinhaVend; dadosCom: DadosComercial | null; onVoltar: () => void; onFechar: () => void }) {
  const a = l.a
  const [aba, setAba] = useState<'resumo' | 'carro' | 'despesas' | 'visitas' | 'propostas'>('resumo')
  const [visita, setVisita] = useState<VisitaVend | null>(null) // visita aberta (mapa + relatório)
  const [frame, setFrame] = useState<{ titulo: string; sub?: string; src?: string | null; fotos?: string[] } | null>(null) // documento / requisição / checklist
  const [diaVis, setDiaVis] = useState(hojeSP()) // aba Visitas: um dia por vez, começando em hoje (José, 12/11)
  const mesesV = useMemo(() => { const h = new Date(`${hojeSP()}T12:00:00`); return Array.from({ length: 12 }, (_, k) => { const d = new Date(h.getFullYear(), h.getMonth() - 11 + k, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }) }, [])
  const [mesV, setMesV] = useState(() => mesesV[mesesV.length - 1]) // "O que vendeu": mês mostrado
  const [compMes, setCompMes] = useState<string | null>(null) // mês para comparar ao lado
  const [propLista, setPropLista] = useState<{ titulo: string; l: DadosComercial['propostas'] } | null>(null) // aba Propostas: qual lista
  const [pdfProp, setPdfProp] = useState<number | null>(null) // PDF da proposta aberto
  const [diaMapa, setDiaMapa] = useState(hojeSP()) // dia do mapa (a tabela de rotas também escolhe)
  const [tipoDesp, setTipoDesp] = useState<string | null>(null) // despesas: filtro por tipo
  if (!a) return <TelaCheia titulo={l.nome} onFechar={onFechar}><div className="ce-mudo">Sem dados.</div></TelaCheia>
  const abertas = l.props.filter((p) => p.aberta), vendidas = l.props.filter((p) => p.vendida), perdidas = l.props.filter((p) => p.perdida)
  const car = a.carro
  const ABAS: Array<[typeof aba, string]> = [['resumo', 'Resumo'], ['carro', 'Carro e rotas'], ['despesas', 'Despesas'], ['visitas', 'Visitas'], ['propostas', 'Propostas']]
  return (
    <TelaCheia titulo={l.nome} sub={<button className="cmv-voltar" onClick={onVoltar}><i className="fas fa-arrow-left" /> todos os vendedores</button>} onFechar={onFechar}>
      <div className="cmv-abas">{ABAS.map(([k, n]) => <button key={k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{n}</button>)}</div>

      {aba === 'resumo' && <>
        <div className="cmt-kpis">
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => { setMesV(mesesV[mesesV.length - 1]); setCompMes(null); document.getElementById('cmv-vendeu')?.scrollIntoView({ behavior: 'smooth' }) }}><small>Vendeu no mês</small><b style={{ color: '#0369a1' }}>{compacto(somar(l.doMes))}</b><em>{l.meta?.meta ? `${Math.round((l.meta.vendeu / l.meta.meta) * 100)}% da meta de ${compacto(l.meta.meta)}` : 'sem meta no mês'}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => { setCompMes(mesesV[mesesV.length - 2]); document.getElementById('cmv-vendeu')?.scrollIntoView({ behavior: 'smooth' }) }}><small>Vendeu em 12 meses</small><b>{compacto(somar(l.v12))}</b><em>{frasePecas(contar(l.v12, 'trator'), contar(l.v12, 'implemento'))}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('propostas')}><small>Propostas abertas</small><b>{abertas.length}</b><em>{compacto(somar(abertas))}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('despesas')}><small>Despesas (90 dias)</small><b style={{ color: '#be123c' }}>{compacto(a.despesas.total)}</b><em>requisições no nome dele</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('visitas')}><small>Visitas em 30 dias</small><b>{a.visitas}</b><em>{a.visitasSemana} nesta semana · {a.clientes} clientes</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('carro')}><small>Rodou em 30 dias</small><b>{a.km.toLocaleString('pt-BR')} km</b><em>{a.diasRodou} dias na estrada{a.visitas ? ` · ${Math.round(a.km / a.visitas)} km por visita` : ''}</em></button>
        </div>
        <Secao titulo="RH">
          {a.rh ? (
            <div className="cmv-rh">
              <div><small>Nome no RH</small><b>{a.rh.nome}</b></div>
              <div><small>Cargo</small><b>{a.rh.cargo || '—'}</b></div>
              <div><small>Setor</small><b>{a.rh.departamento || '—'}</b></div>
              <div><small>Admissão</small><b>{a.rh.admissao ? `${a.rh.admissao.split('-').reverse().join('/')} · ${tempoCasa(a.rh.admissao)}` : '—'}</b></div>
              <div><small>Situação</small><b style={{ color: a.rh.status === 'ativo' ? COR_FICOU : COR_SAIU }}>{cap(a.rh.status)}</b></div>
            </div>
          ) : <div className="ce-mudo">Não achei esse vendedor no RH (está só no portal).</div>}
        </Secao>
        <div id="cmv-vendeu" />
        {(() => {
          // José, 12/11: "só mostra o mês atual, mas deixa ir para os outros meses ou comparar"
          const blocoMes = (mesK: string, outro?: number) => {
            const doM = l.v12.filter((v) => v.mes === mesK).sort((x, y) => y.valor - x.valor)
            const tot = somar(doM), dif = outro != null ? tot - outro : null
            return (
              <section className="kd-dia cmvm-bloco">
                <div className="kd-cab cmv-mes-cab">
                  <span className="kd-data"><b>{cap(nomeMes(mesK, true))}</b><small>{doM.length ? frasePecas(contar(doM, 'trator'), contar(doM, 'implemento')) : 'nenhuma máquina'}</small></span>
                  <span />
                  <span className="kd-total" style={{ color: '#0369a1' }}>{brl(tot)}{dif != null && dif !== 0 ? <small className={dif > 0 ? 'cmvm-mais' : 'cmvm-menos'}>{dif > 0 ? '+' : '−'}{compacto(Math.abs(dif))}</small> : null}</span>
                </div>
                {doM.map((v, k) => (
                  <div key={k} className="kd-item"><span className="kd-tit">{v.modelo}{v.qtd > 1 ? ` · ${v.qtd} unidades` : ''}</span><span className="kd-val">{brl(v.valor)}</span><span className="kd-sub">{[v.cliente, v.pedido ? `pedido ${v.pedido}` : ''].filter(Boolean).join(' · ')}</span></div>
                ))}
                {!doM.length && <div className="kd-item"><span className="kd-sub">Nenhuma máquina vendida nesse mês.</span></div>}
              </section>
            )
          }
          const idx = mesesV.indexOf(mesV)
          return (
            <Secao titulo="O que vendeu" sub={<span className="cmvm-ctrl">
              <button className="cma-x" disabled={idx <= 0} onClick={() => setMesV(mesesV[idx - 1])} title="Mês anterior"><i className="fas fa-chevron-left" /></button>
              <select value={mesV} onChange={(e) => setMesV(e.target.value)}>{[...mesesV].reverse().map((k) => <option key={k} value={k}>{cap(nomeMes(k, true))}</option>)}</select>
              <button className="cma-x" disabled={idx >= mesesV.length - 1} onClick={() => setMesV(mesesV[idx + 1])} title="Próximo mês"><i className="fas fa-chevron-right" /></button>
              <select value={compMes || ''} onChange={(e) => setCompMes(e.target.value || null)}><option value="">Comparar com…</option>{[...mesesV].reverse().filter((k) => k !== mesV).map((k) => <option key={k} value={k}>{cap(nomeMes(k, true))}</option>)}</select>
            </span>}>
              {compMes ? (
                <div className="cmvm-dois">{blocoMes(mesV, somar(l.v12.filter((v) => v.mes === compMes)))}{blocoMes(compMes)}</div>
              ) : blocoMes(mesV)}
            </Secao>
          )
        })()}
      </>}

      {aba === 'carro' && <>
        {car ? (
          <div className="cmh-carro">
            <div className="cmh-foto">{car.foto ? <img src={car.foto} alt="" /> : <i className="fas fa-car-side" />}</div>
            <div className="cmh-id">
              <b>{car.modelo || 'Carro'}</b>
              <em className="cmv-placa">{car.placa}</em>
              <small>{car.origem}{car.desde ? ` · desde ${dataBR(car.desde)}` : ''}</small>
            </div>
            <div className="cmh-nums">
              <div><small>Km do carro</small><strong>{car.km ? `${Math.round(car.km).toLocaleString('pt-BR')}` : '—'}</strong><em>km no hodômetro</em></div>
              <div><small>Rodou em 30 dias</small><strong>{a.km.toLocaleString('pt-BR')}</strong><em>km · {a.diasRodou} dias na estrada</em></div>
              {a.gastoCombustivel > 0 && <div><small>Combustível (30 dias)</small><strong>{compacto(a.gastoCombustivel)}</strong><em>{a.litros} litros</em></div>}
              <button className={car.pendencias.length ? 'ruim' : 'bom'} onClick={() => document.getElementById('cmh-pend')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <small>Pendências no Frota</small><strong>{car.pendencias.length}</strong><em>{car.pendencias.length ? 'ver abaixo' : 'nenhuma aberta'}</em>
              </button>
              <div><small>Último checklist</small><strong className={car.checklist?.nota != null ? (car.checklist.nota >= 80 ? 'bom' : car.checklist.nota >= 60 ? 'medio' : 'ruim') : ''}>{car.checklist?.nota != null ? `${car.checklist.nota}%` : '—'}</strong><em>{car.checklist ? `confiança · ${dataBR(car.checklist.data)}` : 'nenhum feito'}</em></div>
            </div>
          </div>
        ) : <div className="ce-mudo">Sem carro vinculado a esse vendedor.</div>}
        {car && <div className="cmt-dois">
          <Secao titulo="Último checklist">
            {car.checklist ? (
              <div className="cmv-chk">
                <div><small>Feito em</small><b>{dataBR(car.checklist.data)} por {car.checklist.quem || '—'}</b></div>
                <div><small>Situação</small><b>{cap(car.checklist.status)}{car.checklist.km ? ` · ${car.checklist.km.toLocaleString('pt-BR')} km` : ''}</b></div>
                {car.checklist.nota != null && <div><small>Confiança</small><b style={{ color: car.checklist.nota >= 80 ? COR_FICOU : car.checklist.nota >= 60 ? '#b45309' : COR_SAIU }}>{car.checklist.nota}%</b></div>}
                {car.checklist.alertas.length ? (
                  <div className="cmv-porque">
                    <b>Por que {car.checklist.nota != null ? `${car.checklist.nota}%` : 'essa nota'}?</b>
                    <small>O checklist começa com 100% e perde pontos a cada sinal de que pode ter sido feito sem conferir de verdade:</small>
                    {car.checklist.alertas.map((x, i) => { const e = explicarAlerta(x); return <div key={i} className="cmv-porque-l"><span>{x}{e.porque ? <small>{e.porque}</small> : null}</span>{e.pontos ? <em>−{e.pontos}</em> : null}</div> })}
                  </div>
                ) : null}
                {car.checklist.token && <button className="cmnf-bt" onClick={() => setFrame({ titulo: 'Checklist completo', sub: `${car.placa} · ${dataBR(car.checklist!.data)}`, src: `/frota/checklist/ver?token=${encodeURIComponent(car.checklist!.token!)}` })}><i className="fas fa-clipboard-check" /> Ver o checklist com as fotos</button>}
              </div>
            ) : <div className="ce-mudo">Nenhum checklist desse carro.</div>}
          </Secao>
          <section id="cmh-pend" className="cmt-sec"><div className="cmt-sec-cab"><h3>Pendências e documentos</h3></div>
            {car.pendencias.map((p, i) => <div key={i} className="cmj-it"><span>{p.titulo}<small>aberta em {p.data ? p.data.split('-').reverse().join('/') : '—'}{p.gravidade ? ` · ${p.gravidade}` : ''}</small></span><b style={{ color: COR_SAIU }}>aberta</b></div>)}
            {car.documentos.map((dc, i) => <div key={`d${i}`} className="cmj-it"><span>{dc.tipo}<small>{dc.vence ? `vence ${dc.vence.split('-').reverse().join('/')}` : 'sem vencimento cadastrado'}</small></span>{dc.arquivo ? <button className="cmnf-bt" onClick={() => setFrame({ titulo: dc.tipo, sub: car.placa, src: dc.arquivo })}>ver</button> : null}<b style={{ color: dc.vencido ? COR_SAIU : COR_FICOU }}>{dc.vencido ? 'vencido' : 'em dia'}</b></div>)}
            {!car.pendencias.length && !car.documentos.length && <div className="ce-mudo">Nada pendente.</div>}
          </section>
        </div>}
        <div id="cmv-mapa" />
        {car && <Secao titulo="Mapa do dia" sub="rota do rastreador · escolha o dia e o horário · clique numa visita para abrir"><MapaDia placa={car.placa} dia={diaMapa} setDia={setDiaMapa} onVisita={(m) => {
          // acha a visita (com o relatório) pela hora; se não estiver na lista, abre só com o que o mapa sabe
          const alvo = new Date(m.data).getTime()
          const achada = a.ultimas.filter((u) => Math.abs(new Date(u.data).getTime() - alvo) < 60_000 || (u.cliente === m.cliente && u.data.slice(0, 10) === m.data.slice(0, 10)))[0]
          setVisita(achada || { data: m.data, cliente: m.cliente, propriedade: '', tipo: 'presencial', resumo: '', primeira: false, lat: m.lat, lng: m.lng, precisao: null, proximos: '', proximoContato: null, foto: null, posVendas: false, retroativa: false })
        }} /></Secao>}
        <Secao titulo="Rotas por dia" sub="rastreador do carro, últimos 30 dias · clique num dia para ver no mapa">
          {a.dias.length ? <>
            <div className="cmt-tab-wrap"><table className="cmt-tab cmfat-tab">
              <thead><tr><th>Dia</th><th>Saiu</th><th>Voltou</th><th>Km</th><th>Paradas em cliente</th><th>Combustível</th></tr></thead>
              <tbody>{[...a.dias].reverse().filter((x) => x.km > 0).map((x) => (
                <tr key={x.data} className={`cmm-l${x.data === diaMapa ? ' cmrot-on' : ''}`} onClick={() => { setDiaMapa(x.data); document.getElementById('cmv-mapa')?.scrollIntoView({ behavior: 'smooth' }) }}><td>{dataBR(x.data)}</td><td>{horaBR(x.inicio)}</td><td>{horaBR(x.fim)}</td><td>{x.km.toLocaleString('pt-BR')} km</td><td>{x.paradasCliente || '—'}</td><td className="val">{x.gasto ? brl(x.gasto) : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          </> : <div className="ce-mudo">Sem registro do rastreador para esse carro no período.</div>}
        </Secao>
      </>}

      {aba === 'despesas' && (() => {
        const CORES = ['#2563eb', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#ca8a04', '#64748b']
        const cor = (t: string) => CORES[Math.max(0, a.despesas.porTipo.findIndex((x) => x.tipo === t)) % CORES.length]
        const itens = a.despesas.itens.filter((x) => !tipoDesp || x.tipo === tipoDesp)
        const total = a.despesas.total || 1
        const sit = (st: string) => /financ|pago|conclu/i.test(st) ? 'ok' : /aguard/i.test(st) ? 'esp' : 'ped'
        return (
          <Secao titulo="Despesas" sub="requisições no nome dele, últimos 90 dias">
            {a.despesas.itens.length ? <>
              <div className="cmdp-topo">
                <div><small>Gastou em 90 dias</small><strong>{brl(a.despesas.total)}</strong><em>{plural(a.despesas.itens.length, 'requisição', 'requisições')}</em></div>
                <div className="cmdp-barra">{a.despesas.porTipo.map((t) => <span key={t.tipo} title={`${t.tipo}: ${brl(t.valor)}`} style={{ width: `${(t.valor / total) * 100}%`, background: cor(t.tipo), opacity: !tipoDesp || tipoDesp === t.tipo ? 1 : 0.25 }} />)}</div>
              </div>
              <div className="cmdp-chips">
                <button className={!tipoDesp ? 'on' : ''} onClick={() => setTipoDesp(null)}>Todas</button>
                {a.despesas.porTipo.map((t) => <button key={t.tipo} className={tipoDesp === t.tipo ? 'on' : ''} onClick={() => setTipoDesp(tipoDesp === t.tipo ? null : t.tipo)}><i style={{ background: cor(t.tipo) }} />{t.tipo}<b>{compacto(t.valor)}</b><small>{t.qtd}</small></button>)}
              </div>
              <div className="cmdp-lista">
                {itens.map((x) => (
                  <button key={x.id} className="cmdp-l" onClick={() => setFrame({ titulo: `Requisição ${x.id}`, sub: x.titulo, src: `/requisicoes/imprimir/${x.id}`, fotos: x.fotos })}>
                    <i className="cmdp-cor" style={{ background: cor(x.tipo) }} />
                    <span className="cmdp-o">{x.titulo || 'Requisição'}<small>{x.data ? x.data.split('-').reverse().join('/') : '—'} · {x.tipo}{x.fotos.length ? ` · ${plural(x.fotos.length, 'anexo', 'anexos')}` : ''}</small></span>
                    <span className={`cmdp-sit ${sit(x.status)}`}>{cap(x.status || '—')}</span>
                    <b>{x.valor ? brl(x.valor) : '—'}</b>
                    <span className="cmdp-pdf"><i className="fas fa-file-pdf" /> PDF</span>
                  </button>
                ))}
              </div>
            </> : <div className="ce-mudo">Nenhuma requisição no nome dele em 90 dias.</div>}
          </Secao>
        )
      })()}

      {aba === 'visitas' && (() => {
          const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
          const doDia = a.ultimas.filter((v) => diaSP(v.data) === diaVis).sort((x, y) => x.data.localeCompare(y.data))
          const dias = [...new Set(a.ultimas.map((v) => diaSP(v.data)))].sort()
          const ultimoComVisita = [...dias].reverse().find((d) => d < diaVis)
          const lim = new Date(`${hojeSP()}T12:00:00`); lim.setDate(lim.getDate() - 30)
          const minimo = lim.toISOString().slice(0, 10)
          const mudar = (n: number) => { const d = new Date(`${diaVis}T12:00:00`); d.setDate(d.getDate() + n); const k = d.toISOString().slice(0, 10); if (k <= hojeSP() && k >= minimo) setDiaVis(k) }
          const rot = new Date(`${diaVis}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
          return (
            <Secao titulo="Visitas no app de vendas" sub={`${a.visitas} em 30 dias${a.ultimaVisita ? ` · a última foi ${diasAtras(a.ultimaVisita)}` : ''}`}>
              <div className="cmmapa-filtros">
                <button className="cma-x" onClick={() => mudar(-1)} disabled={diaVis <= minimo} title="Dia anterior"><i className="fas fa-chevron-left" /></button>
                <input type="date" value={diaVis} min={minimo} max={hojeSP()} onChange={(e) => e.target.value && setDiaVis(e.target.value)} />
                <button className="cma-x" onClick={() => mudar(1)} disabled={diaVis === hojeSP()} title="Próximo dia"><i className="fas fa-chevron-right" /></button>
                {diaVis !== hojeSP() && <button className="cm-bt" onClick={() => setDiaVis(hojeSP())}>Hoje</button>}
                <span className="cmmapa-res">{cap(rot)} · {plural(doDia.length, 'visita', 'visitas')}</span>
              </div>
              {doDia.length ? doDia.map((v, k) => (
                <button key={k} className="cmvis-l2" onClick={() => setVisita(v)}><b>{v.cliente || v.propriedade || 'Cliente'}</b><span className={v.primeira ? 't-azul' : 't-cinza'}>{v.primeira ? 'Primeira visita' : 'Retorno'}</span>{v.posVendas && <span className="t-laranja">Pós-Vendas</span>}<small>{horaBR(v.data)}</small><i className="fas fa-chevron-right" /></button>
              )) : (
                <div className="ce-mudo cmvis-vazio">Nenhuma visita registrada nesse dia.{ultimoComVisita && <button className="cmnf-bt" onClick={() => setDiaVis(ultimoComVisita)}>ir para {dataBR(ultimoComVisita)}, o último dia com visita</button>}</div>
              )}
            </Secao>
          )
        })()}

      {aba === 'propostas' && (() => {
        const grupos: Record<string, { titulo: string; l: DadosComercial['propostas'] }> = { abertas: { titulo: 'Propostas abertas', l: abertas }, vendidas: { titulo: 'Viraram venda', l: vendidas }, perdidas: { titulo: 'Não vendemos', l: perdidas } }
        const g = propLista || grupos.abertas
        return <>
          <div className="cmpv-l">
            {dadosCom && <PizzaPropostas d={dadosCom} lista={l.props} abrir={(titulo, lst) => setPropLista({ titulo, l: lst })} />}
            <div className="cmt-kpis cmpz-cards">
              <button className={`cmt-kpi cmt-kpi-bt${g.titulo === 'Propostas abertas' ? ' on' : ''}`} onClick={() => setPropLista(grupos.abertas)}><small>Abertas</small><b>{abertas.length}</b><em>{compacto(somar(abertas))}</em></button>
              <button className={`cmt-kpi cmt-kpi-bt${g.titulo === 'Viraram venda' ? ' on' : ''}`} onClick={() => setPropLista(grupos.vendidas)}><small>Viraram venda</small><b style={{ color: COR_FICOU }}>{vendidas.length}</b><em>{compacto(somar(vendidas))}</em></button>
              <button className={`cmt-kpi cmt-kpi-bt${g.titulo === 'Não vendemos' ? ' on' : ''}`} onClick={() => setPropLista(grupos.perdidas)}><small>Não vendemos</small><b style={{ color: COR_SAIU }}>{perdidas.length}</b><em>{perdidas.length ? 'com o motivo' : 'nenhuma'}</em></button>
            </div>
          </div>
          <Secao titulo={g.titulo} sub={`${plural(g.l.length, 'proposta', 'propostas')} · ${compacto(somar(g.l))} · clique para abrir o PDF`}>
            {g.l.length ? <div className="cmdp-lista">{[...g.l].sort((x, y) => y.valor - x.valor).map((pp) => (
              <button key={pp.id} className="cmdp-l cmpp-l" onClick={() => setPdfProp(pp.id)}>
                <i className="cmdp-cor" style={{ background: pp.vendida ? '#16a34a' : pp.perdida ? '#dc2626' : /banco/i.test(pp.fase) ? '#7c3aed' : '#2563eb' }} />
                <span className="cmdp-o">{pp.cliente}<small>{[pp.equipamento, pp.cidade].filter(Boolean).join(' · ')}</small></span>
                <span className="cmpp-tags">
                  <span className={`cmdp-sit ${pp.vendida ? 'ok' : pp.perdida ? 'perd' : 'ped'}`}>{pp.aberta ? cap(pp.fase.toLowerCase().replace('aguardando resposta ', 'esperando o ')) : pp.vendida ? 'Vendida' : 'Não vendida'}</span>
                  {pp.aberta && <span className={`cmdp-sit ${pp.diasNaFase > 30 ? 'esp' : 'neutro'}`}>há {pp.diasNaFase} dias</span>}
                  {pp.perdida && pp.motivoPerda && <span className="cmdp-sit neutro">{pp.motivoPerda}</span>}
                </span>
                <b>{compacto(pp.valor)}</b>
                <span className="cmdp-pdf"><i className="fas fa-file-pdf" /> PDF</span>
              </button>
            ))}</div> : <div className="ce-mudo">Nenhuma proposta aqui.</div>}
          </Secao>
          {pdfProp != null && <PdfProposta id={pdfProp} onFechar={() => setPdfProp(null)} />}
        </>
      })()}
      {visita && <JanelaVisita v={visita} vendedor={l.nome} placa={car?.placa} onFechar={() => setVisita(null)} />}
      {frame && <JanelaFrame {...frame} onFechar={() => setFrame(null)} />}
    </TelaCheia>
  )
}

// ── ESTOQUE (mapa da loja) ───────────────────────────────────────────────────
export type MaqVE = { codigo_produto: number; descricao: string; familia_nome: string; marca: string; modelo?: string | null; imagem_url: string; pos_x: number; pos_y: number; img_tamanho: number
  cmc: number; estoque: number; valor_unitario: number; valor_estoque: number; custo_capital: number; custo_capital_mes: number; custo_dia: number; selic_acumulada: number; data_inclusao?: string; dias_em_estoque: number; ambiente: string; conta_omie: string; destinatario?: string }
export type Patio = { ambientes: Record<string, MaqVE[]>; total: number }
/** a conta do estoque, igual no cartão e na tela (José, 12/11: o cartão dizia 37 e a tela 42):
 *  "na loja" = tudo menos o que está em demonstração com cliente; unidades pela quantidade em estoque */
export function resumoLoja(p: Patio) {
  const loja = Object.entries(p.ambientes).filter(([k]) => k !== 'demonstracao').flatMap(([, l]) => l).filter((m) => !/requisi|####/i.test(m.familia_nome || ''))
  const demo = (p.ambientes.demonstracao || [])
  const un = (l: MaqVE[]) => l.reduce((a, m) => a + Math.max(1, Math.round(m.estoque || 1)), 0)
  return { loja, demo, qtdLoja: un(loja), qtdDemo: un(demo), valorLoja: loja.reduce((a, m) => a + m.valor_estoque, 0), velhas: un(loja.filter((m) => m.dias_em_estoque > 365)) }
}
const AMB: Record<string, { nome: string; cor: string; zona?: { x: number; y: number; w: number; h: number } }> = {
  patio: { nome: 'Pátio', cor: '#2563eb', zona: { x: 0.3, y: 0.6, w: 44.7, h: 98.8 } },
  oficina: { nome: 'Oficina', cor: '#6b7280', zona: { x: 45, y: 0.6, w: 54.7, h: 30 } },
  showroom: { nome: 'Showroom', cor: '#7c3aed', zona: { x: 45, y: 30.6, w: 43, h: 68.8 } },
  oficina2: { nome: 'Oficina 2', cor: '#6b7280', zona: { x: 88, y: 30.6, w: 11.7, h: 68.8 } },
  barracao: { nome: 'Barracão', cor: '#059669' }, demonstracao: { nome: 'Em demonstração', cor: '#dc2626' },
}
const ehMaquina = (m: { familia_nome: string }) => !/requisi|####/i.test(m.familia_nome || '')
export const soMaquinas = (p: Patio): Patio => ({ ...p, ambientes: Object.fromEntries(Object.entries(p.ambientes).map(([k, l]) => [k, l.filter(ehMaquina)])) })
// "VEICULO NOVO MAHINDRA 6075E-BR-CAB PH2 V 2025 MOTOR: …" → "MAHINDRA 6075E-BR-CAB PH2 V 2025" (sem série, chassi, motor)
const nomeCurto = (d: string) => {
  const t = String(d || '').replace(/^\(\d+\/\d+\)\s*/, '').replace(/^VEICULO NOVO\s+/i, '').replace(/\s*(\||,|\bCOM:|\bMARCA:|\bANO[: ]|\bMOTOR:|\bCHAS|\bS[EÉ]RIE|\bnro\b|\bNUMERO DE|\bCERT\.).*$/i, '').trim()
  return t.length > 46 ? t.slice(0, 44).trim() + '…' : t || d
}
const tempoParada = (d: number) => (d > 365 ? `${(d / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` : d > 60 ? `${Math.round(d / 30)} meses` : `${d} dias`)
const corIdade = (d: number) => (d > 365 ? '#dc2626' : d > 180 ? '#f59e0b' : '#22c55e')

const LOCAIS_MUDA = ['showroom', 'patio', 'oficina', 'oficina2', 'barracao']

/** escolher outra foto da internet para a máquina (José, 12/11: "foto ruim", "tentar remover o fundo") */
function TrocarFoto({ m, onTrocou }: { m: MaqVE; onTrocou: (url: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState(() => nomeCurto(m.descricao) + (m.marca && !m.descricao.toUpperCase().includes(String(m.marca).toUpperCase()) ? ` ${m.marca}` : ''))
  const [opcoes, setOpcoes] = useState<Array<{ miniatura: string; original: string }> | null>(null)
  const [estado, setEstado] = useState<string | null>(null)
  const buscar = async (t = termo) => {
    setOpcoes(null); setEstado('Procurando fotos…')
    try {
      const r = await fetch(`/api/empresa/fotos?q=${encodeURIComponent(t)}`, { headers: await authHeaders() })
      const j = await r.json()
      setOpcoes(j.opcoes || []); setEstado(j.opcoes?.length ? null : 'Nenhuma foto achada. Mude o texto da busca.')
    } catch { setEstado('Não deu para buscar agora.') }
  }
  const escolher = async (o: { miniatura: string; original: string }) => {
    setEstado('Guardando a foto…')
    try {
      const r = await fetch('/api/empresa/fotos', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_produto: m.codigo_produto, conta: m.conta_omie, url: o.original, miniatura: o.miniatura }) })
      const j = await r.json()
      if (!r.ok) { setEstado(j.erro || 'Não deu para guardar essa.'); return }
      onTrocou(j.imagem_url); setAberto(false); setEstado(null)
    } catch { setEstado('Não deu para guardar agora.') }
  }
  if (!aberto) return <button className="cm-bt cmf-bt" onClick={() => { setAberto(true); void buscar() }}><i className="fas fa-image" /> Trocar foto</button>
  return (
    <div className="cmf">
      <div className="cmf-busca">
        <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }} />
        <button className="cm-bt" onClick={() => void buscar()}>Buscar</button>
      </div>
      {estado && <small className="cmf-estado">{estado}</small>}
      {opcoes && opcoes.length > 0 && (
        <div className="cmf-grade">{opcoes.map((o, i) => <button key={i} className="cmf-op" onClick={() => void escolher(o)} title="Usar esta foto"><img src={o.miniatura} alt="" /></button>)}</div>
      )}
      <button className="cm-bt" onClick={() => setAberto(false)}>Cancelar</button>
    </div>
  )
}

/** mini mapa da Nova Tratores com as máquinas de cada lugar (as mesmas áreas do Visual Estoque → Pátio). Usado nas
 *  Máquinas do Comercial e no Pátio do /empresa. */
export function MapaEstoque({ d, onLocal }: { d: Patio; onLocal: (k: string) => void }) {
  const setLocal = onLocal
  return (
    <div className="cmz">
      {/* mini mapa da Nova Tratores: as mesmas áreas do Visual Estoque → Pátio */}
      <div className="cmz-mapa">
        <div className="cmz-rua cmz-rua-t">R. Hermes Corrêa de Carvalho</div>
        <div className="cmz-rua cmz-rua-e">Av. São Sebastião</div>
        <div className="cmz-rua cmz-rua-d">R. Edgar Martinelli</div>
        <div className="cmz-loja">
          {(['patio', 'oficina', 'showroom', 'oficina2'] as const).map((k) => {
            const z = AMB[k].zona!, ms = d.ambientes[k] || []
            const velhas = ms.filter((m) => m.dias_em_estoque > 365).length
            return (
              <button key={k} className={`cmz-zona${ms.length ? '' : ' vazia'}`} disabled={!ms.length} style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }} onClick={() => setLocal(k)}>
                <span className="cmz-nome">{AMB[k].nome}</span>
                <b>{ms.length}</b>
                {ms.length ? <span className="cmz-val">{compacto(ms.reduce((a, m) => a + m.valor_estoque, 0))}</span> : null}
                {velhas ? <small>{velhas} há +1 ano</small> : null}
              </button>
            )
          })}
        </div>
      </div>
      {/* fora da loja */}
      <div className="cmz-fora">
        {(['barracao', 'demonstracao'] as const).map((k) => {
          const ms = d.ambientes[k] || []
          const velhas = ms.filter((m) => m.dias_em_estoque > 365).length
          return (
            <button key={k} className={`cmz-zona cmz-solta${ms.length ? '' : ' vazia'}`} disabled={!ms.length} onClick={() => setLocal(k)}>
              <span className="cmz-nome">{AMB[k].nome}</span>
              <b>{ms.length}</b>
              {ms.length ? <span className="cmz-val">{compacto(ms.reduce((a, m) => a + m.valor_estoque, 0))}</span> : null}
              {velhas ? <small>{velhas} há +1 ano</small> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TelaEstoque({ onFechar, depois, kpiExtra, localInicial }: { onFechar: () => void; depois?: ReactNode; kpiExtra?: ReactNode; localInicial?: string }) {
  const { d: bruto, setD: setPatio, erro } = useJson<Patio>('/api/empresa/maquinas')
  const d = useMemo(() => (bruto ? soMaquinas(bruto) : null), [bruto])
  const [sel, setSel] = useState<MaqVE | null>(null)
  const [movendo, setMovendo] = useState(false)
  // janela grande com uma lista de máquinas: um local do mapa ou um dos cartões de cima
  const [listaEsc, setListaEsc] = useState<{ titulo: string; cor?: string; ms: MaqVE[]; ordem?: 'dias' | 'valor' | 'custo' | 'mes' } | null>(null)
  const [iniAberto, setIniAberto] = useState(!!localInicial)
  const lista = listaEsc ?? (iniAberto && d && localInicial && AMB[localInicial] ? { titulo: AMB[localInicial].nome, cor: AMB[localInicial].cor, ms: d.ambientes[localInicial] || [] } : null)
  const setLista = (x: typeof listaEsc) => { setIniAberto(false); setListaEsc(x) }
  const setLocal = (k: string) => d && setLista({ titulo: AMB[k].nome, cor: AMB[k].cor, ms: d.ambientes[k] || [] })
  const [msg, setMsg] = useState<string | null>(null)
  const todas = d ? Object.values(d.ambientes).flat() : []
  const valor = todas.reduce((a, m) => a + m.valor_estoque, 0), custo = todas.reduce((a, m) => a + m.custo_capital, 0), mes = todas.reduce((a, m) => a + m.custo_capital_mes, 0)
  const medio = todas.length ? Math.round(todas.reduce((a, m) => a + m.dias_em_estoque, 0) / todas.length) : 0
  const faixas = [{ n: 'Até 6 meses', f: (x: number) => x <= 180, cor: '#22c55e' }, { n: '6 meses a 1 ano', f: (x: number) => x > 180 && x <= 365, cor: '#f59e0b' }, { n: 'Mais de 1 ano', f: (x: number) => x > 365, cor: '#dc2626' }]
    .map((q) => { const l = todas.filter((m) => q.f(m.dias_em_estoque)); return { ...q, qtd: l.length, valor: l.reduce((a, m) => a + m.valor_estoque, 0) } })
  const mudarLocal = async (m: MaqVE, ambiente: string) => {
    setMovendo(true); setMsg(null)
    try {
      const r = await fetch('/api/empresa/maquinas', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_produto: m.codigo_produto, conta: m.conta_omie, ambiente }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.erro || `Erro ${r.status}`); return }
      const eh = (x: MaqVE) => x.codigo_produto === m.codigo_produto && x.conta_omie === m.conta_omie
      setPatio((p) => { if (!p) return p; const amb = Object.fromEntries(Object.entries(p.ambientes).map(([k, l]) => [k, l.filter((x) => !eh(x))])); amb[ambiente] = [...(amb[ambiente] || []), { ...m, ambiente }]; return { ...p, ambientes: amb } })
      setSel({ ...m, ambiente })
    } catch { setMsg('Não deu para mudar agora.') } finally { setMovendo(false) }
  }
  return (
    <TelaCheia titulo="Máquinas" sub="estoque da loja, o que vendemos por mês e as propostas em aberto" onFechar={onFechar}>
      {erro && <div className="cm-aviso">{erro}</div>}
      {!d && !erro && <div className="ce-mudo">Carregando as máquinas…</div>}
      {d && (
        <section className="cmt-sec">
          <div className="cmt-sec-cab"><h3>Onde estão as máquinas</h3><span>clique num lugar para ver as máquinas</span></div>
          <MapaEstoque d={d} onLocal={setLocal} />
        </section>
      )}
      {d && (
        <div className="cmt-kpis">
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: 'Máquinas na loja', ms: resumoLoja(d).loja, ordem: 'dias' })}><small>Máquinas na loja</small><b>{resumoLoja(d).qtdLoja}</b><em>+ {resumoLoja(d).qtdDemo} em demonstração · parada em média {tempoParada(medio)}</em></button>
          {kpiExtra /* propostas em aberto, ao lado de Máquinas na loja (José, 12/11) */}
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: 'Dinheiro parado', ms: todas, ordem: 'valor' })}><small>Dinheiro parado</small><b style={{ color: '#b45309' }}>{compacto(valor)}</b><em>pelo que pagamos nelas</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: 'Já custou ficar parado', ms: todas, ordem: 'custo' })}><small>Já custou ficar parado</small><b style={{ color: COR_SAIU }}>{compacto(custo)}</b><em>o que esse dinheiro teria rendido na SELIC</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setLista({ titulo: 'Custa por mês', ms: todas, ordem: 'mes' })}><small>Custa por mês</small><b style={{ color: COR_SAIU }}>{compacto(mes)}</b><em>somando todas as paradas</em></button>
          {faixas.map((q) => <button key={q.n} className="cmt-kpi cmt-kpi-bt" disabled={!q.qtd} onClick={() => setLista({ titulo: `Paradas: ${q.n.toLowerCase()}`, cor: q.cor, ms: todas.filter((m) => q.f(m.dias_em_estoque)), ordem: 'dias' })}><small>{q.n}</small><b style={{ color: q.cor }}>{q.qtd}</b><em>{compacto(q.valor)}</em></button>)}
        </div>
      )}
      {depois}
      {d && lista && (
        <div className="cmw-fundo cml-janela-fundo" onClick={() => setLista(null)}>
          <div className="cml-janela" onClick={(e) => e.stopPropagation()}>
            <div className="cml-janela-cab">
              <h3 style={{ color: lista.cor || '#0f172a' }}>{lista.titulo}</h3>
              <span>{plural(lista.ms.length, 'máquina', 'máquinas')} · {compacto(lista.ms.reduce((a, m) => a + m.valor_estoque, 0))}</span>
              <button className="cma-x" onClick={() => setLista(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="cml-janela-corpo">
              {lista.ordem === 'mes' || lista.ordem === 'custo' ? (() => {
                // a conta de cada máquina (José, 12/11: "mostrar o valor por cada produto que dá esses 23 mil e o porquê")
                const ms = [...lista.ms].sort((a, b) => lista.ordem === 'mes' ? b.custo_capital_mes - a.custo_capital_mes : b.custo_capital - a.custo_capital)
                const soma = (f: (m: MaqVE) => number) => ms.reduce((a, m) => a + f(m), 0)
                const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                return (
                  <>
                    <div className="cmx-explica">
                      <b>Como chegamos nesse número:</b> o dinheiro que pagamos em cada máquina parada poderia estar rendendo na SELIC.
                      Para cada uma: <em>quanto pagamos × SELIC acumulada desde que ela entrou</em> = quanto <b>já custou</b> ficar parada.
                      Dividindo pelos dias parada e multiplicando por 30 dá quanto ela custa <b>por mês</b>, em média. A soma de todas é o número do cartão.
                    </div>
                    <div className="cmt-tab-wrap"><table className="cmt-tab cmx-tab">
                      <thead><tr><th>Máquina</th><th>Pagamos</th><th>Parada há</th><th>SELIC no período</th><th>Já custou</th><th>Por mês</th></tr></thead>
                      <tbody>
                        {ms.map((m, i) => (
                          <tr key={i} className="cmm-l" onClick={() => { setSel(m); setMsg(null) }}>
                            <td title={m.descricao}>{nomeCurto(m.descricao)}<small>{[AMB[m.ambiente]?.nome, m.familia_nome].filter(Boolean).join(' · ')}</small></td>
                            <td>{brl(m.valor_estoque)}</td>
                            <td><span className="cmp-idade" style={{ background: corIdade(m.dias_em_estoque) }}>{tempoParada(m.dias_em_estoque)}</span></td>
                            <td>{pct(m.selic_acumulada || 0)}</td>
                            <td className={lista.ordem === 'custo' ? 'cmx-forte' : ''}>{brl(m.custo_capital)}</td>
                            <td className={lista.ordem === 'mes' ? 'cmx-forte' : ''}>{brl(m.custo_capital_mes)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><td>Soma de {plural(ms.length, 'máquina', 'máquinas')}</td><td>{brl(soma((m) => m.valor_estoque))}</td><td /><td /><td className={lista.ordem === 'custo' ? 'cmx-forte' : ''}>{brl(soma((m) => m.custo_capital))}</td><td className={lista.ordem === 'mes' ? 'cmx-forte' : ''}>{brl(soma((m) => m.custo_capital_mes))}</td></tr></tfoot>
                    </table></div>
                    <p className="cma-nota">Os dias contam da data em que o produto foi cadastrado no Omie (as em demonstração, da saída da remessa). Clique numa linha para ver a máquina.</p>
                  </>
                )
              })() : (
              <div className="cmw-grade">
                {[...lista.ms].sort((a, b) => lista.ordem === 'valor' ? b.valor_estoque - a.valor_estoque : lista.ordem === 'custo' ? b.custo_capital - a.custo_capital : lista.ordem === 'mes' ? b.custo_capital_mes - a.custo_capital_mes : b.dias_em_estoque - a.dias_em_estoque).map((m, i) => (
                  <button key={`${m.conta_omie}-${m.codigo_produto}-${i}`} className="cmw-card cmw-clica" onClick={() => { setSel(m); setMsg(null) }}>
                    <div className="cmw-foto">{m.imagem_url ? <img src={m.imagem_url} alt="" /> : <i className="fas fa-tractor" />}<span style={{ background: corIdade(m.dias_em_estoque) }}>{tempoParada(m.dias_em_estoque)}</span></div>
                    <div className="cmw-tit">{nomeCurto(m.descricao)}</div>
                    <div className="cmw-sub">{[m.familia_nome, m.ambiente === 'demonstracao' && m.destinatario ? `com ${m.destinatario}` : '', m.conta_omie === 'castro' ? 'Castro' : ''].filter(Boolean).join(' · ')}</div>
                    <div className="cmw-precos">
                      <span><small>Pagamos</small><b>{compacto(m.valor_estoque)}</b></span>
                      <span><small>Venda</small><b style={{ color: '#0369a1' }}>{m.valor_unitario ? compacto(m.valor_unitario) : '—'}</b></span>
                      <span><small>Já custou</small><b style={{ color: COR_SAIU }}>{compacto(m.custo_capital)}</b></span>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      )}
      {d && <p className="cma-nota">Onde mudar: o <b>local</b> de cada máquina você troca clicando nela aqui (ou arrastando no Visual Estoque → Pátio). A <b>foto</b> é a do Visual Estoque (Pátio → clicar na máquina). <b>Em demonstração</b> vem das remessas abertas no Omie. O <b>custo</b>, o <b>preço</b> e a <b>data de entrada</b> vêm do cadastro do produto no Omie.</p>}
      {sel && (
        <div className="cmw-fundo" onClick={() => !movendo && setSel(null)}>
          <div className="cmw-caixa cme-det" onClick={(e) => e.stopPropagation()}>
            {sel.imagem_url ? <img className="cme-sel-img" src={sel.imagem_url} alt="" /> : null}
            {sel.ambiente !== 'demonstracao' && <TrocarFoto key={`${sel.conta_omie}-${sel.codigo_produto}`} m={sel} onTrocou={(url) => {
              const eh = (x: MaqVE) => x.codigo_produto === sel.codigo_produto && x.conta_omie === sel.conta_omie
              setSel({ ...sel, imagem_url: url })
              setPatio((pp) => (pp ? { ...pp, ambientes: Object.fromEntries(Object.entries(pp.ambientes).map(([k, l]) => [k, l.map((x) => (eh(x) ? { ...x, imagem_url: url } : x))])) } : pp))
              setLista((ls) => (ls ? { ...ls, ms: ls.ms.map((x) => (eh(x) ? { ...x, imagem_url: url } : x)) } : ls))
            }} />}
            <h3>{nomeCurto(sel.descricao)}</h3>
            <p>{sel.descricao}</p>
            <div className="cme-conta">
              <div className="cme-conta-tit">Quanto custa ela ficar parada</div>
              <div><span>Quanto pagamos nela</span><b>{brl(sel.valor_estoque)}</b></div>
              <div><span>Parada desde {sel.ambiente === 'demonstracao' ? 'a saída para demonstração' : 'o cadastro no Omie'}{sel.data_inclusao ? ` (${sel.data_inclusao})` : ''}</span><b>{sel.dias_em_estoque.toLocaleString('pt-BR')} dias</b></div>
              <div><span>SELIC acumulada nesse tempo</span><b>{((sel.selic_acumulada || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></div>
              <div className="forte"><span>O que esse dinheiro teria rendido</span><b>{brl(sel.custo_capital)}</b></div>
              <div><span>Dividido pelos dias, × 30</span><b>{brl(sel.custo_capital_mes)} por mês</b></div>
            </div>
            <div className="cme-sel-l"><span>Preço de venda (Omie)</span><b>{sel.valor_unitario ? brl(sel.valor_unitario) : 'sem preço'}</b></div>
            {sel.ambiente !== 'demonstracao' ? (
              <label>Onde ela está
                <select value={sel.ambiente} disabled={movendo} onChange={(e) => mudarLocal(sel, e.target.value)}>
                  {LOCAIS_MUDA.map((k) => <option key={k} value={k}>{AMB[k].nome}</option>)}
                </select>
              </label>
            ) : <small>Está em demonstração{sel.destinatario ? ` com ${sel.destinatario}` : ''} (remessa aberta no Omie).</small>}
            {msg && <div className="cm-aviso">{msg}</div>}
            <div className="cmw-bts"><button className="cm-bt" disabled={movendo} onClick={() => setSel(null)}>{movendo ? 'Mudando…' : 'Fechar'}</button></div>
          </div>
        </div>
      )}
    </TelaCheia>
  )
}

// ── VITRINE (fotos + preço) ──────────────────────────────────────────────────
export function TelaVitrine({ onFechar }: { onFechar: () => void }) {
  const { d: bruto, setD: setPatio, erro } = useJson<Patio>('/api/empresa/maquinas')
  const d = useMemo(() => (bruto ? soMaquinas(bruto) : null), [bruto])
  const [fam, setFam] = useState('todas')
  const [ordem, setOrdem] = useState<'parada' | 'valor' | 'margem'>('parada')
  const [editando, setEditando] = useState<MaqVE | null>(null)
  const [texto, setTexto] = useState('')
  const [confirmar, setConfirmar] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const todas = d ? Object.entries(d.ambientes).filter(([k]) => k !== 'demonstracao').flatMap(([, l]) => l) : []
  const fams = [...new Set(todas.map((m) => m.familia_nome))].sort()
  const margem = (m: MaqVE) => (m.valor_unitario ? ((m.valor_unitario - m.cmc) / m.valor_unitario) * 100 : null)
  const lista = todas.filter((m) => fam === 'todas' || m.familia_nome === fam)
    .sort((a, b) => ordem === 'parada' ? b.dias_em_estoque - a.dias_em_estoque : ordem === 'valor' ? b.valor_unitario - a.valor_unitario : (margem(a) ?? -999) - (margem(b) ?? -999))
  const novoValor = () => Number(texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''))
  const salvar = async () => {
    if (!editando || confirmar == null) return
    setSalvando(true); setMsg(null)
    try {
      const r = await fetch('/api/empresa/preco', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_produto: editando.codigo_produto, conta: editando.conta_omie, valor: confirmar }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, t: j.erro || `Erro ${r.status}` }); return }
      setPatio((p) => (p ? { ...p, ambientes: Object.fromEntries(Object.entries(p.ambientes).map(([k, l]) => [k, l.map((m) => (m.codigo_produto === editando.codigo_produto && m.conta_omie === editando.conta_omie ? { ...m, valor_unitario: confirmar } : m))])) } : p))
      setMsg({ ok: true, t: `Preço de ${editando.descricao.slice(0, 40)} mudado no Omie para ${brl(confirmar)}.` })
      setEditando(null); setConfirmar(null)
    } catch { setMsg({ ok: false, t: 'Não deu para salvar agora.' }) } finally { setSalvando(false) }
  }
  return (
    <TelaCheia titulo="Vitrine das máquinas" sub="foto, custo, preço de venda e margem de cada máquina da loja" onFechar={onFechar}>
      {erro && <div className="cm-aviso">{erro}</div>}
      {msg && <div className={msg.ok ? 'cmw-ok' : 'cm-aviso'}>{msg.t}</div>}
      <div className="cmw-filtros">
        <span className="cm-abas">{[['todas', 'Todas'], ...fams.map((f) => [f, f])].map(([k, n]) => <button key={k} className={fam === k ? 'on' : ''} onClick={() => setFam(k)}>{n}</button>)}</span>
        <span className="cm-abas">{([['parada', 'Mais tempo parada'], ['valor', 'Maior preço'], ['margem', 'Menor margem']] as const).map(([k, n]) => <button key={k} className={ordem === k ? 'on' : ''} onClick={() => setOrdem(k)}>{n}</button>)}</span>
      </div>
      {!d && !erro && <div className="ce-mudo">Carregando as máquinas…</div>}
      <div className="cmw-grade">
        {lista.map((m) => {
          const mg = margem(m)
          return (
            <div key={`${m.conta_omie}-${m.codigo_produto}`} className="cmw-card">
              <div className="cmw-foto">{m.imagem_url ? <img src={m.imagem_url} alt="" /> : <i className="fas fa-tractor" />}<span style={{ background: corIdade(m.dias_em_estoque) }}>{m.dias_em_estoque > 365 ? `${(m.dias_em_estoque / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` : `${m.dias_em_estoque} dias`}</span></div>
              <div className="cmw-tit">{m.descricao}</div>
              <div className="cmw-sub">{[m.marca, m.familia_nome, m.estoque > 1 ? `${m.estoque} unidades` : '', m.conta_omie === 'castro' ? 'Castro' : ''].filter(Boolean).join(' · ')}</div>
              <div className="cmw-precos">
                <span><small>Custo</small><b>{m.cmc ? compacto(m.cmc) : '—'}</b></span>
                <span><small>Venda</small><b style={{ color: '#0369a1' }}>{m.valor_unitario ? compacto(m.valor_unitario) : 'sem preço'}</b></span>
                <span><small>Margem</small><b style={{ color: mg == null ? '#64748b' : mg < 10 ? COR_SAIU : COR_FICOU }}>{mg == null ? '—' : `${Math.round(mg)}%`}</b></span>
              </div>
              <button className="cmw-lapis" onClick={() => { setEditando(m); setTexto(m.valor_unitario ? Math.round(m.valor_unitario).toLocaleString('pt-BR') : ''); setConfirmar(null); setMsg(null) }}><i className="fas fa-pen" /> Mudar preço</button>
            </div>
          )
        })}
      </div>
      {editando && (
        <div className="cmw-fundo" onClick={() => !salvando && setEditando(null)}>
          <div className="cmw-caixa" onClick={(e) => e.stopPropagation()}>
            <h3>Mudar o preço de venda</h3>
            <p>{editando.descricao}</p>
            {confirmar == null ? (
              <>
                <label>Novo preço (R$)<input autoFocus inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && novoValor() > 0) setConfirmar(novoValor()) }} /></label>
                <small>Hoje: {editando.valor_unitario ? brl(editando.valor_unitario) : 'sem preço'} · custo {brl(editando.cmc)}{novoValor() > 0 ? ` · margem nova ${Math.round(((novoValor() - editando.cmc) / novoValor()) * 100)}%` : ''}</small>
                <div className="cmw-bts"><button className="cm-bt" onClick={() => setEditando(null)}>Cancelar</button><button className="cm-bt cm-bt-ok" disabled={!(novoValor() > 0)} onClick={() => setConfirmar(novoValor())}>Continuar</button></div>
              </>
            ) : (
              <>
                <p className="cmw-conf">O preço muda <b>no Omie</b> de <b>{editando.valor_unitario ? brl(editando.valor_unitario) : 'sem preço'}</b> para <b>{brl(confirmar)}</b>. Vale para todo mundo que vende essa máquina, e fica registrado que foi você.</p>
                <div className="cmw-bts"><button className="cm-bt" disabled={salvando} onClick={() => setConfirmar(null)}>Voltar</button><button className="cm-bt cm-bt-ok" disabled={salvando} onClick={salvar}>{salvando ? 'Mudando no Omie…' : 'Confirmar'}</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </TelaCheia>
  )
}

export const CSS_CMT2 = `
/* vendedores */
.cmv-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.ce .cmv-card{display:flex;flex-direction:column;gap:12px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:18px;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s}
.ce .cmv-card:hover{border-color:#c4b5fd;box-shadow:0 14px 30px -22px rgba(15,23,42,.6)}
.cmv-ver{margin-top:auto;font-size:13px;font-weight:500;color:#7c3aed;display:inline-flex;gap:6px;align-items:center}
.cmv-abas{display:flex;gap:4px;padding:4px;background:#f1f5f9;border-radius:99px;align-self:flex-start;flex-wrap:wrap}
.ce .cmv-abas button{padding:8px 18px;border-radius:99px;font-size:14px;color:#475569;cursor:pointer;font-family:inherit}
.ce .cmv-abas button.on{background:#fefefe;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.12)}
.cmh-carro{display:grid;grid-template-columns:220px minmax(150px,auto) 1fr;align-items:center;gap:22px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:16px 22px}
.cmh-foto{height:130px;display:grid;place-items:center}
.cmh-foto img{max-width:100%;max-height:130px;object-fit:contain}
.cmh-foto i{font-size:48px;color:#cbd5e1}
.cmh-id{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.cmh-id b{font-size:20px;font-weight:500;color:#0f172a}
.cmh-id small{font-size:12.5px;color:#64748b}
.cmh-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border-left:1px solid #e2e8f0}
.cmh-nums > div,.ce .cmh-nums > button{display:flex;flex-direction:column;gap:2px;padding:6px 18px;border-right:1px solid #f1f5f9;text-align:left;font-family:inherit}
.ce .cmh-nums > button{cursor:pointer;border-radius:12px}
.ce .cmh-nums > button:hover{background:#f8fafc}
.cmh-nums small{font-size:12.5px;color:#64748b}
.cmh-nums strong{font-size:26px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;line-height:1.2}
.cmh-nums em{font-style:normal;font-size:12.5px;color:#64748b}
.cmh-nums .ruim strong,.cmh-nums strong.ruim{color:#be123c}
.cmh-nums .bom strong,.cmh-nums strong.bom{color:#15803d}
.cmh-nums strong.medio{color:#b45309}
@media (max-width:1100px){.cmh-carro{grid-template-columns:160px 1fr}.cmh-nums{grid-column:1/-1;border-left:0;border-top:1px solid #e2e8f0;padding-top:8px}}
@media (max-width:620px){.cmh-carro{grid-template-columns:1fr;text-align:center}.cmh-id{align-items:center}.cmh-nums{grid-template-columns:1fr 1fr}}
.cmpv-l{display:grid;grid-template-columns:minmax(380px,1.1fr) 1fr;gap:14px;align-items:stretch}
.cmpv-l .cmpz-cards{grid-template-columns:1fr!important}
.ce button.cmt-kpi.on{border-color:#2563eb;box-shadow:inset 0 0 0 1px #2563eb}
@media (max-width:1000px){.cmpv-l{grid-template-columns:1fr}}
.cmrot-on td{background:#eff6ff!important}
.cmdp-topo{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-bottom:12px}
.cmdp-topo > div:first-child{display:flex;flex-direction:column}
.cmdp-topo small{font-size:12.5px;color:#64748b}
.cmdp-topo strong{font-size:30px;font-weight:500;color:#be123c;font-variant-numeric:tabular-nums;line-height:1.15}
.cmdp-topo em{font-style:normal;font-size:12.5px;color:#64748b}
.cmdp-barra{display:flex;height:16px;border-radius:99px;overflow:hidden;gap:2px;background:#f1f5f9}
.cmdp-barra span{display:block;height:100%;transition:opacity .2s}
.cmdp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.ce .cmdp-chips button{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:99px;background:#fefefe;font-size:13px;color:#334155;cursor:pointer;font-family:inherit}
.ce .cmdp-chips button.on{background:#eff6ff;color:#1d4ed8;border-color:#93c5fd;font-weight:500}
.cmdp-chips i{width:10px;height:10px;border-radius:3px}
.cmdp-chips b{font-weight:600}
.cmdp-chips small{font-size:11.5px;opacity:.7}
.cmdp-lista{display:flex;flex-direction:column}
.ce .cmdp-l{display:grid;grid-template-columns:6px 1fr auto 100px auto;align-items:center;gap:14px;padding:11px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;font-family:inherit}
.ce .cmdp-l:hover{background:#f8fafc}
.cmdp-cor{width:6px;height:34px;border-radius:99px}
.cmdp-o{display:flex;flex-direction:column;font-size:14.5px;color:#0f172a;min-width:0}
.cmdp-o small{font-size:12.5px;color:#64748b}
.cmdp-sit{font-size:12px;border-radius:99px;padding:3px 10px;white-space:nowrap}
.cmpp-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.cmdp-sit.neutro{background:#f1f5f9;color:#475569}.cmdp-sit.perd{background:#fee2e2;color:#b91c1c}
.ce .cmpp-l{grid-template-columns:6px 1fr auto 100px auto}
.cmdp-sit.ok{background:#dcfce7;color:#15803d}.cmdp-sit.esp{background:#fef3c7;color:#92400e}.cmdp-sit.ped{background:#e0e7ff;color:#3730a3}
.cmdp-l > b{font-size:15px;font-weight:500;color:#0f172a;text-align:right;font-variant-numeric:tabular-nums}
.cmdp-pdf{font-size:12.5px;color:#be123c;white-space:nowrap}
@media (max-width:620px){.cmdp-topo{grid-template-columns:1fr}.ce .cmdp-l{grid-template-columns:6px 1fr auto}.cmdp-sit,.cmdp-pdf{display:none}}
.cmcv{display:flex;flex-direction:column;gap:4px}
.cmcv-l{display:grid;grid-template-columns:minmax(170px,220px) repeat(var(--n),minmax(0,1fr));gap:14px;align-items:center;padding:7px 4px}
.cmcv-cab{border-bottom:1px solid #e2e8f0;padding-bottom:10px}
.cmcv-cab b{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:500;color:#0f172a}
.cmcv-cab i{width:12px;height:12px;border-radius:4px}
.cmcv-grupo{border-bottom:1px solid #f1f5f9;padding:6px 0}
.cmcv-gtit{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding:4px 4px 2px}
.cmcv-nome{font-size:14px;color:#475569}
.cmcv-cel{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px}
.cmcv-bar{height:10px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.cmcv-bar span{display:block;height:100%;border-radius:99px;opacity:.75;animation:btCresce .7s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.cmcv-cel b{font-size:14.5px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:64px;text-align:right}
.cmcv-cel.top b{color:#15803d;font-weight:600}
.cmcv-cel.top b i{font-size:11px;color:#f59e0b;margin-right:5px}
.cmcv-cel.top .cmcv-bar span{opacity:1}
@media (max-width:760px){.cmcv-l{grid-template-columns:1fr}.cmcv-cab{display:none}.cmcv-cel{grid-template-columns:90px 1fr auto}.cmcv-cel::before{content:'';}}
.cmcv-tab th,.cmcv-tab td{text-align:right!important;white-space:nowrap}
.cmcv-tab th:first-child,.cmcv-tab td:first-child{text-align:left!important;color:#475569!important;white-space:normal}
.cmcv-tab th{font-size:14px!important;color:#0f172a!important;font-weight:500!important}
.cmcv-tab td{font-size:15px;color:#0f172a!important;font-variant-numeric:tabular-nums}
.cmcv-tab td.melhor{background:#dcfce7;color:#15803d!important;font-weight:600}
.cmvm-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cmvm-ctrl select{padding:6px 10px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:13.5px;background:#fefefe;color:#0f172a}
.cmvm-dois{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.cmvm-bloco{min-width:0}
.cmvm-mais,.cmvm-menos{display:block;font-size:12.5px;font-weight:500;text-align:right}
.cmvm-mais{color:#15803d}.cmvm-menos{color:#be123c}
@media (max-width:900px){.cmvm-dois{grid-template-columns:1fr}}
.cmv-car-nome{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}
.cmv-car-nome b{font-size:17px;font-weight:500;color:#0f172a}
.cmv-placa{font-style:normal;font-size:13px;font-weight:600;letter-spacing:.06em;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:2px 8px;color:#0f172a}
.cmv-car-sub{font-size:12.5px;color:#64748b}
.cmv-porque{grid-column:1/-1;display:flex;flex-direction:column;gap:6px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 14px}
.cmv-porque > b{font-size:14.5px;font-weight:500;color:#92400e}
.cmv-porque > small{font-size:12.5px;color:#78716c}
.cmv-porque-l{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;color:#0f172a;padding-top:6px;border-top:1px solid #fde68a}
.cmv-porque-l span{display:flex;flex-direction:column}
.cmv-porque-l small{font-size:12px;color:#78716c}
.cmv-porque-l em{font-style:normal;font-weight:600;color:#be123c;white-space:nowrap}
.cmv-chk > .cmnf-bt{grid-column:1/-1;justify-self:start}
.ce .cmvis-l2{width:100%;display:grid;grid-template-columns:1fr auto auto auto 14px;align-items:center;gap:10px;padding:11px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;font-family:inherit}
.ce .cmvis-l2:hover{background:#f8fafc}
.cmvis-l2 b{font-size:14.5px;font-weight:500;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmvis-l2 span{font-size:12px;border-radius:99px;padding:2px 10px;white-space:nowrap}
.cmvis-l2 small{font-size:12.5px;color:#64748b;font-variant-numeric:tabular-nums}
.cmvis-l2 i{font-size:11px;color:#94a3b8}
.cmvis-vazio{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 4px}
.t-cinza{background:#f1f5f9;color:#475569}
.cmfr-fotos{display:flex;gap:6px;padding:8px 16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
.ce .cmfr-fotos button{padding:6px 12px;border:1px solid #e2e8f0;border-radius:99px;font-size:13px;color:#334155;cursor:pointer;background:#fefefe;display:inline-flex;gap:6px;align-items:center}
.ce .cmfr-fotos button.on{background:#0f172a;color:#fff;border-color:#0f172a}
.cmfr-img{flex:1;overflow:auto;display:grid;place-items:center;background:#525659;padding:12px}
.cmfr-img img{max-width:100%;max-height:100%;object-fit:contain}
.cmmapa{display:flex;flex-direction:column;gap:10px}
.cmmapa-filtros{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cmmapa-filtros input,.cmmapa-filtros select{padding:7px 10px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:14px;background:#fefefe;color:#0f172a}
.cmmapa-horas{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:#475569}
.cmmapa-res{margin-left:auto;font-size:13px;color:#475569}
.cmmapa-area{position:relative}
.cmmapa-mapa{height:min(60vh,520px);border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;background:#e2e8f0}
.cmmapa-aviso{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:500;background:#0f172a;color:#fff;border-radius:99px;padding:6px 14px;font-size:13px}
.cmmapa-leg{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:#475569}
.cmmapa-leg i{display:inline-block;width:10px;height:10px;border-radius:99px;margin-right:6px}
.cmmapa-agora{width:34px;height:34px;border-radius:99px;background:#2563eb;color:#fff;display:grid;place-items:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);font-size:14px}
.cmmapa-agora.vivo{animation:cmPulsa 1.6s infinite}
@keyframes cmPulsa{0%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}70%{box-shadow:0 0 0 14px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}
@media (max-width:620px){.cmmapa-res{margin-left:0;width:100%}.cmmapa-mapa{height:360px}.ce .cmvis-l2{grid-template-columns:1fr auto 14px}.cmvis-l2 small,.cmvis-l2 .t-laranja{display:none}}
.cmvis-ic{color:#2563eb;font-size:15px}
.cmvis{background:#fefefe;border-radius:18px;width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)}
.cmvis-corpo{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);min-height:0;flex:1;overflow:hidden}
.cmvis-mapa{display:flex;flex-direction:column;background:#f1f5f9;min-height:420px;position:relative}
.cmvis-cidade{position:absolute;left:50%;top:calc(50% - 64px);transform:translateX(-50%);z-index:3;background:#0f172a;color:#fff;border-radius:99px;padding:6px 14px;font-size:14px;font-weight:500;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.25);pointer-events:none}
.cmvis-cidade i{color:#86efac;margin-right:4px}
.cmvis-mapa iframe{flex:1;border:0;width:100%;min-height:380px}
.cmvis-mapa-rodape{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;font-size:12.5px;color:#475569;background:#fefefe;border-top:1px solid #e2e8f0}
.cmvis-mapa-rodape a{text-decoration:none}
.cmvis-rel{padding:18px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.cmvis-tags{display:flex;flex-wrap:wrap;gap:6px}
.cmvis-tags span{font-size:12px;border-radius:99px;padding:3px 10px}
.t-azul{background:#dbeafe;color:#1e40af}.t-laranja{background:#ffedd5;color:#c2410c}.t-ambar{background:#fef3c7;color:#92400e}
.cmvis-l{display:flex;flex-direction:column;gap:3px}
.cmvis-l small{font-size:12.5px;color:#64748b}
.cmvis-l b{font-size:15px;font-weight:500;color:#0f172a}
.cmvis-l p{margin:0;font-size:15px;color:#0f172a;line-height:1.55;white-space:pre-wrap}
.cmvis-foto{max-width:100%;max-height:260px;border-radius:12px;border:1px solid #e2e8f0}
@media (max-width:800px){.cmvis-corpo{grid-template-columns:1fr;overflow-y:auto}.cmvis-mapa{min-height:300px}.cmvis-mapa iframe{min-height:280px}}
.cmv-rh,.cmv-chk{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.cmv-rh div,.cmv-chk div{display:flex;flex-direction:column;gap:2px}
.cmv-rh small,.cmv-chk small{font-size:12.5px;color:#64748b}
.cmv-rh b,.cmv-chk b{font-size:15px;font-weight:500;color:#0f172a}
.cmv-chk ul{grid-column:1/-1;margin:0;padding-left:18px;font-size:13.5px;color:#b45309}
.cmv-carro-l{display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start}
@media (max-width:1000px){.cmv-carro-l{grid-template-columns:1fr}}
.cmv-carro{height:90px;border-radius:12px;background:#f1f5f9;display:grid;place-items:center;overflow:hidden}
.cmv-carro img{max-height:86px;max-width:90%;object-fit:contain}
.cmv-carro i,.cmv-foto > i{font-size:34px;color:#94a3b8}
.cmv-nome{display:flex;flex-direction:column;font-size:18px;font-weight:500;color:#0f172a}
.cmv-nome small{font-size:13px;font-weight:400;color:#64748b}
.cmv-nums{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cmv-nums span{display:flex;flex-direction:column}
.cmv-nums b{font-size:18px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cmv-nums small{font-size:12px;color:#64748b}
.cmv-meta{display:flex;flex-direction:column;gap:4px}
.cmv-meta small{font-size:12px;color:#64748b}
.ce .cmv-voltar{font-size:13.5px;color:#0369a1;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.cmv-topo{display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start}
.cmv-foto{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.cmv-foto img{max-width:100%;max-height:150px;object-fit:contain}
.cmv-foto span{display:flex;flex-direction:column;font-size:14px;color:#334155}
.cmv-foto b{font-weight:500}
.cmv-foto small{font-size:12px;color:#64748b}
.cmv-km{display:flex;align-items:flex-end;gap:4px;height:150px}
.cmv-km > span{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}
.cmv-km > span > span{width:100%;max-width:22px;background:#a78bfa;border-radius:5px 5px 2px 2px;min-height:2px}
.cmv-km small{font-size:10.5px;color:#94a3b8}
/* estoque */
.cme-mapa-l{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.cme-mapa{position:relative;width:100%;padding-bottom:72%;background:#fafafa;border-radius:14px;border:1px solid #eef2f7;overflow:hidden}
.cme-rua{position:absolute;font-size:10px;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase}
.cme-rua-t{top:4px;left:0;right:0;text-align:center}
.cme-zona{position:absolute;border:2px dashed color-mix(in srgb,var(--z) 35%,transparent);background:color-mix(in srgb,var(--z) 4%,transparent);border-radius:10px}
.cme-z-nome{position:absolute;top:4px;left:8px;font-size:11px;color:var(--z);text-transform:uppercase;letter-spacing:.06em}
.ce .cme-maq{position:absolute;display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translate(-10%,-10%);transition:transform .15s}
.ce .cme-maq:hover,.ce .cme-maq.on{transform:translate(-10%,-10%) scale(1.15);z-index:5}
.cme-maq img{height:auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.18))}
.cme-maq > i{font-size:22px;color:#64748b}
.cme-maq em{font-style:normal;font-size:10px;color:#fff;background:var(--idade);border-radius:99px;padding:1px 6px;margin-top:-4px}
.cme-maq.on img{filter:drop-shadow(0 0 6px #2563eb)}
.cme-fora{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.cme-fora-b{border:1px solid color-mix(in srgb,var(--z) 25%,#e2e8f0);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
.cme-fora-b b{font-size:13px;font-weight:500;color:var(--z)}
.ce .cme-fora-b button{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#334155;cursor:pointer;text-align:left}
.cme-fora-b button span{width:8px;height:8px;border-radius:99px;flex:none}
.cme-fora-b small{font-size:12px;color:#94a3b8}
.cme-lado{position:sticky;top:0}
.cme-sel-img{width:100%;max-height:180px;object-fit:contain;margin-bottom:8px}
.cme-sel-tit{margin:0;font-size:17px;font-weight:500;color:#0f172a}
.cme-sel-sub{font-size:13px;color:#64748b;margin:2px 0 12px}
.cme-sel-l{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #f1f5f9;font-size:14px;color:#475569}
.cme-sel-l b{font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cme-lado .cm-bt{margin-top:12px}
.cme-faixa{display:grid;grid-template-columns:12px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #f1f5f9;font-size:14.5px;color:#0f172a}
.cme-faixa i{width:12px;height:12px;border-radius:99px}
.cme-faixa span{display:flex;flex-direction:column}
.cme-faixa small{font-size:12.5px;color:#64748b}
.cme-faixa b{font-weight:500;font-variant-numeric:tabular-nums}
.ce .cme-it{width:100%;cursor:pointer;text-align:left}
.cmp-tab th,.cmp-tab td{text-align:right!important;white-space:nowrap}
.cmp-tab th:first-child,.cmp-tab td:first-child{text-align:left!important;white-space:normal}
.cmp-tab td{color:#0f172a!important;font-size:15px;padding:11px 10px!important}
.cmp-tab td.cmp-custo{color:#be123c!important;font-weight:500}
.cmp-idade{display:inline-block;color:#fff;font-size:12.5px;border-radius:99px;padding:2px 10px}
@media (max-width:620px){.cmp-tab th:nth-child(3),.cmp-tab td:nth-child(3),.cmp-tab th:nth-child(5),.cmp-tab td:nth-child(5){display:none}}
.cme-it-dir{display:flex;flex-direction:column;align-items:flex-end!important}
.cme-it-dir small{white-space:nowrap}
.cme-conta{margin-top:14px;background:#f8fafc;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#475569}
.cme-conta-tit{font-size:13.5px;font-weight:500;color:#0f172a;margin-bottom:2px}
.cme-conta > div:not(.cme-conta-tit){display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.cme-conta b{font-weight:500;color:#0f172a;white-space:nowrap;font-variant-numeric:tabular-nums}
.cme-conta .forte{border-top:1px solid #e2e8f0;padding-top:6px}
.cme-conta .forte b{color:#be123c}
.cme-conta p{margin:4px 0 0;font-size:12.5px;color:#64748b}
.cme-conta p b{color:#be123c}
/* vitrine */
.cmw-filtros{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between}
.cmw-filtros .cm-abas{flex-wrap:wrap;margin:0}
.cmw-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.cmw-card{background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px}
.cmw-foto{position:relative;height:160px;border-radius:12px;background:#f8fafc;display:grid;place-items:center;overflow:hidden}
.cmw-foto img{max-width:92%;max-height:150px;object-fit:contain}
.cmw-foto > i{font-size:40px;color:#cbd5e1}
.cmw-foto span{position:absolute;top:8px;right:8px;font-size:11.5px;color:#fff;border-radius:99px;padding:2px 8px}
.cmw-tit{font-size:14.5px;color:#0f172a;line-height:1.3;min-height:38px}
.cmw-sub{font-size:12.5px;color:#64748b}
.cmw-precos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:8px;border-top:1px solid #f1f5f9}
.cmw-precos span{display:flex;flex-direction:column}
.cmw-precos small{font-size:11.5px;color:#64748b}
.cmw-precos b{font-size:15px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap}
.cmw-precos small{white-space:nowrap}
.ce .cmw-lapis{align-self:flex-start;font-size:13px;color:#0369a1;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:4px 0}
.cmw-ok{font-size:13.5px;color:#15803d;background:#dcfce7;border-radius:10px;padding:8px 12px}
.cmz{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:14px;align-items:stretch}
.cmz-mapa{position:relative;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:24px 24px 6px;min-height:300px}
.cmz-rua{position:absolute;font-size:10px;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase}
.cmz-rua-t{top:5px;left:0;right:0;text-align:center}
.cmz-rua-e{left:4px;top:50%;writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg)}
.cmz-rua-d{right:4px;top:50%;writing-mode:vertical-rl;transform:translateY(-50%)}
.cmz-loja{position:relative;height:100%;min-height:270px}
.ce .cmz-zona{position:absolute;box-sizing:border-box;border:1px solid #e2e8f0;background:#fefefe;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;cursor:pointer;text-align:left;font-family:inherit;transition:background .2s,box-shadow .2s;overflow:hidden}
.ce .cmz-zona:hover:not(:disabled){border-color:#94a3b8;box-shadow:0 10px 24px -18px rgba(15,23,42,.6)}
.ce .cmz-zona.vazia{opacity:.55;cursor:default}
.cmz-nome{font-size:13px;font-weight:500;color:#475569}
.cmz-zona b{font-size:30px;font-weight:500;color:#0f172a;line-height:1.1;font-variant-numeric:tabular-nums}
.cmz-val{font-size:14px;color:#0f172a}
.cmz-zona small{font-size:12px;color:#b91c1c}
.cmz-fora{display:flex;flex-direction:column;gap:10px}
.ce .cmz-zona.cmz-solta{position:static;flex:1;width:auto;height:auto}
.ce .cml-local:disabled{opacity:.5;cursor:default}
@media (max-width:760px){.cmz{grid-template-columns:1fr}.cmz-fora{flex-direction:row}.cmz-zona b{font-size:22px}.cmz-val,.cmz-zona small{display:none}}
.cml-locais{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.ce .cml-local{display:flex;flex-direction:column;gap:2px;background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;cursor:pointer;text-align:left;font-family:inherit;transition:box-shadow .2s,transform .2s}
.ce .cml-local:hover{transform:translateY(-2px);box-shadow:0 14px 28px -22px rgba(15,23,42,.6)}
.cml-local-nome{font-size:14px;font-weight:500;color:var(--z)}
.cml-local b{font-size:34px;font-weight:500;color:#0f172a;line-height:1.1;font-variant-numeric:tabular-nums}
.cml-local-val{font-size:15px;color:#0f172a}
.cml-local small{font-size:12.5px;color:#64748b}
.cml-janela-fundo{z-index:100065}
.cmp-fundo{z-index:100075}
.cmp-janela{width:min(980px,96vw)}
.cml-janela{background:#f8fafc;border-radius:20px;width:min(1400px,96vw);height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.cml-janela-cab{display:flex;align-items:center;gap:14px;padding:16px 22px;background:#fefefe;border-bottom:1px solid #e2e8f0}
.cml-janela-cab h3{margin:0;font-size:20px;font-weight:500}
.cml-janela-cab span{flex:1;font-size:14px;color:#64748b}
.cml-janela-corpo{flex:1;min-height:0;overflow-y:auto;padding:18px 22px}
.cme-det{position:relative;z-index:100080}
.cmw-fundo:has(.cme-det){z-index:100080}
.ce .cmf-bt{display:inline-flex;align-items:center;gap:6px;align-self:flex-start}
.cmf{display:flex;flex-direction:column;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px}
.cmf-busca{display:flex;gap:6px}
.cmf-busca input{flex:1;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:14px}
.cmf-sf{display:flex;align-items:center;gap:6px;font-size:13px;color:#334155}
.cmf-estado{font-size:12.5px;color:#64748b}
.cmf-grade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;max-height:260px;overflow-y:auto}
.ce .cmf-op{aspect-ratio:1;border:1px solid #e2e8f0;border-radius:10px;background:#fefefe repeating-conic-gradient(#f1f5f9 0 25%,#fefefe 0 50%) 0 0/16px 16px;display:grid;place-items:center;overflow:hidden;cursor:pointer;padding:4px}
.ce .cmf-op:hover{border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe}
.cmf-op img{max-width:100%;max-height:100%;object-fit:contain}
.cmx-explica{background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;font-size:14.5px;color:#334155;line-height:1.55;margin-bottom:14px}
.cmx-explica b{font-weight:500;color:#0f172a}
.cmx-explica em{font-style:normal;background:#f1f5f9;border-radius:6px;padding:1px 6px}
.cmx-tab{background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
.cmx-tab th,.cmx-tab td{text-align:right!important;white-space:nowrap;padding:10px 12px!important}
.cmx-tab th:first-child,.cmx-tab td:first-child{text-align:left!important;white-space:normal}
.cmx-tab td{color:#0f172a!important;font-size:14.5px}
.cmx-tab td:first-child{display:table-cell!important}
.cmx-tab td:first-child small{display:block;font-size:12px;color:#64748b}
.cmx-tab td.cmx-forte{color:#be123c!important;font-weight:600}
.cmx-tab tfoot td{font-weight:600;background:#f8fafc;border-top:2px solid #e2e8f0}
@media (max-width:620px){.cmx-tab th:nth-child(3),.cmx-tab td:nth-child(3),.cmx-tab th:nth-child(4),.cmx-tab td:nth-child(4){display:none}}
.ce button.cmt-kpi{background:#fefefe;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;color:inherit}
.ce button.cmt-res.bom{background:#f0fdf4;border-color:#86efac}
.ce button.cmt-res.ruim{background:#fff1f2;border-color:#fda4af}
.ce button.cmt-res b{font-size:34px!important}
.ce button.cmt-res.bom b{color:#15803d}
.ce button.cmt-res.ruim b{color:#be123c}
.cmr-conta{display:flex;flex-direction:column;gap:2px;max-width:640px}
.cmr-conta > div{display:flex;justify-content:space-between;gap:16px;padding:10px 4px;border-bottom:1px solid #f1f5f9;font-size:16px;color:#334155}
.cmr-conta > div b{font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cmr-conta .cmr-tot{border-top:2px solid #cbd5e1;border-bottom:0;font-size:18px;font-weight:600;margin-top:4px}
.cmr-conta .cmr-tot.bom b{color:#15803d;font-size:22px}
.cmr-conta .cmr-tot.ruim b{color:#be123c;font-size:22px}
.ce button.cmt-kpi-bt{cursor:pointer;text-align:left;font-family:inherit;transition:border-color .2s,box-shadow .2s,transform .2s}
.ce button.cmt-kpi-bt:hover:not(:disabled){border-color:#94a3b8;box-shadow:0 12px 26px -20px rgba(15,23,42,.6);transform:translateY(-1px)}
.ce button.cmt-kpi-bt:disabled{cursor:default;opacity:.6}
.ce button.cmw-clica{cursor:pointer;text-align:left;font-family:inherit;transition:border-color .2s,box-shadow .2s}
.ce button.cmw-clica:hover{border-color:#cbd5e1;box-shadow:0 14px 28px -22px rgba(15,23,42,.6)}
.cmw-precos.cmw-dois{grid-template-columns:repeat(2,minmax(0,1fr))}
.cme-det{width:min(520px,100%);max-height:90vh;overflow-y:auto}
.cme-det select{padding:9px 12px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;font-size:15px;color:#0f172a;background:#fefefe}
.cmw-fundo{position:fixed;inset:0;z-index:100070;background:rgba(15,23,42,.45);display:grid;place-items:center;padding:16px}
.cmw-caixa{background:#fefefe;border-radius:18px;padding:22px;width:min(440px,100%);display:flex;flex-direction:column;gap:10px;box-shadow:0 30px 80px rgba(0,0,0,.3)}
.cmw-caixa h3{margin:0;font-size:18px;font-weight:500;color:#0f172a}
.cmw-caixa p{margin:0;font-size:14px;color:#475569}
.cmw-caixa label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#64748b}
.cmw-caixa input{padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;font-size:20px;color:#0f172a}
.cmw-caixa small{font-size:12.5px;color:#64748b}
.cmw-conf{font-size:15px!important;color:#0f172a!important;line-height:1.5}
.cmw-conf b{font-weight:500}
.cmw-bts{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
@media (max-width:1000px){.cme-mapa-l{grid-template-columns:1fr}.cme-lado{position:static}.cmv-topo{grid-template-columns:1fr}}
@media (max-width:620px){.cme-fora{grid-template-columns:1fr}.cme-mapa{padding-bottom:110%}.cme-maq img{max-width:40px}.cmv-grade,.cmw-grade{grid-template-columns:1fr}}
`
