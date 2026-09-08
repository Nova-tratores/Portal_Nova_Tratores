import { describe, it, expect } from 'vitest';
import {
  PERGUNTAS, IDS_PERGUNTAS, SECOES, perguntasDaSecao,
  sanitizarRespostas, respondidas, extrairNumero,
  preverImportacao, mesclarObservacoes, MAPA_IMPORTACAO, LIMITE_RESPOSTA,
} from '../questionario';

describe('catálogo de perguntas', () => {
  it('tem as 26 perguntas com ids fixos de q01 a q26', () => {
    expect(PERGUNTAS).toHaveLength(26);
    expect(IDS_PERGUNTAS[0]).toBe('q01');
    expect(IDS_PERGUNTAS[25]).toBe('q26');
  });

  // Renumerar apagaria a leitura de tudo que já foi respondido.
  it('não repete id', () => {
    expect(new Set(IDS_PERGUNTAS).size).toBe(26);
  });

  it('toda pergunta pertence a uma seção conhecida e nenhuma seção fica vazia', () => {
    for (const p of PERGUNTAS) expect(SECOES).toContain(p.secao);
    for (const s of SECOES) expect(perguntasDaSecao(s).length).toBeGreaterThan(0);
  });

  it('a soma das seções devolve exatamente as 26', () => {
    const total = SECOES.reduce((n, s) => n + perguntasDaSecao(s).length, 0);
    expect(total).toBe(26);
  });
});

describe('sanitizarRespostas', () => {
  // O corpo chega de uma rota PÚBLICA: nada além de qNN pode entrar no JSONB.
  it('descarta chave desconhecida', () => {
    const r = sanitizarRespostas({ q01: 'ok', is_admin: true, 'q99': 'x', __proto__: 'y' });
    expect(r).toEqual({ q01: 'ok' });
  });

  it('descarta valor que não é texto', () => {
    expect(sanitizarRespostas({ q01: 42, q02: { a: 1 }, q03: ['x'] })).toEqual({});
  });

  it('null vira string vazia (é como se apaga uma resposta)', () => {
    expect(sanitizarRespostas({ q01: null })).toEqual({ q01: '' });
  });

  it('corta resposta gigante no limite', () => {
    const r = sanitizarRespostas({ q01: 'a'.repeat(LIMITE_RESPOSTA + 500) });
    expect(r.q01.length).toBe(LIMITE_RESPOSTA);
  });

  it('entrada inválida devolve objeto vazio, sem lançar', () => {
    expect(sanitizarRespostas(null)).toEqual({});
    expect(sanitizarRespostas('texto')).toEqual({});
  });
});

describe('respondidas', () => {
  it('conta só o que tem conteúdo de verdade', () => {
    expect(respondidas({ q01: 'a', q02: '   ', q03: '', q04: 'b' })).toBe(2);
    expect(respondidas({})).toBe(0);
  });
});

describe('extrairNumero', () => {
  it('lê número solto e com texto em volta', () => {
    expect(extrairNumero('3')).toBe(3);
    expect(extrairNumero('uns 3 dias')).toBe(3);
    expect(extrairNumero('participamos 4 dias, todos')).toBe(4);
  });

  it('entende "mil"', () => {
    expect(extrairNumero('cerca de 12 mil pessoas')).toBe(12000);
    expect(extrairNumero('12,5 mil')).toBe(12500);
  });

  it('entende ponto de milhar', () => {
    expect(extrairNumero('12.000 visitantes')).toBe(12000);
  });

  it('entende número por extenso', () => {
    expect(extrairNumero('tres dias')).toBe(3);
    expect(extrairNumero('três dias')).toBe(3);
  });

  it('devolve null quando não há número — e aí ninguém inventa valor', () => {
    expect(extrairNumero('não lembro')).toBeNull();
    expect(extrairNumero('')).toBeNull();
    expect(extrairNumero(null)).toBeNull();
    expect(extrairNumero('o organizador não divulgou')).toBeNull();
  });

  it('numa faixa, fica com o primeiro número', () => {
    expect(extrairNumero('300 a 400 por dia')).toBe(300);
  });
});

describe('preverImportacao', () => {
  const acaoVazia = { observacoes: null };

  it('leva cada resposta mapeada ao seu campo', () => {
    const p = preverImportacao(
      { q04: 'Stand de 100m2 dentro do espaço da Mahindra', q11: 'Produtores de café' },
      acaoVazia, null,
    );
    const stand = p.itens.find((i) => i.q === 'q04');
    expect(stand?.tabela).toBe('acao');
    expect(stand?.campo).toBe('stand_descricao');
    const perfil = p.itens.find((i) => i.q === 'q11');
    expect(perfil?.tabela).toBe('avaliacao');
    expect(perfil?.campo).toBe('perfil_publico');
  });

  it('campo numérico só entra quando dá pra ler o número', () => {
    const p = preverImportacao({ q02: '3 dias' }, acaoVazia, null);
    expect(p.itens.find((i) => i.q === 'q02')?.valor).toBe(3);
    expect(p.numeroNaoLido).toHaveLength(0);
  });

  it('numérica sem número vai pras observações, não pro campo', () => {
    const p = preverImportacao({ q03: 'o organizador não divulgou' }, acaoVazia, null);
    expect(p.itens.find((i) => i.q === 'q03')).toBeUndefined();
    expect(p.numeroNaoLido).toContain('q03');
    expect(p.paraObservacoes.some((l) => l.startsWith('q03:'))).toBe(true);
  });

  it('marca conflito quando o destino já tem conteúdo diferente', () => {
    const p = preverImportacao(
      { q04: 'stand novo' },
      { stand_descricao: 'stand antigo' }, null,
    );
    const item = p.itens.find((i) => i.q === 'q04');
    expect(item?.conflito).toBe(true);
    expect(item?.valorAtual).toBe('stand antigo');
    expect(p.conflitos).toBe(1);
  });

  it('valor igual ao que já está lá não é conflito', () => {
    const p = preverImportacao({ q04: 'mesmo texto' }, { stand_descricao: 'mesmo texto' }, null);
    expect(p.itens.find((i) => i.q === 'q04')?.conflito).toBe(false);
  });

  it('resposta sem campo próprio vai pras observações com o prefixo', () => {
    const p = preverImportacao({ q05: 'dois tratores 1533', q26: 'Drive do comercial' }, acaoVazia, null);
    expect(p.paraObservacoes).toContain('q05: dois tratores 1533');
    expect(p.paraObservacoes).toContain('q26: Drive do comercial');
  });

  it('resposta em branco não gera nada', () => {
    const p = preverImportacao({ q04: '   ', q05: '' }, acaoVazia, null);
    expect(p.itens).toHaveLength(0);
    expect(p.paraObservacoes).toHaveLength(0);
  });

  it('toda regra do mapa aponta pra um campo que a migration criou', () => {
    const camposAcao = ['dias_participacao', 'publico_total_evento', 'stand_descricao', 'publico_estimado'];
    const camposAval = ['perfil_publico', 'produtos_mais_interesse', 'percepcao_marca', 'funcionou', 'nao_funcionou', 'justificativa'];
    for (const r of MAPA_IMPORTACAO) {
      const lista = r.tabela === 'acao' ? camposAcao : camposAval;
      expect(lista, `${r.q} -> ${r.tabela}.${r.campo}`).toContain(r.campo);
    }
  });
});

describe('mesclarObservacoes', () => {
  it('acrescenta quando não havia nada', () => {
    expect(mesclarObservacoes(null, ['q05: dois tratores'])).toBe('q05: dois tratores');
  });

  // Reimportar depois de o respondente corrigir uma resposta tem que ATUALIZAR
  // a linha, não empilhar uma segunda.
  it('substitui a linha da mesma pergunta em vez de duplicar', () => {
    const r = mesclarObservacoes('q05: versão antiga\nq26: fotos no Drive', ['q05: versão nova']);
    expect(r).toBe('q05: versão nova\nq26: fotos no Drive');
  });

  it('preserva texto livre que não é de pergunta', () => {
    const r = mesclarObservacoes('anotação do gerente\nq05: antigo', ['q05: novo']);
    expect(r).toBe('anotação do gerente\nq05: novo');
  });

  it('não deixa linha em branco no meio', () => {
    const r = mesclarObservacoes('\n\nq05: a\n\n', ['q06: b']);
    expect(r).toBe('q05: a\nq06: b');
  });
});
