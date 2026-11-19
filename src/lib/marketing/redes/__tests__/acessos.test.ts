import { describe, expect, it } from 'vitest'
import { montarVisitas, nomeOrigem, resumir, type EventoSite } from '../acessos'

const ev = (o: Partial<EventoSite>): EventoSite => ({
  em: '2026-11-10T12:00:00Z', tipo: 'pagina', visitante: 'v1', sessao: 's1', caminho: '/', ...o,
})

describe('nomeOrigem', () => {
  it('traduz os mais comuns', () => {
    expect(nomeOrigem('https://www.google.com/')).toBe('Google')
    expect(nomeOrigem('https://l.instagram.com/x')).toBe('Instagram')
    expect(nomeOrigem('')).toBe('Direto')
    expect(nomeOrigem('', 'google-ads')).toBe('Google (anúncio)')
    expect(nomeOrigem('https://agrolink.com.br/a')).toBe('agrolink.com.br')
  })
})

describe('montarVisitas', () => {
  const eventos: EventoSite[] = [
    ev({ em: '2026-11-10T12:00:00Z', origem: 'https://www.google.com/', aparelho: 'celular' }),
    ev({ em: '2026-11-10T12:00:40Z', tipo: 'saida', tempo_s: 40, rolou: 60 }),
    ev({ em: '2026-11-10T12:00:41Z', caminho: '/credito/' }),
    ev({ em: '2026-11-10T12:02:00Z', tipo: 'clique', caminho: '/credito/', evento: 'clique_whatsapp' }),
    ev({ em: '2026-11-10T12:02:10Z', tipo: 'saida', caminho: '/credito/', tempo_s: 89, rolou: 100 }),
    ev({ em: '2026-11-10T13:00:00Z', sessao: 's2', visitante: 'v2' }),
  ]
  const visitas = montarVisitas(eventos)

  it('junta por sessão, em ordem, com tempo e rolagem por página', () => {
    const v = visitas.find((x) => x.sessao === 's1')!
    expect(v.paginas.map((p) => p.caminho)).toEqual(['/', '/credito/'])
    expect(v.paginas[0]).toMatchObject({ tempo_s: 40, rolou: 60 })
    expect(v.tempo_s).toBe(129)
    expect(v.origem).toBe('Google')
    expect(v.converteu).toBe(true)
    expect(v.saiuEm).toBe('/credito/')
  })

  it('resume: conversão, rejeição, saídas sem conversão', () => {
    const r = resumir(visitas)
    expect(r.visitas).toBe(2)
    expect(r.visitantes).toBe(2)
    expect(r.conversoes).toBe(1)
    expect(r.rejeicaoPct).toBe(0.5)
    expect(r.celularPct).toBe(0.5)
    expect(r.saidas[0]).toMatchObject({ caminho: '/', semConversao: 1 })
    expect(r.cliques).toEqual([{ evento: 'clique_whatsapp', total: 1 }])
  })

  it('ignora sessão sem página aberta', () => {
    expect(montarVisitas([ev({ tipo: 'clique', evento: 'x' })])).toEqual([])
  })
})

describe('contas novas (11/11)', () => {
  it('reconhece página de produto e o assunto do contato', async () => {
    const { produtoDaPagina, assuntoDoContato } = await import('../acessos')
    expect(produtoDaPagina('/trator-mahindra-6075/', 'Mahindra 6075 — Nova Tratores')).toEqual({ tipo: 'Trator', slug: 'trator-mahindra-6075', nome: 'Mahindra 6075' })
    expect(produtoDaPagina('/arado-fixo-af-tatu-marchesan/', null)?.tipo).toBe('Implemento')
    expect(produtoDaPagina('/credito/', 'Crédito')).toBeNull()
    expect(produtoDaPagina('/tratores/', 'Tratores')).toBeNull()
    expect(assuntoDoContato('pecas_whatsapp')).toBe('Peças')
    expect(assuntoDoContato('simulador_formulario')).toBe('Financiamento')
    expect(assuntoDoContato('busca_pecas')).toBeNull()
  })

  it('máquinas vistas, entrada, funil, hora e buscas sem resultado', () => {
    const vs = montarVisitas([
      ev({ em: '2026-11-10T23:30:00Z', caminho: '/' }), // 20h30 em Piraju, terça
      ev({ em: '2026-11-10T23:31:00Z', caminho: '/tratores/' }),
      ev({ em: '2026-11-10T23:31:30Z', tipo: 'clique', caminho: '/tratores/', evento: 'busca_sem_resultado_tratores', rotulo: 'Colhedora' }),
      ev({ em: '2026-11-10T23:32:00Z', caminho: '/trator-mahindra-6075/', titulo: 'Mahindra 6075 — Nova Tratores' }),
      ev({ em: '2026-11-10T23:33:00Z', tipo: 'clique', caminho: '/trator-mahindra-6075/', evento: 'clique_whatsapp' }),
      ev({ em: '2026-11-11T12:00:00Z', sessao: 's2', caminho: '/trator-mahindra-6075/', titulo: 'Mahindra 6075 — Nova Tratores', campanha: 'safra' }),
    ])
    const r = resumir(vs)
    expect(r.produtos[0]).toMatchObject({ nome: 'Mahindra 6075', visitas: 2, conversoes: 1 })
    expect(r.entradas.map((e) => e.caminho).sort()).toEqual(['/', '/trator-mahindra-6075/'])
    expect(r.funil).toEqual({ entraram: 2, viramMaquina: 2, viramPreco: 0, chamaram: 1 })
    expect(r.porHora[20].visitas).toBe(1)
    expect(r.porSemana[2]).toMatchObject({ dia: 'terça', visitas: 1, conversoes: 1 })
    expect(r.buscasSemResultado).toEqual([{ termo: 'colhedora', onde: 'Tratores', total: 1 }])
    expect(r.assuntos).toEqual([{ assunto: 'Comprar máquina (WhatsApp)', visitas: 1 }])
    expect(r.campanhas).toEqual([{ nome: 'safra', visitas: 1, conversoes: 0 }])
    expect(r.voltaram).toBe(1)
  })
})
