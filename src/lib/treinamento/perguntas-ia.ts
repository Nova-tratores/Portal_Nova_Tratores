/* eslint-disable @typescript-eslint/no-explicit-any */
// TREINAMENTO — a IA sugere perguntas de prova a partir de um artigo (SERVIDOR).
// Como na base de conhecimento, a IA só RASCUNHA: quem gere a trilha revisa, corrige e salva.

import { chamarIA } from "@/lib/assistente/ia";
import { textoPlano, type Bloco } from "@/lib/conhecimento/blocos";
import { validarPergunta, type Pergunta } from "./regras";

const SISTEMA = `Você escreve perguntas de prova para treinamento interno da Nova Tratores (concessionária de tratores), em português do Brasil.
Quem responde é funcionário da loja que acabou de ler o artigo.

REGRAS
- Use SOMENTE o que está no artigo. Nada de conhecimento externo.
- Perguntas práticas, do dia a dia da tela: "o que acontece quando…", "o que é obrigatório para…", "para qual fase vai…".
- 4 opções por pergunta, uma certa, as outras plausíveis (não absurdas). Nada de "todas as anteriores".
- Frases curtas. Sem jargão de programação (nada de nome de tabela, rota ou arquivo).
- Explicação de uma frase dizendo por que a certa é a certa, com as palavras do artigo.

Responda só com JSON: {"perguntas":[{"enunciado":"…","opcoes":["…","…","…","…"],"correta":0,"explicacao":"…"}]}`;

export async function sugerirPerguntas(artigo: { id: string; titulo: string; corpo: Bloco[] }, quantas = 3): Promise<Omit<Pergunta, "id" | "trilha_id">[]> {
  const texto = textoPlano(artigo.corpo).slice(0, 12000);
  if (texto.length < 40) throw Object.assign(new Error("O artigo é curto demais para gerar perguntas."), { http: 400 });
  const r: any = await chamarIA({
    messages: [{ role: "system", content: SISTEMA }, { role: "user", content: `Quantidade: ${Math.min(8, Math.max(1, quantas))}\nArtigo: ${artigo.titulo}\n\n${texto}` }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  let json: any;
  try { json = JSON.parse(r?.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("A IA devolveu perguntas ilegíveis. Tente de novo."); }
  const out: Omit<Pergunta, "id" | "trilha_id">[] = [];
  for (const p of Array.isArray(json.perguntas) ? json.perguntas : []) {
    const { pergunta, erros } = validarPergunta({ ...p, artigo_id: artigo.id });
    if (!erros.length) out.push(pergunta);
  }
  if (!out.length) throw new Error("A IA não devolveu nenhuma pergunta válida. Tente de novo.");
  return out;
}
