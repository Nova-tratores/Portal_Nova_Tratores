// Qual desenho representa o veículo no mapa da Ficha.
//
// A frota NÃO é só de carro (conferido no cadastro em 28/08/2026): tem hatches
// (Fox, Gol, Polo, Onix, Etios), sedãs (Voyage, Etios Sedan), ~12 picapes,
// SUVs, 2 caminhões (Ford C2428 e VW Cargo 1517), 2 motos (BMW R 1250 GS e
// Ténéré 250) e 1 carreta. Desenhar um sedã para a BMW seria informação
// errada, não só feia.
//
// Os DESENHOS seguem a prancha de referência que o usuário mandou (sedã,
// hatch, picape, caminhão rígido, carretinha e moto de rua) — recriados à mão
// em SVG, nunca importando imagem: os pontos do mapa têm coordenadas presas a
// um traço conhecido, e imagem de terceiro tem enquadramento imprevisível.
//
// PURO: sem import de servidor, testável no vitest.

export type TipoSilhueta = 'carro' | 'hatch' | 'picape' | 'caminhao' | 'moto' | 'carreta'

const semAcento = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Modelos da frota agrupados por carroceria. A ORDEM IMPORTA:
//  - "carreta" antes de tudo (uma "carreta carretinha" não é caminhão);
//  - moto antes de picape ("GS ADVENTURE" não pode casar com picape);
//  - caminhão antes de hatch ("CARGO" contém "argo"!);
//  - sedã explícito antes de hatch ("ETIOS SEDAN" contém "etios").
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
  // sedã explícito — segura o "ETIOS SEDAN" antes de o termo "etios" (hatch) pegar
  { tipo: 'carro', termos: ['sedan', 'seda ', 'voyage', 'virtus', 'prisma', 'cronos', 'grand siena', 'logan', 'cobalt'] },
  {
    tipo: 'hatch',
    // hatches da frota + SUVs: SUV é carroceria de DOIS volumes — o hatch é o
    // desenho mais próximo, não o sedã
    termos: ['fox', 'gol', 'onix', 'polo', 'etios', 'argo', 'mobi', 'kwid', 'sandero', 'celta',
      'uno', 'hb20', 'up!', 'fit',
      'tracker', 'renegade', 'trailblazer', 'captiva', 'conqueror', 'compass', 'duster',
      'ecosport', 'creta', 'nivus', 't-cross', 'tcross'],
  },
  {
    tipo: 'picape',
    termos: ['strada', 'saveiro', 'montana', 's10', 's-10', 'toro', 'rampage', 'hilux', 'hillux',
      'ranger', 'amarok', 'frontier', 'l200', 'oroch', 'maverick', 'picape', 'pick-up', 'pick up'],
  },
]

/**
 * Escolhe a silhueta pelo que o cadastro diz. `tipo_veiculo` é preenchido em
 * poucos veículos (10 de 38 no cadastro) e traz 'carro' até em picape, então
 * só manda quando declara um tipo ESPECÍFICO; o texto de marca/modelo é a
 * fonte principal. Fallback: 'carro' (sedã).
 */
export function silhuetaDoVeiculo(v: {
  tipo_veiculo?: string | null
  marca?: string | null
  modelo?: string | null
  descricao?: string | null
}): TipoSilhueta {
  const declarado = semAcento(v.tipo_veiculo || '')
  for (const t of ['carreta', 'moto', 'caminhao', 'picape', 'hatch'] as TipoSilhueta[]) {
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
  hatch: [],
  picape: [],
  caminhao: [],
  // moto não tem cabine nem porta-malas; ar-condicionado e carroceria também não
  moto: ['Ar-condicionado', 'Interior', 'Carroceria'],
  // carreta é rebocada: sem motor, câmbio, direção, ar e cabine
  carreta: ['Motor', 'Transmissão', 'Direção', 'Ar-condicionado', 'Interior', 'Elétrica'],
}
