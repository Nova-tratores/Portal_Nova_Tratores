import { describe, it, expect } from 'vitest';
import { ehItemMaquina, separarMaquinas, juntarItens } from '../recebimento-maquina';

// Itens reais (descrições/NCM) do espelho recebimentos_nfe, 10/2026.
const trator = { nSequencia: 1, cCodigo: '6075E', cDescricao: 'MAHINDRA 6075E V.CAB BR PH2 V1 14.9X24R1', cNCM: '8701.93.00', nQtde: 1, nValUnit: 202000, vTotal: 202000 };
const jivo = { nSequencia: 1, cCodigo: 'JIVO', cDescricao: 'VEICULO NOVO MAHINDRA TRATOR JIVO 2025', cNCM: '8701.91.00.01', nQtde: 1, nValUnit: 71427, vTotal: 71427 };
const afofador = { nSequencia: 2, cCodigo: 'VNF', cDescricao: 'AFOFADOR 2 LINHAS VNF-E100', cNCM: '8432.29.00', nQtde: 1, nValUnit: 11700, vTotal: 11700 };
const marcador = { nSequencia: 3, cCodigo: 'ML', cDescricao: 'MARCADOR LINHA HIDR. FLEX 12/13', cNCM: '8432.90.90', nQtde: 2, nValUnit: 11206.9, vTotal: 22413.8 };
const tanque = { nSequencia: 4, cCodigo: 'TQ', cDescricao: 'TANQUE MONTAGEM TANQUE 2000', cNCM: '8424.90.90', nQtde: 1, nValUnit: 13895.39, vTotal: 13895.39 };
const filtro = { nSequencia: 5, cCodigo: '0006', cDescricao: 'FILTRO DE OLEO', cNCM: '8421.23.00', nQtde: 4, nValUnit: 80, vTotal: 320 };
const pistola = { nSequencia: 6, cCodigo: 'PDR', cDescricao: 'BERLINER PISTOLA GRAVIDADE', cNCM: '8424.20.00', nQtde: 1, nValUnit: 135.9, vTotal: 135.9 };
const carreta = { nSequencia: 7, cCodigo: 'TR997', cDescricao: 'CARRETA AG. 6 TON TR-997', cNCM: '8716.20.00', nQtde: 1, nValUnit: 14883.02, vTotal: 14883.02 };
const quadri = { nSequencia: 8, cCodigo: 'L550', cDescricao: 'QUADRICICLO VENTURA LAND FORCE L550', cNCM: '8703.21.00', nQtde: 1, nValUnit: 30000, vTotal: 30000 };

describe('ehItemMaquina', () => {
  it('trator Mahindra (8701) é máquina, com ou sem pontos no NCM', () => {
    expect(ehItemMaquina(trator)).toBe(true);
    expect(ehItemMaquina(jivo)).toBe(true);
    expect(ehItemMaquina({ cNCM: '87019300' })).toBe(true);
  });
  it('implemento barato continua sendo máquina (sem piso de valor)', () => {
    expect(ehItemMaquina(afofador)).toBe(true);
    expect(ehItemMaquina(carreta)).toBe(true);
    expect(ehItemMaquina(quadri)).toBe(true);
  });
  it('posições .90 (partes) e peças comuns não são máquina, mesmo caras', () => {
    expect(ehItemMaquina(marcador)).toBe(false);
    expect(ehItemMaquina(tanque)).toBe(false);
    expect(ehItemMaquina(filtro)).toBe(false);
    expect(ehItemMaquina(pistola)).toBe(false);
  });
  it('NCM vazio ou curto não é máquina', () => {
    expect(ehItemMaquina({ cNCM: '' })).toBe(false);
    expect(ehItemMaquina({})).toBe(false);
    expect(ehItemMaquina({ cNCM: '87' })).toBe(false);
  });
});

describe('separarMaquinas', () => {
  it('NF de 2 tratores: qtd e valor somados, produtos intactos', () => {
    const t2 = { ...trator, nSequencia: 2 };
    const r = separarMaquinas([trator, t2]);
    expect(r.qtd_maquinas).toBe(2);
    expect(r.valor_maquinas).toBe(404000);
    expect(r.maquinas).toHaveLength(2);
  });
  it('quantidade da linha conta unidades', () => {
    const r = separarMaquinas([{ ...afofador, nQtde: 3, vTotal: 35100 }]);
    expect(r.qtd_maquinas).toBe(3);
    expect(r.valor_maquinas).toBe(35100);
  });
  it('NF só de peças não tem máquina', () => {
    expect(separarMaquinas([filtro, marcador, tanque])).toEqual({ maquinas: [], qtd_maquinas: 0, valor_maquinas: 0 });
  });
  it('sem vTotal usa nValUnit × quantidade', () => {
    const r = separarMaquinas([{ cNCM: '8701.93.00', nQtde: 2, nValUnit: 100000 }]);
    expect(r.valor_maquinas).toBe(200000);
  });
});

describe('juntarItens', () => {
  it('linha nova (máquina nas duas listas) não repete', () => {
    const produtos = [trator, filtro];
    const { maquinas } = separarMaquinas(produtos);
    expect(juntarItens(maquinas, produtos)).toHaveLength(2);
  });
  it('linha antiga (máquina só em maquinas) mantém os dois', () => {
    expect(juntarItens([trator], [filtro])).toHaveLength(2);
  });
});
