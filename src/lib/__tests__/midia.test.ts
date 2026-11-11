import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { urlMidia, comMidia } from '../midia';

const ORIGEM = 'https://abcdefgh.supabase.co';

describe('urlMidia', () => {
  it('troca o endereço do link público', () => {
    expect(urlMidia(`${ORIGEM}/storage/v1/object/public/requisicoes/a/b.pdf`, ORIGEM))
      .toBe('https://midia.novatratores.com/storage/v1/object/public/requisicoes/a/b.pdf');
  });
  it('não mexe em link assinado, de outro projeto ou vazio', () => {
    const assinado = `${ORIGEM}/storage/v1/object/sign/x/y.pdf?token=1`;
    expect(urlMidia(assinado, ORIGEM)).toBe(assinado);
    expect(urlMidia('https://outro.supabase.co/storage/v1/object/public/a.png', ORIGEM)).toBe('https://outro.supabase.co/storage/v1/object/public/a.png');
    expect(urlMidia('', ORIGEM)).toBe('');
    expect(urlMidia(null, ORIGEM)).toBeNull();
  });
});

describe('comMidia', () => {
  it('getPublicUrl do cliente sai com o domínio da Nova', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGEM;
    const c = comMidia(createClient(ORIGEM, 'chave'));
    expect(c.storage.from('requisicoes').getPublicUrl('os/x.jpg').data.publicUrl)
      .toBe('https://midia.novatratores.com/storage/v1/object/public/requisicoes/os/x.jpg');
    // aplicar duas vezes não embrulha de novo
    expect(comMidia(c)).toBe(c);
  });
});
