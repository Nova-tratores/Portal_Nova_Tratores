// Casca do "Como deixar esta visita melhor?": chama o Claude (Messages API) com
// saída estruturada e limpa o resultado (regras em orientar-visita.ts).
// Chave: ANTHROPIC_API_KEY. Sem ela a rota responde 503 e o app esconde o botão.
import Anthropic from '@anthropic-ai/sdk';
import { INSTRUCOES, esquemaOrientacao, limparOrientacao, montarEntrada, type Orientacao, type VisitaParaOrientar } from './orientar-visita';

export const MODELO_ORIENTAR = process.env.VENDAS_IA_MODELO || 'claude-opus-5-5';

let cliente: Anthropic | null = null;
export function iaConfigurada() { return !!process.env.ANTHROPIC_API_KEY; }

// Freio por vendedor: 40 pedidos por hora (o botão é manual; isso só segura abuso).
const usos = new Map<string, number[]>();
export function dentroDoLimite(quem: string, agora = Date.now(), max = 40): boolean {
  const janela = (usos.get(quem) || []).filter((t) => agora - t < 3600000);
  if (janela.length >= max) { usos.set(quem, janela); return false; }
  janela.push(agora);
  usos.set(quem, janela);
  return true;
}

export class IaRecusou extends Error {}

export async function orientarVisita(v: VisitaParaOrientar): Promise<{ orientacao: Orientacao; modelo: string; tokens: { entrada: number; saida: number } }> {
  if (!cliente) cliente = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const resp = await cliente.beta.messages.create({
    model: MODELO_ORIENTAR,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquemaOrientacao() } },
    system: INSTRUCOES,
    messages: [{ role: 'user', content: montarEntrada(v) }],
  });
  if (resp.stop_reason === 'refusal') throw new IaRecusou('A IA não leu esta visita.');
  const txt = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let bruto: unknown = {};
  try { bruto = JSON.parse(txt); } catch { bruto = {}; }
  return { orientacao: limparOrientacao(bruto), modelo: resp.model, tokens: { entrada: resp.usage.input_tokens, saida: resp.usage.output_tokens } };
}
