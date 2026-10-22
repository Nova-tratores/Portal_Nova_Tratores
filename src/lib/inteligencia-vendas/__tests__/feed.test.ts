import { describe, expect, it } from 'vitest';
import { chaveNome, montarReserva } from '../feed';
import type { ClienteIV } from '../tipos';
import type { ItemRetorno } from '../retorno';

const cli = (nome: string, cidade: string, score: number, regra = 'cruzada', extra: Partial<ClienteIV> = {}) => ({
  chave: nome, nome, cidade, score, vendedor: '', telefone: '(14) 99999-0000', local: null, propriedades: [7],
  ultimoTrator: { modelo: '6075E' }, oportunidades: [{ regra, titulo: 'Tem trator', porque: 'sem implemento', oferecer: 'Implementos', peso: 25 }], ...extra,
}) as unknown as ClienteIV;

describe('feed do vendedor', () => {
  it('chaveNome tira a UF e o acento', () => {
    expect(chaveNome('PIRAJU (SP)')).toBe('piraju');
    expect(chaveNome('Avaré - SP')).toBe('avare');
  });

  it('monta carteira, recuperar e novos só da área do vendedor', () => {
    const itens = montarReserva({
      cidades: new Set(['piraju', 'fartura']),
      ehDoVendedor: (n) => n === 'Dougras',
      clientes: [cli('JOAO DA SILVA', 'PIRAJU (SP)', 50), cli('FORA', 'OURINHOS (SP)', 90), cli('ANA', 'Fartura', 30, 'reabordar')],
      parados: [
        { origem: 'proposta', id: 1, cliente: 'BRUNO', cidade: 'Ourinhos', vendedor: 'Dougras', oque: 'Plantadeira', valor: 100000, fase: 'Aberta', desde: '', dias: 40, idadeIncerta: false, motivo: 'parada', detalhe: 'Proposta aberta', gravidade: 3 },
        { origem: 'proposta', id: 2, cliente: 'OUTRO', cidade: 'Avaré', vendedor: 'Joaquim', oque: '', valor: 1, fase: 'Aberta', desde: '', dias: 20, idadeIncerta: false, motivo: 'parada', detalhe: '', gravidade: 1 },
      ] as unknown as ItemRetorno[],
      propriedades: [{ cod: 'SP-1', municipio: 'Fartura', areaHa: 800, cultura: 'Soja', investimento: 0, lat: -23.4, lng: -49.5 }, { cod: 'SP-2', municipio: 'Itaí', areaHa: 999, cultura: '', investimento: 0, lat: null, lng: null }],
      centro: (c) => (chaveNome(c) === 'piraju' ? [-23.19, -49.38] : null),
    });
    expect(itens.map((i) => i.id)).toEqual(['c:JOAO DA SILVA', 'p:proposta:1', 'r:ANA', 'n:SP-1']);
    const joao = itens[0];
    expect(joao).toMatchObject({ tipo: 'carteira', cidade: 'Piraju', lat: -23.19, aprox: true, propriedadeId: 7, telefone: '14999990000' });
    expect(itens[3]).toMatchObject({ tipo: 'novos', lat: -23.4, aprox: false });
  });
});

describe('mesma pessoa na carteira', () => {
  const base = { cidades: new Set(['fartura', 'taguai']), ehDoVendedor: () => false, parados: [], propriedades: [], centro: () => null };
  it('junta CPF/CNPJ pelo nome e filiais pela raiz do CNPJ', () => {
    const itens = montarReserva({
      ...base,
      clientes: [
        cli('NIVEA DOROTEIA', 'Fartura', 40, 'cruzada', { chave: 'a', doc: '25295547817' }),
        cli('NIVEA DOROTEIA', 'Fartura', 60, 'cruzada', { chave: 'b', doc: '14150057000181' }),
        cli('DANIEL DIANAS RIBEIRO', 'Fartura', 50, 'cruzada', { chave: 'c', doc: '12788302000155' }),
        cli('DANIEL D RIBEIRO ME', 'Taguai', 30, 'cruzada', { chave: 'd', doc: '12788302000317' }),
      ],
    });
    expect(itens.map((i) => i.id)).toEqual(['c:b', 'c:c']);
    expect(itens[1].sub).toContain('também em Taguai');
  });
  it('nomes diferentes que encurtam igual ficam por extenso', () => {
    const itens = montarReserva({
      ...base,
      clientes: [cli('JOSE VALDIR SOUZA', 'Fartura', 40, 'cruzada', { doc: '1' }), cli('JOSE VALDIR PEREIRA', 'Fartura', 30, 'cruzada', { doc: '2' })],
    });
    expect(itens.map((i) => i.titulo)).toEqual(['Jose Valdir Souza', 'Jose Valdir Pereira']);
  });
});
