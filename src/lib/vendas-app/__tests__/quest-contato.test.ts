import { describe, expect, it } from 'vitest';
import { faltaContato, juntarTelefones, normalizarFalta, telefonesDoTexto, textoPedidoSuporte } from '../quest-contato';

describe('telefonesDoTexto', () => {
  it('limpa formatos do Omie e separa vários', () => {
    const t = telefonesDoTexto('(14) 998378238 / 14 3351-6049', 'omie');
    expect(t.map((x) => x.numero)).toEqual(['14998378238', '1433516049']);
    expect(t[0]).toMatchObject({ celular: true, exibir: '(14) 99837-8238' });
    expect(t[1]).toMatchObject({ celular: false, exibir: '(14) 3351-6049' });
  });
  it('celular antigo sem o 9 ganha o 9', () => {
    expect(telefonesDoTexto('(43) 9157-8141', 'omie')[0]).toMatchObject({ numero: '43991578141', celular: true });
  });
  it('tira 55 e 0 da frente; descarta sem DDD', () => {
    expect(telefonesDoTexto('+55 43 99152-7562', 'quest')[0].numero).toBe('43991527562');
    expect(telefonesDoTexto('014 99762-7413', 'crm')[0].numero).toBe('14997627413');
    expect(telefonesDoTexto('4586-0400', 'crm')).toEqual([]);
    expect(telefonesDoTexto(null, 'crm')).toEqual([]);
  });
});

describe('juntarTelefones', () => {
  it('não repete e põe celular primeiro', () => {
    const a = telefonesDoTexto('14 3351-6049', 'omie');
    const b = telefonesDoTexto('14 3351-6049 / 14 99762-7413', 'crm');
    const j = juntarTelefones(a, b);
    expect(j.map((x) => x.numero)).toEqual(['14997627413', '1433516049']);
    expect(j[1].origem).toBe('omie');
  });
});

describe('faltaContato', () => {
  const cel = telefonesDoTexto('14 99762-7413', 'omie');
  const fixo = telefonesDoTexto('14 3351-6049', 'omie');
  it('nada falta', () => expect(faltaContato({ telefones: cel, temLocal: true, endereco: null })).toEqual([]));
  it('sem número e sem lugar', () => expect(faltaContato({ telefones: [], temLocal: false, endereco: ' ' })).toEqual(['telefone', 'endereco']));
  it('só fixo = falta WhatsApp; endereço basta', () => expect(faltaContato({ telefones: fixo, temLocal: false, endereco: 'Sítio X' })).toEqual(['whatsapp']));
});

describe('pedido ao suporte', () => {
  it('texto com o que falta e o alvo', () => {
    const t = textoPedidoSuporte({ vendedor: 'Matheus', cliente: 'PAULO', cidade: 'Carlópolis', trator: 'JIVO …F00710', falta: ['telefone', 'endereco'], questId: 8 });
    expect(t.titulo).toBe('Matheus pede telefone e endereço / localização: PAULO');
    expect(t.descricao).toContain('Trator: JIVO …F00710');
  });
  it('pedido vindo de negócio', () => {
    const t = textoPedidoSuporte({ vendedor: 'Matheus', cliente: null, cidade: 'Carlópolis', trator: null, negocio: 'Pulverizador KUHN', falta: ['whatsapp'] });
    expect(t.titulo).toBe('Matheus pede celular / WhatsApp: Pulverizador KUHN');
    expect(t.descricao).toContain('com um negócio');
  });
  it('telefone guarda o nome da pessoa', () => expect(telefonesDoTexto('14 99762-7413', 'contato', ' João ')[0].nome).toBe('João'));
  it('normalizarFalta ignora lixo', () => expect(normalizarFalta(['endereco', 'x', 'telefone'])).toEqual(['telefone', 'endereco']));
});
