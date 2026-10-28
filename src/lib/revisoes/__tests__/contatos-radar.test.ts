import { describe, expect, it } from 'vitest';
import { escolherRevisao50, ordemDaFila, previsao300, previsaoPorHorimetro, retornoSugerido, situacaoContato, validarContato, vermelho, type Contato, type MarcoVenda, type OSRevisao } from '../contatos-radar';

const marcos = (venda: string, hoje: string): MarcoVenda[] => [30, 60, 90].map((dias) => {
  const d = new Date(Date.parse(venda) + dias * 86_400_000).toISOString().slice(0, 10);
  return { dias, data: d, passou: d <= hoje };
});
let n = 0;
const c = (marco: 30 | 60 | 90, resultado: Contato['resultado'], quando: string): Contato =>
  ({ id: String(++n), chave: 'k', marco, resultado, nota: null, user_nome: 'José', criado_em: quando });

describe('situacaoContato', () => {
  it('antes de 30 dias não cobra', () => {
    expect(situacaoContato(marcos('2026-10-01', '2026-10-20'), [], '2026-10-20').estado).toBe('antes');
  });
  it('fez 30 sem registro = ligar, com atraso', () => {
    const s = situacaoContato(marcos('2026-09-01', '2026-10-05'), [], '2026-10-05');
    expect(s).toMatchObject({ estado: 'ligar', marco: 30, atraso: 4 });
  });
  it('não atendeu conta tentativas', () => {
    const s = situacaoContato(marcos('2026-09-01', '2026-10-05'), [c(30, 'nao_atendeu', '2026-10-02'), c(30, 'nao_atendeu', '2026-10-03')], '2026-10-05');
    expect(s).toMatchObject({ estado: 'tentar', tentativas: 2 });
  });
  it('falou no 30 → falta orçamento; quando passa o 60 volta a pedir ligação', () => {
    const cs = [c(30, 'tudo_certo', '2026-10-02')];
    expect(situacaoContato(marcos('2026-09-01', '2026-10-05'), cs, '2026-10-05').estado).toBe('orcar');
    expect(situacaoContato(marcos('2026-09-01', '2026-11-02'), cs, '2026-11-02')).toMatchObject({ estado: 'ligar', marco: 60 });
  });
  it('falou no 60 cobre o 30 perdido', () => {
    const s = situacaoContato(marcos('2026-08-01', '2026-10-05'), [c(60, 'agendou_50h', '2026-10-01')], '2026-10-05');
    expect(s.estado).toBe('orcar');
  });
  it('problema fica em retorno até outra conversa', () => {
    const m = marcos('2026-09-01', '2026-10-10');
    expect(situacaoContato(m, [c(30, 'problema', '2026-10-02')], '2026-10-10').estado).toBe('retorno');
    expect(situacaoContato(m, [c(30, 'problema', '2026-10-02'), c(30, 'tudo_certo', '2026-10-06')], '2026-10-10').estado).toBe('orcar');
  });
  it('dispensado fecha o marco', () => {
    expect(situacaoContato(marcos('2026-09-01', '2026-10-05'), [c(30, 'dispensado', '2026-10-03')], '2026-10-05').estado).toBe('orcar');
  });
});

describe('sem a revisão de 50 h (motivo)', () => {
  const m = marcos('2026-06-01', '2026-10-01');
  const sr = (motivo: Contato['motivo'], horimetro: number | null, quando: string): Contato => ({ ...c(90, 'sem_revisao', quando), motivo, horimetro });
  it('passou de 90 dias sem orçamento = vermelho', () => {
    const s = situacaoContato(m, [], '2026-10-01', null, '2026-06-01');
    expect(vermelho(122, s)).toBe(true);
    expect(vermelho(80, s)).toBe(false);
  });
  it('ainda não deu as horas: prevê a 50 h pelo ritmo e espera', () => {
    // 20 h em 100 dias = 0,2 h/dia → faltam 30 h = 150 dias
    const s = situacaoContato(m, [sr('sem_horas', 20, '2026-09-09T12:00:00Z')], '2026-10-01', null, '2026-06-01');
    expect(s.estado).toBe('aguarda');
    expect(s.previsao).toMatchObject({ horasDia: 0.2, data50: '2027-02-06' });
    expect(vermelho(122, s)).toBe(false);
  });
  it('perto da data prevista volta a pedir o orçamento', () => {
    const s = situacaoContato(m, [sr('sem_horas', 45, '2026-09-09T12:00:00Z')], '2026-10-01', null, '2026-06-01');
    expect(s.estado).toBe('orcar');
  });
  it('outro motivo justifica', () => {
    expect(situacaoContato(m, [sr('outro_lugar', null, '2026-09-09T12:00:00Z')], '2026-10-01').estado).toBe('justificado');
  });
  it('validação pede horímetro e motivo', () => {
    expect(validarContato({ chave: 'k', marco: 90, resultado: 'sem_revisao' }).ok).toBe(false);
    expect(validarContato({ chave: 'k', marco: 90, resultado: 'sem_revisao', motivo: 'sem_horas' }).ok).toBe(false);
    expect(validarContato({ chave: 'k', marco: 90, resultado: 'sem_revisao', motivo: 'sem_horas', horimetro: '32,5' })).toMatchObject({ ok: true, horimetro: 32.5 });
    expect(previsaoPorHorimetro('2026-06-01', '2026-06-11', 60)?.data50).toBe('2026-06-11');
  });
});

describe('falar de novo (retorno combinado)', () => {
  const m = marcos('2026-06-01', '2026-10-01');
  const conv = (resultado: Contato['resultado'], retornar_em: string): Contato => ({ ...c(90, resultado, '2026-09-20T12:00:00Z'), retornar_em });
  it('de molho até a data; no dia volta para a fila', () => {
    expect(situacaoContato(m, [conv('tudo_certo', '2026-10-05')], '2026-10-01').estado).toBe('espera');
    expect(situacaoContato(m, [conv('tudo_certo', '2026-10-05')], '2026-10-05').estado).toBe('ligar');
    expect(situacaoContato(m, [conv('problema', '2026-09-25')], '2026-10-01').estado).toBe('retorno');
  });
  it('de molho não fica vermelho', () => {
    expect(vermelho(120, situacaoContato(m, [conv('tudo_certo', '2026-10-20')], '2026-10-01'))).toBe(false);
  });
  it('sugestão pela resposta', () => {
    expect(retornoSugerido('problema', null, '2026-10-01')).toBe('2026-10-04');
    expect(retornoSugerido('tudo_certo', null, '2026-10-01', '2026-10-08')).toBe('2026-10-08');
    expect(retornoSugerido('tudo_certo', null, '2026-10-01')).toBe('2026-10-16');
    expect(retornoSugerido('sem_revisao', 'sem_horas', '2026-10-01')).toBeNull();
    expect(retornoSugerido('sem_revisao', 'outro_lugar', '2026-10-01')).toBe('2026-10-31');
  });
});

describe('ordemDaFila', () => {
  it('quem fez o marco agora vem antes; não atendeu vai pro fim', () => {
    const s = (estado: 'ligar' | 'tentar', atraso: number) => ({ s: { estado, atraso, marco: 30 as const, tentativas: 0, conversa: null, historico: [] } });
    const fila = [s('tentar', 1), s('ligar', 40), s('ligar', 2), s('ligar', 10)].sort(ordemDaFila);
    expect(fila.map((x) => `${x.s.estado}${x.s.atraso}`)).toEqual(['ligar2', 'ligar40', 'ligar10', 'tentar1']);
  });
});

describe('validarContato', () => {
  it('problema e dispensar pedem anotação', () => {
    expect(validarContato({ chave: 'k', marco: 30, resultado: 'problema' }).ok).toBe(false);
    expect(validarContato({ chave: 'k', marco: 30, resultado: 'problema', nota: 'vazando óleo' }).ok).toBe(true);
    expect(validarContato({ chave: 'k', marco: 45, resultado: 'tudo_certo' }).ok).toBe(false);
  });
});

describe('revisão de 50 h', () => {
  const os = (p: Partial<OSRevisao>): OSRevisao => ({ id: 'OS-1', status: 'Orçamento enviado para o cliente e aguardando', horas: 50, chassiFinal: '0006198', data: '2026-10-22', dataFim: null, faturada: false, ...p });
  it('OS aberta tira da fila de ligação (orçado); concluída = feita', () => {
    const m = marcos('2026-09-01', '2026-10-25');
    const aberta = escolherRevisao50([os({})], null);
    expect(situacaoContato(m, [], '2026-10-25', aberta).estado).toBe('orcado');
    const feita = escolherRevisao50([os({ status: 'Concluída', dataFim: '2026-10-20' })], null);
    expect(feita).toMatchObject({ feita: true, dataFeita: '2026-10-20' });
    expect(situacaoContato(m, [], '2026-10-25', feita).estado).toBe('feita');
  });
  it('cancelada e outras horas não contam; o controle de revisões vale como feita', () => {
    expect(escolherRevisao50([os({ status: 'Cancelada' }), os({ horas: 300 })], null)).toBeNull();
    expect(escolherRevisao50([], '2026-10-01')).toMatchObject({ feita: true, origem: 'controle' });
  });
  it('300 h = 6 × os dias que levou até a 50 h', () => {
    expect(previsao300('2026-09-01', '2026-09-21', '2026-10-01')).toEqual({ diasAte50: 20, horasDia: 2.5, data300: '2026-12-30', diasFaltam: 90 });
  });
});
