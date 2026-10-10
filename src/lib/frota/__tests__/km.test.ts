import { describe, it, expect } from 'vitest';
import { kmAtual, validarLeitura, sugerirCorrecao, type Leitura } from '../km';

const AGORA = new Date('2026-10-10T15:00:00').getTime();
const L = (em: string, km: number, fonte: Leitura['fonte'], situacao?: Leitura['situacao']): Leitura => ({ em, km, fonte, situacao });

describe('kmAtual — âncora + delta', () => {
  it('foto do painel + o que o rastreador rodou depois', () => {
    const r = kmAtual({
      agora: AGORA,
      humanas: [L('2026-10-02T09:00:00', 47908, 'painel_foto')],
      digitadas: [],
      odometro: { data: '2026-10-09', km: 47000 }, // offset do rastreador não importa
      dias: [{ data: '2026-10-02', km: 30 }, { data: '2026-10-03', km: 200 }, { data: '2026-10-08', km: 212 }],
    });
    expect(r.km).toBe(47908 + 200 + 212); // o dia da própria leitura não soma
    expect(r.base).toBe('ancora');
    expect(r.selo).toBe('verde');
    expect(r.descricao).toMatch(/foto do painel 02\/10 \+ 412 km do rastreador/);
  });

  it('sem leitura humana: vale o rastreador (odômetro + dias seguintes)', () => {
    const r = kmAtual({ agora: AGORA, humanas: [], digitadas: [], odometro: { data: '2026-10-08', km: 84000 }, dias: [{ data: '2026-10-09', km: 312 }] });
    expect(r.km).toBe(84312);
    expect(r.base).toBe('rastreador');
  });

  it('sem rastreador: âncora + maior hodômetro digitado coerente depois dela', () => {
    const r = kmAtual({
      agora: AGORA,
      humanas: [L('2026-09-01', 50000, 'checklist')],
      digitadas: [L('2026-09-20', 51200, 'abastecimento'), L('2026-10-05', 5180, 'abastecimento'), L('2026-10-06', 52300, 'requisicao')],
      odometro: null, dias: [],
    });
    expect(r.km).toBe(52300); // o 5180 (dígito a menos) ficou fora
  });

  it('leitura humana que volta muito fica fora e é listada; a suspeita gravada também', () => {
    const r = kmAtual({
      agora: AGORA,
      humanas: [L('2026-09-01', 60000, 'checklist'), L('2026-09-15', 6100, 'painel_foto'), L('2026-09-20', 61000, 'painel_foto', 'suspeita')],
      digitadas: [], odometro: null, dias: [],
    });
    expect(r.km).toBe(60000);
    expect(r.ignoradas.map((i) => i.leitura.km)).toEqual([6100, 61000]);
  });

  it('ajuste do gestor vale mesmo destoando (é a correção)', () => {
    const r = kmAtual({
      agora: AGORA,
      humanas: [L('2026-09-01', 60000, 'checklist'), L('2026-09-10', 58000, 'ajuste_gestor')],
      digitadas: [], odometro: null, dias: [],
    });
    expect(r.km).toBe(58000);
  });

  it('âncora velha fica âmbar/vermelha; sem nada = cinza', () => {
    expect(kmAtual({ agora: AGORA, humanas: [L('2026-09-10', 1000, 'painel_foto')], digitadas: [], odometro: null, dias: [] }).selo).toBe('ambar');
    expect(kmAtual({ agora: AGORA, humanas: [L('2026-07-01', 1000, 'painel_foto')], digitadas: [], odometro: null, dias: [] }).selo).toBe('vermelho');
    expect(kmAtual({ agora: AGORA, humanas: [], digitadas: [], odometro: null, dias: [] }).selo).toBe('cinza');
  });
});

describe('validarLeitura', () => {
  it('regressão acima da tolerância e salto por dia viram suspeita', () => {
    const ant = { km: 48000, em: '2026-10-01' };
    expect(validarLeitura({ km: 47960, em: '2026-10-05' }, { anterior: ant, esperado: null }).situacao).toBe('aceita');
    expect(validarLeitura({ km: 47900, em: '2026-10-05' }, { anterior: ant, esperado: null }).situacao).toBe('suspeita');
    expect(validarLeitura({ km: 52000, em: '2026-10-02' }, { anterior: ant, esperado: null }).situacao).toBe('suspeita');
    // caminhão pode rodar mais por dia
    expect(validarLeitura({ km: 48900, em: '2026-10-02' }, { anterior: ant, esperado: null, tipo: 'caminhao' }).situacao).toBe('aceita');
  });

  it('sugere o número provável quando parece erro de dígito', () => {
    const v = validarLeitura({ km: 4832, em: '2026-10-10' }, { anterior: { km: 47908, em: '2026-10-02' }, esperado: 48320 });
    expect(v.situacao).toBe('suspeita');
    expect(v.sugestao).toBe(48320);
    expect(sugerirCorrecao(84320, 48320)).toBe(48320); // dígitos vizinhos trocados
    expect(sugerirCorrecao(12345, 48320)).toBeNull();
  });
});

describe('kmAtual — digitado + rastreador', () => {
  it('sem âncora e com GPS: último hodômetro coerente + km dos dias seguintes', () => {
    const r = kmAtual({
      agora: AGORA, humanas: [], odometro: null,
      digitadas: [L('2026-10-01', 199000, 'requisicao')],
      dias: [{ data: '2026-10-01', km: 50 }, { data: '2026-10-05', km: 143 }, { data: '2026-10-09', km: 118 }],
    });
    expect(r.km).toBe(199261);
    expect(r.base).toBe('digitado');
    expect(r.selo).toBe('ambar');
  });
});
