import { describe, it, expect } from 'vitest'
import { numeroNfDoLink, numeroNfse, contaOmieDaEmpresa, chaveOS } from './numero-nf'
import { numeroNfDoTextoDanfe } from './numero-nf-pdf'

describe('numeroNfDoLink', () => {
  it('lê o número do DANFE copiado pro storage', () => {
    expect(numeroNfDoLink('https://x.supabase.co/storage/v1/object/public/clientes-docs/Nova_Tratores/pv_7552/danfe_00008399.pdf')).toBe('00008399')
  })
  it('lê o nNF da chave de acesso no link do CDN da Omie', () => {
    const link = 'https://cdn.omie.com.br/repository/bf3/642/35260623268241000111550010000090831373218726.pdf?response-content-type=application%2Fpdf&Signature=abc'
    expect(numeroNfDoLink(link)).toBe('00009083')
  })
  it('link sem número conhecido ou vazio → null', () => {
    expect(numeroNfDoLink('https://connect.omie.com.br/nfse?codigo=30HVKUCWR')).toBeNull()
    expect(numeroNfDoLink(null)).toBeNull()
    expect(numeroNfDoLink('')).toBeNull()
  })
})

describe('numeroNfDoTextoDanfe', () => {
  it('tira o nº da chave de acesso no texto da DANFE', () => {
    const txt = 'NF-e  Nº 8.398 Série 1 ... CHAVE DE ACESSO 3526 1031 4631 3900 0103 5500 1000 0083 9810 1978 8949'
    expect(numeroNfDoTextoDanfe(txt)).toBe('00008398')
  })
  it('sem chave, usa o "Nº 8.031 Série"', () => {
    expect(numeroNfDoTextoDanfe('DANFE NF-e Nº 8.031 Série 1')).toBe('00008031')
  })
  it('texto sem nota → null', () => {
    expect(numeroNfDoTextoDanfe('recibo de serviço')).toBeNull()
  })
})

describe('numeroNfse / contaOmieDaEmpresa / chaveOS', () => {
  it('tira os zeros à esquerda da NFS-e', () => {
    expect(numeroNfse('0000000000064')).toBe('64')
    expect(numeroNfse('')).toBeNull()
    expect(numeroNfse(null)).toBeNull()
  })
  it('mapeia a empresa pra conta do cache', () => {
    expect(contaOmieDaEmpresa('Nova Tratores')).toBe('NOVA')
    expect(contaOmieDaEmpresa('Castro Pecas')).toBe('CASTRO')
  })
  it('normaliza o número da OS', () => {
    expect(chaveOS('005250')).toBe('5250')
    expect(chaveOS(5250)).toBe('5250')
  })
})
