import { describe, it, expect } from 'vitest';
import {
  planejarPendencias, refsAbertas, GRACA_MANUAL_MS,
  type DadosSync, type VeiculoSync, type PendenciaExistente,
} from '../pendencias-plano';

const AGORA = new Date('2026-10-10T12:00:00Z').getTime();

// veículo "em dia" na régua de cadastro (não gera pendência de cadastro)
const carro: VeiculoSync = {
  id: 'v1', placa: 'GAL7A16', supa_placa_id: 1788907484456,
  status: 'ativo', ativo: true, pendencia_vinculo: false,
  renavam: '123', chassi: 'ABC', proprietario: 'NOVA', exercicio_crlv: 2026, tipo_registro: 'veiculo',
};

const base = (over: Partial<DadosSync> = {}): DadosSync => ({
  agora: AGORA,
  veiculos: [carro],
  multas: [],
  documentos: [{ veiculo_id: 'v1', tipo: 'crlv', vigencia_fim: '2027-12-31' }],
  componentes: [{ id: 'c-outros', sistema: 'Outros', subsistema: null, componente: null }],
  pendencias: [],
  checklists: [],
  itensChecklist: [],
  requisicoes: [],
  os: [],
  opas: [],
  fotoPorOpa: new Map(),
  ...over,
});

const pend = (over: Partial<PendenciaExistente>): PendenciaExistente => ({
  id: 'p1', placa: 'GAL7A16', origem: 'requisicao', origem_ref: '6695', status: 'aberta',
  resolvida_em: null, data_ocorrencia: null, vinculo_tipo: null, vinculo_ref: null, ...over,
});

describe('planejarPendencias — requisição Veicular Manutenção', () => {
  it('acha o carro pelo supa_placa_id (o id_placa da tabela antiga pode estar vazio)', () => {
    const p = planejarPendencias(base({
      requisicoes: [{ id: 6695, titulo: 'NIPE EMENDA', status: 'pedido', veiculo: '1788907484456', hodometro: '120.500', data: '2026-10-01' }],
    }));
    expect(p.inserir).toHaveLength(1);
    expect(p.inserir[0]).toMatchObject({ placa: 'GAL7A16', origem: 'requisicao', origem_ref: '6695', km: 120500 });
  });

  it('não abre de novo quando já existe aberta, e não duplica se a lista trouxer a mesma req duas vezes', () => {
    const req = { id: 6695, titulo: 'NIPE', status: 'pedido', veiculo: 1788907484456, hodometro: null, data: null };
    const comAberta = planejarPendencias(base({ pendencias: [pend({})], requisicoes: [req] }));
    expect(comAberta.inserir).toHaveLength(0);
    const repetida = planejarPendencias(base({ requisicoes: [req, req] }));
    expect(repetida.inserir).toHaveLength(1);
  });

  it('fecha quando a requisição chega ao financeiro', () => {
    const p = planejarPendencias(base({
      pendencias: [pend({})],
      requisicoes: [{ id: 6695, titulo: 'x', status: 'financeiro', veiculo: 1788907484456, hodometro: null, data: null }],
    }));
    expect(p.resolver).toEqual([expect.objectContaining({ id: 'p1', vinculo_tipo: 'requisicao', vinculo_ref: '6695' })]);
  });

  it('pendência vinculada à requisição fecha no financeiro mesmo se o carro não for achado', () => {
    const p = planejarPendencias(base({
      veiculos: [{ ...carro, supa_placa_id: null }],
      pendencias: [pend({ id: 'pm', origem: 'manual', origem_ref: null, vinculo_tipo: 'requisicao', vinculo_ref: '7001' })],
      requisicoes: [{ id: 7001, titulo: 'x', status: 'financeiro', veiculo: 999, hodometro: null, data: null }],
    }));
    expect(p.resolver.map((r) => r.id)).toEqual(['pm']);
    expect(p.inserir).toHaveLength(0);
  });
});

describe('planejarPendencias — OS e cadastro', () => {
  it('OS concluída fecha a pendência aberta', () => {
    const p = planejarPendencias(base({
      pendencias: [pend({ id: 'po', origem: 'os', origem_ref: 'OS-0100' })],
      os: [{ Id_Ordem: 'OS-0100', Projeto: 'CARGO-GAL7A16', Status: 'Concluída', Data: '2025-01-10' }],
    }));
    expect(p.resolver).toEqual([expect.objectContaining({ id: 'po', vinculo_tipo: 'os' })]);
  });

  it('cadastro resolvido na mão só reabre depois da carência de 30 dias', () => {
    const semRenavam = { ...carro, renavam: null };
    const resolvida = (diasAtras: number) => pend({
      id: 'pc', origem: 'cadastro', origem_ref: 'sem_renavam', status: 'resolvida',
      resolvida_em: new Date(AGORA - diasAtras * 86400_000).toISOString(),
    });
    const dentro = planejarPendencias(base({ veiculos: [semRenavam], pendencias: [resolvida(10)] }));
    expect(dentro.inserir.filter((r) => r.origem_ref === 'sem_renavam')).toHaveLength(0);
    const fora = planejarPendencias(base({ veiculos: [semRenavam], pendencias: [resolvida(GRACA_MANUAL_MS / 86400_000 + 1)] }));
    expect(fora.inserir.filter((r) => r.origem_ref === 'sem_renavam')).toHaveLength(1);
  });

  it('cadastro regularizado fecha a pendência', () => {
    const p = planejarPendencias(base({ pendencias: [pend({ id: 'pc', origem: 'cadastro', origem_ref: 'sem_renavam' })] }));
    expect(p.resolver.map((r) => r.id)).toEqual(['pc']);
  });

  it('leitura que falhou (null) não fecha nada por engano', () => {
    const p = planejarPendencias(base({
      pendencias: [pend({ id: 'po', origem: 'os', origem_ref: 'OS-1' })],
      os: null, requisicoes: null, checklists: null, opas: null,
    }));
    expect(p.resolver).toHaveLength(0);
  });
});

describe('refsAbertas', () => {
  it('lista as fontes das abertas (inclui requisição vinculada) e ignora as resolvidas', () => {
    const r = refsAbertas([
      pend({ id: '1', origem: 'requisicao', origem_ref: '10' }),
      pend({ id: '2', origem: 'manual', origem_ref: null, vinculo_tipo: 'requisicao', vinculo_ref: '11' }),
      pend({ id: '3', origem: 'os', origem_ref: 'OS-9' }),
      pend({ id: '4', origem: 'opa', origem_ref: 'uuid-1' }),
      pend({ id: '5', origem: 'os', origem_ref: 'OS-8', status: 'resolvida' }),
    ]);
    expect(r).toEqual({ requisicoes: ['10', '11'], os: ['OS-9'], opas: ['uuid-1'] });
  });
});
