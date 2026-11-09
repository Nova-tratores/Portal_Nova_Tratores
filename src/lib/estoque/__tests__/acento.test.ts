import { describe, expect, it } from 'vitest'
import { consertarAcento } from '../acento'

describe('consertarAcento (texto do Omie com codificação dobrada)', () => {
  it('desfaz as famílias quebradas achadas no banco', () => {
    expect(consertarAcento('PeÃ§as')).toBe('Peças')
    expect(consertarAcento('RoÃ§adeira')).toBe('Roçadeira')
    expect(consertarAcento('####RequisiÃ§Ã£o####')).toBe('####Requisição####')
    expect(consertarAcento('Agricultura de PrecisÃ£o')).toBe('Agricultura de Precisão')
    expect(consertarAcento('VagÃµes')).toBe('Vagões')
    expect(consertarAcento('VagÃ£o Misturador')).toBe('Vagão Misturador')
  })
  it('não mexe no que já está certo', () => {
    expect(consertarAcento('KIT REVISÃO')).toBe('KIT REVISÃO')
    expect(consertarAcento('Peças')).toBe('Peças')
    expect(consertarAcento('Trator Novo')).toBe('Trator Novo')
    expect(consertarAcento('')).toBe('')
    expect(consertarAcento(null)).toBe(null)
  })
})
