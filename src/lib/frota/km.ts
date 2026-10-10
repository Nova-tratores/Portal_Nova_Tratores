// KM ATUAL de cada veículo — função PURA (Fase 2 da Frota, fatia 1, 10/10/2026).
//
// Regra "âncora + delta":
//  - ÂNCORA = a leitura humana conferida mais recente (foto do painel, entrada/
//    saída da oficina, checklist mensal, ajuste do gestor). É o número que
//    alguém olhou no painel.
//  - DELTA  = o que o rastreador rodou DEPOIS da âncora (frota_dias.km_odometro
//    é o km DO DIA, não o total). Sem rastreador, vale o maior hodômetro
//    digitado depois da âncora (abastecimento/requisição), se for coerente.
//  - Sem âncora: o odômetro do rastreador (comportamento de antes); sem ele, o
//    último hodômetro digitado coerente.
// A fonte e a idade sempre acompanham o número — a tela mostra de onde veio.
//
// Leitura humana que volta (mais de 50 km) ou salta demais fica SUSPEITA: não
// vira âncora até alguém confirmar.

export type FonteLeitura =
  | 'painel_foto' | 'oficina_entrada' | 'oficina_saida' | 'checklist' | 'ajuste_gestor'
  | 'abastecimento' | 'requisicao';

export type SituacaoLeitura = 'aceita' | 'suspeita' | 'descartada';

export interface Leitura {
  id?: string;
  em: string;          // ISO (data ou data+hora)
  km: number;
  fonte: FonteLeitura;
  situacao?: SituacaoLeitura;  // só as gravadas em frota_leituras têm; as demais são 'aceita'
}

/** km rodado num dia segundo o rastreador */
export interface DiaRastreador { data: string; km: number }
/** odômetro absoluto do rastreador num dia */
export interface OdometroRastreador { data: string; km: number }

export type TipoVeiculo = 'carro' | 'hatch' | 'picape' | 'caminhao' | 'munck' | string;

export type SeloKm = 'verde' | 'ambar' | 'vermelho' | 'cinza';

export interface ResultadoKm {
  km: number | null;
  /** texto pronto para a tela: "foto do painel 02/10 + 412 km do rastreador" */
  descricao: string;
  base: 'ancora' | 'rastreador' | 'digitado' | 'nenhuma';
  fonteAncora: FonteLeitura | null;
  dataBase: string | null;   // data da leitura que sustenta o número
  deltaKm: number;           // somado depois da base
  idadeDias: number | null;
  selo: SeloKm;
  /** leituras humanas que ficaram fora por incoerência (para a tela de conferência) */
  ignoradas: { leitura: Leitura; motivo: string }[];
}

const DIA = 86400_000;
export const TOLERANCIA_REGRESSAO_KM = 50;
export const IDADE_VERDE_DIAS = 15;
export const IDADE_AMBAR_DIAS = 45;

const HUMANAS: FonteLeitura[] = ['painel_foto', 'oficina_entrada', 'oficina_saida', 'checklist', 'ajuste_gestor'];
// empate na mesma hora: a mais confiável vence
const PRIORIDADE: Record<FonteLeitura, number> = {
  oficina_saida: 6, oficina_entrada: 5, painel_foto: 4, ajuste_gestor: 3, checklist: 2, abastecimento: 1, requisicao: 0,
};

export const ROTULO_FONTE: Record<FonteLeitura, string> = {
  painel_foto: 'foto do painel',
  oficina_entrada: 'entrada na oficina',
  oficina_saida: 'saída da oficina',
  checklist: 'checklist',
  ajuste_gestor: 'ajuste do gestor',
  abastecimento: 'digitado no abastecimento',
  requisicao: 'digitado na requisição',
};

export const ehHumana = (f: FonteLeitura) => HUMANAS.includes(f);

/** limite de km por dia acima do qual a leitura é suspeita */
export function limiteKmDia(tipo: TipoVeiculo | null | undefined): number {
  return tipo === 'caminhao' || tipo === 'munck' ? 1000 : 800;
}

const t = (s: string) => new Date(s.length <= 10 ? `${s}T12:00:00` : s).getTime();
const diaIso = (s: string) => s.slice(0, 10);
const fmtData = (s: string) => {
  const d = diaIso(s);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};
const fmtKm = (n: number) => Math.round(n).toLocaleString('pt-BR');

function ordenar(ls: Leitura[]): Leitura[] {
  return [...ls].sort((a, b) => (t(a.em) - t(b.em)) || (PRIORIDADE[a.fonte] - PRIORIDADE[b.fonte]));
}

export interface ValidacaoLeitura {
  situacao: 'aceita' | 'suspeita';
  motivos: string[];
  /** número provável quando parece erro de dígito */
  sugestao: number | null;
}

/**
 * Confere uma leitura nova contra a anterior aceita e contra o km esperado agora.
 * Pura: a mesma regra roda no navegador (antes de salvar) e no servidor.
 */
export function validarLeitura(
  nova: { km: number; em: string },
  ctx: { anterior: { km: number; em: string } | null; esperado: number | null; tipo?: TipoVeiculo | null },
): ValidacaoLeitura {
  const motivos: string[] = [];
  if (!Number.isFinite(nova.km) || nova.km < 100) motivos.push('Número muito baixo para um hodômetro.');
  const a = ctx.anterior;
  if (a && Number.isFinite(nova.km)) {
    if (nova.km < a.km - TOLERANCIA_REGRESSAO_KM) {
      motivos.push(`Menor que a leitura anterior (${fmtKm(a.km)} km em ${fmtData(a.em)}).`);
    } else {
      const dias = Math.max(1, (t(nova.em) - t(a.em)) / DIA);
      const porDia = (nova.km - a.km) / dias;
      if (porDia > limiteKmDia(ctx.tipo)) {
        motivos.push(`Daria ${fmtKm(porDia)} km por dia desde ${fmtData(a.em)} — alto demais.`);
      }
    }
  }
  let sugestao: number | null = null;
  if (motivos.length && ctx.esperado && ctx.esperado > 100) {
    sugestao = sugerirCorrecao(nova.km, ctx.esperado);
  }
  return { situacao: motivos.length ? 'suspeita' : 'aceita', motivos, sugestao };
}

/** Erro de dígito comum: um zero a mais/a menos ou dois dígitos vizinhos trocados. */
export function sugerirCorrecao(km: number, esperado: number): number | null {
  const perto = (x: number) => Math.abs(x - esperado) <= Math.max(500, esperado * 0.05);
  const candidatos: number[] = [km * 10, km / 10, Math.round(km / 10)];
  const s = String(Math.round(km));
  for (let i = 0; i < s.length - 1; i++) {
    const c = s.split('');
    [c[i], c[i + 1]] = [c[i + 1], c[i]];
    candidatos.push(Number(c.join('')));
  }
  const bons = candidatos.filter((x) => Number.isFinite(x) && x !== km && perto(x));
  if (!bons.length) return null;
  bons.sort((x, y) => Math.abs(x - esperado) - Math.abs(y - esperado));
  return Math.round(bons[0]);
}

function selo(idadeDias: number | null, base: ResultadoKm['base']): SeloKm {
  if (idadeDias == null || base === 'nenhuma') return 'cinza';
  if (base === 'rastreador') return idadeDias <= 3 ? 'verde' : idadeDias <= 15 ? 'ambar' : 'vermelho';
  if (base === 'digitado') return idadeDias <= IDADE_VERDE_DIAS ? 'ambar' : 'vermelho';
  return idadeDias <= IDADE_VERDE_DIAS ? 'verde' : idadeDias <= IDADE_AMBAR_DIAS ? 'ambar' : 'vermelho';
}

export function kmAtual(e: {
  agora: number;
  /** leituras humanas: frota_leituras + checklist */
  humanas: Leitura[];
  /** hodômetros digitados (abastecimento, requisição) */
  digitadas: Leitura[];
  odometro: OdometroRastreador | null;
  dias: DiaRastreador[];
  tipo?: TipoVeiculo | null;
}): ResultadoKm {
  const ignoradas: ResultadoKm['ignoradas'] = [];

  // 1) âncora: percorre as humanas em ordem e só aceita a que é coerente com a anterior aceita
  let ancora: Leitura | null = null;
  for (const l of ordenar(e.humanas.filter((x) => ehHumana(x.fonte)))) {
    if (l.situacao === 'descartada') continue;
    if (l.situacao === 'suspeita') { ignoradas.push({ leitura: l, motivo: 'Aguardando conferência.' }); continue; }
    const v = validarLeitura(l, { anterior: ancora, esperado: null, tipo: e.tipo });
    // a leitura confirmada à mão (ajuste do gestor) vale mesmo se destoar
    if (v.situacao === 'suspeita' && l.fonte !== 'ajuste_gestor') {
      ignoradas.push({ leitura: l, motivo: v.motivos.join(' ') });
      continue;
    }
    ancora = l;
  }

  const somaDepois = (data: string) => e.dias
    .filter((d) => diaIso(d.data) > diaIso(data))
    .reduce((s, d) => s + (Number(d.km) || 0), 0);
  const temRastreador = !!e.odometro || e.dias.length > 0;

  // digitadas coerentes (só sobem) — usadas sem rastreador
  const digitadasOk: Leitura[] = [];
  for (const l of ordenar(e.digitadas)) {
    const ultimaOk = digitadasOk[digitadasOk.length - 1] || null;
    const ref = ultimaOk ?? (ancora && t(ancora.em) <= t(l.em) ? ancora : null);
    if (validarLeitura(l, { anterior: ref, esperado: null, tipo: e.tipo }).situacao === 'aceita') digitadasOk.push(l);
  }

  const idade = (data: string) => Math.max(0, Math.floor((e.agora - t(data)) / DIA));

  if (ancora) {
    if (temRastreador) {
      const delta = somaDepois(ancora.em);
      const km = ancora.km + delta;
      return {
        km, base: 'ancora', fonteAncora: ancora.fonte, dataBase: ancora.em, deltaKm: delta,
        idadeDias: idade(ancora.em), selo: selo(idade(ancora.em), 'ancora'), ignoradas,
        descricao: `${ROTULO_FONTE[ancora.fonte]} ${fmtData(ancora.em)}${delta ? ` + ${fmtKm(delta)} km do rastreador` : ''}`,
      };
    }
    const depois = digitadasOk.filter((d) => t(d.em) > t(ancora!.em) && d.km >= ancora!.km);
    const ult = depois[depois.length - 1];
    if (ult) {
      return {
        km: ult.km, base: 'ancora', fonteAncora: ancora.fonte, dataBase: ult.em, deltaKm: ult.km - ancora.km,
        idadeDias: idade(ult.em), selo: selo(idade(ancora.em), 'ancora'), ignoradas,
        descricao: `${ROTULO_FONTE[ancora.fonte]} ${fmtData(ancora.em)}, ${ROTULO_FONTE[ult.fonte]} ${fmtData(ult.em)}`,
      };
    }
    return {
      km: ancora.km, base: 'ancora', fonteAncora: ancora.fonte, dataBase: ancora.em, deltaKm: 0,
      idadeDias: idade(ancora.em), selo: selo(idade(ancora.em), 'ancora'), ignoradas,
      descricao: `${ROTULO_FONTE[ancora.fonte]} ${fmtData(ancora.em)}`,
    };
  }

  if (e.odometro) {
    const delta = somaDepois(e.odometro.data);
    return {
      km: e.odometro.km + delta, base: 'rastreador', fonteAncora: null, dataBase: e.odometro.data, deltaKm: delta,
      idadeDias: idade(e.odometro.data), selo: selo(idade(e.odometro.data), 'rastreador'), ignoradas,
      descricao: `rastreador ${fmtData(e.odometro.data)}${delta ? ` + ${fmtKm(delta)} km` : ''}`,
    };
  }

  const ult = digitadasOk[digitadasOk.length - 1];
  if (ult) {
    // digitado é a base; o rastreador soma o que rodou depois (o odômetro do
    // rastreador costuma estar parado — o km do dia por GPS continua chegando)
    const delta = temRastreador ? somaDepois(ult.em) : 0;
    return {
      km: ult.km + delta, base: 'digitado', fonteAncora: null, dataBase: ult.em, deltaKm: delta,
      idadeDias: idade(ult.em), selo: selo(idade(ult.em), 'digitado'), ignoradas,
      descricao: `${ROTULO_FONTE[ult.fonte]} ${fmtData(ult.em)}${delta ? ` + ${fmtKm(delta)} km do rastreador` : ''}`,
    };
  }

  return {
    km: null, base: 'nenhuma', fonteAncora: null, dataBase: null, deltaKm: 0,
    idadeDias: null, selo: 'cinza', ignoradas, descricao: 'sem leitura de km',
  };
}

/** Km confiável = âncora recente ou rastreador em dia. */
export function kmConfiavel(r: ResultadoKm): boolean {
  return r.selo === 'verde';
}
