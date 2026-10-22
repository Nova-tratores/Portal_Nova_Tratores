// Regras PURAS do espelho produtos_caracteristicas: o que gravar e o que apagar.
// Antes, todo sync apagava as ~10 mil linhas e reinseria tudo, embora de um dia para o
// outro mudassem poucas dezenas (~300 mil gravações/mês à toa). Agora só vai ao banco
// o que é novo, mudou ou saiu.

export interface LinhaEspelho {
  conta_omie: string;
  codigo_produto: number | string;
  codigo: string | null;
  descricao: string | null;
  caracteristicas: Record<string, string>;
}

/** Texto estável da linha (ordem das características não importa). */
export function assinaturaLinha(l: Pick<LinhaEspelho, 'codigo' | 'descricao' | 'caracteristicas'>): string {
  const car = l.caracteristicas || {};
  const ordenadas = Object.keys(car).sort().map((k) => [k, String(car[k] ?? '')]);
  return JSON.stringify([l.codigo ?? null, l.descricao ?? null, ordenadas]);
}

export const idLinha = (l: Pick<LinhaEspelho, 'codigo_produto'>) => String(l.codigo_produto);

export interface PlanoEspelho<T extends LinhaEspelho> {
  gravar: T[];          // novas + alteradas
  apagar: string[];     // codigo_produto a remover
  novas: number;
  alteradas: number;
  iguais: number;
}

/**
 * completo: `novas` é o retrato inteiro da conta — o que está no espelho e não veio sai.
 * incremental: `novas` são só os produtos alterados que continuam elegíveis; `removerIds`
 * são os alterados que deixaram de ser peça/ficaram inativos (saem se estiverem no espelho).
 * Produto EXCLUÍDO da Omie não aparece no incremental — o completo semanal limpa.
 */
export function planejarEspelho<T extends LinhaEspelho>(
  novas: T[],
  existentes: LinhaEspelho[],
  modo: 'completo' | 'incremental',
  removerIds: string[] = [],
): PlanoEspelho<T> {
  const atual = new Map(existentes.map((e) => [idLinha(e), assinaturaLinha(e)]));
  const gravar: T[] = [];
  let novasN = 0, alteradas = 0, iguais = 0;
  const vistos = new Set<string>();
  for (const n of novas) {
    const id = idLinha(n);
    if (vistos.has(id)) continue; // a Omie não repete, mas não custa
    vistos.add(id);
    const antes = atual.get(id);
    if (antes === undefined) { gravar.push(n); novasN++; }
    else if (antes !== assinaturaLinha(n)) { gravar.push(n); alteradas++; }
    else iguais++;
  }
  const apagar = modo === 'completo'
    ? [...atual.keys()].filter((id) => !vistos.has(id))
    : [...new Set(removerIds.map(String))].filter((id) => atual.has(id) && !vistos.has(id));
  return { gravar, apagar, novas: novasN, alteradas, iguais };
}

/** Data no formato da Omie (DD/MM/AAAA) no horário de Brasília. */
export function dataOmie(d: Date): string {
  const l = new Date(d.getTime() - 3 * 3600_000);
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()}`;
}

/**
 * Leitura completa ou incremental? Completa aos domingos, sem rodada certa conhecida, ou
 * se a última certa tem mais de 7 dias. Incremental lê desde o DIA da última certa menos
 * 1 (folga para relógio e edições perto da meia-noite).
 */
export function decidirModo(ultimaOk: Date | null, agora: Date): { modo: 'completo' | 'incremental'; desde?: string; motivo: string } {
  const diaSemana = new Date(agora.getTime() - 3 * 3600_000).getUTCDay();
  if (diaSemana === 0) return { modo: 'completo', motivo: 'domingo (leitura completa semanal)' };
  if (!ultimaOk) return { modo: 'completo', motivo: 'sem rodada certa anterior' };
  const dias = (agora.getTime() - ultimaOk.getTime()) / 86_400_000;
  if (dias > 7) return { modo: 'completo', motivo: `última rodada certa há ${Math.floor(dias)} dias` };
  return { modo: 'incremental', desde: dataOmie(new Date(ultimaOk.getTime() - 86_400_000)), motivo: 'alterados desde a última rodada' };
}
