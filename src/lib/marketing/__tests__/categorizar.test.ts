import { describe, it, expect } from 'vitest';
import { sugerirCategoria } from '../categorizar';

describe('sugerirCategoria — os 7 custos de Requisição do IRRIGASHOW 2026', () => {
  it('frete pela descrição, mesmo com fornecedor de vidraçaria', () => {
    expect(sugerirCategoria({ descricao: 'FRETE DE TRATORES', fornecedor: 'LUCIANO PEDRO DE BARROS VIDRAÇARIA', tipoRequisicao: 'Serviço de Terceiros' })).toBe('frete');
  });
  it('almoço no posto é alimentação (descrição vence o fornecedor)', () => {
    expect(sugerirCategoria({ descricao: 'ALMOÇO DOUGRAS', fornecedor: 'AUTO POSTO CAMPOS DE HOLAMBRA LTDA', tipoRequisicao: 'Alimentação' })).toBe('alimentacao');
  });
  it('"consumo" é alimentação', () => {
    expect(sugerirCategoria({ descricao: 'DESPESA PARA CONSUMO EVENTO HOLAMBRA', fornecedor: 'SOARES DISTRIBUIDORA', tipoRequisicao: 'Alimentação' })).toBe('alimentacao');
  });
  it('descrição sem pista: vale o tipo da requisição, não o "posto" do fornecedor', () => {
    expect(sugerirCategoria({ descricao: 'IRRIGASHOW', fornecedor: 'AUTO POSTO RSH LTDA', tipoRequisicao: 'Alimentação' })).toBe('alimentacao');
  });
  it('lona é montagem', () => {
    expect(sugerirCategoria({ descricao: 'LONA AZUL VONDER', fornecedor: 'VILA VELHA MÁQUINAS', tipoRequisicao: 'Peças' })).toBe('montagem');
  });
  it('sem pista nenhuma fica "outro"', () => {
    expect(sugerirCategoria({ descricao: 'MATERIAL PARA HOLAMBRA', fornecedor: 'VILA VELHA MÁQUINAS E EQUIPAMENTOS', tipoRequisicao: 'Peças' })).toBe('outro');
  });
});

describe('sugerirCategoria — regras gerais', () => {
  it('fornecedor posto sem descrição nem tipo → combustível', () => {
    expect(sugerirCategoria({ descricao: '', fornecedor: 'Posto 2001' })).toBe('combustivel');
  });
  it('frete vence diária ("fretes + diária")', () => {
    expect(sugerirCategoria({ descricao: 'fretes com caminhão nova tratores para irrigashow + diaria' })).toBe('frete');
  });
  it('hotel, banner, camiseta', () => {
    expect(sugerirCategoria({ descricao: 'Pousada Recanto 2 diárias' })).toBe('hospedagem');
    expect(sugerirCategoria({ descricao: 'Banner 2x1' })).toBe('impresso');
    expect(sugerirCategoria({ descricao: 'Camisetas da equipe' })).toBe('brinde');
  });
  it('sem acento também casa', () => {
    expect(sugerirCategoria({ descricao: 'ALMOCO EQUIPE' })).toBe('alimentacao');
    expect(sugerirCategoria({ descricao: 'Locacao de tenda' })).toBe('montagem');
  });
});
