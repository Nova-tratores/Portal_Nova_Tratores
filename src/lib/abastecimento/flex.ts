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

    // saneamento do km/l
    const h0 = Number(r.hodometro_anterior)
    const h1 = Number(r.hodometro)
    if (!Number.isFinite(h0) || !Number.isFinite(h1) || h0 <= 0 || h1 <= h0) continue
    const km = h1 - h0
    const kml = km / litros
    if (kml < KML_MIN || kml > KML_MAX) continue

    lado.validos += 1
    lado.km += km
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

    // só interessa quem usou os dois combustíveis no período
    if (v.etanol.abastecimentos === 0 || v.gasolina.abastecimentos === 0) continue

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

  // veículos com veredito primeiro, maior economia no topo
  out.sort((a, b) => {
    if ((a.veredito != null) !== (b.veredito != null)) return a.veredito != null ? -1 : 1
    return (b.economiaPct ?? 0) - (a.economiaPct ?? 0)
  })
  return out
}
