// Quando a OS pode ir ao Omie (José, 13/10/2026): em QUALQUER fase, desde que a
// "Solicitação do cliente" e o "Serviço Realizado" estejam preenchidos no texto
// da OS (modelo TEXT_TEMPLATE). Usada pela tela e pela rota (que lê o salvo).

const ROTULO = /^\s*(modelo|chassis?|hor[ií]metro|solicita[çc][ãa]o do cliente|servi[çc]o realizado)\s*:/i;

/** Conteúdo depois de "<rótulo>:" até o próximo rótulo conhecido (aceita várias linhas). */
function trecho(texto: string, rotulo: RegExp): string {
  const linhas = String(texto || "").replace(/\r\n/g, "\n").split("\n");
  const i = linhas.findIndex((l) => rotulo.test(l));
  if (i < 0) return "";
  const partes = [linhas[i].split(":").slice(1).join(":")];
  for (let j = i + 1; j < linhas.length && !ROTULO.test(linhas[j]); j++) partes.push(linhas[j]);
  return partes.join("\n").trim();
}

export function camposEnvioOmie(texto: string | null | undefined) {
  const t = String(texto || "");
  return {
    solicitacao: trecho(t, /^\s*solicita[çc][ãa]o do cliente\s*:/i),
    servicoRealizado: trecho(t, /^\s*servi[çc]o realizado\s*:/i),
  };
}

/** O que falta para liberar o envio ao Omie ([] = pode enviar). */
export function faltaParaEnviarOmie(texto: string | null | undefined): string[] {
  const c = camposEnvioOmie(texto);
  const falta: string[] = [];
  if (!c.solicitacao) falta.push("Solicitação do cliente");
  if (!c.servicoRealizado) falta.push("Serviço Realizado");
  return falta;
}
