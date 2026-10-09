// Regras PURAS da grade "ano × mês" do histórico de um card do Dashboard de
// Vendas (recupera o painel "Histórico desde Jan/2023" do app antigo).
//
// Uma linha por ano; 12 meses; 4 trimestres (soma de 3 meses); total do ano
// com ticket médio. Δ% contra o período anterior (MoM: mês/trimestre
// anterior) ou o mesmo período do ano anterior (YoY).
//
// Regras de honestidade (diferem do app antigo de propósito):
//   - mês corrente é PARCIAL → mostra o valor, sem Δ (comparar 8 dias com um
//     mês cheio sempre "cai");
//   - trimestre só tem Δ quando os DOIS lados estão completos (3 meses fechados);
//   - total do ano corrente compara só os meses FECHADOS com os mesmos meses do
//     ano anterior (não o acumulado parcial contra o ano cheio);
//   - base zero ou ausente → sem Δ; base abaixo de `baseMin` → Δ marcado como
//     "base pequena" (a tela pinta de cinza).

export type Metrica = 'venda' | 'custo' | 'margem';
export type Comparacao = 'mom' | 'yoy';

export interface PontoMes {
  mes: number; // 1..12
  ano: number;
  valor: number;
  custo: number;
  /** Pedidos (peças) ou OS com nota (serviços) — base do ticket médio. null = não se sabe. */
  qtde: number | null;
}

export interface Delta {
  pct: number;
  basePequena: boolean;
}

export interface CelulaMes {
  mes: number;
  valor: number | null; // null = sem dado / futuro
  qtde: number | null;
  parcial: boolean;
  /** Só no mês corrente: valor ÷ (dias úteis decorridos ÷ dias úteis do mês). */
  projetado: number | null;
  futuro: boolean;
  delta: Delta | null;
}

export interface CelulaTrimestre {
  tri: number; // 1..4
  valor: number | null;
  completo: boolean;
  /** Δ conforme `comparacao` (igual aos meses). */
  delta: Delta | null;
  /** Δ vs trimestre anterior — sempre calculado (vista "Trimestres" mostra os dois). */
  deltaAnt: Delta | null;
  /** Δ vs mesmo trimestre do ano anterior — sempre calculado. */
  deltaAno: Delta | null;
}

export interface LinhaAno {
  ano: number;
  meses: CelulaMes[];
  trimestres: CelulaTrimestre[];
  total: number;
  qtde: number | null;
  ticket: number | null;
  /** Meses fechados que entram no Δ do ano (12 = ano completo). */
  mesesFechados: number;
  delta: Delta | null;
}

export interface Grade {
  anos: LinhaAno[]; // mais recente primeiro
  maxMes: number; // maior valor de mês (escala das mini-barras)
}

const chave = (ano: number, mes: number) => ano * 100 + mes;

/** Mínimo de dias úteis FECHADOS no mês para projetar (antes disso o ritmo engana). */
export const PROJECAO_MIN_DIAS = 5;

const isoDia = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * Dias úteis (seg–sex, fora `feriados` em ISO) do dia 1 até `ateDia`
 * (inclusive; sem ele, o mês inteiro).
 */
export function diasUteis(ano: number, mes: number, feriados: Set<string>, ateDia?: number): number {
  const ultimo = new Date(ano, mes, 0).getDate();
  const limite = Math.min(ateDia ?? ultimo, ultimo);
  let n = 0;
  for (let d = 1; d <= limite; d++) {
    const dow = new Date(ano, mes - 1, d).getDay();
    if (dow !== 0 && dow !== 6 && !feriados.has(isoDia(ano, mes, d))) n++;
  }
  return n;
}

/** Projeção linear pelo ritmo dos dias úteis fechados; null antes de PROJECAO_MIN_DIAS. */
export function projetarMes(valor: number, decorridos: number, total: number): number | null {
  if (decorridos < PROJECAO_MIN_DIAS || total <= 0 || decorridos > total) return null;
  return valor * (total / decorridos);
}

export function valorDaMetrica(p: Pick<PontoMes, 'valor' | 'custo'>, m: Metrica): number {
  return m === 'venda' ? p.valor : m === 'custo' ? p.custo : p.valor - p.custo;
}

/** Δ% de `atual` sobre `base`. Base ≤ 0 ou ausente → null. */
export function delta(atual: number | null, base: number | null, baseMin: number): Delta | null {
  if (atual == null || base == null || base <= 0) return null;
  return { pct: ((atual - base) / base) * 100, basePequena: base < baseMin };
}

export function montarGrade(
  pontos: PontoMes[],
  opts: {
    metrica: Metrica; comparacao: Comparacao; hoje: Date; anoInicial: number; baseMin: number;
    /** Dias úteis do mês corrente (com feriados) — habilita a projeção. */
    diasUteisMes?: { decorridos: number; total: number } | null;
  },
): Grade {
  const { metrica, comparacao, hoje, anoInicial, baseMin, diasUteisMes } = opts;
  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth() + 1;
  const kHoje = chave(anoHoje, mesHoje);
  // Antes do 1º mês com venda a série é "sem dados", não zero: o espelho tem
  // linhas zeradas de meses nunca sincronizados (ex.: 2022 até out), e usá-las
  // como base daria Δ de +500% no ano seguinte.
  const kInicio = Math.min(...pontos.filter((p) => p.valor > 0).map((p) => chave(p.ano, p.mes)), Infinity);
  const porMes = new Map<number, PontoMes>();
  for (const p of pontos) if (chave(p.ano, p.mes) >= kInicio) porMes.set(chave(p.ano, p.mes), p);

  const fechado = (ano: number, mes: number) => chave(ano, mes) < kHoje;
  // Valor de um mês para comparação: só mês fechado e com dado.
  const vFechado = (ano: number, mes: number): number | null => {
    if (!fechado(ano, mes)) return null;
    const p = porMes.get(chave(ano, mes));
    return p ? valorDaMetrica(p, metrica) : null;
  };
  const somaTri = (ano: number, tri: number): { valor: number | null; completo: boolean } => {
    let soma = 0, algum = false, completo = true;
    for (let m = tri * 3 - 2; m <= tri * 3; m++) {
      const p = porMes.get(chave(ano, m));
      if (!fechado(ano, m) || !p) completo = false;
      if (p && chave(ano, m) <= kHoje) { soma += valorDaMetrica(p, metrica); algum = true; }
    }
    return { valor: algum ? soma : null, completo };
  };

  const anos: LinhaAno[] = [];
  let maxMes = 0;
  for (let ano = anoHoje; ano >= anoInicial; ano--) {
    const meses: CelulaMes[] = [];
    let total = 0, qtde: number | null = 0, mesesFechados = 0, totalFechado = 0, baseAnoAnt: number | null = 0;
    for (let mes = 1; mes <= 12; mes++) {
      const k = chave(ano, mes);
      const futuro = k > kHoje;
      const parcial = k === kHoje;
      const p = porMes.get(k);
      const valor = !futuro && p ? valorDaMetrica(p, metrica) : null;
      if (valor != null) {
        total += valor;
        maxMes = Math.max(maxMes, valor);
      }
      // Contagem desconhecida em qualquer mês com dado → ticket do ano some.
      if (!futuro && p) qtde = qtde != null && p.qtde != null ? qtde + p.qtde : null;
      if (fechado(ano, mes)) {
        mesesFechados++;
        totalFechado += valor ?? 0;
        const b = vFechado(ano - 1, mes);
        baseAnoAnt = baseAnoAnt != null && b != null ? baseAnoAnt + b : null;
      }
      let d: Delta | null = null;
      if (!futuro && !parcial && valor != null) {
        const base = comparacao === 'yoy'
          ? vFechado(ano - 1, mes)
          : mes === 1 ? vFechado(ano - 1, 12) : vFechado(ano, mes - 1);
        d = delta(valor, base, baseMin);
      }
      const projetado = parcial && valor != null && diasUteisMes ? projetarMes(valor, diasUteisMes.decorridos, diasUteisMes.total) : null;
      meses.push({ mes, valor, qtde: !futuro && p ? p.qtde : null, parcial, projetado, futuro, delta: d });
    }
    const trimestres: CelulaTrimestre[] = [];
    for (let tri = 1; tri <= 4; tri++) {
      const atual = somaTri(ano, tri);
      let deltaAnt: Delta | null = null, deltaAno: Delta | null = null;
      if (atual.completo) {
        const bAnt = tri === 1 ? somaTri(ano - 1, 4) : somaTri(ano, tri - 1);
        const bAno = somaTri(ano - 1, tri);
        if (bAnt.completo) deltaAnt = delta(atual.valor, bAnt.valor, baseMin * 3);
        if (bAno.completo) deltaAno = delta(atual.valor, bAno.valor, baseMin * 3);
      }
      trimestres.push({ tri, valor: atual.valor, completo: atual.completo, delta: comparacao === 'yoy' ? deltaAno : deltaAnt, deltaAnt, deltaAno });
    }
    const temDado = meses.some((m) => m.valor != null);
    if (!temDado && ano !== anoHoje) continue;
    const qtdeFinal = qtde && qtde > 0 ? qtde : null;
    anos.push({
      ano,
      meses,
      trimestres,
      total,
      qtde: qtdeFinal,
      ticket: qtdeFinal ? total / qtdeFinal : null,
      mesesFechados,
      delta: mesesFechados > 0 ? delta(totalFechado, baseAnoAnt, baseMin * mesesFechados) : null,
    });
  }
  return { anos, maxMes };
}
