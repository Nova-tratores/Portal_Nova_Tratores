import { describe, it, expect } from 'vitest';
import {
  separarServSolicitado, textosDoServico, situacaoDaPeca, totaisDetalhados, valorUnitario,
  type GarantiaDetalhada, type PecaDetalhe,
} from '../relatorio-detalhado';

const OS = 'Modelo: 6075E\nChassis: CAB MDI07513PS0006206\nHorimetro: 1017.9\n\nSolicitação do cliente: Nível de combustível errado.\nServiço Realizado: Troca do chicote da boia.';

describe('separarServSolicitado', () => {
  it('separa solicitação e serviço realizado do texto da OS', () => {
    expect(separarServSolicitado(OS)).toEqual({ solicitacao: 'Nível de combustível errado.', realizado: 'Troca do chicote da boia.' });
  });
  it('sem rótulos tira só o cabeçalho', () => {
    expect(separarServSolicitado('Modelo: X\nChassis: Y\nTrator sem freio')).toEqual({ solicitacao: 'Trator sem freio', realizado: null });
  });
  it('vazio', () => {
    expect(separarServSolicitado(null)).toEqual({ solicitacao: null, realizado: null });
  });
});

describe('textosDoServico', () => {
  it('texto revisado da SG vence o relatório do técnico e a OS', () => {
    const t = textosDoServico({
      respostas: { sg_acao_tomada: 'Revisado', sg_reclamacao: '' },
      tecnico: { Motivo: 'Diag do técnico', ServicoRealizado: 'Do app' },
      servSolicitado: OS,
    });
    expect(t).toEqual({ reclamacao: 'Nível de combustível errado.', diagnostico: 'Diag do técnico', executado: 'Revisado' });
  });
  it('sem SG nem técnico usa o texto da OS', () => {
    expect(textosDoServico({ servSolicitado: OS }).executado).toBe('Troca do chicote da boia.');
  });
});

describe('situacaoDaPeca', () => {
  it('classifica', () => {
    expect(situacaoDaPeca({ cod: 'REQ-1', resultado: 'aprovada', forma: null, chegou: false })).toBe('terceiros');
    expect(situacaoDaPeca({ cod: 'A', resultado: 'rejeitada', forma: 'paga', chegou: false })).toBe('recusada');
    expect(situacaoDaPeca({ cod: 'A', resultado: 'aprovada', forma: 'paga', chegou: true })).toBe('paga');
    expect(situacaoDaPeca({ cod: 'A', resultado: 'aprovada', forma: 'reposta', chegou: true })).toBe('chegou');
    expect(situacaoDaPeca({ cod: 'A', resultado: 'aprovada', forma: null, chegou: false })).toBe('a_chegar');
  });
});

const peca = (situacao: PecaDetalhe['situacao'], valor: number, quantidade = 1): PecaDetalhe =>
  ({ cod: 'X', descricao: 'x', quantidade, valor, situacao, nota: null, marcada: true });
const gar = (o: Partial<GarantiaDetalhada>): GarantiaDetalhada => ({
  id: '1', numero: 'GAR', sg: null, os: 'OS', cliente: null, chassi: null, modelo: null, montadora: null, aprovada: true,
  finalizada_em: null, tecnico: null, horas: 0, km: 0, valorHoras: 0, valorKm: 0, valorPecas: 0, total: 0,
  nfse: { situacao: 'nao_precisa', numero: null, data: null, confirmada: false }, pecas: [],
  servico: { reclamacao: null, diagnostico: null, executado: null }, motivoRecusa: null, recusadoPor: null,
  cobranca: { status: null, valor: null }, ...o,
});

describe('totaisDetalhados', () => {
  it('soma horas/km, peças por situação e NFS-e pendentes; ignora qtd negativa', () => {
    const t = totaisDetalhados([
      gar({ horas: 2, km: 100, valorHoras: 386, valorKm: 280, total: 666, nfse: { situacao: 'pendente', numero: null, data: null, confirmada: false },
        pecas: [peca('paga', 100), peca('a_chegar', 50), peca('a_chegar', -1860, -2), peca('chegou', 30)] }),
      gar({ aprovada: false, horas: 5, total: 0 }),
    ]);
    expect(t.aprovadas).toBe(1);
    expect(t.recusadas).toBe(1);
    expect(t.horas).toBe(2);
    expect(t.km).toBe(100);
    expect(t.pecasPagas).toEqual({ itens: 1, valor: 100 });
    expect(t.pecasAChegar).toEqual({ itens: 1, valor: 50 });
    expect(t.pecasChegaram).toEqual({ itens: 1, valor: 30 });
    expect(t.nfsePendentes).toEqual({ qtd: 1, valor: 666 });
  });
});

describe('valorUnitario', () => {
  it('divide e evita divisão por zero', () => {
    expect(valorUnitario(386, 2)).toBe(193);
    expect(valorUnitario(386, 0)).toBeNull();
  });
});
