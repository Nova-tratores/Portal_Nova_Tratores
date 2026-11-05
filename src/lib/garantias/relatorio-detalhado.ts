// Relatório detalhado das garantias finalizadas — regras PURAS (sem banco).
// O servidor (relatorio-detalhado-server.ts) junta os dados; aqui só se decide
// o texto do serviço, a situação de cada peça e os totais da folha.

export type SituacaoPeca = 'paga' | 'chegou' | 'a_chegar' | 'recusada' | 'terceiros';

export interface PecaDetalhe {
  cod: string | null;
  descricao: string;
  quantidade: number;
  /** preço pleiteado (unitário × qtd) — referência; o pago em dinheiro é o total da garantia */
  valor: number;
  situacao: SituacaoPeca;
  /** nota de reposição (x.949) em que chegou */
  nota: { numero: string; data: string } | null;
  /** forma marcada à mão no checklist (false = sugestão do portal) */
  marcada: boolean;
}

export interface ServicoTexto {
  reclamacao: string | null;
  diagnostico: string | null;
  executado: string | null;
}

export interface GarantiaDetalhada {
  id: string;
  numero: string;
  sg: string | null;
  os: string;
  cliente: string | null;
  chassi: string | null;
  modelo: string | null;
  montadora: string | null;
  aprovada: boolean;
  finalizada_em: string | null;
  tecnico: string | null;
  horas: number;
  km: number;
  valorHoras: number;
  valorKm: number;
  valorPecas: number;
  total: number;
  nfse: { situacao: 'emitida' | 'pendente' | 'nao_precisa'; numero: string | null; data: string | null; confirmada: boolean };
  pecas: PecaDetalhe[];
  servico: ServicoTexto;
  motivoRecusa: string | null;
  recusadoPor: string | null;
  cobranca: { status: string | null; valor: number | null };
}

const limpa = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\r/g, '').trim();
  return s && !/^(null|undefined)$/i.test(s) ? s : null;
};

// "Modelo: …\nChassis: …\n\nSolicitação do cliente: …\nServiço Realizado: …" (texto da OS)
export function separarServSolicitado(txt: string | null | undefined): { solicitacao: string | null; realizado: string | null } {
  const s = String(txt || '').replace(/\r/g, '');
  if (!s.trim()) return { solicitacao: null, realizado: null };
  const iReal = s.search(/servi[cç]o\s+realizado\s*:/i);
  const iSol = s.search(/solicita[cç][aã]o(\s+do\s+cliente)?\s*:/i);
  const realizado = iReal >= 0 ? s.slice(iReal).replace(/^[^:]*:/, '') : null;
  let solicitacao: string | null;
  if (iSol >= 0) solicitacao = s.slice(iSol, iReal > iSol ? iReal : undefined).replace(/^[^:]*:/, '');
  else {
    // sem o rótulo: tira o cabeçalho Modelo/Chassis/Horímetro
    const corpo = (iReal >= 0 ? s.slice(0, iReal) : s)
      .split('\n')
      .filter((l) => !/^\s*(modelo|chassis?|hor[ií]metro)\s*:/i.test(l))
      .join('\n');
    solicitacao = corpo;
  }
  return { solicitacao: limpa(solicitacao), realizado: limpa(realizado) };
}

// Ordem: o texto revisado pelo garantista (SG) > relatório do técnico no app > texto da OS.
export function textosDoServico(p: {
  respostas?: Record<string, unknown> | null;
  tecnico?: { Motivo?: unknown; ServicoRealizado?: unknown } | null;
  servSolicitado?: string | null;
  servRealizado?: string | null;
}): ServicoTexto {
  const r = p.respostas || {};
  const os = separarServSolicitado(p.servSolicitado);
  return {
    reclamacao: limpa(r.sg_reclamacao) || os.solicitacao,
    diagnostico: limpa(r.sg_diagnostico) || limpa(p.tecnico?.Motivo),
    executado: limpa(r.sg_acao_tomada) || limpa(p.tecnico?.ServicoRealizado) || limpa(p.servRealizado) || os.realizado,
  };
}

export function situacaoDaPeca(p: {
  cod: string | null; resultado: string; forma: 'reposta' | 'paga' | null; chegou: boolean;
}): SituacaoPeca {
  if (/^REQ-/i.test(String(p.cod || ''))) return 'terceiros';
  if (p.resultado !== 'aprovada') return 'recusada';
  if (p.forma === 'paga') return 'paga';
  return p.chegou ? 'chegou' : 'a_chegar';
}

export const ROTULO_SITUACAO: Record<SituacaoPeca, string> = {
  paga: 'Paga em dinheiro (NFS-e)',
  chegou: 'Reposta — chegou',
  a_chegar: 'Reposta — a chegar',
  recusada: 'Recusada',
  terceiros: 'Serviço de terceiros',
};

export interface TotaisDetalhados {
  qtd: number;
  aprovadas: number;
  recusadas: number;
  horas: number;
  km: number;
  valorHoras: number;
  valorKm: number;
  valorPecas: number;
  total: number;
  pecasPagas: { itens: number; valor: number };
  pecasChegaram: { itens: number; valor: number };
  pecasAChegar: { itens: number; valor: number };
  nfseEmitidas: number;
  nfsePendentes: { qtd: number; valor: number };
}

export function totaisDetalhados(gs: GarantiaDetalhada[]): TotaisDetalhados {
  const t: TotaisDetalhados = {
    qtd: gs.length, aprovadas: 0, recusadas: 0, horas: 0, km: 0, valorHoras: 0, valorKm: 0, valorPecas: 0, total: 0,
    pecasPagas: { itens: 0, valor: 0 }, pecasChegaram: { itens: 0, valor: 0 }, pecasAChegar: { itens: 0, valor: 0 },
    nfseEmitidas: 0, nfsePendentes: { qtd: 0, valor: 0 },
  };
  for (const g of gs) {
    if (g.aprovada) t.aprovadas++; else t.recusadas++;
    t.valorHoras += g.valorHoras;
    t.valorKm += g.valorKm;
    t.valorPecas += g.valorPecas;
    t.total += g.total;
    if (!g.aprovada) continue;
    t.horas += g.horas;
    t.km += g.km;
    if (g.nfse.situacao === 'emitida') t.nfseEmitidas++;
    if (g.nfse.situacao === 'pendente') { t.nfsePendentes.qtd++; t.nfsePendentes.valor += g.valorHoras + g.valorKm; }
    for (const p of g.pecas) {
      if (p.quantidade <= 0 || p.valor < 0) continue; // linha de estorno/qtd negativa: conferir, não soma
      const alvo = p.situacao === 'paga' ? t.pecasPagas : p.situacao === 'chegou' ? t.pecasChegaram : p.situacao === 'a_chegar' ? t.pecasAChegar : null;
      if (alvo) { alvo.itens++; alvo.valor += p.valor; }
    }
  }
  return t;
}

/** valor de cada hora/km pago pela fábrica (null quando não dá pra dividir) */
export function valorUnitario(valor: number, qtd: number): number | null {
  return qtd > 0.004 && valor > 0.004 ? Math.round((valor / qtd) * 100) / 100 : null;
}
