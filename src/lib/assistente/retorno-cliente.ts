// Quando a equipe responde uma pergunta do Tratorilson (tratorilson_perguntas),
// o cliente que ficou esperando ("vou confirmar e já te retorno") recebe a
// resposta no WhatsApp: a IA redige a mensagem a partir da orientação da
// equipe (com a persona e a memória de sempre) e o portal manda pela API do
// NovaZap. Best-effort: sem NovaZap configurado (local) ou sem achar o
// contato, só informa o motivo.
import { chatwootConfigurado } from "@/lib/chatwoot/config";
import { buscarContatosPorTexto, listarConversasContato, garantirConversaContato, enviarTextoConversa } from "@/lib/chatwoot/cliente";
import { chamarIA } from "@/lib/assistente/ia";
import { PERSONA_CLIENTE_WHATSAPP } from "@/lib/assistente/conhecimento";
import { blocoMemoria } from "@/lib/assistente/memoria";
import { logTratorilson } from "@/lib/assistente/log";

export interface RetornoCliente {
  enviado: boolean;
  motivo?: string;
  texto?: string;
  conversaId?: number;
}

/** Tira as tags internas ([PERGUNTAR_EQUIPE: ...] etc.) de uma resposta da IA. */
export function limparTags(texto: string): string {
  return String(texto || "")
    .replace(/\[(PERGUNTAR_EQUIPE|CONTATO_PECAS|CONTATO_COMERCIAL|IGNORAR):[\s\S]*?\]/g, "")
    .replace(/\[(PRECISO_DE_HUMANO|AJUDA_MIDIA|FINALIZAR_CONVERSA)\]/g, "")
    .trim();
}

const digitos = (t: string | null | undefined) => String(t || "").replace(/\D/g, "");

/** Acha o contato do NovaZap pelo telefone (últimos 10 dígitos). */
async function acharContato(telefone: string): Promise<number | null> {
  const dez = digitos(telefone).slice(-10);
  if (dez.length < 8) return null;
  for (const q of [dez, dez.slice(-8)]) {
    const lista = await buscarContatosPorTexto(q).catch(() => []);
    const hit = lista.find((c) => digitos(c.phone_number).endsWith(dez));
    if (hit) return hit.id;
  }
  return null;
}

/** Redige a mensagem pro cliente com a orientação da equipe. */
export async function redigirRetorno(args: { nome: string | null; pergunta: string; contexto: string | null; respostaEquipe: string }): Promise<string> {
  const memoria = await blocoMemoria(["geral", "clientes"], "REGRAS ENSINADAS PELO DESENVOLVEDOR (memória — siga SEMPRE)").catch(() => "");
  const system =
    PERSONA_CLIENTE_WHATSAPP +
    (memoria ? `\n\n${memoria}` : "") +
    `\n\nSITUAÇÃO AGORA: numa conversa anterior você disse ao cliente${args.nome ? ` ${args.nome}` : ""} que ia confirmar com a equipe e retornar. ` +
    `O que o cliente tinha pedido: "${args.pergunta.slice(0, 400)}".` +
    (args.contexto ? ` Contexto: "${args.contexto.slice(0, 300)}".` : "") +
    `\nA EQUIPE RESPONDEU/ORIENTOU: "${args.respostaEquipe.slice(0, 1200)}".` +
    `\nEscreva AGORA a mensagem de retorno pro cliente, como continuação natural da conversa (sem se reapresentar, sem cumprimento longo, sem tags, sem dizer que "a equipe respondeu" como se fosse sistema — fale como o pós-vendas que foi verificar e voltou com a resposta). Se a orientação trouxer telefone/contato, passe ao cliente. Só a mensagem.`;
  const data = await chamarIA({ messages: [{ role: "system", content: system }, { role: "user", content: "Escreva a mensagem de retorno." }], temperature: 0.4, max_tokens: 400 });
  const texto = limparTags(String(data?.choices?.[0]?.message?.content || ""));
  if (!texto) throw new Error("IA não redigiu o retorno");
  return texto;
}

/** Manda a resposta da equipe pro cliente no WhatsApp (best-effort). */
export async function retornarAoCliente(args: { telefone: string | null; nome: string | null; pergunta: string; contexto: string | null; respostaEquipe: string; quem: string }): Promise<RetornoCliente> {
  if (!args.telefone) return { enviado: false, motivo: "pergunta sem telefone do cliente" };
  if (!chatwootConfigurado()) return { enviado: false, motivo: "NovaZap não configurado neste ambiente" };
  try {
    const contatoId = await acharContato(args.telefone);
    if (!contatoId) return { enviado: false, motivo: "contato não encontrado no NovaZap" };
    const convs = await listarConversasContato(contatoId).catch(() => []);
    const aberta = convs.find((c) => String(c.status || "") === "open");
    const conversaId = aberta ? Number(aberta.id) : await garantirConversaContato(contatoId);
    const texto = await redigirRetorno({ nome: args.nome, pergunta: args.pergunta, contexto: args.contexto, respostaEquipe: args.respostaEquipe });
    await enviarTextoConversa(conversaId, texto);
    await logTratorilson({
      userName: args.nome || args.telefone,
      tipo: "novazap:retorno",
      pergunta: `[equipe: ${args.quem}] ${args.respostaEquipe.slice(0, 300)}`,
      resposta: texto,
      modelo: "",
      tokens: 0,
    }).catch(() => {});
    return { enviado: true, texto, conversaId };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : "falha ao enviar" };
  }
}
