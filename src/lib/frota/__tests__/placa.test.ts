import { describe, it, expect } from 'vitest';
import {
  ehAvulsa, ehPlacaValida, extrairPlacaDeNumPlaca, formatarPlaca,
  normalizarPlaca, partesNumPlaca, resolverPlaca,
} from '../placa';

describe('normalizarPlaca', () => {
  it('maiúscula, só letras e números', () => {
    expect(normalizarPlaca('sec-1f03 ')).toBe('SEC1F03');
    expect(normalizarPlaca('ABC–1234')).toBe('ABC1234');   // en-dash
    expect(normalizarPlaca('abc.1234')).toBe('ABC1234');   // o regex antigo NÃO removia o ponto
    expect(normalizarPlaca(null)).toBe('');
    expect(normalizarPlaca(undefined)).toBe('');
  });
});

describe('ehPlacaValida', () => {
  it('aceita padrão antigo e Mercosul', () => {
    expect(ehPlacaValida('ABC1234')).toBe(true);   // antiga
    expect(ehPlacaValida('EPX-5402')).toBe(true);  // antiga, com hífen
    expect(ehPlacaValida('ABC1D23')).toBe(true);   // Mercosul
  });
  it('rejeita tamanho errado', () => {
    expect(ehPlacaValida('TKBB8I49')).toBe(false); // 8 caracteres
    expect(ehPlacaValida('ABC123')).toBe(false);
    expect(ehPlacaValida('')).toBe(false);
  });
});

describe('extrairPlacaDeNumPlaca', () => {
  it('lida com os formatos reais de Placas.NumPlaca', () => {
    expect(extrairPlacaDeNumPlaca('SAVEIRO - TKY6E68')).toBe('TKY6E68');
    expect(extrairPlacaDeNumPlaca('VOYAGE-SEB9J47')).toBe('SEB9J47');
    expect(extrairPlacaDeNumPlaca('SAVEIRO – DLZ1967')).toBe('DLZ1967'); // en-dash
    expect(extrairPlacaDeNumPlaca('CAPTIVA-EPX5253')).toBe('EPX5253');
  });

  it('não quebra quando o MODELO tem hífen (o split antigo devolvia "4000")', () => {
    expect(extrairPlacaDeNumPlaca('F-4000 - LNX1234')).toBe('LNX1234');
  });

  it('aceita placa pura, sem separador (o split antigo devolvia undefined)', () => {
    expect(extrairPlacaDeNumPlaca('TKY6E68')).toBe('TKY6E68');
  });

  it('sem token válido, devolve o último não-vazio (melhor esforço)', () => {
    expect(extrairPlacaDeNumPlaca('CAMINHAO - XXX')).toBe('XXX');
    expect(extrairPlacaDeNumPlaca('')).toBe('');
  });
});

describe('partesNumPlaca', () => {
  it('separa tipo e placa nos formatos reais da tabela Placas', () => {
    expect(partesNumPlaca('SAVEIRO - TKY6E68')).toEqual({ tipo: 'SAVEIRO', placa: 'TKY6E68' });
    expect(partesNumPlaca('VOYAGE-SEB9J47')).toEqual({ tipo: 'VOYAGE', placa: 'SEB9J47' });
    expect(partesNumPlaca('CAMINHAO - EVG1E67')).toEqual({ tipo: 'CAMINHAO', placa: 'EVG1E67' });
  });

  it('placa antiga COM hífen dentro do NumPlaca (vira 2 tokens, nenhum casa sozinho)', () => {
    expect(partesNumPlaca('GOL - AYB-4230')).toEqual({ tipo: 'GOL', placa: 'AYB4230' });
  });

  it('modelo COM hífen não é confundido com a placa', () => {
    expect(partesNumPlaca('F-4000 - LNX1234')).toEqual({ tipo: 'F 4000', placa: 'LNX1234' });
  });

  it('placa pura, sem tipo', () => {
    expect(partesNumPlaca('TKY6E68')).toEqual({ tipo: '', placa: 'TKY6E68' });
  });

  it('vazio', () => {
    expect(partesNumPlaca('')).toEqual({ tipo: '', placa: '' });
    expect(partesNumPlaca(null)).toEqual({ tipo: '', placa: '' });
  });
});

describe('formatarPlaca', () => {
  it('só formata quando tem 7 caracteres', () => {
    expect(formatarPlaca('EPX5402')).toBe('EPX-5402');
    expect(formatarPlaca('CLI0002')).toBe('CLI-0002');
    expect(formatarPlaca('XXX')).toBe('XXX');
  });
});

describe('ehAvulsa', () => {
  it('reconhece os baldes de abastecimento que NÃO são veículos', () => {
    expect(ehAvulsa('CLI0002')).toBe(true);  // clientes
    expect(ehAvulsa('TRA0001')).toBe(true);  // tratores
    expect(ehAvulsa('0000000')).toBe(true);  // quadriciclos
    expect(ehAvulsa('EPX5402')).toBe(false);
  });

  it('CLI0002/TRA0001 casam com PLACA_RE — por isso a lista é obrigatória', () => {
    expect(ehPlacaValida('CLI0002')).toBe(true);   // parece placa...
    expect(ehAvulsa('CLI0002')).toBe(true);        // ...mas não é veículo
  });
});

describe('resolverPlaca', () => {
  it('unifica as grafias erradas no carro certo (o rastreador é a verdade)', () => {
    expect(resolverPlaca('EVG1467')).toBe('EVG1E67');
    expect(resolverPlaca('SEV9I75')).toBe('SEB9I75');
    expect(resolverPlaca('TKBB8I49')).toBe('TKB8I49');
  });
  it('normaliza antes de resolver', () => {
    expect(resolverPlaca('evg-1467')).toBe('EVG1E67');
  });
  it('placa sem apelido passa direto', () => {
    expect(resolverPlaca('EPX-5402')).toBe('EPX5402');
  });
});
