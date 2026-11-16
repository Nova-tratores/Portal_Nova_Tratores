// Redes da Nova Tratores controladas pelo módulo Site (José, 12/11/2026): site, Instagram, Facebook, TikTok, YouTube Shorts.
// Uma fonte só para nome, cor, ícone, o que cada rede aceita e o tamanho ideal das artes.

export type RedeId = 'site' | 'instagram' | 'facebook' | 'tiktok' | 'youtube'
export type Arte = 'site' | 'feed' | 'vertical' | 'video'

export type Rede = {
  id: RedeId; nome: string; cor: string; icone: string
  /** Artes que a rede usa (a primeira que existir é a usada). */
  artes: Arte[]
  /** Só aceita vídeo (TikTok, Shorts). */
  soVideo: boolean
  /** Tamanho máximo do texto do post. */
  limite: number
  /** Como sai daqui: automático (pela conta ligada) ou pelo celular em 1 clique (até a aprovação da rede sair). */
  envio: 'site' | 'automatico' | 'celular'
}

export const REDES: Rede[] = [
  { id: 'site', nome: 'Site', cor: '#d97706', icone: 'fa-solid fa-globe', artes: ['site'], soVideo: false, limite: 240, envio: 'site' },
  { id: 'instagram', nome: 'Instagram', cor: '#c13584', icone: 'fa-brands fa-instagram', artes: ['feed', 'vertical', 'video'], soVideo: false, limite: 2200, envio: 'automatico' },
  { id: 'facebook', nome: 'Facebook', cor: '#1877f2', icone: 'fa-brands fa-facebook', artes: ['feed', 'vertical', 'video'], soVideo: false, limite: 5000, envio: 'automatico' },
  { id: 'tiktok', nome: 'TikTok', cor: '#111111', icone: 'fa-brands fa-tiktok', artes: ['video'], soVideo: true, limite: 2200, envio: 'celular' },
  { id: 'youtube', nome: 'YouTube Shorts', cor: '#ff0000', icone: 'fa-brands fa-youtube', artes: ['video'], soVideo: true, limite: 100, envio: 'celular' },
]
export const REDE = Object.fromEntries(REDES.map((r) => [r.id, r])) as Record<RedeId, Rede>
export const ehRede = (x: unknown): x is RedeId => typeof x === 'string' && x in REDE

export const ARTES: Record<Arte, { nome: string; w: number; h: number; ajuda: string }> = {
  site: { nome: 'Site (computador)', w: 1920, h: 640, ajuda: 'Deitada, 3 por 1. Quadro da página inicial.' },
  feed: { nome: 'Feed', w: 1080, h: 1350, ajuda: 'Em pé 4 por 5. Feed do Instagram e do Facebook.' },
  vertical: { nome: 'Em pé (story)', w: 1080, h: 1920, ajuda: 'Tela cheia do celular. Stories do Insta e do Face.' },
  video: { nome: 'Vídeo em pé', w: 1080, h: 1920, ajuda: 'MP4 em pé, até 60 s. TikTok, Shorts e Reels.' },
}

export type Midia = Partial<Record<Arte, string | null>>

/** O que falta para o post sair em cada rede escolhida (vazio = pronto). */
export function faltas(redes: RedeId[], midia: Midia): { rede: RedeId; falta: string }[] {
  const out: { rede: RedeId; falta: string }[] = []
  for (const id of redes) {
    const r = REDE[id]
    if (!r || r.artes.some((a) => midia[a])) continue
    out.push({ rede: id, falta: r.soVideo ? 'só aceita vídeo: envie o vídeo em pé' : `envie a arte ${r.artes.map((a) => ARTES[a].nome.toLowerCase()).join(' ou ')}` })
  }
  return out
}

export const STATUS_POST = {
  ideia: { nome: 'Ideia', cor: '#64748b', icone: 'fa-lightbulb' },
  pronto: { nome: 'Pronto', cor: '#0284c7', icone: 'fa-circle-check' },
  agendado: { nome: 'Agendado', cor: '#7c3aed', icone: 'fa-clock' },
  publicado: { nome: 'Publicado', cor: '#16a34a', icone: 'fa-paper-plane' },
  parcial: { nome: 'Saiu em parte', cor: '#d97706', icone: 'fa-triangle-exclamation' },
  erro: { nome: 'Deu erro', cor: '#dc2626', icone: 'fa-circle-exclamation' },
} as const
export type StatusPost = keyof typeof STATUS_POST
