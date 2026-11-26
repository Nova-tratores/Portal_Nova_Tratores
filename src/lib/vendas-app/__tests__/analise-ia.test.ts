import { describe, expect, it } from 'vitest';
import { esquemaResposta, limparResultado, montarEntrada, validarContexto, type ContextoAnalise } from '../analise-ia';
import { dentroDoLimite } from '../analise-ia-server';

const listas = {
  culturas: ['Soja', 'Milho', 'Fruticultura', 'Café'],
  familias: ['Trator Novo', 'Trincha', 'Pulverizador'],
  cargos: ['PROPRIETARIO', 'FAMILIAR', 'GERENTE', 'TRATORISTA', 'SECRETARIA', 'OUTROS'],
};
const ctx: ContextoAnalise = {
  resumo: 'Conversei com dona Tereza e o filho, plantam goiaba e querem orçamento de trincha. Volto dia 4.',
  proximosPassos: 'Mandar catálogo',
  dataVisita: '2026-11-24',
  pessoas: [{ id: 10, nome: 'Tereza Silva', cargo: 'PROPRIETARIO' }],
  culturas: ['Soja'],
  familiasComNegocio: ['Pulverizador'],
  colegas: ['Matheus Parmezan'],
  listas,
};

describe('analise-ia', () => {
  it('valida o pedido', () => {
    expect(validarContexto(null)).toBeTruthy();
    expect(validarContexto({ ...ctx, resumo: 'curto' })).toMatch(/curto/);
    expect(validarContexto({ ...ctx, listas: { culturas: [], familias: [], cargos: [] } })).toMatch(/listas/);
    expect(validarContexto(ctx)).toBeNull();
  });

  it('esquema fecha as listas', () => {
    const s = esquemaResposta(listas) as any;
    expect(s.properties.culturas.items.properties.cultura.enum).toEqual(listas.culturas);
    expect(s.additionalProperties).toBe(false);
  });

  it('entrada leva o resumo marcado como dado', () => {
    const e = montarEntrada(ctx);
    expect(e).toContain('<resumo_da_visita>');
    expect(e).toContain('id 10: Tereza Silva');
    expect(e).toContain('2026-11-24');
  });

  it('limpa: fora da lista, já existente, colega, id inventado e data absurda saem', () => {
    const r = limparResultado({
      pessoas: [
        { nome: 'Tereza', cargo: 'PROPRIETARIO', pessoa_id: '10', motivo: 'dona Tereza' },
        { nome: '', cargo: 'familiar', pessoa_id: null, motivo: 'o filho' },
        { nome: 'Matheus', cargo: null, pessoa_id: null, motivo: 'eu' },
        { nome: 'Zé', cargo: 'PATRÃO', pessoa_id: '999', motivo: 'x' },
      ],
      culturas: [{ cultura: 'fruticultura', trecho: 'goiaba' }, { cultura: 'Soja', trecho: 'soja' }, { cultura: 'Arroz', trecho: 'arroz' }],
      interesses: [{ familia: 'Trincha', ano_que_vem: false, trecho: 'orçamento' }, { familia: 'Pulverizador', ano_que_vem: false, trecho: 'x' }, { familia: 'Drone', ano_que_vem: false, trecho: 'x' }],
      retorno: { data: '2026-12-04', trecho: 'dia 4' },
      passos: ['Mandar orçamento da trincha', 'mandar catálogo', 'Mandar orçamento da trincha'],
    }, ctx);
    expect(r.pessoas).toEqual([
      { nome: 'Tereza', cargo: 'PROPRIETARIO', pessoa_id: '10', motivo: 'dona Tereza' },
      { nome: '', cargo: 'FAMILIAR', pessoa_id: null, motivo: 'o filho' },
      { nome: 'Zé', cargo: null, pessoa_id: null, motivo: 'x' },
    ]);
    expect(r.culturas.map((c) => c.cultura)).toEqual(['Fruticultura']);
    expect(r.interesses.map((i) => i.familia)).toEqual(['Trincha']);
    expect(r.retorno).toEqual({ data: '2026-12-04', trecho: 'dia 4' });
    expect(r.passos).toEqual(['Mandar orçamento da trincha']);
    expect(limparResultado({ retorno: { data: '2031-01-01', trecho: '' } }, ctx).retorno).toBeNull();
    expect(limparResultado('lixo', ctx)).toEqual({ pessoas: [], culturas: [], interesses: [], retorno: null, passos: [] });
  });

  it('freio por pessoa', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(dentroDoLimite('x', t + i, 3)).toBe(true);
    expect(dentroDoLimite('x', t + 10, 3)).toBe(false);
    expect(dentroDoLimite('x', t + 3600001, 3)).toBe(true);
  });
});
