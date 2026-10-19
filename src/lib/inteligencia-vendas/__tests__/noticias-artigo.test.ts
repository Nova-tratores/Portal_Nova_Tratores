import { describe, expect, it } from 'vitest';
import { corpoGoogle, ehLinkGoogle, extrairArtigo, idDoLinkGoogle, imagemDoRSS, parametrosGoogle, urlDaRespostaGoogle } from '../noticias-artigo';

const P = 'O preço da soja subiu na semana em Ourinhos, puxado pela demanda externa e pelo dólar mais firme no mercado.';

describe('noticias-artigo', () => {
  it('acha a foto do RSS', () => {
    expect(imagemDoRSS('<item><media:content url="https://x.com/a.jpg" medium="image"/></item>')).toBe('https://x.com/a.jpg');
    expect(imagemDoRSS('<item><enclosure url="https://x.com/b.png" type="image/png"/></item>')).toBe('https://x.com/b.png');
    expect(imagemDoRSS('<item><description><![CDATA[<p><img src="https://x.com/c.webp" /> texto</p>]]></description></item>')).toBe('https://x.com/c.webp');
    expect(imagemDoRSS('<item><enclosure url="https://x.com/a.mp3" type="audio/mpeg"/></item>')).toBeNull();
  });

  it('extrai foto, autor e só os parágrafos da matéria', () => {
    const html = `<html><head><meta property="og:image" content="/fotos/soja.jpg"><meta name="author" content="Redação"></head>
      <body><nav><p>${P} menu que não pode entrar no texto de jeito nenhum.</p></nav>
      <article><p>${P}</p><p>Assine a nossa newsletter e receba as notícias do agro todos os dias no seu e-mail.</p>
      <p>.box { color: red; font-size: 15px; line-height: 1.6; white-space: pre; display: block; }</p>
      <p>Curto.</p><p>${P.replace('soja', 'milho')}</p><p>${P}</p></article></body></html>`;
    const a = extrairArtigo(html, 'https://site.com/materia');
    expect(a.imagem).toBe('https://site.com/fotos/soja.jpg');
    expect(a.autor).toBe('Redação');
    expect(a.paragrafos).toEqual([P, P.replace('soja', 'milho')]);
  });

  it('Google Notícias: id, parâmetros, corpo e link real', () => {
    const u = 'https://news.google.com/rss/articles/CBMiABC?oc=5';
    expect(ehLinkGoogle(u)).toBe(true);
    expect(ehLinkGoogle('https://g1.globo.com/x')).toBe(false);
    expect(idDoLinkGoogle(u)).toBe('CBMiABC');
    expect(parametrosGoogle('<div data-n-a-ts="123" data-n-a-sg="AbC_1"></div>')).toEqual({ ts: 123, sg: 'AbC_1' });
    expect(decodeURIComponent(corpoGoogle('CBMiABC', 123, 'AbC_1'))).toContain('garturlreq');
    expect(urlDaRespostaGoogle(')]}\'\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.site.com/materia\\",1]"]]')).toBe('https://www.site.com/materia');
  });
});

import { foraDoAgro } from '../noticias';
describe('foraDoAgro', () => {
  it('tira crime e acidente, mantém o que é do campo', () => {
    expect(foraDoAgro('Polícia identifica mãe e três filhos que morreram em acidente com carro')).toBe(true);
    expect(foraDoAgro('Acidente com trator deixa produtor ferido em Fartura')).toBe(false);
    expect(foraDoAgro('Preço do milho cai e preocupa produtores')).toBe(false);
  });
});

import { linhaServeMaquina } from '../plano-safra';
describe('linhaServeMaquina', () => {
  it('fica só o que serve para vender máquina', () => {
    expect(linhaServeMaquina({ nome: 'Pronamp Investimento — aquisição de máquinas e equipamentos' })).toBe(true);
    expect(linhaServeMaquina({ nome: 'Moderfrota — receita bruta até R$ 45 milhões' })).toBe(true);
    expect(linhaServeMaquina({ nome: 'Pronamp Investimento — avicultura caipira de postura' })).toBe(false);
    expect(linhaServeMaquina({ nome: 'Pronamp Investimento — aquisição de bovinos e bubalinos para recria' })).toBe(false);
  });
});
