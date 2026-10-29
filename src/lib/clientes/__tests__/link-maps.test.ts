import { describe, it, expect } from 'vitest'
import { coordenadaDoTexto, ehLinkCurto, hostPermitido } from '../link-maps'

describe('coordenada do link do Google Maps', () => {
  it('prefere o ponto do lugar (!3d!4d) ao centro da tela (@)', () => {
    expect(coordenadaDoTexto('https://www.google.com/maps/place/Faz+Sta+Luzia/@-23.19,-49.38,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-23.1912345!4d-49.3801234'))
      .toEqual({ lat: -23.1912345, lng: -49.3801234 })
  })
  it('lê @lat,lng', () => expect(coordenadaDoTexto('https://www.google.com/maps/@-23.2,-49.37,15z')).toEqual({ lat: -23.2, lng: -49.37 }))
  it('lê ?q= e ll=', () => {
    expect(coordenadaDoTexto('https://maps.google.com/?q=-23.2001,-49.3702')).toEqual({ lat: -23.2001, lng: -49.3702 })
    expect(coordenadaDoTexto('https://maps.google.com/maps?ll=-22.5,-48.1&z=12')).toEqual({ lat: -22.5, lng: -48.1 })
  })
  it('lê /place/lat,lng com %2C', () => expect(coordenadaDoTexto('https://www.google.com/maps/place/-23.19%2C-49.38')).toEqual({ lat: -23.19, lng: -49.38 }))
  it('aceita a coordenada colada direto', () => {
    expect(coordenadaDoTexto('-23.19123, -49.38012')).toEqual({ lat: -23.19123, lng: -49.38012 })
    expect(coordenadaDoTexto(' -23.19 -49.38 ')).toEqual({ lat: -23.19, lng: -49.38 })
  })
  it('recusa o que não é coordenada', () => {
    expect(coordenadaDoTexto('https://www.google.com/maps/place/Piraju')).toBeNull()
    expect(coordenadaDoTexto('0,0')).toBeNull()
    expect(coordenadaDoTexto('123,456')).toBeNull()
    expect(coordenadaDoTexto('')).toBeNull()
  })
  it('reconhece link curto e só segue hosts do Google', () => {
    expect(ehLinkCurto('https://maps.app.goo.gl/AbC123')).toBe(true)
    expect(ehLinkCurto('https://www.google.com/maps/@-23,-49,15z')).toBe(false)
    expect(hostPermitido('https://maps.app.goo.gl/x')).toBe(true)
    expect(hostPermitido('https://exemplo.com/maps')).toBe(false)
  })
})
