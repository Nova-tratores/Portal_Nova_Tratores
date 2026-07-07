// Agregações do dashboard de Abastecimento — funções puras sobre as linhas
// já buscadas do banco (alguns milhares/ano: agregar em JS é suficiente).

import type {
  CombustivelItem,
  ConsumoVeiculo,
  DashboardAbastecimento,
  EvolucaoMes,
  RankingItem,
  TotaisDash,
} from './tipos';

// Subconjunto de colunas que o dashboard busca do banco.
export interface LinhaDash {
  placa: string;
  id_placa: number | null;
  modelo_veiculo: string | null;
  filial_nome: string | null;
  motorista_nome: string | null;
  posto_nome: string | null;
  posto_cidade: string | null;
  combustivel: string | null;
  litros: number;
  valor_total: number | null;
  hodometro: number | null;
  data_transacao: string;
}

// Placas "especiais" da operadora (abastecimento avulso de clientes/tratores):
// entram nos gastos mas ficam fora do cálculo de km/l (não têm hodômetro real).
const PLACAS_SEM_CONSUMO = new Set(['CLI0002', 'TRA0001']);

// Filtro de sanidade do km/l: hodômetro é digitado pelo motorista e vem com
// erros grosseiros no arquivo real (deltas de -99.359 km e +100.259 km).
const DELTA_KM_MAX = 5000;

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function calcularTotais(linhas: LinhaDash[]): TotaisDash {
  const litros = linhas.reduce((s, l) => s + num(l.litros), 0);
  const valor = linhas.reduce((s, l) => s + num(l.valor_total), 0);
  return {
    litros,
    valor,
    transacoes: linhas.length,
    veiculos: new Set(linhas.map((l) => l.placa)).size,
    precoMedioLitro: litros > 0 ? valor / litros : 0,
  };
}

export function evolucaoMensal(linhas: LinhaDash[]): EvolucaoMes[] {
  const meses = new Map<string, EvolucaoMes>();
  for (const l of linhas) {
    const mes = l.data_transacao.slice(0, 7);
    const item = meses.get(mes) || { mes, litros: 0, valor: 0 };
    item.litros += num(l.litros);
    item.valor += num(l.valor_total);
    meses.set(mes, item);
  }
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// Ranking genérico (desc por valor). `chave`/`detalhe` extraídos da linha.
function ranking(
  linhas: LinhaDash[],
  chaveDe: (l: LinhaDash) => string,
  detalheDe: (l: LinhaDash) => string | null,
): RankingItem[] {
  const grupos = new Map<string, RankingItem>();
  for (const l of linhas) {
    const chave = chaveDe(l);
    const item = grupos.get(chave) || { chave, detalhe: detalheDe(l), litros: 0, valor: 0, transacoes: 0 };
    item.litros += num(l.litros);
    item.valor += num(l.valor_total);
    item.transacoes += 1;
    if (!item.detalhe) item.detalhe = detalheDe(l);
    grupos.set(chave, item);
  }
  return [...grupos.values()].sort((a, b) => b.valor - a.valor);
}

export const porVeiculo = (linhas: LinhaDash[]) =>
  ranking(linhas, (l) => l.placa, (l) => l.modelo_veiculo);

export const porMotorista = (linhas: LinhaDash[]) =>
  ranking(linhas, (l) => l.motorista_nome || 'Sem motorista', () => null);

export const porPosto = (linhas: LinhaDash[]) =>
  ranking(linhas, (l) => l.posto_nome || 'Posto não informado', (l) => l.posto_cidade);

export function porCombustivel(linhas: LinhaDash[]): CombustivelItem[] {
  return ranking(linhas, (l) => l.combustivel || 'Não informado', () => null).map((r) => ({
    combustivel: r.chave,
    litros: r.litros,
    valor: r.valor,
    precoMedio: r.litros > 0 ? r.valor / r.litros : 0,
  }));
}

// Consumo (km/l) por veículo via hodômetro digitado:
//  - registros com hodometro > 0 são "marcos"; trecho = entre marcos consecutivos;
//  - trecho descartado se deltaKm <= 0 ou > DELTA_KM_MAX (erro de digitação);
//  - litros do trecho = todos os abastecimentos DEPOIS do marco A até B inclusive
//    (inclui abastecimentos sem hodômetro no meio — senão o km/l inflaria);
//  - km/l do veículo = Σ deltas válidos / Σ litros dos trechos válidos.
export function consumoPorVeiculo(linhas: LinhaDash[]): ConsumoVeiculo[] {
  const porPlaca = new Map<string, LinhaDash[]>();
  for (const l of linhas) {
    if (PLACAS_SEM_CONSUMO.has(l.placa)) continue;
    const arr = porPlaca.get(l.placa) || [];
    arr.push(l);
    porPlaca.set(l.placa, arr);
  }

  const resultado: ConsumoVeiculo[] = [];
  for (const [placa, regs] of porPlaca) {
    regs.sort((a, b) => a.data_transacao.localeCompare(b.data_transacao));

    let kmRodado = 0;
    let litrosConsiderados = 0;
    let trechos = 0;
    let trechosDescartados = 0;

    let marcoAnterior: number | null = null; // hodômetro do último marco
    let litrosDesdeMarco = 0; // litros abastecidos depois do último marco

    for (const r of regs) {
      const marco = num(r.hodometro) > 0 ? num(r.hodometro) : null;
      if (marcoAnterior != null) litrosDesdeMarco += num(r.litros);
      if (marco == null) continue;

      if (marcoAnterior != null) {
        const delta = marco - marcoAnterior;
        if (delta > 0 && delta <= DELTA_KM_MAX && litrosDesdeMarco > 0) {
          kmRodado += delta;
          litrosConsiderados += litrosDesdeMarco;
          trechos++;
        } else {
          trechosDescartados++;
        }
      }
      marcoAnterior = marco;
      litrosDesdeMarco = 0;
    }

    if (trechos > 0 || trechosDescartados > 0) {
      resultado.push({
        placa,
        modelo: regs.find((r) => r.modelo_veiculo)?.modelo_veiculo || null,
        kmRodado,
        litrosConsiderados,
        kmPorLitro: litrosConsiderados > 0 ? kmRodado / litrosConsiderados : 0,
        trechos,
        trechosDescartados,
      });
    }
  }
  return resultado.sort((a, b) => b.kmRodado - a.kmRodado);
}

export function montarDashboard(
  linhas: LinhaDash[],
  periodo: { de: string; ate: string },
): DashboardAbastecimento {
  return {
    periodo,
    totais: calcularTotais(linhas),
    evolucaoMensal: evolucaoMensal(linhas),
    porVeiculo: porVeiculo(linhas),
    porMotorista: porMotorista(linhas),
    porPosto: porPosto(linhas),
    porCombustivel: porCombustivel(linhas),
    consumo: consumoPorVeiculo(linhas),
    opcoesFiltro: {
      filiais: [...new Set(linhas.map((l) => l.filial_nome).filter(Boolean) as string[])].sort(),
      placas: [...new Set(linhas.map((l) => l.placa))].sort(),
    },
  };
}
