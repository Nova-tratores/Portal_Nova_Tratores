import { describe, expect, it } from 'vitest'
import {
  normalizarPasso, normalizarPassos, normalizarResposta, respostaValida, pendentes, foraDaFaixa,
  podeEditarPop, podeAprovar, podeExecutar, podeCriarNaArea, podeVerRascunho, temModuloPops,
  venceEm, validarAgendamento, diffPassos, type Ator, type Passo,
} from '../regras'

const AREA = '11111111-1111-1111-1111-111111111111'
const OUTRA = '22222222-2222-2222-2222-222222222222'
const EU = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ator = (p: Partial<Ator> = {}): Ator => ({ userId: EU, isAdmin: false, modulos: [], papeisArea: [], ...p })
const pop = { area_id: AREA, dono_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', template_tipo: null as string | null }

const passo = (p: Partial<Passo>): Passo => ({
  id: 'p', versao_id: 'v', ordem: 1, chave: 'k', tipo: 'check', titulo: 't', ajuda: '', obrigatorio: true,
  config: {}, midia_path: null, ...p,
})

describe('normalizarPasso', () => {
  it('exige título e tipo válido', () => {
    expect(normalizarPasso({ tipo: 'check', titulo: ' ' }, 0)).toEqual({ erro: 'Passo 1: escreva o título.' })
    expect('erro' in normalizarPasso({ tipo: 'xyz', titulo: 'a' }, 2)).toBe(true)
  })
  it('instrução nunca é obrigatória', () => {
    const r = normalizarPasso({ tipo: 'instrucao', titulo: 'Leia', obrigatorio: true }, 0)
    expect('passo' in r && r.passo.obrigatorio).toBe(false)
  })
  it('foto: mínimo 1..10 e máximo ≥ mínimo', () => {
    expect('erro' in normalizarPasso({ tipo: 'foto', titulo: 'f', config: { min_fotos: 0 } }, 0)).toBe(true)
    expect('erro' in normalizarPasso({ tipo: 'foto', titulo: 'f', config: { min_fotos: 3, max_fotos: 2 } }, 0)).toBe(true)
    const r = normalizarPasso({ tipo: 'foto', titulo: 'f', config: { min_fotos: 2 } }, 0)
    expect('passo' in r && r.passo.config).toEqual({ min_fotos: 2, max_fotos: 5 })
  })
  it('número: faixa coerente, aceita vírgula', () => {
    expect('erro' in normalizarPasso({ tipo: 'numero', titulo: 'n', config: { min: 10, max: 5 } }, 0)).toBe(true)
    const r = normalizarPasso({ tipo: 'numero', titulo: 'n', config: { min: '1,5', unidade: ' psi ' } }, 0)
    expect('passo' in r && r.passo.config).toEqual({ min: 1.5, unidade: 'psi' })
  })
  it('seleção: 2+ opções distintas', () => {
    expect('erro' in normalizarPasso({ tipo: 'selecao', titulo: 's', config: { opcoes: ['a', 'a', ' '] } }, 0)).toBe(true)
    const r = normalizarPasso({ tipo: 'selecao', titulo: 's', config: { opcoes: ['a', 'b', 'a'] } }, 0)
    expect('passo' in r && r.passo.config?.opcoes).toEqual(['a', 'b'])
  })
  it('chave repetida no editor vira passo novo', () => {
    const k = '33333333-3333-3333-3333-333333333333'
    const r = normalizarPassos([{ tipo: 'check', titulo: 'a', chave: k }, { tipo: 'check', titulo: 'b', chave: k }])
    expect('passos' in r && r.passos.map((p) => p.chave)).toEqual([k, undefined])
  })
})

describe('respostas', () => {
  const pref = 'T/'
  it('valida forma por tipo', () => {
    expect(normalizarResposta(passo({ tipo: 'check' }), { sim: 'sim' }, [], pref)).toEqual({ erro: 'Responda sim ou não.' })
    expect(normalizarResposta(passo({ tipo: 'numero' }), { numero: '12,5' }, [], pref)).toEqual({ valor: { numero: 12.5 }, fotos: [] })
    expect('erro' in normalizarResposta(passo({ tipo: 'selecao', config: { opcoes: ['a', 'b'] } }), { opcao: 'c' }, [], pref)).toBe(true)
    expect('erro' in normalizarResposta(passo({ tipo: 'instrucao' }), {}, [], pref)).toBe(true)
  })
  it('foto só da própria execução, respeita o máximo e salva abaixo do mínimo', () => {
    const f = passo({ tipo: 'foto', config: { min_fotos: 2, max_fotos: 2 } })
    expect(normalizarResposta(f, {}, ['X/a.jpg'], pref)).toEqual({ erro: 'Foto de outra execução.' })
    expect(normalizarResposta(f, {}, ['T/../X/a.jpg'], pref)).toEqual({ erro: 'Foto de outra execução.' })
    expect('erro' in normalizarResposta(f, {}, ['T/a', 'T/b', 'T/c'], pref)).toBe(true)
    expect(normalizarResposta(f, {}, ['T/a'], pref)).toEqual({ valor: {}, fotos: ['T/a'] })
  })
  it('respostaValida espelha o SQL (fora da faixa é válido)', () => {
    const n = passo({ tipo: 'numero', config: { min: 0, max: 10 } })
    expect(respostaValida(n, { valor: { numero: 99 }, fotos: [] })).toBe(true)
    expect(foraDaFaixa(n.config, 99)).toBe(true)
    expect(respostaValida(passo({ tipo: 'check' }), { valor: { sim: false }, fotos: [] })).toBe(true)
    expect(respostaValida(passo({ tipo: 'foto', config: { min_fotos: 2 } }), { valor: {}, fotos: ['a'] })).toBe(false)
  })
  it('pendentes ignora instrução e opcional', () => {
    const ps = [
      passo({ id: '1', tipo: 'instrucao', obrigatorio: false }),
      passo({ id: '2', tipo: 'check' }),
      passo({ id: '3', tipo: 'texto', obrigatorio: false }),
      passo({ id: '4', tipo: 'foto', config: { min_fotos: 1 } }),
    ]
    expect(pendentes(ps, [{ passo_id: '2', valor: { sim: true }, fotos: [] }]).map((p) => p.id)).toEqual(['4'])
  })
})

describe('papéis', () => {
  it('sem módulo e sem papel: nada', () => {
    const a = ator()
    expect(temModuloPops(a)).toBe(false)
    expect(podeEditarPop(a, pop)).toBe(false)
    expect(podeAprovar(a, pop)).toBe(false)
    expect(podeExecutar(a, pop)).toBe(false)
  })
  it('dono da área edita e cria só na própria área', () => {
    const a = ator({ papeisArea: [{ area_id: AREA, papel: 'dono' }] })
    expect(podeCriarNaArea(a, AREA)).toBe(true)
    expect(podeCriarNaArea(a, OUTRA)).toBe(false)
    expect(podeEditarPop(a, pop)).toBe(true)
    expect(podeAprovar(a, pop)).toBe(false)
  })
  it('aprovador vê rascunho e aprova, mas não edita', () => {
    const a = ator({ papeisArea: [{ area_id: AREA, papel: 'aprovador' }] })
    expect(podeVerRascunho(a, pop)).toBe(true)
    expect(podeAprovar(a, pop)).toBe(true)
    expect(podeEditarPop(a, pop)).toBe(false)
  })
  it('pops:executar só executa; modelo do sistema não executa nem é editado por dono', () => {
    const a = ator({ modulos: ['pops:executar'] })
    expect(podeExecutar(a, pop)).toBe(true)
    expect(podeEditarPop(a, pop)).toBe(false)
    const sis = { ...pop, template_tipo: 'sistema' }
    expect(podeExecutar(ator({ isAdmin: true }), sis)).toBe(false)
    expect(podeEditarPop(ator({ papeisArea: [{ area_id: AREA, papel: 'dono' }] }), sis)).toBe(false)
    expect(podeEditarPop(ator({ modulos: ['pops:admin'] }), sis)).toBe(true)
  })
  it('módulo puro = admin do módulo', () => {
    expect(podeAprovar(ator({ modulos: ['pops'] }), pop)).toBe(true)
  })
})

describe('recorrência', () => {
  const base = { dia_semana: null, dia_mes: null, inicio_em: '2026-01-01', ativo: true }
  it('diário vence todo dia, inclusive domingo; respeita início e ativo', () => {
    expect(venceEm({ ...base, recorrencia: 'diario' }, '2026-10-11')).toBe(true) // domingo
    expect(venceEm({ ...base, recorrencia: 'diario', inicio_em: '2026-11-01' }, '2026-10-11')).toBe(false)
    expect(venceEm({ ...base, recorrencia: 'diario', ativo: false }, '2026-10-11')).toBe(false)
  })
  it('semanal pelo dia da semana', () => {
    expect(venceEm({ ...base, recorrencia: 'semanal', dia_semana: 1 }, '2026-10-12')).toBe(true) // segunda
    expect(venceEm({ ...base, recorrencia: 'semanal', dia_semana: 1 }, '2026-10-13')).toBe(false)
  })
  it('mensal dia 31 cai no último dia do mês curto', () => {
    expect(venceEm({ ...base, recorrencia: 'mensal', dia_mes: 31 }, '2026-02-28')).toBe(true)
    expect(venceEm({ ...base, recorrencia: 'mensal', dia_mes: 31 }, '2026-02-27')).toBe(false)
    expect(venceEm({ ...base, recorrencia: 'mensal', dia_mes: 15 }, '2026-10-15')).toBe(true)
  })
  it('validarAgendamento exige o dia certo', () => {
    const r = '44444444-4444-4444-4444-444444444444'
    expect('erro' in validarAgendamento({ recorrencia: 'semanal', responsavel_padrao_id: r })).toBe(true)
    expect(validarAgendamento({ recorrencia: 'mensal', dia_mes: 5, responsavel_padrao_id: r }))
      .toEqual({ dados: { recorrencia: 'mensal', dia_semana: null, dia_mes: 5, responsavel_padrao_id: r } })
  })
})

describe('recorrência a cada N meses', () => {
  const sem = { recorrencia: 'mensal' as const, dia_semana: null, dia_mes: 15, intervalo_meses: 6, inicio_em: '2026-11-15', ativo: true }
  it('semestral vence no mês de início e de 6 em 6 meses', () => {
    expect(venceEm(sem, '2026-11-15')).toBe(true)
    expect(venceEm(sem, '2026-12-15')).toBe(false)
    expect(venceEm(sem, '2027-04-15')).toBe(false)
    expect(venceEm(sem, '2027-05-15')).toBe(true)
    expect(venceEm(sem, '2027-11-15')).toBe(true)
    expect(venceEm(sem, '2026-05-15')).toBe(false) // antes do início
  })
  it('anual no dia 31 cai no último dia do mês curto', () => {
    const anual = { ...sem, intervalo_meses: 12, dia_mes: 31, inicio_em: '2026-02-28' }
    expect(venceEm(anual, '2026-02-28')).toBe(true)
    expect(venceEm(anual, '2027-02-28')).toBe(true)
    expect(venceEm(anual, '2026-03-31')).toBe(false)
  })
  it('linha antiga (sem intervalo) continua todo mês', () => {
    expect(venceEm({ ...sem, intervalo_meses: undefined }, '2026-12-15')).toBe(true)
  })
  it('proximaData acha a próxima', async () => {
    const { proximaData } = await import('../regras')
    expect(proximaData(sem, '2026-11-16')).toBe('2027-05-15')
    expect(proximaData(sem, '2026-10-20')).toBe('2026-11-15')
  })
  it('validarAgendamento: intervalo exige mensal e a 1ª data', () => {
    const r = '44444444-4444-4444-4444-444444444444'
    expect('erro' in validarAgendamento({ recorrencia: 'mensal', dia_mes: 15, intervalo_meses: 6, responsavel_padrao_id: r })).toBe(true)
    expect('erro' in validarAgendamento({ recorrencia: 'semanal', dia_semana: 1, intervalo_meses: 6, inicio_em: '2026-11-15', responsavel_padrao_id: r })).toBe(true)
    expect('erro' in validarAgendamento({ recorrencia: 'mensal', dia_mes: 15, intervalo_meses: 30, inicio_em: '2026-11-15', responsavel_padrao_id: r })).toBe(true)
    expect(validarAgendamento({ recorrencia: 'mensal', dia_mes: 15, intervalo_meses: 6, inicio_em: '2026-11-15', responsavel_padrao_id: r }))
      .toEqual({ dados: { recorrencia: 'mensal', dia_semana: null, dia_mes: 15, responsavel_padrao_id: r, inicio_em: '2026-11-15', intervalo_meses: 6 } })
  })
  it('descreve', async () => {
    const { descreverRecorrencia } = await import('../regras')
    expect(descreverRecorrencia(sem)).toBe('A cada 6 meses (semestral), no dia 15')
    expect(descreverRecorrencia({ ...sem, intervalo_meses: 4 })).toBe('A cada 4 meses, no dia 15')
  })
})

describe('diffPassos', () => {
  const p = (chave: string, ordem: number, titulo = chave) =>
    ({ chave, ordem, tipo: 'check' as const, titulo, ajuda: '', obrigatorio: true, config: {}, midia_path: null })
  it('detecta adicionado, removido, alterado e movido pela chave', () => {
    const d = diffPassos([p('a', 1), p('b', 2), p('c', 3)], [p('b', 1), p('a', 2, 'A novo'), p('d', 3)])
    expect(d.map((m) => m.tipo).sort()).toEqual(['adicionado', 'alterado', 'movido', 'removido'])
    const alt = d.find((m) => m.tipo === 'alterado')
    expect(alt && 'campos' in alt && alt.campos).toEqual(['titulo'])
  })
})

describe('fase 6', () => {
  it('QR aponta para a página do POP com executar=1 (a página mostra a vigente)', async () => {
    const { urlExecutarPop } = await import('../regras')
    expect(urlExecutarPop('https://portal.novatratores.com/', 'abc')).toBe('https://portal.novatratores.com/pops/abc?executar=1')
  })
  it('descreve a recorrência', async () => {
    const { descreverRecorrencia } = await import('../regras')
    expect(descreverRecorrencia({ recorrencia: 'semanal', dia_semana: 1, dia_mes: null })).toBe('Toda segunda-feira')
    expect(descreverRecorrencia({ recorrencia: 'semanal', dia_semana: 6, dia_mes: null })).toBe('Todo sábado')
    expect(descreverRecorrencia({ recorrencia: 'mensal', dia_semana: null, dia_mes: 31 })).toBe('Todo dia 31 (ou o último dia do mês)')
  })
})
