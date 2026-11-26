// Confere a conta contra a tabela oficial do grupo 6008 (dez/2026) e a proposta de R$ 139.700.
import { describe, it, expect } from 'vitest';
import { lerConfig, parcela, porDia, creditoComEmbutido, totalComTaxas, numeroSorte, modelosUnicos, cvDoNome, totalPago, jaPassou, diasAte, grupoDaUrgencia, periodoCurto, modeloDestaque, lanceDoBolso, whatsappDoAtendimento, faseDoEvento, linkDoMapa, datasVivas, coordenadasValidas, mapaEmbutido } from '../conta';

const cfg = lerConfig({ prazo_meses: 120, taxa_adm_pct: 15, fundo_reserva_pct: 1, seguro_pct: 0.084, lance_embutido_pct: 20 });
const cent = (v: number) => Math.round(v * 100) / 100;

describe('consórcio grupo 6008', () => {
  it('Mahindra 2025 25cv (R$ 146.685): parcela 1.560,88 · 52,03/dia · 112.654 com embutido', () => {
    expect(cent(parcela(146685, cfg))).toBe(1560.88);
    expect(cent(porDia(146685, cfg))).toBe(52.03);
    expect(Math.round(creditoComEmbutido(146685, cfg))).toBe(112654);
  });
  it('Mahindra 5050 (R$ 181.286): parcela 1.929,08 · 64,30/dia · 139.228 com embutido', () => {
    expect(cent(parcela(181286, cfg))).toBe(1929.08);
    expect(cent(porDia(181286, cfg))).toBe(64.3);
    expect(Math.round(creditoComEmbutido(181286, cfg))).toBe(139228);
  });
  it('proposta de R$ 139.700: parcela 1.486,56 e lance embutido de 20% = 32.410,40', () => {
    expect(cent(parcela(139700, cfg))).toBe(1486.56);
    expect(cent(totalComTaxas(139700, cfg) * 0.2)).toBe(32410.4);
  });
  it('grupos 6005 e 6009 (dez/2026): parcelas e lance embutido da tabela', () => {
    const casos: [number, number, number, number][] = [
      [383250, 4078.19, 135.94, 294336],   // 6675F (6005)
      [468000, 4980.02, 166.0, 359424],    // 86-110P (6005)
      [231000, 2458.09, 81.94, 177408],    // 6060 (6009)
      [278497, 2963.51, 98.78, 213886],    // 6075 (6009)
    ];
    for (const [cr, p, d, emb] of casos) {
      expect(cent(parcela(cr, cfg))).toBe(p);
      expect(cent(porDia(cr, cfg))).toBe(d);
      expect(Math.round(creditoComEmbutido(cr, cfg))).toBe(emb);
    }
  });
  it('o mesmo trator em 2 grupos vira um cartão só, e o formato antigo (um grupo) ainda funciona', () => {
    const c = lerConfig({ modelos: [
      { nome: 'Mahindra 5050 49cv', codigo: 'MH0937', credito: 181286, grupo: '6008' },
      { nome: 'Mahindra 5050 49cv', codigo: 'MH0937', credito: 181286, grupo: '6009' },
      { nome: 'Mahindra 2025', codigo: 'MH0903', credito: 146685, grupo: '6008' },
    ] });
    const u = modelosUnicos(c);
    expect(u.map((m) => m.codigo)).toEqual(['MH0903', 'MH0937']);
    expect(u[1].grupos).toEqual(['6008', '6009']);
    expect(lerConfig({ grupo: '6008', vencimento: '2026-12-10' }).grupos).toEqual([{ grupo: '6008', vencimento: '2026-12-10', proxima_assembleia: null }]);
    expect(cvDoNome('MAHINDRA 86-110P 110CV CABINE')).toBe(110);
  });
  it('total pago inclui o seguro (bloco 0 do plano)', () => {
    expect(Math.round(totalPago(146685, cfg))).toBe(187306);
    expect(Math.round(totalPago(181286, cfg))).toBe(231490);
  });
  it('datas: período curto, data passada e o grupo da urgência', () => {
    expect(periodoCurto('2026-12-03', '2026-12-04')).toBe('03 e 04/12');
    expect(periodoCurto('2026-12-03', '2026-12-06')).toBe('03 a 06/12');
    expect(periodoCurto('2026-11-28', '2026-12-02')).toBe('28/11 a 02/12');
    const dia3 = new Date(2026, 11, 3);   // 03/12/2026, primeiro dia da Supersafra
    expect(jaPassou('2026-12-02', dia3)).toBe(true);
    expect(jaPassou('2026-12-03', dia3)).toBe(false);
    expect(diasAte('2026-12-10', dia3)).toBe(7);
    const c = lerConfig({ super_assembleia: { grupo: '6008', quando: 'maio/2027', cartas: 41 }, grupos: [
      { grupo: '6005', vencimento: '2026-11-26', proxima_assembleia: '2026-12-02' },
      { grupo: '6008', vencimento: '2026-12-10', proxima_assembleia: '2026-12-16' },
      { grupo: '6009', vencimento: '2026-12-10', proxima_assembleia: '2026-12-17' },
    ] });
    expect(grupoDaUrgencia(c, dia3)?.grupo).toBe('6008');                      // o da Super Assembleia
    expect(grupoDaUrgencia(c, new Date(2026, 11, 11))).toBeNull();             // tudo vencido
  });
  it('carta destaque: a do código configurado, senão a mais barata', () => {
    const lista = [{ nome: '5050', codigo: 'MH0937', credito: 181286 }, { nome: '2025', codigo: 'MH0903', credito: 146685 }];
    expect(modeloDestaque(lista, lerConfig({ destaque: 'mh0937' }))?.nome).toBe('5050');
    expect(modeloDestaque(lista, lerConfig({}))?.nome).toBe('2025');
    expect(modeloDestaque([], lerConfig({}))).toBeNull();
  });
  it('10% do bolso para o lance fixo de 30% (proposta oficial de R$ 139.700: capital próprio R$ 16.205,20)', () => {
    const c30 = lerConfig({ lance_fixo_pct: 30 });
    expect(cent(lanceDoBolso(139700, c30)!.valor)).toBe(16205.2);
    expect(Math.round(lanceDoBolso(146685, c30)!.valor)).toBe(17015);
    expect(Math.round(lanceDoBolso(468000, c30)!.valor)).toBe(54288);
    expect(lanceDoBolso(146685, lerConfig({}))).toBeNull();   // sem lance fixo configurado
  });
  it('WhatsApp do atendimento: o do vendedor do QR, senão o da loja', () => {
    const c = lerConfig({ whatsapp: '551433516049', vendedores: [{ nome: 'Dougras', whatsapp: '(14) 99876-5432' }] });
    expect(whatsappDoAtendimento(c, 'dougras')).toEqual({ numero: '5514998765432', nome: 'Dougras' });
    expect(whatsappDoAtendimento(c, 'Fulano')).toEqual({ numero: '551433516049', nome: null });
    expect(whatsappDoAtendimento(lerConfig({}), '')).toBeNull();
  });
  it('fase do evento: contagem até a abertura, "durante" nos 2 dias, "depois" no fim', () => {
    const f = (d: Date) => faseDoEvento('2026-12-03', '2026-12-04', '08:00', d);
    expect(f(new Date(2026, 10, 24, 16, 0))).toMatchObject({ fase: 'antes', falta: { dias: 8, horas: 16, minutos: 0, segundos: 0 } });
    expect(f(new Date(2026, 11, 3, 7, 58, 30)).falta).toEqual({ dias: 0, horas: 0, minutos: 1, segundos: 30 });
    expect(f(new Date(2026, 11, 3, 7, 59)).fase).toBe('antes');
    expect(f(new Date(2026, 11, 3, 8, 0)).fase).toBe('durante');
    expect(f(new Date(2026, 11, 4, 22, 0)).fase).toBe('durante');
    expect(f(new Date(2026, 11, 5, 0, 1)).fase).toBe('depois');
    expect(linkDoMapa('ROD PR 218 KM 17\nCARLÓPOLIS PR')).toContain('ROD%20PR%20218%20KM%2017%2C%20CARL');
    expect(linkDoMapa('')).toBeNull();
  });
  it('número da sorte sempre com 3 dígitos', () => {
    expect(numeroSorte(7)).toBe('007');
    expect(numeroSorte(1234)).toBe('1234');
  });
  it('config vazia cai no padrão', () => {
    expect(lerConfig(null).prazo_meses).toBe(120);
  });
});

describe('revisão v2: datas que já passaram e mapa', () => {
  const g6005 = { grupo: '6005', vencimento: '2026-11-26', proxima_assembleia: '2026-12-02' };
  it('vencimento passou: a assembleia daquele mês some junto (nunca mostra data vencida)', () => {
    expect(datasVivas(g6005, new Date(2026, 10, 25))).toEqual({ grupo: '6005', vencimento: '2026-11-26', proxima_assembleia: '2026-12-02' });
    expect(datasVivas(g6005, new Date(2026, 10, 27))).toEqual({ grupo: '6005', vencimento: null, proxima_assembleia: null });
  });
  it('com calendário, pula para o próximo mês que ainda vale', () => {
    const g = { ...g6005, calendario: [{ vencimento: '2026-12-28', assembleia: '2027-01-06' }] };
    expect(datasVivas(g, new Date(2026, 10, 27))).toMatchObject({ vencimento: '2026-12-28', proxima_assembleia: '2027-01-06' });
    expect(grupoDaUrgencia(lerConfig({ grupos: [g] }), new Date(2026, 10, 27))?.vencimento).toBe('2026-12-28');
  });
  it('coordenadas: aceita "lat, lng", recusa texto; o mapa usa o pino quando tem', () => {
    expect(coordenadasValidas(' -23.4241 , -49.7213 ')).toBe('-23.4241,-49.7213');
    expect(coordenadasValidas('Carlópolis')).toBeNull();
    expect(mapaEmbutido(lerConfig({ coordenadas: '-23.4,-49.7', endereco: 'X' }))).toContain('q=-23.4,-49.7&z=15');
    expect(mapaEmbutido(lerConfig({ endereco: 'ROD PR 218\nCarlópolis' }))).toContain('z=14');
  });
});
