import { describe, it, expect } from 'vitest';
import { planejarVinculo, type LinhaVinculo } from '../vinculo-tecnico';

const linhas: LinhaVinculo[] = [
  { id: 8, tecnico_nome: 'Danilo de Souza', placa: 'FXM4G90' },
  { id: 14, tecnico_nome: 'PAULO MOTTA', placa: 'TKY6E68' },
  { id: 2, tecnico_nome: 'Nicolas Dario', placa: 'TKY6E68' },
];
const tecnicos = ['Danilo de Souza', 'Paulo Motta', 'Nicolas Dario', 'Gabriel Moraes'];

describe('troca de responsável → vínculo do técnico', () => {
  it('técnico que entra leva o vínculo dele para o carro novo; quem saiu perde', () => {
    // caso real: Danilo passou para o TKY6E68 no lugar do Nicolas
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKY-6E68', anterior: 'NICOLAS DARIO', novo: 'DANILO SOUZA' });
    expect(p.apagar).toEqual([2]);
    expect(p.gravar).toEqual({ id: 8, tecnico_nome: 'Danilo de Souza' });
  });
  it('quem divide o carro e não entrou na troca fica como está', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKY6E68', anterior: 'Nicolas Dario', novo: 'Danilo de Souza' });
    expect(p.apagar).not.toContain(14);
  });
  it('técnico sem vínculo ainda ganha uma linha nova', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'FXM4G90', anterior: 'Danilo de Souza', novo: 'Gabriel Moraes' });
    expect(p.apagar).toEqual([8]);
    expect(p.gravar).toEqual({ tecnico_nome: 'Gabriel Moraes' });
  });
  it('responsável que não é técnico só tira o técnico que saiu', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'FXM4G90', anterior: 'Danilo de Souza', novo: 'Joaquim Fernando' });
    expect(p.apagar).toEqual([8]);
    expect(p.gravar).toBeNull();
  });
  it('carro sem responsável (nome vazio) tira quem saiu', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'FXM4G90', anterior: 'Danilo de Souza', novo: null });
    expect(p.apagar).toEqual([8]);
    expect(p.gravar).toBeNull();
  });
  it('o técnico que saiu não perde o vínculo de OUTRO carro', () => {
    const p = planejarVinculo({ linhas, tecnicos, placa: 'TKC5D99', anterior: 'Danilo de Souza', novo: 'Gabriel Moraes' });
    expect(p.apagar).toEqual([]);
  });
});
