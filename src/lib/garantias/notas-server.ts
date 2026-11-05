// Notas fiscais da garantia — banco (nada vai à Omie). Regras em notas.ts. Fontes:
//  - notas_fiscais_docs (saida_servico) = NFS-e emitidas; parte = montadora.
//  - os_servicos_itens = itens da OS no Omie (texto + Hora/Desloc/Peças com valor).
//  - notas_entrada = notas recebidas (itens com CFOP); x.949 = peça em garantia.
//  - garantia_notas = decisão humana (vinculada/descartada) — sql/garantias-notas.sql.
//  - garantia_pecas.forma_reembolso = checklist "reposta pela fábrica × paga na NFS-e".
// Sem a migration tudo continua lendo (só as sugestões); gravar responde migracaoFaltando.
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS, BUCKET_GARANTIAS } from './constants';
import { registrarEvento } from './server';
import {
  extrairSGs, extrairDRVG, normSG, somarComponentes, casarPecas, ehCfopGarantia, normCodigo,
  type Componente, type ItemNota, type CasamentoPeca,
} from './notas';

export type StatusVinculo = 'vinculada' | 'descartada' | null;
export type Forma = 'reposta' | 'paga';

export interface NotaReembolso {
  docId: number;
  conta: string;
  numero: string | null;
  data: string | null;
  parte: string;
  valor: number;
  osNum: string | null;
  texto: string;
  drvg: string | null;
  sgs: string[];
  /** SG → número da garantia no portal (GAR-xxxx), quando achou */
  garantiasCobertas: { sg: string; numero: string | null; id: string | null }[];
  componentes: Record<Componente, number>;
  citaEsta: boolean;
  temPdf: boolean;
  vinculo: StatusVinculo;
}

export interface NotaPecas {
  entradaId: number;
  docId: number | null;
  conta: string;
  numero: string;
  data: string;
  fornecedor: string;
  valor: number;
  itens: (ItemNota & { casou: CasamentoPeca['como'] | null; peca: string | null })[];
  casadas: number;
  vinculo: StatusVinculo;
}

/** nota anexada à mão (não estava no sistema) — sql/garantias-notas-manual.sql */
export interface NotaManual {
  id: string;
  papel: 'reembolso' | 'pecas';
  numero: string | null;
  data: string | null;
  valor: number | null;
  url: string;
  nomeArquivo: string | null;
  criadoPor: string | null;
  criadoEm: string;
}

export interface NotasGarantia {
  garantia: {
    id: string; numero: string; sg: string | null; montadora: string | null; status: string;
    /** marcada "não precisa de NFS-e de reembolso" */
    reembolsoDispensado: boolean;
    /** tem mão de obra/deslocamento cobrado e não foi dispensada */
    precisaNfse: boolean;
  };
  reembolso: { sugeridas: NotaReembolso[]; outras: NotaReembolso[] };
  pecas: { sugeridas: NotaPecas[]; outras: NotaPecas[] };
  manuais: NotaManual[];
  migracaoFaltando: boolean;
  /** falta sql/garantias-notas-manual.sql (anexar à mão não grava) */
  manualFaltando: boolean;
}

interface Vinculo {
  garantia_id: string;
  papel: 'reembolso' | 'pecas';
  doc_id: number | null;
  entrada_id: number | null;
  numero: string | null;
  data_emissao: string | null;
  status: 'vinculada' | 'descartada';
  id?: string;
  arquivo_url?: string | null;
  /** texto do arquivo anexado à mão, normalizado (sql/garantias-notas-pecas.sql) */
  texto_arquivo?: string | null;
}

const TBL_NOTAS = 'garantia_notas';

function tabelaFalta(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /garantia_notas/.test(err.message || ''));
}

async function lerVinculos(garantiaIds: string[]): Promise<{ ok: boolean; linhas: Vinculo[] }> {
  if (!garantiaIds.length) return { ok: true, linhas: [] };
  const linhas: Vinculo[] = [];
  for (let i = 0; i < garantiaIds.length; i += 150) {
    const ids = garantiaIds.slice(i, i + 150);
    const ler = (cols: string) => supabase.from(TBL_NOTAS).select(cols).in('garantia_id', ids);
    let { data, error } = await ler('id, garantia_id, papel, doc_id, entrada_id, numero, data_emissao, status, arquivo_url, texto_arquivo');
    if (error && error.code === '42703') ({ data, error } = await ler('id, garantia_id, papel, doc_id, entrada_id, numero, data_emissao, status, arquivo_url'));
    if (error && error.code === '42703') ({ data, error } = await ler('id, garantia_id, papel, doc_id, entrada_id, numero, data_emissao, status'));
    if (error) {
      if (tabelaFalta(error)) return { ok: false, linhas: [] };
      throw new Error(error.message);
    }
    linhas.push(...((data || []) as unknown as Vinculo[]));
  }
  return { ok: true, linhas };
}

// "Mahindra" / "Kuhn" — o nome da montadora no portal é curto; na nota vem a razão social.
function chaveMontadora(nome: string | null | undefined): string | null {
  const p = String(nome || '').trim().split(/\s+/)[0];
  return p && p.length >= 3 ? p : null;
}

function diaDeBR(d: string | null | undefined): string {
  const m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d || '').slice(0, 10);
}

function diasAntes(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// NFS-e emitidas contra a montadora desde `desde`, com o texto e os componentes.
export async function notasReembolsoDaMontadora(montadora: string, desde: string): Promise<NotaReembolso[]> {
  const chave = chaveMontadora(montadora);
  if (!chave) return [];
  const { data: docs } = await supabase
    .from('notas_fiscais_docs')
    .select('id, conta_omie, numero, data_emissao, parte_nome, valor, os_num, cancelada, pdf_path')
    .eq('tipo', 'saida_servico')
    .ilike('parte_nome', `%${chave}%`)
    .gte('data_emissao', desde)
    .order('data_emissao', { ascending: false })
    .limit(300);
  const notas = (docs || []).filter((d) => !d.cancelada && Number(d.valor) > 0);
  if (!notas.length) return [];

  // Itens das OS (texto da nota + valores por componente)
  const itensPorOs = new Map<string, { descricao: string; valor: number }[]>();
  const porConta = new Map<string, string[]>();
  for (const n of notas) if (n.os_num) porConta.set(n.conta_omie, [...(porConta.get(n.conta_omie) || []), String(n.os_num)]);
  for (const [conta, nums] of porConta) {
    for (let i = 0; i < nums.length; i += 150) {
      const { data: itens } = await supabase
        .from('os_servicos_itens')
        .select('numero_os, descricao, valor_total')
        .eq('conta_omie', conta)
        .in('numero_os', nums.slice(i, i + 150));
      for (const it of itens || []) {
        const k = `${conta}|${it.numero_os}`;
        itensPorOs.set(k, [...(itensPorOs.get(k) || []), { descricao: String(it.descricao || ''), valor: Number(it.valor_total) || 0 }]);
      }
    }
  }

  const lista: NotaReembolso[] = notas.map((n) => {
    const itens = itensPorOs.get(`${n.conta_omie}|${n.os_num}`) || [];
    const texto = itens.map((i) => i.descricao).join(' | ');
    return {
      docId: n.id,
      conta: n.conta_omie,
      numero: n.numero,
      data: n.data_emissao,
      parte: n.parte_nome,
      valor: Number(n.valor) || 0,
      osNum: n.os_num ? String(n.os_num) : null,
      texto,
      drvg: extrairDRVG(texto),
      sgs: extrairSGs(texto),
      garantiasCobertas: [],
      componentes: somarComponentes(itens),
      citaEsta: false,
      temPdf: !!n.pdf_path,
      vinculo: null,
    };
  });

  // SG → garantia do portal
  const todasSgs = [...new Set(lista.flatMap((n) => n.sgs))];
  const mapa = new Map<string, { id: string; numero: string }>();
  for (let i = 0; i < todasSgs.length; i += 150) {
    const { data: gs } = await supabase
      .from(TBL_GARANTIAS)
      .select('id, numero, numero_externo')
      .in('numero_externo', todasSgs.slice(i, i + 150));
    for (const g of gs || []) mapa.set(normSG(g.numero_externo), { id: g.id, numero: g.numero });
  }
  for (const n of lista) {
    n.garantiasCobertas = n.sgs.map((sg) => ({ sg, numero: mapa.get(sg)?.numero || null, id: mapa.get(sg)?.id || null }));
  }
  return lista;
}

async function docsDasEntradas(ids: number[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from('notas_fiscais_docs')
      .select('id, origem_id')
      .eq('origem_tabela', 'notas_entrada')
      .in('origem_id', ids.slice(i, i + 150).map(String));
    for (const d of data || []) m.set(String(d.origem_id), d.id);
  }
  return m;
}

interface NotaEntrada949 { entradaId: number; conta: string; numero: string; data: string; fornecedor: string; valor: number; itens: ItemNota[] }

// Notas de entrada da montadora com itens x.949 (só esses itens), desde `desde`.
async function entradas949(chave: string, desde: string, limite = 2000): Promise<NotaEntrada949[]> {
  const { data: ents } = await supabase
    .from('notas_entrada')
    .select('id, conta_omie, numero_nf, data_emissao, valor_nf, destinatario, itens')
    .ilike('destinatario->>cRazao', `%${chave}%`)
    .gte('ano', Number(desde.slice(0, 4)))
    .order('id', { ascending: false })
    .limit(limite);
  const out: NotaEntrada949[] = [];
  for (const e of ents || []) {
    const data = diaDeBR(e.data_emissao);
    if (data < desde) continue;
    const itens: ItemNota[] = ((e.itens as { prod?: Record<string, unknown> }[]) || [])
      .map((i) => ({
        codigo: String(i.prod?.cProd || ''),
        descricao: String(i.prod?.xProd || ''),
        cfop: String(i.prod?.CFOP || ''),
        valor: Number(i.prod?.vProd) || 0,
        quantidade: Number(i.prod?.qCom) || 0,
      }))
      .filter((i) => ehCfopGarantia(i.cfop));
    if (!itens.length) continue;
    out.push({
      entradaId: e.id,
      conta: e.conta_omie,
      numero: String(e.numero_nf || '').replace(/^0+/, ''),
      data,
      fornecedor: (e.destinatario as { cRazao?: string })?.cRazao || '',
      valor: Number(e.valor_nf) || 0,
      itens,
    });
  }
  return out;
}

function sugereReembolso(n: NotaReembolso, pago: number): boolean {
  // sem SG citada (Kuhn antiga), valor igual ao pago pela fábrica também conta
  return n.citaEsta || (!n.sgs.length && pago > 0 && Math.abs(n.valor - pago) < 0.05);
}

export async function notasDaGarantia(id: string): Promise<NotasGarantia | null> {
  const lerG = (extra: string) => supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, status, created_at, valor_pago_total, valor_pago_horas, valor_pago_km, montadora:garantia_montadoras(nome), pecas:garantia_pecas(cod_produto, descricao)' + extra)
    .eq('id', id)
    .maybeSingle();
  let { data: gRaw, error: gErr } = await lerG(', reembolso_dispensado');
  if (gErr && gErr.code === '42703') ({ data: gRaw, error: gErr } = await lerG(''));
  if (!gRaw) return null;
  const g = gRaw as unknown as {
    id: string; numero: string; numero_externo: string | null; status: string; created_at: string;
    valor_pago_total: number | null; valor_pago_horas: number | null; valor_pago_km: number | null;
    reembolso_dispensado?: boolean; montadora: unknown; pecas: unknown;
  };
  const montadora = (g.montadora as unknown as { nome: string } | null)?.nome || null;
  const sg = normSG(g.numero_externo) || null;
  const desde = diasAntes(g.created_at, 3);
  const vinc = await lerVinculos([g.id]);
  const estado = (papel: Vinculo['papel'], doc: number | null, ent: number | null): StatusVinculo =>
    vinc.linhas.find((v) => v.papel === papel && (doc ? v.doc_id === doc : v.entrada_id === ent))?.status ?? null;

  // ── NFS-e de reembolso ──
  const reemb = montadora ? await notasReembolsoDaMontadora(montadora, desde) : [];
  const pago = Number(g.valor_pago_total) || 0;
  for (const n of reemb) {
    n.citaEsta = !!sg && n.sgs.includes(sg);
    n.vinculo = estado('reembolso', n.docId, null);
  }
  const sugeridas = reemb.filter((n) => n.vinculo === 'vinculada' || (n.vinculo !== 'descartada' && sugereReembolso(n, pago)));
  const outras = reemb.filter((n) => !sugeridas.includes(n)).slice(0, 10);

  // ── Peças recebidas (entrada x.949) ──
  const pecasG = (g.pecas as { cod_produto: string | null; descricao: string | null }[]) || [];
  const chave = chaveMontadora(montadora);
  let sugPecas: NotaPecas[] = [];
  let outrasPecas: NotaPecas[] = [];
  if (chave) {
    const lista: NotaPecas[] = (await entradas949(chave, desde, 400)).map((e) => {
      const cas = casarPecas(pecasG, e.itens);
      return {
        ...e,
        docId: null,
        itens: e.itens.map((it, idx) => {
          const c = cas.find((x) => x.item === idx);
          return { ...it, casou: c?.como || null, peca: c?.peca || null };
        }),
        casadas: cas.length,
        vinculo: estado('pecas', null, e.entradaId),
      };
    });
    sugPecas = lista
      .filter((n) => n.vinculo === 'vinculada' || (n.vinculo !== 'descartada' && n.casadas > 0))
      .sort((a, b) => b.casadas - a.casadas || a.data.localeCompare(b.data));
    outrasPecas = lista.filter((n) => !sugPecas.includes(n)).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 10);
    const docs = await docsDasEntradas([...sugPecas, ...outrasPecas].map((n) => n.entradaId));
    for (const n of [...sugPecas, ...outrasPecas]) n.docId = docs.get(String(n.entradaId)) ?? null;
  }

  const man = vinc.ok ? await lerManuais(g.id) : { ok: false, linhas: [] };
  return {
    garantia: {
      id: g.id, numero: g.numero, sg, montadora, status: g.status,
      reembolsoDispensado: !!g.reembolso_dispensado,
      precisaNfse: precisaNfseReembolso(g),
    },
    reembolso: { sugeridas, outras },
    pecas: { sugeridas: sugPecas, outras: outrasPecas },
    manuais: man.linhas,
    migracaoFaltando: !vinc.ok,
    manualFaltando: !man.ok,
  };
}

async function lerManuais(garantiaId: string): Promise<{ ok: boolean; linhas: NotaManual[] }> {
  const { data, error } = await supabase
    .from(TBL_NOTAS)
    .select('id, papel, numero, data_emissao, valor, arquivo_url, nome_arquivo, criado_por, criado_em')
    .eq('garantia_id', garantiaId)
    .not('arquivo_url', 'is', null)
    .order('criado_em', { ascending: true });
  if (error) {
    if (error.code === '42703' || /arquivo_url/.test(error.message)) return { ok: false, linhas: [] };
    throw new Error(error.message);
  }
  return {
    ok: true,
    linhas: (data || []).map((r) => ({
      id: r.id, papel: r.papel, numero: r.numero, data: r.data_emissao, valor: r.valor == null ? null : Number(r.valor),
      url: r.arquivo_url, nomeArquivo: r.nome_arquivo, criadoPor: r.criado_por, criadoEm: r.criado_em,
    })),
  };
}

// Texto do arquivo da nota (PDF ou XML), sem espaços nem pontuação, para achar os
// códigos das peças. Foto ou arquivo ilegível = '' (o portal pergunta ao usuário).
async function textoDoArquivo(bytes: Uint8Array, tipo: string, nome: string): Promise<string> {
  try {
    let t = '';
    if (/xml/i.test(tipo) || /.xml$/i.test(nome)) {
      t = new TextDecoder().decode(bytes).replace(/<[^>]+>/g, ' ');
    } else if (/pdf/i.test(tipo) || /.pdf$/i.test(nome)) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
      try {
        for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
          const tc = await (await doc.getPage(i)).getTextContent();
          t += tc.items.map((x) => ('str' in x ? x.str : '')).join(' ') + ' ';
        }
      } finally {
        try { await doc.destroy(); } catch { /* */ }
      }
    }
    return normCodigo(t).slice(0, 200000);
  } catch {
    return '';
  }
}

function caminhoDoArquivo(url: string): string | null {
  const c = String(url).split(`/${BUCKET_GARANTIAS}/`)[1];
  return c ? decodeURIComponent(c.split('?')[0]) : null;
}

// Notas anexadas à mão antes da leitura existir: lê o arquivo uma vez e guarda o texto.
async function garantirTextos(linhas: Vinculo[]): Promise<void> {
  const faltam = linhas.filter((v) => v.arquivo_url && v.texto_arquivo == null && v.id && v.papel === 'pecas');
  for (const v of faltam) {
    const caminho = caminhoDoArquivo(v.arquivo_url!);
    if (!caminho) { v.texto_arquivo = ''; continue; }
    const { data } = await supabase.storage.from(BUCKET_GARANTIAS).download(caminho);
    const texto = data ? await textoDoArquivo(new Uint8Array(await data.arrayBuffer()), data.type || '', caminho) : '';
    v.texto_arquivo = texto;
    await supabase.from(TBL_NOTAS).update({ texto_arquivo: texto }).eq('id', v.id!);
  }
}

function nomeSeguro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '') || 'nota';
}

const MIG_MANUAL = 'Falta aplicar a migration sql/garantias-notas-manual.sql.';

// Nota que não está no sistema: o garantista anexa o arquivo (PDF/XML/foto) com nº, data e valor.
export async function anexarNotaManual(garantiaId: string, p: {
  papel: 'reembolso' | 'pecas';
  numero: string; data: string | null; valor: number | null;
  arquivo: { nome: string; tipo: string; bytes: Buffer };
  ator: string;
}): Promise<{ ok: true } | { ok: false; erro: string; status: number }> {
  const { data: g } = await supabase.from(TBL_GARANTIAS).select('id').eq('id', garantiaId).maybeSingle();
  if (!g) return { ok: false, erro: 'Garantia não encontrada.', status: 404 };
  const caminho = `${garantiaId}/nota_${p.papel}/${Date.now()}_${nomeSeguro(p.arquivo.nome)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_GARANTIAS)
    .upload(caminho, p.arquivo.bytes, { contentType: p.arquivo.tipo || 'application/octet-stream', upsert: false });
  if (upErr) return { ok: false, erro: 'Falha ao enviar o arquivo.', status: 500 };
  const url = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(caminho).data.publicUrl;

  const linha = {
    garantia_id: garantiaId,
    papel: p.papel,
    numero: p.numero, data_emissao: p.data, valor: p.valor,
    arquivo_url: url, nome_arquivo: p.arquivo.nome,
    status: 'vinculada', origem: 'manual', criado_por: p.ator,
  };
  const texto = p.papel === 'pecas' ? await textoDoArquivo(new Uint8Array(p.arquivo.bytes), p.arquivo.tipo, p.arquivo.nome) : null;
  let { error } = await supabase.from(TBL_NOTAS).insert(texto == null ? linha : { ...linha, texto_arquivo: texto });
  if (error && error.code === '42703' && texto != null) ({ error } = await supabase.from(TBL_NOTAS).insert(linha));
  if (error) {
    await supabase.storage.from(BUCKET_GARANTIAS).remove([caminho]);
    if (tabelaFalta(error)) return { ok: false, erro: 'Falta aplicar a migration sql/garantias-notas.sql.', status: 503 };
    if (error.code === '42703' || error.code === '23514' || /arquivo_url|tem_nota/.test(error.message)) return { ok: false, erro: MIG_MANUAL, status: 503 };
    return { ok: false, erro: error.message, status: 500 };
  }
  await registrarEvento(garantiaId, {
    tipo: 'nota_vinculada',
    ator: p.ator,
    detalhe: `${p.papel === 'reembolso' ? 'NFS-e de reembolso' : 'NF-e de peças da fábrica'} ${p.numero} anexada à mão (${p.arquivo.nome})`,
  });
  return { ok: true };
}

export async function removerNotaManual(garantiaId: string, notaId: string, ator: string) {
  const { data: n, error } = await supabase
    .from(TBL_NOTAS)
    .delete()
    .eq('id', notaId)
    .eq('garantia_id', garantiaId)
    .not('arquivo_url', 'is', null)
    .select('papel, numero, arquivo_url')
    .maybeSingle();
  if (error) return { ok: false as const, erro: error.message, status: 500 };
  if (!n) return { ok: false as const, erro: 'Nota não encontrada.', status: 404 };
  const caminho = caminhoDoArquivo(n.arquivo_url);
  if (caminho) await supabase.storage.from(BUCKET_GARANTIAS).remove([caminho]);
  await registrarEvento(garantiaId, {
    tipo: 'nota_desfeita',
    ator,
    detalhe: `Removida a ${n.papel === 'reembolso' ? 'NFS-e de reembolso' : 'NF-e de peças da fábrica'} ${n.numero || ''} anexada à mão`,
  });
  return { ok: true as const };
}

// ── Gravar a decisão sobre uma nota ──────────────────────────────────────────

export async function decidirNota(garantiaId: string, p: {
  papel: 'reembolso' | 'pecas';
  docId?: number | null;
  entradaId?: number | null;
  acao: 'vincular' | 'descartar' | 'desfazer';
  origem?: 'sugerida' | 'manual';
  ator: string;
}): Promise<{ ok: true } | { ok: false; erro: string; status: number; migracaoFaltando?: boolean }> {
  const docId = p.papel === 'reembolso' ? Number(p.docId) || null : Number(p.docId) || null;
  const entradaId = p.papel === 'pecas' ? Number(p.entradaId) || null : null;
  if (p.papel === 'reembolso' && !docId) return { ok: false, erro: 'Nota não informada.', status: 400 };
  if (p.papel === 'pecas' && !entradaId) return { ok: false, erro: 'Nota não informada.', status: 400 };

  // dados da nota (guardados junto, para o histórico não depender do cache)
  let numero: string | null = null, data: string | null = null, valor: number | null = null;
  if (p.papel === 'reembolso') {
    const { data: d } = await supabase.from('notas_fiscais_docs').select('numero, data_emissao, valor').eq('id', docId).maybeSingle();
    if (!d) return { ok: false, erro: 'NFS-e não encontrada.', status: 404 };
    numero = d.numero; data = d.data_emissao; valor = Number(d.valor) || 0;
  } else {
    const { data: e } = await supabase.from('notas_entrada').select('numero_nf, data_emissao, valor_nf').eq('id', entradaId).maybeSingle();
    if (!e) return { ok: false, erro: 'Nota de entrada não encontrada.', status: 404 };
    numero = String(e.numero_nf || '').replace(/^0+/, ''); data = diaDeBR(e.data_emissao); valor = Number(e.valor_nf) || 0;
  }

  const filtro = supabase.from(TBL_NOTAS).delete().eq('garantia_id', garantiaId).eq('papel', p.papel);
  const { error: errDel } = p.papel === 'reembolso' ? await filtro.eq('doc_id', docId!) : await filtro.eq('entrada_id', entradaId!);
  if (errDel) {
    if (tabelaFalta(errDel)) return { ok: false, erro: 'Falta aplicar a migration sql/garantias-notas.sql.', status: 503, migracaoFaltando: true };
    return { ok: false, erro: errDel.message, status: 500 };
  }
  if (p.acao !== 'desfazer') {
    const { error } = await supabase.from(TBL_NOTAS).insert({
      garantia_id: garantiaId,
      papel: p.papel,
      doc_id: docId,
      entrada_id: entradaId,
      numero, data_emissao: data, valor,
      status: p.acao === 'vincular' ? 'vinculada' : 'descartada',
      origem: p.origem === 'manual' ? 'manual' : 'sugerida',
      criado_por: p.ator,
    });
    if (error) {
      if (tabelaFalta(error)) return { ok: false, erro: 'Falta aplicar a migration sql/garantias-notas.sql.', status: 503, migracaoFaltando: true };
      return { ok: false, erro: error.message, status: 500 };
    }
  }
  const rotulo = p.papel === 'reembolso' ? `NFS-e de reembolso ${numero}` : `NF-e ${numero} de peças da fábrica`;
  await registrarEvento(garantiaId, {
    tipo: p.acao === 'vincular' ? 'nota_vinculada' : p.acao === 'descartar' ? 'nota_descartada' : 'nota_desfeita',
    ator: p.ator,
    detalhe: p.acao === 'vincular' ? `${rotulo} vinculada à garantia`
      : p.acao === 'descartar' ? `${rotulo} marcada como "não é esta"`
      : `Desfeita a decisão sobre a ${rotulo}`,
  });
  return { ok: true };
}

// Checklist da peça: a fábrica repõe ou paga na NFS-e (null = volta para a sugestão).
export async function definirFormaPeca(garantiaId: string, pecaId: string, forma: Forma | null, ator: string) {
  const { data: peca, error } = await supabase
    .from(TBL_GAR_PECAS)
    .update({ forma_reembolso: forma })
    .eq('id', pecaId)
    .eq('garantia_id', garantiaId)
    .select('cod_produto')
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || /forma_reembolso/.test(error.message)) {
      return { ok: false as const, erro: 'Falta aplicar a migration sql/garantias-notas.sql.', status: 503, migracaoFaltando: true };
    }
    return { ok: false as const, erro: error.message, status: 500 };
  }
  if (!peca) return { ok: false as const, erro: 'Peça não encontrada nesta garantia.', status: 404 };
  await registrarEvento(garantiaId, {
    tipo: 'peca_forma',
    ator,
    detalhe: `Peça ${peca.cod_produto || ''}: ${forma === 'reposta' ? 'reposta pela fábrica' : forma === 'paga' ? 'paga na NFS-e' : 'volta para a sugestão'}`,
  });
  return { ok: true as const };
}

// ── Peças aprovadas × reposição da fábrica ───────────────────────────────────

export interface NotaChegada {
  numero: string;
  data: string;
  /** linha de garantia_notas (nota vinculada) — null = nota x.949 achada no sistema sem vínculo */
  notaId: string | null;
}

export interface PecaAprovada {
  id: string;
  cod_produto: string | null;
  descricao: string | null;
  quantidade: number;
  /** nota em que a peça chegou (escolhida pelo usuário ou achada pelo código) */
  chegou: (NotaChegada & { como: 'escolhida' | 'codigo' }) | null;
  /** outras notas em que o código também aparece (peça que veio dividida) */
  tambem: NotaChegada[];
  /** o portal não conseguiu ler alguma nota vinculada (foto) e não achou a peça: pergunta */
  perguntar: boolean;
  /** sugestão do checklist: já chegou em nota x.949 ou a garantia tem R$ 0 de peças = reposta */
  sugestao: Forma;
  /** o que foi marcado no checklist (null = vale a sugestão) */
  forma: Forma | null;
}

export interface PecasDaGarantia {
  garantiaId: string;
  pecas: PecaAprovada[];
  /** notas de peças vinculadas a esta garantia (opções do "em qual nota chegou?") */
  notas: (NotaChegada & { notaId: string; legivel: boolean })[];
}

type LinhaPeca = {
  id: string; cod_produto: string | null; descricao: string | null; quantidade: number; resultado: string;
  forma_reembolso?: string | null; nota_chegada_id?: string | null;
};

// Peças APROVADAS das garantias aprovadas (ou de uma só) e a nota em que cada uma
// chegou. Ordem: nota escolhida pelo usuário > código achado nas notas x.949 do
// sistema ou no arquivo das notas anexadas à mão. Não achou e há nota que o portal
// não consegue ler (foto) → pergunta ao usuário. Uma leitura das notas por montadora.
export async function pecasAprovadasDasGarantias(garantiaId?: string): Promise<PecasDaGarantia[]> {
  const ler = (extra: string) => {
    let q = supabase
      .from(TBL_GARANTIAS)
      .select(('id, created_at, valor_pago_pecas, montadora:garantia_montadoras(nome), pecas:garantia_pecas(id, cod_produto, descricao, quantidade, resultado' + extra + ')') as string);
    q = garantiaId ? q.eq('id', garantiaId) : q.eq('status', 'aprovada');
    return q.limit(1000);
  };
  let { data: gs, error } = await ler(', forma_reembolso, nota_chegada_id');
  if (error && error.code === '42703') ({ data: gs, error } = await ler(', forma_reembolso'));
  if (error && error.code === '42703') ({ data: gs, error } = await ler(''));
  if (error) throw new Error(error.message);

  type LinhaG = { id: string; created_at: string; valor_pago_pecas: number | null; montadora: unknown; pecas: unknown };
  const lista = ((gs || []) as unknown as LinhaG[]).map((g) => ({
    id: g.id,
    criada: diasAntes(g.created_at, 3),
    pago: Number(g.valor_pago_pecas) || 0,
    montadora: chaveMontadora((g.montadora as unknown as { nome: string } | null)?.nome),
    pecas: ((g.pecas as unknown as LinhaPeca[]) || [])
      .filter((p) => p.resultado === 'aprovada' && !/^(MDI|REQ-)/i.test(String(p.cod_produto || ''))),
  })).filter((g) => g.pecas.length);

  const vinc = await lerVinculos(lista.map((g) => g.id));
  await garantirTextos(vinc.linhas.filter((v) => v.status === 'vinculada'));
  const notasPor = new Map<string, NotaEntrada949[]>();
  for (const chave of [...new Set(lista.map((g) => g.montadora).filter(Boolean))] as string[]) {
    const desde = lista.filter((g) => g.montadora === chave).reduce((m, g) => (g.criada < m ? g.criada : m), '9999');
    notasPor.set(chave, (await entradas949(chave, desde)).sort((a, b) => a.data.localeCompare(b.data)));
  }

  return lista.map((g) => {
    const minhas = vinc.linhas.filter((v) => v.garantia_id === g.id && v.papel === 'pecas');
    const descartadas = new Set(minhas.filter((v) => v.status === 'descartada').map((v) => v.entrada_id));
    const vinculadas = minhas.filter((v) => v.status === 'vinculada');
    const sistema = ((g.montadora && notasPor.get(g.montadora)) || []).filter((n) => !descartadas.has(n.entradaId));
    const opcoes = vinculadas.filter((v) => v.id).map((v) => ({
      notaId: v.id!,
      numero: v.numero || '',
      data: v.data_emissao || '',
      // nota do sistema tem os itens; a anexada à mão só se o arquivo tinha texto
      legivel: !!v.entrada_id || !!v.texto_arquivo,
    }));
    const ilegiveis = opcoes.filter((o) => !o.legivel);

    return {
      garantiaId: g.id,
      notas: opcoes,
      pecas: g.pecas.map((p) => {
        const cod = normCodigo(p.cod_produto);
        const achadas: NotaChegada[] = [];
        const juntar = (n: NotaChegada) => { if (!achadas.some((a) => a.numero === n.numero)) achadas.push(n); };
        for (const n of sistema) {
          if (n.data >= g.criada && casarPecas([p], n.itens).length > 0) {
            juntar({ numero: n.numero, data: n.data, notaId: vinculadas.find((v) => v.entrada_id === n.entradaId)?.id || null });
          }
        }
        if (cod.length >= 5) {
          for (const v of vinculadas) {
            if (v.texto_arquivo && v.texto_arquivo.includes(cod)) juntar({ numero: v.numero || '', data: v.data_emissao || '', notaId: v.id || null });
          }
        }
        const escolhida = p.nota_chegada_id ? opcoes.find((o) => o.notaId === p.nota_chegada_id) : undefined;
        const principal = escolhida
          ? { numero: escolhida.numero, data: escolhida.data, notaId: escolhida.notaId, como: 'escolhida' as const }
          : achadas[0] ? { ...achadas[0], como: 'codigo' as const } : null;
        const forma = p.forma_reembolso === 'reposta' || p.forma_reembolso === 'paga' ? p.forma_reembolso : null;
        return {
          id: p.id,
          cod_produto: p.cod_produto,
          descricao: p.descricao,
          quantidade: Number(p.quantidade) || 1,
          chegou: principal,
          tambem: achadas.filter((a) => a.numero !== principal?.numero),
          // código curto ("140") não dá para procurar no texto sem confundir com outro número
          perguntar: !principal && (ilegiveis.length > 0 || (cod.length < 5 && opcoes.length > 0)),
          sugestao: (principal || g.pago <= 0 ? 'reposta' : 'paga') as Forma,
          forma,
        };
      }),
    };
  });
}

// "Em qual nota esta peça chegou?" — escolha do usuário (null = volta para a leitura automática).
export async function definirNotaPeca(garantiaId: string, pecaId: string, notaId: string | null, ator: string) {
  let numero = '';
  if (notaId) {
    const { data: n } = await supabase.from(TBL_NOTAS).select('numero')
      .eq('id', notaId).eq('garantia_id', garantiaId).eq('papel', 'pecas').eq('status', 'vinculada').maybeSingle();
    if (!n) return { ok: false as const, erro: 'Nota não encontrada nesta garantia.', status: 404 };
    numero = n.numero || '';
  }
  const { data: peca, error } = await supabase
    .from(TBL_GAR_PECAS)
    .update({ nota_chegada_id: notaId })
    .eq('id', pecaId)
    .eq('garantia_id', garantiaId)
    .select('cod_produto')
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || /nota_chegada_id/.test(error.message)) {
      return { ok: false as const, erro: 'Falta aplicar a migration sql/garantias-notas-pecas.sql.', status: 503, migracaoFaltando: true };
    }
    return { ok: false as const, erro: error.message, status: 500 };
  }
  if (!peca) return { ok: false as const, erro: 'Peça não encontrada nesta garantia.', status: 404 };
  await registrarEvento(garantiaId, {
    tipo: 'peca_forma',
    ator,
    detalhe: notaId
      ? `Peça ${peca.cod_produto || ''}: chegou na NF ${numero} (escolhido à mão)`
      : `Peça ${peca.cod_produto || ''}: nota de chegada volta para a leitura automática`,
  });
  return { ok: true as const };
}

// Garantia aprovada que não gera NFS-e de reembolso (sai de "falta NFS-e").
export async function dispensarReembolso(garantiaId: string, dispensado: boolean, ator: string) {
  const { data: g, error } = await supabase
    .from(TBL_GARANTIAS)
    .update({ reembolso_dispensado: dispensado })
    .eq('id', garantiaId)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || /reembolso_dispensado/.test(error.message)) {
      return { ok: false as const, erro: 'Falta aplicar a migration sql/garantias-notas-pecas.sql.', status: 503, migracaoFaltando: true };
    }
    return { ok: false as const, erro: error.message, status: 500 };
  }
  if (!g) return { ok: false as const, erro: 'Garantia não encontrada.', status: 404 };
  await registrarEvento(garantiaId, {
    tipo: dispensado ? 'nota_descartada' : 'nota_desfeita',
    ator,
    detalhe: dispensado ? 'Marcada como "não precisa de NFS-e de reembolso"' : 'Voltou a precisar de NFS-e de reembolso',
  });
  return { ok: true as const };
}

// ── Garantias aprovadas sem NFS-e de reembolso ───────────────────────────────

export interface PendenteReembolso {
  id: string;
  numero: string;
  numero_externo: string | null;
  cliente: string | null;
  finalizada_em: string | null;
  valor_pago_horas: number;
  valor_pago_km: number;
  valor_pago_pecas: number;
  valor_pago_total: number;
}

export function precisaNfseReembolso(g: { valor_pago_horas: unknown; valor_pago_km: unknown; reembolso_dispensado?: boolean | null }): boolean {
  return !g.reembolso_dispensado && (Number(g.valor_pago_horas) || 0) + (Number(g.valor_pago_km) || 0) > 0.004;
}

// Garantias APROVADAS da montadora que nenhuma NFS-e de reembolso cobre ainda —
// é a lista de onde sai a OS de reembolso gerada pelo portal.
export async function pendentesDeReembolso(montadoraId: string): Promise<{
  montadora: string | null;
  pendentes: PendenteReembolso[];
  faturadas: NotaReembolso[];
}> {
  const { data: m } = await supabase.from('garantia_montadoras').select('nome').eq('id', montadoraId).maybeSingle();
  const montadora = m?.nome || null;
  const ler = (extra: string) => supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, cliente, finalizada_em, created_at, valor_pago_horas, valor_pago_km, valor_pago_pecas, valor_pago_total' + extra)
    .eq('montadora_id', montadoraId)
    .eq('status', 'aprovada')
    .order('finalizada_em', { ascending: false })
    .limit(500);
  let { data: gs, error } = await ler(', reembolso_dispensado');
  if (error && error.code === '42703') ({ data: gs, error } = await ler(''));
  const lista = ((gs || []) as unknown) as (Omit<PendenteReembolso, 'id'> & { id: string; created_at: string; reembolso_dispensado?: boolean })[];
  const maisAntiga = lista.reduce((min, g) => (g.created_at < min ? g.created_at : min), new Date().toISOString());
  const faturadas = montadora ? await notasReembolsoDaMontadora(montadora, diasAntes(maisAntiga, 3)) : [];
  const vinc = await lerVinculos(lista.map((g) => g.id));

  const pendentes = lista
    // NFS-e de reembolso = mão de obra/deslocamento; sem hora nem km cobrados não tem
    // NFS-e (decisão do José). "Não precisa de NFS-e" na janela tira os outros casos.
    .filter((g) => precisaNfseReembolso(g))
    .filter((g) => {
      const minhas = vinc.linhas.filter((v) => v.garantia_id === g.id && v.papel === 'reembolso');
      if (minhas.some((v) => v.status === 'vinculada')) return false;
      const descartadas = new Set(minhas.filter((v) => v.status === 'descartada').map((v) => v.doc_id));
      const sg = normSG(g.numero_externo);
      const pago = Number(g.valor_pago_total);
      return !faturadas.some((n) => !descartadas.has(n.docId) && ((sg && n.sgs.includes(sg)) || (!n.sgs.length && Math.abs(n.valor - pago) < 0.05)));
    })
    .map((g) => ({
      id: g.id,
      numero: g.numero,
      numero_externo: g.numero_externo,
      cliente: g.cliente,
      finalizada_em: g.finalizada_em,
      valor_pago_horas: Number(g.valor_pago_horas) || 0,
      valor_pago_km: Number(g.valor_pago_km) || 0,
      valor_pago_pecas: Number(g.valor_pago_pecas) || 0,
      valor_pago_total: Number(g.valor_pago_total) || 0,
    }));
  return { montadora, pendentes, faturadas: faturadas.slice(0, 30) };
}
