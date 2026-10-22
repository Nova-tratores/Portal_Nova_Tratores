// Ajudas do relatório da OS no app dos técnicos (José, 22/10/2026) — o app chama as rotas /api/mecanicos/app/*.
//  - gpsDoDia: no dia que o técnico colocou, onde o carro dele parou (chegada/saída) e quantos km rodou.
//    O GPS ainda não é 100% confiável: é SUGESTÃO, o técnico confirma.
//  - fazendasDaOS: as localizações (fazendas) já cadastradas do cliente da OS.
//  - ditado: áudio → texto → diagnóstico e serviço realizado (IA arruma o texto).
//  - lerFoto: horímetro / chassi lidos da foto (o técnico confirma antes de usar).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { computarESalvarRota } from '@/lib/pos/rastreamento'
import { chaveNome } from '@/lib/frota/mapa-vivo'
import { localizacoesDoDocumento } from '@/lib/pos/localizacao-cliente-server'
import { distanciaM, paradasCandidatas, type ParadaGPS } from '@/lib/pos/localizacao-cliente'
import { chamarIA } from '@/lib/assistente/ia'

type Rec = Record<string, unknown>
const horaSP = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : null)

/** nome de técnico do usuário logado (mesma regra do /api/mecanicos/liga/eu e do app) */
export async function tecnicoDoUsuario(userId: string): Promise<string> {
  const { data: perm } = await sb.from('portal_permissoes').select('mecanico_tecnico_nome').eq('user_id', userId).maybeSingle()
  let nome = String((perm as Rec | null)?.mecanico_tecnico_nome || '').trim()
  if (!nome) { const { data } = await sb.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle(); nome = String((data as Rec | null)?.nome || '').trim() }
  return nome
}

async function lerOS(osId: string) {
  const { data } = await sb.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Cnpj_Cliente, Cidade_Cliente, Os_Tecnico, Os_Tecnico2').eq('Id_Ordem', osId).maybeSingle()
  return data as Rec | null
}

export async function fazendasDaOS(osId: string) {
  const os = await lerOS(osId)
  if (!os) throw new Error('OS não encontrada.')
  const { lista, semTabela } = await localizacoesDoDocumento(String(os.Cnpj_Cliente || ''))
  return {
    cidade: String(os.Cidade_Cliente || ''),
    fazendas: lista.map((l) => ({ id: l.id, nome: l.nome, lat: l.lat, lng: l.lng })),
    semTabela,
  }
}

export interface GpsDia {
  placa: string; carroDe: string; data: string
  chegada: string | null; saida: string | null; kmDia: number | null
  fazenda: { id: string; nome: string } | null
  aviso: string | null
}

export async function gpsDoDia(osId: string, data: string, tecnicoApp: string): Promise<GpsDia> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Coloque a data do dia de serviço.')
  const os = await lerOS(osId)
  if (!os) throw new Error('OS não encontrada.')
  const { data: tv } = await sb.from('tecnico_veiculos').select('tecnico_nome, placa')
  const vinc = ((tv || []) as Rec[]).filter((v) => v.placa).map((v) => ({ tecnico: String(v.tecnico_nome || ''), placa: String(v.placa) }))
  // o carro do técnico; sem carro (ex.: Fernando Leonel), o do colega da OS
  const ordem = [tecnicoApp, String(os.Os_Tecnico || ''), String(os.Os_Tecnico2 || '')].filter(Boolean)
  let carro: { tecnico: string; placa: string } | null = null
  for (const t of ordem) { carro = vinc.find((v) => chaveNome(v.tecnico) === chaveNome(t)) || null; if (carro) break }
  if (!carro) throw new Error('Nenhum carro vinculado a você nem ao colega da OS na Frota.')

  const rota = await computarESalvarRota(sb, carro.placa, data)
  const brutas: ParadaGPS[] = (rota.paradas || []).map((p) => ({
    placa: carro!.placa, tecnico: carro!.tecnico, data, inicio: p.inicio, fim: p.fim, duracaoMin: Number(p.duracao_min) || 0, lat: p.lat, lng: p.lng,
  }))
  const paradas = paradasCandidatas(brutas)
  const { lista } = await localizacoesDoDocumento(String(os.Cnpj_Cliente || '')).catch(() => ({ lista: [] as Awaited<ReturnType<typeof localizacoesDoDocumento>>['lista'] }))
  // parada numa fazenda do cliente vence; senão a mais longa do expediente
  let escolhida: ParadaGPS | null = null
  let fazenda: { id: string; nome: string } | null = null
  for (const p of paradas) {
    const f = lista.find((l) => distanciaM(l, p) < 300)
    if (f) { escolhida = p; fazenda = { id: f.id, nome: f.nome }; break }
  }
  if (!escolhida) escolhida = paradas[0] || null
  const kmDia = Number(rota.km_total) > 0 ? Math.round(Number(rota.km_total)) : null
  return {
    placa: carro.placa, carroDe: carro.tecnico, data,
    chegada: horaSP(escolhida?.inicio), saida: horaSP(escolhida?.fim), kmDia, fazenda,
    aviso: !escolhida ? (kmDia ? 'O carro andou, mas não parou 30 min ou mais fora da loja nesse dia.' : 'Sem GPS do carro nesse dia.') : null,
  }
}

// ------------------------------------------------------------ ditado (áudio → diagnóstico + serviço)
export async function transcreverArquivo(buf: ArrayBuffer, nome: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY || ''
  if (!key) throw new Error('Sem chave da OpenAI no portal.')
  const pedir = async (modelo: string) => {
    const fd = new FormData()
    fd.append('file', new Blob([buf]), nome)
    fd.append('model', modelo)
    fd.append('language', 'pt')
    fd.append('temperature', '0')
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd })
    if (!r.ok) return ''
    const j = await r.json().catch(() => ({}))
    return String((j as Rec).text || '').trim()
  }
  return (await pedir('gpt-4o-mini-transcribe')) || (await pedir('whisper-1'))
}

const PROMPT_DITADO = `Você arruma o relato falado de um mecânico de tratores (concessionária Mahindra) para o relatório da ordem de serviço.
Separe em dois campos, em português correto, frases curtas, sem inventar nada que ele não disse:
- "diagnostico": o que o equipamento tinha / o problema encontrado.
- "servico": o que foi feito para resolver.
Mantenha termos técnicos, números, peças e medidas exatamente como ditos. Se uma parte não foi dita, devolva "".
Responda só JSON: {"diagnostico": "...", "servico": "..."}`

export async function organizarDitado(texto: string, atual: { diagnostico?: string; servico?: string }) {
  const r = await chamarIA({
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PROMPT_DITADO },
      { role: 'user', content: `Já escrito no relatório (pode completar, não apague o que estiver certo):\nDiagnóstico: ${atual.diagnostico || '(vazio)'}\nServiço: ${atual.servico || '(vazio)'}\n\nO que ele falou agora:\n${texto}` },
    ],
  })
  const j = JSON.parse(String(r?.choices?.[0]?.message?.content || '{}')) as Rec
  return { diagnostico: String(j.diagnostico || '').trim(), servico: String(j.servico || '').trim() }
}

// ------------------------------------------------------------ leitura de foto
export async function lerFoto(imagem: string, tipo: 'horimetro' | 'chassi') {
  const pergunta = tipo === 'horimetro'
    ? 'Esta é a foto do painel/horímetro de um trator. Leia as HORAS do horímetro (com a casa decimal, se houver). Responda só JSON: {"valor": "1234.5" ou "", "certeza": "alta"|"media"|"baixa"}. Se não der para ler, valor "".'
    : 'Esta é a foto da plaqueta ou da gravação do CHASSI/número de série de um trator ou implemento. Leia o número de chassi completo (letras e números, sem espaços). Responda só JSON: {"valor": "MDI07513PS0006206" ou "", "certeza": "alta"|"media"|"baixa"}. Se não der para ler, valor "".'
  const r = await chamarIA({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: pergunta }, { type: 'image_url', image_url: { url: imagem, detail: 'high' } }] }],
  })
  const j = JSON.parse(String(r?.choices?.[0]?.message?.content || '{}')) as Rec
  let valor = String(j.valor || '').trim()
  if (tipo === 'chassi') valor = valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
  else valor = valor.replace(',', '.').replace(/[^\d.]/g, '')
  return { valor, certeza: String(j.certeza || 'baixa') }
}

