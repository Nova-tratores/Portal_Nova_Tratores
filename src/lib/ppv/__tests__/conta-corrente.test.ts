import { describe, expect, it } from 'vitest'
import { resolverContaCorrente, resolverDepartamentos } from '../conta-corrente'

// contas reais da Castro (ListarContasCorrentes, 13/10/2026)
const CASTRO = [
  { nCodCC: 5154400792, descricao: 'Caixinha' },
  { nCodCC: 5335855842, descricao: 'Banco do Brasil' },
  { nCodCC: 5335869121, descricao: 'Bradesco' },
  { nCodCC: 6013467194, descricao: 'Itaú Unibanco' },
  { nCodCC: 5429444829, descricao: 'Omie.CASH (Boletos)', inativo: true },
]

describe('conta corrente na empresa de destino', () => {
  it('mantém o código que já é da empresa', () => {
    expect(resolverContaCorrente({ escolhido: 5335869121, descricaoEscolhido: 'Bradesco', contasDestino: CASTRO, padrao: 5335855842 }))
      .toEqual({ codigo: 5335869121, trocada: false, motivo: null })
  })
  it('troca a conta da Nova pela de mesmo nome na Castro (acento não importa)', () => {
    expect(resolverContaCorrente({ escolhido: 1969919780, descricaoEscolhido: 'Banco do Brasil', contasDestino: CASTRO, padrao: 5335855842 }).codigo).toBe(5335855842)
    expect(resolverContaCorrente({ escolhido: 2506155996, descricaoEscolhido: 'Itau Unibanco', contasDestino: CASTRO, padrao: 5335855842 }).codigo).toBe(6013467194)
  })
  it('sem equivalente (INTERNO) usa a padrão; inativa não conta', () => {
    const r = resolverContaCorrente({ escolhido: 2041409931, descricaoEscolhido: 'INTERNO', contasDestino: CASTRO, padrao: 5335855842 })
    expect(r).toMatchObject({ codigo: 5335855842, trocada: true })
    expect(resolverContaCorrente({ escolhido: 1, descricaoEscolhido: 'Omie.CASH (Boletos)', contasDestino: CASTRO, padrao: 5335855842 }).codigo).toBe(5335855842)
  })
  it('sem escolha: a padrão', () => {
    expect(resolverContaCorrente({ escolhido: null, descricaoEscolhido: null, contasDestino: CASTRO, padrao: 5335855842 }).codigo).toBe(5335855842)
  })
})

describe('departamentos na empresa de destino', () => {
  const CASTRO_DEP = [
    { codigo: '5432937512', descricao: '08. Comercial Peças' },
    { codigo: '5432937631', descricao: '01. #Serviços em Tratores' },
    { codigo: '5432937861', descricao: 'Comercial (Sem Especificação)', inativo: true },
  ]
  const NOMES = { '111': '08. Comercial Pecas', '222': '01. #Serviços em Tratores', '333': 'Locação' }
  it('troca pelo de mesmo nome', () => {
    expect(resolverDepartamentos([{ codigo: '111', perc: 60 }, { codigo: '222', perc: 40 }], NOMES, CASTRO_DEP))
      .toEqual({ deps: [{ codigo: '5432937512', perc: 60 }, { codigo: '5432937631', perc: 40 }], aviso: null })
  })
  it('sem equivalente: soma no primeiro (fecha 100%)', () => {
    const r = resolverDepartamentos([{ codigo: '111', perc: 70 }, { codigo: '333', perc: 30 }], NOMES, CASTRO_DEP)
    expect(r.deps).toEqual([{ codigo: '5432937512', perc: 100 }])
    expect(r.aviso).toMatch(/Locação/)
  })
  it('marketing: casa sem o número e o prefixo', () => {
    expect(resolverDepartamentos([{ codigo: '444', perc: 100 }], { '444': '11. Marketing_Eventos' }, [{ codigo: '5432938546', descricao: 'Eventos' }]).deps)
      .toEqual([{ codigo: '5432938546', perc: 100 }])
  })
  it('nenhum casou: vai sem distribuição', () => {
    expect(resolverDepartamentos([{ codigo: '333', perc: 100 }], NOMES, CASTRO_DEP).deps).toEqual([])
  })
})
