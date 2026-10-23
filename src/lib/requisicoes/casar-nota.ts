// Casar requisição × nota de entrada do Omie (notas_entrada) — regra PURA, testada em
// __tests__/casar-nota.test.ts e validada contra o passado (scripts/req-casar-nota-backtest.ts:
// as requisições que já têm o nº da nota digitado são o gabarito).
//
// Princípio (José, 23/10/2026): a pessoa confirma, e o sistema tem de acertar mais do que errar.
// Por isso só sugere quando o FORNECEDOR bate (CNPJ, ou nome bem parecido) E o VALOR bate,
// numa janela de datas perto da requisição — e diz o porquê de cada sugestão.

export interface NotaEntrada {
  id: number;
  numero: string;        // só dígitos, sem zeros à esquerda
  data: string;          // YYYY-MM-DD
  valor: number;
  cnpj: string;          // só dígitos
  nome: string;          // razão social do fornecedor
  conta: string;         // NOVA | CASTRO
}

export interface ReqParaCasar {
  id: number;
  fornecedor: string;
  fornecedorCnpj: string; // só dígitos ('' se não tem)
  valor: number;
  data: string;           // YYYY-MM-DD
}

export type Confianca = 'alta' | 'media';

export interface Candidato {
  nota: NotaEntrada;
  pontos: number;
  confianca: Confianca;
  motivos: string[];
}

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const numeroNota = (v: unknown) => soDigitos(v).replace(/^0+/, '');

/** "31/12/2024" ou "2024-12-31" → "2024-12-31". */
export function dataISO(v: unknown): string {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86_400_000);

// palavras que não ajudam a reconhecer o fornecedor
const VAZIAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'de', 'da', 'do', 'das', 'dos', 'e', 'comercio', 'com', 'industria', 'ind', 'servicos', 'serv', 'distribuidora', 'dist', 'cia', 'mei', 'filial', 'matriz', 'unipessoal', 'pecas', 'auto']);

export function tokensNome(nome: string): string[] {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 2 && !VAZIAS.has(t) && !/^\d+$/.test(t));
}

/** Parecença de nomes 0..1: quanto do nome MENOR aparece no maior (o "RODRIGO TORNEIRO" × razão social completa). */
export function parecencaNome(a: string, b: string): number {
  const ta = new Set(tokensNome(a)), tb = new Set(tokensNome(b));
  if (!ta.size || !tb.size) return 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  // uma palavra só basta se for característica ("KADU", "GERSON"); genérica não
  // ("AUTO POSTO 2001" × "AUTO POSTO SÃO GERALDO" batiam pelo "posto")
  if (comum < 2) {
    const unica = [...ta].find((t) => tb.has(t));
    if (!unica || unica.length < 4 || GENERICAS.has(unica)) return 0;
  }
  return comum / Math.min(ta.size, tb.size);
}

const GENERICAS = new Set(['posto', 'postos', 'tintas', 'tinta', 'ferramentas', 'ferragens', 'materiais', 'material', 'mercado', 'supermercado',
  'restaurante', 'lanchonete', 'oficina', 'borracharia', 'eletrica', 'eletrico', 'construcao', 'agricola', 'agricolas', 'tratores', 'trator',
  'maquinas', 'implementos', 'veiculos', 'motos', 'parafusos', 'rolamentos', 'mangueiras', 'combustiveis', 'transportes', 'piraju', 'fartura',
  'brasil', 'center', 'centro', 'nova', 'sao', 'santa', 'santo', 'hotel', 'pousada', 'farmacia', 'papelaria', 'informatica', 'solda']);

export interface OpcoesCasar {
  /** nome do fornecedor (minúsculo, sem espaços nas pontas) → CNPJ do cadastro de Fornecedores */
  cnpjPorNome?: Map<string, string>;
  /** "cnpj|numero" de notas já ligadas a outra requisição — não sugere de novo */
  jaUsadas?: Set<string>;
  diasAntes?: number;     // nota emitida até N dias ANTES da requisição
  diasDepois?: number;    // nota emitida até N dias DEPOIS da requisição
}

export const chaveNota = (n: Pick<NotaEntrada, 'cnpj' | 'numero'>) => `${n.cnpj}|${n.numero}`;

/** Candidatas para uma requisição, da melhor para a pior; vazio = nada confiável. */
export function casarNota(req: ReqParaCasar, notas: NotaEntrada[], o: OpcoesCasar = {}): Candidato[] {
  if (!(req.valor > 0) || !req.data) return [];
  const antes = o.diasAntes ?? 20, depois = o.diasDepois ?? 60;
  const cnpjReq = req.fornecedorCnpj || o.cnpjPorNome?.get(String(req.fornecedor || '').trim().toLowerCase()) || '';
  const out: Candidato[] = [];
  for (const n of notas) {
    if (!(n.valor > 0) || !n.data) continue;
    if (o.jaUsadas?.has(chaveNota(n))) continue;
    const d = diasEntre(req.data, n.data);
    if (d < -antes || d > depois) continue;

    // fornecedor
    let pForn = 0; const motivos: string[] = [];
    if (cnpjReq && n.cnpj === cnpjReq) { pForn = 50; motivos.push('mesmo CNPJ do fornecedor'); }
    else if (cnpjReq && cnpjReq.length === 14 && n.cnpj.slice(0, 8) === cnpjReq.slice(0, 8)) { pForn = 40; motivos.push('mesma empresa (outra filial)'); }
    else {
      const p = parecencaNome(req.fornecedor, n.nome);
      if (p >= 0.99) { pForn = 38; motivos.push('mesmo nome de fornecedor'); }
      else if (p >= 0.6) { pForn = 25; motivos.push('nome do fornecedor parecido'); }
    }
    if (!pForn) continue;

    // valor
    const dif = Math.abs(n.valor - req.valor) / req.valor;
    let pValor = 0;
    if (dif <= 0.005) { pValor = 40; motivos.push('mesmo valor'); }
    else if (dif <= 0.03) { pValor = 25; motivos.push(`valor ${(dif * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% diferente`); }
    else continue; // valor diferente demais: não arrisca

    // data
    const ad = Math.abs(d);
    const pData = ad <= 7 ? 10 : ad <= 30 ? 6 : 2;
    motivos.push(d === 0 ? 'mesmo dia' : d > 0 ? `nota ${d} dia(s) depois` : `nota ${-d} dia(s) antes`);

    const pontos = pForn + pValor + pData;
    const confianca: Confianca = pForn >= 38 && pValor === 40 && ad <= 30 ? 'alta' : 'media';
    out.push({ nota: n, pontos, confianca, motivos });
  }
  out.sort((a, b) => b.pontos - a.pontos || Math.abs(diasEntre(req.data, a.nota.data)) - Math.abs(diasEntre(req.data, b.nota.data)));
  // empate perto do topo = ninguém é "alta" (a pessoa escolhe entre as duas)
  if (out.length > 1 && out[0].pontos - out[1].pontos < 5) for (const c of out) c.confianca = 'media';
  return out.slice(0, 3);
}

// ───────────── uma nota para VÁRIAS requisições (soma) ─────────────
// José, 23/10/2026: "acontece bastante de o fornecedor colocar uma nota para várias requisições"
// (no histórico: 76 notas cobrindo 283 requisições). Para cada nota, procura o conjunto de
// requisições do mesmo fornecedor cuja SOMA dá o valor da nota. Se houver mais de um jeito de
// somar, não sugere (não dá para saber qual é o certo).

export interface GrupoCandidato {
  nota: NotaEntrada;
  reqIds: number[];
  confianca: Confianca;
  motivos: string[];
}

/** O fornecedor da requisição é o da nota? 0 = não; 50/40/38/25 = como no casamento simples. */
export function forcaFornecedor(req: ReqParaCasar, n: NotaEntrada, cnpjPorNome?: Map<string, string>): number {
  const cnpjReq = req.fornecedorCnpj || cnpjPorNome?.get(String(req.fornecedor || '').trim().toLowerCase()) || '';
  if (cnpjReq && n.cnpj === cnpjReq) return 50;
  if (cnpjReq && cnpjReq.length === 14 && n.cnpj.slice(0, 8) === cnpjReq.slice(0, 8)) return 40;
  const p = parecencaNome(req.fornecedor, n.nome);
  return p >= 0.99 ? 38 : p >= 0.6 ? 25 : 0;
}

const TOLERANCIA_SOMA = 5; // centavos

/**
 * Subconjuntos (2+ requisições) que somam o valor da nota. Para no 2º achado
 * (basta saber que é ambíguo). "Meet in the middle": até 24 requisições candidatas.
 */
export function subconjuntosQueSomam(valoresCent: number[], alvoCent: number, max = 2): number[][] {
  const n = valoresCent.length;
  const metade = Math.floor(n / 2);
  const lista = (ini: number, fim: number) => {
    const out: { soma: number; mask: number }[] = [];
    const k = fim - ini;
    for (let m = 0; m < 1 << k; m++) {
      let soma = 0;
      for (let i = 0; i < k; i++) if (m & (1 << i)) soma += valoresCent[ini + i];
      if (soma <= alvoCent + TOLERANCIA_SOMA) out.push({ soma, mask: m });
    }
    return out;
  };
  const A = lista(0, metade), B = lista(metade, n).sort((x, y) => x.soma - y.soma);
  const achados: number[][] = [];
  for (const a of A) {
    const falta = alvoCent - a.soma;
    // busca binária do primeiro B com soma >= falta - tolerância
    let lo = 0, hi = B.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (B[mid].soma < falta - TOLERANCIA_SOMA) lo = mid + 1; else hi = mid; }
    for (let j = lo; j < B.length && B[j].soma <= falta + TOLERANCIA_SOMA; j++) {
      const idx: number[] = [];
      for (let i = 0; i < metade; i++) if (a.mask & (1 << i)) idx.push(i);
      for (let i = 0; i < n - metade; i++) if (B[j].mask & (1 << i)) idx.push(metade + i);
      if (idx.length < 2) continue;
      achados.push(idx);
      if (achados.length >= max) return achados;
    }
  }
  return achados;
}

/** Grupo de requisições que forma a nota; null = nenhum, ou mais de um jeito de somar. */
export function casarNotaSoma(nota: NotaEntrada, reqs: ReqParaCasar[], o: OpcoesCasar = {}): GrupoCandidato | null {
  if (!(nota.valor > 0) || !nota.data) return null;
  const antes = o.diasAntes ?? 20, depois = o.diasDepois ?? 60;
  const cand = reqs
    .map((r) => ({ r, forca: forcaFornecedor(r, nota, o.cnpjPorNome), d: diasEntre(r.data, nota.data) }))
    .filter((x) => x.forca > 0 && x.r.valor >= 1 && x.r.valor <= nota.valor + 0.05 && x.d >= -antes && x.d <= depois)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
    .slice(0, 24);
  if (cand.length < 2) return null;
  const achados = subconjuntosQueSomam(cand.map((x) => Math.round(x.r.valor * 100)), Math.round(nota.valor * 100));
  if (achados.length !== 1) return null; // nenhum, ou ambíguo
  const grupo = achados[0].map((i) => cand[i]);
  const minForca = Math.min(...grupo.map((x) => x.forca));
  const maxDias = Math.max(...grupo.map((x) => Math.abs(x.d)));
  const motivos = [
    minForca >= 50 ? 'mesmo CNPJ do fornecedor' : minForca >= 38 ? 'mesmo fornecedor' : 'fornecedor parecido',
    `${grupo.length} requisições somam o valor da nota`,
    `requisições até ${maxDias} dia(s) da nota`,
  ];
  return {
    nota,
    reqIds: grupo.map((x) => x.r.id).sort((a, b) => a - b),
    confianca: minForca >= 38 && maxDias <= 45 ? 'alta' : 'media',
    motivos,
  };
}

/** Linha de notas_entrada (como vem do banco) → NotaEntrada; null se cancelada/sem número. */
export function notaDoBanco(r: Record<string, any>): NotaEntrada | null {
  const numero = numeroNota(r.numero_nf);
  if (!numero || String(r.cancelada || '').toUpperCase() === 'S') return null;
  return {
    id: Number(r.id), numero, data: dataISO(r.data_emissao), valor: Number(r.valor_nf) || 0,
    cnpj: soDigitos(r.cnpj_cpf ?? r.emitente?.cnpj_cpf), nome: String(r.nome_emitente || r.destinatario?.cRazao || ''),
    conta: String(r.conta_omie || ''),
  };
}
