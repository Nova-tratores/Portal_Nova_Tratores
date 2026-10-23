import { describe, expect, it } from 'vitest';
import {
  diasAberta, diasAteFinanceiro, gruposDuplicados, itensAtencao, mediana, normalizarStatus, normalizarTipo,
  parecidas, porMes, sugerir, valorReq,
} from '../inteligencia';

const hoje = new Date(2026, 9, 23, 12); // 23/10/2026

describe('normalização', () => {
  it('junta as grafias do mesmo tipo e o status maiúsculo', () => {
    expect(normalizarTipo('Peça')).toBe('Peças');
    expect(normalizarTipo('Frota-Veiculos')).toBe('Frota-Veículos');
    expect(normalizarTipo('')).toBe('Sem tipo');
    expect(normalizarStatus('FINANCEIRO')).toBe('financeiro');
    expect(normalizarStatus(null)).toBe('pedido');
  });
  it('lê valor BR e US', () => {
    expect(valorReq({ valor_despeza: '1.550,00' })).toBe(1550);
    expect(valorReq({ valor_despeza: '800.00' })).toBe(800);
  });
});

describe('atenção', () => {
  const reqs = [
    { id: 1, status: 'aguardando', data: '2026-09-01', fornecedor: 'X', valor_despeza: '100,00' },   // 52 dias
    { id: 2, status: 'pedido', data: '2026-10-10', fornecedor: '', valor_despeza: '900,00' },        // 13 dias, sem forn, alto
    { id: 3, status: 'financeiro', data: '2026-10-01', fornecedor: 'Y', valor_despeza: '50' },       // sem doc
    { id: 4, status: 'financeiro', data: '2026-10-01', fornecedor: 'Y', valor_despeza: '50', foto_nf: 'a.jpg' },
    { id: 5, status: 'FINANCEIRO', data: '2026-10-01', obs: 'Fase original: x', valor_despeza: '10' }, // importada
    { id: 6, status: 'pedido', data: '2026-10-22', fornecedor: 'Z', valor_despeza: '10' },
  ];
  it('separa parada 30, parada 7, sem nota, valor alto e sem fornecedor', () => {
    const a = Object.fromEntries(itensAtencao(reqs, hoje).map((i) => [i.chave, i.ids]));
    expect(a.parada30).toEqual([1]);
    expect(a.parada7).toEqual([2]);
    expect(a.semDocumento).toEqual([3]);
    expect(a.valorAlto).toEqual([2]);
    expect(a.semFornecedor).toEqual([2]);
    expect(a.duplicadas).toEqual([3, 4]);
  });
  it('dias aberta só para fase aberta', () => {
    expect(diasAberta(reqs[0], hoje)).toBe(52);
    expect(diasAberta(reqs[2], hoje)).toBeNull();
  });
  it('duplicadas ignoram lixeira e quem não tem fornecedor', () => {
    expect(gruposDuplicados([{ id: 1, fornecedor: 'A', valor_despeza: '5', data: '2026-01-01' }, { id: 2, fornecedor: 'a ', valor_despeza: '5,00', data: '2026-01-01' }])).toEqual([[1, 2]]);
    expect(gruposDuplicados([{ id: 1, fornecedor: 'A', valor_despeza: '5', data: '2026-01-01', status: 'lixeira' }, { id: 2, fornecedor: 'A', valor_despeza: '5', data: '2026-01-01' }])).toEqual([]);
  });
});

describe('sugestão pelo histórico', () => {
  const base = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: i, tipo: 'Veicular Abastecimento', fornecedor: 'AUTO POSTO 2001', valor_despeza: '200,00', veiculo: '7' })),
    { id: 10, tipo: 'Veicular Abastecimento', fornecedor: 'OUTRO', valor_despeza: '150,00', veiculo: '9' },
  ];
  it('sugere o fornecedor e o valor de costume do carro', () => {
    const s = sugerir(base, { tipo: 'Veicular Abastecimento', veiculo: '7' })!;
    expect(s.fornecedor).toBe('AUTO POSTO 2001');
    expect(s.valores).toEqual([200]);
    expect(s.porCarro).toBe(true);
  });
  it('sem histórico suficiente não sugere', () => {
    expect(sugerir(base.slice(0, 2), { tipo: 'Veicular Abastecimento' })).toBeNull();
    expect(sugerir(base, { tipo: 'Hospedagem' })).toBeNull();
    expect(sugerir(base, {})).toBeNull();
  });
});

describe('parecidas antes de criar', () => {
  const reqs = [
    { id: 1, tipo: 'Veicular Manutenção', veiculo: '7', data: '2026-10-20', titulo: 'TROCA DE OLEO' },
    { id: 2, tipo: 'Veicular Manutenção', veiculo: '7', data: '2026-09-01', titulo: 'TROCA DE OLEO' },
    { id: 3, tipo: 'Peças', data: '2026-10-21', titulo: 'Filtro de ar' },
  ];
  it('mesmo carro nos últimos 15 dias ou mesmo título', () => {
    expect(parecidas(reqs, { tipo: 'Veicular Manutenção', veiculo: '7' }, hoje).map((r) => r.id)).toEqual([1]);
    expect(parecidas(reqs, { tipo: 'Peça', titulo: 'filtro de  AR' }, hoje).map((r) => r.id)).toEqual([3]);
    expect(parecidas(reqs, { tipo: 'Peças', titulo: 'outra' }, hoje)).toEqual([]);
  });
});

describe('painel', () => {
  it('soma por mês nos últimos meses', () => {
    const m = porMes([{ id: 1, data: '2026-10-05', valor_despeza: '10' }, { id: 2, data: '2026-09-05', valor_despeza: '5' }, { id: 3, data: '2025-01-01', valor_despeza: '9' }], hoje, 2);
    expect(m.map((x) => [x.chave, x.valor])).toEqual([['2026-09', 5], ['2026-10', 10]]);
  });
  it('dias até o financeiro e mediana', () => {
    expect(diasAteFinanceiro({ status: 'financeiro', data: '2026-10-01', enviado_financeiro_data: '2026-10-07' })).toBe(6);
    expect(diasAteFinanceiro({ status: 'pedido', data: '2026-10-01', enviado_financeiro_data: '2026-10-07' })).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([])).toBeNull();
  });
});
