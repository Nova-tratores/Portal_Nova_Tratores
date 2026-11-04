// Notas fiscais da garantia — banco (nada vai à Omie). Regras em notas.ts. Fontes:
//  - notas_fiscais_docs (saida_servico) = NFS-e emitidas; parte = montadora.
//  - os_servicos_itens = itens da OS no Omie (texto + Hora/Desloc/Peças com valor).
//  - notas_entrada = notas recebidas (itens com CFOP); x.949 = peça em garantia.
//  - garantia_notas = decisão humana (vinculada/descartada) — sql/garantias-notas.sql.
//  - garantia_pecas.forma_reembolso = checklist "reposta pela fábrica × paga na NFS-e".
// Sem a migration tudo continua lendo (só as sugestões); gravar responde migracaoFaltando.
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from './constants';
import { registrarEvento } from './server';
import {
  extrairSGs, extrairDRVG, normSG, somarComponentes, casarPecas, ehCfopGarantia,
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

export interface NotasGarantia {
  garantia: { id: string; numero: string; sg: string | null; montadora: string | null; status: string };
  reembolso: { sugeridas: NotaReembolso[]; outras: NotaReembolso[] };
  pecas: { sugeridas: NotaPecas[]; outras: NotaPecas[] };
  migracaoFaltando: boolean;
}

interface Vinculo {
  garantia_id: string;
  papel: 'reembolso' | 'pecas';
  doc_id: number | null;
  entrada_id: number | null;
  numero: string | null;
  data_emissao: string | null;
  status: 'vinculada' | 'descartada';
}

const TBL_NOTAS = 'garantia_notas';

function tabelaFalta(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /garantia_notas/.test(err.message || ''));
}

async function lerVinculos(garantiaIds: string[]): Promise<{ ok: boolean; linhas: Vinculo[] }> {
  if (!garantiaIds.length) return { ok: true, linhas: [] };
  const linhas: Vinculo[] = [];
  for (let i = 0; i < garantiaIds.length; i += 150) {
    const { data, error } = await supabase
      .from(TBL_NOTAS)
      .select('garantia_id, papel, doc_id, entrada_id, numero, data_emissao, status')
      .in('garantia_id', garantiaIds.slice(i, i + 150));
    if (error) {
      if (tabelaFalta(error)) return { ok: false, linhas: [] };
      throw new Error(error.message);
    }
    linhas.push(...((data || []) as Vinculo[]));
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
  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, status, created_at, valor_pago_total, montadora:garantia_montadoras(nome), pecas:garantia_pecas(cod_produto, descricao)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return null;
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

  return {
    garantia: { id: g.id, numero: g.numero, sg, montadora, status: g.status },
    reembolso: { sugeridas, outras },
    pecas: { sugeridas: sugPecas, outras: outrasPecas },
    migracaoFaltando: !vinc.ok,
  };
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

export interface PecaAprovada {
  id: string;
  cod_produto: string | null;
  descricao: string | null;
  quantidade: number;
  /** nota x.949 em que a peça já chegou (casada pelo código ou vinculada à mão) */
  chegou: { numero: string; data: string } | null;
  /** sugestão do checklist: já chegou em nota x.949 ou a garantia tem R$ 0 de peças = reposta */
  sugestao: Forma;
  /** o que foi marcado no checklist (null = vale a sugestão) */
  forma: Forma | null;
}

export interface PecasDaGarantia {
  garantiaId: string;
  pecas: PecaAprovada[];
}

type LinhaPeca = { id: string; cod_produto: string | null; descricao: string | null; quantidade: number; resultado: string; forma_reembolso?: string | null };

// Peças APROVADAS das garantias aprovadas (ou de uma só) e a nota de reposição
// (entrada x.949) em que cada uma já chegou. Uma leitura das notas por montadora.
export async function pecasAprovadasDasGarantias(garantiaId?: string): Promise<PecasDaGarantia[]> {
  const ler = (comForma: boolean) => {
    let q = supabase
      .from(TBL_GARANTIAS)
      .select(`id, created_at, valor_pago_pecas, montadora:garantia_montadoras(nome), pecas:garantia_pecas(id, cod_produto, descricao, quantidade, resultado${comForma ? ', forma_reembolso' : ''})`);
    q = garantiaId ? q.eq('id', garantiaId) : q.eq('status', 'aprovada');
    return q.limit(1000);
  };
  let { data: gs, error } = await ler(true);
  if (error && (error.code === '42703' || /forma_reembolso/.test(error.message))) ({ data: gs, error } = await ler(false));
  if (error) throw new Error(error.message);

  const lista = (gs || []).map((g) => ({
    id: g.id as string,
    criada: diasAntes(g.created_at, 3),
    pago: Number(g.valor_pago_pecas) || 0,
    montadora: chaveMontadora((g.montadora as unknown as { nome: string } | null)?.nome),
    pecas: ((g.pecas as unknown as LinhaPeca[]) || [])
      .filter((p) => p.resultado === 'aprovada' && !/^(MDI|REQ-)/i.test(String(p.cod_produto || ''))),
  })).filter((g) => g.pecas.length);

  const vinc = await lerVinculos(lista.map((g) => g.id));
  const notasPor = new Map<string, NotaEntrada949[]>();
  for (const chave of [...new Set(lista.map((g) => g.montadora).filter(Boolean))] as string[]) {
    const desde = lista.filter((g) => g.montadora === chave).reduce((m, g) => (g.criada < m ? g.criada : m), '9999');
    notasPor.set(chave, (await entradas949(chave, desde)).sort((a, b) => a.data.localeCompare(b.data)));
  }

  return lista.map((g) => {
    const minhas = vinc.linhas.filter((v) => v.garantia_id === g.id && v.papel === 'pecas');
    const descartadas = new Set(minhas.filter((v) => v.status === 'descartada').map((v) => v.entrada_id));
    const vinculada = minhas.find((v) => v.status === 'vinculada');
    const notas = ((g.montadora && notasPor.get(g.montadora)) || []).filter((n) => !descartadas.has(n.entradaId));
    return {
      garantiaId: g.id,
      pecas: g.pecas.map((p) => {
        const nota = notas.find((n) => n.data >= g.criada && casarPecas([p], n.itens).length > 0);
        const chegou = nota ? { numero: nota.numero, data: nota.data }
          : vinculada ? { numero: vinculada.numero || '', data: vinculada.data_emissao || '' }
          : null;
        const forma = p.forma_reembolso === 'reposta' || p.forma_reembolso === 'paga' ? p.forma_reembolso : null;
        return {
          id: p.id,
          cod_produto: p.cod_produto,
          descricao: p.descricao,
          quantidade: Number(p.quantidade) || 1,
          chegou,
          sugestao: (nota || g.pago <= 0 ? 'reposta' : 'paga') as Forma,
          forma,
        };
      }),
    };
  });
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

// Garantias APROVADAS da montadora que nenhuma NFS-e de reembolso cobre ainda —
// é a lista de onde sai a OS de reembolso gerada pelo portal.
export async function pendentesDeReembolso(montadoraId: string): Promise<{
  montadora: string | null;
  pendentes: PendenteReembolso[];
  faturadas: NotaReembolso[];
}> {
  const { data: m } = await supabase.from('garantia_montadoras').select('nome').eq('id', montadoraId).maybeSingle();
  const montadora = m?.nome || null;
  const { data: gs } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, cliente, finalizada_em, created_at, valor_pago_horas, valor_pago_km, valor_pago_pecas, valor_pago_total')
    .eq('montadora_id', montadoraId)
    .eq('status', 'aprovada')
    .order('finalizada_em', { ascending: false })
    .limit(500);
  const lista = gs || [];
  const maisAntiga = lista.reduce((min, g) => (g.created_at < min ? g.created_at : min), new Date().toISOString());
  const faturadas = montadora ? await notasReembolsoDaMontadora(montadora, diasAntes(maisAntiga, 3)) : [];
  const vinc = await lerVinculos(lista.map((g) => g.id));

  const pendentes = lista
    .filter((g) => Number(g.valor_pago_total) > 0)
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
