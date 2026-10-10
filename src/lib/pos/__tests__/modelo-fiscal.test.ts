import { describe, it, expect } from 'vitest';
import {
  validarCampos, mesclarCampos, diferencasDoModelo, montarItemAlteracao, conferirImpostos, valoresAtuais, formatarNbs, mostrarValor,
} from '@/lib/pos/modelo-fiscal';

describe('modelo fiscal', () => {
  it('valida e normaliza: NBS só dígitos, alíquota com vírgula, S/N, descarta vazio e chave estranha', () => {
    const r = validarCampos({ cNbs: '1.2001.50.00', nAliqISS: '2,5', cRetemISS: 's', cCST: '000', vazio: 'x', nAliqIRRF: '' });
    expect(r.erros).toEqual([]);
    expect(r.campos).toEqual({ cNbs: '120015000', nAliqISS: 2.5, cRetemISS: 'S', cCST: '000' });
  });
  it('recusa NBS, CST, alíquota e S/N inválidos', () => {
    const r = validarCampos({ cNbs: '1.2001', cCST: '0', nAliqISS: '150', cRetemIRRF: 'talvez' });
    expect(r.erros).toHaveLength(4);
    expect(r.campos).toEqual({});
  });
  it('ajuste vazio tira o campo do modelo (volta ao cadastro da Omie)', () => {
    const final = mesclarCampos({ cCST: '000', nAliqISS: 2 }, { nAliqISS: '', cRetemISS: 'S' });
    expect(final).toEqual({ cCST: '000', cRetemISS: 'S' });
    expect(diferencasDoModelo({ cCST: '000', nAliqISS: 2 }, final)).toEqual([
      { campo: 'nAliqISS', de: 2, para: null }, { campo: 'cRetemISS', de: null, para: 'S' },
    ]);
  });
  it('monta o item do AlterarOS separando topo e impostos', () => {
    const it1 = montarItemAlteracao({ nIdItem: 7 }, { cNbs: '120015000', cRetemISS: 'S', cCST: '000', nAliqISS: 2 });
    expect(it1).toEqual({ nIdItem: 7, cAcaoItem: 'A', cNbs: '120015000', cRetemISS: 'S', impostos: { cCST: '000', nAliqISS: 2, cUtilizaValorImposto: 'N' } });
    expect(montarItemAlteracao({}, { cCST: '000' })).toBeNull();
  });
  it('confere o que a Omie gravou', () => {
    const itens = [{ nIdItem: 1, cNbs: '1.2001.50.00', cRetemISS: 'S', impostos: { cCST: '000', nAliqISS: '2.00' } }];
    expect(conferirImpostos(itens, { cNbs: '120015000', cRetemISS: 'S', cCST: '000', nAliqISS: 2 })).toBeNull();
    expect(conferirImpostos(itens, { cCST: '010' })).toMatch(/CST/);
    expect(conferirImpostos([], { cCST: '000' })).toMatch(/não devolveu/);
  });
  it('valores atuais: comum ou "varia"', () => {
    const v = valoresAtuais([{ impostos: { cCST: '000', nAliqISS: 2 } }, { impostos: { cCST: '000', nAliqISS: 3 } }]);
    expect(v.cCST).toBe('000');
    expect(v.nAliqISS).toBe('varia');
    expect(v.cNbs).toBeNull();
  });
  it('formatação para a tela', () => {
    expect(formatarNbs('120015000')).toBe('1.2001.50.00');
    expect(mostrarValor('nAliqISS', 2.5)).toBe('2,5%');
    expect(mostrarValor('cRetemISS', 'N')).toBe('Não');
    expect(mostrarValor('cCST', null)).toBe('—');
  });
});
