// Regras PURAS do Ajuste de estoque (quantidade e/ou custo) — sem Omie nem banco,
// testadas em __tests__/ajuste-estoque-regras.test.ts. Quem chama é
// lib/ajustes/ajuste-estoque.ts (servidor) e a tela /ajustes/ajuste-estoque.
//
// Como cada pedido vira UM ajuste no Omie (/estoque/ajuste/ IncluirAjusteEstoque):
//  - SLD = "o saldo do local passa a ser `quan`, ao custo unitário `valor`" —
//    serve para qtd, custo ou os dois (valor precisa ser > 0). Funciona com
//    estoque zerado (de 0 para N) e para zerar (quan 0 — o estoque negativo já usa).
//  - sem custo informado, o SLD repete o CMC atual (só a qtd muda);
//  - produto SEM CMC (0) indo para qtd 0: não há valor para o SLD → SAI/ENT da
//    diferença (o Omie usa o CMC vigente);
//  - produto SEM CMC ganhando quantidade: exige o custo (não inventamos custo).
// motivo: 'INV' quando a qtd muda, 'CMC' quando só o custo muda.

export type TipoAjuste = 'SLD' | 'ENT' | 'SAI';

export interface PedidoAjuste {
  qtdAtual: number;          // físico do local, lido AO VIVO no Omie
  cmcAtual: number;          // CMC atual do local
  novaQtd?: number | null;   // vazio = não muda a quantidade
  novoCusto?: number | null; // vazio = não muda o custo
}

export interface PlanoAjuste {
  tipo: TipoAjuste;
  quan: number;
  valor?: number;
  motivo: 'INV' | 'CMC';
  qtdFinal: number;
  cmcFinal: number;
  resumo: string; // "Qtd 3 -> 5 / Custo R$ 10,00 -> R$ 12,00"
}

const EPS = 1e-6;

export function numeroBR(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/^R\$\s*/i, '');
  if (!s) return null;
  // "1.234,56" -> "1234.56"; "12,5" -> "12.5"; "12.5" fica
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtQtd(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}
export function fmtMoedaBR(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Decide o ajuste do Omie para um pedido. Devolve { erro } quando não dá. */
export function planejarAjuste(p: PedidoAjuste): PlanoAjuste | { erro: string } {
  const qtdAtual = Number(p.qtdAtual) || 0;
  const cmcAtual = Number(p.cmcAtual) || 0;
  const temQtd = p.novaQtd != null;
  const temCusto = p.novoCusto != null;
  const novaQtd = temQtd ? Number(p.novaQtd) : qtdAtual;
  const novoCusto = temCusto ? Number(p.novoCusto) : cmcAtual;

  if (temQtd && (!Number.isFinite(novaQtd) || novaQtd < 0)) return { erro: 'quantidade nova inválida (use 0 ou mais)' };
  if (temCusto && (!Number.isFinite(novoCusto) || novoCusto <= 0)) return { erro: 'custo novo inválido (precisa ser maior que zero)' };

  const mudaQtd = temQtd && Math.abs(novaQtd - qtdAtual) > EPS;
  const mudaCusto = temCusto && Math.abs(novoCusto - cmcAtual) > EPS;
  if (!mudaQtd && !mudaCusto) return { erro: 'nada a alterar: quantidade e custo iguais aos atuais' };

  const partes: string[] = [];
  if (mudaQtd) partes.push(`Qtd ${fmtQtd(qtdAtual)} -> ${fmtQtd(novaQtd)}`);
  if (mudaCusto) partes.push(`Custo ${fmtMoedaBR(cmcAtual)} -> ${fmtMoedaBR(novoCusto)}`);
  const resumo = partes.join(' / ');
  const motivo = mudaQtd ? 'INV' : 'CMC';

  // Só custo com estoque zerado: o SLD regravaria saldo 0 e o custo não "pega".
  if (!mudaQtd && Math.abs(novaQtd) < EPS) {
    return { erro: 'produto sem estoque neste local: para gravar o custo informe também a quantidade' };
  }

  if (novoCusto > EPS) {
    return { tipo: 'SLD', quan: novaQtd, valor: novoCusto, motivo, qtdFinal: novaQtd, cmcFinal: novoCusto, resumo };
  }

  // Sem custo em lugar nenhum (CMC 0 e nenhum informado).
  if (Math.abs(novaQtd) < EPS) {
    // zerar: movimenta a diferença
    return qtdAtual > 0
      ? { tipo: 'SAI', quan: qtdAtual, motivo, qtdFinal: 0, cmcFinal: cmcAtual, resumo }
      : { tipo: 'ENT', quan: -qtdAtual, motivo, qtdFinal: 0, cmcFinal: cmcAtual, resumo };
  }
  return { erro: 'produto sem custo (CMC zero): informe o custo unitário junto com a quantidade' };
}

/** Data e hora em Brasília: "26/10/2026 14:32". */
export function dataHoraBR(d: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return f.format(d).replace(',', '');
}

/**
 * Comentário gravado no ajuste do Omie (campo `obs`, que aparece no histórico do
 * produto): data, hora, usuário do portal e motivo. O Omie corta textos longos —
 * o motivo é o que encurta, nunca a identificação.
 */
export function montarObsAjuste(a: { quando: string; usuario: string; motivo: string; resumo: string; grupo?: string | null }, max = 240): string {
  const cabeca = `Ajuste portal ${a.quando} por ${a.usuario}${a.grupo ? ` (${a.grupo})` : ''} - ${a.resumo} - Motivo: `;
  const motivo = a.motivo.replace(/\s+/g, ' ').trim();
  const sobra = max - cabeca.length;
  if (sobra <= 3) return (cabeca + motivo).slice(0, max);
  return cabeca + (motivo.length > sobra ? motivo.slice(0, sobra - 3) + '...' : motivo);
}
