// Cache de notas fiscais — lado SERVIDOR (banco + Omie + storage).
//
// Fluxo: indexarNotas() (RPC) mantém notas_fiscais_docs a partir de
// notas_entrada + portal_nt_notas_saida; guardarLote() pega as notas sem
// PDF/XML (mais recentes primeiro) e busca na Omie:
//   entrada / saida_produto → DfeDocs/ObterNfe (PDF temporário + XML); PDF
//                             cai para GetUrlDanfe se o cPdf falhar
//   saida_servico           → ObterNFSe (PDF + XML)
// e grava no bucket PRIVADO `notas-fiscais`. Erro conta tentativa com backoff;
// bloqueio da Omie PARA o lote; Omie fora não conta tentativa.
//
// Cliente Omie: lib/ajustes/omie.ts (sem throttle próprio) → espaçamento de
// 400 ms entre notas aqui. Nunca importar este arquivo no bundle do browser.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { obterIdNfePorChave, obterDanfeDfe, obterUrlDanfe, obterUrlNFSePdf } from '@/lib/ajustes/omie';
import type { Conta } from '@/lib/ajustes/conta';
import {
  type LinhaDoc, type Cobertura, MAX_TENTATIVAS, caminhoArquivo, proximaTentativa, adiarPendente,
  ehPdf, ehBloqueioOmie, ehOmieFora, ehNaoConcluida, pareceUrl, desescaparXml,
} from './cache-regras';

export const BUCKET = 'notas-fiscais';
export const JOB = 'notas-cache-docs';
const ESPACO_MS = 400;
const LIMITE_PDF_BYTES = 25 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const COLS = 'id,conta_omie,tipo,chave_nfe,n_cod_nf,numero,serie,data_emissao,parte_nome,parte_doc,valor,cancelada,pdf_path,xml_path,pdf_em,xml_em,tentativas,proxima_tentativa_em,ultimo_erro';

/** Garante o bucket privado (a migration já cria; aqui é o fallback). */
let bucketOk = false;
export async function ensureBucket(): Promise<void> {
  if (bucketOk) return;
  try {
    const { data } = await supabaseAdmin.storage.listBuckets();
    if (!data?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    }
    bucketOk = true;
  } catch { /* tenta na próxima */ }
}

/** Tabela ausente (migration não aplicada)? */
export function migracaoFaltando(msg: string | null | undefined): boolean {
  return /notas_fiscais_docs|notas_fiscais_indexar|schema cache|does not exist|PGRST205|42P01/i.test(String(msg || ''));
}

/** RPC: indexa notas_entrada + portal_nt_notas_saida (só metadados). */
export async function indexarNotas(): Promise<{ entrada: number; saida: number; erro?: string }> {
  const { data, error } = await supabaseAdmin.rpc('notas_fiscais_indexar');
  if (error) return { entrada: 0, saida: 0, erro: error.message };
  const d = (data || {}) as { entrada?: number; saida?: number };
  return { entrada: Number(d.entrada || 0), saida: Number(d.saida || 0) };
}

// ---------------------------------------------------------------------------
// Download/validação
// ---------------------------------------------------------------------------
async function baixarPdf(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > LIMITE_PDF_BYTES) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > LIMITE_PDF_BYTES) return null;
    return ehPdf(buf) ? buf : null;
  } catch {
    return null;
  }
}

/** XML: texto (cru ou com entidades) ou URL temporária (NFS-e) → texto validado. */
async function obterXml(valor: string | null | undefined): Promise<string | null> {
  if (!valor) return null;
  if (pareceUrl(valor)) {
    try {
      const r = await fetch(String(valor).trim(), { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      if (!r.ok) return null;
      const txt = await r.text();
      return desescaparXml(txt);
    } catch {
      return null;
    }
  }
  return desescaparXml(valor);
}

export interface DocumentoOmie {
  pdf: Buffer | null;
  xml: string | null;
  pendente?: boolean;      // NF ainda não concluída/consultável
  motivo?: string;
}

/** Busca PDF + XML da nota na Omie (sem gravar). Lança em bloqueio / Omie fora. */
export async function obterDocumentoOmie(l: LinhaDoc): Promise<DocumentoOmie> {
  const conta = String(l.conta_omie).toUpperCase() as Conta;
  if (l.tipo === 'saida_servico') {
    const r = await obterUrlNFSePdf(conta, l.n_cod_nf);
    const pdf = await baixarPdf(r?.url);
    const xml = await obterXml(r?.xml);   // cXmlNFSe é uma URL temporária
    return { pdf, xml, motivo: !pdf && !xml ? 'ObterNFSe sem PDF/XML' : undefined };
  }
  // NF-e (entrada ou saída de produto): DfeDocs/ObterNfe pelo id interno
  let nId: number | null = Number(l.n_cod_nf) || null;
  let d: Awaited<ReturnType<typeof obterDanfeDfe>> | null = null;
  try {
    d = nId ? await obterDanfeDfe(conta, nId) : null;
  } catch (e) {
    if (ehBloqueioOmie(e) || ehOmieFora(e)) throw e;
    if (!ehNaoConcluida(e)) throw e;
    d = null;
  }
  if ((!d || (!d.url && !d.xml)) && l.chave_nfe) {
    // id pode ser o nCodNF da listagem e não o nIdNfe do DFe: resolve pela chave
    const porChave = await obterIdNfePorChave(conta, l.chave_nfe);
    if (porChave == null) return { pdf: null, xml: null, pendente: true, motivo: 'NF ainda não concluída na Omie' };
    if (porChave !== nId) {
      nId = porChave;
      await sleep(ESPACO_MS);
      d = await obterDanfeDfe(conta, nId);
    }
  }
  let pdf = await baixarPdf(d?.url);
  if (!pdf) {
    // fallback: DANFE pelo utilitário (só PDF)
    try {
      await sleep(ESPACO_MS);
      const u = await obterUrlDanfe(conta, l.n_cod_nf);
      pdf = await baixarPdf(u?.url);
    } catch (e) {
      if (ehBloqueioOmie(e) || ehOmieFora(e)) throw e;
    }
  }
  const xml = await obterXml(d?.xml);   // cXmlNfe vem com entidades HTML (&lt;?xml …)
  return { pdf, xml, motivo: !pdf && !xml ? (d?.status || 'Omie sem PDF/XML') : undefined };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
export interface ResultadoGuardar {
  id: number;
  ok: boolean;
  pdf: boolean;
  xml: boolean;
  pendente?: boolean;
  bloqueio?: boolean;
  omieFora?: boolean;
  erro?: string;
}

async function upload(path: string, body: Buffer | string, contentType: string): Promise<boolean> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
  return !error;
}

/** Busca na Omie e grava PDF/XML de UMA nota; atualiza a linha (fila/erros). */
export async function guardarNota(l: LinhaDoc): Promise<ResultadoGuardar> {
  await ensureBucket();
  const agora = new Date();
  const patch: Record<string, unknown> = { atualizado_em: agora.toISOString() };
  try {
    const doc = await obterDocumentoOmie(l);
    if (doc.pendente) {
      patch.proxima_tentativa_em = adiarPendente(agora).toISOString();
      patch.ultimo_erro = doc.motivo || 'NF ainda não concluída na Omie';
      await supabaseAdmin.from('notas_fiscais_docs').update(patch).eq('id', l.id);
      return { id: l.id, ok: false, pdf: false, xml: false, pendente: true, erro: patch.ultimo_erro as string };
    }
    let pdfOk = !!l.pdf_path;
    let xmlOk = !!l.xml_path;
    if (doc.pdf && !l.pdf_path) {
      const p = caminhoArquivo(l, 'pdf');
      if (await upload(p, doc.pdf, 'application/pdf')) { patch.pdf_path = p; patch.pdf_em = agora.toISOString(); pdfOk = true; }
    }
    if (doc.xml && !l.xml_path) {
      const p = caminhoArquivo(l, 'xml');
      if (await upload(p, doc.xml, 'application/xml')) { patch.xml_path = p; patch.xml_em = agora.toISOString(); xmlOk = true; }
    }
    if (pdfOk && xmlOk) {
      patch.ultimo_erro = null;
      patch.proxima_tentativa_em = null;
    } else {
      const t = (l.tentativas || 0) + 1;
      patch.tentativas = t;
      patch.proxima_tentativa_em = proximaTentativa(t, agora).toISOString();
      patch.ultimo_erro = (t >= MAX_TENTATIVAS ? 'sem documento na Omie: ' : '') + (doc.motivo || (!pdfOk ? 'sem PDF' : 'sem XML'));
    }
    await supabaseAdmin.from('notas_fiscais_docs').update(patch).eq('id', l.id);
    return { id: l.id, ok: pdfOk, pdf: pdfOk, xml: xmlOk, erro: pdfOk && xmlOk ? undefined : String(patch.ultimo_erro) };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (ehBloqueioOmie(e)) return { id: l.id, ok: false, pdf: false, xml: false, bloqueio: true, erro: msg };
    if (ehOmieFora(e)) return { id: l.id, ok: false, pdf: false, xml: false, omieFora: true, erro: msg };
    const t = (l.tentativas || 0) + 1;
    patch.tentativas = t;
    patch.proxima_tentativa_em = proximaTentativa(t, agora).toISOString();
    patch.ultimo_erro = (t >= MAX_TENTATIVAS ? 'sem documento na Omie: ' : '') + msg.slice(0, 300);
    await supabaseAdmin.from('notas_fiscais_docs').update(patch).eq('id', l.id);
    return { id: l.id, ok: false, pdf: false, xml: false, erro: msg };
  }
}

export interface ResultadoLote {
  processadas: number;
  completas: number;
  parciais: number;
  pendentes: number;
  falhas: number;
  paradoPor?: 'bloqueio' | 'omieFora';
  erro?: string;
}

/** Processa até `limite` notas da fila (mais recentes primeiro). Para em bloqueio/Omie fora. */
export async function guardarLote(opts: { limite?: number; conta?: string; ids?: number[] } = {}): Promise<ResultadoLote> {
  const limite = Math.max(1, Math.min(500, opts.limite ?? 120));
  const out: ResultadoLote = { processadas: 0, completas: 0, parciais: 0, pendentes: 0, falhas: 0 };
  let q = supabaseAdmin
    .from('notas_fiscais_docs')
    .select(COLS)
    .lt('tentativas', MAX_TENTATIVAS)
    // um único `or=` (PostgREST): falta PDF ou XML E já pode tentar de novo
    .or(`and(or(pdf_path.is.null,xml_path.is.null),or(proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${new Date().toISOString()}))`)
    .order('data_emissao', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limite);
  if (opts.conta) q = q.eq('conta_omie', String(opts.conta).toUpperCase());
  if (opts.ids?.length) q = q.in('id', opts.ids);
  const { data, error } = await q;
  if (error) { out.erro = error.message; return out; }
  const linhas = (data || []) as unknown as LinhaDoc[];
  for (const l of linhas) {
    const r = await guardarNota(l);
    out.processadas++;
    if (r.bloqueio) { out.paradoPor = 'bloqueio'; out.erro = r.erro; break; }
    if (r.omieFora) { out.paradoPor = 'omieFora'; out.erro = r.erro; break; }
    if (r.pendente) out.pendentes++;
    else if (r.pdf && r.xml) out.completas++;
    else if (r.pdf || r.xml) out.parciais++;
    else out.falhas++;
    await sleep(ESPACO_MS);
  }
  return out;
}

/** Lê um arquivo guardado (bucket privado). null = não existe. */
export async function lerArquivo(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Contagens para a faixa de cobertura. */
export async function cobertura(conta?: string): Promise<Cobertura> {
  const base = () => {
    let q = supabaseAdmin.from('notas_fiscais_docs').select('id', { count: 'exact', head: true });
    if (conta) q = q.eq('conta_omie', String(conta).toUpperCase());
    return q;
  };
  const [t, p, x, c, s] = await Promise.all([
    base(),
    base().not('pdf_path', 'is', null),
    base().not('xml_path', 'is', null),
    base().not('pdf_path', 'is', null).not('xml_path', 'is', null),
    base().gte('tentativas', MAX_TENTATIVAS).or('pdf_path.is.null,xml_path.is.null'),
  ]);
  const total = t.count || 0;
  const completas = c.count || 0;
  const semDocumento = s.count || 0;
  return { total, comPdf: p.count || 0, comXml: x.count || 0, completas, semDocumento, naFila: Math.max(0, total - completas - semDocumento) };
}

/** Última rodada do worker (cron_runs). */
export async function ultimaRodada(): Promise<{ iniciado_em: string; status: string | null; detalhe: unknown } | null> {
  try {
    const { data } = await supabaseAdmin.from('cron_runs').select('iniciado_em,status,detalhe').eq('job', JOB).order('iniciado_em', { ascending: false }).limit(1);
    const r = (data || [])[0] as { iniciado_em: string; status: string | null; detalhe: unknown } | undefined;
    return r || null;
  } catch { return null; }
}

/** Rodada completa do agendador: indexa + um lote. Registra em cron_runs. */
export async function rodarAgendado(limite = 120): Promise<string> {
  const { comCronRun } = await import('@/lib/cron/observar');
  const r = await comCronRun(JOB, async () => {
    const idx = await indexarNotas();
    const lote = await guardarLote({ limite });
    return { idx, lote };
  }, { lockMinutos: 9, prioridade: 'rapido' });
  if (r.pulado) return 'pulado (rodada anterior ainda aberta)';
  if (r.erro) return 'erro: ' + r.erro;
  const { idx, lote } = r.resultado!;
  return `indexadas e:${idx.entrada} s:${idx.saida}${idx.erro ? ' (idx erro: ' + idx.erro + ')' : ''}; lote ${lote.processadas}: ${lote.completas} completas, ${lote.parciais} parciais, ${lote.pendentes} pendentes, ${lote.falhas} falhas${lote.paradoPor ? ' — PAROU: ' + lote.paradoPor + ' ' + (lote.erro || '') : ''}`;
}
