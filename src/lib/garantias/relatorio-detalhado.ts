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
  /** parte do "valor pago de peças" da garantia que cabe a esta peça (repartirPecas) */
  pago: number;
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
  /** valorPecas separado: pago em dinheiro (vai na NFS-e) × pago em peça repostas pela fábrica */
  pecasDinheiro: number;
  pecasReposicaoChegou: number;
  pecasReposicaoAChegar: number;
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

// O "valor pago de peças" da garantia é um número só; a fábrica paga parte em
// DINHEIRO (na NFS-e de reembolso) e parte REPONDO a peça (nota x.949). Reparte o
// valor entre as peças aprovadas na proporção do preço pleiteado de cada uma;
// o que não cabe em nenhuma peça (sem preço, valor negativo) conta como dinheiro.
export function repartirPecas(valorPecas: number, pecas: Pick<PecaDetalhe, 'situacao' | 'valor' | 'quantidade'>[]): {
  pago: number[]; dinheiro: number; chegou: number; aChegar: number;
} {
  const cent = (n: number) => Math.round(n * 100);
  const total = cent(valorPecas);
  const elegivel = pecas.map((p) => p.situacao !== 'recusada' && p.quantidade > 0 && p.valor > 0);
  const base = pecas.reduce((s, p, i) => s + (elegivel[i] ? cent(p.valor) : 0), 0);
  const pago = pecas.map(() => 0);
  if (total > 0 && base > 0) {
    const idx = pecas.map((_, i) => i).filter((i) => elegivel[i]);
    let resto = total;
    idx.forEach((i, k) => {
      const v = k === idx.length - 1 ? resto : Math.round((total * cent(pecas[i].valor)) / base);
      pago[i] = v;
      resto -= v;
    });
  }
  let chegou = 0, aChegar = 0, dinheiro = total - pago.reduce((s, v) => s + v, 0);
  pecas.forEach((p, i) => {
    if (p.situacao === 'chegou') chegou += pago[i];
    else if (p.situacao === 'a_chegar') aChegar += pago[i];
    else dinheiro += pago[i];
  });
  return { pago: pago.map((v) => v / 100), dinheiro: dinheiro / 100, chegou: chegou / 100, aChegar: aChegar / 100 };
}

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
  /** pago em dinheiro (mão de obra + km + peças pagas) — com NFS-e já emitida × ainda sem NFS-e */
  dinheiroNfEmitida: { qtd: number; valor: number };
  dinheiroSemNf: { qtd: number; valor: number };
  pecasDinheiro: number;
  /** pago em peça repostas pela fábrica */
  reposicaoChegou: { itens: number; valor: number };
  reposicaoAChegar: { itens: number; valor: number };
}

export function totaisDetalhados(gs: GarantiaDetalhada[]): TotaisDetalhados {
  const t: TotaisDetalhados = {
    qtd: gs.length, aprovadas: 0, recusadas: 0, horas: 0, km: 0, valorHoras: 0, valorKm: 0, valorPecas: 0, total: 0,
    dinheiroNfEmitida: { qtd: 0, valor: 0 }, dinheiroSemNf: { qtd: 0, valor: 0 }, pecasDinheiro: 0,
    reposicaoChegou: { itens: 0, valor: 0 }, reposicaoAChegar: { itens: 0, valor: 0 },
  };
  for (const g of gs) {
    if (g.aprovada) t.aprovadas++; else t.recusadas++;
    t.valorHoras += g.valorHoras;
    t.valorKm += g.valorKm;
    t.valorPecas += g.valorPecas;
    t.total += g.total;
    t.pecasDinheiro += g.pecasDinheiro;
    if (g.aprovada) { t.horas += g.horas; t.km += g.km; }
    const dinheiro = g.valorHoras + g.valorKm + g.pecasDinheiro;
    if (Math.abs(dinheiro) > 0.004) {
      const alvo = g.nfse.situacao === 'emitida' ? t.dinheiroNfEmitida : t.dinheiroSemNf;
      alvo.qtd++;
      alvo.valor += dinheiro;
    }
    t.reposicaoChegou.valor += g.pecasReposicaoChegou;
    t.reposicaoAChegar.valor += g.pecasReposicaoAChegar;
    for (const p of g.pecas) {
      if (p.quantidade <= 0 || p.valor < 0) continue; // linha de estorno/qtd negativa: conferir, não conta
      if (p.situacao === 'chegou') t.reposicaoChegou.itens++;
      if (p.situacao === 'a_chegar') t.reposicaoAChegar.itens++;
    }
  }
  return t;
}

/** valor de cada hora/km pago pela fábrica (null quando não dá pra dividir) */
export function valorUnitario(valor: number, qtd: number): number | null {
  return qtd > 0.004 && valor > 0.004 ? Math.round((valor / qtd) * 100) / 100 : null;
}
