import { describe, expect, it } from 'vitest';
import { faltaParaAutorizar } from '../autorizacao-requisitos';

describe('o que precisa para pedir autorização', () => {
  const base = { titulo: 'FILTRO', fornecedor: 'AGRO X', solicitante: 'Matheus', setor: 'Oficina' };
  it('completa não falta nada; vazia lista tudo', () => {
    expect(faltaParaAutorizar(base)).toEqual([]);
    expect(faltaParaAutorizar({})).toEqual(['o que é (título)', 'onde comprar (fornecedor)', 'quem pede', 'para quem (setor destino)']);
  });
  it('para cliente: OS, cliente com CNPJ, projeto e OS do mesmo cliente', () => {
    const cli = { ...base, setor: 'Trator-Cliente' };
    expect(faltaParaAutorizar({ ...cli, cliente: 'JOSE' })).toEqual(['a OS', 'o cliente escolhido do cadastro (com CPF/CNPJ)', 'o projeto / trator']);
    const ok = { ...cli, ordem_servico: 'OS-0909', cliente: 'ADRIANO', cliente_cnpj: '08.351.690/0003-05', Chassis_Modelo: '6075E' };
    expect(faltaParaAutorizar(ok, '08351690000305')).toEqual([]);
    expect(faltaParaAutorizar(ok, '15.441.078/0009-76')).toEqual(['a OS é de outro cliente — confira a OS e o cliente']);
  });
});
