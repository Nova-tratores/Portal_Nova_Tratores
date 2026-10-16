import { describe, expect, it } from 'vitest';
import {
  baldesDoPeriodo, csvRanking, fmtHoras, inicioSemana, montarRanking, periodoDoPreset, quebraSugerida, rotuloBalde,
  type DiaUso,
} from '../ranking-uso';

const d = (placa: string, data: string, km: number, ligado: number, motorista: string | null = null, lenta = 0): DiaUso => ({
  veiculo_id: `v-${placa}`, placa, modelo: 'Strada', data, motorista_nome: motorista, km, ligado_min: ligado, movimento_min: ligado - lenta, lenta_min: lenta,
});

describe('datas e baldes', () => {
  it('semana começa na segunda', () => {
    expect(inicioSemana('2026-10-15')).toBe('2026-10-12'); // quinta → segunda
    expect(inicioSemana('2026-10-18')).toBe('2026-10-12'); // domingo → segunda anterior
  });
  it('baldes incluem os vazios e viram o ano no mês', () => {
    expect(baldesDoPeriodo('2026-11-20', '2027-01-05', 'mes')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(baldesDoPeriodo('2026-10-01', '2026-10-03', 'dia')).toHaveLength(3);
    expect(baldesDoPeriodo('2026-10-14', '2026-10-20', 'semana')).toEqual(['2026-10-12', '2026-10-19']);
  });
  it('rótulos', () => {
    expect(rotuloBalde('2026-10', 'mes')).toBe('out/26');
    expect(rotuloBalde('2026-10-12', 'semana')).toBe('12/10–18/10');
    expect(rotuloBalde('2026-10-15', 'dia')).toBe('qui 15/10');
  });
});

describe('periodoDoPreset', () => {
  it('termina ontem (o dia de hoje ainda não fechou)', () => {
    expect(periodoDoPreset('mes', '2026-10-16')).toEqual({ de: '2026-10-01', ate: '2026-10-15' });
    expect(periodoDoPreset('30d', '2026-10-16')).toEqual({ de: '2026-09-16', ate: '2026-10-15' });
    expect(periodoDoPreset('mes_passado', '2026-10-16')).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
  });
  it('no 1º dia do mês / na segunda, cai no mês / semana passada', () => {
    expect(periodoDoPreset('mes', '2026-11-01')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodoDoPreset('semana', '2026-10-12')).toEqual({ de: '2026-10-05', ate: '2026-10-11' });
  });
  it('quebra sugerida pelo tamanho', () => {
    expect(quebraSugerida('2026-10-01', '2026-10-15')).toBe('dia');
    expect(quebraSugerida('2026-07-01', '2026-10-15')).toBe('semana');
    expect(quebraSugerida('2026-01-01', '2026-10-15')).toBe('mes');
  });
});

describe('montarRanking', () => {
  const dias = [
    d('AAA1111', '2026-10-13', 100, 120, 'GABRIEL GOMES', 10),
    d('AAA1111', '2026-10-14', 50, 60, 'Gabriel Gomes'),
    d('BBB2222', '2026-10-14', 300, 200, 'Vazio'),
    d('CCC3333', '2026-10-14', 0, 0, 'Zecca'), // parado: não conta
  ];
  it('por veículo, ordenado pela métrica', () => {
    const r = montarRanking(dias, 'veiculo', 'total', 'ligado');
    expect(r.map((l) => [l.nome, l.km, l.ligado, l.dias])).toEqual([['BBB2222', 300, 200, 1], ['AAA1111', 150, 180, 2]]);
    expect(r[1].detalhe).toBe('Strada · Gabriel Gomes');
  });
  it('por motorista junta grafias e "Vazio" vira Sem motorista', () => {
    const r = montarRanking(dias, 'motorista', 'semana', 'km');
    expect(r.map((l) => [l.nome, l.km])).toEqual([['Sem motorista', 300], ['Gabriel Gomes', 150]]);
    expect(r[1].porBalde['2026-10-12'].lenta).toBe(10);
  });
  it('CSV com a métrica por balde', () => {
    const r = montarRanking(dias, 'veiculo', 'dia', 'km');
    const csv = csvRanking(r, 'veiculo', 'dia', 'km', ['2026-10-13', '2026-10-14']);
    expect(csv.split('\n')[2]).toBe('2;AAA1111;Strada · Gabriel Gomes;2;150,0;3,0;2,8;0,2;75,0;100,0;50,0');
  });
  it('fmtHoras', () => {
    expect(fmtHoras(45)).toBe('45 min');
    expect(fmtHoras(307)).toBe('5h07');
  });
});
