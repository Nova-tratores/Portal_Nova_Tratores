import { describe, expect, it } from 'vitest';
import { alertasExportacao, alertasLote, alertasPermissao, detectar, ehSistema, sequencias, LIMITES, type Evento } from './regras';

let seq = 1;
const E = (o: Partial<Evento>): Evento => ({
  id: seq++, user_id: 'u1', user_nome: 'Fulano', sistema: 'financeiro', acao: 'editar',
  entidade: null, entidade_id: null, entidade_label: null, detalhes: null, created_at: '2026-11-20T13:00:00Z', ...o,
});
const min = (m: number) => new Date(Date.parse('2026-11-20T13:00:00Z') + m * 60000).toISOString();

describe('sequências no tempo', () => {
  it('junta o que está a até N minutos do anterior', () => {
    const s = sequencias([E({ created_at: min(0) }), E({ created_at: min(20) }), E({ created_at: min(100) })], 30);
    expect(s.map((x) => x.length)).toEqual([2, 1]);
  });
});

describe('robô/sistema não é suspeito', () => {
  it('sem pessoa ou com nome de robô', () => {
    expect(ehSistema({ user_id: null, user_nome: 'x' })).toBe(true);
    expect(ehSistema({ user_id: '00000000-0000-0000-0000-000000000000', user_nome: 'Conferência de permissões' })).toBe(true);
    expect(ehSistema({ user_id: 'u1', user_nome: 'Maria' })).toBe(false);
  });
});

describe('permissão', () => {
  it('cada mudança vira um alerta; virar Admin ou mexer em si mesmo é importante', () => {
    const a = alertasPermissao([
      E({ sistema: 'permissoes', acao: 'nivel_alterado', entidade: 'usuario', entidade_id: 'u2', entidade_label: 'Beltrano', detalhes: { nivel: { de: 'usuario', para: 'admin' } } }),
      E({ sistema: 'permissoes', acao: 'permissoes_pessoa', entidade: 'usuario', entidade_id: 'u1', detalhes: { ganha: ['financeiro:caixa'], perde: [] } }),
      E({ sistema: 'permissoes', acao: 'permissoes_pessoa', entidade_id: 'u3', detalhes: { ganha: [], perde: ['pos'] } }),
      E({ sistema: 'permissoes', acao: 'permissoes_importadas', user_id: '00000000-0000-0000-0000-000000000000' }),
    ]);
    expect(a).toHaveLength(3);
    expect(a[0].gravidade).toBe('alta');
    expect(a[0].descricao).toMatch(/Beltrano: nível de usuario para admin/);
    expect(a[1].gravidade).toBe('alta');
    expect(a[1].descricao).toMatch(/próprios acessos/);
    expect(a[2].gravidade).toBe('media');
  });
});

describe('exportação', () => {
  it('10 seguidas em 1 hora avisam; 9 não', () => {
    const dez = Array.from({ length: LIMITES.exportQtd }, (_, i) => E({ acao: 'exportar_pdf', created_at: min(i * 5) }));
    expect(alertasExportacao(dez)).toHaveLength(1);
    expect(alertasExportacao(dez.slice(1))).toHaveLength(0);
  });
  it('relatório grande conta pelas linhas, nunca pelo valor em reais', () => {
    expect(alertasExportacao([E({ acao: 'exportar_relatorio_notas', detalhes: { notas: 8000, linhas: 12 } })])).toHaveLength(1);
    expect(alertasExportacao([E({ acao: 'demonstrativo', detalhes: { total: 25214.08 } })])).toHaveLength(0);
  });
  it('downloads de arquivo num dia; imagem de assinatura não conta', () => {
    expect(alertasExportacao([], [{ user_id: 'u1', rota: '/api/financeiro/notas/[id]/arquivo', dia: '2026-11-20', chamadas: 200 }])).toHaveLength(1);
    expect(alertasExportacao([], [{ user_id: 'u1', rota: '/api/financeiro/config-envio/assinatura-arquivos', dia: '2026-11-20', chamadas: 999 }])).toHaveLength(0);
  });
  it('acesso à tela não é exportação', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => E({ sistema: 'financeiro-notas', acao: 'acesso', created_at: min(i) }));
    expect(alertasExportacao(muitos)).toHaveLength(0);
  });
});

describe('ação sensível em lote', () => {
  it('15 iguais seguidas avisam; editar em volume não', () => {
    const exc = Array.from({ length: LIMITES.loteQtd }, (_, i) => E({ acao: 'excluir', entidade_label: `#${i}`, created_at: min(i) }));
    const a = alertasLote(exc);
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toMatch(/15× "excluir"/);
    expect(alertasLote(Array.from({ length: 40 }, (_, i) => E({ acao: 'editar', created_at: min(i) })))).toHaveLength(0);
  });
  it('a chave é a do 1º evento: rodar de novo com a sequência maior não repete', () => {
    const base = Array.from({ length: 16 }, (_, i) => E({ acao: 'cancelar', created_at: min(i) }));
    const k1 = alertasLote(base.slice(0, 15))[0].chave;
    const k2 = alertasLote(base)[0].chave;
    expect(k1).toBe(k2);
  });
});

describe('detectar', () => {
  it('junta os três e põe os importantes primeiro', () => {
    const r = detectar([
      ...Array.from({ length: 15 }, (_, i) => E({ acao: 'reverter_recebimento', created_at: min(i) })),
      E({ sistema: 'permissoes', acao: 'nivel_alterado', entidade_id: 'u9', detalhes: { nivel: { de: 'usuario', para: 'dev' } } }),
    ]);
    expect(r.map((a) => a.tipo)).toEqual(['permissao', 'lote']);
  });
});
