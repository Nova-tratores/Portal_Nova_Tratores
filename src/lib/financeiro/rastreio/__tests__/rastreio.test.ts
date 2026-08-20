import { describe, expect, it } from 'vitest'
import { acharChaveNFe, ehChaveNFeValida, partesChaveNFe } from '../../chave-nfe'
import {
  decodificarLinhaDigitavel, mesmoNumero, normalizarTermo, numeroCanonico, numeroNormalizado,
  slugContraparte, vencimentoDoFator,
} from '../normalizar'
import { agruparResultados, mapEmpresaOmie, requisicaoIdsDe, type DocsBrutos } from '../agrupar'

// chave sintática válida: cUF=35 (SP), AAMM=2608, CNPJ 14 díg, mod=55,
// serie=001, nNF=000012345, tpEmis=1, cNF=12345678, cDV=9
const CHAVE = '35' + '2608' + '12345678000199' + '55' + '001' + '000012345' + '1' + '12345678' + '9'

describe('chave-nfe', () => {
  it('valida cUF IBGE + modelo 55/65', () => {
    expect(CHAVE).toHaveLength(44)
    expect(ehChaveNFeValida(CHAVE)).toBe(true)
    expect(ehChaveNFeValida('99' + CHAVE.slice(2))).toBe(false) // cUF inválida
    expect(ehChaveNFeValida(CHAVE.slice(0, 20) + '54' + CHAVE.slice(22))).toBe(false) // modelo errado
  })
  it('acha a chave embutida em texto de DANFE', () => {
    expect(acharChaveNFe(`CHAVE DE ACESSO: ${CHAVE.replace(/(\d{4})/g, '$1 ')}`)).toBe(CHAVE)
    expect(acharChaveNFe('sem chave aqui 123')).toBe('')
  })
  it('decompõe cnpj do emitente e nNF', () => {
    const p = partesChaveNFe(CHAVE)
    expect(p.cnpjEmitente).toBe('12345678000199')
    expect(p.nNF).toBe('000012345')
    expect(p.serie).toBe('001')
  })
})

describe('normalizarTermo', () => {
  it('#123 e "req 123" viram requisicao_id', () => {
    expect(normalizarTermo('#123')).toMatchObject({ tipo: 'requisicao_id', requisicaoId: 123 })
    expect(normalizarTermo('req 456')).toMatchObject({ tipo: 'requisicao_id', requisicaoId: 456 })
    expect(normalizarTermo('REQ.#7')).toMatchObject({ tipo: 'requisicao_id', requisicaoId: 7 })
  })
  it('44 dígitos válidos viram chave (com nNF/CNPJ derivados)', () => {
    const t = normalizarTermo(CHAVE)
    expect(t.tipo).toBe('chave_nfe')
    expect(t.chaveNfe).toBe(CHAVE)
    expect(t.nNFDaChave).toBe('12345')
    expect(t.cnpjDaChave).toBe('12345678000199')
  })
  it('44 dígitos inválidos NÃO viram chave (caem em texto: 44 > 12)', () => {
    expect(normalizarTermo('9'.repeat(44)).tipo).toBe('texto')
  })
  it('nº com zeros à esquerda vira numero com numeroSemZeros', () => {
    const t = normalizarTermo('001234')
    expect(t.tipo).toBe('numero')
    expect(t.numeroSemZeros).toBe('1234')
  })
  it('texto vira texto', () => {
    expect(normalizarTermo('CASTRO PEÇAS LTDA').tipo).toBe('texto')
  })
})

describe('linha digitável', () => {
  it('47 dígitos: decodifica valor e vencimento (fator pós-rollover)', () => {
    // campo 5: fator 1000 (22/02/2025) + valor 0000150000 (R$ 1500,00)
    const linha = '0'.repeat(33) + '1000' + '0000150000'
    expect(linha).toHaveLength(47)
    const b = decodificarLinhaDigitavel(linha)!
    expect(b.valor).toBe(1500)
    expect(b.vencimento).toBe('2025-02-22')
  })
  it('fator antigo (pré-rollover) ainda resolve pra data plausível', () => {
    expect(vencimentoDoFator(9999)).toBe('2025-02-21')
    // 1500 cru daria 2001 → rollover soma um ciclo
    expect(vencimentoDoFator(1500)?.startsWith('20')).toBe(true)
    expect(Number(vencimentoDoFator(1500)!.slice(0, 4))).toBeGreaterThanOrEqual(2020)
  })
  it('normalizarTermo reconhece 47 díg como linha_digitavel', () => {
    const linha = '0'.repeat(33) + '1100' + '0000012345'
    expect(normalizarTermo(linha).tipo).toBe('linha_digitavel')
  })
})

describe('mesmoNumero / requisicaoIdsDe / mapEmpresaOmie', () => {
  it('zeros à esquerda e máscara não atrapalham', () => {
    expect(mesmoNumero('001234', '1234')).toBe(true)
    expect(mesmoNumero('NF 1.234', '1234')).toBe(true)
    expect(mesmoNumero('234', '1234')).toBe(false)
    expect(numeroNormalizado('000')).toBe('')
  })

  it('nº COMPOSTO do banco ("1384/1547") é encontrável por qualquer grafia', () => {
    // caso real de produção: Requisicao com numero_nota='1384/1547'
    expect(mesmoNumero('1384/1547', '1384')).toBe(true)
    expect(mesmoNumero('1384/1547', '1547')).toBe(true)
    expect(mesmoNumero('1384/1547', '1384/1547')).toBe(true)
    expect(mesmoNumero('1AA532734-3', '1AA532734-3')).toBe(true)
    // '13841547' NÃO é a mesma coisa que '1384'
    expect(mesmoNumero('13841547', '1384')).toBe(false)
    // e o termo pro ilike é UMA sequência (a maior), não a concatenação
    expect(normalizarTermo('1384/1547').numeroBusca).toBe('1384')
    expect(numeroCanonico('001384 / 1547')).toBe('1384/1547')
  })

  it('slug ignora sufixo jurídico e não trunca cedo', () => {
    expect(slugContraparte('AGRO PEÇAS LTDA')).toBe(slugContraparte('Agro Pecas'))
    expect(slugContraparte('AUTO PECAS SILVA LTDA')).not.toBe(slugContraparte('AUTO PECAS SOUZA ME'))
  })
  it('requisicao_ids (coluna) tem prioridade; fallback parseia #id do motivo', () => {
    expect(requisicaoIdsDe({ requisicao_ids: [12, 34], motivo: '#99', is_requisicao: true })).toEqual([12, 34])
    expect(requisicaoIdsDe({ motivo: '#123 almoço, #124 pedágio', is_requisicao: true })).toEqual([123, 124])
    expect(requisicaoIdsDe({ motivo: '#123', is_requisicao: false })).toEqual([])
    // #1234 não pode casar busca por #123 (regex com \b + comparação exata)
    expect(requisicaoIdsDe({ motivo: '#1234 x', is_requisicao: true })).toEqual([1234])
  })
  it('mapeia empresa dos vários vocabulários', () => {
    expect(mapEmpresaOmie('Nova Tratores')).toBe('NOVA')
    expect(mapEmpresaOmie('Castro Peças')).toBe('CASTRO')
    expect(mapEmpresaOmie('CASTRO')).toBe('CASTRO')
    expect(mapEmpresaOmie('')).toBeNull()
  })
})

describe('agruparResultados', () => {
  const termo = normalizarTermo('1234')
  const vazio: DocsBrutos = {
    contaPagar: [], requisicoes: [], chamadosReceber: [], nfEntrada: [], nfSaida: [], titulosOmie: [], pastaCliente: [],
  }

  it('mesmo nº com fornecedores diferentes = fichas SEPARADAS (docKeys únicos)', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [
        { id: 1, numero_NF: '1234', fornecedor: 'ALFA COMERCIAL', valor: 10 },
        { id: 2, numero_NF: '001234', fornecedor: 'BETA DISTRIBUIDORA', valor: 20 },
      ],
    }, [], termo)
    expect(r.fichas).toHaveLength(2)
    expect(new Set(r.fichas.map((f) => f.docKey)).size).toBe(2)
  })

  it('docKey não colide quando fichas distintas têm mesmo nº e contraparte vazia', () => {
    const r = agruparResultados({
      ...vazio,
      titulosOmie: [
        { tipo: 'pagar', codigo_lancamento: 1, numero_documento_fiscal: '1234' },
        { tipo: 'pagar', codigo_lancamento: 2, numero_documento_fiscal: '1234' },
      ],
    }, [], termo)
    expect(r.fichas).toHaveLength(2)
    expect(new Set(r.fichas.map((f) => f.docKey)).size).toBe(2)
  })

  it('conta com CNPJ (XML) UNE com requisição que só tem o nome do fornecedor', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '555', fornecedor: 'AGRO PEÇAS', nfe_cnpj_emitente: '04111222000155', valor: 10 }],
      requisicoes: [{ id: 9, numero_nota: '555', fornecedor: 'AGRO PECAS LTDA', titulo: 'x' }],
    }, [], termo)
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0].secoes.requisicoes).toHaveLength(1)
  })

  it('chave NF-e une conta a pagar e NF de saída', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '99', fornecedor: 'X', nfe_chave: CHAVE, valor: 10 }],
      nfSaida: [{ n_cod_nf: 7, numero: '12345', chave_nfe: CHAVE, cliente_nome: 'Y', valor_nf: 10 }],
    }, [], termo)
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0].chaveNfe).toBe(CHAVE)
  })

  it('aresta fp↔req via requisicao_ids une mesmo sem número na requisição', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '1234', fornecedor: 'ALFA', requisicao_ids: [55], is_requisicao: true, valor: 10 }],
      requisicoes: [{ id: 55, numero_nota: '', fornecedor: 'OUTRO NOME', titulo: 'peça' }],
    }, [], termo)
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0].secoes.requisicoes).toHaveLength(1)
  })

  it('fallback do motivo também une (linhas antigas)', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '1234', fornecedor: 'ALFA', motivo: '#55 almoço', is_requisicao: true, valor: 10 }],
      requisicoes: [{ id: 55, numero_nota: '', fornecedor: '', titulo: 'almoço' }],
    }, [], termo)
    expect(r.fichas).toHaveLength(1)
  })

  it('vínculo manual liga fichas que o matching separou', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '1234', fornecedor: 'ALFA LTDA', valor: 10 }],
      requisicoes: [{ id: 9, numero_nota: '777', fornecedor: 'GRAFIA DIFERENTE', titulo: 'x' }],
    }, [{ id: 1, tipo_a: 'finan_pagar', id_a: '1', tipo_b: 'requisicao', id_b: '9', tipo_vinculo: 'liga', criado_por_nome: 'V' }], termo)
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0].vinculoManual).toBe(true)
    expect(r.fichas[0].vinculos).toHaveLength(1)
  })

  it('título Omie entra por aresta (omie_cod_lancamento CSV), nunca por número solto', () => {
    const r = agruparResultados({
      ...vazio,
      contaPagar: [{ id: 1, numero_NF: '1234', fornecedor: 'ALFA', omie_cod_lancamento: '111, 222', valor: 10 }],
      titulosOmie: [
        { tipo: 'pagar', codigo_lancamento: 222, numero_documento_fiscal: '1234', numero_boleto: 'B1' },
        { tipo: 'pagar', codigo_lancamento: 999, numero_documento_fiscal: '1234', numero_boleto: 'B2' },
      ],
    }, [], termo)
    const comFp = r.fichas.find((f) => f.secoes.contaPagar.length > 0)!
    expect(comFp.secoes.titulosOmie.map((t: { codigo_lancamento: number }) => t.codigo_lancamento)).toEqual([222])
  })
})
