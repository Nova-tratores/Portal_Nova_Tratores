import { describe, it, expect } from 'vitest';
import { garantiasDaFicha, situacaoVinculo, sugerirGarantias, mesmaMontadora, validarMotivoSemGarantia, type GarantiaCandidata } from '../retorno-vinculo';

const g = (p: Partial<GarantiaCandidata>): GarantiaCandidata => ({
  id: p.numero || 'x', numero: 'GAR-0001', numero_externo: null, status: 'aprovada', cliente: null, id_ordem: null,
  devolucao_status: 'nao_aplicavel', montadora: null, pecas: [], created_at: '2026-10-01', ...p,
});

describe('vínculo da devolução com a garantia', () => {
  it('lê as garantias da coluna nova ou da antiga', () => {
    expect(garantiasDaFicha({ status: 'faturada', garantia_ids: ['a', 'a', 'b'] })).toEqual(['a', 'b']);
    expect(garantiasDaFicha({ status: 'faturada', garantia_id: 'c', garantia_ids: [] })).toEqual(['c']);
    expect(garantiasDaFicha({ status: 'faturada' })).toEqual([]);
  });

  it('só devolução faturada sem garantia é pendência', () => {
    expect(situacaoVinculo({ status: 'faturada' })).toBe('pendente');
    expect(situacaoVinculo({ status: 'criada' })).toBe('nao_se_aplica');
    expect(situacaoVinculo({ status: 'faturada', garantia_ids: ['a'] })).toBe('ligada');
    expect(situacaoVinculo({ status: 'faturada', sem_garantia_em: '2026-11-26' })).toBe('sem_garantia');
  });

  it('sugere pela peça (caso Kuhn B0367244 → GAR-0099/0100) e ordena por pontos', () => {
    const cands = [
      g({ id: '99', numero: 'GAR-0099', montadora: 'Kuhn', devolucao_status: 'pendente', pecas: [{ cod_produto: 'B0367244', descricao: 'GRADE' }] }),
      g({ id: '50', numero: 'GAR-0050', montadora: 'Mahindra', pecas: [{ cod_produto: 'B0367244', descricao: 'GRADE' }] }),
      g({ id: '44', numero: 'GAR-0044', montadora: 'Ventura', devolucao_status: 'pendente', pecas: [{ cod_produto: '010667', descricao: 'POLIA' }] }),
      g({ id: 'cx', numero: 'GAR-0101', status: 'cancelada', montadora: 'Kuhn', pecas: [{ cod_produto: 'B0367244', descricao: 'GRADE' }] }),
    ];
    const s = sugerirGarantias([{ codigo: 'B0367244', descricao: 'GRADE DE PROTECAO TRASEIRA' }], 'KUHN DO BRASIL S/A - SJ', cands);
    expect(s.map((x) => x.numero)).toEqual(['GAR-0099', 'GAR-0050']);
    expect(s[0].mesmaMontadora).toBe(true);
    expect(s[0].motivo).toContain('devolução pendente');
  });

  it('código da nota com sufixo/RP casa pela normalização; sem peça não sugere', () => {
    const cands = [g({ id: 'm', numero: 'GAR-0070', pecas: [{ cod_produto: '0541054496R-0', descricao: 'COLETOR' }] })];
    expect(sugerirGarantias([{ codigo: '0541054496R0', descricao: 'COLETOR' }], 'MARCHESAN', cands)).toHaveLength(1);
    expect(sugerirGarantias([{ codigo: 'X999999', descricao: 'OUTRA' }], 'MARCHESAN', cands)).toHaveLength(0);
  });

  it('montadora pelo 1º nome na razão social', () => {
    expect(mesmaMontadora('Mahindra', 'MAHINDRA & MAHINDRA DO BRASIL')).toBe(true);
    expect(mesmaMontadora('Kuhn', 'MARCHESAN IMPLEMENTOS')).toBe(false);
    expect(mesmaMontadora(null, 'KUHN')).toBe(false);
  });

  it('motivo do "sem garantia" é obrigatório', () => {
    expect(validarMotivoSemGarantia('')).toBeTruthy();
    expect(validarMotivoSemGarantia('peça de estoque, não é de garantia de cliente')).toBeNull();
  });
});
