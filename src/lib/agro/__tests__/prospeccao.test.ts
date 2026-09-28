import { describe, it, expect } from 'vitest';
import {
  gerarCSVProspeccao, COLUNAS_CSV, codCarCurto, linkMaps, explicarScore, pivotUso, corCultura, COR_DIVERSIFICADO,
  fmtHa, fmtBRL, fmtData, nomeCultura, type ImovelProspeccao,
} from '../prospeccao';

const base: ImovelProspeccao = {
  cod_car: 'SP-3538808-4B756AE664454B16B946AC06965D1B6B', municipio: 'Piraju', municipio_ibge: 3538808,
  area_ha: 229.3, area_util_ha: 210.12, modulos_fiscais: 10.4,
  cultura_principal: 'soja', cultura_nome: 'Soja', cultura_grupo: 'temporaria', area_cultura_ha: 199.6, pct_area_util: 95,
  confianca: 'alta', motivo_confianca: 'MapBiomas (95%) e SICOR concordam; teste "aspas"', fonte_principal: 'mapbiomas',
  credito_12m: 0, credito_36m: 1166212.4, credito_invest_36m: 300000, ultima_finalidade: 'Custeio', ultimo_credito_em: '2024-08-15',
  score_oportunidade: 4.92, score_detalhe: { area: 2, credito: 2, sem_compra: 1, prioridade: 0.5, fator_confianca: 1 },
  vinculos: 0, sobreposicao_pct: 12.4, centroide: { type: 'Point', coordinates: [-49.375291, -23.127636] },
  clientes: [], sugestoes_pendentes: 1,
};

describe('gerarCSVProspeccao', () => {
  it('tem BOM, cabeçalho com todas as colunas e separador ;', () => {
    const csv = gerarCSVProspeccao([base]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [cab, linha] = csv.slice(1).split('\r\n');
    expect(cab.split(';')).toHaveLength(COLUNAS_CSV.length);
    expect(cab.startsWith('Score;Município;Código CAR')).toBe(true);
    expect(linha.startsWith('4,92;Piraju;SP-3538808-')).toBe(true);
  });
  it('número em formato BR e aspas escapadas', () => {
    const linha = gerarCSVProspeccao([base]).split('\r\n')[1];
    expect(linha).toContain('1166212');           // crédito 36 m sem separador de milhar
    expect(linha).toContain('229,3');
    expect(linha).toContain('"MapBiomas (95%) e SICOR concordam; teste ""aspas"""');
    expect(linha).toContain('-23,127636;-49,375291');
  });
  it('vazio continua vazio (nunca "null" nem "NaN")', () => {
    const csv = gerarCSVProspeccao([{ ...base, cultura_nome: null, cultura_principal: null, confianca: null, credito_36m: null, centroide: null, ultimo_credito_em: null, sobreposicao_pct: null }]);
    const linha = csv.split('\r\n')[1];
    expect(linha).not.toMatch(/null|NaN|undefined/);
    expect(linha).toContain(';Diversificado;');
  });
  it('lista vazia devolve só o cabeçalho', () => {
    expect(gerarCSVProspeccao([]).split('\r\n')).toHaveLength(1);
  });
});

describe('apresentação', () => {
  it('codCarCurto encurta só o que é longo', () => {
    expect(codCarCurto(base.cod_car)).toBe('SP-3538808-…5D1B6B');
    expect(codCarCurto('SP-1')).toBe('SP-1');
  });
  it('linkMaps usa lat,lng (GeoJSON vem lng,lat)', () => {
    expect(linkMaps(base.centroide)).toBe('https://www.google.com/maps/search/?api=1&query=-23.127636,-49.375291');
    expect(linkMaps(null)).toBeNull();
  });
  it('corCultura: diversificado tem cor própria e cultura desconhecida cai no cinza', () => {
    expect(corCultura(null)).toBe(COR_DIVERSIFICADO);
    expect(corCultura('soja')).toBe('#facc15');
    expect(corCultura('inexistente')).toBe('#6b7280');
  });
  it('formatadores não quebram com nulo', () => {
    expect(fmtHa(null)).toBe('—'); expect(fmtBRL(undefined)).toBe('—'); expect(fmtData(null)).toBe('—');
    expect(fmtData('2024-08-15')).toBe('15/08/2024');
    expect(nomeCultura({ cultura_nome: null })).toBe('Diversificado');
  });
  it('explicarScore lista as partes e avisa quando não há regra', () => {
    const e = explicarScore(base.score_detalhe);
    expect(e.some((l) => l.includes('investimento nos 36 meses'))).toBe(true);
    expect(e.some((l) => l.includes('sem regra cadastrada'))).toBe(true);
    expect(explicarScore(null)).toEqual([]);
  });
});

describe('pivotUso', () => {
  it('pivota cultura × safra e ordena pela safra mais recente', () => {
    const p = pivotUso([
      { ano_safra: 2023, fonte: 'mapbiomas', cultura_codigo: 'soja', area_ha: 100, pct_area_util: 50 },
      { ano_safra: 2024, fonte: 'mapbiomas', cultura_codigo: 'soja', area_ha: 80, pct_area_util: 40 },
      { ano_safra: 2024, fonte: 'mapbiomas', cultura_codigo: 'pastagem', area_ha: 120, pct_area_util: 60 },
      { ano_safra: 2024, fonte: 'sicor', cultura_codigo: 'milho', area_ha: 999, pct_area_util: null },
    ], { soja: 'Soja', pastagem: 'Pastagem' });
    expect(p.anos).toEqual([2023, 2024]);
    expect(p.linhas.map((l) => l.codigo)).toEqual(['pastagem', 'soja']);   // pastagem maior em 2024; sicor fica fora
    expect(p.linhas[1].porAno[2023]).toBe(100);
  });
});
