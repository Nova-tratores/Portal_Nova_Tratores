import { describe, it, expect } from 'vitest';
import { pareceRecusa, perguntaDaRecusa } from '../recusa';

describe('pareceRecusa', () => {
  it('pega as recusas que apareceram no WhatsApp da Tereza (30/09/2026)', () => {
    expect(pareceRecusa('Boa tarde! Tudo bem com você? Aqui é do pós-vendas da Nova Tratores. Infelizmente, não posso passar o contato do financeiro, mas posso ajudar com qualquer outra dúvida relacionada a peças, vendas, assistência ou revisões. O que você precisa?')).toBe(true);
    expect(pareceRecusa('Entendi! Mas para questões específicas sobre boletos emitidos, o ideal é entrar em contato diretamente com o setor financeiro. Posso ajudar com outra coisa relacionada a peças, vendas ou assistência?')).toBe(true);
    expect(pareceRecusa('Desculpe, mas não consigo fornecer o contato do financeiro. Recomendo que você entre em contato diretamente com a nossa central de atendimento ou verifique no seu histórico de atendimento.')).toBe(true);
  });
  it('não pega frases legítimas do roteiro', () => {
    expect(pareceRecusa('Não consigo ler bem o número no visor. Pode me digitar o horímetro?')).toBe(false);
    expect(pareceRecusa('Boa tarde! Tudo bem com o senhor? Aqui é do pós-vendas da Nova Tratores. O que você precisa?')).toBe(false);
    expect(pareceRecusa('Vou confirmar essa informação com a equipe aqui e já te retorno, combinado?')).toBe(false);
    expect(pareceRecusa('Pelo painel vi 3,9 horas — confere?')).toBe(false);
    expect(pareceRecusa('Perfeito! Orçamento confirmado. Retornaremos em breve para dizer quando ficou agendado.')).toBe(false);
    expect(pareceRecusa('')).toBe(false);
  });
  it('pergunta pra equipe', () => {
    expect(perguntaDaRecusa('Contato do financeiro')).toContain('"Contato do financeiro"');
  });
});
