// Agregações do dashboard de Abastecimento — funções puras sobre as linhas
// já buscadas do banco (alguns milhares/ano: agregar em JS é suficiente).
//
// O route busca uma janela ESTENDIDA (13 meses antes do início do período)
// para os comparativos mês anterior / mesmo mês do ano passado, a projeção
// e o histórico das anomalias; os rankings usam só a janela do usuário.

import type {
  AbcItem,
  VeiculoMes,
  AnomaliaConsumo,
  CombustivelItem,
  ConsumoVeiculo,
  DashboardAbastecimento,
  EvolucaoMes,
  HeatmapCelula,
  IntervaloPonto,
  OsGasto,
  ProjecaoMes,
  RankingItem,
  SerieMensalPorCombustivel,
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
  capacidade_tanque: number | null;
  ordem_servico: string | null;
  departamento: string | null;
}

// Placas "especiais" da operadora (abastecimento avulso de clientes/tratores):
// entram nos gastos mas ficam fora do cálculo de km/l (não têm hodômetro real).
const PLACAS_SEM_CONSUMO = new Set(['CLI0002', 'TRA0001']);

// Filtro de sanidade do km/l: hodômetro é digitado pelo motorista e vem com
// erros grosseiros no arquivo real (deltas de -99.359 km e +100.259 km).
const DELTA_KM_MAX = 5000;

// Anomalia de consumo: km/l do último trecho a mais de N desvios-padrão
// ABAIXO da média histórica do próprio veículo.
const ANOMALIA_DESVIOS = 2;
const ANOMALIA_MIN_TRECHOS = 5;

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// Horário de Brasília (offset fixo -03:00, como o dado foi gravado).
// O Supabase devolve timestamptz em UTC — usar slice() direto no ISO erraria
// o mês/dia/hora nas transações do fim do dia.
// ---------------------------------------------------------------------------
export function localBR(iso: string): { mes: string; dia: number; hora: number } {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { mes, dia: d.getUTCDay(), hora: d.getUTCHours() };
}

function mesAnteriorDe(mes: string, quantos = 1): string {
  const [ano, m] = mes.split('-').map(Number);
  const total = ano * 12 + (m - 1) - quantos;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function mesesEntre(deIso: string, ateIso: string): string[] {
  const meses: string[] = [];
  let mes = deIso.slice(0, 7);
  const fim = ateIso.slice(0, 7);
  for (let i = 0; i < 60 && mes <= fim; i++) {
    meses.push(mes);
    mes = mesAnteriorDe(mes, -1);
  }
  return meses;
}

function varPct(atual: number, base: number | null): number | null {
  if (base == null || base <= 0) return null;
  return ((atual - base) / base) * 100;
}

// ---------------------------------------------------------------------------
// Totais, evolução e séries mensais
// ---------------------------------------------------------------------------

export function calcularTotais(linhas: LinhaDash[]): Omit<TotaisDash, 'varMesAnterior'> {
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

function totaisPorMes(linhas: LinhaDash[]): Map<string, { litros: number; valor: number }> {
  const meses = new Map<string, { litros: number; valor: number }>();
  for (const l of linhas) {
    const mes = localBR(l.data_transacao).mes;
    const t = meses.get(mes) || { litros: 0, valor: 0 };
    t.litros += num(l.litros);
    t.valor += num(l.valor_total);
    meses.set(mes, t);
  }
  return meses;
}

// Evolução dos meses da janela com comparativos vindos da janela estendida.
export function evolucaoMensal(ext: LinhaDash[], de: string, ate: string): EvolucaoMes[] {
  const porMes = totaisPorMes(ext);
  return mesesEntre(de, ate).map((mes) => {
    const atual = porMes.get(mes) || { litros: 0, valor: 0 };
    const mesAnt = porMes.get(mesAnteriorDe(mes, 1));
    const anoAnt = porMes.get(mesAnteriorDe(mes, 12));
    return {
      mes,
      litros: atual.litros,
      valor: atual.valor,
      valorAnoAnterior: anoAnt ? anoAnt.valor : null,
      litrosAnoAnterior: anoAnt ? anoAnt.litros : null,
      varMes: varPct(atual.valor, mesAnt ? mesAnt.valor : null),
      varAno: varPct(atual.valor, anoAnt ? anoAnt.valor : null),
    };
  });
}

// Combustíveis em ordem fixa (litros desc na janela) — ordem das séries/cores.
export function combustiveisOrdenados(linhas: LinhaDash[], max = 6): string[] {
  const litros = new Map<string, number>();
  for (const l of linhas) {
    const c = l.combustivel || 'Não informado';
    litros.set(c, (litros.get(c) || 0) + num(l.litros));
  }
  return [...litros.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => c);
}

// Pivots mensais por combustível: preço médio/L e gasto (R$).
export function seriesMensaisPorCombustivel(
  linhas: LinhaDash[],
  combustiveis: string[],
  de: string,
  ate: string,
): { precoMensal: SerieMensalPorCombustivel[]; gastoMensalCombustivel: SerieMensalPorCombustivel[] } {
  const acc = new Map<string, { litros: number; valor: number }>(); // 'mes|comb'
  for (const l of linhas) {
    const c = l.combustivel || 'Não informado';
    if (!combustiveis.includes(c)) continue;
    const chave = `${localBR(l.data_transacao).mes}|${c}`;
    const t = acc.get(chave) || { litros: 0, valor: 0 };
    t.litros += num(l.litros);
    t.valor += num(l.valor_total);
    acc.set(chave, t);
  }
  const meses = mesesEntre(de, ate);
  const precoMensal = meses.map((mes) => {
    const row: SerieMensalPorCombustivel = { mes };
    for (const c of combustiveis) {
      const t = acc.get(`${mes}|${c}`);
      row[c] = t && t.litros > 0 ? t.valor / t.litros : null;
    }
    return row;
  });
  const gastoMensalCombustivel = meses.map((mes) => {
    const row: SerieMensalPorCombustivel = { mes };
    for (const c of combustiveis) row[c] = acc.get(`${mes}|${c}`)?.valor || 0;
    return row;
  });
  return { precoMensal, gastoMensalCombustivel };
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

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

export const porDepartamento = (linhas: LinhaDash[]) =>
  ranking(linhas, (l) => l.departamento || 'Sem departamento', () => null);

export function porCombustivel(linhas: LinhaDash[]): CombustivelItem[] {
  return ranking(linhas, (l) => l.combustivel || 'Não informado', () => null).map((r) => ({
    combustivel: r.chave,
    litros: r.litros,
    valor: r.valor,
    precoMedio: r.litros > 0 ? r.valor / r.litros : 0,
  }));
}

// ---------------------------------------------------------------------------
// Trechos de hodômetro (base do km/l, R$/km e anomalias)
// ---------------------------------------------------------------------------

interface Trecho {
  deltaKm: number;
  litros: number;
  valor: number;
  kml: number;
  dataFim: string;
}

interface TrechosVeiculo {
  trechos: Trecho[];
  descartados: number;
  modelo: string | null;
}

// Registros com hodometro > 0 são "marcos"; trecho = entre marcos consecutivos.
// Descartado se deltaKm <= 0 ou > DELTA_KM_MAX (erro de digitação). Litros/valor
// do trecho = todos os abastecimentos DEPOIS do marco A até B inclusive.
export function trechosPorVeiculo(linhas: LinhaDash[]): Map<string, TrechosVeiculo> {
  const porPlaca = new Map<string, LinhaDash[]>();
  for (const l of linhas) {
    if (PLACAS_SEM_CONSUMO.has(l.placa)) continue;
    const arr = porPlaca.get(l.placa) || [];
    arr.push(l);
    porPlaca.set(l.placa, arr);
  }

  const resultado = new Map<string, TrechosVeiculo>();
  for (const [placa, regs] of porPlaca) {
    regs.sort((a, b) => a.data_transacao.localeCompare(b.data_transacao));
    const tv: TrechosVeiculo = {
      trechos: [],
      descartados: 0,
      modelo: regs.find((r) => r.modelo_veiculo)?.modelo_veiculo || null,
    };

    let marcoAnterior: number | null = null;
    let litrosDesdeMarco = 0;
    let valorDesdeMarco = 0;

    for (const r of regs) {
      const marco = num(r.hodometro) > 0 ? num(r.hodometro) : null;
      if (marcoAnterior != null) {
        litrosDesdeMarco += num(r.litros);
        valorDesdeMarco += num(r.valor_total);
      }
      if (marco == null) continue;

      if (marcoAnterior != null) {
        const delta = marco - marcoAnterior;
        if (delta > 0 && delta <= DELTA_KM_MAX && litrosDesdeMarco > 0) {
          tv.trechos.push({
            deltaKm: delta,
            litros: litrosDesdeMarco,
            valor: valorDesdeMarco,
            kml: delta / litrosDesdeMarco,
            dataFim: r.data_transacao,
          });
        } else {
          tv.descartados++;
        }
      }
      marcoAnterior = marco;
      litrosDesdeMarco = 0;
      valorDesdeMarco = 0;
    }
    if (tv.trechos.length || tv.descartados) resultado.set(placa, tv);
  }
  return resultado;
}

export function consumoPorVeiculo(linhas: LinhaDash[]): ConsumoVeiculo[] {
  const resultado: ConsumoVeiculo[] = [];
  for (const [placa, tv] of trechosPorVeiculo(linhas)) {
    const kmRodado = tv.trechos.reduce((s, t) => s + t.deltaKm, 0);
    const litros = tv.trechos.reduce((s, t) => s + t.litros, 0);
    const valor = tv.trechos.reduce((s, t) => s + t.valor, 0);
    resultado.push({
      placa,
      modelo: tv.modelo,
      kmRodado,
      litrosConsiderados: litros,
      valorConsiderado: valor,
      kmPorLitro: litros > 0 ? kmRodado / litros : 0,
      custoPorKm: kmRodado > 0 ? valor / kmRodado : 0,
      trechos: tv.trechos.length,
      trechosDescartados: tv.descartados,
    });
  }
  return resultado.sort((a, b) => b.kmRodado - a.kmRodado);
}

// Anomalia: km/l do último trecho caiu além de N desvios-padrão da média
// histórica do próprio veículo (possível problema mecânico, vazamento, desvio).
export function anomaliasConsumo(linhasExt: LinhaDash[]): AnomaliaConsumo[] {
  const anomalias: AnomaliaConsumo[] = [];
  for (const [placa, tv] of trechosPorVeiculo(linhasExt)) {
    if (tv.trechos.length < ANOMALIA_MIN_TRECHOS) continue;
    const hist = tv.trechos.slice(0, -1).map((t) => t.kml);
    const ultimo = tv.trechos[tv.trechos.length - 1].kml;
    const media = hist.reduce((s, v) => s + v, 0) / hist.length;
    const variancia = hist.reduce((s, v) => s + (v - media) ** 2, 0) / hist.length;
    const desvio = Math.sqrt(variancia);
    if (desvio <= 0) continue;
    const desviosAbaixo = (media - ultimo) / desvio;
    if (desviosAbaixo >= ANOMALIA_DESVIOS) {
      anomalias.push({
        placa,
        modelo: tv.modelo,
        kmlMedio: media,
        kmlRecente: ultimo,
        desvios: desviosAbaixo,
        trechos: tv.trechos.length,
      });
    }
  }
  return anomalias.sort((a, b) => b.desvios - a.desvios);
}

// ---------------------------------------------------------------------------
// Auditoria: intervalo entre abastecimentos e heatmap dia × hora
// ---------------------------------------------------------------------------

export function intervalosAbastecimento(linhas: LinhaDash[]): IntervaloPonto[] {
  const porPlaca = new Map<string, LinhaDash[]>();
  for (const l of linhas) {
    const arr = porPlaca.get(l.placa) || [];
    arr.push(l);
    porPlaca.set(l.placa, arr);
  }
  const pontos: IntervaloPonto[] = [];
  for (const [placa, regs] of porPlaca) {
    regs.sort((a, b) => a.data_transacao.localeCompare(b.data_transacao));
    for (let i = 1; i < regs.length; i++) {
      const r = regs[i];
      const horas = (new Date(r.data_transacao).getTime() - new Date(regs[i - 1].data_transacao).getTime()) / 3600_000;
      const cap = num(r.capacidade_tanque) > 0 && num(r.capacidade_tanque) < 900 ? num(r.capacidade_tanque) : null;
      let motivo: string | null = null;
      if (cap && num(r.litros) > cap) motivo = 'Litros acima da capacidade do tanque';
      else if (horas < 6) motivo = 'Dois abastecimentos em menos de 6h';
      else if (horas < 24 && cap && num(r.litros) >= 0.75 * cap) motivo = 'Tanque quase cheio de novo em menos de 24h';
      pontos.push({
        placa,
        data: r.data_transacao,
        horas,
        litros: num(r.litros),
        capacidade: cap,
        suspeito: motivo != null,
        motivo,
      });
    }
  }
  return pontos;
}

export function heatmapDiaHora(linhas: LinhaDash[]): HeatmapCelula[] {
  const celulas = new Map<string, HeatmapCelula>();
  for (const l of linhas) {
    const { dia, hora } = localBR(l.data_transacao);
    const chave = `${dia}|${hora}`;
    const c = celulas.get(chave) || { dia, hora, qtd: 0, valor: 0 };
    c.qtd += 1;
    c.valor += num(l.valor_total);
    celulas.set(chave, c);
  }
  return [...celulas.values()];
}

// Série mensal por veículo — base do comparativo entre veículos. km/l do mês
// = trechos de hodômetro FECHADOS naquele mês (null se nenhum trecho válido).
export function serieMensalPorPlaca(linhas: LinhaDash[]): VeiculoMes[] {
  const acc = new Map<string, VeiculoMes>(); // 'placa|mes'
  for (const l of linhas) {
    const mes = localBR(l.data_transacao).mes;
    const chave = `${l.placa}|${mes}`;
    const item = acc.get(chave) || { placa: l.placa, mes, litros: 0, valor: 0, kml: null };
    item.litros += num(l.litros);
    item.valor += num(l.valor_total);
    acc.set(chave, item);
  }
  // km/l: soma dos trechos por mês de fechamento
  const kmMes = new Map<string, { km: number; litros: number }>();
  for (const [placa, tv] of trechosPorVeiculo(linhas)) {
    for (const t of tv.trechos) {
      const chave = `${placa}|${localBR(t.dataFim).mes}`;
      const k = kmMes.get(chave) || { km: 0, litros: 0 };
      k.km += t.deltaKm;
      k.litros += t.litros;
      kmMes.set(chave, k);
    }
  }
  for (const [chave, k] of kmMes) {
    const item = acc.get(chave);
    if (item && k.litros > 0) item.kml = k.km / k.litros;
  }
  return [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// ---------------------------------------------------------------------------
// Curva ABC, gasto por OS e projeção do mês
// ---------------------------------------------------------------------------

export function curvaAbc(rankingVeiculos: RankingItem[]): AbcItem[] {
  const total = rankingVeiculos.reduce((s, v) => s + v.valor, 0);
  if (total <= 0) return [];
  let acumulado = 0;
  return rankingVeiculos.map((v) => {
    acumulado += v.valor;
    const pctAcum = (acumulado / total) * 100;
    return {
      placa: v.chave,
      modelo: v.detalhe,
      valor: v.valor,
      pct: (v.valor / total) * 100,
      pctAcum,
      classe: pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C',
    };
  });
}

export function gastoPorOS(linhas: LinhaDash[]): OsGasto[] {
  const grupos = new Map<string, OsGasto>();
  for (const l of linhas) {
    if (!l.ordem_servico) continue;
    const g = grupos.get(l.ordem_servico) || { os: l.ordem_servico, valor: 0, litros: 0, transacoes: 0, placas: [] };
    g.valor += num(l.valor_total);
    g.litros += num(l.litros);
    g.transacoes += 1;
    if (!g.placas.includes(l.placa)) g.placas.push(l.placa);
    grupos.set(l.ordem_servico, g);
  }
  return [...grupos.values()].sort((a, b) => b.valor - a.valor);
}

// Projeção do mês corrente pelo ritmo diário até agora.
export function projecaoMesAtual(ext: LinhaDash[], agora: Date): ProjecaoMes | null {
  const { mes } = localBR(agora.toISOString());
  const realizado = ext
    .filter((l) => localBR(l.data_transacao).mes === mes)
    .reduce((s, l) => s + num(l.valor_total), 0);
  if (realizado <= 0) return null;
  const brasilia = new Date(agora.getTime() - 3 * 3600_000);
  const diasCorridos = brasilia.getUTCDate();
  const diasMes = new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth() + 1, 0)).getUTCDate();
  return { mes, realizado, projetado: (realizado / diasCorridos) * diasMes, diasCorridos, diasMes };
}

// ---------------------------------------------------------------------------

export function montarDashboard(
  janela: LinhaDash[],
  ext: LinhaDash[],
  periodo: { de: string; ate: string },
  agora: Date,
): DashboardAbastecimento {
  const evolucao = evolucaoMensal(ext, periodo.de, periodo.ate);
  const combustiveis = combustiveisOrdenados(janela);
  const { precoMensal, gastoMensalCombustivel } = seriesMensaisPorCombustivel(
    janela, combustiveis, periodo.de, periodo.ate,
  );
  const rankingVeiculos = porVeiculo(janela);
  const ultimoMesComDado = [...evolucao].reverse().find((m) => m.valor > 0);
  return {
    periodo,
    totais: { ...calcularTotais(janela), varMesAnterior: ultimoMesComDado?.varMes ?? null },
    evolucaoMensal: evolucao,
    combustiveis,
    precoMensal,
    gastoMensalCombustivel,
    porVeiculo: rankingVeiculos,
    porMotorista: porMotorista(janela),
    porPosto: porPosto(janela),
    porDepartamento: porDepartamento(janela),
    porCombustivel: porCombustivel(janela),
    consumo: consumoPorVeiculo(janela),
    anomalias: anomaliasConsumo(ext),
    intervalos: intervalosAbastecimento(janela),
    heatmap: heatmapDiaHora(janela),
    abc: curvaAbc(rankingVeiculos),
    porOS: gastoPorOS(janela),
    porVeiculoMes: serieMensalPorPlaca(janela),
    projecao: projecaoMesAtual(ext, agora),
    opcoesFiltro: {
      filiais: [...new Set(janela.map((l) => l.filial_nome).filter(Boolean) as string[])].sort(),
      placas: [...new Set(janela.map((l) => l.placa))].sort(),
      veiculos: (() => {
        const modelos = new Map<string, string | null>();
        for (const l of janela) if (!modelos.has(l.placa) || !modelos.get(l.placa)) modelos.set(l.placa, l.modelo_veiculo);
        return [...modelos.entries()]
          .map(([placa, modelo]) => ({ placa, modelo }))
          .sort((a, b) => (a.modelo || 'zzz').localeCompare(b.modelo || 'zzz', 'pt-BR') || a.placa.localeCompare(b.placa));
      })(),
      motoristas: [...new Set(janela.map((l) => l.motorista_nome).filter(Boolean) as string[])].sort(),
      departamentos: [...new Set(janela.map((l) => l.departamento).filter(Boolean) as string[])].sort(),
    },
  };
}
