// "Valor do Desconto" (desconto GERAL) da OS → itens de serviço do Omie (José, 16/10/2026).
// A OS do Omie não tem desconto no cabeçalho: o desconto mora em cada linha.
// O geral é repartido entre as linhas COBRADAS (hora, km, requisições), na
// proporção do valor que sobra em cada uma; o centavo do arredondamento vai na
// maior. Linhas simbólicas (solicitação 0,000001 e revisão 0,01) ficam de fora.
// O que não couber nos serviços (desconto maior que eles) volta em `naoAplicado`
// — a conferência avisa, porque aí o desconto teria de sair no pedido de peças.
// Puro (sem banco, sem Omie).

export interface LinhaComDesconto { nQtde: number; nValUnit: number; nValorDesconto?: number }

const r2 = (v: number) => Math.round(v * 100) / 100;
const cobrada = (s: LinhaComDesconto) => s.nValUnit >= 1 && s.nQtde > 0;
const sobra = (s: LinhaComDesconto) => Math.max(0, r2(s.nQtde * s.nValUnit - (s.nValorDesconto || 0)));

export function distribuirDescontoGeral<T extends LinhaComDesconto>(linhas: T[], geral: number): { linhas: T[]; aplicado: number; naoAplicado: number } {
  const alvo = r2(Math.max(0, Number(geral) || 0));
  const out = linhas.map((s) => ({ ...s }));
  if (!alvo) return { linhas: out, aplicado: 0, naoAplicado: 0 };
  const idx = out.map((s, i) => i).filter((i) => cobrada(out[i]) && sobra(out[i]) > 0);
  const base = r2(idx.reduce((t, i) => t + sobra(out[i]), 0));
  if (!base) return { linhas: out, aplicado: 0, naoAplicado: alvo };
  const aplicar = Math.min(alvo, base);
  let resto = aplicar;
  const partes = idx.map((i) => {
    const p = Math.min(sobra(out[i]), r2(aplicar * sobra(out[i]) / base));
    resto = r2(resto - p);
    return { i, p };
  });
  // centavos do arredondamento: na linha com mais folga
  if (resto !== 0) {
    const maior = [...partes].sort((a, b) => (sobra(out[b.i]) - b.p) - (sobra(out[a.i]) - a.p))[0];
    maior.p = r2(maior.p + resto);
  }
  for (const { i, p } of partes) if (p > 0) out[i].nValorDesconto = r2((out[i].nValorDesconto || 0) + p);
  return { linhas: out, aplicado: aplicar, naoAplicado: r2(alvo - aplicar) };
}
