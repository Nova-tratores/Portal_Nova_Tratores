import { describe, it, expect } from 'vitest'
import {
  SC_TRANSICOES, SC_ETAPA_INFO, SC_ETAPAS_ATIVAS, SC_ETAPAS_FINAIS,
  pessoaDoPapel, podeExecutar, proximoResponsavel,
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

describe('pessoaDoPapel', () => {
  it('devolve a pessoa de cada papel', () => {
    expect(pessoaDoPapel(config, 'diretoria')).toBe('u-diretoria')
    expect(pessoaDoPapel(config, 'financeiro')).toBe('u-financeiro')
    expect(pessoaDoPapel(config, 'comprador')).toBe('u-comprador')
    expect(pessoaDoPapel(semConfig, 'comprador')).toBeNull()
  })
})
