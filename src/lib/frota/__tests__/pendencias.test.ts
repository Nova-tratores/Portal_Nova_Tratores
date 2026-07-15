import { describe, it, expect } from 'vitest';
import { pendenciasDoVeiculo, checklistPreVenda, type DadosPendencia, type DadosPreVenda } from '../pendencias';

const completo: DadosPendencia = {
  status: 'ativo', ativo: true, pendencia_vinculo: false,
  renavam: '01331639740', chassi: '9BWDG45UXPT091955', proprietario: 'NOVA TRATORES LTDA',
  tem_crlv: true, docs_vencendo: 0, multas_abertas: 0,
};

describe('pendenciasDoVeiculo — a régua do card vermelho', () => {
  it('veículo completo -> sem pendências (card normal)', () => {
    expect(pendenciasDoVeiculo(completo)).toEqual([]);
  });

  it('acumula cada falta cadastral', () => {
    const p = pendenciasDoVeiculo({
      ...completo, renavam: null, chassi: '  ', proprietario: null, tem_crlv: false,
    });
    expect(p).toHaveLength(4);
    expect(p.join(' | ')).toMatch(/RENAVAM/);
    expect(p.join(' | ')).toMatch(/chassi/);
    expect(p.join(' | ')).toMatch(/proprietário/);
    expect(p.join(' | ')).toMatch(/CRLV/);
  });

  it('docs vencendo e multas em aberto contam como pendência', () => {
    const p = pendenciasDoVeiculo({ ...completo, docs_vencendo: 2, multas_abertas: 3 });
    expect(p).toHaveLength(2);
  });

  it('vendido/inativo é histórico — nunca cobra pendência', () => {
    expect(pendenciasDoVeiculo({ ...completo, renavam: null, status: 'vendido', ativo: false })).toEqual([]);
    expect(pendenciasDoVeiculo({ ...completo, renavam: null, ativo: false })).toEqual([]);
  });

  it('pendência de vínculo (só apareceu no abastecimento) é a primeira da lista', () => {
    const p = pendenciasDoVeiculo({ ...completo, pendencia_vinculo: true });
    expect(p[0]).toMatch(/abastecimento/);
  });
});

const limpo: DadosPreVenda = {
  tem_rastreador: false, equipamentos: null, seguradora: null,
  numero_apolice: null, tem_seguro_vigente: false, multas_abertas: 0, responsavel_atual: null,
};

describe('checklistPreVenda — o que tirar antes de entregar', () => {
  it('carro pelado -> checklist vazio', () => {
    expect(checklistPreVenda(limpo)).toEqual([]);
  });

  it('rastreador + equipamentos + seguro + multas + responsável', () => {
    const c = checklistPreVenda({
      tem_rastreador: true,
      equipamentos: ['Insulfilm', ' Suporte de escada ', ''],
      seguradora: 'Porto', numero_apolice: '123', tem_seguro_vigente: true,
      multas_abertas: 2, responsavel_atual: 'Nicolas Dario',
    });
    expect(c).toHaveLength(6); // rastreador + 2 equipamentos + seguro + multas + responsável
    expect(c[0]).toMatch(/Rastreador/);
    expect(c).toContain('Remover/negociar: Insulfilm');
    expect(c).toContain('Remover/negociar: Suporte de escada');
    expect(c.join(' | ')).toMatch(/Porto/);
    expect(c.join(' | ')).toMatch(/2 multa/);
    expect(c.join(' | ')).toMatch(/Nicolas Dario/);
  });

  it('seguro conta mesmo só com apólice preenchida (sem doc)', () => {
    expect(checklistPreVenda({ ...limpo, numero_apolice: '9988' })).toHaveLength(1);
  });
});
