import { describe, it, expect } from 'vitest';
import {
  descricaoBase, descricaoDaMaquina, projetoDaMaquina, validarMaquinas, precisaSeparar, familiaDeMaquina,
} from '../separar-maquinas';

describe('separar máquinas', () => {
  it('tira série e certificado da descrição do fornecedor', () => {
    expect(descricaoBase('ROCADEIRA KD 152 (RMB) CERT. DE GARANTIA NR. 45832 NUMERO DE SERIE: G0725 37111')).toBe('ROCADEIRA KD 152 (RMB)');
    expect(descricaoBase('ROCADEIRA KDD 150 S CERT. DE GARANTIA NR. 45968||NUMERO DE SERIE: C082')).toBe('ROCADEIRA KDD 150 S');
    expect(descricaoBase('SEMEADEIRA ADUBADEIRA SEMBRA-400-II-P-INOX')).toBe('SEMEADEIRA ADUBADEIRA SEMBRA-400-II-P-INOX');
  });
  it('monta descrição e projeto', () => {
    expect(descricaoDaMaquina('ROCADEIRA KD 152 (RMB) NUMERO DE SERIE: X', ' g0725 37111 ')).toBe('ROCADEIRA KD 152 (RMB) SÉRIE G0725 37111');
    expect(projetoDaMaquina('Incomagri', 'Sembra 400', 'ab12')).toBe('INCOMAGRI SEMBRA 400 AB12');
  });
  it('valida as séries', () => {
    const m = (serie: string) => ({ serie, descricao: 'X SÉRIE ' + serie, projeto: 'P ' + serie });
    expect(validarMaquinas([m('A1'), m('A2')], 2)).toEqual([]);
    expect(validarMaquinas([m('A1'), m('a1')], 2).join()).toMatch(/repetida/);
    expect(validarMaquinas([m('A1'), m('A2'), m('A3')], 2).join()).toMatch(/só 2 no estoque/);
    expect(validarMaquinas([m('A1'), m('')], 2).join()).toMatch(/falta a série/);
    expect(validarMaquinas([m('A1'), m('37112')], 2, new Set(['37112'])).join()).toMatch(/já existe/);
  });
  it('acha a linha que precisa separar', () => {
    const l = { idReceb: 1, conta: 'NOVA', numeroNfe: '1', fornecedor: 'F', emissao: null, recebidoEm: null, seq: 1, codigoFornecedor: 'X', descricaoNota: 'D', qtde: 2, idProduto: 9 };
    expect(precisaSeparar(l, { codigo: '9661908', descricao: 'D', familia: 'Distribuidor', estoque: 2, inativo: false })).toBe(true);
    expect(precisaSeparar(l, { codigo: 'X', descricao: 'D', familia: 'Peças', estoque: 2, inativo: false })).toBe(false);
    expect(precisaSeparar(l, { codigo: 'X', descricao: 'D', familia: 'Roçadeira', estoque: 1, inativo: false })).toBe(false);
    expect(familiaDeMaquina('')).toBe(false);
  });
});
