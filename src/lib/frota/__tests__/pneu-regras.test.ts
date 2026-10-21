// Fotos de pneu do checklist mensal conferidas pela IA: banda + lateral por pneu.
import { describe, it, expect } from 'vitest';
import { tipoFotoPneu, normalizarAnalise, avaliarPneus, resumoAnalise } from '../pneu-regras';
import { CHECKLIST_ITEMS, calcularScore } from '../checklist';

describe('fotos de pneu', () => {
  it('cada pneu (4 + estepe) tem foto da banda e da lateral', () => {
    const pneus = CHECKLIST_ITEMS.filter((i) => tipoFotoPneu(i.key));
    expect(pneus.length).toBe(10);
    expect(tipoFotoPneu('pneu_de')).toBe('banda');
    expect(tipoFotoPneu('estepe_lateral')).toBe('lateral');
    expect(tipoFotoPneu('crlv')).toBeNull();
  });

  it('normaliza a resposta da IA sem inventar campo', () => {
    const a = normalizarAnalise({ comprova: true, marca: 'Pirelli', medida: '175/70 R14', dot: 'xj 4f 2323', modelo: 'ilegível' }, 'lateral');
    expect(a).toMatchObject({ comprova: true, marca: 'Pirelli', modelo: null, dot: 'XJ 4F 2323', desgaste: null });
    const b = normalizarAnalise({ comprova: false }, 'banda');
    expect(b.motivo).toMatch(/sulcos/);
    expect(resumoAnalise(normalizarAnalise({ comprova: true, desgaste: 'meia vida' }, 'banda'))).toBe('IA: banda visível · meia-vida');
  });

  it('foto que não comprova, DOT repetido e pneu no limite viram alerta', () => {
    const lat = (dot: string) => normalizarAnalise({ comprova: true, marca: 'Pirelli', dot }, 'lateral');
    const r = avaliarPneus([
      { item_key: 'pneu_de', ia_analise: normalizarAnalise({ comprova: false, motivo: 'Só aparece a calota.' }, 'banda') },
      { item_key: 'pneu_dd', ia_analise: normalizarAnalise({ comprova: true, desgaste: 'no_limite' }, 'banda') },
      { item_key: 'pneu_te_lateral', ia_analise: lat('XJ4F 2323') },
      { item_key: 'pneu_td_lateral', ia_analise: lat('XJ4F 2323') },
      { item_key: 'crlv', ia_analise: null },
    ]);
    expect(r.penalidade).toBe(25);
    expect(r.alertas.join(' | ')).toMatch(/1 foto\(s\) de pneu não comprovam o item \(dianteiro esquerdo\)/);
    expect(r.alertas.join(' | ')).toMatch(/Mesmo DOT .* traseiro esquerdo e traseiro direito/);
    expect(r.alertas.join(' | ')).toMatch(/dianteiro direito no limite/);
  });

  it('o score do checklist desconta as fotos de pneu', () => {
    const itens = [{ item_key: 'pneu_de', resposta: 'ok', ia_analise: normalizarAnalise({ comprova: false }, 'banda') }];
    const { score, alertas } = calcularScore({ inicio_em: '2026-10-20T21:11:00Z' }, itens);
    expect(score).toBe(90);
    expect(alertas.some((a) => /pneu/.test(a))).toBe(true);
  });

  it('horário comercial no fuso de Brasília', () => {
    // 19h30 em Brasília = 22h30 UTC: não é fora do horário
    expect(calcularScore({ inicio_em: '2026-10-20T22:30:00Z' }, []).alertas).not.toContain('Checklist realizado fora do horário comercial');
    expect(calcularScore({ inicio_em: '2026-10-21T02:00:00Z' }, []).alertas).toContain('Checklist realizado fora do horário comercial');
  });
});
