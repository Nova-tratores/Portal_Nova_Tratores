import { describe, expect, it } from 'vitest';
import { faltaContato, juntarTelefones, mesclarSuporte, normalizarFalta, respostaVazia, telefonesDoTexto, textoPedidoSuporte, textoRespostaVendedor } from '../quest-contato';

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

describe('resposta do suporte', () => {
  const resp = (o: Partial<Parameters<typeof mesclarSuporte>[1][number]>) => ({
    telefone: null, celular: null, endereco: null, lat: null, lng: null, respondido_por: 'Mariano', respondido_em: '2026-11-11T12:00:00Z', ...o,
  });
  const visita = { nome: 'Onde o trator foi visto', lat: -23.4, lng: -49.4, origem: 'visita', quando: null, quem: null };
  const crm = { nome: 'Ponto do CRM', lat: -23.0, lng: -49.0, origem: 'crm', quando: null, quem: null };

  it('telefone do suporte vem na frente, endereço do suporte vale, ponto entra depois da visita', () => {
    const base = { telefones: telefonesDoTexto('14 3351-6049', 'omie'), endereco: 'Rua velha', locais: [visita, crm] };
    const m = mesclarSuporte(base, [resp({ celular: '14 99762-7413', endereco: 'Sítio Novo, Tejupá', lat: -23.3, lng: -49.3 })]);
    expect(m.telefones.map((t) => [t.numero, t.origem])).toEqual([['14997627413', 'suporte'], ['1433516049', 'omie']]);
    expect(m.endereco).toBe('Sítio Novo, Tejupá');
    expect(m.locais.map((l) => l.origem)).toEqual(['visita', 'suporte', 'crm']);
  });
  it('sem resposta não muda nada; a mais recente ganha no endereço', () => {
    const base = { telefones: [], endereco: 'X', locais: [] };
    expect(mesclarSuporte(base, [])).toBe(base);
    const m = mesclarSuporte(base, [resp({ endereco: 'Antigo', respondido_em: '2026-11-01T00:00:00Z' }), resp({ endereco: 'Novo' })]);
    expect(m.endereco).toBe('Novo');
  });
  it('ponto igual a um que já existe não repete', () => {
    const m = mesclarSuporte({ telefones: [], endereco: null, locais: [crm] }, [resp({ lat: -23.0001, lng: -49.0001 })]);
    expect(m.locais).toHaveLength(1);
  });
  it('recado ao vendedor lista o que chegou', () => {
    const r = textoRespostaVendedor({ alvo: 'JOÃO NUNES · trator …001768', respondidoPor: 'Mariano', telefone: null, celular: '14997627413', endereco: 'Sítio X', temLocal: true });
    expect(r.titulo).toBe('Contato atualizado pelo suporte');
    expect(r.corpo).toContain('Mariano atualizou o contato de JOÃO NUNES');
    expect(r.corpo).toContain('(14) 99762-7413');
    expect(r.corpo).toContain('Localização no mapa');
  });
  it('resposta vazia = sem telefone válido, endereço ou ponto', () => {
    expect(respostaVazia({ telefone: '3351-6049' })).toBe(true); // sem DDD não vale
    expect(respostaVazia({ celular: '14 99762-7413' })).toBe(false);
    expect(respostaVazia({ lat: -23.2 })).toBe(false);
  });
});
