/* eslint-disable @typescript-eslint/no-explicit-any */
// Linha do tempo da campanha (18/11/2026) — PURO, sem banco: recebe as linhas já lidas
// e devolve os acontecimentos em ordem, do mais antigo para o mais novo.
// Quem lê do banco é app/api/marketing/acoes/[id]/linha-do-tempo/route.ts.

export type TipoEvento = 'campanha' | 'reuniao' | 'tarefa' | 'custo' | 'apoio' | 'lead' | 'roleta';

export interface EventoLinha {
  /** dia no fuso de São Paulo, 'YYYY-MM-DD' — a tela agrupa por ele */
  dia: string;
  /** para ordenar (milissegundos) */
  ordem: number;
  tipo: TipoEvento;
  titulo: string;
  linhas?: string[];
  link?: string;
}

const RESULTADO: Record<string, string> = {
  decidido: 'Decidido', adiado: 'Adiado para a próxima', parking: 'Fora do tema',
  informado: 'Informado', discutido: 'Discutido',
};
const STATUS_TAREFA: Record<string, string> = {
  aberto: 'aberta', em_andamento: 'em andamento', aguardando_terceiro: 'aguardando terceiro',
  aguardando_interno: 'aguardando interno', resolvido: 'resolvida', fechado: 'fechada', cancelado: 'cancelada',
};

/** 'YYYY-MM-DD' ou ISO com hora → dia em São Paulo + número para ordenar. */
export function quando(v: string | null | undefined): { dia: string; ordem: number } | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { dia: v, ordem: new Date(`${v}T12:00:00-03:00`).getTime() };
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return null;
  return { dia: t.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), ordem: t.getTime() };
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Conta por dia (leads, participações da roleta). */
function porDia(datas: (string | null | undefined)[]): Map<string, { n: number; ordem: number }> {
  const m = new Map<string, { n: number; ordem: number }>();
  for (const d of datas) {
    const q = quando(d);
    if (!q) continue;
    const atual = m.get(q.dia);
    m.set(q.dia, { n: (atual?.n ?? 0) + 1, ordem: Math.min(atual?.ordem ?? Infinity, q.ordem) });
  }
  return m;
}

export function montarLinhaDoTempo(e: {
  acao: { nome: string; criado_em: string; data_inicio: string | null; data_fim: string | null };
  itens: any[]; reunioes: any[]; tarefas: any[]; custos: any[]; leads: any[]; apoios: any[];
  roleta: { slug: string; participacoes: any[] } | null;
  hoje?: string;
}): EventoLinha[] {
  const ev: EventoLinha[] = [];
  const add = (data: string | null | undefined, x: Omit<EventoLinha, 'dia' | 'ordem'>) => {
    const q = quando(data);
    if (q) ev.push({ ...q, ...x });
  };
  const hoje = e.hoje ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // a campanha
  add(e.acao.criado_em, { tipo: 'campanha', titulo: 'Campanha cadastrada no portal' });
  add(e.acao.data_inicio, { tipo: 'campanha', titulo: e.acao.data_inicio && e.acao.data_inicio > hoje ? 'Começa a campanha' : 'Começou a campanha' });
  add(e.acao.data_fim, { tipo: 'campanha', titulo: e.acao.data_fim && e.acao.data_fim >= hoje ? 'Termina a campanha' : 'Terminou a campanha' });

  // reuniões: um acontecimento por reunião, com os assuntos desta campanha
  const itensDa = new Map<string, any[]>();
  for (const i of e.itens) itensDa.set(i.reuniao_id, [...(itensDa.get(i.reuniao_id) ?? []), i]);
  for (const r of e.reunioes) {
    const linhas = (itensDa.get(r.id) ?? []).map((i) => {
      if (i.resultado === 'decidido' && i.decisao_texto) {
        return `${i.pergunta} → Decidido: ${i.decisao_texto}${i.decisao_motivo ? ` (porque ${i.decisao_motivo})` : ''}`;
      }
      return i.resultado ? `${i.pergunta} → ${RESULTADO[i.resultado] ?? i.resultado}` : i.pergunta;
    });
    add(r.prazo, {
      tipo: 'reuniao',
      titulo: `Reunião nº ${r.numero}${r.titulo ? ` — ${r.titulo}` : ''}${r.reuniao_etapa === 'cancelada' ? ' (cancelada)' : ''}`,
      linhas, link: `/reunioes/${r.id}`,
    });
  }

  // tarefas que nasceram das decisões
  for (const t of e.tarefas) {
    add(t.criado_em, { tipo: 'tarefa', titulo: `Tarefa nº ${t.numero}: ${t.titulo}`, linhas: [`Situação: ${STATUS_TAREFA[t.status] ?? t.status}`] });
    if (t.resolvido_em) add(t.resolvido_em, { tipo: 'tarefa', titulo: `Tarefa nº ${t.numero} resolvida: ${t.titulo}` });
  }

  // dinheiro
  for (const a of e.apoios) {
    if (a.status === 'cancelado') continue;
    add(a.criado_em, { tipo: 'apoio', titulo: `Apoio de fábrica: ${a.apoiador || '—'}`, linhas: a.valor_aprovado ? [`Aprovado: ${brl(Number(a.valor_aprovado))}`] : undefined });
  }
  for (const c of e.custos) {
    if (c.status === 'cancelado') continue;
    const v = Number(c.valor ?? 0) * (Number(c.rateio_percent ?? 100) / 100);
    add(c.data || c.criado_em, { tipo: 'custo', titulo: `Custo: ${c.descricao}`, linhas: [brl(v)] });
  }

  // gente
  for (const [dia, x] of porDia(e.leads.map((l) => l.capturado_em))) {
    ev.push({ dia, ordem: x.ordem, tipo: 'lead', titulo: plural(x.n, 'lead cadastrado', 'leads cadastrados') });
  }
  if (e.roleta) {
    for (const [dia, x] of porDia(e.roleta.participacoes.map((p) => p.criado_em))) {
      ev.push({
        dia, ordem: x.ordem, tipo: 'roleta',
        titulo: `${plural(x.n, 'pessoa participou', 'pessoas participaram')} da roleta`,
        link: `/marketing/campanhas?campanha=${encodeURIComponent(e.roleta.slug)}`,
      });
    }
  }

  return ev.sort((a, b) => a.ordem - b.ordem);
}
