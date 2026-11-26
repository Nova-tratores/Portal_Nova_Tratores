import { describe, it, expect } from 'vitest';
import { etiquetasFaltando, gerarCodigo, numeroWhats, linkWhatsDoPost, linkSiteDoPost, codigoNaMensagem } from '../etiquetas';

const fixo = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('gerarCodigo', () => {
  it('usa o número da máquina + 3 letras', () => {
    expect(gerarCodigo('Mahindra 6075 com primeira parcela', fixo(0.1, 0, 0.05))).toMatch(/^6075[A-Z]{3}$/);
  });
  it('sem número usa a primeira palavra útil', () => {
    expect(gerarCodigo('Entrega do pulverizador Kuhn', fixo(0))).toBe('ENTRAAA');
  });
  it('ignora acento e palavras da empresa', () => {
    expect(gerarCodigo('Nova Tratores: Dia de Campo', fixo(0)).slice(0, 4)).toBe('CAMP');
  });
  it('vazio vira POST', () => {
    expect(gerarCodigo('', fixo(0))).toBe('POSTAAA');
  });
  it('nunca usa I nem O nas letras sorteadas', () => {
    for (let i = 0; i < 50; i++) expect(gerarCodigo('x 1234').slice(4)).not.toMatch(/[IO]/);
  });
});

describe('etiquetasFaltando', () => {
  it('lista o que falta', () => {
    expect(etiquetasFaltando({ formato: 'feed' })).toEqual(['tipo do post', 'se tem gente real', 'gancho']);
  });
  it('completo = vazio (gente_real false também vale)', () => {
    expect(etiquetasFaltando({ etiqueta_tipo: 'entrega', formato: 'reels', gente_real: false, gancho: 'pessoa' })).toEqual([]);
  });
});

describe('links do post', () => {
  it('número do WhatsApp', () => {
    expect(numeroWhats('(14) 3351-6049')).toBe('551433516049');
    expect(numeroWhats('123')).toBeNull();
  });
  it('wa.me com o código na mensagem', () => {
    const l = linkWhatsDoPost('551433516049', '6075CAB', 'Mahindra 6075');
    expect(l.startsWith('https://wa.me/551433516049?text=')).toBe(true);
    expect(decodeURIComponent(l.split('text=')[1])).toContain('6075CAB');
  });
  it('UTM no link do site', () => {
    const l = linkSiteDoPost('https://novatratores.com.br/tratores/6075', 'instagram', '6075CAB');
    expect(l).toBe('https://novatratores.com.br/tratores/6075?utm_source=instagram&utm_medium=post&utm_campaign=6075CAB');
  });
  it('acha o código na primeira mensagem do cliente', () => {
    expect(codigoNaMensagem('Oi! vi o post 6075cab, quanto fica?', ['ENTRAAA', '6075CAB'])).toBe('6075CAB');
    expect(codigoNaMensagem('quero o 60750', ['6075CAB'])).toBeNull();
  });
});
