import { describe, it, expect } from 'vitest';
import { motoristasDesligados, planejarHigiene, responsavelEmOutroCarro, tecnicosQueNaoSaoDoResponsavel, vinculosDeDesligados } from '../higiene-responsaveis';

describe('vínculo de técnico desligado', () => {
  const rhNomes = [
    { nome: 'PAULO JOAQUIM MOTTA', status: 'demitido' },
    { nome: 'NICOLAS DA SILVA DARIO', status: 'demitido' },
    { nome: 'GABRIEL VICTOR DA MOTTA', status: 'inativo' },
    { nome: 'GABRIEL GOMES DE MORAES', status: 'ativo' },
    { nome: 'DANILO DE SOUZA', status: 'ativo' },
  ];
  it('tira Paulo e Nicolas; mantém Danilo e o Gabriel ativo', () => {
    const linhas = [
      { id: 14, tecnico_nome: 'PAULO MOTTA' },
      { id: 16, tecnico_nome: 'Paulo Motta' },
      { id: 2, tecnico_nome: 'Nicolas Dario' },
      { id: 11, tecnico_nome: 'Gabriel Moraes' },
      { id: 8, tecnico_nome: 'Danilo de Souza' },
    ];
    expect(vinculosDeDesligados(linhas, rhNomes)).toEqual([14, 16, 2]);
  });
});

const rh = [
  { id: 'rh-nicolas', cpf: '111.111.111-11', status: 'demitido' },
  { id: 'rh-danilo', cpf: '222.222.222-22', status: 'ativo' },
  { id: 'rh-ana', cpf: '333.333.333-33', status: 'ferias' },
];
const locais = [
  { id: 'm-nicolas', cpf: '11111111111', pessoa_id: null },
  { id: 'm-danilo', cpf: null, pessoa_id: 'rh-danilo' },
  { id: 'm-ana', cpf: '33333333333', pessoa_id: null },
  { id: 'm-fora', cpf: '99999999999', pessoa_id: null },
];

describe('responsável que não pode continuar aberto', () => {
  it('só quem o RH diz demitido/inativo é desligado (férias não; fora do RH não)', () => {
    expect([...motoristasDesligados(locais, rh)]).toEqual(['m-nicolas']);
  });
  it('sem RH configurado ninguém é desligado', () => {
    expect(motoristasDesligados(locais, []).size).toBe(0);
  });
  it('fecha desligado e carro vendido/arquivado; mantém o resto', () => {
    const desl = motoristasDesligados(locais, rh);
    const r = planejarHigiene(
      [
        { id: 'r1', veiculo_id: 'fxm', motorista_id: 'm-nicolas', motorista_nome: 'NICOLAS DARIO' },
        { id: 'r2', veiculo_id: 'tky', motorista_id: 'm-danilo', motorista_nome: 'Danilo' },
        { id: 'r3', veiculo_id: 'fhy', motorista_id: 'm-danilo', motorista_nome: 'Danilo' },
      ],
      [{ id: 'fxm', status: 'ativo', ativo: true }, { id: 'tky', status: 'ativo', ativo: true }, { id: 'fhy', status: 'arquivado', ativo: false }],
      desl,
    );
    expect(r).toEqual([
      { id: 'r1', motivo: 'pessoa desligada no RH' },
      { id: 'r3', motivo: 'carro arquivado' },
    ]);
  });
});

describe('um carro = uma pessoa (dados reais de 04/11/2026)', () => {
  const abertos = [
    { id: 'r-fhy', veiculo_id: 'v-fhy', motorista_id: 'm-danilo', motorista_nome: 'DANILO SOUZA', inicio: '2025-06-23' },
    { id: 'r-tky', veiculo_id: 'v-tky', motorista_id: 'm-danilo', motorista_nome: 'Danilo de Souza', inicio: '2026-09-22' },
    { id: 'r-tkc', veiculo_id: 'v-tkc', motorista_id: 'm-gabriel', motorista_nome: 'GABRIEL GOMES', inicio: '2026-07-15' },
    { id: 'r-dlz', veiculo_id: 'v-dlz', motorista_id: 'm-jose', motorista_nome: 'ZECCA', inicio: '2026-07-15' },
  ];
  it('Danilo está no TKY6E68 (mais novo) → sai do carro antigo', () => {
    expect(responsavelEmOutroCarro(abertos)).toEqual([{ id: 'r-fhy', motivo: 'a pessoa passou para outro carro' }]);
  });
  it('mesmo nome sem cadastro também conta', () => {
    const a = [
      { id: '1', veiculo_id: 'a', motorista_id: null, motorista_nome: 'Danilo de Souza', inicio: '2026-01-01' },
      { id: '2', veiculo_id: 'b', motorista_id: null, motorista_nome: 'DANILO SOUZA', inicio: '2026-02-01' },
    ];
    expect(responsavelEmOutroCarro(a).map((x) => x.id)).toEqual(['1']);
  });
  it('técnico que não é o responsável sai; apelido casa pelo cadastro', () => {
    const linhas = [
      { id: 9, tecnico_nome: 'José Oliveira', placa: 'DLZ-1967' },
      { id: 14, tecnico_nome: 'PAULO MOTTA', placa: 'TKY6E68' },
      { id: 11, tecnico_nome: 'Gabriel Moraes', placa: 'TKC5D99' },
      { id: 16, tecnico_nome: 'Paulo Motta', placa: 'TKC5D99' },
      { id: 2, tecnico_nome: 'Nicolas Dario', placa: 'TKY6E68' },
      { id: 8, tecnico_nome: 'Danilo de Souza', placa: 'TKY6E68' },
      { id: 30, tecnico_nome: 'Fulano Sem Carro', placa: 'AAA1111' }, // carro sem responsável: fica
    ];
    const placas = new Map([['v-tky', 'TKY6E68'], ['v-tkc', 'TKC5D99'], ['v-dlz', 'DLZ1967'], ['v-fhy', 'FHY8D25']]);
    const cad = new Map([['m-danilo', 'Danilo de Souza'], ['m-gabriel', 'Gabriel Moraes'], ['m-jose', 'José Oliveira']]);
    const resolver = (p: string) => p.replace(/\W/g, '').toUpperCase();
    expect(tecnicosQueNaoSaoDoResponsavel(linhas, abertos, placas, cad, resolver).sort()).toEqual([14, 16, 2].sort());
  });
});
