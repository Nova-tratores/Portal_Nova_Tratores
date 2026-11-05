import { describe, it, expect } from 'vitest'
import { reciboDoLink, numeroNfDoLink } from '../numero-nf'

describe('reciboDoLink', () => {
  it('lê o nº do recibo do PDF guardado na pasta', () => {
    expect(reciboDoLink('https://x.supabase.co/storage/v1/object/public/clientes-docs/Nova_Tratores/os_5410/recibo_345.pdf')).toBe('345')
  })
  it('não confunde com NFS-e, DANFE ou vazio', () => {
    expect(reciboDoLink('https://x.supabase.co/storage/v1/object/public/clientes-docs/Nova_Tratores/os_5410/nfse_64.pdf')).toBeNull()
    expect(reciboDoLink('https://x/pv_1/danfe_00008399.pdf')).toBeNull()
    expect(reciboDoLink('')).toBeNull()
    expect(reciboDoLink(null)).toBeNull()
    expect(numeroNfDoLink('https://x/os_1/recibo_345.pdf')).toBeNull()
  })
})
