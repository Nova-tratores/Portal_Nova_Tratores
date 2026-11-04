import { describe, it, expect } from 'vitest';
import { planejarVinculo, type LinhaVinculo } from '../vinculo-tecnico';

const linhas: LinhaVinculo[] = [
  { id: 8, tecnico_nome: 'Danilo de Souza', placa: 'FXM4G90' },
  { id: 14, tecnico_nome: 'PAULO MOTTA', placa: 'TKY6E68' },
  { id: 2, tecnico_nome: 'Nicolas Dario', placa: 'TKY6E68' },
];
const tecnicos = ['Danilo de Souza', 'Paulo Motta', 'Nicolas Dario', 'Gabriel Moraes'];

describe('troca de responsável → vínculo do técnico (um carro = uma pessoa)', () => {
  it('técnico que entra leva o vínculo dele; TODO mundo que estava no carro sai', () => {
    // caso real: Danilo passou para o TKY6E68 — Nicolas E Paulo saem
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKY-6E68', anterior: 'NICOLAS DARIO', novo: 'DANILO SOUZA' });
    expect(p.apagar.sort()).toEqual([14, 2].sort());
    expect(p.gravar).toEqual({ id: 8, tecnico_nome: 'Danilo de Souza' });
  });
  it('quem não era o responsável anterior também sai (antes ficava)', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKY6E68', anterior: 'Nicolas Dario', novo: 'Danilo de Souza' });
    expect(p.apagar).toContain(14);
  });
  it('técnico sem vínculo ainda ganha uma linha nova', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'FXM4G90', anterior: 'Danilo de Souza', novo: 'Gabriel Moraes' });
    expect(p.apagar).toEqual([8]);
    expect(p.gravar).toEqual({ tecnico_nome: 'Gabriel Moraes' });
  });
  it('responsável que não é técnico tira o técnico do carro', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'FXM4G90', anterior: 'Danilo de Souza', novo: 'Joaquim Fernando' });
    expect(p.apagar).toEqual([8]);
    expect(p.gravar).toBeNull();
  });
  it('carro sem responsável (nome vazio) fica sem técnico', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKY6E68', anterior: 'Danilo de Souza', novo: null });
    expect(p.apagar.sort()).toEqual([14, 2].sort());
    expect(p.gravar).toBeNull();
  });
  it('não mexe no vínculo de OUTRO carro', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKC5D99', anterior: 'Danilo de Souza', novo: 'Gabriel Moraes' });
    expect(p.apagar).toEqual([]);
  });
  it('apelido do responsável casa pelo cadastro do motorista (GABRIEL GOMES = Gabriel Moraes)', () => {
    const l: LinhaVinculo[] = [{ id: 11, tecnico_nome: 'Gabriel Moraes', placa: 'TKC5D99' }, { id: 16, tecnico_nome: 'Paulo Motta', placa: 'TKC5D99' }];
    const p = planejarVinculo({ linhas: l, tecnicos, placa: 'TKC5D99', novo: 'GABRIEL GOMES', novoApelidos: ['Gabriel Moraes'] });
    expect(p.apagar).toEqual([16]);
    expect(p.gravar).toEqual({ id: 11, tecnico_nome: 'Gabriel Moraes' });
  });
  it('o novo não fica em dois carros: linha que sobrou em outro carro sai', () => {
    const l: LinhaVinculo[] = [{ id: 8, tecnico_nome: 'Danilo de Souza', placa: 'TKY6E68' }, { id: 20, tecnico_nome: 'Danilo de Souza', placa: 'FXM4G90' }];
    const p = planejarVinculo({ linhas: l, tecnicos, placa: 'TKY6E68', novo: 'Danilo de Souza' });
    expect(p.gravar).toEqual({ id: 8, tecnico_nome: 'Danilo de Souza' });
    expect(p.apagar).toEqual([20]);
  });
});
