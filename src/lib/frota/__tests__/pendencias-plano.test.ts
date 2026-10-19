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
    expect(r).toEqual({ requisicoes: ['10', '11'], os: ['OS-9'], opas: ['uuid-1'], chamadosVendas: [] });
  });
});

describe('planejarPendencias — preventiva', () => {
  const prev = (estado: 'vencida' | 'em_breve' | 'em_dia') => ({ placa: 'GAL7A16', plano_id: 'pl1', nome: 'Óleo e filtro', componente_id: null, estado, texto: 'faltam 480 km' });
  it('vence em breve abre "Preventiva: …"; em dia fecha; não duplica', () => {
    const abre = planejarPendencias(base({ preventivas: [prev('em_breve')] }));
    expect(abre.inserir).toEqual([expect.objectContaining({ origem: 'preventiva', origem_ref: 'pl1', titulo: 'Preventiva: Óleo e filtro' })]);
    const jaAberta = planejarPendencias(base({ preventivas: [prev('vencida')], pendencias: [pend({ id: 'pp', origem: 'preventiva', origem_ref: 'pl1' })] }));
    expect(jaAberta.inserir).toHaveLength(0);
    const fecha = planejarPendencias(base({ preventivas: [prev('em_dia')], pendencias: [pend({ id: 'pp', origem: 'preventiva', origem_ref: 'pl1' })] }));
    expect(fecha.resolver.map((r) => r.id)).toEqual(['pp']);
  });
  it('reabre no ciclo seguinte mesmo com uma resolvida antiga; sem a migration (null) não mexe', () => {
    const antiga = pend({ id: 'old', origem: 'preventiva', origem_ref: 'pl1', status: 'resolvida', resolvida_em: '2026-01-01T00:00:00Z' });
    expect(planejarPendencias(base({ preventivas: [prev('em_breve')], pendencias: [antiga] })).inserir).toHaveLength(1);
    expect(planejarPendencias(base({ preventivas: null, pendencias: [pend({ id: 'pp', origem: 'preventiva', origem_ref: 'pl1' })] })).resolver).toHaveLength(0);
  });
});

describe('planejarPendencias — chamado do app de vendas', () => {
  const chamado = (over = {}) => ({
    id: 42, placa_id: 1788907484456, placa: 'SAVEIRO - GAL7A16', tipo: 'corretiva',
    descricao: 'Farol queimado', checklist_nome: null, respostas: null, tem_pendencia: false,
    status: 'aberto', vendedor_nome: 'PEDRO', created_at: '2026-10-05T10:00:00Z', ...over,
  });

  it('corretiva abre pendência no carro (acha pelo placa_id) com quem abriu', () => {
    const p = planejarPendencias(base({ chamadosVendas: [chamado()] }));
    expect(p.inserir).toHaveLength(1);
    expect(p.inserir[0]).toMatchObject({
      placa: 'GAL7A16', origem: 'app_vendas', origem_ref: '42',
      titulo: 'Corretiva: Farol queimado', aberta_por: 'PEDRO (app de vendas)', data_ocorrencia: '2026-10-05',
    });
  });

  it('acha o carro pelo texto da placa quando o placa_id não bate', () => {
    const p = planejarPendencias(base({ chamadosVendas: [chamado({ placa_id: 999 })] }));
    expect(p.inserir[0]).toMatchObject({ placa: 'GAL7A16' });
  });

  it('checklist só abre com item não ok, listando os itens', () => {
    const ok = planejarPendencias(base({ chamadosVendas: [chamado({ tipo: 'checklist', checklist_nome: 'Semanal', respostas: [{ item: 'Pneus', status: 'ok' }] })] }));
    expect(ok.inserir).toHaveLength(0);
    const nok = planejarPendencias(base({ chamadosVendas: [chamado({
      tipo: 'checklist', checklist_nome: 'Semanal', tem_pendencia: true,
      respostas: [{ item: 'Pneus', status: 'nok', obs: 'careca' }, { item: 'Óleo', status: 'ok' }],
    })] }));
    expect(nok.inserir[0]).toMatchObject({ titulo: 'Checklist Semanal: 1 com problema' });
    expect(String(nok.inserir[0].descricao)).toContain('• Pneus — careca');
  });

  it('não duplica; resolvido no app fecha a aberta', () => {
    const aberta = pend({ id: 'p9', origem: 'app_vendas', origem_ref: '42' });
    expect(planejarPendencias(base({ pendencias: [aberta], chamadosVendas: [chamado(), chamado()] })).inserir).toHaveLength(0);
    const p = planejarPendencias(base({ pendencias: [aberta], chamadosVendas: [chamado({ status: 'resolvido' })] }));
    expect(p.resolver).toEqual([expect.objectContaining({ id: 'p9' })]);
  });

  it('resolvida no portal: não reabre e devolve o chamado como resolvido pro app', () => {
    const resolvida = pend({ id: 'p9', origem: 'app_vendas', origem_ref: '42', status: 'resolvida', resolvida_em: '2026-10-08T00:00:00Z' });
    const p = planejarPendencias(base({ pendencias: [resolvida], chamadosVendas: [chamado()] }));
    expect(p.inserir).toHaveLength(0);
    expect(p.chamadosVendasResolver).toEqual(['42']);
  });

  it('leitura que falhou (null) não mexe em nada', () => {
    const p = planejarPendencias(base({ pendencias: [pend({ origem: 'app_vendas', origem_ref: '42' })], chamadosVendas: null }));
    expect(p.inserir).toHaveLength(0);
    expect(p.resolver).toHaveLength(0);
    expect(p.chamadosVendasResolver).toEqual([]);
  });
});
