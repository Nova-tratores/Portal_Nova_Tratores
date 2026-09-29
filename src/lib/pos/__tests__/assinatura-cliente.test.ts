import { describe, it, expect } from 'vitest';
import { mensagemAssinatura, resumirSolicitacao, type ResumoOS } from '../assinatura-cliente';

const base: ResumoOS = { osId: 'OS-0494', numero: '5069', cliente: 'PEDRO ALCANTARA RIBEIRO NETO', tipoServico: 'Revisão', servico: 'REV 900H', data: '24/06/2026', tecnico: 'GABRIEL', trator: '6075E CAB', chassi: 'MDI07513LS0006165', horimetro: '898,3 h', revisaoHoras: 900 };

describe('mensagemAssinatura', () => {
  it('revisão: fala do cheque de revisão e do chassi', () => {
    const m = mensagemAssinatura(base, 'https://p/assinar/x');
    expect(m).toContain('Olá, PEDRO!');
    expect(m).toContain('revisão de 900 horas');
    expect(m).toContain('6075E CAB');
    expect(m).toContain('6165');
    expect(m).toContain('cheque de revisão');
    expect(m).toContain('https://p/assinar/x');
  });
  it('serviço comum: fala da ordem de serviço', () => {
    const m = mensagemAssinatura({ ...base, revisaoHoras: null, tipoServico: 'Manutenção' }, 'https://p/assinar/y');
    expect(m).toContain('ordem de serviço nº 5069');
    expect(m).toContain('realizado em 24/06/2026');
    expect(m).not.toContain('cheque');
  });
});

describe('resumirSolicitacao', () => {
  it('pega a linha "Solicitação do cliente"', () => {
    expect(resumirSolicitacao('Modelo: 6075E\nChassis: X\nHorimetro: 300\n\nSolicitação do cliente: Revisão de 300 Horas\nServiço Realizado: ...')).toBe('Revisão de 300 Horas');
  });
  it('sem o rótulo, pega a primeira linha útil e corta o excesso', () => {
    expect(resumirSolicitacao('Modelo: 6075\nTroca de embreagem')).toBe('Troca de embreagem');
    expect(resumirSolicitacao('x'.repeat(200)).length).toBe(140);
    expect(resumirSolicitacao(null)).toBe('');
  });
});
