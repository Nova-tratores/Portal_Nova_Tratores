// Furo de km de um mecânico no mês (José, 28/10/2026: "pegar os km rodados que não foram cobrados e, quando clicar,
// mostrar no mapa todos os pontos e as rotas não cobradas, e pedir pro Tratorilson resumir onde foi o furo") — SÓ SERVIDOR.
// Dia a dia: km do GPS (frota_dias) × km cobrado nas OS daquele dia (Qtd_KM repartido pelos dias da OS) × km do relatório,
// com as paradas classificadas do carro (frota_paradas). O Tratorilson lê os dias com furo e resume onde ele está.
// 28/10/2026 (2º pedido: "mostrar o caminho, a cidade, horário e tudo que for possível; dá pra saber quando ele saiu para o
// cliente e quanto tempo o carro ficou no cliente?"): cada parada é cruzada com a localização do cliente da OS do dia —
// a confirmada no faturar (clientes_localizacoes) ou a do cadastro — a até 500 m = "no cliente"; sem localização, a
// parada mais longa fora da loja num dia de OS vira "provável cliente". O dia aberto ganha a cidade de cada parada
// (ORS reverse) e os km de cada trecho (pontos do GPS entre uma parada e a próxima).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { computarESalvarRota } from '@/lib/pos/rastreamento'
import { distanciaM, minutosNoExpediente, soDigitos, LOJA, RAIO_LOJA_M } from '@/lib/pos/localizacao-cliente'
import { fantasmasDoMes } from './fantasmas-server'
import { comCache } from './cache'

type Rec = Record<string, unknown>
const r1 = (n: number) => Math.round(n * 10) / 10
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const RAIO_CLIENTE_M = 500

export const CLASSE_PARADA: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente', cliente_portal: 'Propriedade de cliente', manutencao: 'Manutenção',
  estacionamento: 'Estacionamento', descarga: 'Descarga', outro_destino: 'Destino cadastrado',
  visita: 'Visita comercial', abastecimento: 'Abastecimento', fora_geocerca: 'Fora de geocerca',
}

/** confirmado = bateu com a localização do faturar · cadastro = com a do cadastro do cliente · provavel = parada mais longa do dia */
export type ConfCliente = 'confirmado' | 'cadastro' | 'provavel'
export interface ParadaFuro {
  inicio: string; fim: string | null; min: number; lat: number; lng: number; onde: string; classe: string; atipica: boolean
  loja: boolean; cliente: { os: string; nome: string; conf: ConfCliente; colega?: string } | null; cidade?: string | null; kmAntes?: number
}
export interface OSDoDia { os: string; cliente: string; kmCobrado: number; horasRel: number; noCliente: { inicio: string; fim: string | null; min: number; conf: ConfCliente } | null }
export interface DiaFuro {
  data: string; placa: string | null; kmGps: number; kmCobrado: number; kmRel: number; furo: number
  saida: string | null; volta: string | null; os: OSDoDia[]; paradas: ParadaFuro[]
  /** OS de OUTROS técnicos no mesmo dia (José, 28/10/2026: "ele não acompanhou nenhum técnico também?") */
  colegas: (OSDoDia & { tecnico: string; semCarro: boolean })[]
}
export interface FuroKm { tecnico: string; mes: string; placas: string[]; dias: DiaFuro[]; kmGps: number; kmCobrado: number; furo: number }

type Loc = { lat: number; lng: number; nome: string; conf: 'confirmado' | 'cadastro' }

/** onde fica cada cliente (por CPF/CNPJ): as confirmadas no faturar e, sem elas, a do cadastro */
async function locaisDosClientes(docs: string[]): Promise<Map<string, Loc[]>> {
  const out = new Map<string, Loc[]>()
  if (!docs.length) return out
  const { data: conf } = await sb.from('clientes_localizacoes').select('documento, nome, lat, lng').in('documento', docs)
  for (const l of (conf || []) as Rec[]) {
    const k = soDigitos(l.documento)
    out.set(k, [...(out.get(k) || []), { lat: Number(l.lat), lng: Number(l.lng), nome: String(l.nome || ''), conf: 'confirmado' }])
  }
  const faltam = new Set(docs.filter((d) => !out.has(d)))
  if (faltam.size) {
    const { data: cad } = await sb.from('portal_nt_clientes_PRINCIPAL').select('cnpj_cpf, latitude, longitude, lat, lng').or('latitude.not.is.null,lat.not.is.null').limit(2000)
    for (const c of (cad || []) as Rec[]) {
      const k = soDigitos(c.cnpj_cpf)
      if (!faltam.has(k)) continue
      const lat = Number(c.latitude ?? c.lat), lng = Number(c.longitude ?? c.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) out.set(k, [{ lat, lng, nome: 'cadastro', conf: 'cadastro' }])
    }
  }
  return out
}

export async function furoKm(tecnico: string, mes: string): Promise<FuroKm | null> {
  const f = await fantasmasDoMes(mes)
  const t = f.tecnicos.find((x) => x.tecnico === tecnico)
  if (!t) return null
  // km cobrado de cada dia: o Qtd_KM de cada OS repartido pelos dias dela
  const cobradoDia = new Map<string, number>()
  for (const o of t.os) for (const d of o.dias) cobradoDia.set(d, (cobradoDia.get(d) || 0) + o.kmCobrado / Math.max(1, o.dias.length))
  const osPorId = new Map(t.os.map((o) => [o.os, o]))
  // documento do cliente de cada OS → onde ele fica
  const docDe = new Map<string, string>()
  const outros = f.tecnicos.filter((y) => y.tecnico !== tecnico)
  const ids = [...new Set([...t.os.map((o) => o.os), ...outros.flatMap((y) => y.os.map((o) => o.os))])]
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Ordem_Servico').select('Id_Ordem, Cnpj_Cliente').in('Id_Ordem', ids.slice(i, i + 200))
    for (const o of (data || []) as Rec[]) docDe.set(String(o.Id_Ordem), soDigitos(o.Cnpj_Cliente))
  }
  const locais = await locaisDosClientes([...new Set([...docDe.values()].filter(Boolean))]).catch(() => new Map<string, Loc[]>())

  const dias: DiaFuro[] = t.dias.filter((d) => d.kmCarro > 0 || d.os.length).map((d) => {
    const kmCobrado = r1(cobradoDia.get(d.data) || 0)
    return {
      data: d.data, placa: t.placas[0] || null, kmGps: r1(d.kmCarro), kmCobrado, kmRel: r1(d.kmRel), furo: r1(Math.max(0, d.kmCarro - kmCobrado)),
      saida: d.inicio, volta: d.fim, paradas: [],
      colegas: outros.flatMap((y) => (y.dias.find((z) => z.data === d.data)?.os || []).filter((os) => !d.os.includes(os)).map((os) => {
        const o = y.os.find((z) => z.os === os)
        return { tecnico: y.tecnico, semCarro: !y.placas.length, os, cliente: o?.cliente || '', kmCobrado: r1((o?.kmCobrado || 0) / Math.max(1, o?.dias.length || 1)), horasRel: r1((o?.horasRel || 0) / Math.max(1, o?.dias.length || 1)), noCliente: null }
      })),
      os: d.os.map((os) => { const o = osPorId.get(os); return { os, cliente: o?.cliente || '', kmCobrado: r1((o?.kmCobrado || 0) / Math.max(1, o?.dias.length || 1)), horasRel: r1((o?.horasRel || 0) / Math.max(1, o?.dias.length || 1)), noCliente: null } }),
    }
  })
  // paradas do carro em todos os dias com GPS
  const comGps = dias.filter((d) => d.kmGps > 0).map((d) => d.data)
  if (t.placas.length && comGps.length) {
    const variantes = [...new Set(t.placas.flatMap((p) => [p, p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p]))]
    const { data } = await sb.from('frota_paradas').select('placa, data, inicio, fim, duracao_min, latitude, longitude, classe, destino_nome, atipica')
      .in('placa', variantes).in('data', comGps).order('inicio').limit(5000)
    for (const p of (data || []) as Rec[]) {
      const d = dias.find((x) => x.data === String(p.data))
      if (!d) continue
      d.placa = placaLimpa(p.placa)
      const lat = Number(p.latitude), lng = Number(p.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const classe = String(p.classe || '')
      d.paradas.push({ inicio: String(p.inicio), fim: (p.fim as string) || null, min: Math.round(Number(p.duracao_min) || 0), lat, lng,
        onde: String(p.destino_nome || CLASSE_PARADA[classe] || 'Local sem cadastro'), classe, atipica: !!p.atipica,
        loja: classe === 'loja' || distanciaM({ lat, lng }, LOJA) <= RAIO_LOJA_M, cliente: null })
    }
  }
  // cruza parada × cliente da OS do dia
  for (const d of dias) {
    for (const o of d.os) {
      const locs = locais.get(docDe.get(o.os) || '') || []
      for (const p of d.paradas) {
        if (p.loja || p.cliente) continue
        const l = locs.find((x) => distanciaM(p, x) <= RAIO_CLIENTE_M)
        if (l) p.cliente = { os: o.os, nome: o.cliente, conf: l.conf }
      }
    }
    // OS do dia sem parada no cliente: a parada mais longa (≥ 30 min no expediente, fora da loja) é o provável cliente
    const semLugar = d.os.filter((o) => !d.paradas.some((p) => p.cliente?.os === o.os))
    if (semLugar.length === 1) {
      const cand = d.paradas.filter((p) => !p.loja && !p.cliente && minutosNoExpediente(p.inicio, p.fim, p.min) >= 30).sort((a, b) => b.min - a.min)[0]
      if (cand) cand.cliente = { os: semLugar[0].os, nome: semLugar[0].cliente, conf: 'provavel' }
    }
    // OS dos colegas no mesmo dia: o carro dele passou no cliente do colega? (levou alguém, ou foi junto)
    for (const o of d.colegas) {
      const locs = locais.get(docDe.get(o.os) || '') || []
      for (const p of d.paradas) {
        if (p.loja || p.cliente) continue
        const l = locs.find((x) => distanciaM(p, x) <= RAIO_CLIENTE_M)
        if (l) p.cliente = { os: o.os, nome: o.cliente, conf: l.conf, colega: o.tecnico }
      }
    }
    // dia sem OS dele e um só colega em OS (ex.: Fernando, que não tem carro): a parada mais longa vira o provável cliente do colega
    if (!d.os.length) {
      const sem = d.colegas.filter((o) => !d.paradas.some((p) => p.cliente?.os === o.os))
      const unico = sem.length === 1 ? sem[0] : sem.filter((o) => o.semCarro).length === 1 ? sem.find((o) => o.semCarro)! : null
      if (unico) {
        const cand = d.paradas.filter((p) => !p.loja && !p.cliente && minutosNoExpediente(p.inicio, p.fim, p.min) >= 30).sort((a, b) => b.min - a.min)[0]
        if (cand) cand.cliente = { os: unico.os, nome: unico.cliente, conf: 'provavel', colega: unico.tecnico }
      }
    }
    for (const o of [...d.os, ...d.colegas]) {
      const ps = d.paradas.filter((p) => p.cliente?.os === o.os)
      if (!ps.length) continue
      const conf = ps.some((p) => p.cliente!.conf === 'confirmado') ? 'confirmado' : ps.some((p) => p.cliente!.conf === 'cadastro') ? 'cadastro' : 'provavel'
      o.noCliente = { inicio: ps[0].inicio, fim: ps[ps.length - 1].fim, min: ps.reduce((s, p) => s + p.min, 0), conf }
    }
  }
  dias.sort((a, b) => b.furo - a.furo || b.data.localeCompare(a.data))
  return { tecnico, mes, placas: t.placas, dias, kmGps: Math.round(t.totais.kmCarro), kmCobrado: Math.round(t.totais.kmCobrado), furo: Math.max(0, Math.round(t.totais.kmCarro - t.totais.kmCobrado)) }
}

// cidade de um ponto (ORS reverse), guardada por ponto arredondado (~100 m)
const CIDADES = new Map<string, string | null>()
async function cidadeDe(lat: number, lng: number): Promise<string | null> {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (CIDADES.has(k)) return CIDADES.get(k)!
  const key = process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY || ''
  if (!key) return null
  try {
    const r = await fetch(`https://api.openrouteservice.org/geocode/reverse?api_key=${key}&point.lat=${lat}&point.lon=${lng}&size=1&layers=locality,localadmin,county`, { signal: AbortSignal.timeout(6000) })
    const j = r.ok ? await r.json() : null
    const pr = j?.features?.[0]?.properties || {}
    const nome = (pr.locality || pr.localadmin || pr.county || null) as string | null
    const uf = (pr.region_a || '') as string
    const c = nome ? `${nome}${uf ? ` - ${uf}` : ''}` : null
    CIDADES.set(k, c)
    return c
  } catch { return null }
}

/** km percorridos entre dois horários, somando os pontos do GPS */
function kmEntre(pts: { lat: number; lng: number; dt: string }[], de: number, ate: number): number {
  let m = 0, ant: { lat: number; lng: number } | null = null
  for (const p of pts) {
    const t = Date.parse(p.dt)
    if (t < de) { ant = p; continue }
    if (t > ate) break
    if (ant) { const d = distanciaM(ant, p); if (d < 20000) m += d }
    ant = p
  }
  return r1(m / 1000)
}

export interface DiaDetalhado extends DiaFuro { pontos: { lat: number; lng: number; dt: string }[]; kmFinal: number }

/** Um dia aberto no mapa: rota, paradas com cidade e os km de cada trecho. */
export async function diaDetalhado(tecnico: string, mes: string, dia: string): Promise<DiaDetalhado | null> {
  const fk = await furoKm(tecnico, mes)
  const d = fk?.dias.find((x) => x.data === dia)
  if (!d) return null
  let pontos: { lat: number; lng: number; dt: string }[] = []
  if (d.placa) {
    try { const r = await computarESalvarRota(sb, d.placa, dia); pontos = (r.pontos || []).map((p) => ({ lat: p.lat, lng: p.lng, dt: p.dt })) } catch { pontos = [] }
  }
  pontos.sort((a, b) => a.dt.localeCompare(b.dt))
  const ps = [...d.paradas].sort((a, b) => a.inicio.localeCompare(b.inicio))
  let ant = pontos.length ? Date.parse(pontos[0].dt) : 0
  for (const p of ps) {
    p.kmAntes = pontos.length ? kmEntre(pontos, ant, Date.parse(p.inicio)) : undefined
    ant = Date.parse(p.fim || p.inicio)
  }
  const kmFinal = pontos.length ? kmEntre(pontos, ant, Date.parse(pontos[pontos.length - 1].dt)) : 0
  // cidade das paradas de 5 min ou mais (até 25 por dia)
  const alvo = ps.filter((p) => p.min >= 5).slice(0, 25)
  await Promise.all(alvo.map(async (p) => { p.cidade = await cidadeDe(p.lat, p.lng) }))
  return { ...d, paradas: ps, pontos, kmFinal }
}

export interface AnaliseFuro { resumo: string; pontos: { titulo: string; km: number; dias: string[]; explicacao: string }[]; geradoEm: string }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** O Tratorilson lê os dias com furo e resume onde ele está (guardado 6 h por técnico/mês; forcar refaz). */
export async function analisarFuro(tecnico: string, mes: string, forcar = false): Promise<AnaliseFuro | null> {
  const r = await comCache(`furo-km:v3:${mes}:${tecnico}`, 6 * 3600_000, async () => {
    const fk = await furoKm(tecnico, mes)
    if (!fk) return null
    const dias = fk.dias.filter((d) => d.furo > 5).slice(0, 25)
    if (!dias.length) return { resumo: 'Não há km rodado sem cobrança neste mês.', pontos: [], geradoEm: new Date().toISOString() }
    const txt = dias.map((d) => [
      `DIA ${d.data.split('-').reverse().join('/')}: GPS ${d.kmGps} km · cobrado nas OS ${d.kmCobrado} km · relatório ${d.kmRel} km · FURO ${d.furo} km${d.saida ? ` · carro ligou ${hora(d.saida)}` : ''}${d.volta ? `, desligou ${hora(d.volta)}` : ''}`,
      `  OS do dia: ${d.os.length ? d.os.map((o) => `${o.os} (${o.cliente || 'cliente?'}, cobrou ${o.kmCobrado} km${o.noCliente ? `, carro no cliente ${hora(o.noCliente.inicio)}–${o.noCliente.fim ? hora(o.noCliente.fim) : '?'} ${o.noCliente.min} min${o.noCliente.conf === 'provavel' ? ' (provável)' : ''}` : ', carro não passou no cliente'})`).join('; ') : 'NENHUMA'}`,
      `  OS de colegas no mesmo dia: ${d.colegas.length ? d.colegas.map((o) => `${o.tecnico}${o.semCarro ? ' (sem carro)' : ''} ${o.os} (${o.cliente}${o.noCliente ? `, o carro dele passou no cliente ${o.noCliente.min} min${o.noCliente.conf === 'provavel' ? ' provável' : ''}` : ''})`).join('; ') : 'nenhuma'}`,
      `  paradas: ${d.paradas.length ? d.paradas.filter((p) => p.min >= 5).slice(0, 14).map((p) => `${hora(p.inicio)} ${p.cliente ? `cliente ${p.cliente.nome}` : p.onde} ${p.min}min${p.atipica ? ' ATÍPICA' : ''}`).join(' | ') : 'sem paradas registradas'}`,
    ].join('\n')).join('\n')
    const ia = await chamarIA({
      temperature: 0.2, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você é o Tratorilson, auditor da oficina de tratores Nova Tratores. Recebe, dia a dia, os km que o carro do mecânico rodou pelo GPS, os km cobrados nas ordens de serviço (OS) daquele dia, se o carro passou no cliente da OS (e quanto tempo ficou) e as paradas do carro. "Furo" = km rodado e não cobrado. Descubra ONDE está o furo e agrupe em poucas causas concretas, por exemplo: dias sem nenhuma OS; OS cobrando menos km do que o deslocamento até o cliente; carro que não passou no cliente da OS; dia em que ele levou ou acompanhou um colega (o km deveria estar na OS do colega); paradas fora de cliente (casa, posto, lugares sem cadastro); idas à loja/fornecedor que não são de nenhuma OS. Cite dias e lugares. Não acuse: diga o que conferir. Português do Brasil, frases curtas, sem jargão. Responda só JSON: {"resumo":"2 ou 3 frases dizendo basicamente onde foi o furo","pontos":[{"titulo":"causa curta","km":número aproximado de km dessa causa,"dias":["AAAA-MM-DD"],"explicacao":"1 ou 2 frases com o que conferir"}]} com no máximo 5 pontos, do maior para o menor.' },
        { role: 'user', content: `Mecânico: ${tecnico}\nMês: ${mes}\nTotal: GPS ${fk.kmGps} km · cobrado ${fk.kmCobrado} km · furo ${fk.furo} km\n\n${txt}` },
      ],
    })
    let j: { resumo?: string; pontos?: { titulo?: string; km?: number; dias?: string[]; explicacao?: string }[] } = {}
    try { j = JSON.parse(ia.choices?.[0]?.message?.content || '{}') } catch { j = {} }
    return {
      resumo: String(j.resumo || 'Não consegui resumir.'),
      pontos: (j.pontos || []).slice(0, 5).map((p) => ({ titulo: String(p.titulo || ''), km: Math.round(Number(p.km) || 0), dias: (p.dias || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), explicacao: String(p.explicacao || '') })),
      geradoEm: new Date().toISOString(),
    }
  }, forcar)
  return r.dados
}
