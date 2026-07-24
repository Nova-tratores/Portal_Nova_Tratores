// =============================================================================
// AUTOMAÇÕES DE OCORRÊNCIA DA FROTA (server-side).
//
// - detectarExcessoVelocidade: roda DENTRO do cron fechar-dia (única hora em
//   que os fixes com velocidade+coordenada estão em memória — o cache
//   rotas_vendedor.pontos é podado após 90 dias). Threshold 115 km/h com
//   mínimo de 2 fixes consecutivos (~1 min sustentado): 110 é o teto legal
//   de rodovia + ~5% de margem de GPS; 2 fixes cortam spike isolado.
//   UMA ocorrência por dia por placa, consolidando os episódios.
// - resolverTecnicoNome: converte o nome vindo da frota/requisição pro nome
//   oficial do técnico (portal_permissoes.mecanico_tecnico_nome) por match
//   de palavras — sem isso o aviso vermelho não chega no Meu Painel/app.
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarOcorrencia } from './registrar'

export const LIMIAR_VELOCIDADE = 115
const MIN_FIXES_CONSECUTIVOS = 2

const palavras = (s: string): string[] =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[A-Z0-9]+/g) ?? []

/**
 * Nome da frota → nome oficial do técnico no portal (se casar). Não casou,
 * devolve o original (a ocorrência ainda registra; painel/RH veem — só o
 * Meu Painel/app do técnico dependem do nome bater).
 */
export async function resolverTecnicoNome(
  supa: SupabaseClient,
  nome: string,
): Promise<{ nome: string; casou: boolean }> {
  const alvo = palavras(nome)
  if (alvo.length === 0) return { nome, casou: false }
  const { data } = await supa
    .from('portal_permissoes')
    .select('mecanico_tecnico_nome')
    .not('mecanico_tecnico_nome', 'is', null)
  for (const r of data || []) {
    const cand = palavras(String(r.mecanico_tecnico_nome))
    if (cand.length === 0) continue
    if (alvo.every(w => cand.includes(w)) || cand.every(w => alvo.includes(w))) {
      return { nome: String(r.mecanico_tecnico_nome), casou: true }
    }
  }
  return { nome, casou: false }
}

export interface PontoRotaVel {
  lat: number
  lng: number
  dt: string
  vel: number
}

interface EpisodioVel {
  inicio: string
  fim: string
  vel_max: number
  lat: number
  lng: number
  maps_url: string
}

/** Agrupa fixes contíguos acima do limiar em episódios (2+ abaixo encerram). */
export function extrairEpisodios(pontos: PontoRotaVel[]): EpisodioVel[] {
  const episodios: EpisodioVel[] = []
  let atual: PontoRotaVel[] = []
  let abaixoSeguidos = 0
  const fecha = () => {
    if (atual.length >= MIN_FIXES_CONSECUTIVOS) {
      const pico = atual.reduce((a, b) => (b.vel > a.vel ? b : a))
      episodios.push({
        inicio: atual[0].dt,
        fim: atual[atual.length - 1].dt,
        vel_max: Math.round(pico.vel),
        lat: pico.lat,
        lng: pico.lng,
        maps_url: `https://www.google.com/maps?q=${pico.lat},${pico.lng}`,
      })
    }
    atual = []
  }
  for (const p of pontos) {
    if ((p.vel || 0) >= LIMIAR_VELOCIDADE) {
      atual.push(p)
      abaixoSeguidos = 0
    } else if (atual.length > 0) {
      abaixoSeguidos++
      if (abaixoSeguidos >= 2) { fecha(); abaixoSeguidos = 0 }
    }
  }
  fecha()
  return episodios
}

const horaBR = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * Detector chamado pelo fechar-dia por placa/dia. Retorna o que aconteceu
 * pro resumo do cron. Sem responsável → NÃO cria (vai pro resumo).
 */
export async function detectarExcessoVelocidade(
  supa: SupabaseClient,
  args: { placa: string; dia: string; pontos: PontoRotaVel[]; responsavel: string | null },
): Promise<{ criada: boolean; episodios: number; semResponsavel: boolean }> {
  const episodios = extrairEpisodios(args.pontos || [])
  if (episodios.length === 0) return { criada: false, episodios: 0, semResponsavel: false }
  if (!args.responsavel) return { criada: false, episodios: episodios.length, semResponsavel: true }

  const { nome } = await resolverTecnicoNome(supa, args.responsavel)
  const pico = episodios.reduce((a, b) => (b.vel_max > a.vel_max ? b : a))
  const obs =
    `Excesso de velocidade (${args.placa}): pico ${pico.vel_max} km/h às ${horaBR(pico.inicio)}. ` +
    `${episodios.length} episódio(s) acima de ${LIMIAR_VELOCIDADE} km/h sustentados. ` +
    `Mapa: ${pico.maps_url}`

  const r = await registrarOcorrencia(supa, {
    tecnico_nome: nome,
    categoria: 'frota',
    subcategoria: 'excesso_velocidade',
    observacao: obs,
    origem: 'auto',
    auto_chave: `vel:${args.placa}:${args.dia}`,
    data: args.dia,
    detalhes: { placa: args.placa, limiar: LIMIAR_VELOCIDADE, maps_url: pico.maps_url, episodios },
    criado_por: 'sistema',
  })
  return { criada: r.inseriu, episodios: episodios.length, semResponsavel: false }
}
