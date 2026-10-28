// Padrões de uso (PURO): onde o usuário "monta quebra-cabeça".
//
// Duas fontes:
//  1. portal_uso_transicoes — de → para entre TELAS, com "mesmo caso" e
//     ida-e-volta (lib/uso/jornada.ts). Começa a encher quando a migration
//     sql/portal-uso-transicoes.sql é aplicada.
//  2. audit_log — sequência de AÇÕES do mesmo usuário em entidades diferentes
//     em até 30 min (ex.: olhou o trator em Revisões e editou a Requisição).
//     Funciona com o histórico que já existe.
//
// Score de quebra-cabeça de um par de telas = (mesmo caso + 2 × idas-e-voltas)
// × √pessoas. Hubs (/dashboard, /split) aparecem na tabela mas não pontuam:
// sair do dashboard para uma tela é navegação, não falta de informação.

export interface LinhaTransicao {
  user_id: string;
  de: string;
  para: string;
  dia: string;
  n: number;
  n_mesmo_alvo: number;
  n_volta: number;
  n_rapida: number;
  soma_gap_s: number;
}

export interface EventoAudit {
  user_id: string;
  sistema: string;
  acao: string;
  entidade: string | null;
  created_at: string;
}

export interface Oportunidade {
  chave: string;
  status: 'nova' | 'em_analise' | 'feito' | 'descartado';
  nota: string | null;
  feito_em: string | null;
  por: string | null;
}

export interface UsuarioNome { id: string; nome: string }

// App de vendas: o Início e o Menu são a mesma coisa que o /dashboard daqui.
export const HUBS = ['/dashboard', '/split', '/vendas/dashboard', '/vendas/menu', '/vendas/supervisor'];
/** Ações que não são trabalho da pessoa num caso (navegação ou robô). */
export const ACOES_IGNORADAS = ['acesso', 'erro_envio', 'pendencia_detectada', 'release'];
export const GAP_ACOES_S = 30 * 60;
const USER_ZERO = '00000000-0000-0000-0000-000000000000';

export interface ParTelas {
  chave: string;        // 'de→para'
  de: string;
  para: string;
  n: number;
  pessoas: number;
  nomes: string[];      // até 5, quem mais faz
  pctSaida: number;     // % das saídas de "de" que vão para "para"
  pctMesmo: number;
  pctVolta: number;
  pctRapida: number;
  gapMedioS: number;
  score: number;
  hub: boolean;
}

export interface SeqAcoes {
  chave: string;        // 'ent:a→b'
  de: string;           // 'sistema/entidade'
  para: string;
  n: number;
  pessoas: number;
  nomes: string[];
  gapMedioS: number;
  score: number;
}

export interface Card {
  chave: string;
  origem: 'telas' | 'acoes';
  de: string;
  para: string;
  n: number;
  pessoas: number;
  nomes: string[];
  score: number;
  motivo: string;       // a evidência em uma frase
  sugestao: string;
  status: Oportunidade['status'];
  nota: string | null;
  feito_em: string | null;
  por: string | null;
  serie: Array<{ semana: string; n: number }>;
  antesPorSemana: number | null;
  depoisPorSemana: number | null;
}

export interface ResumoPadroes {
  totais: { transicoes: number; mesmoCaso: number; voltas: number; gapMedioS: number; pessoas: number; sequencias: number };
  pares: ParTelas[];
  sequencias: SeqAcoes[];
  cards: Card[];
  telas: string[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Segunda-feira (YYYY-MM-DD) da semana do dia. */
export function semanaDe(dia: string): string {
  const d = new Date(dia.slice(0, 10) + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}

/** Dia local (-03:00) de um timestamp ISO. */
function diaDe(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function semanasDoPeriodo(de: string, ate: string): string[] {
  const out: string[] = [];
  let s = semanaDe(de);
  const fim = semanaDe(ate);
  for (let i = 0; i < 60 && s <= fim; i++) {
    out.push(s);
    s = new Date(new Date(s + 'T12:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10);
  }
  return out;
}

function topNomes(porUser: Map<string, number>, nomes: Map<string, string>): string[] {
  return Array.from(porUser.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u]) => (nomes.get(u) || u.slice(0, 8)).split(' ')[0]);
}

export function scorePar(nMesmo: number, nVolta: number, pessoas: number, hub: boolean): number {
  if (hub) return 0;
  return Math.round((nMesmo + 2 * nVolta) * Math.sqrt(Math.max(1, pessoas)) * 10) / 10;
}

/** Agrega as transições por par de telas. */
export function paresDeTelas(linhas: LinhaTransicao[], nomes: Map<string, string>): ParTelas[] {
  const saidas = new Map<string, number>();
  const m = new Map<string, { de: string; para: string; n: number; mesmo: number; volta: number; rapida: number; gap: number; users: Map<string, number> }>();
  for (const l of linhas) {
    if (!l.de || !l.para || l.de === l.para) continue;
    saidas.set(l.de, (saidas.get(l.de) || 0) + l.n);
    const k = `${l.de}→${l.para}`;
    const a = m.get(k) || { de: l.de, para: l.para, n: 0, mesmo: 0, volta: 0, rapida: 0, gap: 0, users: new Map() };
    a.n += l.n; a.mesmo += l.n_mesmo_alvo; a.volta += l.n_volta; a.rapida += l.n_rapida; a.gap += Number(l.soma_gap_s) || 0;
    a.users.set(l.user_id, (a.users.get(l.user_id) || 0) + l.n);
    m.set(k, a);
  }
  return Array.from(m.entries()).map(([chave, a]) => {
    const hub = HUBS.includes(a.de) || HUBS.includes(a.para);
    return {
      chave, de: a.de, para: a.para, n: a.n, pessoas: a.users.size, nomes: topNomes(a.users, nomes),
      pctSaida: pct(a.n, saidas.get(a.de) || 0), pctMesmo: pct(a.mesmo, a.n), pctVolta: pct(a.volta, a.n), pctRapida: pct(a.rapida, a.n),
      gapMedioS: a.n ? Math.round(a.gap / a.n) : 0,
      score: scorePar(a.mesmo, a.volta, a.users.size, hub), hub,
    };
  }).sort((x, y) => y.score - x.score || y.n - x.n);
}

/** Rótulo de um evento do audit_log: 'sistema/entidade' (sem entidade = só o sistema). */
export function rotuloEvento(e: Pick<EventoAudit, 'sistema' | 'entidade'>): string {
  return e.entidade ? `${e.sistema}/${e.entidade}` : e.sistema;
}

/**
 * Sequências de ações: por usuário, junta as ações seguidas na MESMA entidade
 * (editar 5× a requisição = 1 passo) e conta a passagem de uma entidade para
 * outra em até 30 min.
 */
export function sequenciasDeAcoes(eventos: EventoAudit[], nomes: Map<string, string>): { seqs: SeqAcoes[]; porDia: Map<string, Map<string, number>> } {
  const porUser = new Map<string, EventoAudit[]>();
  for (const e of eventos) {
    if (!e.user_id || e.user_id === USER_ZERO || ACOES_IGNORADAS.includes(e.acao)) continue;
    const l = porUser.get(e.user_id) || [];
    l.push(e);
    porUser.set(e.user_id, l);
  }
  const m = new Map<string, { de: string; para: string; n: number; gap: number; users: Map<string, number> }>();
  const porDia = new Map<string, Map<string, number>>();
  for (const [u, l] of porUser) {
    l.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    // colapsa a sequência na mesma entidade: guarda o rótulo e o ÚLTIMO horário do bloco
    const passos: Array<{ r: string; ini: number; fim: number }> = [];
    for (const e of l) {
      const r = rotuloEvento(e);
      const t = new Date(e.created_at).getTime();
      const ult = passos[passos.length - 1];
      if (ult && ult.r === r && (t - ult.fim) / 1000 <= GAP_ACOES_S) ult.fim = t;
      else passos.push({ r, ini: t, fim: t });
    }
    for (let i = 1; i < passos.length; i++) {
      const a = passos[i - 1], b = passos[i];
      const gap = (b.ini - a.fim) / 1000;
      if (a.r === b.r || gap > GAP_ACOES_S) continue;
      const k = `ent:${a.r}→${b.r}`;
      const x = m.get(k) || { de: a.r, para: b.r, n: 0, gap: 0, users: new Map() };
      x.n++; x.gap += gap; x.users.set(u, (x.users.get(u) || 0) + 1);
      m.set(k, x);
      const dia = diaDe(new Date(b.ini).toISOString());
      const pd = porDia.get(k) || new Map<string, number>();
      pd.set(dia, (pd.get(dia) || 0) + 1);
      porDia.set(k, pd);
    }
  }
  const seqs = Array.from(m.entries()).map(([chave, x]) => ({
    chave, de: x.de, para: x.para, n: x.n, pessoas: x.users.size, nomes: topNomes(x.users, nomes),
    gapMedioS: x.n ? Math.round(x.gap / x.n) : 0,
    score: Math.round(x.n * Math.sqrt(x.users.size) * 10) / 10,
  })).sort((a, b) => b.score - a.score || b.n - a.n);
  return { seqs, porDia };
}

/** Série semanal + média por semana antes/depois do "feito". */
function serieSemanal(porDia: Map<string, number> | undefined, semanas: string[], feitoEm: string | null) {
  const porSemana = new Map<string, number>();
  for (const [dia, n] of porDia || []) {
    const s = semanaDe(dia);
    porSemana.set(s, (porSemana.get(s) || 0) + n);
  }
  const serie = semanas.map((s) => ({ semana: s, n: porSemana.get(s) || 0 }));
  if (!feitoEm) return { serie, antes: null, depois: null };
  const corte = semanaDe(feitoEm);
  const antes = serie.filter((s) => s.semana < corte);
  const depois = serie.filter((s) => s.semana > corte);
  const media = (l: typeof serie) => (l.length ? Math.round((l.reduce((t, s) => t + s.n, 0) / l.length) * 10) / 10 : null);
  return { serie, antes: media(antes), depois: media(depois) };
}

const minutos = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

function cardDePar(p: ParTelas): Pick<Card, 'motivo' | 'sugestao'> {
  const partes = [`${p.n}× de ${p.de} para ${p.para}`, `${p.pessoas} ${p.pessoas === 1 ? 'pessoa' : 'pessoas'}`];
  if (p.pctMesmo) partes.push(`${p.pctMesmo}% no mesmo caso`);
  if (p.pctVolta) partes.push(`${p.pctVolta}% voltam em seguida`);
  partes.push(`fica ${minutos(p.gapMedioS)} em ${p.de} antes`);
  const sugestao = p.pctVolta >= 30
    ? `A pessoa vai a ${p.para} só para consultar algo e volta: trazer esse dado para dentro de ${p.de} (resumo ou painel lateral).`
    : p.pctMesmo >= 30
      ? `Mesmo caso nas duas telas: mostrar em ${p.de} o resumo do que ela vai buscar em ${p.para}, com atalho direto.`
      : `Caminho frequente: um atalho de ${p.de} para ${p.para} já com o caso aberto.`;
  return { motivo: partes.join(' · '), sugestao };
}

function cardDeSeq(s: SeqAcoes): Pick<Card, 'motivo' | 'sugestao'> {
  return {
    motivo: `${s.n}× mexeu em ${s.de} e, em seguida (≈${minutos(s.gapMedioS)}), em ${s.para} · ${s.pessoas} ${s.pessoas === 1 ? 'pessoa' : 'pessoas'}`,
    sugestao: `Trabalho encadeado: mostrar ${s.para} junto de ${s.de} (ou criar ${s.para} a partir dali, já preenchido).`,
  };
}

export const MIN_N = 5;
export const MIN_PESSOAS = 2;

export function resumirPadroes(entrada: {
  transicoes: LinhaTransicao[];
  eventos: EventoAudit[];
  oportunidades: Oportunidade[];
  usuarios: UsuarioNome[];
  de: string;
  ate: string;
  maxCards?: number;
}): ResumoPadroes {
  const nomes = new Map(entrada.usuarios.map((u) => [u.id, u.nome]));
  const ops = new Map(entrada.oportunidades.map((o) => [o.chave, o]));
  const semanas = semanasDoPeriodo(entrada.de, entrada.ate);

  const pares = paresDeTelas(entrada.transicoes, nomes);
  const { seqs, porDia: diaSeq } = sequenciasDeAcoes(entrada.eventos, nomes);

  const diaPar = new Map<string, Map<string, number>>();
  const pessoas = new Set<string>();
  let total = 0, mesmo = 0, voltas = 0, gap = 0;
  for (const l of entrada.transicoes) {
    const k = `${l.de}→${l.para}`;
    const pd = diaPar.get(k) || new Map<string, number>();
    pd.set(l.dia, (pd.get(l.dia) || 0) + l.n);
    diaPar.set(k, pd);
    total += l.n; mesmo += l.n_mesmo_alvo; voltas += l.n_volta; gap += Number(l.soma_gap_s) || 0;
    pessoas.add(l.user_id);
  }

  const relevante = (n: number, p: number) => n >= MIN_N || p >= MIN_PESSOAS;
  const max = entrada.maxCards ?? 12;
  const montar = (origem: Card['origem'], base: { chave: string; de: string; para: string; n: number; pessoas: number; nomes: string[]; score: number }, txt: Pick<Card, 'motivo' | 'sugestao'>, porDia: Map<string, number> | undefined): Card => {
    const op = ops.get(base.chave);
    const st = serieSemanal(porDia, semanas, op?.status === 'feito' ? op.feito_em : null);
    return {
      ...base, origem, ...txt,
      status: op?.status || 'nova', nota: op?.nota ?? null, feito_em: op?.feito_em ?? null, por: op?.por ?? null,
      serie: st.serie, antesPorSemana: st.antes, depoisPorSemana: st.depois,
    };
  };
  const cards: Card[] = [
    ...pares.filter((p) => !p.hub && p.score > 0 && relevante(p.n, p.pessoas)).slice(0, max)
      .map((p) => montar('telas', p, cardDePar(p), diaPar.get(p.chave))),
    ...seqs.filter((s) => relevante(s.n, s.pessoas)).slice(0, max)
      .map((s) => montar('acoes', s, cardDeSeq(s), diaSeq.get(s.chave))),
  ];
  // Oportunidade já marcada continua na lista mesmo se caiu do top (para ver o "depois").
  for (const op of entrada.oportunidades) {
    if (cards.some((c) => c.chave === op.chave)) continue;
    const p = pares.find((x) => x.chave === op.chave);
    if (p) { cards.push(montar('telas', p, cardDePar(p), diaPar.get(p.chave))); continue; }
    const s = seqs.find((x) => x.chave === op.chave);
    if (s) cards.push(montar('acoes', s, cardDeSeq(s), diaSeq.get(s.chave)));
  }

  const telas = Array.from(new Set(entrada.transicoes.flatMap((l) => [l.de, l.para]))).sort();
  return {
    totais: { transicoes: total, mesmoCaso: mesmo, voltas, gapMedioS: total ? Math.round(gap / total) : 0, pessoas: pessoas.size, sequencias: seqs.reduce((t, s) => t + s.n, 0) },
    pares, sequencias: seqs, cards, telas,
  };
}

/** De onde se chega a uma tela e para onde se vai dela. */
export function fluxoDaTela(linhas: Array<Pick<LinhaTransicao, "de" | "para" | "n">>, rota: string, top = 10): { entradas: Array<{ rota: string; n: number }>; saidas: Array<{ rota: string; n: number }> } {
  const ent = new Map<string, number>(), sai = new Map<string, number>();
  for (const l of linhas) {
    if (l.para === rota && l.de !== rota) ent.set(l.de, (ent.get(l.de) || 0) + l.n);
    if (l.de === rota && l.para !== rota) sai.set(l.para, (sai.get(l.para) || 0) + l.n);
  }
  const ord = (m: Map<string, number>) => Array.from(m.entries()).map(([r, n]) => ({ rota: r, n })).sort((a, b) => b.n - a.n).slice(0, top);
  return { entradas: ord(ent), saidas: ord(sai) };
}
