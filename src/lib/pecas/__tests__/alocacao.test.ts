import { describe, it, expect } from 'vitest';
import {
  agruparPorProduto, cfopSemEstoque, chaveProduto, copiasEtiqueta, dataBrParaIso, dentroDoHorarioComercial, diasDesde, inicioAlocacao,
  locacaoCompleta, locacaoCurta, motivoFora, planejar,
  type EntradaPlano, type EspelhoCaract, type NotaRecebida, type PendenciaAlocacao,
} from '../alocacao';
import { locacaoEtiqueta, ocupantesDe, posDeCar } from '@/lib/ajustes/posicao';

const nota = (over: Partial<NotaRecebida> = {}): NotaRecebida => ({
  conta: 'castro', id_receb: 100, numero_nfe: '000015694', fornecedor: 'Uniagro', recebido_em: '2026-10-02',
  itens: [{ nCodProduto: 6044678807, cCodigo: '001209', cDescricao: 'Cubo', nQtde: 4, nValUnit: 80, cCFOPEntrada: '1.102' }],
  ...over,
});
const entrada = (over: Partial<EntradaPlano> = {}): EntradaPlano => ({
  notas: [nota()], existentes: [], espelho: new Map(), cadastro: new Map(), desde: '2026-10-01', ...over,
});

describe('locação', () => {
  it('completa = as três preenchidas, sem diferenciar maiúsculas', () => {
    expect(locacaoCompleta({ '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' })).toBe(true);
    expect(locacaoCompleta({ '#Prateleira': '3', '#Andar': 'G', '#Caixa': '01' })).toBe(true);
    expect(locacaoCompleta({ '#PRATELEIRA': '3', '#ANDAR': 'G' })).toBe(false);
    expect(locacaoCompleta({})).toBe(false);
    expect(locacaoCompleta(null)).toBe(false);
  });
  it('placeholder (XXX / 000 / ---) conta como vazio', () => {
    expect(locacaoCompleta({ '#PRATELEIRA': 'XXX', '#ANDAR': 'G', '#CAIXA': '1' })).toBe(false);
    expect(locacaoCompleta({ '#PRATELEIRA': '3', '#ANDAR': '000', '#CAIXA': '1' })).toBe(false);
    expect(locacaoCompleta({ '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '---' })).toBe(false);
  });
  it('andar/caixa alternativos (#ANDAR2/#CAIXA2) valem', () => {
    expect(locacaoCompleta({ '#PRATELEIRA': '3', '#ANDAR2': 'G', '#CAIXA2': '1' })).toBe(true);
    expect(posDeCar({ '#PRATELEIRA': '3', '#ANDAR2': 'G' })).toMatchObject({ prat: '3', andar: 'G', caixa: '', temLoc: true });
  });
  it('textos da posição', () => {
    expect(locacaoCurta({ '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' })).toBe('3-G-1');
    expect(locacaoCurta({ '#PRATELEIRA': '3' })).toBe('3-—-—');
    expect(locacaoEtiqueta({ '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '000' })).toBe('PRATELEIRA 3 · ANDAR G');
  });
  it('ocupantes de uma posição ignoram a própria peça', () => {
    const lista = [
      { empresa: 'NOVA', codigo_produto: 1, caracteristicas: { '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' } },
      { empresa: 'NOVA', codigo_produto: 2, caracteristicas: { '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' } },
      { empresa: 'NOVA', codigo_produto: 3, caracteristicas: { '#PRATELEIRA': '4', '#ANDAR': 'G', '#CAIXA': '1' } },
    ];
    expect(ocupantesDe(lista, { prat: '3', andar: 'G', caixa: '1' }, 'NOVA|1').map((p) => p.codigo_produto)).toEqual([2]);
  });
});

describe('elegibilidade do item', () => {
  it('CFOP de uso/consumo, imobilizado e combustível ficam fora (1.xxx e 2.xxx)', () => {
    for (const c of ['1.556', '2.556', '1556', '1.407', '1.551', '2.551', '1.406', '1.653']) expect(cfopSemEstoque(c)).toBe(true);
    for (const c of ['1.102', '2.102', '1.403', '5.102', '', null]) expect(cfopSemEstoque(c)).toBe(false);
  });
  it('motivos', () => {
    expect(motivoFora({ nCodProduto: 0, cCFOPEntrada: '1.102' })).toBe('sem-produto');
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.556' })).toBe('cfop-sem-estoque');
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 185000 })).toBe('maquina');
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 50 }, { familia_nome: 'Trator Novo' })).toBe('nao-e-peca');
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 50 }, { familia_nome: 'Peças', inativo: true })).toBe('nao-e-peca');
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 50 }, { familia_nome: 'Peças' })).toBeNull();
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 50 }, { familia_nome: null })).toBeNull();
    // produto criado na própria entrada: ainda não está no cadastro → conta como peça
    expect(motivoFora({ nCodProduto: 9, cCFOPEntrada: '1.102', nValUnit: 50 })).toBeNull();
  });
});

describe('planejar', () => {
  it('abre demanda para peça recebida sem locação, com SKU/descrição do item quando não há cadastro', () => {
    const p = planejar(entrada());
    expect(p.abrir).toEqual([{
      conta_omie: 'CASTRO', codigo_produto: 6044678807, codigo: '001209', descricao: 'Cubo',
      id_receb: 100, numero_nfe: '000015694', fornecedor: 'Uniagro', recebido_em: '2026-10-02', qtde: 4,
    }]);
    expect(p.fechar).toEqual([]);
  });
  it('prefere SKU/descrição do espelho ao que veio na nota', () => {
    const espelho = new Map([[chaveProduto('CASTRO', 6044678807), { codigo: 'SKU-1', descricao: 'Cubo de roda', caracteristicas: {} }]]);
    expect(planejar(entrada({ espelho })).abrir[0]).toMatchObject({ codigo: 'SKU-1', descricao: 'Cubo de roda' });
  });
  it('não abre para peça que já tem locação completa', () => {
    const espelho = new Map([[chaveProduto('CASTRO', 6044678807), { caracteristicas: { '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' } }]]);
    const p = planejar(entrada({ espelho }));
    expect(p.abrir).toEqual([]);
    expect(p.ignorados['ja-tem-locacao']).toBe(1);
  });
  it('abre para locação incompleta', () => {
    const espelho = new Map([[chaveProduto('CASTRO', 6044678807), { caracteristicas: { '#PRATELEIRA': '3' } }]]);
    expect(planejar(entrada({ espelho })).abrir).toHaveLength(1);
  });
  it('não considera nota recebida antes do início nem sem data de recebimento', () => {
    expect(planejar(entrada({ notas: [nota({ recebido_em: '2026-09-30' })] })).abrir).toEqual([]);
    expect(planejar(entrada({ notas: [nota({ recebido_em: null })] })).abrir).toEqual([]);
  });
  it('é idempotente: item já registrado não abre de novo — nem o DISPENSADO', () => {
    for (const status of ['aberta', 'resolvida', 'dispensada'] as const) {
      const p = planejar(entrada({ existentes: [{ id: 1, conta_omie: 'CASTRO', codigo_produto: 6044678807, id_receb: 100, status }] }));
      expect(p.abrir).toEqual([]);
      expect(p.ignorados['ja-registrado']).toBe(1);
    }
  });
  it('a mesma peça em OUTRA nota abre outra linha', () => {
    const p = planejar(entrada({
      notas: [nota({ id_receb: 101, numero_nfe: '000015700' })],
      existentes: [{ id: 1, conta_omie: 'CASTRO', codigo_produto: 6044678807, id_receb: 100, status: 'aberta' }],
    }));
    expect(p.abrir).toHaveLength(1);
    expect(p.abrir[0].id_receb).toBe(101);
  });
  it('a mesma peça em duas linhas da MESMA nota soma a quantidade numa demanda só', () => {
    const it2 = { nCodProduto: 6044678807, cCodigo: '001209', cDescricao: 'Cubo', nQtde: 2, nValUnit: 80, cCFOPEntrada: '1.102' };
    const p = planejar(entrada({ notas: [nota({ itens: [...nota().itens, it2] })] }));
    expect(p.abrir).toHaveLength(1);
    expect(p.abrir[0].qtde).toBe(6);
  });
  it('conta por motivo o que ficou fora', () => {
    const p = planejar(entrada({ notas: [nota({ itens: [
      { nCodProduto: 0, cCFOPEntrada: '1.556' },
      { nCodProduto: 5, cCFOPEntrada: '1.556', nValUnit: 9 },
      { nCodProduto: 6, cCFOPEntrada: '1.102', nValUnit: 250000 },
    ] })] }));
    expect(p.abrir).toEqual([]);
    expect(p.ignorados).toMatchObject({ 'sem-produto': 1, 'cfop-sem-estoque': 1, maquina: 1 });
  });
  it('fecha a demanda aberta quando a peça ganhou locação completa; a incompleta continua', () => {
    const existentes = [
      { id: 1, conta_omie: 'CASTRO', codigo_produto: 10, id_receb: 1, status: 'aberta' as const },
      { id: 2, conta_omie: 'CASTRO', codigo_produto: 11, id_receb: 1, status: 'aberta' as const },
      { id: 3, conta_omie: 'CASTRO', codigo_produto: 10, id_receb: 2, status: 'dispensada' as const },
    ];
    const espelho = new Map<string, EspelhoCaract>([
      [chaveProduto('CASTRO', 10), { caracteristicas: { '#PRATELEIRA': '3', '#ANDAR': 'G', '#CAIXA': '1' } }],
      [chaveProduto('CASTRO', 11), { caracteristicas: { '#PRATELEIRA': '3' } }],
    ]);
    const p = planejar(entrada({ notas: [], existentes, espelho }));
    expect(p.fechar).toEqual([{ id: 1, conta_omie: 'CASTRO', codigo_produto: 10, locacao: '3-G-1' }]);
  });
});

describe('tela', () => {
  const linha = (over: Partial<PendenciaAlocacao>): PendenciaAlocacao => ({
    id: 1, conta_omie: 'NOVA', codigo_produto: 10, codigo: 'A1', descricao: 'Filtro', id_receb: 1, numero_nfe: '1',
    fornecedor: 'Mahindra', recebido_em: '2026-10-03', qtde: 2, status: 'aberta', responsavel_user_id: 'u', responsavel_nome: 'Danilo',
    aberta_em: '2026-10-03T12:00:00Z', ...over,
  });
  it('agrupa por peça, soma quantidades e ordena pela espera mais antiga', () => {
    const g = agruparPorProduto([
      linha({ id: 1 }),
      linha({ id: 2, id_receb: 2, numero_nfe: '2', recebido_em: '2026-10-01', qtde: 4 }),
      linha({ id: 3, codigo_produto: 11, codigo: 'B2', recebido_em: '2026-10-02' }),
    ]);
    expect(g.map((x) => x.codigo)).toEqual(['A1', 'B2']);
    expect(g[0]).toMatchObject({ qtde: 6, ids: [1, 2], recebido_em: '2026-10-01' });
    expect(g[0].notas).toHaveLength(2);
  });
  it('cópias da etiqueta = quantidade recebida, entre 1 e 50', () => {
    expect(copiasEtiqueta(4)).toBe(4);
    expect(copiasEtiqueta(2.5)).toBe(3);
    expect(copiasEtiqueta(0)).toBe(1);
    expect(copiasEtiqueta(250)).toBe(50);
  });
  it('dias de espera e datas', () => {
    expect(diasDesde('2026-10-01', new Date(2026, 9, 4, 15))).toBe(3);
    expect(diasDesde('2026-10-09', new Date(2026, 9, 4))).toBe(0);
    expect(diasDesde(null)).toBeNull();
    expect(dataBrParaIso('01/10/2026')).toBe('2026-10-01');
    expect(dataBrParaIso('2026-10-01T10:00:00')).toBe('2026-10-01');
    expect(dataBrParaIso('')).toBeNull();
    expect(inicioAlocacao('2026-11-05')).toBe('2026-11-05');
    expect(inicioAlocacao('05/11/2026')).toBe('2026-10-01');
    expect(inicioAlocacao(undefined)).toBe('2026-10-01');
  });
});

describe('agendador rápido', () => {
  it('roda seg–sáb das 07h às 20h de Brasília (o servidor está em UTC)', () => {
    const utc = (iso: string) => new Date(iso);
    expect(dentroDoHorarioComercial(utc('2026-10-02T10:00:00Z'))).toBe(true);   // sex 07:00 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-02T09:59:00Z'))).toBe(false);  // sex 06:59 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-02T22:59:00Z'))).toBe(true);   // sex 19:59 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-02T23:00:00Z'))).toBe(false);  // sex 20:00 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-03T15:00:00Z'))).toBe(true);   // sáb 12:00 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-04T15:00:00Z'))).toBe(false);  // dom 12:00 BRT
    expect(dentroDoHorarioComercial(utc('2026-10-05T01:00:00Z'))).toBe(false);  // dom 22:00 BRT (já é seg em UTC)
  });
});
