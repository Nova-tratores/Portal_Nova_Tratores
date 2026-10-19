import { describe, it, expect } from 'vitest'
import { agendaPorTecnico, diasDoIntervalo, lerAnalise, listaDiasUteis } from '../analise'

describe('análise do Tratorilson', () => {
  it('dias úteis e dias de um intervalo da agenda', () => {
    expect(listaDiasUteis('2026-10-16', '2026-10-20')).toEqual(['2026-10-16', '2026-10-19', '2026-10-20'])
    // OS de dia inteiro 19 e 20 (fim exclusivo 21 00:00)
    expect(diasDoIntervalo('2026-10-19T00:00:00-03:00', '2026-10-21T00:00:00-03:00', true)).toEqual(['2026-10-19', '2026-10-20'])
    // Lousa de tarde
    expect(diasDoIntervalo('2026-10-19T13:00:00-03:00', '2026-10-19T18:00:00-03:00', false)).toEqual(['2026-10-19'])
  })

  it('agenda por técnico: ocupados, livres e quem não tem nada aparece', () => {
    const r = agendaPorTecnico([
      { pessoas: ['Ana'], dias: ['2026-10-19', '2026-10-20'], fonte: 'os', titulo: 'OS-1 · Fazenda' },
      { pessoas: ['Ana', 'Bia'], dias: ['2026-10-21'], fonte: 'lousa', titulo: 'Revisão' },
    ], ['Ana', 'Bia', 'Caio'], '2026-10-19', '2026-10-23')
    const ana = r.find((x) => x.tecnico === 'Ana')!
    expect(ana).toMatchObject({ diasUteis: 5, diasOcupados: 3, livres: ['2026-10-22', '2026-10-23'] })
    expect(ana.servicos.map((s) => s.titulo)).toEqual(['OS-1 · Fazenda', 'Revisão'])
    expect(r.find((x) => x.tecnico === 'Caio')!.livres).toHaveLength(5)
    expect(r[0].tecnico).toBe('Ana')
  })

  it('lê o JSON da IA mesmo com texto em volta e campos faltando', () => {
    const a = lerAnalise('Segue:\n{"resumo":"Semana boa","destaques":[{"titulo":"Horas","texto":"subiu","tipo":"xx"}],"acoes":[{"oque":"Falar com o Gabriel"}]}')!
    expect(a.resumo).toBe('Semana boa')
    expect(a.destaques[0].tipo).toBe('atencao')
    expect(a.acoes[0]).toEqual({ oque: 'Falar com o Gabriel', quem: '', quando: '', porque: '', prioridade: 'media' })
    expect(a.proximosDias.alertas).toEqual([])
    expect(lerAnalise('não sei')).toBeNull()
  })
})

describe('manchete e conexões', () => {
  it('lê situação e conexões; sem manchete usa a 1ª frase do resumo', () => {
    const a = lerAnalise('{"situacao":"critico","resumo":"Mês fraco. Muita hora parada.","conexoes":[{"titulo":"Velocidade","texto":"km alto e multas"}]}')!
    expect(a.situacao).toBe('critico')
    expect(a.manchete).toBe('Mês fraco.')
    expect(a.conexoes).toEqual([{ titulo: 'Velocidade', texto: 'km alto e multas' }])
    expect(lerAnalise('{"situacao":"x","resumo":"ok"}')!.situacao).toBe('atencao')
  })
})

describe('dicas por técnico e prioridade', () => {
  it('lê pontos fortes, dicas, conversa e ordena ações por prioridade', () => {
    const a = lerAnalise('{"resumo":"x","porTecnico":[{"tecnico":"Ana","situacao":"critico","pontosFortes":["rápida"],"atencao":["não aponta horas"],"dicas":["d1","d2"],"conversa":"Ana, vi que…"}],"acoes":[{"oque":"b","prioridade":"baixa"},{"oque":"a","prioridade":"alta"}]}')!
    expect(a.porTecnico[0]).toMatchObject({ situacao: 'critico', pontosFortes: ['rápida'], atencao: ['não aponta horas'], dicas: ['d1', 'd2'], conversa: 'Ana, vi que…' })
    expect(a.acoes.map((x) => x.oque)).toEqual(['a', 'b'])
  })
})
