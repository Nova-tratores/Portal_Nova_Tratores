import { describe, expect, it } from 'vitest'
import { explicarErroOmie, explicarNfeSemDanfe } from './buscar-nota-erros'

describe('mensagens do "Buscar no Omie"', () => {
  it('traduz os erros comuns do Omie', () => {
    expect(explicarErroOmie('ERROR: Consumo redundante detectado', 'NFS-e').erro).toMatch(/pedido repetido/)
    expect(explicarErroOmie('Too Many Requests', 'NF-e').erro).toMatch(/muitas consultas/)
    expect(explicarErroOmie('fetch failed', 'NF-e').erro).toMatch(/falar com o Omie/)
    expect(explicarErroOmie('Pedido não cadastrado para o Código [123]', 'NF-e').erro).toMatch(/não encontrou a NF-e/)
    const outro = explicarErroOmie('SOAP-ERROR: xyz', 'NFS-e')
    expect(outro.erro).toMatch(/erro ao buscar a NFS-e/)
    expect(outro.tecnico).toBe('SOAP-ERROR: xyz')
  })

  it('explica NF-e sem DANFE (rejeitada × processando)', () => {
    const r = explicarNfeSemDanfe('Rejeitada', 'Rejeição 539: duplicidade de NF-e')
    expect(r.erro).toBe('A NF-e foi rejeitada pela SEFAZ: Rejeição 539: duplicidade de NF-e')
    expect(r.dica).toMatch(/reemita/)
    expect(explicarNfeSemDanfe('Denegada', '').erro).toMatch(/denegada/)
    expect(explicarNfeSemDanfe('', '').erro).toMatch(/ainda não tem o PDF/)
  })
})
