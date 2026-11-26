// =============================================================================
// Robô dos posts (26/11/2026): o Claude escreve a ideia de post para uma data especial ou um dia comum (seg/qua/sex).
// José: "tem que gerar ideias para o calendário de eventos especiais". Saída num molde fixo, pronta para virar
// post "ideia" no calendário; o que for preço/condição/nome que ele não sabe vem marcado em `confirmar`.
// Estilo aprovado: cena montada com o trator real (campo `cena`, em inglês, vai para a IA de imagem) + título curto.
// =============================================================================
import Anthropic from '@anthropic-ai/sdk'
import { ETIQUETAS, type Etiqueta } from '../fotos/ia'
import type { DataAgro } from '../redes/datasAgro'

const MODELO = process.env.MARKETING_IA_MODELO || 'claude-opus-5-5'
export const WHATSAPP = '(14) 3351-6049'
/** Custo aproximado de uma ideia (Opus 5.5, ~3 mil tokens lidos e ~3 mil escritos). */
export const CUSTO_IDEIA_USD = 0.07

export type Ideia = {
  tema: string              // assunto em poucas palavras (para não repetir)
  titulo: string            // nome interno do post
  formato: 'feed' | 'reels' | 'story'
  arte_titulo: string       // texto grande da arte (até ~5 palavras)
  arte_frase: string        // frase curta embaixo
  arte_destaque: string     // pedaço EXATO da frase que vai colorido
  cena: string              // cena da imagem, em inglês, para a IA de imagem
  fotos: Etiqueta[]         // etiquetas para achar a foto base no banco
  roteiro: string[]         // reels: cenas em ordem; feed/story: vazio
  legenda: string           // pronta para colar
  hashtags: string[]
  por_que: string
  confirmar: string[]
}

const MOLDE = {
  type: 'object',
  properties: {
    tema: { type: 'string' },
    titulo: { type: 'string' },
    formato: { type: 'string', enum: ['feed', 'reels', 'story'] },
    arte_titulo: { type: 'string' },
    arte_frase: { type: 'string' },
    arte_destaque: { type: 'string' },
    cena: { type: 'string' },
    fotos: { type: 'array', items: { type: 'string', enum: [...ETIQUETAS] } },
    roteiro: { type: 'array', items: { type: 'string' } },
    legenda: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    por_que: { type: 'string' },
    confirmar: { type: 'array', items: { type: 'string' } },
  },
  required: ['tema', 'titulo', 'formato', 'arte_titulo', 'arte_frase', 'arte_destaque', 'cena', 'fotos', 'roteiro', 'legenda', 'hashtags', 'por_que', 'confirmar'],
  additionalProperties: false,
} as const

const INSTRUCOES = `Você é o redator de redes sociais da Nova Tratores, concessionária Mahindra em Piraju/SP (Vale do Paranapanema: café, milho, soja, cana, pecuária, pequenas e médias propriedades).
A Nova vende tratores e implementos Mahindra, peças, faz revisão na oficina própria, entrega técnica e consórcio. A Mahindra tem a maior garantia de trator do Brasil.
WhatsApp da Nova (use exatamente este): ${WHATSAPP}.
Público: produtor rural da região, que lê no celular, quer coisa prática e confia em quem conhece pelo nome.

Escreva UMA ideia de post pelo molde JSON.
Regras (aprovadas pela Nova, siga à risca):
- arte_titulo: até 5 palavras, forte, sem ponto final. arte_frase: uma frase curta (até 12 palavras). arte_destaque: um pedaço que aparece EXATAMENTE igual dentro da arte_frase (2 a 6 palavras).
- cena: em INGLÊS, 2 a 4 frases descrevendo o cenário realista em volta do trator, que LEMBRE o assunto do post (ex.: Dia do Solo = freshly plowed red soil with deep tire tracks; Dia do Mecânico = tractor workshop, gloved hands holding a wrench, open toolbox; Natal = warm Christmas fairy lights and a decorated pine at dusk). O trator real será mantido; descreva só o lugar, a luz e os objetos. Varie a hora do dia, o ângulo e o lugar entre posts.
- Legenda em português do Brasil, tom de conversa, frases curtas, do ponto de vista do cliente ("você", "na sua lavoura"). Sem emoji. Termine com um convite claro com o WhatsApp ${WHATSAPP}. Até 600 caracteres.
- Ligue o assunto ao que a Nova faz de verdade. Se a data não tem gancho forte com o negócio, faça um post simples e honesto, sem forçar venda.
- NUNCA invente preço, desconto, condição de pagamento, prazo, nome de cliente ou evento. Se precisar disso, escreva entre colchetes, ex.: [desconto], e liste em "confirmar". Nomes de técnicos: use só os da lista dada no pedido.
- Reels: roteiro de 4 a 7 cenas curtas que dá para gravar com celular na loja/oficina/campo. Feed e story: roteiro vazio.
- fotos: 2 a 5 etiquetas da lista para achar a foto do trator no banco.
- hashtags: 3 a 5 (ex.: #NovaTratores #Mahindra #Piraju).
- tema: o assunto em até 6 palavras. por_que: uma frase dizendo por que isso funciona para a Nova.`

/** Assuntos para os dias comuns; o robô sugere um e a IA escolhe outro se já saiu há pouco. */
export const TEMAS_DIA = [
  'dica de manutenção do trator (filtros, óleo, graxa)', 'revisão na oficina da Nova antes da safra', 'peças originais Mahindra no balcão',
  'garantia Mahindra, a maior do Brasil', 'trator certo para café e áreas estreitas', 'consórcio Mahindra como jeito de planejar a compra',
  'implementos para preparo do solo', 'economia de diesel no dia a dia', 'entrega técnica: o que o cliente aprende',
  'segurança na operação do trator', 'trator pequeno para chácara e horta', 'pulverização com regulagem certa',
  'bastidor da equipe da Nova', 'curiosidade sobre a Mahindra no mundo', 'cuidados com o trator na época de chuva',
]

let cliente: Anthropic | null = null
const ia = () => (cliente ??= new Anthropic())

async function pedir(pedido: string): Promise<Ideia> {
  const r = await ia().messages.create({
    model: MODELO,
    max_tokens: 6000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: MOLDE as unknown as Record<string, unknown> } },
    system: INSTRUCOES,
    messages: [{ role: 'user', content: pedido }],
  })
  if (r.stop_reason === 'refusal') throw new Error('a IA recusou esta ideia')
  const txt = r.content.find((b) => b.type === 'text')?.text
  if (!txt) throw new Error('a IA não respondeu')
  const j = JSON.parse(txt) as Ideia
  j.fotos = (j.fotos || []).filter((e): e is Etiqueta => (ETIQUETAS as readonly string[]).includes(e))
  if (j.arte_destaque && !j.arte_frase.includes(j.arte_destaque)) j.arte_destaque = ''
  return j
}

export type Contexto = { tecnicos?: string[]; recentes?: string[]; extra?: string }
const rodape = (c: Contexto) => [
  c.tecnicos?.length ? `Técnicos da oficina hoje: ${c.tecnicos.join(', ')}.` : '',
  c.recentes?.length ? `Posts das últimas semanas (NÃO repita assunto, título nem cena parecida): ${c.recentes.join(' | ')}` : '',
  c.extra ? `Recado da equipe: ${c.extra}` : '',
].filter(Boolean).join('\n')

/** Ideia para uma data especial do calendário do agro. */
export function ideiaParaData(data: DataAgro, c: Contexto = {}): Promise<Ideia> {
  return pedir([
    `Data: ${data.nome} (${data.d.split('-').reverse().join('/')}${data.ate ? ` a ${data.ate.split('-').reverse().join('/')}` : ''}).`,
    `Importância para a Nova: ${data.prior === 3 ? 'obrigatória' : data.prior === 2 ? 'boa' : 'opcional (só story)'}.`,
    `Formato sugerido: ${data.formato}.`,
    `Ideia anotada pelo Marketing: ${data.ideia}`,
    data.confirmar ? 'Atenção: a data ainda precisa ser confirmada; coloque isso em "confirmar".' : '',
    rodape(c),
  ].filter(Boolean).join('\n'))
}

/** Ideia para um dia comum (seg/qua/sex), sem data especial. */
export function ideiaParaDia(dia: string, temaSugerido: string, c: Contexto = {}): Promise<Ideia> {
  const sem = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
  return pedir([
    `Dia comum: ${sem}, ${dia.split('-').reverse().join('/')} (sem data comemorativa).`,
    `Assunto sugerido: ${temaSugerido}. Se esse assunto já saiu nos posts recentes, escolha outro útil para o produtor.`,
    'Formato: feed.',
    rodape(c),
  ].filter(Boolean).join('\n'))
}
