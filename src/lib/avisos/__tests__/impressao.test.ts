import { describe, it, expect } from 'vitest';
import { blocosDoTexto, htmlComunicado } from '../impressao';

const TEXTO = `Prezados colaboradores,

Informamos que, a partir de 24/11/26, passam a valer as seguintes regras:
1. O portão da empresa será fechado diariamente às 17h30.
2. Somente motocicletas e veículos da empresa estão autorizados a estacionar dentro da loja.
As medidas têm como objetivo garantir a segurança.

Contamos com a colaboração de todos.`;

describe('comunicado impresso', () => {
  it('separa saudação, parágrafos e lista numerada', () => {
    const b = blocosDoTexto(TEXTO);
    expect(b.map((x) => x.tipo)).toEqual(['saudacao', 'paragrafo', 'lista', 'paragrafo', 'paragrafo']);
    const lista = b[2];
    expect(lista.tipo === 'lista' && lista.itens.length).toBe(2);
  });

  it('texto sem saudação nem lista vira parágrafos', () => {
    expect(blocosDoTexto('Amanhã não haverá expediente.\nObrigado.').map((x) => x.tipo)).toEqual(['paragrafo']);
  });

  it('monta a folha com escape, data em negrito e padrões', () => {
    const h = htmlComunicado({ titulo: 'Portão <b>', conteudo: TEXTO, logoUrl: 'https://x/Logo_Nova.png', data: new Date(2026, 10, 23) });
    expect(h).toContain('Portão &lt;b&gt;');
    expect(h).toContain('<strong>24/11/26</strong>');
    expect(h).toContain('Administração / Gerência');
    expect(h).toContain('AVISO OFICIAL');
    expect(h).toContain('<ol class="lista">');
    expect(htmlComunicado({ titulo: 't', conteudo: 'x', prioridade: 'urgente', logoUrl: 'l' })).toContain('AVISO URGENTE');
  });
});
