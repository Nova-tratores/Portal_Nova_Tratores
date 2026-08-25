// Rastreio × PPV — parte PURA da conferência liberado × faturado (sem nenhum
// import de servidor: testável no vitest em ambiente node). A parte que fala
// com o banco vive em ppv-vinculo.ts, que importa e re-exporta daqui.
import { norm, type PecaUnidade, type UnidadeStatus } from './unidades';

// peca_unidades.conta_omie ('NOVA'|'CASTRO') × pedidos.omie_empresa
export const CONTA_TO_EMPRESA: Record<string, string> = {
  NOVA: 'Nova Tratores',
  CASTRO: 'Castro Peças',
};

// status terminais do PPV (inclui os legados, normalizados só na leitura)
export const PPV_STATUS_TERMINAIS = ['Concluída', 'Cancelada', 'Fechado', 'Cancelado'];

// Remessa nunca fatura — enviada ao Omie (pedido_omie) já conta como "saiu com nota"
export function ppvFaturado(cab: { faturado_omie_em: string | null; Tipo_Pedido: string | null; pedido_omie: string | null }): boolean {
  if (cab.faturado_omie_em) return true;
  return cab.Tipo_Pedido === 'Remessa' && !!cab.pedido_omie;
}

export type ConferenciaFlag =
  | 'sem_rastreio' // saldo maior que unidades ativas — informativo (rastreio é opcional)
  | 'rastreio_excedente' // mais unidades presas do que saldo (item devolvido/kit removido)
  | 'liberada_nao_faturada' // PPV faturado/terminal com unidade ainda 'liberada'
  | 'faturada_sem_liberacao'; // PPV faturado com reserva nunca liberada

export interface ConferenciaLinha {
  codigo: string;
  descricao: string;
  saldo: number; // Σ Saída − Σ Devolução
  preco: number | null; // preço unitário de venda do item no PPV
  unidades: { id: string; numero: string; status: UnidadeStatus; venda_preco: number | null }[];
  reservadas: number;
  liberadas: number;
  aplicadas: number;
  em_devolucao: number;
  flags: ConferenciaFlag[];
}

export interface ConferenciaPPV {
  id_ppv: string;
  status: string;
  tipo: string;
  faturado: boolean;
  terminal: boolean;
  linhas: ConferenciaLinha[];
  totais: { saldo: number; reservadas: number; liberadas: number; aplicadas: number };
}

/** Agrega saldo (e preço de venda) por código a partir das movimentações cruas. */
export function saldoPorCodigo(
  movs: { TipoMovimento?: string | null; CodProduto?: string | null; Descricao?: string | null; Qtde?: string | number | null; Preco?: number | string | null }[],
): Map<string, { codigo: string; descricao: string; saldo: number; preco: number | null }> {
  const porCod = new Map<string, { codigo: string; descricao: string; saldo: number; preco: number | null }>();
  for (const m of movs) {
    const cod = norm(m.CodProduto);
    if (!cod) continue;
    const qt = Math.max(0, parseFloat(String(m.Qtde ?? '0').replace(',', '.')) || 0);
    const linha = porCod.get(cod) || { codigo: String(m.CodProduto || '').trim(), descricao: '', saldo: 0, preco: null };
    if (!linha.descricao && m.Descricao) linha.descricao = String(m.Descricao).trim();
    const ehDevolucao = String(m.TipoMovimento || '') === 'Devolução';
    linha.saldo += ehDevolucao ? -qt : qt;
    // preço de venda: última Saída com preço informado vence (edições de preço
    // no drawer atualizam todas as movimentações do código)
    if (!ehDevolucao && m.Preco != null && m.Preco !== '') {
      const p = parseFloat(String(m.Preco).replace(',', '.'));
      if (!Number.isNaN(p)) linha.preco = p;
    }
    porCod.set(cod, linha);
  }
  return porCod;
}

/** Casa unidades com os itens (por codigo OU alt_codigo — etiqueta dupla) e marca flags. */
export function montarConferencia(
  cab: { id_pedido: string; status: string | null; Tipo_Pedido: string | null },
  faturado: boolean,
  porCod: Map<string, { codigo: string; descricao: string; saldo: number; preco: number | null }>,
  unidades: PecaUnidade[],
): ConferenciaPPV {
  const terminal = PPV_STATUS_TERMINAIS.includes(String(cab.status || ''));
  const linhas: ConferenciaLinha[] = [];
  const usadas = new Set<string>(); // ids de unidade já casadas

  for (const [cod, item] of porCod) {
    if (item.saldo <= 0) continue;
    const minhas = unidades.filter(
      (u) => !usadas.has(u.id) && (norm(u.codigo) === cod || norm(u.alt_codigo) === cod),
    );
    minhas.forEach((u) => usadas.add(u.id));
    linhas.push(linhaDe(item, minhas, faturado, terminal));
  }
  // unidades presas a códigos que não estão (mais) no pedido
  const orfas = unidades.filter((u) => !usadas.has(u.id));
  const porCodOrfa = new Map<string, PecaUnidade[]>();
  for (const u of orfas) {
    const cod = norm(u.codigo);
    porCodOrfa.set(cod, [...(porCodOrfa.get(cod) || []), u]);
  }
  for (const [, us] of porCodOrfa) {
    const l = linhaDe(
      { codigo: us[0].codigo, descricao: us[0].descricao, saldo: 0, preco: us[0].venda_preco ?? null },
      us, faturado, terminal,
    );
    if (!l.flags.includes('rastreio_excedente')) l.flags.push('rastreio_excedente');
    linhas.push(l);
  }

  const totais = linhas.reduce(
    (s, l) => ({
      saldo: s.saldo + l.saldo,
      reservadas: s.reservadas + l.reservadas,
      liberadas: s.liberadas + l.liberadas,
      aplicadas: s.aplicadas + l.aplicadas,
    }),
    { saldo: 0, reservadas: 0, liberadas: 0, aplicadas: 0 },
  );
  return {
    id_ppv: cab.id_pedido,
    status: String(cab.status || ''),
    tipo: String(cab.Tipo_Pedido || 'Pedido'),
    faturado,
    terminal,
    linhas,
    totais,
  };
}

function linhaDe(
  item: { codigo: string; descricao: string; saldo: number; preco: number | null },
  unidades: PecaUnidade[],
  faturado: boolean,
  terminal: boolean,
): ConferenciaLinha {
  const conta = (st: UnidadeStatus) => unidades.filter((u) => u.status === st).length;
  const reservadas = conta('retirada_pendente');
  const liberadas = conta('liberada');
  const aplicadas = conta('aplicada');
  const em_devolucao = conta('devolucao_pendente');
  const ativas = reservadas + liberadas + aplicadas;
  const flags: ConferenciaFlag[] = [];
  if (item.saldo > ativas) flags.push('sem_rastreio');
  if (reservadas + liberadas + aplicadas > item.saldo && item.saldo > 0) flags.push('rastreio_excedente');
  if ((faturado || terminal) && liberadas > 0) flags.push('liberada_nao_faturada');
  if (faturado && reservadas > 0) flags.push('faturada_sem_liberacao');
  return {
    codigo: item.codigo,
    descricao: item.descricao,
    saldo: item.saldo,
    preco: item.preco,
    unidades: unidades
      .map((u) => ({ id: u.id, numero: u.numero, status: u.status, venda_preco: u.venda_preco ?? null }))
      .sort((a, b) => a.numero.localeCompare(b.numero)),
    reservadas,
    liberadas,
    aplicadas,
    em_devolucao,
    flags,
  };
}
