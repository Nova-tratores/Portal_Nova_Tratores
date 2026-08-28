// Qual desenho representa o veículo no mapa da Ficha.
//
// A frota NÃO é só de carro (conferido no cadastro em 28/08/2026): tem ~11
// carros, ~12 picapes, 5 SUVs, 2 caminhões (Ford C2428 e VW Cargo 1517),
// 2 motos (BMW R 1250 GS e Ténéré 250) e 1 carreta. Desenhar um sedã para a
// BMW seria informação errada, não só feia.
//
// Por que NÃO buscar a foto real do modelo na internet: os pontos do mapa têm
// coordenadas presas a um desenho CONHECIDO (o volante fica onde eu sei que
// está a cabine). Em imagem de terceiro, cada foto tem ângulo e enquadramento
// diferentes, então volante, câmbio e molas cairiam em lugares errados — o
// mapa deixaria de ser mapa. Fora a dependência externa e o direito de imagem.
//
// PURO: sem import de servidor, testável no vitest.

export type TipoSilhueta = 'carro' | 'picape' | 'caminhao' | 'moto' | 'carreta'

const semAcento = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Modelos da frota agrupados por carroceria. A ordem IMPORTA: "carreta" antes
// de qualquer outra (uma "carreta carretinha" não é caminhão), e moto antes de
// picape porque "GS ADVENTURE" não pode casar com nada de picape.
const REGRAS: { tipo: TipoSilhueta; termos: string[] }[] = [
  { tipo: 'carreta', termos: ['carreta', 'carretinha', 'reboque', 'semi reboque', 'semirreboque'] },
  {
    tipo: 'moto',
    termos: ['moto', 'motocicleta', 'honda cg', 'biz', 'bros', 'xre', 'tenere', 'r 1250', 'r1250',
      'gs adventure', 'fazer', 'factor', 'titan', 'pop 110', 'yamaha', 'bmw r'],
  },
  {
    tipo: 'caminhao',
    termos: ['caminhao', 'cargo', 'c2428', 'vuc', 'truck', 'bitrem', 'atego', 'accelo',
      'constellation', 'worker', 'delivery', '1517', '2428'],
  },
  {
    tipo: 'picape',
    termos: ['strada', 'saveiro', 'montana', 's10', 's-10', 'toro', 'rampage', 'hilux', 'hillux',
      'ranger', 'amarok', 'frontier', 'l200', 'oroch', 'maverick', 'picape', 'pick-up', 'pick up'],
  },
]

/**
 * Escolhe a silhueta pelo que o cadastro diz. `tipo_veiculo` é preenchido em
 * poucos veículos (10 de 38 no cadastro), então o texto de marca/modelo é a
 * fonte principal — e o fallback é 'carro', que é o corpo mais próximo de
 * SUV e de qualquer modelo desconhecido.
 */
export function silhuetaDoVeiculo(v: {
  tipo_veiculo?: string | null
  marca?: string | null
  modelo?: string | null
  descricao?: string | null
}): TipoSilhueta {
  const declarado = semAcento(v.tipo_veiculo || '')
  for (const t of ['carreta', 'moto', 'caminhao', 'picape'] as TipoSilhueta[]) {
    if (declarado === t) return t
  }
  const texto = semAcento([v.marca, v.modelo, v.descricao].filter(Boolean).join(' '))
  if (texto.trim()) {
    for (const r of REGRAS) {
      if (r.termos.some((termo) => texto.includes(semAcento(termo)))) return r.tipo
    }
  }
  return 'carro'
}

/** Sistemas que NÃO existem naquele tipo — não ganham ponto no desenho. */
export const SISTEMAS_FORA: Record<TipoSilhueta, string[]> = {
  carro: [],
  picape: [],
  caminhao: [],
  // moto não tem cabine nem porta-malas; ar-condicionado e carroceria também não
  moto: ['Ar-condicionado', 'Interior', 'Carroceria'],
  // carreta é rebocada: sem motor, câmbio, direção, ar e cabine
  carreta: ['Motor', 'Transmissão', 'Direção', 'Ar-condicionado', 'Interior', 'Elétrica'],
}
