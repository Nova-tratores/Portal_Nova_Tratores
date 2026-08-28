import { describe, expect, it } from 'vitest'
import { silhuetaDoVeiculo, SISTEMAS_FORA, type TipoSilhueta } from '../silhueta'

// modelos REAIS do cadastro (28/08/2026) — se a regra quebrar, quebra aqui
const FROTA: [string, TipoSilhueta][] = [
  // hatches (a maior parte dos carros da frota)
  ['VW FOX 1.0 GII', 'hatch'],
  ['VW NOVO GOL 1.0 CITY', 'hatch'],
  ['ONIX', 'hatch'],
  ['POLO', 'hatch'],
  ['ETIOS', 'hatch'],
  // sedãs
  ['VW VOYAGE MPI', 'carro'],
  ['ETIOS SEDAN', 'carro'],
  // picapes
  ['FIAT STRADA WORKING', 'picape'],
  ['VW SAVEIRO ROBUST', 'picape'],
  ['CHEVROLET MONTANA LS', 'picape'],
  ['CHEVROLET S10 LTZ FD2', 'picape'],
  ['FIAT TORO VOLCANO 4X4 2.0 16V TB 4P AUT', 'picape'],
  ['RAMPAGE', 'picape'],
  ['SW4 HILLUX', 'picape'],
  // caminhões
  ['VW FORD/CARGO 1517 E', 'caminhao'],
  ['FORD C2428 PMERECHIM 8X2', 'caminhao'],
  // motos
  ['BMW R 1250 GS ADVENTURE PREMIUM BLACK', 'moto'],
  ['TENERE 250', 'moto'],
  // carreta
  ['CARRETA CARRETINHA', 'carreta'],
  // SUVs: carroceria de DOIS volumes — caem no hatch, que é o desenho mais próximo
  ['CHEV TRAILBLAZER PRE D4A', 'hatch'],
  ['I/GM CAPTIVA SPORT V6AWD', 'hatch'],
  ['CHEV TRACKER T A LTZ', 'hatch'],
  ['JEEP CONQUEROR OVR TD380', 'hatch'],
  ['RENEGADE SPORT', 'hatch'],
]

describe('silhueta pelo modelo (frota real)', () => {
  it('cada veículo do cadastro cai no desenho certo', () => {
    for (const [modelo, esperado] of FROTA) {
      expect(silhuetaDoVeiculo({ modelo }), modelo).toBe(esperado)
    }
  })

  it('"carreta carretinha" NÃO vira caminhão', () => {
    // é rebocada: sem motor nem cabine. A ordem das regras é que garante isto
    expect(silhuetaDoVeiculo({ modelo: 'CARRETA CARRETINHA' })).toBe('carreta')
  })

  it('a moto da frota não vira picape por causa de "ADVENTURE"', () => {
    expect(silhuetaDoVeiculo({ modelo: 'BMW R 1250 GS ADVENTURE PREMIUM BLACK' })).toBe('moto')
  })

  it('"CARGO" contém "argo" — o caminhão tem que vencer o hatch', () => {
    // é a ordem das regras (caminhão antes de hatch) que impede o Cargo 1517
    // de virar um Fiat Argo
    expect(silhuetaDoVeiculo({ modelo: 'VW FORD/CARGO 1517 E' })).toBe('caminhao')
  })

  it('"ETIOS SEDAN" é sedã; "ETIOS" sozinho é hatch', () => {
    // a regra explícita de sedã roda antes do termo "etios" do hatch
    expect(silhuetaDoVeiculo({ modelo: 'ETIOS SEDAN' })).toBe('carro')
    expect(silhuetaDoVeiculo({ modelo: 'ETIOS' })).toBe('hatch')
  })

  it('tipo_veiculo declarado manda sobre o texto do modelo', () => {
    expect(silhuetaDoVeiculo({ tipo_veiculo: 'moto', modelo: 'VW FOX 1.0 GII' })).toBe('moto')
    expect(silhuetaDoVeiculo({ tipo_veiculo: 'caminhao', modelo: 'ONIX' })).toBe('caminhao')
  })

  it('tipo_veiculo="carro" (o único preenchido no cadastro) não atrapalha', () => {
    // 10 dos 38 têm 'carro' gravado, inclusive picapes — o texto do modelo
    // precisa continuar decidindo nesses casos
    expect(silhuetaDoVeiculo({ tipo_veiculo: 'carro', modelo: 'VW SAVEIRO ROBUST' })).toBe('picape')
    expect(silhuetaDoVeiculo({ tipo_veiculo: 'carro', modelo: 'FIAT STRADA FIRE FLEX' })).toBe('picape')
    expect(silhuetaDoVeiculo({ tipo_veiculo: 'carro', modelo: 'VW FOX 1.0 GII' })).toBe('hatch')
  })

  it('acento e caixa não mudam o resultado', () => {
    expect(silhuetaDoVeiculo({ modelo: 'caminhão cargo' })).toBe('caminhao')
    expect(silhuetaDoVeiculo({ modelo: 'CAMINHAO CARGO' })).toBe('caminhao')
    expect(silhuetaDoVeiculo({ marca: 'Ford', modelo: 'Cargo 1517' })).toBe('caminhao')
  })

  it('sem informação nenhuma cai em carro (nunca em branco)', () => {
    expect(silhuetaDoVeiculo({})).toBe('carro')
    expect(silhuetaDoVeiculo({ modelo: '', marca: null, descricao: undefined })).toBe('carro')
    expect(silhuetaDoVeiculo({ modelo: 'VEICULO DESCONHECIDO XPTO' })).toBe('carro')
  })

  it('marca e descrição também contam, não só o modelo', () => {
    expect(silhuetaDoVeiculo({ marca: 'YAMAHA', modelo: 'XTZ' })).toBe('moto')
    expect(silhuetaDoVeiculo({ descricao: 'Fiat Strada Endurance' })).toBe('picape')
  })
})

describe('sistemas que não existem no tipo', () => {
  it('moto não tem ar-condicionado nem cabine', () => {
    expect(SISTEMAS_FORA.moto).toContain('Ar-condicionado')
    expect(SISTEMAS_FORA.moto).toContain('Interior')
  })

  it('carreta não tem motor, câmbio nem direção', () => {
    for (const s of ['Motor', 'Transmissão', 'Direção']) {
      expect(SISTEMAS_FORA.carreta, s).toContain(s)
    }
  })

  it('carro, hatch, picape e caminhão têm todos os sistemas', () => {
    for (const t of ['carro', 'hatch', 'picape', 'caminhao'] as TipoSilhueta[]) {
      expect(SISTEMAS_FORA[t], t).toEqual([])
    }
  })

  it('Freios e Rodas e Pneus existem em TODO tipo — inclusive carreta', () => {
    for (const lista of Object.values(SISTEMAS_FORA)) {
      expect(lista).not.toContain('Freios')
      expect(lista).not.toContain('Rodas e Pneus')
    }
  })
})
