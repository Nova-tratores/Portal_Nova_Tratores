import { describe, it, expect } from 'vitest';
import {
  motivoDoLogPrefeitura, daOS, daRemessa, doRetornoGarantia, daReversao, daAuditoria, doCron,
  daNotaSemDoc, ehFalhaOmie, agruparRobos, marcarResolvidas, chaveResolucao, ordenarEFiltrar, totaisDiaMes,
  haQuanto, empresaDe, numero,
} from '../painel';

const AGORA = new Date('2026-11-19T15:00:00Z');

// texto real da OS-0704 (11/09/2026)
const LOG_0704 = 'S · A8214 · Entre em contato com o suporte para verificarmos o que houve! · A mensagem enviada contém dados inválidos ou incorretos e por isso não pode ser processada (400 = BAD REQUEST) · ALERTA · Integração · 11/09/2026 · 15:18:07 · S · 0240 · E0240 : O CEP informado para o endereço nacional do tomador do serviço não existe ou não pertence ao município do endereço do tomador. · ERRO · Integração · 11/09/2026 · 15:18:07 · S · Envio do RPS 2212 retornou erros. · Integração · 11/09/2026 · 15:18:0';

describe('motivoDoLogPrefeitura', () => {
  it('pega só a linha marcada ERRO', () => {
    expect(motivoDoLogPrefeitura(LOG_0704)).toBe('E0240: O CEP informado para o endereço nacional do tomador do serviço não existe ou não pertence ao município do endereço do tomador.');
  });
  it('OS-0190: código do serviço', () => {
    const t = 'S · 228 · Erro na validação do campo Código do Serviço Prestado. · ERRO · Integração · 30/03/2026 · 15:02:08 · S · Envio do RPS 1779 retornou erros. · Integração · 30/03/2026 · 15:02:08';
    expect(motivoDoLogPrefeitura(t)).toBe('Erro na validação do campo Código do Serviço Prestado.');
  });
  it('texto sem ERRO volta como veio', () => {
    expect(motivoDoLogPrefeitura('Falhou a conexão')).toBe('Falhou a conexão');
    expect(motivoDoLogPrefeitura(null)).toBe('');
  });
});

describe('daOS', () => {
  it('rejeitada vira linha com motivo e link', () => {
    const l = daOS({ Id_Ordem: 'OS-0704', Os_Cliente: 'ROSAN ANTONIO AIELLO', Valor_Total: 511.6, faturamento_status: 'nfse_rejeitada', faturamento_erro: LOG_0704, faturado_por: 'Omie (faturada direto lá)', faturado_omie_em: '2026-09-11T15:00:00+00:00' }, AGORA)!;
    expect(l.situacao).toBe('rejeitada');
    expect(l.motivo).toMatch(/^E0240: O CEP/);
    expect(l.link).toBe('/pos?id=OS-0704');
    expect(l.valor).toBe(511.6);
    expect(l.empresa).toBe('NOVA');
  });
  it('aguardando só vira problema depois de 30 min', () => {
    expect(daOS({ Id_Ordem: 'OS-1', faturamento_status: 'nfse_aguardando', faturado_omie_em: '2026-11-19T14:50:00Z' }, AGORA)).toBeNull();
    expect(daOS({ Id_Ordem: 'OS-1', faturamento_status: 'nfse_aguardando', faturado_omie_em: '2026-11-19T14:00:00Z' }, AGORA)!.situacao).toBe('presa');
  });
  it('trava "faturando" presa > 10 min', () => {
    expect(daOS({ Id_Ordem: 'OS-2', faturamento_status: 'faturando', faturando_desde: '2026-11-19T14:55:00Z' }, AGORA)).toBeNull();
    expect(daOS({ Id_Ordem: 'OS-2', faturamento_status: 'faturando', faturando_desde: '2026-11-19T14:30:00Z' }, AGORA)!.situacao).toBe('presa');
  });
  it('autorizada e recibo não entram', () => {
    expect(daOS({ Id_Ordem: 'OS-3', faturamento_status: 'nfse_autorizada' }, AGORA)).toBeNull();
    expect(daOS({ Id_Ordem: 'OS-3', faturamento_status: 'recibo_emitido' }, AGORA)).toBeNull();
  });
});

describe('remessas e devolução', () => {
  it('devolução da NF 840225 que falhou', () => {
    const l = doRetornoGarantia({ id: 'x', conta_omie: 'NOVA', status: 'falhou', erro: 'IncluirRemessa: ERROR: Tag [nCodIt] e tag [cCodItInt] não informados!', numero_nfe: '000840225', fornecedor: 'MARCHESAN', valor_total: 115.66, id_receb: 2548772180, user_nome: 'Vinicius Correa', criado_em: '2026-11-19T13:55:00Z' }, AGORA)!;
    expect(l.situacao).toBe('falhou');
    expect(l.motivo).toContain('Tag [nCodIt] e tag [cCodItInt] não informados!');
    expect(l.documento).toBe('NF 840225');
    expect(l.link).toBe('/estoque/recebimentos?conta=nova&nota=2548772180');
  });
  it('remessa criada sem faturar há 1 h = presa; faturada com NF = nada', () => {
    expect(daRemessa({ id: 'a', conta_omie: 'nova', status: 'criada', n_cod: 99, criado_em: '2026-11-19T14:00:00Z' }, AGORA)!.link).toBe('/remessas?ficha=nova-99');
    expect(daRemessa({ id: 'b', conta_omie: 'nova', status: 'faturada', nf_numero: '123', criado_em: '2026-11-19T10:00:00Z' }, AGORA)).toBeNull();
    expect(daRemessa({ id: 'c', conta_omie: 'castro', status: 'faturada', criado_em: '2026-11-19T10:00:00Z' }, AGORA)!.empresa).toBe('CASTRO');
  });
  it('reversão aguardando relançamento', () => {
    expect(daReversao({ id: 1, conta_omie: 'CASTRO', status: 'aguardando_relancamento', id_receb: 5 }, AGORA)!.situacao).toBe('presa');
    expect(daReversao({ id: 1, status: 'concluida' }, AGORA)).toBeNull();
  });
});

describe('audit_log', () => {
  it('só falhas de Omie (boleto por e-mail fica fora)', () => {
    expect(ehFalhaOmie('pos', 'faturar_desconhecido')).toBe(true);
    expect(ehFalhaOmie('ppv', 'faturar_erro')).toBe(true);
    expect(ehFalhaOmie('recebimentos', 'devolucao_garantia_falhou')).toBe(true);
    expect(ehFalhaOmie('financeiro', 'erro_envio_omie')).toBe(true);
    expect(ehFalhaOmie('financeiro', 'erro_envio')).toBe(false);
    expect(ehFalhaOmie('ppv', 'faturar')).toBe(false);
  });
  it('faturar_desconhecido da OS-0908', () => {
    const l = daAuditoria({ id: 1, sistema: 'pos', acao: 'faturar_desconhecido', entidade_id: 'OS-0908', entidade_label: 'OS OS-0908', user_nome: 'larissa', detalhes: { erro: 'O Omie respondeu ...' }, created_at: '2026-11-18T14:17:30Z' })!;
    expect(l.situacao).toBe('incerta');
    expect(l.link).toBe('/pos?id=OS-0908');
    expect(l.documento).toBe('OS-0908');
  });
  it('devolução: erro dentro de detalhes.resultado', () => {
    const l = daAuditoria({ id: 2, sistema: 'recebimentos', acao: 'devolucao_garantia_falhou', entidade_id: '2548772180', detalhes: { conta: 'NOVA', resultado: { ok: false, erro: 'A Omie não criou a remessa: ERROR: Tag [nCodIt]' } } })!;
    expect(l.motivo).toContain('Tag [nCodIt]');
    expect(l.empresa).toBe('NOVA');
    expect(l.origem).toBe('Devolução em garantia');
  });
  it('remessa: entidade "nova-123"', () => {
    const l = daAuditoria({ id: 3, sistema: 'remessas', acao: 'remessa_emitir_erro', entidade_id: 'nova-123', detalhes: { erro: 'x' } })!;
    expect(l.link).toBe('/remessas?ficha=nova-123');
    expect(l.empresa).toBe('NOVA');
  });
  it('resolvida depois', () => {
    const l = daAuditoria({ id: 4, sistema: 'pos', acao: 'faturar_desconhecido', entidade_id: 'OS-0908', detalhes: {} })!;
    const [r] = marcarResolvidas([l], new Map([[chaveResolucao(l.origem, l.documento), 'NFS-e autorizada']]));
    expect(r.situacao).toBe('resolvida');
    expect(r.motivo).toContain('Hoje: NFS-e autorizada');
  });
});

describe('robôs e notas sem documento', () => {
  it('cron com erro', () => {
    expect(doCron({ id: 1, job: 'clientes-sync-omie', status: 'erro', detalhe: 'REDUNDANT' })!.situacao).toBe('robo');
    expect(doCron({ id: 2, job: 'x', status: 'ok' })).toBeNull();
  });
  it('agrupa o mesmo robô com o mesmo erro', () => {
    const a = doCron({ id: 1, job: 'vigia', status: 'erro', detalhe: 'Chatwoot 429 page=1', iniciado_em: '2026-11-18' })!;
    const b = doCron({ id: 2, job: 'vigia', status: 'erro', detalhe: 'Chatwoot 429 page=2', iniciado_em: '2026-11-19' })!;
    const c = doCron({ id: 3, job: 'outro', status: 'erro', detalhe: 'x' })!;
    const r = agruparRobos([a, b, c]);
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe('cron:2');
    expect(r[0].motivo).toContain('2 vezes');
  });
  it('agrupa notas sem PDF/XML por empresa', () => {
    const l = daNotaSemDoc([{ conta_omie: 'NOVA', numero: '0008566' }, { conta_omie: 'CASTRO', numero: '9368' }], 'NOVA')!;
    expect(l.documento).toBe('1 nota(s)');
    expect(l.motivo).toContain('8566');
    expect(daNotaSemDoc([], '')).toBeNull();
  });
});

describe('utilidades', () => {
  it('empresa, número, há quanto', () => {
    expect(empresaDe('nova')).toBe('NOVA');
    expect(empresaDe('Castro Pecas')).toBe('CASTRO');
    expect(numero('1.234,56')).toBe(1234.56);
    expect(numero('511.6')).toBe(511.6);
    expect(haQuanto('2026-11-19T12:00:00Z', AGORA)).toBe('há 3 h');
    expect(haQuanto('2026-11-17T15:00:00Z', AGORA)).toBe('há 2 dias');
  });
  it('ordena mais recente primeiro e filtra empresa (sem empresa sempre aparece)', () => {
    const base = { origem: '', tipo: '', documento: '', cliente: '', valor: null, situacao: 'falhou' as const, motivo: '', quem: '', link: null };
    const r = ordenarEFiltrar([
      { ...base, id: 'a', empresa: 'NOVA', quando: '2026-11-01' },
      { ...base, id: 'b', empresa: 'CASTRO', quando: '2026-11-05' },
      { ...base, id: 'c', empresa: '', quando: '2026-11-03' },
    ], 'NOVA');
    expect(r.map((l) => l.id)).toEqual(['c', 'a']);
  });
});

describe('totaisDiaMes', () => {
  it('separa hoje e mês, cancelada fora do valor', () => {
    const t = totaisDiaMes([
      { data_emissao: '2026-11-19', tipo: 'saida_servico', valor: 100 },
      { data_emissao: '2026-11-19', tipo: 'saida_produto', categoria: 'nfe_pecas', valor: '50.5' },
      { data_emissao: '2026-11-19', tipo: 'saida_produto', categoria: 'nfe_pecas', valor: 999, cancelada: true },
      { data_emissao: '2026-11-02', tipo: 'saida_produto', categoria: 'nfe_mista', valor: 1000 },
      { data_emissao: '2026-10-31', tipo: 'saida_servico', valor: 7 },
    ], '2026-11-19');
    expect(t.hoje.nfse).toEqual({ qtd: 1, valor: 100, canceladas: 0 });
    expect(t.hoje.nfe_pecas).toEqual({ qtd: 1, valor: 50.5, canceladas: 1 });
    expect(t.mes.nfe_maquinas.qtd).toBe(1);
    expect(t.mes.nfse.qtd).toBe(1);
  });
});
