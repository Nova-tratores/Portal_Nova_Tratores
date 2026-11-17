import { describe, expect, it } from 'vitest';
import { dadosDosItens } from '@/lib/requisicoes/itens-compra';

describe('itens da nova requisição', () => {
  it('soma qtd × valor, ignora item vazio e monta as linhas das observações', () => {
    const d = dadosDosItens({ fornecedor: '', itens: [
      { link: 'https://loja.com.br/a', produto: 'FILTRO', qtd: '2', valor: '45,50' },
      { link: '', produto: '', qtd: '1', valor: '' },
      { link: '', produto: 'CORREIA', qtd: '', valor: '1.200,00' },
    ] });
    expect(d.total).toBe(1291);
    expect(d.linhasObs.map((l) => l.replace(/\s/g, ' '))).toEqual([
      '• 2 × FILTRO — R$ 45,50 cada = R$ 91,00 — https://loja.com.br/a',
      '• 1 × CORREIA — R$ 1.200,00 cada = R$ 1.200,00',
    ]);
  });
});
