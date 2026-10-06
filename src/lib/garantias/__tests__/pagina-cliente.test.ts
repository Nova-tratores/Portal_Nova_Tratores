import { describe, it, expect } from 'vitest';
import { validarEvento, validarDuvida, rankingPorValor, resumirUso, limparTexto } from '../pagina-cliente';

describe('validarEvento', () => {
  it('aceita tipo conhecido e corta o texto', () => {
    const e = validarEvento({ tipo: 'faq', valor: 'x'.repeat(300), sessao: 'abc123xyz' });
    expect(e?.tipo).toBe('faq');
    expect(e?.valor).toHaveLength(200);
    expect(e?.sessao).toBe('abc123xyz');
  });
  it('recusa tipo desconhecido', () => {
    expect(validarEvento({ tipo: 'apagar_tudo' })).toBeNull();
    expect(validarEvento(null)).toBeNull();
  });
  it('busca vai em minúsculas e sessão estranha vira null', () => {
    const e = validarEvento({ tipo: 'busca', valor: '  Bateria ', sessao: 'a b<script>' });
    expect(e?.valor).toBe('bateria');
    expect(e?.sessao).toBeNull();
  });
});

describe('validarDuvida', () => {
  it('exige nome e mensagem', () => {
    expect(validarDuvida({ nome: '', mensagem: 'oi' })).toEqual({ ok: false, erro: 'Informe seu nome.' });
    expect(validarDuvida({ nome: 'Ana', mensagem: '   ' })).toEqual({ ok: false, erro: 'Escreva a sua dúvida.' });
  });
  it('limpa e devolve a dúvida', () => {
    const v = validarDuvida({ nome: ' João\nSilva ', chassi_final: '', mensagem: 'Pneu tem garantia?' });
    expect(v).toEqual({ ok: true, duvida: { nome: 'João Silva', chassi_final: null, mensagem: 'Pneu tem garantia?', sessao: null } });
  });
});

describe('limparTexto', () => {
  it('tira caracteres de controle', () => {
    expect(limparTexto('a\u0000b\u0007c', 10)).toBe('abc');
  });
});

describe('rankingPorValor', () => {
  it('conta só o tipo pedido, do maior para o menor', () => {
    const ev = [
      { tipo: 'faq', valor: 'B' }, { tipo: 'faq', valor: 'A' }, { tipo: 'faq', valor: 'A' },
      { tipo: 'busca', valor: 'A' }, { tipo: 'faq', valor: null },
    ];
    expect(rankingPorValor(ev, 'faq')).toEqual([{ valor: 'A', total: 2 }, { valor: 'B', total: 1 }]);
  });
});

describe('resumirUso', () => {
  it('soma visitas, pessoas e agrupa por dia de São Paulo', () => {
    const r = resumirUso([
      { tipo: 'visita', sessao: 's1', criado_em: '2026-10-06T02:00:00Z' }, // 05/10 23h em SP
      { tipo: 'visita', sessao: 's1', criado_em: '2026-10-06T13:00:00Z' },
      { tipo: 'visita', sessao: 's2', criado_em: '2026-10-06T14:00:00Z' },
      { tipo: 'whatsapp', sessao: 's2', criado_em: '2026-10-06T14:01:00Z' },
    ]);
    expect(r.visitas).toBe(3);
    expect(r.pessoas).toBe(2);
    expect(r.whatsapp).toBe(1);
    expect(r.porDia).toEqual([{ dia: '2026-10-05', visitas: 1 }, { dia: '2026-10-06', visitas: 2 }]);
  });
});
