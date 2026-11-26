// =============================================================================
// Cena do post (26/11/2026, estilo aprovado pelo José: "Agora sim"). Pega a foto REAL de um trator (banco de fotos)
// e pede à OpenAI (images/edits, gpt-image-2) para montar o cenário em volta dele, mantendo o trator igual.
// A IA de texto (Claude) escreve a cena em inglês no campo `cena` da ideia; aqui só se junta com as regras fixas.
// Usa OPENAI_API_KEY (a mesma do Assistente). ~30 s e alguns centavos por cena.
// =============================================================================
import sharp from 'sharp'

const MODELO = process.env.MARKETING_IMAGEM_MODELO || 'gpt-image-2'
/** Custo aproximado por cena (1024x1536, medium), para o caderno do robô. */
export const CUSTO_CENA_USD = 0.06

const REGRAS = [
  'Realistic photograph, natural light, high detail, looks like a real photo taken in the countryside of São Paulo state, Brazil.',
  'Keep this exact Mahindra tractor unchanged: same shape, red and black colors, logos, model badges, cab and tires. Do not redraw or restyle the tractor.',
  // teste de 26/11: a IA trocou o "2025" do capô por "2030" e escreveu "Malnbre" nas caixas
  'Do NOT change, add or invent any numbers, model names or letters on the tractor: copy its badges exactly as they are. Any boxes, signs or objects in the scene must be plain, without printed words or logos.',
  'Place the tractor in the LOWER HALF of the image. The upper third must be calm and simple (sky, wall or soft background) because text will be written there.',
  'No text, no letters, no watermarks. No recognizable faces; hands or people seen from behind are fine.',
].join(' ')

export const imagemPronta = () => !!process.env.OPENAI_API_KEY

/** Monta a cena. `trator` = bytes da foto (qualquer formato); devolve PNG 1024x1536. */
export async function montarCena(trator: Buffer, cena: string): Promise<Buffer> {
  if (!imagemPronta()) throw new Error('IA de imagem não configurada (OPENAI_API_KEY)')
  // a OpenAI pede PNG até 4 MB (e quadrado ou retrato funciona bem): normaliza aqui
  const png = await sharp(trator, { failOn: 'none' }).rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const fd = new FormData()
  fd.append('model', MODELO)
  fd.append('size', '1024x1536')
  fd.append('quality', 'medium')
  fd.append('prompt', `${cena.trim()}\n\n${REGRAS}`)
  fd.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'trator.png')
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(180_000),
  })
  const j = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } }
  const b64 = j.data?.[0]?.b64_json
  if (!r.ok || !b64) throw new Error(`IA de imagem: ${j.error?.message || `HTTP ${r.status}`}`)
  return Buffer.from(b64, 'base64')
}
