import { describe, it, expect } from 'vitest';
import { situacaoPreventiva, resumirPreventivas, gravidadePreventiva, somarMeses, type ItemPlano } from '../preventiva';

const AGORA = new Date('2026-10-10T12:00:00Z').getTime();
const oleo: ItemPlano = { id: 'p1', nome: 'Óleo e filtro', intervalo_km: 10000, intervalo_horas: null, intervalo_meses: 6 };

describe('situacaoPreventiva', () => {
  it('sem serviço registrado → sem histórico', () => {
    const s = situacaoPreventiva(oleo, null, { agora: AGORA, kmAtual: 50000, horasDesdeUltimo: null });
    expect(s.estado).toBe('sem_historico');
    expect(s.texto).toMatch(/última vez/);
  });

  it('km manda quando vence primeiro', () => {
    const s = situacaoPreventiva(oleo, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: 49520, horasDesdeUltimo: null });
    expect(s.estado).toBe('em_breve');
    expect(s.regua).toBe('km');
    expect(s.texto).toBe('faltam 480 km');
  });

  it('data manda quando o carro roda pouco', () => {
    const s = situacaoPreventiva(oleo, { data: '2026-04-01', km: 40000 }, { agora: AGORA, kmAtual: 42000, horasDesdeUltimo: null });
    expect(s.estado).toBe('vencida');
    expect(s.regua).toBe('data');
    expect(s.proximaData).toBe('2026-10-01');
    expect(s.texto).toBe('vencida há 9 dias');
  });

  it('horas de motor (munck) e o aviso padrão de 25 h', () => {
    const braco: ItemPlano = { id: 'p2', nome: 'Óleo hidráulico', intervalo_km: null, intervalo_horas: 500, intervalo_meses: 12 };
    const s = situacaoPreventiva(braco, { data: '2026-06-01', km: null }, { agora: AGORA, kmAtual: null, horasDesdeUltimo: 480 });
    expect(s.estado).toBe('em_breve');
    expect(s.regua).toBe('horas');
    expect(s.texto).toBe('faltam 20 h');
  });

  it('modo fixo: fazer antes não empurra o marco do manual', () => {
    const fixo = { ...oleo, intervalo_meses: null, modo: 'fixo' as const };
    const s = situacaoPreventiva(fixo, { data: '2026-08-01', km: 19200 }, { agora: AGORA, kmAtual: 19500, horasDesdeUltimo: null });
    expect(s.proximoKm).toBe(20000);
    const desl = situacaoPreventiva({ ...fixo, modo: 'deslizante' }, { data: '2026-08-01', km: 19200 }, { agora: AGORA, kmAtual: 19500, horasDesdeUltimo: null });
    expect(desl.proximoKm).toBe(29200);
  });

  it('plano só por km sem km do carro → sem leitura; km incerto ganha "?"', () => {
    const soKm = { ...oleo, intervalo_meses: null };
    expect(situacaoPreventiva(soKm, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: null, horasDesdeUltimo: null }).estado).toBe('sem_leitura');
    const s = situacaoPreventiva(soKm, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: 45000, kmIncerto: true, horasDesdeUltimo: null });
    expect(s.texto).toBe('faltam 5.000 km ?');
  });
});

describe('resumo e gravidade', () => {
  it('% em dia só conta itens com régua calculada', () => {
    const r = resumirPreventivas(['em_dia', 'em_breve', 'vencida', 'vencida', 'sem_historico', 'sem_leitura']);
    expect(r.pctEmDia).toBe(50);
    expect(r.sem_historico).toBe(1);
    expect(resumirPreventivas(['sem_historico']).pctEmDia).toBeNull();
  });

  it('em breve = leve; vencida = média; vencida mais de 20% do intervalo = grave', () => {
    const base = situacaoPreventiva(oleo, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: 49520, horasDesdeUltimo: null });
    expect(gravidadePreventiva(oleo, base)).toBe('leve');
    const pouco = situacaoPreventiva(oleo, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: 51000, horasDesdeUltimo: null });
    expect(gravidadePreventiva(oleo, pouco)).toBe('media');
    const muito = situacaoPreventiva(oleo, { data: '2026-08-01', km: 40000 }, { agora: AGORA, kmAtual: 53000, horasDesdeUltimo: null });
    expect(gravidadePreventiva(oleo, muito)).toBe('grave');
  });

  it('somarMeses respeita o fim do mês', () => {
    expect(somarMeses('2026-08-31', 6)).toBe('2027-02-28');
  });
});
