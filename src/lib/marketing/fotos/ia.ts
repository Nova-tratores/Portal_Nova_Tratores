// =============================================================================
// Banco de fotos (26/11/2026): o Claude olha a foto e devolve descrição, etiquetas, modelo do trator e nota.
// Usa ANTHROPIC_API_KEY (espaço de trabalho "Portal" no Console da Anthropic, com limite de gasto próprio).
// As etiquetas vêm de uma lista fixa: assim a busca "trator + plantio" acha a mesma coisa sempre.
// =============================================================================
import Anthropic from '@anthropic-ai/sdk'

const MODELO = process.env.MARKETING_IA_MODELO || 'claude-opus-5-5'

/** Etiquetas que a IA pode usar (e a tela mostra como filtro). Mudar aqui muda a lista toda. */
export const ETIQUETAS = [
  'trator', 'colheitadeira', 'implemento', 'trator pequeno', 'trator grande',
  'plantio', 'colheita', 'preparo do solo', 'pulverização', 'transporte', 'pecuária', 'trabalho em campo',
  'lavoura', 'pasto', 'café', 'cana', 'soja', 'milho', 'pomar', 'horta',
  'pessoa', 'família', 'mulher no campo', 'cliente', 'equipe Nova',
  'close na marca', 'cabine', 'detalhe', 'motor', 'pneu',
  'pôr do sol', 'amanhecer', 'céu azul', 'chuva', 'poeira',
  'entrega', 'pátio', 'oficina', 'feira', 'loja',
] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export type Leitura = {
  serve: boolean          // boa para post? (nítida, sem letreiro por cima, bem iluminada)
  motivo: string          // por que não serve (vazio quando serve)
  descricao: string
  etiquetas: Etiqueta[]
  modelo: string | null   // só quando dá para LER na foto
  nota: number            // 1 a 5
}

const MOLDE = {
  type: 'object',
  properties: {
    serve: { type: 'boolean' },
    motivo: { type: 'string' },
    descricao: { type: 'string' },
    etiquetas: { type: 'array', items: { type: 'string', enum: [...ETIQUETAS] } },
    modelo: { type: ['string', 'null'] },
    nota: { type: 'integer', enum: [1, 2, 3, 4, 5] },
  },
  required: ['serve', 'motivo', 'descricao', 'etiquetas', 'modelo', 'nota'],
  additionalProperties: false,
} as const

const INSTRUCOES = `Você organiza o banco de fotos do Marketing da Nova Tratores, concessionária Mahindra em Piraju/SP.
Olhe a foto e responda só pelo molde JSON:
- serve: true se a foto pode ir num post de Instagram/Facebook. false se estiver borrada, tremida, escura demais, cortada no meio da cena, com letreiro/legenda/logo de vídeo grande por cima, ou se for tela preta/transição.
- motivo: quando serve=false, diga em poucas palavras o porquê. Quando serve=true, deixe vazio.
- descricao: uma frase curta em português do Brasil, do que aparece (ex.: "Trator Mahindra vermelho plantando soja ao entardecer").
- etiquetas: de 2 a 8, só da lista permitida, só o que aparece de verdade.
- modelo: o modelo do trator SOMENTE se dá para ler na lateral ou no capô (ex.: "Mahindra 6075"). Se não der para ler, null. Nunca adivinhe.
- nota: 1 a 5 para a beleza da foto como post (5 = foto de capa).`

let cliente: Anthropic | null = null
const ia = () => (cliente ??= new Anthropic())

export const iaPronta = () => !!process.env.ANTHROPIC_API_KEY

/** Foto pela URL pública ou pelos bytes (JPEG). Bytes servem para ler o quadro do vídeo ANTES de guardar. */
export type FotoParaLer = { url: string } | { jpeg: Buffer }

/** Lê uma foto. Lança erro se a IA não responder no molde. */
export async function lerFoto(foto: FotoParaLer): Promise<Leitura> {
  const source = 'url' in foto
    ? { type: 'url' as const, url: foto.url }
    : { type: 'base64' as const, media_type: 'image/jpeg' as const, data: foto.jpeg.toString('base64') }
  const r = await ia().messages.create({
    model: MODELO,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: MOLDE as unknown as Record<string, unknown> } },
    system: INSTRUCOES,
    messages: [{ role: 'user', content: [
      { type: 'image', source },
      { type: 'text', text: 'Leia esta foto.' },
    ] }],
  })
  if (r.stop_reason === 'refusal') throw new Error('a IA recusou ler esta foto')
  const txt = r.content.find((b) => b.type === 'text')?.text
  if (!txt) throw new Error('a IA não respondeu')
  const j = JSON.parse(txt) as Leitura
  return {
    serve: !!j.serve,
    motivo: String(j.motivo || '').slice(0, 200),
    descricao: String(j.descricao || '').slice(0, 300),
    etiquetas: [...new Set((j.etiquetas || []).filter((e): e is Etiqueta => (ETIQUETAS as readonly string[]).includes(e)))].slice(0, 8),
    modelo: j.modelo ? String(j.modelo).slice(0, 60) : null,
    nota: Math.min(5, Math.max(1, Math.round(Number(j.nota) || 3))),
  }
}
