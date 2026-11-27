import { describe, it, expect } from 'vitest';
import {
  normalizarCodigo, descricaoSugerida, ncmOmie, validarProdutoProprio, validarLista, codigoIntegracao, payloadProdutoProprio,
} from '../produto-proprio-recebimento';

describe('produto próprio no recebimento', () => {
  it('normaliza código e sugere descrição sem o trecho de série', () => {
    expect(normalizarCodigo('  13787/26 ')).toBe('13787/26');
    expect(normalizarCodigo('kd 152')).toBe('KD 152');
    expect(descricaoSugerida('Roçadeira KD 152 CERT. DE GARANTIA NR. 45832 NUMERO DE SERIE: G0725 37111')).toBe('ROÇADEIRA KD 152');
  });

  it('NCM da nota vira o formato da Omie', () => {
    expect(ncmOmie('84323190')).toBe('8432.31.90');
    expect(ncmOmie('8432.31.90')).toBe('8432.31.90');
  });

  it('valida campos e códigos repetidos', () => {
    expect(validarProdutoProprio({ codigo: '', descricao: '' })).toHaveLength(2);
    expect(validarProdutoProprio({ codigo: 'X'.repeat(61), descricao: 'ok' })[0]).toMatch(/60/);
    expect(validarLista([{ codigo: 'a1', descricao: 'x' }, { codigo: 'A1', descricao: 'y' }])).toEqual(['Item 2: código A1 repetido na nota.']);
  });

  it('payload sem lote, com código de integração estável', () => {
    expect(codigoIntegracao(2558, 1)).toBe('RCB-2558-1');
    const p = payloadProdutoProprio({ codigo: '13787/26', descricao: 'SEMBRA 400', codigoFamilia: 9, idReceb: 2558, nSequencia: 1, unidade: 'un', ncm: '84323190' });
    expect(p).toMatchObject({ codigo: '13787/26', produto_lote: 'N', unidade: 'UN', ncm: '8432.31.90', codigo_familia: 9, codigo_produto_integracao: 'RCB-2558-1' });
    expect(payloadProdutoProprio({ codigo: 'a', descricao: 'b', idReceb: 1, nSequencia: 2 })).not.toHaveProperty('codigo_familia');
  });
});
