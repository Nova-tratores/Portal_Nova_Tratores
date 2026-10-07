import { describe, it, expect } from 'vitest'
import { analisarConversa, ehDespedida, contatoIgnorado, resumoAviso, type MsgChatwoot } from '../vigia-conversas-regras'

const T = 1_800_000_000
const m = (tipo: number, min: number, content: string, extra: Partial<MsgChatwoot> = {}): MsgChatwoot => ({ message_type: tipo, created_at: T + min * 60, content, ...extra })

describe('analisarConversa', () => {
  it('caso Gustavo: a mensagem de fora do horário não conta como resposta', () => {
    const msgs = [
      m(0, 0, 'Boa tarde!'),
      m(2, 0, 'Atribuído a Larissa'),
      m(1, 0, 'Nosso horário de atendimento...', { content_attributes: { tratorilson: true, tratorilson_fora_horario: true } }),
      m(0, 0, 'Meu tio fez um financiamento com vocês e não pegamos o contrato'),
    ]
    const a = analisarConversa(msgs, T + 15 * 60)
    expect(a.precisa).toBe(true)
    expect(a.textos).toEqual(['Boa tarde!', 'Meu tio fez um financiamento com vocês e não pegamos o contrato'])
  })
  it('Tratorilson respondeu: não avisa', () => {
    expect(analisarConversa([m(0, 0, 'tem filtro?'), m(1, 1, 'Tem sim', { content_attributes: { tratorilson: true } })], T + 3600).precisa).toBe(false)
  })
  it('espera 10 minutos antes de avisar', () => {
    expect(analisarConversa([m(0, 0, 'preciso de um técnico')], T + 5 * 60).motivo).toBe('aguardando')
    expect(analisarConversa([m(0, 0, 'preciso de um técnico')], T + 11 * 60).precisa).toBe(true)
  })
  it('mensagem com mais de 24 h não avisa', () => {
    expect(analisarConversa([m(0, 0, 'preciso de um técnico')], T + 25 * 3600).motivo).toBe('antiga')
  })
  it('despedida não avisa', () => {
    expect(analisarConversa([m(1, 0, 'Segue o boleto'), m(0, 1, 'Obrigada')], T + 3600).motivo).toBe('despedida')
  })
  it('nota privada não conta como resposta', () => {
    expect(analisarConversa([m(0, 0, 'cadê meu pedido?'), m(1, 1, 'ver isso', { private: true })], T + 3600).precisa).toBe(true)
  })
})

describe('ehDespedida', () => {
  it('reconhece despedidas', () => {
    for (const t of ['Obrigada', 'ok', 'Ok, agradeço', 'valeu!', 'Até amanhã', '👍', 'Boa tarde', 'Ok agradeço', '']) expect(ehDespedida(t)).toBe(true)
  })
  it('pergunta de verdade não é despedida', () => {
    for (const t of ['Obrigado, e o valor da peça?', 'Meu trator parou', 'Até amanhã já faço o pagamento, me manda o pix']) expect(ehDespedida(t)).toBe(false)
  })
})

describe('contatoIgnorado', () => {
  it('ignora funcionário, fornecedor e grupo', () => {
    expect(contatoIgnorado({ phone_number: '+5514', custom_attributes: { tipo_contato: 'funcionario' } })).toBe(true)
    expect(contatoIgnorado({ phone_number: '+5514', custom_attributes: { fornecedor: 'X' } })).toBe(true)
    expect(contatoIgnorado({ phone_number: null })).toBe(true)
    expect(contatoIgnorado({ phone_number: '+5511961576785', custom_attributes: {} })).toBe(false)
  })
})

it('resumoAviso', () => {
  expect(resumoAviso(['oi', 'preciso de ajuda'], 15)).toBe('Cliente sem resposta há 15 min: "oi / preciso de ajuda"')
  expect(resumoAviso(['x'], 180)).toContain('3 h')
})
