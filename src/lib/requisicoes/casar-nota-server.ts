// Casar requisição × nota de entrada — parte do BANCO. A regra está em casar-nota.ts (pura).
// Lê as requisições sem nº de nota dos últimos meses, as notas de entrada do mesmo período e o
// cadastro de fornecedores; devolve só as sugestões de confiança ALTA. Teste contra o passado
// (23/10/2026): uma nota → uma requisição, 150 de 154 certas (97,4%); uma nota → várias
// requisições (a soma dá o valor da nota, de um jeito só), 6 de 6. Quem grava é a tela, depois
// que a pessoa confirma.
import { supabase } from '@/lib/pos/supabase';
import { parseValorMisto } from '@/lib/marketing/custos';
import { casarNota, casarNotaSoma, chaveNota, dataISO, notaDoBanco, numeroNota, soDigitos, type NotaEntrada, type ReqParaCasar } from './casar-nota';

export interface SugestaoNota {
  /** requisições que a nota cobre (1 ou várias — a soma delas dá o valor da nota) */
  reqIds: number[];
  nota: NotaEntrada;
  motivos: string[];
}

async function tudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

let cache: { em: number; sugestoes: SugestaoNota[] } | null = null;
const VALIDADE_MS = 5 * 60_000;

export async function sugestoesDeNota(opts: { forcar?: boolean; meses?: number } = {}): Promise<SugestaoNota[]> {
  if (!opts.forcar && cache && Date.now() - cache.em < VALIDADE_MS) return cache.sugestoes;
  const meses = opts.meses ?? 8;
  const desde = new Date(); desde.setMonth(desde.getMonth() - meses);
  const desdeISO = desde.toISOString().slice(0, 10);

  const [reqs, notasRaw, forn] = await Promise.all([
    tudo<any>((de, ate) => supabase.from('Requisicao')
      .select('id,status,fornecedor,fornecedor_cnpj,valor_despeza,data,created_at,numero_nota')
      .gte('data', desdeISO).order('id', { ascending: true }).range(de, ate)),
    // ano para cortar (data_emissao é texto DD/MM/AAAA no espelho)
    tudo<any>((de, ate) => supabase.from('notas_entrada')
      .select('id,numero_nf,data_emissao,valor_nf,cancelada,cnpj_cpf:emitente->>cnpj_cpf,nome_emitente,conta_omie')
      .gte('ano', desde.getFullYear()).order('id', { ascending: true }).range(de, ate)),
    tudo<any>((de, ate) => supabase.from('Fornecedores').select('*').order('id', { ascending: true }).range(de, ate)),
  ]);

  const notas = notasRaw.map(notaDoBanco).filter((n): n is NotaEntrada => !!n && n.data >= desdeISO);
  const cnpjPorNome = new Map<string, string>();
  for (const f of forn) { const c = soDigitos(f['cpf/cnpj']); if (c.length >= 11) cnpjPorNome.set(String(f.nome || '').trim().toLowerCase(), c); }

  // notas já ligadas a uma requisição (pelo nº digitado + CNPJ; sem CNPJ, pelo nº)
  const jaUsadas = new Set<string>();
  const numerosUsados = new Set<string>();
  for (const r of reqs) {
    const n = numeroNota(r.numero_nota);
    if (!n) continue;
    numerosUsados.add(n);
    const c = soDigitos(r.fornecedor_cnpj) || cnpjPorNome.get(String(r.fornecedor || '').trim().toLowerCase()) || '';
    if (c) jaUsadas.add(`${c}|${n}`);
  }
  for (const n of notas) if (numerosUsados.has(n.numero)) jaUsadas.add(chaveNota(n)); // na dúvida, conta como usada

  // requisições que ainda podem receber nota
  const livres: ReqParaCasar[] = reqs
    .filter((r) => String(r.status || '').toLowerCase() !== 'lixeira' && !numeroNota(r.numero_nota))
    .map((r) => ({ id: Number(r.id), fornecedor: r.fornecedor || '', fornecedorCnpj: soDigitos(r.fornecedor_cnpj), valor: parseValorMisto(r.valor_despeza), data: dataISO(r.data || r.created_at) }))
    .filter((r) => r.valor > 0 && r.data);

  // 1) uma nota → uma requisição
  const porNota = new Map<string, SugestaoNota[]>();
  for (const r of livres) {
    const melhor = casarNota(r, notas, { cnpjPorNome, jaUsadas })[0];
    if (!melhor || melhor.confianca !== 'alta') continue;
    const k = chaveNota(melhor.nota);
    (porNota.get(k) || porNota.set(k, []).get(k)!).push({ reqIds: [r.id], nota: melhor.nota, motivos: melhor.motivos });
  }
  const sugestoes: SugestaoNota[] = [];
  const reqUsada = new Set<number>();
  const notaUsada = new Set<string>();
  for (const [k, l] of porNota) {
    if (l.length !== 1) continue; // a mesma nota "serve" para duas: talvez seja uma nota para várias — vê na soma
    sugestoes.push(l[0]); notaUsada.add(k); reqUsada.add(l[0].reqIds[0]);
  }

  // 2) uma nota → várias requisições (a soma dá o valor da nota, de um jeito só)
  const restantes = livres.filter((r) => !reqUsada.has(r.id));
  for (const n of notas) {
    const k = chaveNota(n);
    if (jaUsadas.has(k) || notaUsada.has(k)) continue;
    const g = casarNotaSoma(n, restantes.filter((r) => !reqUsada.has(r.id)), { cnpjPorNome });
    if (!g || g.confianca !== 'alta') continue;
    sugestoes.push({ reqIds: g.reqIds, nota: n, motivos: g.motivos });
    notaUsada.add(k);
    for (const id of g.reqIds) reqUsada.add(id);
  }

  cache = { em: Date.now(), sugestoes };
  return sugestoes;
}

/** Depois de confirmar uma, a lista tem de ser refeita (a nota sai das sugestões). */
export function esquecerCacheNotas() { cache = null; }
