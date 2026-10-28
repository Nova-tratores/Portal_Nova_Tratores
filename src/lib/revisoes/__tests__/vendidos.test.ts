import { describe, expect, it } from 'vitest';
import {
  chassiDaNota, chegadaDoTrator, dataISO, faixaEstoque, faseDaVenda, tipoEntrada, finalDoChassi, linkMapa, marcoDaSemana, marcosDaVenda, modeloDaNota, motorDaNota, umaPorChassi, whatsDe,
} from '../vendidos';

// descrições reais das notas (vendas_itens, 2025–2026)
const D = {
  chas: 'VEICULO NOVO MAHINDRA 6075E-BR-CAB PH2 V 2025 MOTOR: NSA7ACE0069|CILIND. CHAS:MDI07513ES0006198',
  serie: 'VEICULO NOVO MAHINDRA 6075E-BR PH2 2025 MOTOR: NSM7ACE0024|CILIND. SERIE:MDI07518HS0005921',
  chassiBarra: 'MAHINDRA 6075-BR-PH2 PNEU 18.4X30R1 CHASSI/Nro SERIE MDI07511JT0006821. Ano: 2026 Motor: NTB7ACE0077',
  nro: 'VEICULO NOVO MAHINDRA TRATOR JIVO 2025 ANO/MODELO 2025 2025 Nro serie MBN1KGCBFSGC02093',
  nde: 'TRATOR MAHINDRA 5050 Nº DE SÉRIE: MBNUZA2WFSZA00692',
  ser: 'VEICULO NOVO TRATOR 6065-BR-CAB PH2 MARCA MAHINDRA 2025 MOTOR: NRJ7ADE0003|SER MDI06512CS0005295',
  usado: 'TRATOR AGRICOLA DE RODAS USADO  MARCA LAS TRACTOR MODELO R60C - SÉRIE:2390108131 ANO 2016',
  pneu: 'VEICULO NOVO MAHINDRA 5050 4WD 14.9X28R1 NRO DE SÉRIE MBNUZA2WFPZM00335',
};

describe('chassi da nota', () => {
  it('lê os jeitos que as notas escrevem', () => {
    expect(chassiDaNota(D.chas)).toBe('MDI07513ES0006198');
    expect(chassiDaNota(D.serie)).toBe('MDI07518HS0005921');
    expect(chassiDaNota(D.chassiBarra)).toBe('MDI07511JT0006821');
    expect(chassiDaNota(D.nro)).toBe('MBN1KGCBFSGC02093');
    expect(chassiDaNota(D.nde)).toBe('MBNUZA2WFSZA00692');
    expect(chassiDaNota(D.ser)).toBe('MDI06512CS0005295');
    expect(chassiDaNota(D.pneu)).toBe('MBNUZA2WFPZM00335');
  });
  it('trator usado: série só com números', () => {
    expect(chassiDaNota(D.usado)).toBe('2390108131');
  });
  it('nunca pega o motor', () => {
    expect(chassiDaNota('MAHINDRA 6075 MOTOR: NSA7ACE0069')).toBeNull();
  });
});

describe('motor e modelo', () => {
  it('motor', () => {
    expect(motorDaNota(D.chas)).toBe('NSA7ACE0069');
    expect(motorDaNota(D.nro)).toBeNull();
  });
  it('modelo', () => {
    expect(modeloDaNota(D.chas)).toBe('Mahindra 6075E-BR-CAB');
    expect(modeloDaNota(D.nro)).toBe('Mahindra Jivo');
    expect(modeloDaNota(D.nde)).toBe('Mahindra 5050');
    expect(modeloDaNota(D.usado)).toBe('Las Tractor R60C');
    expect(modeloDaNota('VEICULO NOVO MAHINDRA 3140 OJA TRATOR AGRICOLA 2025 MOTOR: ZSASUDV0950|CILIND. CHAS:MBNMKNFTNSZA00016')).toBe('Mahindra OJA 3140');
    expect(modeloDaNota('YTO-ESK304 ROPS ESTREITO TRATOR AGRICOLA NOVO - MARCA YTO Chassi 00000000042550459 Numero do Motor Y251002265')).toBe('YTO ESK304');
  });
});

describe('30, 60 e 90 dias', () => {
  it('datas e o que já passou', () => {
    const m = marcosDaVenda('2026-07-30', '2026-10-26');
    expect(m.map((x) => x.data)).toEqual(['2026-08-29', '2026-09-28', '2026-10-28']);
    expect(m.map((x) => x.passou)).toEqual([true, true, false]);
    expect(m[2].diasFalta).toBe(2);
  });
  it('fase', () => {
    expect(faseDaVenda('2026-10-01', '2026-10-26')).toBe('antes');
    expect(faseDaVenda('2026-09-26', '2026-10-26')).toBe('fez30');
    expect(faseDaVenda('2026-08-01', '2026-10-26')).toBe('fez60');
    expect(faseDaVenda('2026-07-01', '2026-10-26')).toBe('fez90');
  });
  it('marco da semana', () => {
    expect(marcoDaSemana('2026-09-24', '2026-10-26')).toBe(30); // fez 30 há 2 dias
    expect(marcoDaSemana('2026-09-10', '2026-10-26')).toBeNull();
    expect(marcoDaSemana('2026-07-28', '2026-10-26')).toBe(90);
  });
  it('datas BR', () => {
    expect(dataISO('30/07/2026')).toBe('2026-07-30');
    expect(dataISO('2026-07-30T00:00')).toBe('2026-07-30');
    expect(dataISO('')).toBeNull();
  });
});

describe('um trator por chassi', () => {
  it('refaturado: fica a nota mais recente; cancelada sai', () => {
    const r = umaPorChassi([
      { empresa: 'NOVA', pedido: '1', dataISO: '2025-11-27', chassi: 'MDI07513HS0006054' },
      { empresa: 'NOVA', pedido: '2', dataISO: '2026-02-04', chassi: 'MDI07513HS0006054' },
      { empresa: 'NOVA', pedido: '3', dataISO: '2026-03-01', chassi: 'MDI07513HS0006054', cancelada: true },
      { empresa: 'NOVA', pedido: '4', dataISO: '2026-01-01', chassi: null },
    ]);
    expect(r.map((x) => x.pedido)).toEqual(['2', '4']);
  });
  it('final do chassi', () => {
    expect(finalDoChassi('mdi-0751 3ES0006198')).toBe('0006198');
  });
});

describe('mapa e WhatsApp', () => {
  it('ponto exato ou endereço', () => {
    expect(linkMapa({ lat: -23.4, lng: -49.6 })).toContain('query=-23.4,-49.6');
    expect(linkMapa({ endereco: 'Sítio X, Timburi (SP)' })).toContain('S%C3%ADtio');
    expect(linkMapa({})).toBeNull();
  });
  it('telefone', () => {
    expect(whatsDe('(14) 3351-2778')).toBe('551433512778');
    expect(whatsDe('14 99762-7413')).toBe('5514997627413');
    expect(whatsDe('123')).toBeNull();
  });
});

describe('chegada do trator (nota de entrada)', () => {
  const mah = { emitente: 'MAHINDRA DO BRASIL INDUSTRIAL LTDA', categoria: 'Compras de Tratores para Revenda' };
  const nova = { emitente: 'NOVA TRATORES MAQUINAS AGRICOLAS LTDA', categoria: null };
  it('compra × retorno', () => {
    expect(tipoEntrada(mah)).toBe('compra');
    expect(tipoEntrada(nova)).toBe('retorno');
    expect(tipoEntrada({ emitente: 'CASTRO PEÇAS E MAQUINAS', categoria: '' })).toBe('retorno');
    expect(tipoEntrada({ emitente: 'BRUTUS TRATORES', categoria: 'Compras de Tratores para Revenda' })).toBe('compra');
    expect(tipoEntrada({ emitente: null, categoria: null })).toBe('outra');
  });
  it('a chegada é a 1ª compra antes da venda (o Jivo que foi e voltou de demonstração)', () => {
    const ent = [
      { data: '2026-08-31', nf: '8224', ...nova },
      { data: '2026-07-23', nf: '56232', ...mah },
      { data: '2026-09-28', nf: '8344', ...nova },
    ];
    expect(chegadaDoTrator(ent)?.nf).toBe('56232');
    expect(chegadaDoTrator(ent, '2026-07-01')).toBeNull();
  });
  it('faixa no pátio', () => {
    expect(faixaEstoque(10)).toBe('novo');
    expect(faixaEstoque(90)).toBe('atencao');
    expect(faixaEstoque(200)).toBe('parado');
  });
});
