import { describe, expect, it } from 'vitest'
import {
  candidatasDoTrator, cidadeChave, diaIso, escolherSugestoes, horimetroEstimado, itensDaRegra, mesmoDono,
  proximaRevisao, revisoesDoTrator, vendedorDaCidade, type ContatoVisita, type QuestExistente, type TratorRevisoes,
} from '../quests-regras'

const HOJE = '2026-10-26'
const ctxVazio = { hoje: HOJE, localizacoes: new Map<string, string>(), visitas: [] as ContatoVisita[] }
const trator = (extra: Partial<TratorRevisoes> = {}): TratorRevisoes => ({
  Chassis: 'MBN1KGCBFNGF00710', Modelo: 'JIVO 2025', Cliente: 'PAULO ROGÉRIO DE LIMA', Cidade: 'CARLOPOLIS', Entrega: '04/10/2023', ...extra,
})
const regras = (t: TratorRevisoes, ctx = ctxVazio) => candidatasDoTrator(t, ctx).map((c) => c.regra).sort()

describe('datas e nomes', () => {
  it('lê as duas grafias de data da tabela tratores', () => {
    expect(diaIso('04/10/2023')).toBe('2023-10-04')
    expect(diaIso('2023-10-04')).toBe('2023-10-04')
    expect(diaIso('4/1/2024')).toBe('2024-01-04')
    expect(diaIso('')).toBeNull()
  })
  it('mesmo dono como no app', () => {
    expect(mesmoDono('PAULO ROGÉRIO DE LIMA', 'Paulo Rogerio Lima')).toBe(true)
    expect(mesmoDono('Adriano Silva Nascimento', 'Adriano Silva Leme')).toBe(false)
  })
  it('cidade sem fazenda, UF e acento', () => {
    expect(cidadeChave('AGUDOS FAZ SÃO DOMINGOS')).toBe('AGUDOS')
    expect(cidadeChave('Promissão/ APREENDIDO')).toBe('PROMISSAO')
    expect(cidadeChave('Fartura - SP')).toBe('FARTURA')
  })
})

describe('revisões e horímetro', () => {
  const t = trator({ Entrega: '2024-01-01', '50h Data': '2024-02-10', '50h Horimetro': '52', '300h Data': '01/06/2025', '300h Horimetro': '400' })
  it('lê as revisões anotadas e projeta o horímetro pela média desde a entrega', () => {
    const revs = revisoesDoTrator(t)
    expect(revs.map((r) => r.horas)).toEqual([50, 300])
    expect(proximaRevisao(revs)).toBe(600)
    // 400 h em 517 dias ≈ 0,77 h/dia; +512 dias → ~796 h
    expect(horimetroEstimado('2024-01-01', revs, HOJE)).toBeGreaterThan(700)
  })
  it('revisão chegando quando a projeção chega perto da próxima', () => {
    expect(regras(t)).toContain('revisao_chegando')
    const c = candidatasDoTrator(t, ctxVazio).find((x) => x.regra === 'revisao_chegando')!
    expect(c.titulo).toContain('600 h')
    expect(c.chave).toBe('revisao_chegando:MBN1KGCBFNGF00710:600')
  })
  it('sem horímetro anotado não há projeção', () => {
    expect(horimetroEstimado('2024-01-01', revisoesDoTrator(trator()), HOJE)).toBeNull()
  })
})

describe('regras', () => {
  it('trator sem notícia: nunca teve revisão, localização nem visita', () => {
    expect(regras(trator())).toEqual(['trator_sem_noticia'])
  })
  it('localização confirmada tira o "sem notícia"', () => {
    const ctx = { ...ctxVazio, localizacoes: new Map([['MBN1KGCBFNGF00710', '2026-09-01']]) }
    expect(regras(trator(), ctx)).toEqual([])
  })
  it('visita ao dono (pelo nome) conta como contato', () => {
    const ctx = { ...ctxVazio, visitas: [{ nomes: ['Paulo Rogerio Lima', null], data: '2026-08-01T10:00:00Z' }] }
    expect(regras(trator(), ctx)).toEqual([])
  })
  it('cliente sumido: último contato há mais de 12 meses, alvo = cliente', () => {
    const t = trator({ '50h Data': '01/11/2023', '50h Horimetro': '' })
    const c = candidatasDoTrator(t, ctxVazio)
    expect(c.map((x) => x.regra)).toEqual(['cliente_sumido'])
    expect(c[0].alvo_tipo).toBe('cliente')
    expect(c[0].chave).toBe('cliente_sumido:PAULO ROGERIO LIMA:2023-11')
  })
  it('aniversário de entrega nos próximos 30 dias', () => {
    expect(regras(trator({ Entrega: '10/11/2024' }))).toContain('aniversario_entrega')
    expect(regras(trator({ Entrega: '10/03/2024' }))).not.toContain('aniversario_entrega')
  })
  it('entregue há menos de 6 meses não é "sem notícia"; apreendido fica fora', () => {
    expect(regras(trator({ Entrega: '01/08/2026' }))).toEqual([])
    expect(regras(trator({ Cidade: 'PROMISSÃO/ APREENDIDO' }))).toEqual([])
  })
  it('itens padrão: sem notícia pede horímetro, fotos e os dois relatos', () => {
    expect(itensDaRegra('trator_sem_noticia').map((i) => i.chave)).toEqual(['horimetro', 'fotos', 'relato_operador', 'relato_dono'])
  })
})

describe('escolherSugestoes', () => {
  const c1 = candidatasDoTrator(trator(), ctxVazio)[0]
  const c2 = candidatasDoTrator(trator({ Chassis: 'X2', Cliente: 'JOAO SOUZA' }), ctxVazio)[0]
  const rev = candidatasDoTrator(trator({ Chassis: 'X3', Cliente: 'MARIA', Entrega: '2024-01-01', '50h Data': '2024-02-10', '50h Horimetro': '52', '300h Data': '01/06/2025', '300h Horimetro': '400' }), ctxVazio)
    .find((x) => x.regra === 'revisao_chegando')!
  const ex = (e: Partial<QuestExistente>): QuestExistente => ({ chave: null, status: 'aberta', chassis: null, cliente_nome: null, regra: null, alvo_tipo: 'trator', updated_at: '2026-10-01', concluida_em: null, ...e })

  it('respeita o limite e mistura as regras (uma de cada por volta, revisão primeiro)', () => {
    const rev2 = { ...rev, chave: 'revisao_chegando:X4:600', chassis: 'X4', cliente_nome: 'ANA' }
    expect(escolherSugestoes([c1, c2, rev, rev2], [], 2, HOJE).map((x) => x.regra)).toEqual(['revisao_chegando', 'trator_sem_noticia'])
    expect(escolherSugestoes([c1, c2, rev, rev2], [], 3, HOJE).map((x) => x.regra)).toEqual(['revisao_chegando', 'trator_sem_noticia', 'revisao_chegando'])
    // regra que acabou não trava as outras
    expect(escolherSugestoes([rev, rev2], [], 5, HOJE)).toHaveLength(2)
  })
  it('não repete chave nem trator com quest ativa', () => {
    expect(escolherSugestoes([c1], [ex({ chave: c1.chave, status: 'descartada' })], 10, HOJE)).toEqual([])
    expect(escolherSugestoes([c1], [ex({ chassis: c1.chassis, status: 'aberta' })], 10, HOJE)).toEqual([])
  })
  it('descartada há pouco descansa 180 dias; concluída há mais de 1 ano libera', () => {
    const outra = { ...c1, chave: 'trator_sem_noticia:MBN1KGCBFNGF00710:outro' }
    expect(escolherSugestoes([outra], [ex({ chassis: c1.chassis, regra: 'trator_sem_noticia', status: 'descartada', updated_at: '2026-09-01' })], 10, HOJE)).toEqual([])
    expect(escolherSugestoes([outra], [ex({ chassis: c1.chassis, regra: 'trator_sem_noticia', status: 'concluida', concluida_em: '2025-09-01' })], 10, HOJE)).toHaveLength(1)
  })
})

describe('vendedorDaCidade', () => {
  const vc = [{ vendedor_id: 3, cidade: 'Carlópolis' }, { vendedor_id: 4, cidade: 'Fartura' }, { vendedor_id: 5, cidade: 'FARTURA - SP' }]
  it('um vendedor na cidade = sugerido; dois ou nenhum = o supervisor escolhe', () => {
    expect(vendedorDaCidade('CARLOPOLIS', vc)).toBe(3)
    expect(vendedorDaCidade('FARTURA', vc)).toBeNull()
    expect(vendedorDaCidade('PIRAJU', vc)).toBeNull()
  })
})
