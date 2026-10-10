import { describe, it, expect } from 'vitest'
import {
  ETAPA_INFO, podeMoverEtapa, etapaEfetiva, corteFechado, validarItem, validarResultado, validarPublicacao,
  sugestoesProximaReuniao, classificarPendencias, validarSaida, podeNovoPrazo, contaReprogramacao,
  validarSerie, secretarioDaVez, proximaDataDaSerie, textoWhatsApp, novaOrdem, somaTempo, avisoMesmaPessoa,
  podeConduzir, addDias, inicioISO,
  type ItemPauta, type AcaoDeReuniao,
} from '../regras'

const item = (p: Partial<ItemPauta> & { id: string }): ItemPauta => ({
  reuniao_id: 'r', ordem: 0, pergunta: 'P?', tipo: 'decidir', trazido_por: 'u1', tempo_min: 5, origem: 'manual',
  ticket_referencia_id: null, item_origem_id: null, urgente: false, resultado: null, decisao_texto: null, decisao_motivo: null,
  notas: null, criado_por: 'u1', criado_em: '2026-10-09T10:00:00Z', atualizado_em: '2026-10-09T10:00:00Z', ...p,
})
const acao = (p: Partial<AcaoDeReuniao> & { id: string }): AcaoDeReuniao => ({
  numero: 1, titulo: 'A', status: 'aberto', prazo: '2026-10-10', responsavel_id: 'u1', origem_reuniao_id: 'r',
  prazo_reprogramacoes: 0, resolvido_em: null, fechado_em: null, ...p,
})

describe('etapas (projeção e transições)', () => {
  it('projeta status como a SC', () => {
    expect(ETAPA_INFO.ata_publicada.status).toBe('resolvido')
    expect(ETAPA_INFO.cancelada.status).toBe('cancelado')
    expect(ETAPA_INFO.agendada.status).toBe('aberto')
  })
  it('transições válidas e inválidas', () => {
    expect(podeMoverEtapa('agendada', 'em_andamento')).toBe(true)   // sem corte formal
    expect(podeMoverEtapa('agendada', 'cancelada')).toBe(true)
    expect(podeMoverEtapa('em_andamento', 'cancelada')).toBe(false)
    expect(podeMoverEtapa('ata_publicada', 'ata_rascunho')).toBe(false)
    expect(podeMoverEtapa('ata_rascunho', 'ata_publicada')).toBe(true)
  })
  it('R6/C11: corte calculado na leitura — agendada vira pauta_fechada 18h antes', () => {
    const inicio = '2026-10-13T10:00:00-03:00'
    expect(corteFechado(inicio, 18, new Date('2026-10-12T15:59:00-03:00'))).toBe(false)
    expect(corteFechado(inicio, 18, new Date('2026-10-12T16:00:00-03:00'))).toBe(true)
    expect(etapaEfetiva('agendada', inicio, 18, new Date('2026-10-12T17:00:00-03:00'))).toBe('pauta_fechada')
    expect(etapaEfetiva('agendada', inicio, 18, new Date('2026-10-12T10:00:00-03:00'))).toBe('agendada')
    expect(etapaEfetiva('em_andamento', inicio, 18, new Date('2026-10-14'))).toBe('em_andamento')
  })
})

describe('papéis', () => {
  it('R9: avisa condutor = secretário sem bloquear', () => {
    expect(avisoMesmaPessoa('u1', 'u1')).toMatch(/mesma pessoa/)
    expect(avisoMesmaPessoa('u1', 'u2')).toBeNull()
    expect(avisoMesmaPessoa('u1', null)).toBeNull()
  })
  it('conduz: condutor, secretário ou admin', () => {
    const p = [{ usuario_id: 'c', papel: 'condutor' as const, presente: null }, { usuario_id: 's', papel: 'secretario' as const, presente: null }, { usuario_id: 'x', papel: 'participante' as const, presente: null }]
    expect(podeConduzir(p, 'c', false)).toBe(true)
    expect(podeConduzir(p, 's', false)).toBe(true)
    expect(podeConduzir(p, 'x', false)).toBe(false)
    expect(podeConduzir(p, 'fora', true)).toBe(true)
  })
})

describe('itens da pauta', () => {
  it('R5: item é pergunta com tipo, tempo e quem traz', () => {
    expect(validarItem({}, true).ok).toBe(false)
    expect(validarItem({ pergunta: ' Trocar o cron? ', tipo: 'decidir' }, true)).toEqual({ ok: true, campos: { pergunta: 'Trocar o cron?', tipo: 'decidir', tempo_min: 5 } })
    expect(validarItem({ pergunta: 'x', tipo: 'votar' }, true).ok).toBe(false)
    expect(validarItem({ tempo_min: 0 }, false).ok).toBe(false)
  })
  it('R7: decidir só fecha com decisão + motivo; informar/discutir não exigem ação', () => {
    expect(validarResultado('decidir', { resultado: 'decidido', decisao_texto: 'Sim' }).ok).toBe(false)
    expect(validarResultado('decidir', { resultado: 'decidido', decisao_texto: 'Sim', decisao_motivo: 'Porque' }).ok).toBe(true)
    expect(validarResultado('decidir', { resultado: 'informado' }).ok).toBe(false)
    expect(validarResultado('informar', { resultado: 'informado' }).ok).toBe(true)
    expect(validarResultado('discutir', { resultado: 'parking' }).ok).toBe(true)
    expect(validarResultado('discutir', { resultado: 'decidido', decisao_texto: 'a', decisao_motivo: 'b' }).ok).toBe(false)
  })
  it('publicar: bloqueia decidir sem resultado e decidido sem motivo', () => {
    const erros = validarPublicacao([
      item({ id: 'a', tipo: 'decidir' }),
      item({ id: 'b', tipo: 'decidir', resultado: 'decidido', decisao_texto: 'x', decisao_motivo: ' ' }),
      item({ id: 'c', tipo: 'informar' }),
      item({ id: 'd', tipo: 'decidir', resultado: 'adiado' }),
    ])
    expect(erros).toHaveLength(2)
    expect(erros[0]).toMatch(/não tem resultado/)
    expect(erros[1]).toMatch(/sem decisão\/motivo/)
  })
  it('R13: parking e adiado viram sugestões para a próxima reunião', () => {
    const s = sugestoesProximaReuniao([
      item({ id: 'a', resultado: 'parking', ordem: 2, pergunta: 'Fora da pauta?' }),
      item({ id: 'b', resultado: 'decidido', ordem: 0 }),
      item({ id: 'c', resultado: 'adiado', ordem: 1, pergunta: 'Adiada?' }),
    ])
    expect(s.map((x) => [x.pergunta, x.origem, x.item_origem_id])).toEqual([['Adiada?', 'adiado_anterior', 'c'], ['Fora da pauta?', 'parking_anterior', 'a']])
  })
  it('reordenar e somar tempo', () => {
    const lista = [item({ id: 'a', ordem: 0, tempo_min: 10 }), item({ id: 'b', ordem: 1, tempo_min: 5 }), item({ id: 'c', ordem: 2, tempo_min: 15 })]
    expect(novaOrdem(['c', 'a'], lista)).toEqual({ c: 0, a: 1, b: 2 })
    expect(novaOrdem(['zzz'], lista)).toEqual({ a: 0, b: 1, c: 2 })
    expect(somaTempo(lista)).toBe(30)
  })
})

describe('bloco de pendências (R2/R3/R4)', () => {
  const hoje = '2026-10-13'
  it('só atrasadas e vencendo; em dia não aparece; concluída só conta', () => {
    const r = classificarPendencias([
      acao({ id: 'atr', numero: 1, prazo: '2026-10-01' }),
      acao({ id: 'atr2', numero: 2, prazo: '2026-10-10' }),
      acao({ id: 'venc', numero: 3, prazo: '2026-10-15' }),
      acao({ id: 'emdia', numero: 4, prazo: '2026-11-30' }),
      acao({ id: 'feita', numero: 5, status: 'resolvido', resolvido_em: '2026-10-08T10:00:00Z' }),
      acao({ id: 'velha', numero: 6, status: 'fechado', fechado_em: '2026-09-01T10:00:00Z' }),
      acao({ id: 'canc', numero: 7, status: 'cancelado' }),
      acao({ id: 'semprazo', numero: 8, prazo: null }),
    ], { hoje, limiteVencendo: '2026-10-20', desde: '2026-10-06T00:00:00Z' })
    expect(r.atrasadas.map((a) => [a.id, a.dias_atraso])).toEqual([['atr', 12], ['atr2', 3]])
    expect(r.vencendo.map((a) => a.id)).toEqual(['venc'])
    expect(r.concluidas).toEqual({ n: 1, titulos: ['A'] })
  })
  it('sem próxima reunião o limite é hoje+7', () => {
    const r = classificarPendencias([acao({ id: 'a', prazo: '2026-10-20' }), acao({ id: 'b', prazo: '2026-10-21' })], { hoje, limiteVencendo: null, desde: null })
    expect(r.vencendo.map((a) => a.id)).toEqual(['a'])
  })
  it('R4: >= 2 reprogramações bloqueia novo prazo (API e marcação)', () => {
    expect(podeNovoPrazo(1)).toBe(true)
    expect(podeNovoPrazo(2)).toBe(false)
    const r = classificarPendencias([acao({ id: 'a', prazo: '2026-10-01', prazo_reprogramacoes: 2 })], { hoje, limiteVencendo: null, desde: null })
    expect(r.atrasadas[0].bloqueada_novo_prazo).toBe(true)
    expect(validarSaida('novo_prazo', { prazo_reprogramacoes: 2, status: 'aberto' })).toMatch(/reprogramada 2 vezes/)
    expect(validarSaida('novo_prazo', { prazo_reprogramacoes: 1, status: 'aberto' })).toBeNull()
    expect(validarSaida('escalar', { prazo_reprogramacoes: 5, status: 'aberto' })).toBeNull()
    expect(validarSaida('cancelar', { prazo_reprogramacoes: 0, status: 'fechado' })).toMatch(/encerrada/)
    expect(validarSaida('xyz', { prazo_reprogramacoes: 0, status: 'aberto' })).toMatch(/inválida/)
  })
  it('C4: prazo via edição conta; nova data no aceite não; ticket sem origem nunca', () => {
    expect(contaReprogramacao({ origem_reuniao_id: 'r' }, false)).toBe(true)
    expect(contaReprogramacao({ origem_reuniao_id: 'r' }, true)).toBe(false)
    expect(contaReprogramacao({ origem_reuniao_id: null }, false)).toBe(false)
  })
})

describe('séries', () => {
  it('valida criação e recorrência', () => {
    expect(validarSerie({}, true).ok).toBe(false)
    expect(validarSerie({ nome: 'Semanal', condutor_id: '11111111-1111-1111-1111-111111111111', recorrencia: 'semanal' }, true).ok).toBe(false) // sem dia/hora
    const v = validarSerie({ nome: ' Semanal ', condutor_id: '11111111-1111-1111-1111-111111111111', recorrencia: 'semanal', dia_semana: 1, hora: '10:00', participantes_padrao: ['22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'] }, true)
    expect(v.ok && v.campos.nome).toBe('Semanal')
    expect(v.ok && v.campos.participantes_padrao).toHaveLength(1)
    expect(validarSerie({ corte_antecedencia_horas: 999 }, false).ok).toBe(false)
  })
  it('R9: rodízio de secretário é circular', () => {
    const s = { secretarios_rodizio: ['a', 'b', 'c'], instancias_geradas: 4 }
    expect(secretarioDaVez(s)).toBe('b')
    expect(secretarioDaVez({ secretarios_rodizio: [], instancias_geradas: 0 })).toBeNull()
  })
  it('próxima data da série e início ISO', () => {
    // 2026-10-13 é terça; próxima segunda (1) depois dela = 2026-10-19
    expect(proximaDataDaSerie({ recorrencia: 'semanal', dia_semana: 1 }, '2026-10-13')).toBe('2026-10-19')
    expect(proximaDataDaSerie({ recorrencia: 'semanal', dia_semana: 2 }, '2026-10-13')).toBe('2026-10-20')
    expect(proximaDataDaSerie({ recorrencia: 'nenhuma', dia_semana: 1 }, '2026-10-13')).toBeNull()
    expect(inicioISO('2026-10-19', '10:00')).toBe('2026-10-19T10:00:00-03:00')
    expect(addDias('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('texto WhatsApp', () => {
  const base = { serie: 'Semanal Oficina', titulo: 'x', data: '2026-10-13', decididos: 2, atrasadas: 1, link: 'https://portal/reunioes/1' }
  it('com 0 ações', () => {
    const t = textoWhatsApp({ ...base, acoes: [] })
    expect(t.split('\n')).toHaveLength(3)
    expect(t).toContain('📋 *Semanal Oficina — 13/10*')
    expect(t).toContain('Ações novas: 0')
  })
  it('com 10 ações trunca em 4 + "e mais N no portal" (8 linhas)', () => {
    const acoes = Array.from({ length: 10 }, (_, i) => ({ responsavel: `Pessoa ${i}`, titulo: `Ação ${i}`, prazo: '2026-10-20' }))
    const linhas = textoWhatsApp({ ...base, acoes }).split('\n')
    expect(linhas).toHaveLength(8)
    expect(linhas[6]).toBe('• e mais 6 no portal')
    expect(linhas[2]).toBe('• Pessoa: Ação 0 — até 20/10')
  })
})
