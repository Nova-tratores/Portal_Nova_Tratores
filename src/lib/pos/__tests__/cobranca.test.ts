import { describe, expect, it } from 'vitest';
import { OPCOES_PAGAMENTO, ehMensagemDeCobranca, mensagemAssinaturaCobranca, normalizarPagamento, perguntaPagamento } from '../cobranca';

describe('cobrança — forma de pagamento', () => {
  it('tem as 5 opções na ordem da tela', () => {
    expect([...OPCOES_PAGAMENTO]).toEqual(['30 dias', '30/60', '30/60/90', '30/60/90/120', 'À vista']);
  });

  it('normaliza o que foi digitado/salvo no NovaZap', () => {
    expect(normalizarPagamento('30 dias')).toBe('30 dias');
    expect(normalizarPagamento('30')).toBe('30 dias');
    expect(normalizarPagamento('30/60/90')).toBe('30/60/90');
    expect(normalizarPagamento('30 / 60 / 90 / 120 dias')).toBe('30/60/90/120');
    expect(normalizarPagamento('a vista')).toBe('À vista');
    expect(normalizarPagamento('À VISTA')).toBe('À vista');
    expect(normalizarPagamento('')).toBeNull();
    expect(normalizarPagamento('boleto 45 dias')).toBeNull();
  });

  it('monta a pergunta do jeito que o José pediu', () => {
    expect(perguntaPagamento('30 dias')).toBe('Posso fechar o serviço para 30 dias?');
    expect(perguntaPagamento('30/60')).toBe('Posso fechar o serviço para 30/60 dias?');
    expect(perguntaPagamento('30/60/90/120')).toBe('Posso fechar o serviço para 30/60/90/120 dias?');
    expect(perguntaPagamento('À vista')).toBe('Posso fechar o serviço à vista?');
    expect(perguntaPagamento('')).toBe('');
    // texto livre antigo (preferência salva antes das opções) continua saindo
    expect(perguntaPagamento('45 dias')).toBe('Posso fechar o serviço para 45 dias?');
  });
});

describe('cobrança — link de assinatura', () => {
  const link = 'https://portal.novatratores.com/assinar/abc';

  it('revisão explica que o cheque vai pra fábrica', () => {
    const m = mensagemAssinaturaCobranca({ revisaoHoras: 900, numero: '5069', trator: '6075E CAB' }, link);
    expect(m).toContain('revisão de 900 horas');
    expect(m).toContain('cheque de revisão do 6075E CAB');
    expect(m).toContain('fábrica (Mahindra)');
    expect(m).toContain(link);
    expect(m).not.toContain('ordem de serviço nº');
  });

  it('manutenção só pede a assinatura na OS', () => {
    const m = mensagemAssinaturaCobranca({ revisaoHoras: null, numero: '5070', trator: '' }, link);
    expect(m).toContain('assinatura na ordem de serviço nº 5070');
    expect(m).not.toContain('Mahindra');
    expect(m).toContain(link);
  });

  it('âncoras: as mensagens da cobrança são reconhecidas na conversa', () => {
    expect(ehMensagemDeCobranca('Posso fechar o serviço para 30/60 dias?')).toBe(true);
    expect(ehMensagemDeCobranca('Posso fechar o serviço à vista?')).toBe(true);
    expect(ehMensagemDeCobranca('Posso fechar para 30 dias?')).toBe(true); // formato antigo
    expect(ehMensagemDeCobranca(mensagemAssinaturaCobranca({ revisaoHoras: null, numero: '1', trator: '' }, link))).toBe(true);
    expect(ehMensagemDeCobranca('Bom dia, pode ser sim')).toBe(false);
  });
});
