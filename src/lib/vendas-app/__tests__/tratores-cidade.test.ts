import { describe, it, expect } from 'vitest';
import { cidadeDoTrator, indexarClientesOmie, umaLetraDeDiferenca } from '../tratores-cidade';
import { tratoresDoMunicipio } from '../tratores-territorio';

const omie = indexarClientesOmie([
  { nome: 'LUIZ ROGERIO UGUCCIONI', cidade: 'CARLOPOLIS (PR)' },
  { nome: 'LAUDAIR JUVENCIO NATAL', cidade: 'CARLOPOLIS (PR)' },
  { nome: 'LUIZ GUSTAVO GOMES RIBEIRO 31143411870', cidade: 'PIRAJU (SP)' },
  { nome: 'JOSE DA SILVA', cidade: 'FARTURA (SP)' },
  { nome: 'JOSE DA SILVA', cidade: 'TAGUAI (SP)' },
  { nome: 'NOVA TRATORES', cidade: 'PIRAJU (SP)' },
]);

describe('cidade do trator vendido (portal)', () => {
  it('cliente achado no Omie: vale a cidade do Omie, mesmo com 1 letra diferente no nome', () => {
    expect(cidadeDoTrator({ Cliente: 'LUIZ ROGERIO UGUCCIONE', Cidade: 'PIRAJU' }, omie)).toMatchObject({ chave: 'CARLOPOLIS', origem: 'omie' });
    expect(cidadeDoTrator({ Cliente: 'LAUDAIR JUVENCIO NATAL', Cidade: 'RIBEIRÃO BONITO' }, omie).chave).toBe('CARLOPOLIS');
  });
  it('nome do Omie com CPF no fim casa pelo começo', () => {
    expect(cidadeDoTrator({ Cliente: 'Luiz Gustavo Gomes Ribeiro', Cidade: 'FARTURA' }, omie)).toMatchObject({ chave: 'PIRAJU', origem: 'omie' });
  });
  it('não achou no Omie: fica a digitada, limpa', () => {
    expect(cidadeDoTrator({ Cliente: 'FULANO DE TAL', Cidade: 'AGUDOS FAZ SÃO DOMINGOS' }, omie)).toMatchObject({ chave: 'AGUDOS', origem: 'controle' });
  });
  it('homônimos: a do Omie que bate com a digitada, senão a digitada', () => {
    expect(cidadeDoTrator({ Cliente: 'JOSE DA SILVA', Cidade: 'Taguai' }, omie)).toMatchObject({ chave: 'TAGUAI', origem: 'omie' });
    expect(cidadeDoTrator({ Cliente: 'JOSE DA SILVA', Cidade: 'PIRAJU' }, omie)).toMatchObject({ chave: 'PIRAJU', origem: 'controle' });
  });
  it('trator da própria loja não pega cidade do Omie', () => {
    expect(cidadeDoTrator({ Cliente: 'NOVA TRATORES', Cidade: 'ESTOQUE' }, omie).origem).toBe('controle');
  });
  it('umaLetraDeDiferenca', () => {
    expect(umaLetraDeDiferenca('UGUCCIONE', 'UGUCCIONI')).toBe(true);
    expect(umaLetraDeDiferenca('ABC', 'AXY')).toBe(false);
  });
  it('território de Carlópolis conta os tratores pela cidade do Omie', () => {
    const vendidos = [
      { Chassis: 'A1', Modelo: 'JIVO', Cliente: 'PAULO ROGERIO DE LIMA', Cidade: 'CARLOPOLIS', Entrega: null },
      { Chassis: 'A2', Modelo: '6075E', Cliente: 'LUIZ ROGERIO UGUCCIONE', Cidade: 'PIRAJU', Entrega: null },
      { Chassis: 'A3', Modelo: '6075E', Cliente: 'LAUDAIR JUVENCIO NATAL', Cidade: 'RIBEIRÃO BONITO', Entrega: null },
      { Chassis: 'A4', Modelo: '9500', Cliente: 'FULANO', Cidade: 'PIRAJU', Entrega: null },
    ];
    const r = tratoresDoMunicipio('Carlópolis', vendidos, [], new Set(), (t) => cidadeDoTrator(t, omie).chave);
    expect(r.vendidos).toBe(3);
    expect(r.lista.find((x) => x.chassis_fim === 'A2')).toMatchObject({ cidade_controle: 'PIRAJU' });
    // sem a correção, como antes
    expect(tratoresDoMunicipio('Carlópolis', vendidos, [], new Set()).vendidos).toBe(1);
  });
});
