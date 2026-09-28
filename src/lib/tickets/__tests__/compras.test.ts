import { describe, it, expect } from 'vitest'
import {
  SC_TRANSICOES, SC_ETAPA_INFO, SC_ETAPAS_ATIVAS, SC_ETAPAS_FINAIS,
  pessoaDoPapel, podeExecutar, proximoResponsavel,
  validarNovaSC, margemPrevista, agruparModelos, rotuloModelo, motivosDoDestino, SC_MOTIVOS,
  type ConfigCompras, type ScEtapa, type ScAcao,
} from '../compras'
import { STATUS_FINAIS } from '../constantes'

const VENDEDOR = 'u-vendedor'
const config: ConfigCompras = {
  diretoria_id: 'u-diretoria',
  financeiro_id: 'u-financeiro',
  comprador_id: 'u-comprador',
  valor_limite_bloqueio: null,
  qtd_excesso_estoque: null,
}
const semConfig: ConfigCompras = {
  diretoria_id: null, financeiro_id: null, comprador_id: null,
  valor_limite_bloqueio: null, qtd_excesso_estoque: null,
}

const transicao = (etapa: ScEtapa, acao: ScAcao) => {
  const t = SC_TRANSICOES[etapa].find((x) => x.acao === acao)
  if (!t) throw new Error(`sem transição ${etapa}/${acao}`)
  return t
}
const usuario = (userId: string) => ({ userId, isAdmin: false })

describe('SC_TRANSICOES — o trilho', () => {
  it('caminho feliz: diretoria → financeiro → comprador → concluída', () => {
    expect(transicao('diretoria', 'alterar_qtd').para).toBe('financeiro')
    expect(transicao('financeiro', 'aprovar').para).toBe('comprador')
    expect(transicao('comprador', 'emitir_pc').para).toBe('concluida')
  })

  it('devoluções voltam exatamente uma etapa', () => {
    expect(transicao('diretoria', 'devolver').para).toBe('vendedor')
    expect(transicao('financeiro', 'reprovar').para).toBe('diretoria')
    expect(transicao('comprador', 'devolver').para).toBe('financeiro')
    expect(transicao('vendedor', 'reenviar').para).toBe('diretoria')
  })

  it('etapas terminais não têm saída', () => {
    for (const e of SC_ETAPAS_FINAIS) expect(SC_TRANSICOES[e]).toEqual([])
  })

  it('toda etapa não terminal permite cancelar, e só o solicitante cancela', () => {
    for (const e of [...SC_ETAPAS_ATIVAS, 'vendedor'] as ScEtapa[]) {
      const c = transicao(e, 'cancelar')
      expect(c.para).toBe('cancelada')
      expect(c.papel).toBe('solicitante')
    }
  })

  it('toda decisão de alçada exige texto (fica na timeline)', () => {
    for (const e of SC_ETAPAS_ATIVAS) {
      for (const t of SC_TRANSICOES[e]) {
        if (t.acao !== 'cancelar') expect(t.exigeTexto, `${e}/${t.acao}`).toBe(true)
      }
    }
  })

  it('não há ação repetida na mesma etapa e todo destino é uma etapa conhecida', () => {
    for (const [etapa, lista] of Object.entries(SC_TRANSICOES)) {
      const acoes = lista.map((t) => t.acao)
      expect(new Set(acoes).size, etapa).toBe(acoes.length)
      for (const t of lista) expect(SC_ETAPA_INFO[t.para], `${etapa}/${t.acao}`).toBeDefined()
    }
  })
})

describe('SC_ETAPA_INFO — projeção no status genérico', () => {
  it('etapas em andamento ficam fora dos status finais', () => {
    for (const e of [...SC_ETAPAS_ATIVAS, 'vendedor'] as ScEtapa[]) {
      expect(STATUS_FINAIS).not.toContain(SC_ETAPA_INFO[e].status)
    }
  })

  it('nenhuma etapa vira "resolvido" (o cron de auto-fechar não pode pegar SC)', () => {
    for (const info of Object.values(SC_ETAPA_INFO)) expect(info.status).not.toBe('resolvido')
  })

  it('terminais projetam em fechado/cancelado', () => {
    expect(SC_ETAPA_INFO.concluida.status).toBe('fechado')
    expect(SC_ETAPA_INFO.cancelada.status).toBe('cancelado')
  })
})

describe('podeExecutar', () => {
  it('só a pessoa fixa da etapa executa a ação da alçada', () => {
    const t = transicao('financeiro', 'aprovar')
    expect(podeExecutar(t, usuario('u-financeiro'), config, VENDEDOR)).toBe(true)
    expect(podeExecutar(t, usuario('u-diretoria'), config, VENDEDOR)).toBe(false)
    expect(podeExecutar(t, usuario('u-comprador'), config, VENDEDOR)).toBe(false)
    expect(podeExecutar(t, usuario(VENDEDOR), config, VENDEDOR)).toBe(false)
  })

  it('o vendedor não aprova a própria solicitação em nenhuma alçada', () => {
    for (const e of SC_ETAPAS_ATIVAS) {
      for (const t of SC_TRANSICOES[e]) {
        if (t.papel !== 'solicitante') {
          expect(podeExecutar(t, usuario(VENDEDOR), config, VENDEDOR), `${e}/${t.acao}`).toBe(false)
        }
      }
    }
  })

  it('cancelar e reenviar são do solicitante, não das alçadas', () => {
    const cancelar = transicao('financeiro', 'cancelar')
    expect(podeExecutar(cancelar, usuario(VENDEDOR), config, VENDEDOR)).toBe(true)
    expect(podeExecutar(cancelar, usuario('u-financeiro'), config, VENDEDOR)).toBe(false)
    expect(podeExecutar(transicao('vendedor', 'reenviar'), usuario(VENDEDOR), config, VENDEDOR)).toBe(true)
  })

  it('admin executa qualquer transição', () => {
    const adm = { userId: 'u-admin', isAdmin: true }
    for (const lista of Object.values(SC_TRANSICOES)) {
      for (const t of lista) expect(podeExecutar(t, adm, config, VENDEDOR)).toBe(true)
    }
  })

  it('papel sem pessoa designada não libera ninguém (nem usuário com id vazio)', () => {
    const t = transicao('diretoria', 'alterar_qtd')
    expect(podeExecutar(t, usuario('u-diretoria'), semConfig, VENDEDOR)).toBe(false)
    expect(podeExecutar(t, usuario(''), semConfig, VENDEDOR)).toBe(false)
  })
})

describe('proximoResponsavel — com quem fica a bola', () => {
  it('etapa de alçada → pessoa fixa do papel', () => {
    expect(proximoResponsavel('diretoria', config, VENDEDOR)).toBe('u-diretoria')
    expect(proximoResponsavel('financeiro', config, VENDEDOR)).toBe('u-financeiro')
    expect(proximoResponsavel('comprador', config, VENDEDOR)).toBe('u-comprador')
  })

  it('devolvida ao vendedor e terminais → solicitante', () => {
    for (const e of ['vendedor', 'concluida', 'cancelada'] as ScEtapa[]) {
      expect(proximoResponsavel(e, config, VENDEDOR)).toBe(VENDEDOR)
    }
  })

  it('papel não designado cai no solicitante (responsavel_id é NOT NULL)', () => {
    expect(proximoResponsavel('financeiro', semConfig, VENDEDOR)).toBe(VENDEDOR)
  })
})

describe('validarNovaSC', () => {
  const base = {
    produto: 'Trator Novo MAHINDRA 6075', marca: 'MAHINDRA', modelo: '6075',
    quantidade_solicitada: '2', preco_alvo: '180000', preco_venda_previsto: '215000',
    destino: 'cliente', cliente_destino: 'Fazenda Boa Vista', confianca: 'morno',
    motivo: 'negociacao', descricao: 'Cliente pediu entrega em 30 dias',
  }
  const erroDe = (b: Record<string, unknown>) => {
    const r = validarNovaSC(b)
    return 'erro' in r ? r.erro : null
  }
  const dadosDe = (b: Record<string, unknown>) => {
    const r = validarNovaSC(b)
    if ('erro' in r) throw new Error(r.erro)
    return r.dados
  }

  it('aceita o caso completo e converte os números', () => {
    const d = dadosDe(base)
    expect(d.payload).toMatchObject({
      produto: 'Trator Novo MAHINDRA 6075', marca: 'MAHINDRA', modelo: '6075',
      quantidade_solicitada: 2, preco_alvo: 180000, preco_venda_previsto: 215000,
      destino: 'cliente', cliente_destino: 'Fazenda Boa Vista', confianca: 'morno', motivo: 'negociacao',
    })
    expect(d.titulo).toBe('SC — Trator Novo MAHINDRA 6075')
    expect(d.descricao).toBe('Negociação avançada com o cliente — Cliente pediu entrega em 30 dias')
  })

  it('compra para estoque dispensa cliente, pedido de venda e confiança — e descarta os que vierem', () => {
    const d = dadosDe({ ...base, destino: 'estoque', motivo: 'reposicao_estoque', pv_numero: '123' })
    expect(d.payload.destino).toBe('estoque')
    expect(d.payload.cliente_destino).toBeUndefined()
    expect(d.payload.confianca).toBeUndefined()
    expect(d.payload.pv_numero).toBeUndefined()
  })

  it('com cliente definido, exige cliente e confiança', () => {
    expect(erroDe({ ...base, cliente_destino: ' ' })).toMatch(/cliente destino/)
    expect(erroDe({ ...base, confianca: '' })).toMatch(/confiança/)
    expect(erroDe({ ...base, confianca: 'fervendo' })).toMatch(/confiança/)
  })

  it('pedido de venda só é obrigatório em venda fechada', () => {
    expect(erroDe({ ...base, pv_numero: '' })).toBeNull()
    expect(erroDe({ ...base, motivo: 'venda_fechada', pv_numero: '' })).toMatch(/pedido de venda/)
    expect(dadosDe({ ...base, motivo: 'venda_fechada', pv_numero: '4512' }).payload.pv_numero).toBe('4512')
  })

  it('motivo é obrigatório e precisa valer para o destino', () => {
    expect(erroDe({ ...base, motivo: '' })).toMatch(/motivo/)
    expect(erroDe({ ...base, motivo: 'inventado' })).toMatch(/motivo/)
    expect(erroDe({ ...base, motivo: 'reposicao_estoque' })).toMatch(/não se aplica/)
    expect(erroDe({ ...base, destino: 'estoque', motivo: 'venda_fechada' })).toMatch(/não se aplica/)
  })

  it('complemento só é obrigatório em "outro"; sem ele a origem é o motivo', () => {
    expect(dadosDe({ ...base, descricao: '' }).descricao).toBe('Negociação avançada com o cliente')
    expect(erroDe({ ...base, motivo: 'outro', descricao: '' })).toMatch(/Descreva/)
  })

  it('preços são opcionais, mas não aceitam lixo nem negativo', () => {
    const d = dadosDe({ ...base, preco_alvo: '', preco_venda_previsto: undefined })
    expect(d.payload.preco_alvo).toBeUndefined()
    expect(d.payload.preco_venda_previsto).toBeUndefined()
    expect(erroDe({ ...base, preco_alvo: 'abc' })).toMatch(/Custo-alvo/)
    expect(erroDe({ ...base, preco_venda_previsto: -1 })).toMatch(/venda/)
  })

  it('produto e quantidade são obrigatórios', () => {
    expect(erroDe({ ...base, produto: '  ' })).toMatch(/produto/)
    expect(erroDe({ ...base, quantidade_solicitada: 0 })).toMatch(/quantidade/)
    expect(erroDe({ ...base, quantidade_solicitada: 'x' })).toMatch(/quantidade/)
  })

  it('todo destino tem motivos, e "outro" vale para os dois', () => {
    for (const d of ['cliente', 'estoque'] as const) {
      const ids = motivosDoDestino(d).map((m) => m.id)
      expect(ids.length).toBeGreaterThan(1)
      expect(ids).toContain('outro')
    }
    expect(new Set(SC_MOTIVOS.map((m) => m.id)).size).toBe(SC_MOTIVOS.length)
  })
})

describe('margemPrevista', () => {
  it('venda − custo, com percentual sobre a venda', () => {
    expect(margemPrevista(180000, 200000)).toEqual({ valor: 20000, pct: 10 })
  })
  it('margem negativa aparece como negativa', () => {
    expect(margemPrevista(200000, 180000)?.valor).toBe(-20000)
  })
  it('sem um dos valores não há margem; venda zero não divide', () => {
    expect(margemPrevista(undefined, 100)).toBeNull()
    expect(margemPrevista(100, null)).toBeNull()
    expect(margemPrevista(100, 0)).toEqual({ valor: -100, pct: null })
  })
})

describe('agruparModelos', () => {
  const linhas = [
    { codigo: 'CH1', marca: 'MAHINDRA', modelo: '6075', familia_nome: 'Trator Novo', estoque: 1 },
    { codigo: 'CH2', marca: 'Mahindra', modelo: '6075 ', familia_nome: 'Trator Novo', estoque: 0 },
    { codigo: 'CH3', marca: 'MAHINDRA', modelo: '6075', familia_nome: 'Trator Novo', estoque: -1 },
    { codigo: 'CH4', marca: 'MAHINDRA', modelo: '9500S', familia_nome: 'Trator Novo', estoque: '2' },
    { codigo: 'P1', marca: '', modelo: null, familia_nome: 'Trator Novo', estoque: 1 },
  ]

  it('junta os chassis do mesmo modelo, ignorando caixa e espaços', () => {
    const r = agruparModelos(linhas)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ modelo: '6075', unidades: 3, em_estoque: 1 })
    expect(r[1]).toMatchObject({ modelo: '9500S', unidades: 1, em_estoque: 2 })
  })

  it('estoque negativo não abate o disponível e linha sem modelo fica de fora', () => {
    const r = agruparModelos(linhas)
    expect(r.reduce((s, m) => s + m.unidades, 0)).toBe(4)
    expect(r.every((m) => m.em_estoque >= 0)).toBe(true)
  })

  it('rótulo = família + marca + modelo, sem sobras quando falta parte', () => {
    expect(rotuloModelo({ familia: 'Trator Novo', marca: 'MAHINDRA', modelo: '6075' })).toBe('Trator Novo MAHINDRA 6075')
    expect(rotuloModelo({ familia: '', marca: '', modelo: '6075' })).toBe('6075')
  })
})

describe('pessoaDoPapel', () => {
  it('devolve a pessoa de cada papel', () => {
    expect(pessoaDoPapel(config, 'diretoria')).toBe('u-diretoria')
    expect(pessoaDoPapel(config, 'financeiro')).toBe('u-financeiro')
    expect(pessoaDoPapel(config, 'comprador')).toBe('u-comprador')
    expect(pessoaDoPapel(semConfig, 'comprador')).toBeNull()
  })
})
