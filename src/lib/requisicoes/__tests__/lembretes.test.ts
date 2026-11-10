import { describe, it, expect } from 'vitest';
import {
  oQueFalta, prontaParaFinanceiro, planejarLembretes, usuarioDoSolicitante, gestorDe, juntarFalta, valorReq,
} from '../lembretes';

const base = { id: 1, tipo: 'Peças', status: 'aguardando', fornecedor: 'KOBA', valor_despeza: '36.00', created_at: '2026-11-10T12:00:00Z' };

describe('ida ao financeiro', () => {
  it('recibo + valor + fornecedor = pronta', () => {
    expect(prontaParaFinanceiro({ ...base, recibo_fornecedor: 'a.jpg' })).toBe(true);
    expect(prontaParaFinanceiro({ ...base, foto_nf3: 'n.pdf' })).toBe(true);
  });
  it('boleto não é comprovante', () => {
    expect(prontaParaFinanceiro({ ...base, boleto_fornecedor: 'b.pdf' })).toBe(false);
    expect(oQueFalta({ ...base, boleto_fornecedor: 'b.pdf' })).toEqual(['a nota ou o recibo']);
  });
  it('sem valor ou fornecedor não anda e diz o que falta', () => {
    expect(oQueFalta({ ...base, recibo_fornecedor: 'a', valor_despeza: null, fornecedor: ' ' })).toEqual(['o valor', 'o fornecedor']);
    expect(oQueFalta({ ...base, recibo_fornecedor: 'a', valor_despeza: '0,00' })).toEqual(['o valor']);
  });
  it('alimentação manual só precisa do comprovante; a da OS nunca vai sozinha', () => {
    const al = { ...base, tipo: 'Alimentação', fornecedor: null, valor_despeza: null, foto_nf: 'n.jpg' };
    expect(prontaParaFinanceiro(al)).toBe(true);
    expect(prontaParaFinanceiro({ ...al, origem: 'auto_alimentacao_os' })).toBe(false);
  });
  it('já no financeiro ou na lixeira não conta', () => {
    expect(prontaParaFinanceiro({ ...base, recibo_fornecedor: 'a', status: 'financeiro' })).toBe(false);
    expect(prontaParaFinanceiro({ ...base, recibo_fornecedor: 'a', status: 'lixeira' })).toBe(false);
  });
  it('valor BR e US', () => {
    expect(valorReq('1.304,60')).toBe(1304.6);
    expect(valorReq('1304.60')).toBe(1304.6);
    expect(valorReq(null)).toBeNull();
  });
});

describe('lembretes', () => {
  const agora = new Date('2026-11-26T12:00:00Z'); // 16 dias depois
  it('dispara os níveis alcançados que ainda não foram', () => {
    const p = planejarLembretes([base], new Set(['1:1']), agora);
    expect(p.map((x) => x.nivel)).toEqual([2, 3]);
    expect(p[0].falta).toEqual(['a nota ou o recibo']);
  });
  it('2 dias = nada; 3 dias = aviso', () => {
    expect(planejarLembretes([base], new Set(), new Date('2026-11-12T13:00:00Z'))).toEqual([]);
    expect(planejarLembretes([base], new Set(), new Date('2026-11-13T13:00:00Z')).map((x) => x.nivel)).toEqual([1]);
  });
  it('antigas, prontas, fechadas e alimentação da OS ficam fora', () => {
    const reqs = [
      { ...base, id: 2, created_at: '2026-10-01T12:00:00Z' },
      { ...base, id: 3, recibo_fornecedor: 'r' },
      { ...base, id: 4, status: 'financeiro' },
      { ...base, id: 5, tipo: 'Alimentação', origem: 'auto_alimentacao_os' },
    ];
    expect(planejarLembretes(reqs, new Set(), agora)).toEqual([]);
  });
  it('texto do que falta', () => {
    expect(juntarFalta(['a nota ou o recibo', 'o valor', 'o fornecedor'])).toBe('a nota ou o recibo, o valor e o fornecedor');
  });
});

describe('quem é quem', () => {
  const us = [
    { id: 'a', nome: 'Dougras Mogrs de Jesus Bonfim', email: 'd@x' },
    { id: 'b', nome: 'José Oliveira', email: 'jo@x' },
    { id: 'c', nome: 'Jose Antonio de Oliveira', email: 'ja@x' },
    { id: 'd', nome: 'Lucas Silva', email: 'l@x' },
  ];
  it('casa por nome sem acento, por e-mail e pelos dois primeiros nomes', () => {
    expect(usuarioDoSolicitante('Jose Oliveira', us)?.id).toBe('b');
    expect(usuarioDoSolicitante('JA@X', us)?.id).toBe('c');
    expect(usuarioDoSolicitante('Dougras Mogrs de Jesus Bomfim', us)?.id).toBe('a');
  });
  it('nome solto ou ambíguo não casa', () => {
    expect(usuarioDoSolicitante('Lucas', us)).toBeNull();
    expect(usuarioDoSolicitante('', us)).toBeNull();
  });
  it('gestor só se tiver login', () => {
    const org = [{ pessoa_chave: 'u:b', gestor_chave: 'u:z' }, { pessoa_chave: 'u:c', gestor_chave: 'rh:9' }];
    expect(gestorDe('b', org)).toBe('z');
    expect(gestorDe('c', org)).toBeNull();
    expect(gestorDe('x', org)).toBeNull();
  });
});
