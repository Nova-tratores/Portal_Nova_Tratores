import { describe, it, expect } from 'vitest';
import { montarRelatorio, txt, dinheiro, data, inteiro, NAO_REGISTRADO } from '../contrapartida';
import type { DadosRelatorio } from '../contrapartida';
import type { Acao, Apoio } from '../tipos';

describe('formatadores — vazio vira "Não registrado", zero NÃO', () => {
  it('txt cobre vazio, espaço, null, undefined e as strings "null"/"undefined"', () => {
    expect(txt('Feira X')).toBe('Feira X');
    expect(txt('')).toBe(NAO_REGISTRADO);
    expect(txt('   ')).toBe(NAO_REGISTRADO);
    expect(txt(null)).toBe(NAO_REGISTRADO);
    expect(txt(undefined)).toBe(NAO_REGISTRADO);
    expect(txt('null')).toBe(NAO_REGISTRADO);
    expect(txt('undefined')).toBe(NAO_REGISTRADO);
  });

  // A regra que, se invertida, faz o relatório mentir pra fábrica: dizer
  // "R$ 0,00" onde não há informação, ou "Não registrado" onde há um zero real.
  it('dinheiro: 0 é valor legítimo; ausência é que não é', () => {
    expect(dinheiro(0)).toContain('0,00');
    expect(dinheiro(0)).not.toBe(NAO_REGISTRADO);
    expect(dinheiro(null)).toBe(NAO_REGISTRADO);
    expect(dinheiro(undefined)).toBe(NAO_REGISTRADO);
    expect(dinheiro('')).toBe(NAO_REGISTRADO);
  });

  it('dinheiro entende o formato BR e o americano', () => {
    expect(dinheiro('1.234,56')).toContain('1.234,56');
    expect(dinheiro('800.00')).toContain('800,00');
  });

  it('inteiro: 0 aparece como 0', () => {
    expect(inteiro(0)).toBe('0');
    expect(inteiro(null)).toBe(NAO_REGISTRADO);
  });

  it('data em ISO vira brasileira sem escorregar de fuso', () => {
    expect(data('2026-07-10')).toBe('10/07/2026');
    expect(data('2026-07-10T23:30:00Z')).toBe('10/07/2026');
    expect(data(null)).toBe(NAO_REGISTRADO);
  });
});

// ── Relatório ────────────────────────────────────────────────────────────────
const acaoVazia = {
  id: 'a1', codigo: null, nome: 'IRRIGASHOW 2026', tipo: 'feira', status: 'realizada',
  empresa: 'NOVA', descricao: null, objetivo: null, data_inicio: null, data_fim: null,
  local_nome: null, cidade: null, uf: null, projeto_codigo: null, projeto_nome: null,
  projeto_empresa: null, orcamento_previsto: null, meta_leads: null, meta_vendas: null,
  meta_receita: null, responsavel_id: null, responsavel_nome: null, responsavel_email: null,
  publico_estimado: null, observacoes: null, criado_por_id: null, criado_por_nome: null,
  criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', deleted_at: null,
} as Acao;

const apoioVazio = {
  id: 'ap1', acao_id: 'a1', apoiador: 'Mahindra', tipo: 'verba', descricao: null,
  valor_previsto: null, valor_aprovado: null, valor_recebido: null, status: 'aprovado',
  processo_numero: null, documento_tipo: null, documento_numero: null,
  documento_emitido_em: null, documento_url: null, previsao_credito: null, credito_em: null,
  forma_credito: null, contrapartida_texto: null, contrapartida_prazo: null,
  relatorio_status: 'pendente', relatorio_enviado_em: null, relatorio_enviado_para: [],
  relatorio_url: null, responsavel_id: null, responsavel_nome: null, observacoes: null,
  criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z',
} as Apoio;

const dados = (over: Partial<DadosRelatorio> = {}): DadosRelatorio => ({
  acao: acaoVazia, apoio: apoioVazio, custos: [], leads: [], propostas: [],
  apoios: [apoioVazio], equipe: [], itens: [], realizadas: [], concorrentes: [],
  midias: [], avaliacoes: [], hoje: '2026-09-04', ...over,
});

describe('montarRelatorio', () => {
  it('tem as 7 seções na ordem fixa', () => {
    const r = montarRelatorio(dados());
    expect(r.secoes).toHaveLength(7);
    expect(r.secoes[0].titulo).toMatch(/^1\./);
    expect(r.secoes[6].titulo).toMatch(/^7\./);
  });

  it('campo vazio aparece como "Não registrado" e NUNCA some da seção', () => {
    const r = montarRelatorio(dados());
    const s1 = r.secoes[0];
    // Mesmo com quase tudo vazio, todas as linhas continuam impressas.
    expect(s1.linhas.length).toBeGreaterThan(8);
    expect(s1.linhas.find((l) => l.rotulo === 'Local')?.valor).toBe(NAO_REGISTRADO);
    expect(s1.linhas.find((l) => l.rotulo === 'Responsável')?.valor).toBe(NAO_REGISTRADO);
  });

  it('seção sem nenhum registro imprime uma linha "Não registrado" na tabela', () => {
    const r = montarRelatorio(dados());
    expect(r.secoes[2].tabela?.linhas[0][0]).toBe(NAO_REGISTRADO);
  });

  it('junta as pendências pra tela avisar antes de enviar', () => {
    const r = montarRelatorio(dados());
    expect(r.pendencias.length).toBeGreaterThan(5);
    expect(r.pendencias.some((p) => p.includes('Contrapartida acordada'))).toBe(true);
    expect(r.pendencias.some((p) => p.includes('foto'))).toBe(true);
  });

  it('relatório completo tem MENOS pendências que o vazio', () => {
    const vazio = montarRelatorio(dados());
    const cheio = montarRelatorio(
      dados({
        acao: { ...acaoVazia, local_nome: 'Parque', cidade: 'Piraju', uf: 'SP', data_inicio: '2026-07-08', data_fim: '2026-07-10', responsavel_nome: 'José', objetivo: 'Vender', publico_estimado: 12000, projeto_nome: 'EVT IRRIGASHOW', orcamento_previsto: 30000 },
        apoio: { ...apoioVazio, valor_aprovado: 20000, valor_recebido: 20000, contrapartida_texto: 'Relatório com fotos', contrapartida_prazo: '2026-10-31', documento_tipo: 'ND', documento_numero: '123', documento_emitido_em: '2026-08-01', forma_credito: 'desconto em duplicata', credito_em: '2026-08-20', processo_numero: 'COOP-99' },
        realizadas: [{ id: 'r1', apoio_id: 'ap1', titulo: 'Banner da marca no estande', realizado: true, data: '2026-07-08', evidencia_url: 'https://x/y.jpg' }],
        midias: [{ id: 'm1', url: 'https://x/foto.jpg', legenda: 'Estande', contrapartida: true, tipo: 'foto', ordem: 1 }],
        avaliacoes: [{ funcionou: 'Movimento alto', nao_funcionou: 'Faltou café', aprendizados: 'Levar mais gente', repetir: 'sim' }],
        equipe: [{ nome: 'José', papel: 'responsavel' }],
        itens: [{ quantidade: 2, modelo: '1533', tipo: 'trator', destino: 'exposicao' }],
        custos: [{ id: 'c1', acao_id: 'a1', descricao: 'Estande', categoria: 'estande', fornecedor: null, data: null, vinculo_tipo: null, vinculo_ref: null, vinculo_label: null, origem: 'manual', valor: 30000, valor_fonte: null, sincronizado_em: null, rateio_percent: 100, status: 'confirmado', observacoes: null, anexo_url: null, criado_em: '2026-01-01T00:00:00Z' }],
      }),
    );
    expect(cheio.pendencias.length).toBeLessThan(vazio.pendencias.length);
    expect(cheio.fotos).toHaveLength(1);
  });

  it('só entram as contrapartidas DESTE apoio', () => {
    const r = montarRelatorio(
      dados({
        realizadas: [
          { id: 'r1', apoio_id: 'ap1', titulo: 'Do apoio', realizado: true },
          { id: 'r2', apoio_id: 'outro', titulo: 'De outro apoiador', realizado: true },
          { id: 'r3', apoio_id: null, titulo: 'Atividade interna', realizado: true },
        ],
      }),
    );
    const linhas = r.secoes[2].tabela!.linhas;
    expect(linhas).toHaveLength(1);
    expect(linhas[0][0]).toBe('Do apoio');
  });

  it('avisa quando a contrapartida está registrada mas não foi feita', () => {
    const r = montarRelatorio(
      dados({ realizadas: [{ id: 'r1', apoio_id: 'ap1', titulo: 'Post no Instagram', realizado: false }] }),
    );
    expect(r.pendencias.some((p) => p.includes('não marcada'))).toBe(true);
  });

  it('ROI indefinido sai como travessão, nunca Infinity', () => {
    const r = montarRelatorio(dados());
    const linha = r.secoes[5].linhas.find((l) => l.rotulo.startsWith('Retorno sobre'));
    expect(linha?.valor).toBe('—');
    expect(JSON.stringify(r)).not.toContain('Infinity');
    expect(JSON.stringify(r)).not.toContain('NaN');
  });

  it('só foto marcada como contrapartida entra no anexo', () => {
    const r = montarRelatorio(
      dados({
        midias: [
          { id: 'm1', url: 'a.jpg', contrapartida: true, tipo: 'foto', ordem: 2, legenda: 'Duas' },
          { id: 'm2', url: 'b.jpg', contrapartida: false, tipo: 'foto', ordem: 1, legenda: 'Interna' },
          { id: 'm3', url: 'c.jpg', contrapartida: true, tipo: 'documento', ordem: 0, legenda: 'Doc' },
        ],
      }),
    );
    expect(r.fotos.map((f) => f.url)).toEqual(['a.jpg']);
  });
});
