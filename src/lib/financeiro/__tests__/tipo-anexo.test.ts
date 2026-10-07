import { describe, it, expect } from 'vitest'
import {
  campoDoRotulo, tipoPorNome, tipoPorTexto, avisoAnexoTrocado, avisosEnvio, semRepetidos,
} from '../tipo-anexo'

describe('campoDoRotulo', () => {
  it('reconhece os rótulos dos botões do financeiro', () => {
    expect(campoDoRotulo('NF PECA')).toBe('nf')
    expect(campoDoRotulo('NF SERVICO')).toBe('nf')
    expect(campoDoRotulo('Nota Fiscal')).toBe('nf')
    expect(campoDoRotulo('BOLETO 2')).toBe('boleto')
    expect(campoDoRotulo('ADICIONAR BOLETO 3')).toBe('boleto')
    expect(campoDoRotulo('Comprovante')).toBeNull()
  })
})

describe('tipoPorNome (nomes reais dos cards)', () => {
  it('boleto manda mesmo com NF no nome', () => {
    expect(tipoPorNome('BOLETO_NF_9347.pdf')).toBe('boleto')
    expect(tipoPorNome('Boleto_JOSECARLOSFERNANDES-NF_8249_NF_8256_NF_8363.pdf')).toBe('boleto')
  })
  it('DANFE e NFS-e são nota', () => {
    expect(tipoPorNome('danfe_00009347.pdf')).toBe('nf')
    expect(tipoPorNome('danfse_35388082231463139000103000000000003226093691386640_01.pdf')).toBe('nf')
    expect(tipoPorNome('NF 8256.pdf')).toBe('nf')
    expect(tipoPorNome('os-5334-nfserv-1790788284355.pdf')).toBe('nf')
  })
  it('nome sem pista não decide', () => {
    expect(tipoPorNome('scan001.pdf')).toBeNull()
    expect(tipoPorNome('documento.pdf')).toBeNull()
  })
})

describe('tipoPorTexto', () => {
  it('boleto pelo texto', () => {
    expect(tipoPorTexto('Local de pagamento ... Nosso Número 123 ... Recibo do Pagador')).toBe('boleto')
  })
  it('DANFE pelo texto', () => {
    expect(tipoPorTexto('DANFE Documento Auxiliar da Nota Fiscal Eletrônica Chave de acesso 3526...')).toBe('nf')
  })
  it('na dúvida não decide', () => {
    expect(tipoPorTexto('')).toBeNull()
    expect(tipoPorTexto('DANFE chave de acesso nosso número linha digitável')).toBeNull()
  })
})

describe('avisoAnexoTrocado', () => {
  it('avisa só quando o tipo detectado é o oposto do campo', () => {
    expect(avisoAnexoTrocado('nf', 'boleto', 'BOLETO_NF_1.pdf')).toMatch(/parece ser um BOLETO[\s\S]*campo de NOTA FISCAL/)
    expect(avisoAnexoTrocado('boleto', 'nf')).toMatch(/NOTA FISCAL[\s\S]*campo de BOLETO/)
    expect(avisoAnexoTrocado('nf', 'nf')).toBeNull()
    expect(avisoAnexoTrocado('nf', null)).toBeNull()
  })
})

describe('avisosEnvio', () => {
  const bol = { nome: 'Boleto_JOSE-NF_8249_NF_8363.pdf', hash: 'h1' }
  it('caso real #1330: o boleto anexado no campo da NF', () => {
    const av = avisosEnvio({ boletos: [bol], nfs: [{ ...bol }] }).map((a) => a.codigo)
    expect(av).toEqual(['nf_igual_boleto', 'sem_nf'])
  })
  it('card sem NF', () => {
    expect(avisosEnvio({ boletos: [bol], nfs: [] }).map((a) => a.codigo)).toEqual(['sem_nf'])
  })
  it('tudo certo não avisa', () => {
    expect(avisosEnvio({ boletos: [bol], nfs: [{ nome: 'danfe_00008363.pdf', hash: 'h2' }] })).toEqual([])
  })
  it('já enviado mostra o último envio', () => {
    const av = avisosEnvio({
      boletos: [bol], nfs: [{ nome: 'danfe_1.pdf', hash: 'h2' }],
      enviosAnteriores: [{ criado_em: '2026-10-05T17:49:06Z', destinatarios: 'a@b.com' }, { criado_em: '2026-10-05T17:50:22Z', destinatarios: 'a@b.com' }],
    })
    expect(av).toHaveLength(1)
    expect(av[0].codigo).toBe('ja_enviado')
    expect(av[0].mensagem).toContain('05/10')
    expect(av[0].mensagem).toContain('14:50')
  })
  it('nome de boleto no campo da NF (arquivo diferente)', () => {
    const av = avisosEnvio({ boletos: [bol], nfs: [{ nome: 'BOLETO_NF_9.pdf', hash: 'h9' }] }).map((a) => a.codigo)
    expect(av).toEqual(['nf_parece_boleto'])
  })
})

describe('semRepetidos', () => {
  it('mantém a primeira ocorrência de cada conteúdo', () => {
    expect(semRepetidos([{ hash: 'a', n: 1 }, { hash: 'b', n: 2 }, { hash: 'a', n: 3 }]).map((x) => x.n)).toEqual([1, 2])
  })
})
