import { describe, expect, it } from 'vitest'
import {
  calcularMargemCelula,
  kitDeHoras,
  expandirCiclo,
  resolverModeloKit,
  alocarHoras,
  MARCOS,
  type Pagador,
  type RevisaoParametros,
} from '../margem'

// Fixture = os parâmetros semeados na migration (create-revisoes-margem.sql).
// velocidade/combustível/manutenção são estimativas (pendência #4); com eles o
// custo_hora_servico_efetivo sai ~95,41 (o prompt §6.3 ilustra ~95,47 — a
// diferença de centavos é essas 3 estimativas; os SINAIS e relações batem).
const PARAMS: RevisaoParametros = {
  valor_hora_cliente: 200,
  valor_hora_garantia: 130,
  tarifa_km: 2.8,
  salario_base: 2500,
  fator_encargos: 1.672208,
  horas_uteis_mes: 176,
  pct_servico: 30 / 176,
  pct_deslocamento: 70 / 176,
  velocidade_media_kmh: 45,
  custo_combustivel_km: 1.12,
  custo_manutencao_km: 0.55,
  aliquota_iss: 0.03,
  aliquota_pis_cofins: 0.0925,
  cmc_liquido_de_impostos: false,
  pct_credito_cmc: 0,
  comissao_min: 0.15,
  comissao_max: 0.3,
  comissao_media: 0.2,
  fator_realizacao_km: 0.85,
  fator_realizacao_horas: 0.85,
}

// 1 hora de mão de obra pura (sem peças) — isola a economia da hora.
function moHora(pagador: Pagador, pct: number) {
  return calcularMargemCelula({ itens: [], horasPadrao: 1, pagador, pctComissao: pct, parametros: PARAMS })
}

describe('alocarHoras', () => {
  it('reparte 176h em 30 serviço / 70 deslocamento / 76 ócio e infla o custo da hora', () => {
    const a = alocarHoras(PARAMS)
    expect(a.custoMensal).toBeCloseTo(4180.52, 2)
    expect(a.custoHoraPago).toBeCloseTo(23.75, 1) // nominal
    expect(a.horasServico).toBeCloseTo(30, 5)
    expect(a.horasDeslocamento).toBeCloseTo(70, 5)
    expect(a.horasOcio).toBeCloseTo(76, 5)
    // ocupação faturável ~17% joga a hora efetiva de ~R$24 para ~R$95
    expect(a.custoHoraServicoEfetivo).toBeCloseTo(95.41, 1)
  })
})

describe('calcularMargemCelula — mão de obra (fixture §6.3)', () => {
  // Cliente (R$200/h): margem positiva.
  it('cliente 15% ≈ +50', () => {
    const m = moHora('cliente', 0.15)
    expect(m.margem_nominal).toBeCloseTo(50.09, 1) // §6.3 ilustra +50,03
    expect(m.margem_nominal).toBeGreaterThan(0)
  })
  it('cliente 30% ≈ +20', () => {
    expect(moHora('cliente', 0.3).margem_nominal).toBeCloseTo(20.09, 1) // §6.3 +20,03
  })

  // Fábrica (garantia R$130/h): NEGATIVA com ocupação ~17%. Não é bug.
  it('fábrica 15% ≈ 0 (levemente negativo)', () => {
    const m = moHora('fabrica', 0.15)
    expect(m.margem_nominal).toBeCloseTo(-0.84, 1) // §6.3 -0,90
    expect(m.margem_nominal).toBeLessThan(0)
  })
  it('fábrica 30% ≈ -20', () => {
    expect(moHora('fabrica', 0.3).margem_nominal).toBeCloseTo(-20.34, 1) // §6.3 -20,40
  })

  // Cortesia loja: receita 0, mas comissão incide sobre a hora de GARANTIA (130).
  it('cortesia 15% ≈ -115 (comissão sobre R$130, não R$200)', () => {
    const m = moHora('cortesia_loja', 0.15)
    expect(m.margem_nominal).toBeCloseTo(-114.91, 1) // §6.3 -114,97
    expect(m.receita_mo_liquida).toBe(0)
    expect(m.comissao).toBeCloseTo(130 * 0.15, 5) // base = garantia
  })
  it('cortesia 30% ≈ -134', () => {
    expect(moHora('cortesia_loja', 0.3).margem_nominal).toBeCloseTo(-134.41, 1) // §6.3 -134,47
  })

  it('margem realizada < nominal quando a MO é positiva (vazamento de horas)', () => {
    const m = moHora('cliente', 0.15)
    expect(m.margem_realizada).toBeLessThan(m.margem_nominal)
  })

  it('o deslocamento perde dinheiro por km nestes parâmetros → km_max finito', () => {
    const m = moHora('cliente', 0.15)
    expect(m.margem_por_km).toBeLessThan(0)
    expect(m.km_max).toBeGreaterThan(0)
    expect(Number.isFinite(m.km_max!)).toBe(true)
  })
})

describe('calcularMargemCelula — peças / cobertura', () => {
  it('peça sem preço NÃO vira zero: derruba a cobertura mas o custo que existe conta', () => {
    const m = calcularMargemCelula({
      itens: [
        { codigo: 'A', quantidade: 1, cmc: 60, preco: 100 }, // completo
        { codigo: 'B', quantidade: 2, cmc: 50, preco: 0 }, // sem preço de venda
      ],
      horasPadrao: 0,
      pagador: 'cliente',
      pctComissao: 0.15,
      parametros: PARAMS,
    })
    expect(m.pecas_venda).toBeCloseTo(100, 5) // só A tem venda
    expect(m.pecas_custo).toBeCloseTo(60 + 2 * 50, 5) // B ainda soma custo (não zera)
    expect(m.cobertura).toBeCloseTo(0.5, 5)
    expect(m.itens_faltantes).toEqual(['B'])
  })

  it('cobertura 100% quando todos os itens têm CMC e preço', () => {
    const m = calcularMargemCelula({
      itens: [{ codigo: 'A', quantidade: 1, cmc: 60, preco: 100 }],
      horasPadrao: 0,
      pagador: 'cliente',
      pctComissao: 0.15,
      parametros: PARAMS,
    })
    expect(m.cobertura).toBe(1)
    expect(m.margem_pecas).toBeCloseTo(40, 5)
  })
})

describe('kitDeHoras — ciclo de 4', () => {
  it('mapeia os 11 marcos para os 5 kits distintos', () => {
    const esperado: Record<number, number> = {
      50: 50, 300: 300, 600: 600, 900: 900, 1200: 1200,
      1500: 300, 1800: 600, 2100: 900, 2400: 1200, 2700: 300, 3000: 600,
    }
    for (const marco of MARCOS) expect(kitDeHoras(marco)).toBe(esperado[marco])
  })
  it('abaixo de 300h cai no kit de 50h', () => {
    expect(kitDeHoras(0)).toBe(50)
    expect(kitDeHoras(120)).toBe(50)
  })
})

describe('expandirCiclo', () => {
  it('até 3000h devolve os 11 marcos com seus kits', () => {
    const c = expandirCiclo(3000)
    expect(c).toHaveLength(11)
    expect(c[0]).toEqual({ marco: 50, kit: 50 })
    expect(c[5]).toEqual({ marco: 1500, kit: 300 })
  })
})

describe('resolverModeloKit — fallback nunca silencioso', () => {
  const comKit = new Set(['2025', '9500', '6075'])
  it('modelo com kit próprio', () => {
    expect(resolverModeloKit('6075', comKit)).toEqual({ modelo: '6075', origem: 'proprio' })
  })
  it('7095 cai no 9500 (fallback de modelo)', () => {
    expect(resolverModeloKit('7095', comKit)).toEqual({ modelo: '9500', origem: 'fallback_modelo' })
  })
  it('modelo desconhecido cai no genérico 2025', () => {
    expect(resolverModeloKit('5050', comKit)).toEqual({ modelo: '2025', origem: 'fallback_generico' })
  })
})
