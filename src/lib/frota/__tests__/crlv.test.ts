import { describe, it, expect } from 'vitest';
import { parsearCrlvItens, type ItemPdf } from '../crlv';

// Geometria REAL do CRLV-e (SENATRAN/DETRAN-SP): rótulo em cima, valor logo
// abaixo na MESMA coluna. As coordenadas abaixo são as de um documento real;
// os valores são fictícios. Quirks reais cobertos:
//  - Δy varia de 11 a 23 (NOME→valor = 12; CHASSI→valor = 23)
//  - logo abaixo de PLACA (Δ26) vem OUTRO RÓTULO (ANO FABRICAÇÃO) — o parser
//    tem que preferir o valor (Δ13) e nunca engolir rótulo como valor
//  - MARCA/MODELO/VERSÃO vem junto ("VW/VOYAGE MPI") e é separado no 1º '/'
const doc = (over: Partial<Record<string, string>> = {}): ItemPdf[] => {
  const t = (str: string, x: number, y: number): ItemPdf => ({ str, x, y, pagina: 1 });
  return [
    t('CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL', 31, 773),
    t('CATEGORIA', 317, 773), t('PARTICULAR', 316, 762),
    t('CÓDIGO RENAVAM', 31, 747), t(over.renavam ?? '00123456789', 31, 733),
    t('PLACA', 31, 720), t('EXERCÍCIO', 103, 720),
    t(over.placa ?? 'ABC1D23', 31, 707), t('2026', 103, 707),
    t('ANO FABRICAÇÃO', 31, 694), t('ANO MODELO', 103, 694),
    t('2022', 31, 681), t('2023', 103, 681),
    t('NÚMERO DO CRV', 31, 668), t('999888777666', 31, 654),
    t('NOME', 317, 656), t(over.proprietario ?? 'EMPRESA EXEMPLO LTDA', 316, 644),
    t('Valide este QRCode com app Vio', 282, 649),
    t('CPF / CNPJ', 463, 626), t('12.345.678/0001-99', 463, 612),
    t('MARCA / MODELO / VERSÃO', 31, 564), t(over.marca_modelo ?? 'VW/VOYAGE MPI', 31, 541),
    t('ESPÉCIE / TIPO', 31, 529), t('PASSAGEIRO AUTOMOVEL', 31, 506),
    t('PLACA ANTERIOR / UF', 31, 494), t('CHASSI', 130, 494),
    t('9BWZZZ377VT004251', 131, 471),
    t('COR PREDOMINANTE', 31, 458), t('COMBUSTÍVEL', 102, 458),
    t('BRANCA', 31, 436), t('ALCOOL/GASOLINA', 103, 436),
  ];
};

describe('parsearCrlvItens — CRLV-e digital SEM IA', () => {
  it('extrai todos os campos do layout real', () => {
    const d = parsearCrlvItens(doc())!;
    expect(d).not.toBeNull();
    expect(d.placa).toBe('ABC1D23');
    expect(d.renavam).toBe('00123456789');
    expect(d.chassi).toBe('9BWZZZ377VT004251');
    expect(d.marca).toBe('VW');
    expect(d.modelo).toBe('VOYAGE MPI');
    expect(d.ano_fabricacao).toBe(2022);
    expect(d.ano_modelo).toBe(2023);
    expect(d.exercicio).toBe(2026);
    expect(d.cor).toBe('BRANCA');
    expect(d.combustivel).toBe('ALCOOL/GASOLINA');
    expect(d.proprietario).toBe('EMPRESA EXEMPLO LTDA');
    expect(d.cpf_cnpj_proprietario).toBe('12.345.678/0001-99');
  });

  it('placa Mercosul e antiga passam na validação', () => {
    expect(parsearCrlvItens(doc({ placa: 'SEB9J47' }))!.placa).toBe('SEB9J47');
    expect(parsearCrlvItens(doc({ placa: 'AYB-4230' }))!.placa).toBe('AYB4230');
  });

  it('não confunde rótulo com valor (abaixo de PLACA vem ANO FABRICAÇÃO)', () => {
    // sem o valor da placa, o item mais próximo abaixo do rótulo é OUTRO rótulo
    const itens = doc().filter((i) => i.str !== 'ABC1D23');
    const d = parsearCrlvItens(itens)!;
    expect(d.placa).toBeNull(); // não pode virar "ANO FABRICAÇÃO"
  });

  it('PDF que não é CRLV -> null (deixa pro fallback)', () => {
    expect(parsearCrlvItens([{ str: 'NOTA FISCAL ELETRÔNICA', x: 10, y: 700, pagina: 1 }])).toBeNull();
  });

  it('CRLV sem NENHUM identificador do veículo -> null', () => {
    const itens = doc().filter((i) => !['ABC1D23', '00123456789', '9BWZZZ377VT004251'].includes(i.str));
    expect(parsearCrlvItens(itens)).toBeNull();
  });
});
