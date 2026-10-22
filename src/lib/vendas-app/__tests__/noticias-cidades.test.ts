// Notícias das cidades do vendedor: grafias → IBGE, filtro por cidade citada, junção.
import { describe, it, expect } from 'vitest';
import { juntarNoticias, mencionaCidade, municipiosDoVendedor, noticiasDaCidade, urlBuscaCidade } from '../noticias-cidades';

const ibge = new Map([
  ['carlopolis|PR', { ibge: 4104709, nome: 'Carlópolis', uf: 'PR' }],
  ['taguai|SP', { ibge: 3553203, nome: 'Taguaí', uf: 'SP' }],
  ['oleo|SP', { ibge: 3533809, nome: 'Óleo', uf: 'SP' }],
]);

describe('notícias das cidades do vendedor', () => {
  it('junta as grafias no mesmo município e ignora erro de digitação', () => {
    const r = municipiosDoVendedor(['Carlipolis', 'Carlópolis', 'CARLOPOLIS (PR)', 'TAGUAI (SP)', 'Taguaí'], ibge);
    expect(r.map((m) => m.nome)).toEqual(['Carlópolis', 'Taguaí']);
  });

  it('busca com a cidade e o estado por extenso', () => {
    expect(decodeURIComponent(urlBuscaCidade({ ibge: 1, nome: 'Óleo', uf: 'SP' }))).toContain('"Óleo" "São Paulo" when:7d');
  });

  it('só entra matéria que cita a cidade como palavra', () => {
    expect(mencionaCidade('Prefeitura de Taguai abre vagas', 'Taguaí')).toBe(true);
    expect(mencionaCidade('Preço do óleo diesel sobe', 'Óleo')).toBe(true);
    expect(mencionaCidade('Oleoduto em obras', 'Óleo')).toBe(false);
    const itens = [
      { titulo: 'Festa do Peão de Carlópolis - Folha', link: 'https://x/1', descricao: '', publicadoEm: '2026-10-21T10:00:00Z', fonte: 'Folha', imagem: null },
      { titulo: 'Safra de soja no Paraná', link: 'https://x/2', descricao: '', publicadoEm: '2026-10-21T10:00:00Z', fonte: null, imagem: null },
    ];
    const r = noticiasDaCidade(itens, { ibge: 4104709, nome: 'Carlópolis', uf: 'PR' });
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe('Festa do Peão de Carlópolis');
  });

  it('tira matéria repetida e ordena da mais nova', () => {
    const n = (titulo: string, d: string) => ({ titulo, link: 'https://x', fonte: null, publicadoEm: d, cidade: 'A', uf: 'SP' });
    const r = juntarNoticias([[n('Velha', '2026-10-01T00:00:00Z'), n('Nova!', '2026-10-20T00:00:00Z')], [n('nova', '2026-10-19T00:00:00Z')]]);
    expect(r.map((x) => x.titulo)).toEqual(['Nova!', 'Velha']);
  });
});
