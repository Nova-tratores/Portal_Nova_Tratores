// Casca da leitura do resumo da visita com IA: chama o Claude (Messages API) com
// saída estruturada e limpa o resultado (regras em analise-ia.ts).
// Chave: ANTHROPIC_API_KEY. Sem ela a rota responde 503 e o app segue só com as regras.
import Anthropic from '@anthropic-ai/sdk';
import { INSTRUCOES, esquemaResposta, limparResultado, montarEntrada, type ContextoAnalise, type ResultadoIA } from './analise-ia';

export const MODELO_ANALISE = process.env.VENDAS_IA_MODELO || 'claude-opus-5-5';

let cliente: Anthropic | null = null;
export function iaConfigurada() { return !!process.env.ANTHROPIC_API_KEY; }

// Freio por vendedor: 40 leituras por hora (o botão é manual; isso só segura abuso).
const usos = new Map<string, number[]>();
export function dentroDoLimite(quem: string, agora = Date.now(), max = 40): boolean {
  const janela = (usos.get(quem) || []).filter((t) => agora - t < 3600000);
  if (janela.length >= max) { usos.set(quem, janela); return false; }
  janela.push(agora);
  usos.set(quem, janela);
  return true;
}

export class IaRecusou extends Error {}

export async function analisarComIA(ctx: ContextoAnalise): Promise<{ resultado: ResultadoIA; modelo: string; tokens: { entrada: number; saida: number } }> {
  if (!cliente) cliente = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const resp = await cliente.beta.messages.create({
    model: MODELO_ANALISE,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquemaResposta(ctx.listas) } },
    system: INSTRUCOES,
    messages: [{ role: 'user', content: montarEntrada(ctx) }],
  });
  if (resp.stop_reason === 'refusal') throw new IaRecusou('A IA não leu este resumo.');
  const textoResp = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let bruto: unknown = {};
  try { bruto = JSON.parse(textoResp); } catch { bruto = {}; }
  return {
    resultado: limparResultado(bruto, ctx),
    modelo: resp.model,
    tokens: { entrada: resp.usage.input_tokens, saida: resp.usage.output_tokens },
  };
}
