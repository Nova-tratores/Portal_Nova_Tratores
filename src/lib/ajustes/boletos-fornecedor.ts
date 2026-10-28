// Boleto agrupado de fornecedor — regras PURAS (sem banco, sem Omie).
//
// Fornecedores como a CAMBUCI mandam UM boleto parcelado cobrindo várias NF-e.
// O boleto REPROGRAMA as duplicatas da NF (vencimento/previsão = parcela do
// boleto, observação com nº do boleto e NFs); a baixa só acontece no pagamento
// real, duplicata a duplicata. Aqui: validação do registro, alocação
// duplicata → parcela, campos que vão para a Omie, plano de baixa de uma
// parcela e a detecção do padrão antigo (baixa antecipada + título manual).
// Testado em boletos-fornecedor.test.ts.

export type ContaOmie = 'NOVA' | 'CASTRO';
export type StatusBoleto = 'pendente' | 'registrado' | 'parcial' | 'pago' | 'cancelado' | 'erro_omie';

export interface TituloSel {
  conta: ContaOmie;
  codigoLancamento: number;
  numeroDoc?: string | null;        // '000790210/1'
  numeroDocFiscal?: string | null;  // '790210'
  valor: number;                    // valor em aberto da duplicata
  vencimento?: string | null;       // ISO
  previsao?: string | null;
  observacao?: string | null;
  idOrigem?: string | null;         // 'COMP' = gerado pela NF; 'RPTP' = manual
  codigoFornecedor?: number | null;
  contraparte?: string | null;
  status?: string | null;
}

export interface ParcelaIn {
  numero: number;          // 1..total
  dataVencimento: string;  // ISO
  valor: number;
}

export interface Alocacao {
  codigoLancamento: number;
  parcelaNumero: number;
  valor: number;
  principal: boolean;      // parcela onde cai a maior parte da duplicata
}

export const TOLERANCIA_PADRAO = 1.0;
export const DIAS_ANTECIPACAO_SUSPEITA = 7;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function arred(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function somar(xs: Array<number | null | undefined>): number {
  return arred(xs.reduce<number>((s, v) => s + (Number(v) || 0), 0));
}

export function dataValida(iso: unknown): boolean {
  const s = String(iso || '').slice(0, 10);
  if (!ISO.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function fmtBR(iso: string | null | undefined): string {
  const s = String(iso || '').slice(0, 10);
  if (!ISO.test(s)) return s;
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diffDias(aISO: string, bISO: string): number {
  const a = new Date(aISO.slice(0, 10) + 'T00:00:00Z').getTime();
  const b = new Date(bISO.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 864e5);
}

/** Divide `total` em `n` parcelas iguais (centavos sobram na última), vencendo
 *  a partir de `primeira` de `intervaloDias` em `intervaloDias`. */
export function dividirIgual(total: number, n: number, primeira: string, intervaloDias = 30): ParcelaIn[] {
  const qtd = Math.max(1, Math.floor(n));
  const base = Math.floor((arred(total) * 100) / qtd) / 100;
  const out: ParcelaIn[] = [];
  let acumulado = 0;
  for (let i = 1; i <= qtd; i++) {
    const valor = i === qtd ? arred(arred(total) - acumulado) : base;
    acumulado = arred(acumulado + valor);
    out.push({ numero: i, dataVencimento: somarDias(primeira, intervaloDias * (i - 1)), valor });
  }
  return out;
}

/** Nº da NF de uma duplicata: '000790210/1' → '790210'; usa numero_documento_fiscal quando existe. */
export function numeroNF(t: { numeroDoc?: string | null; numeroDocFiscal?: string | null }): string | null {
  const fonte = String(t.numeroDocFiscal || t.numeroDoc || '').trim();
  if (!fonte) return null;
  const antesBarra = fonte.split('/')[0];
  const digitos = antesBarra.replace(/\D/g, '').replace(/^0+/, '');
  return digitos || antesBarra || null;
}

export function listaNFs(titulos: Array<{ numeroDoc?: string | null; numeroDocFiscal?: string | null }>): string[] {
  const set = new Set<string>();
  for (const t of titulos) {
    const n = numeroNF(t);
    if (n) set.add(n);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/** Valida o registro de um boleto. Devolve a mensagem de erro ou null. */
export function validarRegistro(
  args: { titulos: TituloSel[]; parcelas: ParcelaIn[]; numero: string; dataEmissao?: string | null },
  tolerancia = TOLERANCIA_PADRAO,
): string | null {
  const { titulos, parcelas, numero } = args;
  if (!Array.isArray(titulos) || !titulos.length) return 'selecione ao menos uma duplicata';
  if (!String(numero || '').trim()) return 'informe o nº do boleto';
  if (String(numero).trim().length > 60) return 'nº do boleto: no máximo 60 caracteres';
  if (args.dataEmissao && !dataValida(args.dataEmissao)) return 'data do boleto inválida';
  const contas = new Set(titulos.map((t) => t.conta));
  if (contas.size > 1) return 'as duplicatas precisam ser da mesma empresa';
  const forns = new Set(titulos.filter((t) => t.codigoFornecedor != null).map((t) => Number(t.codigoFornecedor)));
  if (forns.size > 1) return 'as duplicatas precisam ser do mesmo fornecedor';
  const naoComp = titulos.filter((t) => t.idOrigem && t.idOrigem !== 'COMP');
  if (naoComp.length) return `só duplicatas geradas pela NF entram no boleto (${naoComp.length} título(s) manual(is) na seleção)`;
  const codigos = new Set(titulos.map((t) => Number(t.codigoLancamento)));
  if (codigos.size !== titulos.length) return 'duplicata repetida na seleção';
  for (const t of titulos) if (!(Number(t.valor) > 0)) return `duplicata ${t.numeroDoc || t.codigoLancamento} sem valor em aberto`;
  if (!Array.isArray(parcelas) || !parcelas.length) return 'informe ao menos uma parcela';
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    if (Number(p.numero) !== i + 1) return 'parcelas fora de ordem (precisam ser 1, 2, 3…)';
    if (!dataValida(p.dataVencimento)) return `parcela ${i + 1}: data inválida`;
    if (!(Number(p.valor) > 0)) return `parcela ${i + 1}: valor precisa ser maior que zero`;
    if (i > 0 && p.dataVencimento < parcelas[i - 1].dataVencimento) return `parcela ${i + 1} vence antes da parcela ${i}`;
  }
  const somaT = somar(titulos.map((t) => t.valor));
  const somaP = somar(parcelas.map((p) => p.valor));
  const dif = arred(somaP - somaT);
  if (Math.abs(dif) > tolerancia) {
    return `a soma das parcelas (R$ ${somaP.toFixed(2)}) difere da soma das duplicatas (R$ ${somaT.toFixed(2)}) em R$ ${dif.toFixed(2)} — tolerância R$ ${tolerancia.toFixed(2)}`;
  }
  return null;
}

/** Aloca cada duplicata nas parcelas, em ordem de vencimento, enchendo parcela
 *  a parcela. Uma duplicata pode cair em duas parcelas. A última parcela absorve
 *  a diferença (até a tolerância validada antes). */
export function alocar(titulos: TituloSel[], parcelas: ParcelaIn[]): { alocacoes: Alocacao[]; diferenca: number } {
  const ordenados = titulos.slice().sort((a, b) =>
    String(a.vencimento || '').localeCompare(String(b.vencimento || '')) || Number(a.codigoLancamento) - Number(b.codigoLancamento));
  const alocacoes: Alocacao[] = [];
  let ip = 0;
  let restoParcela = parcelas.length ? arred(parcelas[0].valor) : 0;
  for (const t of ordenados) {
    let restoTitulo = arred(t.valor);
    while (restoTitulo > 0.004 && ip < parcelas.length) {
      const ultima = ip === parcelas.length - 1;
      const usa = ultima ? restoTitulo : Math.min(restoTitulo, restoParcela);
      if (usa > 0.004) {
        alocacoes.push({ codigoLancamento: Number(t.codigoLancamento), parcelaNumero: parcelas[ip].numero, valor: arred(usa), principal: false });
        restoTitulo = arred(restoTitulo - usa);
        restoParcela = arred(restoParcela - usa);
      }
      if (restoParcela <= 0.004 && !ultima) {
        ip++;
        restoParcela = arred(parcelas[ip].valor);
      } else if (restoTitulo > 0.004 && ultima) {
        break;
      }
    }
  }
  // parcela principal de cada duplicata = onde cai a maior parte
  const porTitulo = new Map<number, Alocacao[]>();
  for (const a of alocacoes) {
    if (!porTitulo.has(a.codigoLancamento)) porTitulo.set(a.codigoLancamento, []);
    porTitulo.get(a.codigoLancamento)!.push(a);
  }
  for (const lista of porTitulo.values()) {
    const maior = lista.reduce((m, a) => (a.valor > m.valor ? a : m), lista[0]);
    maior.principal = true;
  }
  const diferenca = arred(somar(parcelas.map((p) => p.valor)) - somar(titulos.map((t) => t.valor)));
  return { alocacoes, diferenca };
}

const MARCA_INI = '[Boleto ';
const MARCA_FIM = ']';

/** Observação que vai para a duplicata na Omie. Substitui uma marca anterior
 *  "[Boleto …]" se houver; mantém o resto do texto. ≤ 1000 chars. */
export function montarObservacao(args: {
  obsAtual?: string | null;
  fornecedor: string;
  numero: string;
  parcelaNumero: number;
  parcelaTotal: number;
  dataVencimento: string;
  nfs: string[];
}): string {
  const marca = `${MARCA_INI}${String(args.fornecedor || '').trim()} nº ${String(args.numero).trim()} parc ${args.parcelaNumero}/${args.parcelaTotal} venc ${fmtBR(args.dataVencimento)} · NFs ${args.nfs.join(', ')}${MARCA_FIM}`;
  let resto = String(args.obsAtual || '').trim();
  const ini = resto.indexOf(MARCA_INI);
  if (ini >= 0) {
    const fim = resto.indexOf(MARCA_FIM, ini);
    resto = (resto.slice(0, ini) + (fim >= 0 ? resto.slice(fim + 1) : '')).replace(/\s{2,}/g, ' ').trim();
  }
  const texto = resto ? `${resto} ${marca}` : marca;
  return texto.length > 1000 ? texto.slice(0, 1000) : texto;
}

export interface CamposTitulo {
  codigoLancamento: number;
  parcelaNumero: number;
  campos: { dataPrevisao: string; dataVencimento?: string; observacao: string };
}

/** O que cada duplicata recebe na Omie: previsão (e vencimento, se a regra
 *  manda) = parcela principal; observação com o boleto. */
export function camposPorTitulo(
  titulos: TituloSel[],
  alocacoes: Alocacao[],
  parcelas: ParcelaIn[],
  opts: { fornecedor: string; numero: string; alinharVencimento: boolean },
): CamposTitulo[] {
  const nfs = listaNFs(titulos);
  const porNumero = new Map(parcelas.map((p) => [p.numero, p]));
  const out: CamposTitulo[] = [];
  for (const t of titulos) {
    const principal = alocacoes.find((a) => a.codigoLancamento === Number(t.codigoLancamento) && a.principal);
    if (!principal) continue;
    const p = porNumero.get(principal.parcelaNumero);
    if (!p) continue;
    const campos: CamposTitulo['campos'] = {
      dataPrevisao: p.dataVencimento,
      observacao: montarObservacao({ obsAtual: t.observacao, fornecedor: opts.fornecedor, numero: opts.numero, parcelaNumero: p.numero, parcelaTotal: parcelas.length, dataVencimento: p.dataVencimento, nfs }),
    };
    if (opts.alinharVencimento) campos.dataVencimento = p.dataVencimento;
    out.push({ codigoLancamento: Number(t.codigoLancamento), parcelaNumero: p.numero, campos });
  }
  return out;
}

export interface BaixaPlanejada {
  codigoLancamento: number;
  valor: number;
  juros?: number;
  desconto?: number;
}

/** Plano de baixa de UMA parcela: cada duplicata alocada é baixada pelo que foi
 *  alocado (teto = valor em aberto na Omie agora). A diferença entre a parcela
 *  e a soma vai como juros (parcela maior) ou desconto (menor) na última baixa. */
export function planoBaixaParcela(
  parcela: ParcelaIn,
  alocacoes: Alocacao[],
  abertos: Map<number, number>,
): { baixas: BaixaPlanejada[]; jaPagos: number[]; diferenca: number; erro?: string } {
  const minhas = alocacoes.filter((a) => a.parcelaNumero === parcela.numero);
  if (!minhas.length) return { baixas: [], jaPagos: [], diferenca: 0, erro: 'parcela sem duplicatas alocadas' };
  const baixas: BaixaPlanejada[] = [];
  const jaPagos: number[] = [];
  for (const a of minhas) {
    const aberto = abertos.has(a.codigoLancamento) ? arred(abertos.get(a.codigoLancamento) || 0) : null;
    if (aberto == null) return { baixas: [], jaPagos: [], diferenca: 0, erro: `duplicata ${a.codigoLancamento} não encontrada na Omie` };
    if (aberto <= 0.004) { jaPagos.push(a.codigoLancamento); continue; }
    baixas.push({ codigoLancamento: a.codigoLancamento, valor: Math.min(arred(a.valor), aberto) });
  }
  if (!baixas.length) return { baixas: [], jaPagos, diferenca: 0, erro: 'todas as duplicatas desta parcela já estão baixadas' };
  const diferenca = arred(arred(parcela.valor) - somar(baixas.map((b) => b.valor)));
  const ultima = baixas[baixas.length - 1];
  if (diferenca > 0.004) ultima.juros = diferenca;
  else if (diferenca < -0.004) ultima.desconto = Math.min(arred(-diferenca), ultima.valor);
  return { baixas, jaPagos, diferenca };
}

export function statusPorParcelas(parcelas: Array<{ status: string }>, statusAtual: StatusBoleto): StatusBoleto {
  if (statusAtual === 'cancelado' || statusAtual === 'erro_omie' || statusAtual === 'pendente') return statusAtual;
  const pagas = parcelas.filter((p) => p.status === 'paga').length;
  if (!parcelas.length || pagas === 0) return 'registrado';
  return pagas === parcelas.length ? 'pago' : 'parcial';
}

// ---------------------------------------------------------------------------
// Detecção do padrão antigo (baixa antecipada da duplicata + título manual no
// mesmo dia). Serve ao inventário (scripts/boletos-inventario.ts) e, depois,
// ao monitor.
// ---------------------------------------------------------------------------
export interface TituloEspelho {
  codigoLancamento: number;
  idOrigem?: string | null;       // COMP = duplicata da NF; MANP = manual (1ª parcela); RPTP = manual (demais parcelas)
  status?: string | null;         // PAGO | A VENCER | …
  dataEmissao?: string | null;
  dataInclusao?: string | null;   // quando o título foi criado na Omie (o manual tem data_emissao = da parcela)
  dataVencimento?: string | null;
  dataPagamento?: string | null;
  valorDocumento: number;
  valorPago?: number | null;
  desconto?: number | null;       // desconto da baixa (movimentos_cc), quando conhecido
  nomeFornecedor?: string | null;
  numeroDoc?: string | null;
  numeroDocFiscal?: string | null;
}

export interface Ciclo {
  fornecedor: string;
  data: string;                   // dia da baixa antecipada
  comp: TituloEspelho[];          // duplicatas baixadas antes da hora
  rptp: TituloEspelho[];          // títulos manuais (MANP/RPTP) criados no mesmo dia (±janela)
  somaComp: number;
  somaRptp: number;
  bate: boolean;                  // |somaComp − somaRptp| ≤ tolerância
  rptpAbertos: number;            // manuais ainda não pagos (ciclo saneável)
  desconto100: number;            // duplicatas "pagas" com desconto integral (sem caixa)
}

/** Título digitado à mão na Omie: MANP (1ª parcela) ou RPTP (parcelas seguintes) — tudo que não veio de NF. */
export function ehManual(t: { idOrigem?: string | null }): boolean {
  return !!t.idOrigem && t.idOrigem !== 'COMP';
}

export function ehAntecipada(t: TituloEspelho, dias = DIAS_ANTECIPACAO_SUSPEITA): boolean {
  if (String(t.status || '').toUpperCase() !== 'PAGO') return false;
  if (!t.dataPagamento || !t.dataVencimento) return false;
  return diffDias(t.dataVencimento, t.dataPagamento) >= dias;
}

/** Chave do fornecedor para agrupar: 1ª palavra do nome (a CAMBUCI tem dois
 *  cadastros na Omie: "CAMBUCI" e "CAMBUCI METALURGICA LTDA"). */
export function chaveFornecedor(nome: string | null | undefined): string {
  const n = String(nome || '(sem)').trim().toUpperCase();
  const primeira = n.split(/\s+/)[0] || n;
  return primeira.length >= 4 ? primeira : n;
}

/** Regra A: no mesmo fornecedor, duplicata(s) COMP pagas ≥ `dias` antes do
 *  vencimento no dia D + título(s) RPTP CRIADOS (data_inclusao; senão emissão)
 *  em [D, D+janela]. */
export function detectarCiclos(
  titulos: TituloEspelho[],
  opts: { dias?: number; janelaDias?: number; tolerancia?: number } = {},
): Ciclo[] {
  const dias = opts.dias ?? DIAS_ANTECIPACAO_SUSPEITA;
  const janela = opts.janelaDias ?? 1;
  const tol = opts.tolerancia ?? TOLERANCIA_PADRAO;
  const porForn = new Map<string, TituloEspelho[]>();
  for (const t of titulos) {
    const f = chaveFornecedor(t.nomeFornecedor);
    if (!porForn.has(f)) porForn.set(f, []);
    porForn.get(f)!.push(t);
  }
  const ciclos: Ciclo[] = [];
  for (const [fornecedor, lista] of porForn) {
    const antecipadas = lista.filter((t) => (t.idOrigem || 'COMP') === 'COMP' && ehAntecipada(t, dias));
    const manuais = lista.filter((t) => ehManual(t) && (t.dataInclusao || t.dataEmissao));
    const porDia = new Map<string, TituloEspelho[]>();
    for (const t of antecipadas) {
      const d = String(t.dataPagamento).slice(0, 10);
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d)!.push(t);
    }
    for (const [data, comp] of porDia) {
      const rptp = manuais.filter((m) => {
        const dd = diffDias(String(m.dataInclusao || m.dataEmissao).slice(0, 10), data);
        return dd >= 0 && dd <= janela;
      });
      const somaComp = somar(comp.map((t) => t.valorDocumento));
      const somaRptp = somar(rptp.map((t) => t.valorDocumento));
      ciclos.push({
        fornecedor,
        data,
        comp,
        rptp,
        somaComp,
        somaRptp,
        bate: rptp.length > 0 && Math.abs(somaComp - somaRptp) <= tol,
        rptpAbertos: rptp.filter((t) => String(t.status || '').toUpperCase() !== 'PAGO').length,
        desconto100: comp.filter((t) => t.desconto != null && arred(t.desconto) >= arred(t.valorDocumento) - 0.01).length,
      });
    }
  }
  return ciclos.sort((a, b) => a.fornecedor.localeCompare(b.fornecedor) || a.data.localeCompare(b.data));
}

/** Baixa avulsa suspeita: duplicata de NF paga ≥ `dias` antes do vencimento. */
export function baixaAntecipadaSuspeita(dataBaixa: string, vencimento: string | null | undefined, idOrigem?: string | null, dias = DIAS_ANTECIPACAO_SUSPEITA): boolean {
  if (!vencimento || !dataValida(dataBaixa) || !dataValida(vencimento)) return false;
  if (idOrigem && idOrigem !== 'COMP') return false;
  return diffDias(vencimento, dataBaixa) >= dias;
}
