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

/**
 * Família que entra no espelho: Peças, sem família ou N/D. Não depende só de
 * `normalize('NFD')`: entre 05 e 08/11/2026 o sync no worker passou a tratar quase
 * toda "Peças" como outra família (6.548 de 6.558 no completo de 08/11) e apagou 77
 * peças do espelho — entre elas a RP-006515424U91, com locação 4·H·04 na Omie.
 * Aqui o ç vira c antes, e o que sobrar fora de a–z some ("PeÃ§as" também casa).
 */
export function familiaCaractPermitida(fam: unknown): boolean {
  const base = String(fam == null ? '' : fam).trim().toLowerCase().replace(/^#/, '');
  if (base === '' || base === 'n/d' || base === 'nd') return true;
  const semAcento = base.replace(/ç/g, 'c').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (semAcento === 'pecas') return true;
  const soLetras = base.replace(/ç/g, 'c').replace(/[^a-z]/g, '');
  return soLetras === 'pecas' || soLetras === 'peas';
}

/**
 * Trava do incremental: ele só deveria remover a peça que virou máquina ou foi
 * inativada — umas poucas por dia. Mais que max(5, 20 % dos lidos) é sinal de leitura
 * errada (foi o que apagou 77 peças entre 05 e 08/11/2026): suspende as remoções.
 */
export function remocaoIncrementalSuspeita(apagar: number, lidos: number): boolean {
  return apagar > Math.max(5, lidos * 0.2);
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
