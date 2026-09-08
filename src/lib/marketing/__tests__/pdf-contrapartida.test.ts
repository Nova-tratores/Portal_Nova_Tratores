import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { gerarPDFContrapartida } from '../pdf-contrapartida';
import { montarRelatorio } from '../contrapartida';
import type { DadosRelatorio } from '../contrapartida';
import type { Acao, Apoio, Custo, Lead, PropostaVinculada } from '../tipos';
import { PROPOSTA_VENDIDA } from '../tipos';

// Este teste existe por um motivo concreto: o pdfkit quebra quando é bundlado
// (perde o caminho do Helvetica.afm e estoura ENOENT). O `serverExternalPackages`
// no next.config.ts é o que segura isso, e aqui é onde a gente descobre se
// alguém mexeu nesse arranjo.
//
// Para olhar o PDF de verdade: PDF_SAIDA=caminho/arquivo.pdf npx vitest run pdf-contrapartida

const acao = {
  id: 'a1', codigo: 'IRRIGASHOW26', nome: 'IRRIGASHOW 2026', tipo: 'feira',
  status: 'realizada', empresa: 'NOVA', descricao: null,
  objetivo: 'Gerar oportunidades de trator compacto na região irrigada',
  data_inicio: '2026-07-08', data_fim: '2026-07-10', local_nome: 'Parque de Exposições',
  cidade: 'Piraju', uf: 'SP', projeto_codigo: 9001, projeto_nome: 'EVT-2026-IRRIGASHOW',
  projeto_empresa: 'NOVA', orcamento_previsto: 30000, meta_leads: 50, meta_vendas: 4,
  meta_receita: 1_000_000, responsavel_id: null, responsavel_nome: 'José',
  responsavel_email: null, publico_estimado: 12000, observacoes: null,
  criado_por_id: null, criado_por_nome: null,
  criado_em: '2026-05-01T00:00:00Z', atualizado_em: '2026-05-01T00:00:00Z', deleted_at: null,
} as Acao;

const apoio = {
  id: 'ap1', acao_id: 'a1', apoiador: 'Mahindra', tipo: 'verba',
  descricao: 'Apoio à participação na feira',
  valor_previsto: 20000, valor_aprovado: 20000, valor_recebido: 20000, status: 'recebido',
  processo_numero: 'COOP-2026-118', documento_tipo: 'ND', documento_numero: '4471',
  documento_emitido_em: '2026-08-01', documento_url: null,
  previsao_credito: '2026-08-20', credito_em: '2026-08-20',
  forma_credito: 'desconto em duplicata',
  contrapartida_texto: 'Relatório com fotos do estande, marca aplicada e resultados comerciais',
  contrapartida_prazo: '2026-10-31', relatorio_status: 'pendente',
  relatorio_enviado_em: null, relatorio_enviado_para: [], relatorio_url: null,
  responsavel_id: null, responsavel_nome: 'José', observacoes: null,
  criado_em: '2026-05-01T00:00:00Z', atualizado_em: '2026-05-01T00:00:00Z',
} as Apoio;

const custo = (id: string, descricao: string, categoria: string, valor: number): Custo => ({
  id, acao_id: 'a1', descricao, categoria: categoria as Custo['categoria'],
  fornecedor: 'Fornecedor exemplo', data: '2026-07-01', vinculo_tipo: null,
  vinculo_ref: null, vinculo_label: null, origem: 'manual', valor, valor_fonte: null,
  sincronizado_em: null, rateio_percent: 100, status: 'confirmado',
  observacoes: null, anexo_url: null, criado_em: '2026-07-01T00:00:00Z',
});

const lead = (id: string): Lead => ({
  id, acao_id: 'a1', texto: 'Interesse em trator 75cv', nome: null, telefone: null,
  telefone_norm: null, cidade: null, interesse: null, foto_url: null,
  cliente_cod_cli: null, cliente_empresa: null, cliente_nome: null,
  qualificacao: 'novo', temperatura: null, responsavel_nome: null,
  proximo_contato: null, observacoes: null, capturado_em: '2026-07-09T00:00:00Z',
  capturado_por_nome: null,
});

const proposta = (id: number, valor: number): PropostaVinculada => ({
  proposta_id: id, peso: 1, status: PROPOSTA_VENDIDA, valor_total: valor,
  cliente: `Cliente ${id}`, vendedor_nome: 'Vendedor', criado_em: '2026-07-11T00:00:00Z',
});

const completo: DadosRelatorio = {
  acao, apoio, apoios: [apoio],
  custos: [
    custo('c1', 'Locação e montagem do estande', 'estande', 18000),
    custo('c2', 'Transporte das máquinas', 'transporte', 9000),
    custo('c3', 'Hospedagem da equipe', 'hospedagem', 3000),
  ],
  leads: Array.from({ length: 41 }, (_, i) => lead(`l${i}`)),
  propostas: [proposta(1, 400000), proposta(2, 400000), proposta(3, 400000)],
  equipe: [
    { nome: 'José', papel: 'responsavel' },
    { nome: 'Joaquim Fernando', papel: 'vendedor' },
  ],
  itens: [
    { quantidade: 2, modelo: '1533', tipo: 'trator', destino: 'exposicao' },
    { quantidade: 1, modelo: 'Roçadeira', tipo: 'implemento', destino: 'demonstracao' },
  ],
  realizadas: [
    { apoio_id: 'ap1', titulo: 'Marca da fábrica aplicada no estande', realizado: true, data: '2026-07-08', evidencia_url: 'https://exemplo/estande.jpg' },
    { apoio_id: 'ap1', titulo: 'Publicação nas redes com a marca', realizado: false, data: null, evidencia_url: null },
  ],
  concorrentes: [{ marca: 'Concorrente A' }],
  // URL propositalmente quebrada: o PDF tem que sair mesmo assim.
  midias: [{ url: 'https://exemplo.invalido/foto-que-nao-existe.jpg', legenda: 'Estande montado', contrapartida: true, tipo: 'foto', ordem: 1 }],
  avaliacoes: [{ funcionou: 'Movimento alto nos três dias', nao_funcionou: 'Faltou material impresso', aprendizados: 'Levar mais um vendedor', repetir: 'sim_com_ajustes' }],
  hoje: '2026-09-04',
};

// A ação quase vazia: é o caso real de quem herdou um evento sem registro.
const vazio: DadosRelatorio = {
  acao: { ...acao, local_nome: null, cidade: null, uf: null, objetivo: null, publico_estimado: null, projeto_nome: null, responsavel_nome: null },
  apoio: { ...apoio, contrapartida_texto: null, documento_tipo: null, documento_numero: null, credito_em: null, forma_credito: null, processo_numero: null, valor_recebido: null },
  apoios: [apoio], custos: [], leads: [], propostas: [], equipe: [], itens: [],
  realizadas: [], concorrentes: [], midias: [], avaliacoes: [], hoje: '2026-09-04',
};

async function gerar(dados: DadosRelatorio, sufixo: string): Promise<Buffer> {
  const pdf = await gerarPDFContrapartida(montarRelatorio(dados));
  const saida = process.env.PDF_SAIDA;
  if (saida) writeFileSync(saida.replace('.pdf', `-${sufixo}.pdf`), pdf);
  return pdf;
}

describe('PDF do relatório de contrapartida', () => {
  it('gera um PDF válido com a ação completa', async () => {
    const pdf = await gerar(completo, 'completo');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3000);
    // %%EOF fecha um PDF bem formado.
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF');
  }, 30_000);

  it('foto com URL quebrada não derruba o documento', async () => {
    const pdf = await gerar(completo, 'foto-quebrada');
    expect(pdf.length).toBeGreaterThan(3000);
  }, 30_000);

  it('gera o PDF mesmo com a ação quase toda vazia', async () => {
    const pdf = await gerar(vazio, 'vazio');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // O documento vazio ainda traz as 7 seções e a caixa de pendências.
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);
});
