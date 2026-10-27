// Requisições "inteligentes" — regras PURAS (sem banco), testadas em
// __tests__/inteligencia.test.ts. A tela lê as requisições uma vez e tudo aqui
// é calculado no navegador:
//   - normalizar tipo/status (o banco tem "Peça"/"Peças", "FINANCEIRO"/"financeiro")
//   - "Precisa da sua atenção" (paradas, sem documento, valor alto, sem fornecedor, duplicadas)
//   - sugestão de fornecedor/valor pelo histórico (tipo + carro)
//   - aviso de requisição parecida antes de criar
//   - painel de gastos e tempo até o financeiro
// Levantamento de 23/10/2026 (2.787 requisições) que motivou cada regra está no commit.
import { parseValorMisto as parseValorBR } from '@/lib/marketing/custos';

/** Mesmo limite de `autorizacao.ts` (lá ele vem junto do cliente do banco, que não entra numa regra pura). */
export const LIMITE_BLOQUEIO = 500;

export type Req = Record<string, any>;

export const FASES = ['pedido', 'completa', 'aguardando', 'financeiro'] as const;
export type Fase = (typeof FASES)[number];
export const FASES_ABERTAS: Fase[] = ['pedido', 'completa', 'aguardando'];

export const ROTULO_FASE: Record<string, string> = {
  pedido: 'Pedido realizado',
  completa: 'Atualizada pelo técnico',
  aguardando: 'Aguardando fornecedor',
  financeiro: 'Enviado ao financeiro',
  lixeira: 'Lixeira',
};

/** Cor de cada fase (ícone, pílula, coluna). */
export const COR_FASE: Record<string, string> = {
  pedido: '#EA580C',
  completa: '#0891B2',
  aguardando: '#D97706',
  financeiro: '#4F46E5',
  lixeira: '#64748B',
};

/** "FINANCEIRO" (importação do AppSheet, tipos Dinheiro/Boleto/Pix) = financeiro; vazio = pedido. */
export function normalizarStatus(s: unknown): string {
  const v = String(s ?? '').trim().toLowerCase();
  return v || 'pedido';
}

const TIPOS_IGUAIS: Record<string, string> = {
  'peça': 'Peças',
  'peca': 'Peças',
  'pecas': 'Peças',
  'peças': 'Peças',
  'frota-veiculos': 'Frota-Veículos',
  'frota-veículos': 'Frota-Veículos',
};

/** Junta as grafias diferentes do mesmo tipo ("Peça" e "Peças"). */
export function normalizarTipo(t: unknown): string {
  const v = String(t ?? '').trim();
  return TIPOS_IGUAIS[v.toLowerCase()] || v || 'Sem tipo';
}

/** Ícone (Font Awesome 6) e cor de cada tipo — o "quadradinho" do cartão. */
export function visualTipo(tipo: string): { icone: string; cor: string } {
  const t = normalizarTipo(tipo).toLowerCase();
  if (t.includes('abastec')) return { icone: 'fa-gas-pump', cor: '#D97706' };
  if (t.includes('veicular') || t.includes('frota')) return { icone: 'fa-car', cor: '#2563EB' };
  if (t.includes('aliment')) return { icone: 'fa-utensils', cor: '#16A34A' };
  if (t.includes('terceiro')) return { icone: 'fa-handshake', cor: '#7C3AED' };
  if (t.includes('ferrament')) return { icone: 'fa-screwdriver-wrench', cor: '#0891B2' };
  if (t.includes('peça') || t.includes('peca')) return { icone: 'fa-gears', cor: '#EA580C' };
  if (t.includes('hosped')) return { icone: 'fa-bed', cor: '#DB2777' };
  if (t.includes('almox') || t.includes('insumo')) return { icone: 'fa-boxes-stacked', cor: '#475569' };
  if (t.includes('dinheiro') || t.includes('boleto') || t.includes('pix')) return { icone: 'fa-money-bill-wave', cor: '#0D9488' };
  return { icone: 'fa-file-lines', cor: '#64748B' };
}

export const valorReq = (r: Req): number => parseValorBR(r?.valor_despeza);

export const brl = (n: number): string => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data da requisição (YYYY-MM-DD → meio-dia local); cai no created_at. */
export function dataReq(r: Req): Date | null {
  const s = String(r?.data || r?.created_at || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function diasDesde(d: Date | null, hoje: Date): number | null {
  if (!d) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  return Math.max(0, Math.round((h.getTime() - d.getTime()) / 86_400_000));
}

/** Há quantos dias está aberta (só fases abertas; senão null). */
export function diasAberta(r: Req, hoje: Date): number | null {
  if (!FASES_ABERTAS.includes(normalizarStatus(r.status) as Fase)) return null;
  return diasDesde(dataReq(r), hoje);
}

/** Veio da importação do AppSheet (06/03/2026) — dado antigo, sem cobrança de documento. */
export const importada = (r: Req): boolean => /Fase original/i.test(String(r?.obs || ''));

export function temDocumento(r: Req): boolean {
  return ['foto_nf', 'foto_nf2', 'foto_nf3', 'foto_nf4', 'foto_nf5', 'recibo_fornecedor', 'boleto_fornecedor'].some((c) => !!r?.[c]);
}

const chaveTexto = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ───────────────────────── Precisa da sua atenção ─────────────────────────

export type ChaveAtencao = 'parada30' | 'parada7' | 'semDocumento' | 'valorAlto' | 'semFornecedor' | 'duplicadas' | 'aCobrar'; // aCobrar: cartão do PainelAtencao (José, 26/10/2026)

export interface ItemAtencao {
  chave: ChaveAtencao;
  titulo: string;
  explicacao: string;
  icone: string;
  cor: string;
  ids: number[];
  valor: number;
}

/** Grupos de requisições com mesmo fornecedor + mesmo valor + mesma data (fora da lixeira). */
export function gruposDuplicados(reqs: Req[]): number[][] {
  const mapa = new Map<string, number[]>();
  for (const r of reqs) {
    if (normalizarStatus(r.status) === 'lixeira') continue;
    const forn = chaveTexto(r.fornecedor);
    const v = valorReq(r);
    const d = String(r.data || '').slice(0, 10);
    if (!forn || !v || !d) continue;
    const k = `${forn}|${v.toFixed(2)}|${d}`;
    const l = mapa.get(k) || [];
    l.push(Number(r.id));
    mapa.set(k, l);
  }
  return [...mapa.values()].filter((l) => l.length > 1);
}

/**
 * O que precisa de alguém agora. Só olha o que dá para resolver: requisição aberta,
 * ou no financeiro feita pelo portal (a importação antiga não tem documento e não conta).
 */
export function itensAtencao(reqs: Req[], hoje: Date, opts: { janelaDocDias?: number } = {}): ItemAtencao[] {
  const janela = opts.janelaDocDias ?? 90;
  const abertas = reqs.filter((r) => FASES_ABERTAS.includes(normalizarStatus(r.status) as Fase));
  const soma = (ids: number[]) => ids.reduce((s, id) => s + valorReq(reqs.find((r) => Number(r.id) === id) || {}), 0);
  const ids = (l: Req[]) => l.map((r) => Number(r.id));

  const p30 = abertas.filter((r) => (diasAberta(r, hoje) ?? 0) > 30);
  const p7 = abertas.filter((r) => { const d = diasAberta(r, hoje) ?? 0; return d > 7 && d <= 30; });
  const semDoc = reqs.filter((r) => normalizarStatus(r.status) === 'financeiro' && !importada(r) && !temDocumento(r)
    && (diasDesde(dataReq(r), hoje) ?? 9999) <= janela);
  const alto = abertas.filter((r) => valorReq(r) > LIMITE_BLOQUEIO);
  const semForn = abertas.filter((r) => !String(r.fornecedor || '').trim());
  const dup = gruposDuplicados(reqs).flat();

  const lista: ItemAtencao[] = [
    { chave: 'parada30', titulo: 'Paradas há mais de 30 dias', explicacao: 'Abertas há mais de um mês. Ou andam, ou vão para a lixeira.', icone: 'fa-hourglass-end', cor: '#DC2626', ids: ids(p30), valor: 0 },
    { chave: 'parada7', titulo: 'Paradas de 8 a 30 dias', explicacao: 'Abertas há mais de uma semana — vale cobrar o fornecedor ou o técnico.', icone: 'fa-hourglass-half', cor: '#D97706', ids: ids(p7), valor: 0 },
    { chave: 'semDocumento', titulo: `No financeiro sem nota (últimos ${janela} dias)`, explicacao: 'Já foram para o financeiro sem nota fiscal, recibo ou boleto anexado.', icone: 'fa-file-circle-exclamation', cor: '#7C3AED', ids: ids(semDoc), valor: 0 },
    { chave: 'valorAlto', titulo: `Abertas acima de ${brl(LIMITE_BLOQUEIO)}`, explicacao: 'Valor alto: só mudam com liberação do Dev.', icone: 'fa-sack-dollar', cor: '#0D9488', ids: ids(alto), valor: 0 },
    { chave: 'semFornecedor', titulo: 'Abertas sem fornecedor', explicacao: 'Sem fornecedor não dá para cobrar a nota nem comparar preço.', icone: 'fa-store-slash', cor: '#2563EB', ids: ids(semForn), valor: 0 },
    { chave: 'duplicadas', titulo: 'Possíveis duplicadas', explicacao: 'Mesmo fornecedor, mesmo valor e mesma data em mais de uma requisição.', icone: 'fa-clone', cor: '#DB2777', ids: dup, valor: 0 },
  ];
  for (const i of lista) i.valor = soma(i.ids);
  return lista;
}

// ───────────────────────── Sugestão pelo histórico ─────────────────────────

export interface Sugestao {
  fornecedor: string | null;
  vezesFornecedor: number;
  valores: number[];            // valores mais repetidos (até 3)
  base: number;                 // em quantas requisições a sugestão se apoia
  porCarro: boolean;            // a sugestão veio do histórico DESTE carro
}

/** Moda com contagem, ignorando vazios. */
function maisComuns<T>(lista: T[], n: number): { v: T; qtd: number }[] {
  const m = new Map<T, number>();
  for (const v of lista) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].map(([v, qtd]) => ({ v, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, n);
}

/**
 * Fornecedor e valores de costume para o tipo (e o carro, se houver histórico dele).
 * Só sugere com pelo menos 3 requisições parecidas — abaixo disso é chute.
 */
export function sugerir(reqs: Req[], alvo: { tipo?: string; veiculo?: string }): Sugestao | null {
  const tipo = normalizarTipo(alvo.tipo);
  if (!alvo.tipo) return null;
  const doTipo = reqs.filter((r) => normalizarStatus(r.status) !== 'lixeira' && normalizarTipo(r.tipo) === tipo);
  const doCarro = alvo.veiculo ? doTipo.filter((r) => String(r.veiculo || '') === String(alvo.veiculo)) : [];
  const base = doCarro.length >= 3 ? doCarro : doTipo;
  if (base.length < 3) return null;
  const forn = maisComuns(base.map((r) => String(r.fornecedor || '').trim()).filter(Boolean), 1)[0];
  const valores = maisComuns(base.map(valorReq).filter((v) => v > 0).map((v) => Math.round(v * 100) / 100), 3)
    .filter((x) => x.qtd >= 2).map((x) => x.v);
  // fornecedor só vale se for de pelo menos 20% das parecidas (senão não é "o de costume")
  const fornOk = forn && forn.qtd >= 2 && forn.qtd / base.length >= 0.2;
  if (!fornOk && valores.length === 0) return null;
  return { fornecedor: fornOk ? forn!.v : null, vezesFornecedor: fornOk ? forn!.qtd : 0, valores, base: base.length, porCarro: base === doCarro };
}

// ───────────────────────── Parecida antes de criar ─────────────────────────

/** Requisições abertas parecidas com a nova: mesmo tipo e (mesmo carro, ou título quase igual) nos últimos 15 dias. */
export function parecidas(reqs: Req[], nova: { tipo?: string; veiculo?: string; titulo?: string }, hoje: Date): Req[] {
  if (!nova.tipo) return [];
  const tipo = normalizarTipo(nova.tipo);
  const titulo = chaveTexto(nova.titulo);
  return reqs.filter((r) => {
    if (normalizarStatus(r.status) === 'lixeira') return false;
    if (normalizarTipo(r.tipo) !== tipo) return false;
    const d = diasDesde(dataReq(r), hoje);
    if (d == null || d > 15) return false;
    const mesmoCarro = !!nova.veiculo && String(r.veiculo || '') === String(nova.veiculo);
    const mesmoTitulo = titulo.length >= 6 && chaveTexto(r.titulo) === titulo;
    return mesmoCarro || mesmoTitulo;
  }).sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 5);
}

// ───────────────────────── Painel de gastos ─────────────────────────

export interface Fatia { chave: string; rotulo: string; valor: number; qtd: number; ids: number[] }

export function agrupar(reqs: Req[], chave: (r: Req) => string, rotulo?: (k: string) => string): Fatia[] {
  const m = new Map<string, Fatia>();
  for (const r of reqs) {
    const k = chave(r) || '—';
    const f = m.get(k) || { chave: k, rotulo: rotulo ? rotulo(k) : k, valor: 0, qtd: 0, ids: [] };
    f.valor += valorReq(r);
    f.qtd += 1;
    f.ids.push(Number(r.id));
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/** Últimos `n` meses (YYYY-MM), do mais antigo ao atual, com a soma de cada um. */
export function porMes(reqs: Req[], hoje: Date, n = 12): Fatia[] {
  const meses: Fatia[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({ chave: k, rotulo: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''), valor: 0, qtd: 0, ids: [] });
  }
  for (const r of reqs) {
    const k = String(r.data || r.created_at || '').slice(0, 7);
    const f = meses.find((m) => m.chave === k);
    if (!f) continue;
    f.valor += valorReq(r);
    f.qtd += 1;
    f.ids.push(Number(r.id));
  }
  return meses;
}

/** Dias da requisição até chegar no financeiro (só as que têm a data de envio). */
export function diasAteFinanceiro(r: Req): number | null {
  if (normalizarStatus(r.status) !== 'financeiro') return null;
  const ini = dataReq(r);
  const fim = String(r.enviado_financeiro_data || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ini || !fim) return null;
  const f = new Date(Number(fim[1]), Number(fim[2]) - 1, Number(fim[3]), 12);
  const d = Math.round((f.getTime() - ini.getTime()) / 86_400_000);
  return d >= 0 ? d : null;
}

export function mediana(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Janela do painel: requisições (fora da lixeira) com data dentro dos últimos `dias`. */
export function noPeriodo(reqs: Req[], hoje: Date, dias: number): Req[] {
  return reqs.filter((r) => {
    if (normalizarStatus(r.status) === 'lixeira') return false;
    const d = diasDesde(dataReq(r), hoje);
    return d != null && d <= dias;
  });
}
