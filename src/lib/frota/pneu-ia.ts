// Conferência das fotos de pneu pela IA de visão (servidor). As regras e a
// normalização ficam em pneu-regras.ts (client-safe).
import { chamarIA } from '@/lib/assistente/ia';
import { normalizarAnalise, type AnalisePneu, type TipoFotoPneu } from './pneu-regras';

const PROMPT: Record<TipoFotoPneu, string> = {
  banda: `Você confere fotos de checklist de frota. Esta deveria ser a BANDA DE RODAGEM de um pneu de carro: a superfície que encosta no chão, com os sulcos visíveis e nítidos.
Não comprova: só a calota/roda vista de lado, pneu inteiro de longe sem sulcos visíveis, foto escura ou borrada, outra coisa.
Responda só JSON: {"comprova": true|false, "motivo": "por que não comprova, curto, em português, para o motorista refazer (null se comprova)", "desgaste": "novo"|"meia_vida"|"perto_limite"|"no_limite"|null}.
desgaste: novo = sulcos profundos; meia_vida = sulcos visíveis e rasos; perto_limite = sulcos quase no nível dos indicadores TWI; no_limite = careca/liso ou com lona aparente. null se não dá para avaliar.`,
  lateral: `Você confere fotos de checklist de frota. Esta deveria ser a LATERAL (flanco) de um pneu de carro, com a marca, o modelo e a medida legíveis (ex.: "PIRELLI CINTURATO P1 175/70 R14 84T"). O DOT (ex.: "DOT XJ 4F 2323") pode aparecer.
Comprova se pelo menos a marca OU a medida estão legíveis. Não comprova: só a calota, pneu de longe, texto ilegível, foto escura, outra coisa.
Responda só JSON: {"comprova": true|false, "motivo": "por que não comprova, curto, em português, para o motorista refazer (null se comprova)", "marca": string|null, "modelo": string|null, "medida": string|null, "dot": string|null}. Não invente: campo que não dá para ler é null.`,
};

/** Analisa a foto. Falha da IA (sem chave, fora do ar, demora) devolve null — o checklist segue. */
export async function analisarFotoPneu(buffer: Buffer, mime: string, tipo: TipoFotoPneu): Promise<AnalisePneu | null> {
  try {
    const pedido = chamarIA({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 200,
      messages: [
        { role: 'system', content: PROMPT[tipo] },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Confira esta foto.' },
            // lateral precisa ler letras pequenas; a banda basta em baixa resolução
            { type: 'image_url', image_url: { url: `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`, detail: tipo === 'lateral' ? 'high' : 'low' } },
          ],
        },
      ],
    });
    const limite = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const resposta = await Promise.race([pedido, limite]);
    const conteudo = resposta?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return normalizarAnalise(JSON.parse(conteudo), tipo);
  } catch (e) {
    console.error('[checklist] IA do pneu falhou', e instanceof Error ? e.message : e);
    return null;
  }
}
