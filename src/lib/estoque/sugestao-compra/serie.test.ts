import { describe, it, expect } from 'vitest';
import { montarSerie12m, ultimos12Meses, type MovimentoCru } from './serie';

const HOJE = new Date(2026, 0, 15); // 15/01/2026

function mov(data: string, cod: string, saida: number, ant: number, atual: number): MovimentoCru {
  const [ano, mes] = data.split('-').map(Number);
  return { data, ano, mes, cod_origem: cod, qtde_saida: saida, qtde_anterior: ant, qtde_atual: atual };
}

describe('ultimos12Meses', () => {
  it('gera 12 meses terminando no mês corrente', () => {
    const m = ultimos12Meses(HOJE);
    expect(m.length).toBe(12);
    expect(m[11]).toEqual({ ano: 2026, mes: 1 });
    expect(m[0]).toEqual({ ano: 2025, mes: 2 });
  });
});

describe('montarSerie12m — demanda (whitelist VEN, sinal trocado)', () => {
  it('soma só VEN e inverte o sinal negativo', () => {
    const movs = [
      mov('2025-06-10', 'VEN', -3, 10, 7),
      mov('2025-06-20', 'VEN', -2, 7, 5),
      mov('2025-06-25', 'AJU', -5, 5, 0), // ajuste: NÃO conta como demanda
      mov('2025-06-28', 'COM', 0, 0, 40), // compra: entrada, não demanda
    ];
    const s = montarSerie12m(movs, HOJE);
    const jun = s.find((x) => x.ano === 2025 && x.mes === 6)!;
    expect(jun.demanda).toBe(5); // 3 + 2, só VEN
  });
});

describe('montarSerie12m — dias com saldo positivo (censura)', () => {
  it('mês inteiro positivo = todos os dias', () => {
    const movs = [mov('2025-06-10', 'VEN', -3, 10, 7)];
    const s = montarSerie12m(movs, HOJE);
    const jun = s.find((x) => x.mes === 6 && x.ano === 2025)!;
    // saldo de entrada herdado = 0 (nenhum movimento antes da janela)... mas o
    // primeiro movimento é dentro do mês. Antes do dia 10 o saldo era 10 (qtde_anterior)?
    // A série herda o saldo de ENTRADA do mês do fim do mês anterior; como não há
    // movimento anterior, entra 0 → dias 1..9 = 0, dias 10..30 = 7>0 → 21 dias.
    expect(jun.diasComSaldoPositivo).toBe(21);
  });

  it('item que zera no meio do mês conta só os dias com saldo', () => {
    const movs = [
      mov('2025-05-31', 'VEN', -1, 6, 5), // fecha maio com saldo 5 (entra em junho)
      mov('2025-06-16', 'VEN', -5, 5, 0), // zera no dia 16
    ];
    const s = montarSerie12m(movs, HOJE);
    const jun = s.find((x) => x.mes === 6 && x.ano === 2025)!;
    // dias 1..15 saldo 5 (>0), dia 16..30 saldo 0 → 15 dias positivos
    expect(jun.diasComSaldoPositivo).toBe(15);
    expect(jun.demanda).toBe(5);
  });

  it('mês sem movimento herda o saldo do mês anterior', () => {
    const movs = [
      mov('2025-05-20', 'VEN', -2, 10, 8), // maio fecha em 8
      // junho sem movimento
      mov('2025-07-10', 'VEN', -3, 8, 5),
    ];
    const s = montarSerie12m(movs, HOJE);
    const jun = s.find((x) => x.mes === 6 && x.ano === 2025)!;
    expect(jun.demanda).toBe(0);
    expect(jun.diasComSaldoPositivo).toBe(30); // saldo herdado 8 > 0 o mês todo
  });

  it('mês sem movimento e saldo herdado zero = zero dias', () => {
    const movs = [
      mov('2025-05-20', 'VEN', -8, 8, 0), // maio zera
      mov('2025-07-10', 'COM', 0, 0, 20),
    ];
    const s = montarSerie12m(movs, HOJE);
    const jun = s.find((x) => x.mes === 6 && x.ano === 2025)!;
    expect(jun.diasComSaldoPositivo).toBe(0);
  });
});
