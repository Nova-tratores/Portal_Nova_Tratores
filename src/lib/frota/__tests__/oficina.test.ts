import { describe, expect, it } from 'vitest';
import {
  diasParado, custoParado, paradoAgora, pecaAtrasada, planejarConclusao, podeIr, resumoEtapa, validarMudanca,
} from '../oficina';

const HOJE = '2026-11-04';

describe('etapas', () => {
  it('segue o fluxo combinado', () => {
    expect(podeIr('aberta', 'em_oficina')).toBe(true);
    expect(podeIr('aberta', 'pronta')).toBe(false);
    expect(podeIr('aguardando_peca', 'em_oficina')).toBe(true);
    expect(podeIr('pronta', 'em_oficina')).toBe(true);
    expect(podeIr('concluida', 'em_oficina')).toBe(false);
    expect(podeIr('cancelada', 'aberta')).toBe(false);
  });
});

describe('validarMudanca', () => {
  const aberta = { etapa: 'aberta' as const };
  it('entrar na oficina pede km e foto', () => {
    expect(validarMudanca(aberta, 'em_oficina', {}, HOJE)).toMatch(/km/);
    expect(validarMudanca(aberta, 'em_oficina', { km: 48000 }, HOJE)).toMatch(/foto/);
    expect(validarMudanca(aberta, 'em_oficina', { km: 48000, foto_url: 'x' }, HOJE)).toBeNull();
  });
  it('voltar de "aguardando peça" para a oficina não pede km de novo', () => {
    expect(validarMudanca({ etapa: 'aguardando_peca', km_entrada: 48000 }, 'em_oficina', {}, HOJE)).toBeNull();
  });
  it('aguardando peça pede peça e previsão não vencida', () => {
    const em = { etapa: 'em_oficina' as const };
    expect(validarMudanca(em, 'aguardando_peca', { previsao_peca: '2026-11-10' }, HOJE)).toMatch(/peça/);
    expect(validarMudanca(em, 'aguardando_peca', { peca: 'cilindro' }, HOJE)).toMatch(/previsão/);
    expect(validarMudanca(em, 'aguardando_peca', { peca: 'cilindro', previsao_peca: '2026-11-01' }, HOJE)).toMatch(/passado/);
    expect(validarMudanca(em, 'aguardando_peca', { peca: 'cilindro', previsao_peca: '2026-11-10' }, HOJE)).toBeNull();
  });
  it('entregar pede km com foto, quem retirou e km coerente', () => {
    const pronta = { etapa: 'pronta' as const, km_entrada: 48000 };
    expect(validarMudanca(pronta, 'concluida', { km: 48010, foto_url: 'x' }, HOJE)).toMatch(/retirou/);
    expect(validarMudanca(pronta, 'concluida', { km: 4801, foto_url: 'x', retirado_por: 'Danilo' }, HOJE)).toMatch(/menor/);
    expect(validarMudanca(pronta, 'concluida', { km: 47980, foto_url: 'x', retirado_por: 'Danilo' }, HOJE)).toBeNull();
  });
  it('não pula etapa e cancelar pede motivo', () => {
    expect(validarMudanca(aberta, 'concluida', { km: 1, foto_url: 'x', retirado_por: 'a' }, HOJE)).toMatch(/Não dá/);
    expect(validarMudanca(aberta, 'cancelada', {}, HOJE)).toMatch(/por que/);
  });
});

describe('parado', () => {
  const agora = Date.parse('2026-11-04T15:00:00Z');
  it('conta da entrada até ficar pronta, dia começado conta', () => {
    expect(diasParado({ etapa: 'em_oficina', imobiliza: true, entrada_em: '2026-11-04T12:00:00Z' }, agora)).toBe(1);
    expect(diasParado({ etapa: 'pronta', imobiliza: true, entrada_em: '2026-10-30T12:00:00Z', pronta_em: '2026-11-02T10:00:00Z' }, agora)).toBe(3);
    expect(diasParado({ etapa: 'em_oficina', imobiliza: false, entrada_em: '2026-10-30T12:00:00Z' }, agora)).toBe(0);
    expect(custoParado(3)).toBe(750);
  });
  it('parado agora só em oficina ou aguardando peça', () => {
    expect(paradoAgora({ etapa: 'aguardando_peca', imobiliza: true })).toBe(true);
    expect(paradoAgora({ etapa: 'pronta', imobiliza: true })).toBe(false);
    expect(paradoAgora({ etapa: 'aberta', imobiliza: true })).toBe(false);
  });
});

describe('conclusão e cartão', () => {
  it('item feito resolve a pendência e registra a preventiva; não feito fica', () => {
    const p = planejarConclusao([
      { id: '1', tipo: 'pendencia', pendencia_id: 'p1', feito: true },
      { id: '2', tipo: 'pendencia', pendencia_id: 'p2', feito: false },
      { id: '3', tipo: 'preventiva', plano_id: 'pl1', feito: true },
      { id: '4', tipo: 'avulso', feito: true },
    ]);
    expect(p).toEqual({ pendenciasResolver: ['p1'], planosServico: ['pl1'], naoFeitos: 1 });
  });
  it('resumo e peça atrasada', () => {
    const agora = Date.parse('2026-11-04T15:00:00Z');
    const os = { etapa: 'aguardando_peca' as const, imobiliza: true, etapa_desde: '2026-11-01T10:00:00Z', peca: 'cilindro', previsao_peca: '2026-11-03' };
    expect(resumoEtapa(os, agora)).toBe('há 3 dias · cilindro · previsão 03/11');
    expect(pecaAtrasada(os, HOJE)).toBe(true);
  });
});
