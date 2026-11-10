// Abas do Financeiro novo: uma chave por aba, todas EXPLÍCITAS (10/11/2026). Se alguém criar uma aba nova em
// areasFinanceiro.ts sem pôr a chave em explicitas.ts, quem tem o módulo Financeiro inteiro (Pós-Vendas, Peças)
// passaria a vê-la — este teste quebra antes.
import { describe, expect, it } from 'vitest'
import { ACOES_EXPLICITAS, permite } from '@/lib/permissoes/explicitas'
import { AREAS_FINANCEIRO, CHAVES_ABAS_FINANCEIRO, CHAVES_ANTIGAS_FINANCEIRO as NAO_EXPLICITAS, abaDoEndereco, abasVisiveis, permDaAba, temAlgumaAba } from '@/components/financeiro/areasFinanceiro'

describe('chaves das abas do Financeiro', () => {
  it('toda aba com chave é explícita (o módulo Financeiro inteiro não dá)', () => {
    const faltando = CHAVES_ABAS_FINANCEIRO.filter((c) => !NAO_EXPLICITAS.has(c.chave) && !ACOES_EXPLICITAS.has(`financeiro:${c.chave}`))
    expect(faltando.map((c) => c.chave)).toEqual([])
  })
  it('chaves derivadas do endereço', () => {
    const porHref = (href: string) => permDaAba(AREAS_FINANCEIRO.flatMap((a) => a.abas).find((a) => a.href === href)!)
    expect(porHref('/financeiro/pessoas/folha')).toBe('pessoas-folha')
    expect(porHref('/financeiro/contas-do-mes/fixas')).toBe('contas-fixas')
    expect(porHref('/financeiro/caixa/vencidos')).toBe('vencidos')
    expect(porHref('/financeiro/caixa/baixar-contas')).toBe('baixa-contas')
    expect(porHref('/financeiro/kanban-financeiro')).toBe('recebimentos')
    expect(porHref('/financeiro/recibos')).toBeNull()
  })
  it('chaves não se repetem', () => {
    const chaves = CHAVES_ABAS_FINANCEIRO.map((c) => c.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
  })
  it('Pós-Vendas com o módulo inteiro não vê as áreas; quem recebe a caixinha vê só ela', () => {
    const posVendas = (m: string, a?: string) => permite(['financeiro'], false, m, a)
    expect(temAlgumaAba(posVendas)).toBe(false)
    const soFolha = (m: string, a?: string) => permite(['financeiro:pessoas-folha'], false, m, a)
    expect(temAlgumaAba(soFolha)).toBe(true)
    const pessoas = AREAS_FINANCEIRO.find((a) => a.id === 'pessoas')!
    expect(abasVisiveis(pessoas.abas, false, soFolha).map((a) => a.nome)).toEqual(['Folha'])
  })
  it('a aba da tela aberta', () => {
    expect(abaDoEndereco('/financeiro/banco/contas-correntes')?.nome).toBe('Contas correntes')
    expect(abaDoEndereco('/financeiro/compras')).toBeNull()
  })
})
