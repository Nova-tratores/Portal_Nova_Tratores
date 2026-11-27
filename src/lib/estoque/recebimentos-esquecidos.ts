// Recebimentos esquecidos (26/11/2026). Regras PURAS — usadas pelo robô diário
// (recebimentos-esquecidos-server.ts) e pela tela /estoque/recebimentos. Pode ir ao navegador.
//
// Decisões do usuário:
//  - esquecida = nota pendente (etapa 40 "Faturada", ainda não recebida) parada há 7+ dias;
//  - 7+ dias → sino do RESPONSÁVEL da nota (um resumo por pessoa por dia);
//  - 15+ dias → também o GESTOR direto do responsável (Organograma, só gestor com login);
//  - mais de 90 dias = "atraso antigo": NÃO entra no aviso diário, fica num filtro da tela;
//  - CT-e (frete) entra junto.

export const DIAS_ESQUECIDA = 7;
export const DIAS_GESTOR = 15;
export const DIAS_ANTIGA = 90;

export type FaixaParada = 'recente' | 'esquecida' | 'antiga';

/** "2026-11-09", "09/11/2026" ou Date → dias inteiros até `hoje` (null se não der para ler). */
export function diasParada(emissao: unknown, hoje: Date): number | null {
  const s = String(emissao || '').split('T')[0];
  let a: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (iso) [a, m, d] = [+iso[1], +iso[2], +iso[3]];
  else if (br) [a, m, d] = [+br[3], +br[2], +br[1]];
  else return null;
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.floor((h - Date.UTC(a, m - 1, d)) / 86400000);
}

export function faixaParada(dias: number | null): FaixaParada {
  if (dias == null || dias < DIAS_ESQUECIDA) return 'recente';
  return dias > DIAS_ANTIGA ? 'antiga' : 'esquecida';
}

export interface NotaParada {
  conta: string;               // NOVA | CASTRO
  idReceb: number | string;
  numero: string | null;
  fornecedor: string | null;
  valor: number;
  emissao: string | null;
  cte: boolean;
  responsavelUserId: string | null;
}

export interface LinhaAviso { nota: NotaParada; dias: number }
export interface PlanoAvisos {
  responsavel: Map<string, LinhaAviso[]>;               // userId → notas dele (7–90 dias)
  gestor: Map<string, { quem: string; l: LinhaAviso }[]>; // gestorId → notas do time (15–90 dias)
  semDono: LinhaAviso[];                                // esquecida sem responsável
  antigas: number;                                      // > 90 dias (fora do aviso)
}

/**
 * Monta os avisos do dia. `gestorDe(userId)` devolve o gestor com login (ou null);
 * `nomeDe(userId)` o nome para o resumo do gestor. Gestor que é o próprio responsável não recebe 2x.
 */
export function planejarAvisos(
  notas: NotaParada[],
  hoje: Date,
  gestorDe: (userId: string) => string | null,
  nomeDe: (userId: string) => string,
): PlanoAvisos {
  const plano: PlanoAvisos = { responsavel: new Map(), gestor: new Map(), semDono: [], antigas: 0 };
  for (const nota of notas) {
    const dias = diasParada(nota.emissao, hoje);
    const faixa = faixaParada(dias);
    if (faixa === 'antiga') { plano.antigas++; continue; }
    if (faixa !== 'esquecida' || dias == null) continue;
    const l = { nota, dias };
    const resp = nota.responsavelUserId;
    if (!resp) { plano.semDono.push(l); continue; }
    plano.responsavel.set(resp, [...(plano.responsavel.get(resp) || []), l]);
    if (dias >= DIAS_GESTOR) {
      const g = gestorDe(resp);
      if (g && g !== resp) plano.gestor.set(g, [...(plano.gestor.get(g) || []), { quem: nomeDe(resp), l }]);
    }
  }
  const maisAntigaPrimeiro = (a: LinhaAviso, b: LinhaAviso) => b.dias - a.dias;
  for (const ls of plano.responsavel.values()) ls.sort(maisAntigaPrimeiro);
  for (const ls of plano.gestor.values()) ls.sort((a, b) => maisAntigaPrimeiro(a.l, b.l));
  return plano;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function linhaNota(l: LinhaAviso): string {
  const n = String(l.nota.numero || '?').replace(/^0+(?=\d)/, '');
  const f = String(l.nota.fornecedor || '').trim().slice(0, 40);
  return `${l.nota.cte ? 'CT-e' : 'NF'} ${n} · ${l.nota.conta} · ${f} · ${brl(l.nota.valor || 0)} · ${l.dias} dias`;
}

/** Link da tela: uma nota abre direto; várias abrem o filtro "Esquecidas". */
export function linkAviso(ls: LinhaAviso[]): string {
  if (ls.length === 1) return `/estoque/recebimentos?conta=${ls[0].nota.conta}&nota=${ls[0].nota.idReceb}`;
  const contas = [...new Set(ls.map((l) => l.nota.conta))];
  return `/estoque/recebimentos?${contas.length === 1 ? `conta=${contas[0]}&` : ''}idade=esquecidas`;
}

/** Descrição do sino (até 6 linhas + "e mais N"). */
export function corpoAviso(linhas: string[]): string {
  const max = 6;
  return linhas.slice(0, max).join('\n') + (linhas.length > max ? `\ne mais ${linhas.length - max}` : '');
}
