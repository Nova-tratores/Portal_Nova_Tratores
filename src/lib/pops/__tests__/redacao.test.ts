import { describe, expect, it } from 'vitest'
import { comecaSemVerbo, conferirRedacao, sugerirVerbo } from '../redacao'

// Caso real (OFI-001, 22/10/2026): passos escritos como nome da coisa.
const OFI001 = {
  titulo: 'Inspeção de combustível dos tratores',
  objetivo: 'Prevenir que o trator não apresente falhas nos dias de entrega',
  escopo: 'Realizar a verificação do tanque de combustível, filtros e peneira da bomba alimentadora para verificar resíduos que podem acarretar na perca de força do trator',
  materiais: 'Ferramentas, como chaves de fenda para conseguir verificar filtros e chave do veículo',
  passos: [
    { tipo: 'foto' as const, titulo: 'Imagem da bomba alimentadora', config: { min_fotos: 1, max_fotos: 3 } },
    { tipo: 'foto' as const, titulo: 'Imagem/vídeo do líquido dentro do filtro', config: { min_fotos: 1, max_fotos: 5 } },
  ],
}

describe('sugerirVerbo', () => {
  it('troca o nome pelo verbo e ajusta o artigo', () => {
    expect(sugerirVerbo('Imagem da bomba alimentadora')).toBe('Fotografe a bomba alimentadora')
    expect(sugerirVerbo('Limpeza do filtro')).toBe('Limpe o filtro')
    expect(sugerirVerbo('Troca de óleo do motor')).toBe('Troque óleo do motor')
    expect(sugerirVerbo('Imagem/vídeo do líquido dentro do filtro')).toBe('Fotografe ou filme o líquido dentro do filtro')
  })
  it('grandeza vira "Confira o …"', () => {
    expect(sugerirVerbo('Nível do óleo')).toBe('Confira o nível do óleo')
  })
  it('não inventa quando não conhece', () => {
    expect(sugerirVerbo('Bomba alimentadora')).toBeNull()
  })
})

describe('comecaSemVerbo', () => {
  it('pega nome e ação-virada-coisa', () => {
    expect(comecaSemVerbo('Imagem da bomba')).toBe(true)
    expect(comecaSemVerbo('Verificação do tanque')).toBe(true)
    expect(comecaSemVerbo('Nível do óleo')).toBe(true)
  })
  it('aceita verbo no imperativo e no infinitivo', () => {
    expect(comecaSemVerbo('Fotografe a bomba')).toBe(false)
    expect(comecaSemVerbo('Verificar o tanque')).toBe(false)
    expect(comecaSemVerbo('Meça a pressão')).toBe(false)
    expect(comecaSemVerbo('Teste a válvula de segurança')).toBe(false)
    expect(comecaSemVerbo('Ajuste a correia')).toBe(false)
  })
})

describe('conferirRedacao', () => {
  const dicas = conferirRedacao(OFI001)
  const regras = dicas.map((d) => d.regra)
  it('acusa o caso real', () => {
    expect(regras).toContain('objetivo-negativo')
    expect(regras).toContain('escopo-quando')
    expect(regras).toContain('materiais-lista')
    expect(regras).toContain('grafia-perca')
    expect(dicas.filter((d) => d.regra === 'verbo').map((d) => d.sugestao)).toEqual([
      'Fotografe a bomba alimentadora', 'Fotografe ou filme o líquido dentro do filtro',
    ])
    expect(dicas.filter((d) => d.regra === 'foto-o-que')).toHaveLength(2)
  })
  it('POP bem escrito não gera dica', () => {
    const bom = conferirRedacao({
      titulo: 'Inspeção de combustível na entrega do trator',
      objetivo: 'Trator entregue ao cliente sem falha de alimentação de combustível.',
      escopo: 'Todo trator novo, antes da entrega ao cliente.',
      materiais: 'Chave de fenda 1/4; bandeja; pano limpo',
      passos: [
        { tipo: 'foto', titulo: 'Fotografe a bomba alimentadora', ajuda: 'De frente, com a peneira visível.' },
        { tipo: 'numero', titulo: 'Meça a pressão', config: { unidade: 'bar', min: 1, max: 2 } },
        { tipo: 'check', titulo: 'Confira o copo do filtro', ajuda: 'Sem água e sem borra.' },
      ],
    })
    expect(bom).toEqual([])
  })
  it('assinatura pode ser nomeada pelo quem', () => {
    expect(conferirRedacao({ objetivo: 'x'.repeat(30), escopo: 'Sempre', passos: [{ tipo: 'assinatura', titulo: 'Assinatura do responsável pela inspeção' }] })).toEqual([])
  })
  it('número sem unidade e sem faixa; check vago sem critério', () => {
    const r = conferirRedacao({ objetivo: 'x'.repeat(30), escopo: 'Sempre', passos: [
      { tipo: 'numero', titulo: 'Meça a pressão' },
      { tipo: 'check', titulo: 'Verifique o filtro' },
    ] }).map((d) => d.regra)
    expect(r).toEqual(expect.arrayContaining(['unidade', 'faixa', 'criterio']))
  })
})
