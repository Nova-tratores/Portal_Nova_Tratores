import { describe, it, expect, afterEach } from 'vitest';
import { portalBase } from '../portal-url';

const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => { if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = original; });

describe('portalBase', () => {
  it('sem env usa o domínio do portal', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(portalBase()).toBe('https://portal.novatratores.com');
  });
  it('corrige o ".com.br" que não existe no DNS', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://portal.novatratores.com.br/';
    expect(portalBase()).toBe('https://portal.novatratores.com');
  });
  it('respeita outros valores (dev/preview) e tira a barra final', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000/';
    expect(portalBase()).toBe('http://localhost:3000');
  });
});
