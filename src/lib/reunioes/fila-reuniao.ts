// REUNIÕES LIGADAS À FILA (melhorias 4.3 e 4.4, 25/11/2026) — regras puras (sem banco), testadas em
// __tests__/fila-reuniao.test.ts.

/** Horas-pessoa de uma reunião (4 pessoas × 30 min = 2 h). */
export function horasPessoa(pessoas: number, duracaoMin: number): number {
  return Math.max(0, pessoas) * Math.max(0, duracaoMin) / 60
}

/** "2 h", "1,5 h", "45 min". */
export function textoHoras(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  const r = Math.round(h * 10) / 10
  return `${String(r).replace('.', ',')} h`
}

/** "4 pessoas × 30 min = 2 h" (o custo da reunião no cartão). */
export function textoCusto(pessoas: number, duracaoMin: number): string {
  return `${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'} × ${duracaoMin} min = ${textoHoras(horasPessoa(pessoas, duracaoMin))}`
}

// ------------------------------------------------------------------ @pessoa na ata → pedidos

export interface PessoaAta { id: string; nome: string }
export interface Encaminhamento {
  /** A linha como foi escrita (para a prévia). */
  linha: string
  /** O que veio depois do @ (ex.: "Henri"). */
  mencao: string
  /** Quem foi achado. null = ninguém com esse nome, ou mais de uma pessoa (ambiguo). */
  responsavel_id: string | null
  ambiguo: boolean
  titulo: string
  /** AAAA-MM-DD; se a linha disser "até 05/12" usa essa data, senão o padrão. */
  prazo: string
  prazoDaLinha: boolean
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Soma dias corridos e pula sábado/domingo (o prazo não cai no fim de semana). */
export function prazoPadrao(hoje: string, dias = 7): string {
  const d = new Date(hoje + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** "até 05/12", "ate 5/12/2026", "prazo 05/12" no fim da linha. Ano omitido = o próximo 05/12 a partir de hoje. */
function lerPrazo(texto: string, hoje: string): { resto: string; prazo: string | null } {
  const m = texto.match(/[\s,;-]*(?:at[eé]|prazo:?)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*\.?\s*$/i)
  if (!m) return { resto: texto, prazo: null }
  const dia = Number(m[1]), mes = Number(m[2])
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return { resto: texto, prazo: null }
  let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(hoje.slice(0, 4))
  const iso = (a: number) => `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  if (!m[3] && iso(ano) < hoje) ano++
  return { resto: texto.slice(0, m.index).trim(), prazo: iso(ano) }
}

/**
 * Lê as linhas da ata que COMEÇAM com @pessoa (ex.: "@Henri trocar o fornecedor até 05/12").
 * A pessoa é achada pelo primeiro nome (sem acento/maiúscula) entre as pessoas passadas; dá para
 * desempatar com nome e sobrenome juntos por ponto ("@Henri.Souza"). Linha sem texto depois do
 * @ é ignorada.
 */
export function encaminhamentosDaAta(texto: string, pessoas: PessoaAta[], hoje: string): Encaminhamento[] {
  const out: Encaminhamento[] = []
  for (const bruta of (texto || '').split(/\r?\n/)) {
    const linha = bruta.trim().replace(/^[-*•]\s*/, '')
    const m = linha.match(/^@([\p{L}][\p{L}.'-]*)[\s:,-]+(.+)$/u)
    if (!m) continue
    const mencao = m[1].replace(/[.'-]+$/, '')
    const partes = semAcento(mencao).split('.').filter(Boolean)
    const achados = pessoas.filter((p) => {
      const nomes = semAcento(p.nome).split(/\s+/).filter(Boolean)
      // 1ª parte = primeiro nome; as outras precisam aparecer no nome, nesta ordem.
      if (nomes[0] !== partes[0]) return false
      let k = 1
      for (const parte of partes.slice(1)) { while (k < nomes.length && !nomes[k].startsWith(parte)) k++; if (k >= nomes.length) return false; k++ }
      return true
    })
    const { resto, prazo } = lerPrazo(m[2].trim(), hoje)
    const titulo = resto.replace(/\s+/g, ' ').trim()
    if (!titulo) continue
    out.push({
      linha, mencao, responsavel_id: achados.length === 1 ? achados[0].id : null, ambiguo: achados.length > 1,
      titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), prazo: prazo || prazoPadrao(hoje), prazoDaLinha: !!prazo,
    })
  }
  return out
}

/** Já virou pedido? (mesmo responsável e mesmo título, sem acento/maiúscula) — evita criar duas vezes. */
export function jaCriado(e: Pick<Encaminhamento, 'responsavel_id' | 'titulo'>, acoes: { responsavel_id: string; titulo: string }[]): boolean {
  const t = semAcento(e.titulo).trim()
  return acoes.some((a) => a.responsavel_id === e.responsavel_id && semAcento(a.titulo).trim() === t)
}
