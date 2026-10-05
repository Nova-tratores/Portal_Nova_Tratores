/* eslint-disable @typescript-eslint/no-explicit-any */
// BASE DE CONHECIMENTO — rascunho de artigo por IA (SERVIDOR).
// A IA só RASCUNHA: o resultado entra como rascunho e precisa da aprovação do
// responsável do módulo para aparecer para alguém. O que ela devolve passa pelo
// mesmo `validarConteudo` do editor (limites, tipos de bloco, URL segura).

import { chamarIA } from "@/lib/assistente/ia";
import { validarConteudo, type Conteudo } from "./artigos";

const SISTEMA = `Você escreve artigos de ajuda para o portal interno da Nova Tratores (concessionária de tratores), em português do Brasil.
Quem lê é funcionário da loja usando a tela, não programador.

REGRAS
- Use SOMENTE o que está no material recebido. Não invente botão, campo, prazo, regra nem valor. Se o material não diz, não escreva.
- Frases curtas, voz ativa, uma ideia por frase. Sem jargão de programação (nada de nome de tabela, rota, função ou arquivo).
- Chame botões, campos e fases pelo nome exato que aparece na tela, em **negrito**.
- Quando houver sequência de ações, use o bloco "passos". Quando houver lista de regras, use "lista". Alerta importante vai em "aviso".
- Não repita o título dentro do corpo. Não escreva introdução nem conclusão genéricas.

FORMATO: responda só com JSON, neste formato:
{
  "titulo": "até 80 caracteres, diz o que a pessoa vai conseguir fazer ou entender",
  "resumo": "uma frase, até 200 caracteres",
  "corpo": [
    {"tipo":"p","texto":"..."},
    {"tipo":"titulo","texto":"..."},
    {"tipo":"lista","itens":[{"texto":"...","sub":["..."]}],"ordenada":false},
    {"tipo":"passos","itens":[{"titulo":"...","texto":"...","dica":"..."}]},
    {"tipo":"tabela","colunas":["..."],"linhas":[["..."]]},
    {"tipo":"aviso","texto":"...","tom":"info|atencao|perigo"},
    {"tipo":"termos","itens":[{"termo":"...","definicao":"..."}]}
  ]
}
Use só os tipos de bloco de que o conteúdo precisar.`;

export async function rascunharComIA(entrada: { material: string; titulo?: string; tela?: string; instrucao?: string }): Promise<{ conteudo: Conteudo; erros: string[] }> {
  const material = (entrada.material || "").trim().slice(0, 24000);
  if (material.length < 40) throw Object.assign(new Error("Cole pelo menos algumas linhas de material para a IA rascunhar."), { http: 400 });

  const usuario = [
    entrada.titulo ? `Assunto do artigo: ${entrada.titulo}` : "",
    entrada.tela ? `Tela do portal: ${entrada.tela}` : "",
    entrada.instrucao ? `Pedido de quem está escrevendo: ${entrada.instrucao.slice(0, 600)}` : "",
    "MATERIAL (única fonte permitida):",
    material,
  ].filter(Boolean).join("\n\n");

  const r: any = await chamarIA({
    messages: [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const texto = r?.choices?.[0]?.message?.content || "";
  let json: unknown;
  try { json = JSON.parse(texto); } catch { throw new Error("A IA devolveu um rascunho ilegível. Tente de novo."); }

  const { conteudo, erros } = validarConteudo({ ...(json as object), telas: entrada.tela ? [entrada.tela] : [], tipo: "tela" });
  return { conteudo, erros };
}
