// Regras PURAS da reversão de recebimento com pagamento (13/11/2026).
// Sem banco e sem Omie: ler os pagamentos dos movimentos da Omie, montar o plano
// de relançamento nas contas a pagar novas e conferir que cabe em cada uma.
//
// Omie, conferido em 13/11/2026: ListarMovimentos filtrado por nCodTitulo devolve
// UM movimento por página (o total vem em nTotRegistros); o pagamento é o
// movimento com cGrupo = CONTA_CORRENTE_PAG e nCodBaixa. nValPago = dinheiro que
// saiu; nJuros/nMulta/nDesconto vêm à parte; dDtConcilia = data da conciliação.

function num(v: unknown): number { return Number(v == null ? 0 : v) || 0; }
const c2 = (n: number) => Math.round(n * 100) / 100;

export interface TituloOmie {
  codigo: number;
  numeroParcela: string | null;   // "001/002"
  valorDocumento: number;
  valorPago: number;              // já abatido do título (0 quando acabou de nascer)
  status: string | null;          // A VENCER, ATRASADO, PAGO, CANCELADO…
  vencimento: string | null;      // DD/MM/AAAA
  documento: string | null;       // numero_documento_fiscal
}

export interface PagamentoGuardado {
  codigoTitulo: number;           // título ANTIGO
  numeroParcela: string | null;
  valorTitulo: number;            // valor do título antigo
  codigoBaixa: number;
  data: string;                   // DD/MM/AAAA
  valor: number;                  // nValPago (dinheiro)
  juros: number;
  multa: number;
  desconto: number;
  contaCorrente: number | null;
  conciliadoEm: string | null;    // DD/MM/AAAA
  // o que aconteceu com ele
  canceladoEm?: string | null;
  codigoBaixaNova?: number | null;
  tituloNovo?: number | null;
  relancadoEm?: string | null;
  erro?: string | null;
}

/** Quanto o pagamento abate do título: dinheiro + desconto − juros − multa. */
export function abatimento(p: Pick<PagamentoGuardado, 'valor' | 'juros' | 'multa' | 'desconto'>): number {
  return c2(num(p.valor) + num(p.desconto) - num(p.juros) - num(p.multa));
}

/** Pagamentos (baixas) de um título a partir dos movimentos da Omie. */
export function pagamentosDosMovimentos(
  movimentos: Array<{ detalhes?: Record<string, unknown>; resumo?: Record<string, unknown> }>,
  titulo: Pick<TituloOmie, 'codigo' | 'numeroParcela' | 'valorDocumento'>,
): PagamentoGuardado[] {
  const out: PagamentoGuardado[] = [];
  const vistos = new Set<number>();
  for (const m of movimentos) {
    const d = m.detalhes || {};
    const r = m.resumo || {};
    if (d.cGrupo !== 'CONTA_CORRENTE_PAG') continue;
    const baixa = num(d.nCodBaixa);
    if (!baixa || vistos.has(baixa)) continue;
    if (num(d.nCodTitulo) && num(d.nCodTitulo) !== titulo.codigo) continue;
    vistos.add(baixa);
    out.push({
      codigoTitulo: titulo.codigo,
      numeroParcela: titulo.numeroParcela,
      valorTitulo: titulo.valorDocumento,
      codigoBaixa: baixa,
      data: String(d.dDtPagamento || d.dDtCredito || ''),
      valor: c2(num(r.nValPago) || num(d.nValorMovCC)),
      juros: c2(num(d.nJuros)),
      multa: c2(num(d.nMulta)),
      desconto: c2(num(d.nDesconto)),
      contaCorrente: num(d.nCodCC) || null,
      conciliadoEm: d.dDtConcilia ? String(d.dDtConcilia) : null,
    });
  }
  return out;
}

export interface ItemRelancamento {
  indice: number;                 // posição em pagamentos[]
  pagamento: PagamentoGuardado;
  tituloNovo: number | null;
  /** motivo de não dar para relançar automaticamente */
  bloqueio: string | null;
}

/**
 * Casa cada pagamento guardado com uma conta a pagar nova:
 * 1) mesma parcela ("001/002"); 2) havendo um título só, ele; 3) o 1º com saldo.
 * Depois confere que a soma abatida em cada título não passa do saldo dele.
 * Pagamento já relançado fica de fora.
 */
export function planejarRelancamento(pagamentos: PagamentoGuardado[], titulosNovos: TituloOmie[]): { itens: ItemRelancamento[]; avisos: string[] } {
  const ativos = titulosNovos.filter((t) => !/CANCEL/i.test(String(t.status || '')));
  const saldo = new Map<number, number>(ativos.map((t) => [t.codigo, c2(t.valorDocumento - t.valorPago)]));
  const itens: ItemRelancamento[] = [];
  const avisos: string[] = [];
  pagamentos.forEach((p, indice) => {
    if (p.codigoBaixaNova) return;
    let alvo: TituloOmie | undefined;
    if (p.numeroParcela) alvo = ativos.find((t) => t.numeroParcela === p.numeroParcela);
    if (!alvo && ativos.length === 1) alvo = ativos[0];
    const ab = abatimento(p);
    if (!alvo) alvo = ativos.find((t) => (saldo.get(t.codigo) || 0) + 0.005 >= ab);
    let bloqueio: string | null = null;
    if (!alvo) bloqueio = 'Nenhuma conta a pagar nova com saldo para este pagamento.';
    else if (!(p.valor > 0)) bloqueio = 'Pagamento sem valor em dinheiro (só desconto): lance na Omie.';
    else if (!p.contaCorrente) bloqueio = 'O pagamento antigo não tem conta corrente.';
    else if ((saldo.get(alvo.codigo) || 0) + 0.005 < ab) bloqueio = `Passa do saldo da parcela ${alvo.numeroParcela || ''} (R$ ${(saldo.get(alvo.codigo) || 0).toFixed(2)}).`.replace(' )', ')');
    if (alvo && !bloqueio) saldo.set(alvo.codigo, c2((saldo.get(alvo.codigo) || 0) - ab));
    itens.push({ indice, pagamento: p, tituloNovo: alvo ? alvo.codigo : null, bloqueio });
  });
  const somaNovos = c2(ativos.reduce((s, t) => s + t.valorDocumento, 0));
  const somaAntigos = c2([...new Map(pagamentos.map((p) => [p.codigoTitulo, p.valorTitulo])).values()].reduce((s, v) => s + v, 0));
  if (ativos.length && somaAntigos && Math.abs(somaNovos - somaAntigos) > 0.01) {
    avisos.push(`As contas a pagar novas somam R$ ${somaNovos.toFixed(2)}; as antigas que tinham pagamento somavam R$ ${somaAntigos.toFixed(2)}. Confira a parcela de cada pagamento.`);
  }
  if (!ativos.length) avisos.push('A nota ainda não tem contas a pagar novas na Omie (dê entrada de novo primeiro).');
  return { itens, avisos };
}

/** Situação da ficha depois de uma rodada de relançamento. */
export function statusDepoisDeRelancar(pagamentos: PagamentoGuardado[]): 'relancada' | 'parcial' | 'aguardando_relancamento' {
  const feitos = pagamentos.filter((p) => p.codigoBaixaNova).length;
  if (feitos === pagamentos.length) return 'relancada';
  return feitos > 0 ? 'parcial' : 'aguardando_relancamento';
}

export function observacaoRelancamento(numeroNfe: string | null, motivo: string | null, p: PagamentoGuardado): string {
  const nf = String(numeroNfe || '').replace(/^0+(?=\d)/, '');
  const base = `Relançado pelo portal após reversão do recebimento da NF ${nf} (pagamento original de ${p.data}).`;
  const m = (motivo || '').replace(/[<>&]/g, ' ').trim();
  return (m ? `${base} Motivo: ${m}` : base).slice(0, 480);
}
