// GRAVAÇÕES das reuniões no Storage do Supabase (José, 17/11/2026: "vamos de Supabase", para centralizar).
// Bucket PRIVADO `reunioes-gravacoes` (criado sozinho na 1ª gravação). O vídeo sobe direto do navegador do PC
// da sala por URL assinada — não passa pelo banco nem pelo servidor do portal. A lista de partes fica em
// tickets.payload.gravacoes. Guardadas 60 dias: o robô `reunioes-gravacoes-limpar` (agendador, diário) apaga.
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const BUCKET_GRAVACOES = 'reunioes-gravacoes'
export const DIAS_GUARDA = 60

/** Quem vê a gravação (José, 17/11/2026): 'participantes' (padrão) ou 'todos' (quem abre a reunião). Escolhida depois de fechar a reunião. */
export type VisibilidadeGravacao = 'participantes' | 'todos'
export function visibilidadeGravacao(payload: unknown): VisibilidadeGravacao {
  return (payload as { gravacao_visibilidade?: string } | null)?.gravacao_visibilidade === 'todos' ? 'todos' : 'participantes'
}
/** Pode tocar/baixar: 'todos' = quem já pode ver a reunião; 'participantes' = presença, quem criou, conduz ou admin. */
export function podeVerGravacao(vis: VisibilidadeGravacao, o: { participa: boolean; criador: boolean; conduz: boolean; admin: boolean }): boolean {
  return vis === 'todos' || o.participa || o.criador || o.conduz || o.admin
}

export interface GravacaoParte { key: string; inicio: string; fim: string; bytes: number; parte: number; por: string }

let bucketOk = false
/** Cria o bucket privado se ainda não existe (uma vez por processo). */
export async function garantirBucket() {
  if (bucketOk) return
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET_GRAVACOES)
  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET_GRAVACOES, { public: false, fileSizeLimit: '100MB', allowedMimeTypes: ['video/webm'] })
    if (error && !/exist/i.test(error.message)) throw new Error(`Não deu para criar o espaço das gravações: ${error.message}`)
  }
  bucketOk = true
}

/** Caminho no bucket: <id da reunião>/<AAAAMMDD-HHMMSS>-parte<N>.webm */
export function chaveGravacao(reuniaoId: string, inicioISO: string, parte: number) {
  const t = inicioISO.replace(/[:-]|\.\d{3}Z?/g, '').replace('T', '-').slice(0, 15)
  return `${reuniaoId}/${t}-parte${parte}.webm`
}

/** Apaga do bucket e da lista as partes com mais de 60 dias. Roda pelo agendador, uma vez por dia. */
export async function limparGravacoesAntigas(agora = new Date()): Promise<{ reunioes: number; apagadas: number; bytes: number }> {
  const limite = new Date(agora.getTime() - DIAS_GUARDA * 86400_000).toISOString()
  const { data, error } = await supabaseAdmin.from('tickets').select('id, payload').eq('tipo', 'reuniao').not('payload->gravacoes', 'is', null).limit(1000)
  if (error) throw new Error(error.message)
  let reunioes = 0, apagadas = 0, bytes = 0
  for (const t of (data || []) as { id: string; payload: Record<string, unknown> | null }[]) {
    const lista = ((t.payload?.gravacoes as GravacaoParte[]) || [])
    const velhas = lista.filter((g) => (g.inicio || '') < limite)
    if (!velhas.length) continue
    const { error: e1 } = await supabaseAdmin.storage.from(BUCKET_GRAVACOES).remove(velhas.map((g) => g.key))
    if (e1) throw new Error(`Reunião ${t.id}: ${e1.message}`)
    // relê o payload na hora para não apagar a ata que alguém esteja escrevendo
    const { data: atual } = await supabaseAdmin.from('tickets').select('payload').eq('id', t.id).single()
    const payload = { ...((atual?.payload as Record<string, unknown>) || {}) }
    payload.gravacoes = ((payload.gravacoes as GravacaoParte[]) || []).filter((g) => (g.inicio || '') >= limite)
    await supabaseAdmin.from('tickets').update({ payload }).eq('id', t.id)
    reunioes++; apagadas += velhas.length; bytes += velhas.reduce((s, g) => s + (g.bytes || 0), 0)
  }
  return { reunioes, apagadas, bytes }
}
