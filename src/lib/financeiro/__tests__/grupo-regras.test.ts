import { describe, it, expect } from 'vitest';
import { podeMexerNoGrupo, motivoGrupoTravado, ehRpcAusente, rotuloFase, normCliente } from '../grupo-regras';

describe('trava do grupo (cobrança em dobro)', () => {
  it('só Gerar Boleto e Validar Pix deixam mexer', () => {
    expect(podeMexerNoGrupo('gerar_boleto')).toBe(true);
    expect(podeMexerNoGrupo('validar_pix')).toBe(true);
    for (const s of ['enviar_cliente', 'aguardando_vencimento', 'pago', 'vencido', 'concluido', 'sem_boleto', 'excluido', '', null, undefined]) {
      expect(podeMexerNoGrupo(s)).toBe(false);
    }
  });
  it('mensagem clara ao tirar card de grupo já cobrado', () => {
    const m = motivoGrupoTravado('aguardando_vencimento', 'remover', 1468)!;
    expect(m).toContain('#1468');
    expect(m).toContain('Aguardando Cliente');
    expect(m).toMatch(/dobro/);
    expect(motivoGrupoTravado('gerar_boleto', 'remover', 1)).toBeNull();
  });
  it('mensagem ao juntar fora da fase', () => {
    expect(motivoGrupoTravado('pago', 'juntar', 7)).toMatch(/Não dá pra juntar: o card #7 está em "Pago"/);
    expect(motivoGrupoTravado('validar_pix', 'juntar', 7)).toBeNull();
  });
  it('rótulo de fase desconhecida não some', () => {
    expect(rotuloFase('xyz')).toBe('xyz');
    expect(rotuloFase('')).toBe('(sem fase)');
  });
});

describe('ehRpcAusente', () => {
  it('reconhece função inexistente (migration não aplicada)', () => {
    expect(ehRpcAusente({ code: 'PGRST202', message: 'Could not find the function public.chamado_nf_juntar' })).toBe(true);
    expect(ehRpcAusente({ code: '42883', message: 'function does not exist' })).toBe(true);
    expect(ehRpcAusente({ message: 'Could not find the function public.x(a) in the schema cache' })).toBe(true);
  });
  it('erro de regra (P0001) não é "ausente" — tem que aparecer pro usuário', () => {
    expect(ehRpcAusente({ code: 'P0001', message: 'Não dá pra juntar' })).toBe(false);
    expect(ehRpcAusente(null)).toBe(false);
  });
});

it('normCliente compara sem caixa/espaço', () => {
  expect(normCliente('  joão ')).toBe(normCliente('JOÃO'));
});
