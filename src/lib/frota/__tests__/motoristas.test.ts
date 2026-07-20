import { describe, expect, it } from 'vitest';
import {
  mascararCpf,
  normalizarCpf,
  pendenciasDoMotorista,
  situacaoCnh,
  type DadosPendenciaMotorista,
} from '../motoristas';

// hoje fixo pros testes de data não apodrecerem
const HOJE = new Date('2026-07-17T12:00:00');

function base(p: Partial<DadosPendenciaMotorista> = {}): DadosPendenciaMotorista {
  return {
    e_motorista: true,
    status_rh: 'ativo',
    ativo_portal: true,
    cnh: '12345678900',
    cnh_validade: '2028-05-10',
    responsavel_por_veiculo: false,
    ...p,
  };
}

describe('normalizarCpf / mascararCpf', () => {
  it('normaliza formatos BR e cru', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizarCpf('52998224725')).toBe('52998224725');
    expect(normalizarCpf('  ')).toBe('');
    expect(normalizarCpf(null)).toBe('');
  });

  it('mascara só CPFs completos — o cru nunca vai pro navegador', () => {
    expect(mascararCpf('529.982.247-25')).toBe('***.***.***-25');
    expect(mascararCpf('52998224725')).toBe('***.***.***-25');
    expect(mascararCpf('1234')).toBeNull(); // incompleto = nem mascarado sai
    expect(mascararCpf(null)).toBeNull();
  });
});

describe('situacaoCnh', () => {
  it('classifica cada situação', () => {
    expect(situacaoCnh(null, null, HOJE)).toBe('sem_cnh');
    expect(situacaoCnh('  ', '2028-01-01', HOJE)).toBe('sem_cnh');
    expect(situacaoCnh('123', null, HOJE)).toBe('sem_validade');
    expect(situacaoCnh('123', 'não-é-data', HOJE)).toBe('sem_validade');
    expect(situacaoCnh('123', '2026-07-01', HOJE)).toBe('vencida');
    expect(situacaoCnh('123', '2026-08-01', HOJE)).toBe('vencendo'); // 15 dias
    expect(situacaoCnh('123', '2028-05-10', HOJE)).toBe('ok');
  });

  it('vence NO dia ainda vale (23:59:59)', () => {
    expect(situacaoCnh('123', '2026-07-17', HOJE)).toBe('vencendo');
  });
});

describe('pendenciasDoMotorista', () => {
  it('motorista em dia → sem pendências', () => {
    expect(pendenciasDoMotorista(base(), HOJE)).toEqual([]);
  });

  it('motorista sem CNH / sem validade / vencida / vencendo', () => {
    expect(pendenciasDoMotorista(base({ cnh: null }), HOJE)).toEqual(['Motorista sem CNH cadastrada']);
    expect(pendenciasDoMotorista(base({ cnh_validade: null }), HOJE)).toEqual(['CNH sem validade cadastrada']);
    expect(pendenciasDoMotorista(base({ cnh_validade: '2026-01-05' }), HOJE)).toEqual(['CNH vencida em 05/01/2026']);
    const vencendo = pendenciasDoMotorista(base({ cnh_validade: '2026-08-01' }), HOJE);
    expect(vencendo).toHaveLength(1);
    expect(vencendo[0]).toContain('CNH vence em');
    expect(vencendo[0]).toContain('01/08/2026');
  });

  it('quem NÃO é motorista não é cobrado por CNH', () => {
    expect(pendenciasDoMotorista(base({ e_motorista: false, cnh: null }), HOJE)).toEqual([]);
  });

  it('responsável por veículo sem a flag motorista → pendência', () => {
    const p = pendenciasDoMotorista(base({ e_motorista: false, responsavel_por_veiculo: true }), HOJE);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('sem a marcação');
  });

  it('desligado no RH é histórico — não cobra CNH', () => {
    expect(pendenciasDoMotorista(base({ status_rh: 'demitido', cnh: null }), HOJE)).toEqual([]);
    expect(pendenciasDoMotorista(base({ status_rh: 'inativo', cnh_validade: '2020-01-01' }), HOJE)).toEqual([]);
  });

  it('fora do RH e inativo no portal também é histórico', () => {
    expect(pendenciasDoMotorista(base({ status_rh: null, ativo_portal: false, cnh: null }), HOJE)).toEqual([]);
  });

  it('desligado MAS ainda responsável por carro → pendência (problema real)', () => {
    const p = pendenciasDoMotorista(base({ status_rh: 'demitido', responsavel_por_veiculo: true }), HOJE);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Desligado');
  });

  it('férias/afastado NÃO é desligado — cobra normalmente', () => {
    expect(pendenciasDoMotorista(base({ status_rh: 'ferias', cnh: null }), HOJE)).toEqual(['Motorista sem CNH cadastrada']);
  });
});
