import { describe, expect, it } from 'vitest'
import { assinaturaAusente, rotuloTipoVinculo, tipoVinculoValido, TIPOS_VINCULO } from '../vinculo'

describe('tipo de vínculo CAR ↔ cliente', () => {
  it('aceita só os quatro tipos', () => {
    for (const t of TIPOS_VINCULO) expect(tipoVinculoValido(t)).toBe(true)
    expect(tipoVinculoValido('dono')).toBe(false)
    expect(tipoVinculoValido('')).toBe(false)
    expect(tipoVinculoValido(null)).toBe(false)
  })
  it('rotula e não inventa tipo', () => {
    expect(rotuloTipoVinculo('arrendatario_operador')).toBe('Arrendatário / operador')
    expect(rotuloTipoVinculo(undefined)).toBe('Tipo não informado')
  })
  it('reconhece função ausente no PostgREST', () => {
    expect(assinaturaAusente({ code: 'PGRST202', message: 'x' })).toBe(true)
    expect(assinaturaAusente({ message: 'Could not find the function public.agro_vincular_cliente(p_tipo) in the schema cache' })).toBe(true)
    expect(assinaturaAusente({ code: 'P0001', message: 'tipo de vínculo obrigatório' })).toBe(false)
  })
})
