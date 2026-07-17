// Comparador Álcool × Gasolina por veículo flex.
//
// Consumo (km/l) vem dos hodômetros digitados pelo motorista:
//   km = hodometro − hodometro_anterior; km/l = km ÷ litros.
// Leituras digitadas erradas são comuns, então cada abastecimento só entra na
// conta se passar no saneamento (bounds de km/l plausíveis p/ veículo leve).
// A métrica que decide é o CUSTO POR KM (R$ ÷ km) em cada combustível — é a
// "regra dos 70%" calculada com os números reais do veículo, não com a média
// de fábrica.

export type FlexRow = {
  placa: string
  modelo_veiculo: string | null
  combustivel: string | null
  litros: number | null
  valor_total: number | null
  hodometro_anterior: number | null
  hodometro: number | null
}

export type Combustivel = 'etanol' | 'gasolina'

// km/l plausível para veículo leve; fora disso é hodômetro digitado errado
const KML_MIN = 3
const KML_MAX = 30

// A MESMA régua do veredito, exposta por abastecimento — é o que o detalhe
// da tela mostra ("por que este entrou/saiu da conta").
export type AvaliacaoKmL = {
  km: number | null
  kml: number | null
  valido: boolean
  motivo: 'ok' | 'sem_hodometro' | 'kml_implausivel'
}

export function avaliarKmL(r: Pick<FlexRow, 'litros' | 'hodometro_anterior' | 'hodometro'>): AvaliacaoKmL {
  const litros = Number(r.litros) || 0
  const h0 = Number(r.hodometro_anterior)
  const h1 = Number(r.hodometro)
  if (litros <= 0 || !Number.isFinite(h0) || !Number.isFinite(h1) || h0 <= 0 || h1 <= h0) {
    return { km: null, kml: null, valido: false, motivo: 'sem_hodometro' }
  }
  const km = h1 - h0
  const kml = km / litros
  if (kml < KML_MIN || kml > KML_MAX) {
    return { km, kml, valido: false, motivo: 'kml_implausivel' }
  }
  return { km, kml, valido: true, motivo: 'ok' }
}

export function classificarCombustivel(c: string | null | undefined): Combustivel | null {
  const s = (c ?? '').toLowerCase()
  if (/etanol|álcool|alcool/.test(s)) return 'etanol'
  if (/gasolina/.test(s)) return 'gasolina'
  return null // diesel, arla etc. ficam fora do comparador
}

export type LadoCombustivel = {
  abastecimentos: number // total do combustível no período
  validos: number // com km/l aproveitável
  km: number
  litros: number // somatório dos VÁLIDOS (para km/l honesto)
  valor: number // somatório dos válidos (para R$/km honesto)
  litrosTotais: number
  valorTotal: number
  kmPorLitro: number | null
  custoPorKm: number | null
  precoMedioLitro: number | null // sobre todos os abastecimentos do combustível
}

export type VeiculoFlex = {
  placa: string
  modelo: string | null
  etanol: LadoCombustivel
  gasolina: LadoCombustivel
  // veredito só quando os dois lados têm amostra mínima
  veredito: 'etanol' | 'gasolina' | 'empate' | null
  economiaPct: number | null // quanto o vencedor economiza por km vs o outro
}

function ladoVazio(): LadoCombustivel {
  return {
    abastecimentos: 0,
    validos: 0,
    km: 0,
    litros: 0,
    valor: 0,
    litrosTotais: 0,
    valorTotal: 0,
    kmPorLitro: null,
    custoPorKm: null,
    precoMedioLitro: null,
  }
}

const MIN_VALIDOS = 2 // amostra mínima por combustível para emitir veredito

export function compararFlex(rows: FlexRow[]): VeiculoFlex[] {
  const porPlaca = new Map<string, VeiculoFlex>()

  for (const r of rows) {
    const comb = classificarCombustivel(r.combustivel)
    if (!comb) continue
    const litros = Number(r.litros) || 0
    if (litros <= 0) continue

    let v = porPlaca.get(r.placa)
    if (!v) {
      v = {
        placa: r.placa,
        modelo: r.modelo_veiculo,
        etanol: ladoVazio(),
        gasolina: ladoVazio(),
        veredito: null,
        economiaPct: null,
      }
      porPlaca.set(r.placa, v)
    }
    if (!v.modelo && r.modelo_veiculo) v.modelo = r.modelo_veiculo

    const lado = v[comb]
    const valor = Number(r.valor_total) || 0
    lado.abastecimentos += 1
    lado.litrosTotais += litros
    lado.valorTotal += valor

    // saneamento do km/l (mesma régua exposta em avaliarKmL)
    const av = avaliarKmL(r)
    if (!av.valido || av.km == null) continue

    lado.validos += 1
    lado.km += av.km
    lado.litros += litros
    lado.valor += valor
  }

  const out: VeiculoFlex[] = []
  for (const v of porPlaca.values()) {
    for (const lado of [v.etanol, v.gasolina]) {
      if (lado.validos > 0 && lado.litros > 0 && lado.km > 0) {
        lado.kmPorLitro = lado.km / lado.litros
        lado.custoPorKm = lado.valor / lado.km
      }
      if (lado.litrosTotais > 0) lado.precoMedioLitro = lado.valorTotal / lado.litrosTotais
    }

    // Quem usou só UM combustível também entra (sem veredito) — sumir da
    // lista escondia que o carro nunca testou o outro lado (o TKY6E68
    // abastecia muito e não aparecia). A tela mostra "só gasolina/etanol".

    if (
      v.etanol.validos >= MIN_VALIDOS &&
      v.gasolina.validos >= MIN_VALIDOS &&
      v.etanol.custoPorKm != null &&
      v.gasolina.custoPorKm != null
    ) {
      const e = v.etanol.custoPorKm
      const g = v.gasolina.custoPorKm
      const dif = Math.abs(e - g) / Math.max(e, g)
      if (dif < 0.03) {
        v.veredito = 'empate'
        v.economiaPct = 0
      } else if (e < g) {
        v.veredito = 'etanol'
        v.economiaPct = (g - e) / g
      } else {
        v.veredito = 'gasolina'
        v.economiaPct = (e - g) / e
      }
    }
    out.push(v)
  }

  // ordem: com veredito > testou os dois (amostra curta) > só um combustível;
  // dentro do grupo, maior economia / mais abastecimentos no topo
  const grupo = (v: VeiculoFlex) =>
    v.veredito != null ? 0 : v.etanol.abastecimentos > 0 && v.gasolina.abastecimentos > 0 ? 1 : 2
  out.sort((a, b) => {
    const ga = grupo(a), gb = grupo(b)
    if (ga !== gb) return ga - gb
    if (ga === 0) return (b.economiaPct ?? 0) - (a.economiaPct ?? 0)
    return (b.etanol.abastecimentos + b.gasolina.abastecimentos) - (a.etanol.abastecimentos + a.gasolina.abastecimentos)
  })
  return out
}
