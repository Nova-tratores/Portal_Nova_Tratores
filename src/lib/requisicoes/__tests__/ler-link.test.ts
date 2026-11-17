import { describe, expect, it } from 'vitest';
import { lerDadosDoHtml, precoDe, urlPublica } from '../ler-link';

describe('ler o link da cotação', () => {
  it('JSON-LD Product (com @graph e oferta com vendedor)', () => {
    const html = `<html><head><meta property="og:site_name" content="Mercado Livre">
      <script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Filtro de Óleo Mahindra 6075","image":["https://x/img.jpg"],
      "offers":{"@type":"Offer","price":"189.90","priceCurrency":"BRL","seller":{"@type":"Organization","name":"AGRO PEÇAS PIRAJU"}}}]}</script></head></html>`;
    expect(lerDadosDoHtml(html, 'https://produto.mercadolivre.com.br/MLB-1')).toEqual({
      produto: 'Filtro de Óleo Mahindra 6075', preco: 189.9, fornecedor: 'AGRO PEÇAS PIRAJU', site: 'produto.mercadolivre.com.br', imagem: 'https://x/img.jpg', fonte: 'json-ld',
    });
  });
  it('sem JSON-LD usa as metas; sem nada usa o título e o domínio', () => {
    const html = `<meta property="og:title" content="Correia &amp; Polia"><meta property="product:price:amount" content="1.234,50">`;
    const d = lerDadosDoHtml(html, 'https://www.lojadotrator.com.br/p/1');
    expect(d).toMatchObject({ produto: 'Correia & Polia', preco: 1234.5, fornecedor: 'Lojadotrator', fonte: 'meta' });
    expect(lerDadosDoHtml('<title>Rolamento 6205 | Casa do Rolamento</title>', 'https://casadorolamento.com.br/x')).toMatchObject({ produto: 'Rolamento 6205', preco: null, fonte: 'titulo' });
  });
  it('preço BR/US e endereço seguro', () => {
    expect(precoDe('R$ 1.299,90')).toBe(1299.9);
    expect(precoDe('1,299.90')).toBe(1299.9);
    expect(precoDe(0)).toBeNull();
    expect(urlPublica('https://loja.com.br/x')?.hostname).toBe('loja.com.br');
    expect(urlPublica('http://localhost:3000')).toBeNull();
    expect(urlPublica('http://192.168.0.1/')).toBeNull();
    expect(urlPublica('file:///etc/passwd')).toBeNull();
  });
});
