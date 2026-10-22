import { describe, expect, it } from 'vitest'
import { impostoCst60 } from '../cst60'

describe('CST 60 nas peças (PPV-0498, 845YPF)', () => {
  it('troca o CST no icms, no icms_st e cria o icms_efet, zerando base e valor', () => {
    const cru = {
      icms: { aliq_icms: 0, base_icms: 600, cod_sit_trib_icms: '51', modalidade_icms: '3', origem_icms: '0', perc_red_base_icms: 0, valor_icms: 0 },
      icms_efet: {},
      icms_st: { cest: '06.007.00', cod_sit_trib_icms_st: '51', aliq_icms_st: 0 },
      ibs: { valor_ibs: 0.6 },
    }
    const r = impostoCst60(cru)
    expect(r.icms).toMatchObject({ cod_sit_trib_icms: '60', base_icms: 0, valor_icms: 0, modalidade_icms: '3', origem_icms: '0' })
    expect(r.icms_st).toMatchObject({ cod_sit_trib_icms_st: '60', cest: '06.007.00' })
    expect(r.icms_efet).toMatchObject({ cod_sit_trib_icms_efet: '60', modalidade_icms_efet: '3', origem_icms_efet: '0', base_icms_efet: 0 })
    expect(r.ibs).toEqual({ valor_ibs: 0.6 })
  })
})

import { cfopPadrao, semCfop } from '../cst60'
describe('CFOP vazio no pedido (PPV-0505)', () => {
  it('usa o CFOP mais comum do pedido; sem nenhum, 5.102', () => {
    const det = [{ produto: { cfop: '5.102' } }, { produto: { cfop: '' } }, { produto: { cfop: '5.102' } }, { produto: { cfop: '5.405' } }]
    expect(cfopPadrao(det)).toBe('5.102')
    expect(cfopPadrao([{ produto: { cfop: '' } }])).toBe('5.102')
    expect(det.filter(semCfop)).toHaveLength(1)
  })
})
