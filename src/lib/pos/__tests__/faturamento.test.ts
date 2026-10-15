import { describe, it, expect, vi } from 'vitest';
import { parcelasDoPagamento, conferirParcelas, hojeSaoPaulo, somarDiasBR } from '@/lib/pagamento/parcelas';
import {
  conferirIdentidade, estadoNoOmie, bloqueioFaturar, situacaoNfse, chaveNum, travaAtiva, motivoPPVFora,
  type OSParaFaturar,
} from '@/lib/pos/faturamento-regras';
import { executarFaturamento, ErroOmie, type DepsFaturamento, type OSNoOmie } from '@/lib/pos/faturamento-fluxo';

describe('parcelas', () => {
  it('soma exata e percentuais fecham 100 com resto na última', () => {
    const p = parcelasDoPagamento('30/60/90', 100.01, '2026-10-10')!;
    expect(p.nQtdeParc).toBe(3);
    expect(p.parcelas.map((x) => x.nValor)).toEqual([33.33, 33.33, 33.35]);
    expect(p.parcelas.map((x) => x.nPercentual)).toEqual([33.33, 33.33, 33.34]);
    expect(p.parcelas.reduce((s, x) => s + Math.round(x.nValor * 100), 0)).toBe(10001);
    expect(p.cCodParc).toBe('999');
  });
  it('vencimentos contam do dia, virando mês e ano', () => {
    const p = parcelasDoPagamento('30/60', 200, '2026-12-31')!;
    expect(p.parcelas.map((x) => x.dDtVenc)).toEqual(['30/01/2027', '01/03/2027']);
    expect(p.parcelas.map((x) => x.nDias)).toEqual([30, 60]);
  });
  it('à vista = 1 parcela no próprio dia; aceita grafias', () => {
    const p = parcelasDoPagamento('a vista', 50, '2026-10-10')!;
    expect(p.forma).toBe('À vista');
    expect(p.parcelas).toEqual([{ nParcela: 1, nDias: 0, dDtVenc: '10/10/2026', nValor: 50, nPercentual: 100 }]);
    expect(parcelasDoPagamento('30', 10, '2026-10-10')!.forma).toBe('30 dias');
  });
  it('recusa forma desconhecida ou total zero', () => {
    expect(parcelasDoPagamento('boleto', 10, '2026-10-10')).toBeNull();
    expect(parcelasDoPagamento('30/60', 0, '2026-10-10')).toBeNull();
    expect(parcelasDoPagamento(null, 10, '2026-10-10')).toBeNull();
  });
  it('hoje é calculado no fuso de São Paulo', () => {
    // 01:30 UTC de 11/10 ainda é 10/10 em SP
    expect(hojeSaoPaulo(new Date('2026-10-11T01:30:00Z'))).toBe('2026-10-10');
    expect(somarDiasBR('2026-02-28', 1)).toBe('01/03/2026');
  });
  it('conferirParcelas', () => {
    const p = parcelasDoPagamento('30/60', 100, '2026-10-10')!;
    expect(conferirParcelas(p, [{ nValor: 50 }, { nValor: '50.00' }])).toBeNull();
    expect(conferirParcelas(p, [{ nValor: 100 }])).toMatch(/1 parcela/);
    expect(conferirParcelas(p, [{ nValor: 50 }, { nValor: 49.99 }])).toMatch(/soma/);
    expect(conferirParcelas(p, undefined)).toMatch(/não devolveu/);
  });
});

describe('identidade da OS no Omie', () => {
  const os = { idOrdem: 'OS-0777', ordemOmie: '000777' };
  it('confere nº e código de integração (com ou sem sufixo)', () => {
    expect(conferirIdentidade(os, { nCodOS: 1, cNumOS: '777', cCodIntOS: 'OS-0777' })).toBeNull();
    expect(conferirIdentidade(os, { nCodOS: 1, cNumOS: '00777', cCodIntOS: 'OS-0777-1728000000000' })).toBeNull();
  });
  it('recusa a OS antiga com mesmo código mas outro número', () => {
    expect(conferirIdentidade(os, { nCodOS: 1, cNumOS: '512', cCodIntOS: 'OS-0777' })).toMatch(/nº 512/);
  });
  it('recusa código de outra OS e código diferente do gravado', () => {
    expect(conferirIdentidade(os, { nCodOS: 1, cNumOS: '777', cCodIntOS: 'OS-07770' })).toMatch(/não é desta OS/);
    expect(conferirIdentidade({ ...os, ccodintGravado: 'OS-0777-1' }, { nCodOS: 1, cNumOS: '777', cCodIntOS: 'OS-0777' })).toMatch(/não confere/);
    expect(conferirIdentidade(os, null)).toMatch(/não encontrada/);
  });
  it('chaveNum', () => { expect(chaveNum('000777')).toBe('777'); expect(chaveNum('')).toBe(''); });
});

describe('estado e bloqueios', () => {
  it('estadoNoOmie', () => {
    expect(estadoNoOmie({ cEtapa: '30' }, { cFaturada: 'N' })).toBe('aberta');
    expect(estadoNoOmie({ cEtapa: '50' }, {})).toBe('faturando');
    expect(estadoNoOmie({ cEtapa: '60' }, {})).toBe('faturada');
    expect(estadoNoOmie({ cEtapa: '30' }, { cFaturada: 'S' })).toBe('faturada');
    expect(estadoNoOmie({ cEtapa: '60' }, { cCancelada: 'S' })).toBe('cancelada');
  });
  const base: OSParaFaturar = { idOrdem: 'OS-1', ordemOmie: '1', status: 'Cobrando Cliente', servicoInterno: false, ehGarantia: false, faturadoEm: null, faturamentoStatus: null, faturandoDesde: null };
  const agora = new Date('2026-10-10T15:00:00Z');
  it('libera a OS comum enviada', () => { expect(bloqueioFaturar(base, agora)).toBeNull(); });
  it('bloqueia sem Omie, faturada, cancelada, interna, garantia, desconhecido e trava ativa', () => {
    expect(bloqueioFaturar({ ...base, ordemOmie: '' }, agora)).toMatch(/enviada/);
    expect(bloqueioFaturar({ ...base, faturadoEm: '2026-10-10' }, agora)).toMatch(/já foi/);
    expect(bloqueioFaturar({ ...base, status: 'Cancelada' }, agora)).toMatch(/cancelada/);
    // OS interna fatura com RECIBO (José, 15/10/2026) — não bloqueia mais
    expect(bloqueioFaturar({ ...base, servicoInterno: true }, agora)).toBeNull();
    expect(bloqueioFaturar({ ...base, ehGarantia: true, garantiaSemMontadora: true }, agora)).toMatch(/montadora/);
    // garantia com a montadora escolhida fatura normalmente
    expect(bloqueioFaturar({ ...base, ehGarantia: true, garantiaSemMontadora: false }, agora)).toBeNull();
    expect(bloqueioFaturar({ ...base, faturamentoStatus: 'desconhecido' }, agora)).toMatch(/Conferir/);
    expect(bloqueioFaturar({ ...base, faturandoDesde: '2026-10-10T14:55:00Z' }, agora)).toMatch(/andamento/);
    expect(travaAtiva('2026-10-10T14:49:00Z', agora)).toBe(false);
  });
  it('PPV fora do faturamento junto', () => {
    const p = { id: 'P1', pedidoOmie: '12', tipo: 'Pedido', status: 'Fechado', empresa: 'Nova Tratores', faturadoEm: null, valor: 10 };
    expect(motivoPPVFora(p)).toBeNull();
    expect(motivoPPVFora({ ...p, tipo: 'Remessa' })).toMatch(/remessa/);
    expect(motivoPPVFora({ ...p, pedidoOmie: '' })).toMatch(/enviado/);
    expect(motivoPPVFora({ ...p, faturadoEm: 'x' })).toMatch(/faturado/);
  });
});

describe('situação da NFS-e (StatusOS)', () => {
  it('lê o último RPS', () => {
    expect(situacaoNfse([]).status).toBe('nfse_aguardando');
    expect(situacaoNfse([{ cStatusRps: '002' }]).status).toBe('nfse_aguardando');
    expect(situacaoNfse([{ cStatusRps: '004', nNfse: '000123' }])).toEqual({ status: 'nfse_autorizada', numero: '123', mensagem: null });
    const r = situacaoNfse([{ cStatusRps: '003', mensagens: [{ cCodigo: 'E10', cDescricao: 'CNAE inválido' }] }]);
    expect(r.status).toBe('nfse_rejeitada');
    expect(r.mensagem).toContain('CNAE inválido');
    expect(situacaoNfse([{ cStatusRps: '004', nNfse: '1' }, { cStatusRps: '005' }]).status).toBe('nfse_cancelada');
  });
});

describe('fluxo do faturamento (Omie simulado)', () => {
  const aberta = (total = 300, parcelas?: OSNoOmie['Parcelas']): OSNoOmie => ({ Cabecalho: { nCodOS: 9, cNumOS: '777', cEtapa: '30', nValorTotal: total }, InfoCadastro: { cFaturada: 'N' }, Parcelas: parcelas });
  function deps(over: Partial<DepsFaturamento> = {}, consultas: OSNoOmie[] = [aberta(), aberta(300, [{ nValor: 150 }, { nValor: 150 }])]) {
    let i = 0;
    const d = {
      consultar: vi.fn(async () => consultas[Math.min(i++, consultas.length - 1)]),
      alterarImpostos: vi.fn(async () => {}),
      alterarParcelas: vi.fn(async () => {}),
      validar: vi.fn(async () => {}),
      faturar: vi.fn(async () => ({ cCodStatus: '0', cDescStatus: 'OS faturada com sucesso' })),
      ...over,
    };
    return d;
  }
  const entrada = { forma: '30/60', aplicarParcelas: true, hojeISO: '2026-10-10', totalConfirmado: 300 };

  it('caminho feliz: parcelas → conferência → valida → fatura uma vez', async () => {
    const d = deps();
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('faturada');
    expect(d.alterarParcelas).toHaveBeenCalledTimes(1);
    expect(d.validar).toHaveBeenCalledTimes(1);
    expect(d.faturar).toHaveBeenCalledTimes(1);
  });
  it('timeout no FaturarOS = desconhecido, sem 2ª chamada', async () => {
    const d = deps({ faturar: vi.fn(async () => { throw new Error('fetch failed: timeout'); }) });
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('desconhecido');
    expect(d.faturar).toHaveBeenCalledTimes(1);
  });
  it('recusa explícita do Omie = erro', async () => {
    const d = deps({ faturar: vi.fn(async () => { throw new ErroOmie('Cliente sem inscrição municipal'); }) });
    const r = await executarFaturamento(d, entrada);
    expect(r).toMatchObject({ tipo: 'erro' });
  });
  it('ValidarOS recusa → nunca chama FaturarOS', async () => {
    const d = deps({ validar: vi.fn(async () => { throw new ErroOmie('Serviço sem código de tributação'); }) });
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('erro');
    expect(d.faturar).not.toHaveBeenCalled();
  });
  it('parcelas lidas divergentes → aborta sem validar nem faturar', async () => {
    const d = deps({}, [aberta(), aberta(300, [{ nValor: 300 }])]);
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('erro');
    expect(d.validar).not.toHaveBeenCalled();
    expect(d.faturar).not.toHaveBeenCalled();
  });
  it('valor mudou desde a janela → aborta antes de gravar parcelas', async () => {
    const d = deps({}, [aberta(812.48)]);
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('erro');
    expect(d.alterarParcelas).not.toHaveBeenCalled();
  });
  it('já faturada / etapa 50 / cancelada no Omie → não fatura', async () => {
    for (const [os, tipo] of [
      [{ Cabecalho: { nCodOS: 9, cEtapa: '60', nValorTotal: 300 }, InfoCadastro: {} }, 'ja_faturada'],
      [{ Cabecalho: { nCodOS: 9, cEtapa: '50', nValorTotal: 300 }, InfoCadastro: {} }, 'pendente_omie'],
      [{ Cabecalho: { nCodOS: 9, cEtapa: '30', nValorTotal: 300 }, InfoCadastro: { cCancelada: 'S' } }, 'erro'],
    ] as const) {
      const d = deps({}, [os as OSNoOmie]);
      expect((await executarFaturamento(d, entrada)).tipo).toBe(tipo);
      expect(d.faturar).not.toHaveBeenCalled();
    }
  });
  it('sem forma de pagamento → não grava nada', async () => {
    const d = deps();
    const r = await executarFaturamento(d, { ...entrada, forma: null });
    expect(r.tipo).toBe('erro');
    expect(d.alterarParcelas).not.toHaveBeenCalled();
  });
  it('status != 0 sem fault: decide pelo estado no Omie', async () => {
    const d = deps({ faturar: vi.fn(async () => ({ cCodStatus: '1', cDescStatus: 'em processamento' })) },
      [aberta(), aberta(300, [{ nValor: 150 }, { nValor: 150 }]), { Cabecalho: { nCodOS: 9, cEtapa: '50', nValorTotal: 300 }, InfoCadastro: {} }]);
    expect((await executarFaturamento(d, entrada)).tipo).toBe('faturada');
  });

  it('impostos: aplica, confere item a item e só então segue', async () => {
    const item = (nbs: string, cst: string) => ({ nIdItem: 1, cDescServ: 'Hora', cNbs: nbs, impostos: { cCST: cst } });
    const antes = { ...aberta(), ServicosPrestados: [item('120015000', '')] };
    const depois = { ...aberta(), ServicosPrestados: [item('120015000', '000')] };
    const comParc = { ...depois, Parcelas: [{ nValor: 150 }, { nValor: 150 }] };
    const d = deps({}, [antes, depois, comParc]);
    const r = await executarFaturamento(d, { ...entrada, impostos: { cCST: '000' } });
    expect(r.tipo).toBe('faturada');
    expect(d.alterarImpostos).toHaveBeenCalledTimes(1);
    expect(d.faturar).toHaveBeenCalledTimes(1);
  });
  it('impostos que não "pegaram" no Omie → aborta antes de parcelas e faturar', async () => {
    const it1 = { nIdItem: 1, cDescServ: 'Hora', impostos: { cCST: '' } };
    const d = deps({}, [{ ...aberta(), ServicosPrestados: [it1] }, { ...aberta(), ServicosPrestados: [it1] }]);
    const r = await executarFaturamento(d, { ...entrada, impostos: { cCST: '000' } });
    expect(r.tipo).toBe('erro');
    expect(d.alterarParcelas).not.toHaveBeenCalled();
    expect(d.faturar).not.toHaveBeenCalled();
  });
  it('parcelas saem sobre o LÍQUIDO (total − retidos)', async () => {
    const comRet = (parc?: OSNoOmie['Parcelas']): OSNoOmie => ({ Cabecalho: { nCodOS: 9, cNumOS: '777', cEtapa: '30', nValorTotal: 300, nValorTotalImpRet: 15 }, InfoCadastro: {}, Parcelas: parc });
    const d = deps({}, [comRet(), comRet([{ nValor: 142.5 }, { nValor: 142.5 }])]);
    const r = await executarFaturamento(d, entrada);
    expect(r.tipo).toBe('faturada');
    const plano = (d.alterarParcelas as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(plano.parcelas.map((x: { nValor: number }) => x.nValor)).toEqual([142.5, 142.5]);
  });
});
