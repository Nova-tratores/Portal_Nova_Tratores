// Patrimônio Loja — busca de preço na internet (SÓ servidor): OpenAI
// Responses API com a ferramenta de busca na web, mesma OPENAI_API_KEY do
// Tratorilson. ~8 s e poucos centavos por busca; cache de 24 h por consulta
// (no processo) para não pagar duas vezes a mesma coisa.

import { lerRespostaPreco, type ResultadoPreco } from './preco'

const CACHE_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, { em: number; r: ResultadoPreco }>()

function pergunta(consulta: string): string {
  return [
    `Pesquise na web preços ATUAIS no Brasil (em R$) para este item: "${consulta}".`,
    'Procure anúncios de NOVO (lojas, Mercado Livre, Amazon, Magalu…) e de USADO (OLX, Mercado Livre usado, Enjoei…).',
    'Use só anúncios do MESMO produto ou equivalente muito próximo; ignore peças, acessórios e kits diferentes.',
    'Responda SOMENTE com JSON, sem texto fora dele:',
    '{"novo":[{"preco":0,"titulo":"","url":""}],"usado":[{"preco":0,"titulo":"","url":""}],"observacao":""}',
    'Até 5 anúncios em cada lista; "preco" é número (ex.: 295.69); "observacao" curta se algo chamar atenção (ou vazia).',
  ].join('\n')
}

export async function buscarPreco(consulta: string): Promise<ResultadoPreco> {
  const chave = consulta.trim().toLowerCase()
  const c = cache.get(chave)
  if (c && Date.now() - c.em < CACHE_MS) return c.r

  const key = process.env.OPENAI_API_KEY || ''
  if (!key) throw new Error('Busca de preço sem chave da OpenAI (OPENAI_API_KEY).')
  const model = process.env.PATRIMONIO_PRECO_MODEL || 'gpt-4o-mini'

  let ultimoErro = ''
  // 'web_search' é a ferramenta atual; 'web_search_preview' fica de reserva
  for (const tool of ['web_search', 'web_search_preview']) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 45_000)
    try {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, tools: [{ type: tool, user_location: { type: 'approximate', country: 'BR' } }], input: pergunta(consulta) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { ultimoErro = `OpenAI ${r.status}: ${String(j?.error?.message || '').slice(0, 160)}`; continue }
      const texto = ((j.output || []) as { content?: { text?: string }[] }[]).flatMap((o) => o.content || []).map((x) => x.text || '').join('\n')
      const res = lerRespostaPreco(texto, consulta)
      cache.set(chave, { em: Date.now(), r: res })
      return res
    } catch (e) {
      ultimoErro = (e as Error)?.name === 'AbortError' ? 'A busca demorou demais.' : (e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(t)
    }
  }
  throw new Error(ultimoErro || 'Não consegui buscar o preço agora.')
}
