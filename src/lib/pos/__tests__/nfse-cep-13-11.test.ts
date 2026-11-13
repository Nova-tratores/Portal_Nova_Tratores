import { describe, expect, it } from 'vitest';
import { situacaoNfse } from '../faturamento-regras';
import { avaliarTravas } from '../travas-faturar';
import { detalheCep, normalizarCidade } from '@/lib/clientes/viacep';

// mensagens reais do StatusOS, 06/11/2026
const OS_5418_CEP = [
  { cAnexo: 'S', cCodigo: 'A8214', cCorrecao: 'Aguarde alguns minutos e realize um novo envio.', cDescricao: 'A mensagem enviada contém dados inválidos ou incorretos e por isso não pode ser processada (400 = BAD REQUEST)', cSituacao: 'ALERTA', cUsuario: 'Integração', dData: '06/11/2026', hHora: '17:08:06' },
  { cAnexo: 'S', cCodigo: '0240', cCorrecao: '', cDescricao: 'E0240 : O CEP informado para o endereço nacional do tomador do serviço não existe ou não pertence ao município do endereço do tomador.', cSituacao: 'ERRO', cUsuario: 'Integração', dData: '06/11/2026', hHora: '17:08:06' },
  { cAnexo: 'S', cCodigo: '', cCorrecao: '', cDescricao: 'Envio do RPS 2291 retornou erros.', cSituacao: '', cUsuario: 'Integração', dData: '06/11/2026', hHora: '17:08:06' },
];
const OS_5416_PREFEITURA = [
  { cAnexo: 'S', cCodigo: 'E3741', cCorrecao: 'Aguarde alguns minutos e realize um novo envio.', cDescricao: 'Nenhuma resposta foi obtida do servidor de Nota Fiscal!', cSituacao: 'ERRO', cUsuario: 'Integração', dData: '06/11/2026', hHora: '14:47:06' },
  { cAnexo: 'S', cCodigo: '', cCorrecao: '', cDescricao: 'Envio do RPS 2290 falhou.', cSituacao: '', cUsuario: 'Integração', dData: '06/11/2026', hHora: '14:47:06' },
];

describe('NFS-e: recusa de verdade × prefeitura sem resposta', () => {
  it('OS 5418: E0240 do CEP com o alerta A8214 junto = REJEITADA, e o CEP vem primeiro no aviso', () => {
    const s = situacaoNfse([{ cStatusRps: '003', mensagens: OS_5418_CEP }]);
    expect(s.status).toBe('nfse_rejeitada');
    expect(s.mensagem?.startsWith('E0240')).toBe(true);
  });
  it('OS 5416: E3741 sozinho segue aguardando (passageiro)', () => {
    const s = situacaoNfse([{ cStatusRps: '003', mensagens: OS_5416_PREFEITURA }]);
    expect(s.status).toBe('nfse_aguardando');
    expect(s.transitorio).toBeTruthy();
  });
});

describe('trava do CEP antes de faturar', () => {
  const base = { hoje: '2026-11-13', previsaoFaturamento: '2026-11-13', projeto: 'X', documentoCliente: '1', localizacaoConfirmada: true };
  it('sem conferência (OS interna) não entra na lista', () => {
    expect(avaliarTravas(base).map((t) => t.chave)).not.toContain('cep');
  });
  it('CEP recusado trava e leva o código do cliente', () => {
    const t = avaliarTravas({ ...base, cep: { ok: false, detalhe: 'x', nCodCli: 99 } }).find((x) => x.chave === 'cep');
    expect(t?.ok).toBe(false);
    expect(t?.nCodCli).toBe(99);
  });
  it('texto do 18800-000 de Piraju sugere o CEP rural', () => {
    const d = detalheCep({ valido: false, cep: '18800000', sugestaoRural: '18819-899' }, 'PIRAJU (SP)');
    expect(d).toContain('18800-000');
    expect(d).toContain('CEP geral da cidade');
    expect(d).toContain('Piraju o CEP é 18819-899');
  });
  it('Correios fora do ar não trava', () => {
    expect(detalheCep({ valido: null, cep: '18800001' }, 'PIRAJU (SP)')).toContain('não deu para conferir');
  });
  it('cidade com acento e UF casa', () => {
    expect(normalizarCidade('ÓLEO (SP)')).toBe(normalizarCidade('Óleo'));
  });
});
