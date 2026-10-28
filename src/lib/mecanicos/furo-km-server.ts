// Furo de km de um mecânico no mês (José, 28/10/2026: "pegar os km rodados que não foram cobrados e, quando clicar,
// mostrar no mapa todos os pontos e as rotas não cobradas, e pedir pro Tratorilson resumir onde foi o furo") — SÓ SERVIDOR.
// Dia a dia: km do GPS (frota_dias) × km cobrado nas OS daquele dia (Qtd_KM repartido pelos dias da OS) × km do relatório,
// com as paradas classificadas do carro (frota_paradas). O Tratorilson lê os dias com furo e resume onde ele está.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { fantasmasDoMes } from './fantasmas-server'
import { comCache } from './cache'

type Rec = Record<string, unknown>
const r1 = (n: number) => Math.round(n * 10) / 10
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export const CLASSE_PARADA: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente', cliente_portal: 'Propriedade de cliente', manutencao: 'Manutenção',
  estacionamento: 'Estacionamento', descarga: 'Descarga', outro_destino: 'Destino cadastrado',
  visita: 'Visita comercial', abastecimento: 'Abastecimento', fora_geocerca: 'Fora de geocerca',
}

export interface ParadaFuro { inicio: string; fim: string | null; min: number; lat: number; lng: number; onde: string; classe: string; atipica: boolean }
export interface DiaFuro {
  data: string; placa: string | null; kmGps: number; kmCobrado: number; kmRel: number; furo: number
  os: { os: string; cliente: string }[]; paradas: ParadaFuro[]
}
export interface FuroKm { tecnico: string; mes: string; placas: string[]; dias: DiaFuro[]; kmGps: number; kmCobrado: number; furo: number }

export async function furoKm(tecnico: string, mes: string): Promise<FuroKm | null> {
  const f = await fantasmasDoMes(mes)
  const t = f.tecnicos.find((x) => x.tecnico === tecnico)
  if (!t) return null
  // km cobrado de cada dia: o Qtd_KM de cada OS repartido pelos dias dela
  const cobradoDia = new Map<string, number>()
  for (const o of t.os) for (const d of o.dias) cobradoDia.set(d, (cobradoDia.get(d) || 0) + o.kmCobrado / Math.max(1, o.dias.length))
  const cliente = new Map(t.os.map((o) => [o.os, o.cliente]))
  const dias: DiaFuro[] = t.dias.filter((d) => d.kmCarro > 0).map((d) => {
    const kmCobrado = r1(cobradoDia.get(d.data) || 0)
    return { data: d.data, placa: t.placas[0] || null, kmGps: r1(d.kmCarro), kmCobrado, kmRel: r1(d.kmRel), furo: r1(Math.max(0, d.kmCarro - kmCobrado)), os: d.os.map((os) => ({ os, cliente: cliente.get(os) || '' })), paradas: [] }
  })
  // paradas do carro nos dias com furo
  const comFuro = dias.filter((d) => d.furo > 5).map((d) => d.data)
  if (t.placas.length && comFuro.length) {
    const variantes = [...new Set(t.placas.flatMap((p) => [p, p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p]))]
    const { data } = await sb.from('frota_paradas').select('placa, data, inicio, fim, duracao_min, latitude, longitude, classe, destino_nome, atipica')
      .in('placa', variantes).in('data', comFuro).order('inicio').limit(3000)
    for (const p of (data || []) as Rec[]) {
      const d = dias.find((x) => x.data === String(p.data))
      if (!d) continue
      d.placa = placaLimpa(p.placa)
      const lat = Number(p.latitude), lng = Number(p.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      d.paradas.push({ inicio: String(p.inicio), fim: (p.fim as string) || null, min: Math.round(Number(p.duracao_min) || 0), lat, lng,
        onde: String(p.destino_nome || CLASSE_PARADA[String(p.classe)] || 'Local sem cadastro'), classe: String(p.classe || ''), atipica: !!p.atipica })
    }
  }
  dias.sort((a, b) => b.furo - a.furo || b.data.localeCompare(a.data))
  return { tecnico, mes, placas: t.placas, dias, kmGps: Math.round(t.totais.kmCarro), kmCobrado: Math.round(t.totais.kmCobrado), furo: Math.max(0, Math.round(t.totais.kmCarro - t.totais.kmCobrado)) }
}

export interface AnaliseFuro { resumo: string; pontos: { titulo: string; km: number; dias: string[]; explicacao: string }[]; geradoEm: string }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** O Tratorilson lê os dias com furo e resume onde ele está (guardado 6 h por técnico/mês; forcar refaz). */
export async function analisarFuro(tecnico: string, mes: string, forcar = false): Promise<AnaliseFuro | null> {
  const r = await comCache(`furo-km:v1:${mes}:${tecnico}`, 6 * 3600_000, async () => {
    const fk = await furoKm(tecnico, mes)
    if (!fk) return null
    const dias = fk.dias.filter((d) => d.furo > 5).slice(0, 25)
    if (!dias.length) return { resumo: 'Não há km rodado sem cobrança neste mês.', pontos: [], geradoEm: new Date().toISOString() }
    const txt = dias.map((d) => [
      `DIA ${d.data.split('-').reverse().join('/')}: GPS ${d.kmGps} km · cobrado nas OS ${d.kmCobrado} km · relatório ${d.kmRel} km · FURO ${d.furo} km`,
      `  OS do dia: ${d.os.length ? d.os.map((o) => `${o.os} (${o.cliente || 'cliente?'})`).join('; ') : 'NENHUMA'}`,
      `  paradas: ${d.paradas.length ? d.paradas.filter((p) => p.min >= 5).slice(0, 14).map((p) => `${hora(p.inicio)} ${p.onde} ${p.min}min${p.atipica ? ' ATÍPICA' : ''}`).join(' | ') : 'sem paradas registradas'}`,
    ].join('\n')).join('\n')
    const ia = await chamarIA({
      temperature: 0.2, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você é o Tratorilson, auditor da oficina de tratores Nova Tratores. Recebe, dia a dia, os km que o carro do mecânico rodou pelo GPS, os km cobrados nas ordens de serviço (OS) daquele dia e as paradas do carro (onde ficou e quanto tempo). "Furo" = km rodado e não cobrado. Descubra ONDE está o furo e agrupe em poucas causas concretas, por exemplo: dias sem nenhuma OS; OS cobrando menos km do que o deslocamento até o cliente; paradas fora de cliente (casa, posto, lugares sem cadastro); idas à loja/fornecedor que não são de nenhuma OS; deslocamento entre cidades. Cite dias e lugares. Não acuse: diga o que conferir. Português do Brasil, frases curtas, sem jargão. Responda só JSON: {"resumo":"2 ou 3 frases dizendo basicamente onde foi o furo","pontos":[{"titulo":"causa curta","km":número aproximado de km dessa causa,"dias":["AAAA-MM-DD"],"explicacao":"1 ou 2 frases com o que conferir"}]} com no máximo 5 pontos, do maior para o menor.' },
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
