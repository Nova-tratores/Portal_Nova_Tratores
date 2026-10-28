import { describe, expect, it } from 'vitest';
import { casarNota, casarNotaSoma, dataISO, notaDoBanco, parecencaNome, subconjuntosQueSomam, type NotaEntrada } from '../casar-nota';

const nota = (p: Partial<NotaEntrada>): NotaEntrada => ({ id: 1, numero: '100', data: '2026-10-10', valor: 200, cnpj: '11222333000144', nome: 'KADU FERRAMENTAS E MATERIAIS PARA SOLDA EIRELI', conta: 'NOVA', ...p });
const req = { id: 9, fornecedor: 'KADU FERRAMENTAS', fornecedorCnpj: '', valor: 200, data: '2026-10-08' };

describe('casar requisição × nota', () => {
  it('mesmo CNPJ do cadastro + mesmo valor + data perto = alta', () => {
    const c = casarNota(req, [nota({})], { cnpjPorNome: new Map([['kadu ferramentas', '11222333000144']]) });
    expect(c[0].confianca).toBe('alta');
    expect(c[0].motivos).toContain('mesmo CNPJ do fornecedor');
  });
  it('nome característico basta; nome genérico não', () => {
    expect(parecencaNome('KADU FERRAMENTAS', 'KADU FERRAMENTAS E MATERIAIS PARA SOLDA EIRELI')).toBeGreaterThan(0.9);
    expect(parecencaNome('AUTO POSTO 2001', 'AUTO POSTO SAO GERALDO DE PIRAJU LTDA')).toBe(0);
  });
  it('valor diferente demais ou data longe: não sugere', () => {
    expect(casarNota(req, [nota({ valor: 260 })])).toEqual([]);
    expect(casarNota(req, [nota({ data: '2027-03-01' })])).toEqual([]);
  });
  it('valor parecido (até 3%) é só média', () => {
    expect(casarNota(req, [nota({ valor: 204 })])[0].confianca).toBe('media');
  });
  it('nota já ligada a outra requisição não volta', () => {
    expect(casarNota(req, [nota({})], { jaUsadas: new Set(['11222333000144|100']) })).toEqual([]);
  });
  it('duas notas iguais do mesmo fornecedor = empate, ninguém é alta', () => {
    const c = casarNota(req, [nota({ id: 1, numero: '100' }), nota({ id: 2, numero: '101', data: '2026-10-09' })]);
    expect(c.every((x) => x.confianca === 'media')).toBe(true);
  });
  it('uma nota para várias requisições: a soma dá a nota (caso real NF 10176 = 54 + 59 + 34)', () => {
    const n = nota({ valor: 147, data: '2026-05-26', nome: 'CLAUDIO NOBOA BARRADO - ME' });
    const rs = [
      { id: 5599, fornecedor: 'CLAUDIO NOBOA BARRADO', fornecedorCnpj: '', valor: 54, data: '2026-04-17' },
      { id: 5868, fornecedor: 'CLAUDIO NOBOA BARRADO', fornecedorCnpj: '', valor: 59, data: '2026-05-04' },
      { id: 5883, fornecedor: 'CLAUDIO NOBOA BARRADO', fornecedorCnpj: '', valor: 34, data: '2026-05-06' },
      { id: 7000, fornecedor: 'OUTRO FORNECEDOR', fornecedorCnpj: '', valor: 113, data: '2026-05-06' },
    ];
    const g = casarNotaSoma(n, rs)!;
    expect(g.reqIds).toEqual([5599, 5868, 5883]);
    expect(g.confianca).toBe('alta');
  });
  it('mais de um jeito de somar = não sugere', () => {
    const n = nota({ valor: 100 });
    const rs = [50, 50, 50].map((v, i) => ({ id: i + 1, fornecedor: req.fornecedor, fornecedorCnpj: '', valor: v, data: '2026-10-05' }));
    expect(casarNotaSoma(n, rs)).toBeNull();
    expect(subconjuntosQueSomam([5000, 5000, 5000], 10000).length).toBe(2);
  });
  it('lê a linha do banco (data BR, zeros à esquerda, cancelada)', () => {
    expect(dataISO('31/12/2024')).toBe('2024-12-31');
    expect(notaDoBanco({ id: 3, numero_nf: '000016365', data_emissao: '31/12/2024', valor_nf: 369, cnpj_cpf: '53.425.237/0006-95', nome_emitente: 'X' })?.numero).toBe('16365');
    expect(notaDoBanco({ id: 3, numero_nf: '1', cancelada: 'S' })).toBeNull();
  });
});
