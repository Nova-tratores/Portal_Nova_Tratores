import { describe, it, expect } from 'vitest';
import { lerDrvg, lerValor, montarOsReembolso, sugerirAjuste } from '../drvg';
import d7717 from './fixtures/drvg-7717.json';
import d7654 from './fixtures/drvg-7654.json';

describe('DRVG da Mahindra', () => {
  it('lê números nos dois formatos', () => {
    expect(lerValor('1,122.90')).toBe(1122.9);
    expect(lerValor('1.122,90')).toBe(1122.9);
    expect(lerValor('R$ 121,00 / hora')).toBe(121);
    expect(lerValor('0.00 ')).toBe(0);
  });

  it('DRVG 7717: cabeçalho, taxa e SGs (inclusive a SG numa linha e o trator na de baixo)', () => {
    const d = lerDrvg(d7717 as never);
    expect(d.numero).toBe('7717');
    expect(d.taxaHora).toBe(121);
    expect(d.taxaKm).toBe(2.1);
    expect(d.totais.total).toBe(1122.9);
    expect(d.sgs.map((s) => s.sg)).toEqual(['2026-060', '2026-064', '2026-065', '2026-066', '2026-068']);
    const s64 = d.sgs[1];
    expect([s64.horas, s64.km, s64.pecas, s64.negativa]).toEqual([4, 78, 0, false]);
    expect(s64.chassi).toBe('MDI07513VR0004973');
    const s68 = d.sgs[4];
    expect([s68.modelo, s68.chassi, s68.horas, s68.km]).toEqual(['6075 BR', 'MDI07513PS0006206', 2, 111]);
    expect(d.sgs[0].negativa).toBe(true);
    expect(d.sgs[2].obs).toMatch(/primeiro$/); // observação que continua na linha de baixo
    expect(d.avisos).toEqual([]);
  });

  it('DRVG 7654: peças pagas em dinheiro e reposta sem valor', () => {
    const d = lerDrvg(d7654 as never);
    expect(d.sgs).toHaveLength(9);
    const s51 = d.sgs.find((s) => s.sg === '2026-051')!;
    expect([s51.horas, s51.km, s51.pecas, s51.negativa]).toEqual([10, 181, 1437.5, false]);
    const s61 = d.sgs.find((s) => s.sg === '2026-061')!;
    expect(s61.negativa).toBe(false); // "Peças repostas" sem dinheiro = aprovada
    expect(d.sgs.find((s) => s.sg === '2026-059')!.obs).toMatch(/4 meses de uso/);
    expect(d.avisos).toEqual([]);
  });

  it('monta a OS de reembolso no padrão do faturista e bate com a NFS-e 69', () => {
    const d = lerDrvg(d7654 as never);
    const os = montarOsReembolso(d.sgs, { drvg: d.numero, taxaHora: 121, taxaKm: 2.1 });
    expect(os.total).toBe(5892.3);
    expect(os.sgs).toEqual(['2026-051', '2026-053', '2026-054', '2026-055', '2026-061']);
    expect(os.texto).toBe('VALOR: R$5.892,30| REFERENTE A DRVG 7654 DA SOLICITAÇÃO DE GARANTIA SG 2026-051, 53, 54, 55 e 61');
  });

  it('ajusta a OS para bater com a DRVG quando a fábrica errou pra mais', () => {
    const itens = [{ sg: '2026-090', horas: 10, km: 100, pecas: 500, negativa: false }];
    const ref = { drvg: '9999', taxaHora: 121, taxaKm: 2.1 };
    const os = montarOsReembolso(itens, ref); // 1210 + 210 + 500 = 1920
    expect(os.total).toBe(1920);
    // cabeçalho explica a diferença por linha: tira 121 da mão de obra e 10 das peças
    const porLinha = sugerirAjuste(os, { maoObra: 1089, km: 210, pecas: 490, frete: 0, total: 1789 })!;
    expect(porLinha).toEqual({ hora: 121, km: 0, pecas: 10 });
    const aj = montarOsReembolso(itens, { ...ref, ajuste: porLinha });
    expect([aj.total, aj.pecas, aj.valorHoras]).toEqual([1789, 490, 1210]);
    expect(aj.texto).toBe('VALOR: R$1.789,00| REFERENTE A DRVG 9999 DA SOLICITAÇÃO DE GARANTIA SG 2026-090');
    // cabeçalho não explica: tira da mão de obra primeiro
    expect(sugerirAjuste(os, { maoObra: 0, km: 0, pecas: 0, frete: 0, total: 1900 })).toEqual({ hora: 20, km: 0, pecas: 0 });
    // OS abaixo ou igual à DRVG: nada a ajustar
    expect(sugerirAjuste(os, { maoObra: 0, km: 0, pecas: 0, frete: 0, total: 1920 })).toBeNull();
    expect(sugerirAjuste(os, { maoObra: 0, km: 0, pecas: 0, frete: 0, total: 2000 })).toBeNull();
    // desconto nunca passa da própria linha
    expect(montarOsReembolso(itens, { ...ref, ajuste: { hora: 5000, km: -3, pecas: 0 } }).ajuste).toEqual({ hora: 1210, km: 0, pecas: 0 });
  });
});
