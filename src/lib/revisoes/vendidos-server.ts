// Tratores vendidos recentemente — leitura do banco (SÓ NO SERVIDOR, service role).
// Junta, por trator vendido: a nota (vendas_itens + notas_fiscais_docs), o pedido
// (vendedor, cancelado/devolvido), o cliente (cadastro do Omie), onde ele fica
// (GPS do vendedor na visita, fazendas confirmadas pelo carro do técnico, CRM) e
// o controle de revisões (`tratores`) e a OS da revisão de 50 h no POS (Radar de tratores:
// sai do radar quando tem orçamento/OS da 50 h; feita, prevê a 300 h). Regras puras em
// ./vendidos.ts e ./contatos-radar.ts.

import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { pontosDaTabela, preverRevisao, ROTULO_SITUACAO, type TratorBruto } from '@/lib/feedbacks/previsao-revisao';
import { extrairChassis, extrairHorasRevisaoOS } from '@/lib/pos/extrairTrator';
import { normalizarHorasRevisao, osFaturada } from '@/lib/pos/vigia-revisoes-regras';
import { escolherRevisao50, previsao300, type OSRevisao, type Revisao50 } from './contatos-radar';
import { certificadosPorChassi, type CertificadoResumo } from '@/lib/mahindra/portal-dealer-server';
import {
  chassiDaNota, chegadaDoTrator, dataISO, diasEntre, faixaEstoque, faseDaVenda, finalDoChassi, linkMapa, marcoDaSemana, marcosDaVenda,
  modeloDaNota, motorDaNota, umaPorChassi, whatsDe, type EntradaTrator, type Fase, type Marco, type MarcoDias,
} from './vendidos';

export interface LocalCliente {
  nome: string;
  lat: number;
  lng: number;
  /** visita = vendedor confirmou o trator lá; gps = parada do carro do técnico confirmada na OS; crm/cadastro = ponto anotado */
  origem: 'visita' | 'gps' | 'crm' | 'cadastro';
  quando: string | null;
  quem: string | null;
}

export interface TratorVendido {
  chave: string;
  empresa: 'NOVA' | 'CASTRO';
  pedido: string;
  dataVenda: string;
  dias: number;
  fase: Fase;
  marcos: Marco[];
  marcoSemana: MarcoDias | null;
  valor: number;
  familia: string;
  descricao: string;
  modelo: string;
  chassi: string | null;
  motor: string | null;
  vendedor: string | null;
  nota: { numero: string; emissao: string | null; chave: string | null } | null;
  cliente: {
    cod: number; nome: string; fantasia: string | null; doc: string | null; telefone: string | null; whats: string | null;
    email: string | null; endereco: string | null; bairro: string | null; cidade: string | null; cep: string | null; ie: string | null;
    pasta: string;
  } | null;
  locais: LocalCliente[];
  /** Google Maps: o ponto mais confiável, ou a busca pelo endereço */
  mapa: string | null;
  controle: {
    id: string; entrega: string | null; cliente: string | null; cidade: string | null;
    revisoes: { horas: number; data: string }[];
    inspecao: string | null;
    previsao: { revisao: number; data: string | null; situacao: string; explicacao: string } | null;
  } | null;
  /** chegada da fábrica (nota de entrada de compra) e quantos dias ficou no pátio até a venda */
  chegada: { data: string; nf: string; fornecedor: string | null; diasEstoque: number } | null;
  /** revisão de 50 h: OS do POS (orçamento/aberta/feita) ou "50h Data" do controle */
  revisao50: Revisao50 | null;
  /** feita a 50 h: quando vem a 300 h, pelo ritmo de uso (dias até a 50 h × 6) */
  previsao300: { diasAte50: number; horasDia: number; data300: string; diasFaltam: number } | null;
  /** certificado de garantia do portal da Mahindra (entrega técnica, motor, bomba, financiamento…) */
  certificado: CertificadoResumo | null;
  /** de onde se conta a entrega (30/60/90 dias, 300 h): entrega técnica da Mahindra; sem ela, a nota */
  entrega: { data: string; origem: 'mahindra' | 'nota'; dias: number };
}

/** OS de revisão do POS desde a data (Ordem_Servico), com chassi e horas já extraídos. */
export async function osDeRevisao(desde: string): Promise<OSRevisao[]> {
  const { data, error } = await db.from('Ordem_Servico')
    .select('Id_Ordem, Status, Tipo_Servico, Revisao, Serv_Solicitado, Projeto, Data, Data_Fim_Servico, Ordem_Omie, id_omie')
    .ilike('Tipo_Servico', '%revis%').gte('Data', desde).limit(5000);
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map((o) => ({
    id: String(o.Id_Ordem || ''),
    status: String(o.Status || ''),
    horas: normalizarHorasRevisao(extrairHorasRevisaoOS(o as { Revisao?: string | null; Serv_Solicitado?: string | null; Tipo_Servico?: string | null })),
    chassiFinal: finalDoChassi(extrairChassis(o as { Projeto?: string | null; Serv_Solicitado?: string | null }) || ''),
    data: dataISO(o.Data),
    dataFim: dataISO(o.Data_Fim_Servico),
    faturada: osFaturada(o.Ordem_Omie, o.id_omie),
  })).filter((o) => o.id && o.chassiFinal);
}

/** Trator novo parado no pátio (estoque > 0 no cadastro do Omie). */
export interface TratorPatio {
  chassi: string;
  modelo: string;
  descricao: string;
  empresa: 'NOVA' | 'CASTRO';
  custo: number | null;
  ambiente: string | null;
  chegada: { data: string; nf: string; fornecedor: string | null } | null;
  /** dias desde a chegada (ou desde a inclusão no cadastro, sem nota) */
  dias: number | null;
  faixa: 'novo' | 'atencao' | 'parado';
  /** foi e voltou (demonstração, devolução) depois de chegar */
  idasEVoltas: number;
}

type ProdutoTrator = {
  codigo_produto: number; codigo: string; descricao: string; conta_omie: string; estoque: number | null; cmc: number | null;
  ambiente: string | null; data_inclusao: string | null; modelo: string | null; inativo: boolean | null;
};

/** Cadastro de tratores (Omie): um produto por chassi. */
async function produtosTrator(): Promise<ProdutoTrator[]> {
  const { data, error } = await db.from('produtos')
    .select('codigo_produto, codigo, descricao, conta_omie, estoque, cmc, ambiente, data_inclusao, modelo, inativo')
    .ilike('familia_nome', 'Trator%').limit(5000);
  if (error) throw error;
  return (data || []) as ProdutoTrator[];
}

/**
 * Notas de entrada de cada produto (id Omie → entradas). Liga `compras_itens` (item da nota)
 * com `notas_entrada` (emitente e categoria) pelo nº da nota + empresa (+ data, quando há duas).
 */
async function entradasDosProdutos(ids: number[]): Promise<Map<string, EntradaTrator[]>> {
  const itens = await emLotes(ids.map(String), async (l) => {
    const { data } = await db.from('compras_itens').select('codigo_produto, data_nota, numero_nf, conta_omie').in('codigo_produto', l as string[]);
    return (data || []) as { codigo_produto: string; data_nota: string | null; numero_nf: string; conta_omie: string }[];
  });
  const notas = await emLotes(itens.map((i) => i.numero_nf), async (l) => {
    const { data } = await db.from('notas_entrada').select('numero_nf, conta_omie, nome_emitente, categoria, data_emissao, cancelada').in('numero_nf', l as string[]);
    return (data || []) as { numero_nf: string; conta_omie: string; nome_emitente: string | null; categoria: string | null; data_emissao: string | null; cancelada: unknown }[];
  });
  const out = new Map<string, EntradaTrator[]>();
  for (const it of itens) {
    const data = dataISO(it.data_nota);
    if (!data) continue;
    const candidatas = notas.filter((n) => n.numero_nf === it.numero_nf && String(n.conta_omie).toUpperCase() === String(it.conta_omie).toUpperCase());
    const nota = candidatas.find((n) => dataISO(n.data_emissao) === data) || (candidatas.length === 1 ? candidatas[0] : null);
    if (nota && /^(S|true)/i.test(String(nota.cancelada ?? ''))) continue;
    const lista = out.get(String(it.codigo_produto)) || [];
    lista.push({ data, nf: String(Number(it.numero_nf) || it.numero_nf), emitente: nota?.nome_emitente ?? null, categoria: nota?.categoria ?? null });
    out.set(String(it.codigo_produto), lista);
  }
  return out;
}

/** "MAHINDRA DO BRASIL INDUSTRIAL LTDA" → "Mahindra". */
function nomeFornecedor(e: string | null): string | null {
  if (!e) return null;
  const s = e.replace(/\b(LTDA|S\.?A|EIRELI|ME|DO|BRASIL|INDUSTRIAL|COMERCIO|INDUSTRIA|DE|E)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim();
  return s.split(' ').slice(0, 2).join(' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) || null;
}

/** Tratores novos parados no pátio, do mais antigo para o mais novo. */
export async function tratoresNoPatio(): Promise<TratorPatio[]> {
  const hoje = hojeBrasilia();
  const prods = (await produtosTrator()).filter((p) => (Number(p.estoque) || 0) > 0 && !p.inativo);
  if (!prods.length) return [];
  const ent = await entradasDosProdutos(prods.map((p) => p.codigo_produto));
  return prods.map((p): TratorPatio => {
    const lista = ent.get(String(p.codigo_produto)) || [];
    const ch = chegadaDoTrator(lista);
    const desde = ch?.data || dataISO(p.data_inclusao);
    const dias = desde ? diasEntre(desde, hoje) : null;
    return {
      chassi: p.codigo,
      modelo: ((m: string) => (/^\d/.test(m) ? `Mahindra ${m}` : m))(p.modelo || modeloDaNota(p.descricao)),
      descricao: p.descricao,
      empresa: String(p.conta_omie).toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA',
      custo: num(p.cmc),
      ambiente: txt(p.ambiente),
      chegada: ch ? { data: ch.data, nf: ch.nf, fornecedor: nomeFornecedor(ch.emitente) } : null,
      dias,
      faixa: faixaEstoque(dias ?? 0),
      idasEVoltas: ch ? lista.filter((e) => e.data > ch.data).length : 0,
    };
  }).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
}

/** Quantos tratores chegaram da fábrica desde a data (notas de compra). */
export async function chegadasDesde(desde: string): Promise<number> {
  const prods = await produtosTrator();
  const ent = await entradasDosProdutos(prods.map((p) => p.codigo_produto));
  let n = 0;
  for (const lista of ent.values()) { const ch = chegadaDoTrator(lista); if (ch && ch.data >= desde) n++; }
  return n;
}

const LOTE = 150;
async function emLotes<T>(chaves: (string | number)[], buscar: (lote: (string | number)[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  const unicos = [...new Set(chaves)];
  for (let i = 0; i < unicos.length; i += LOTE) out.push(...(await buscar(unicos.slice(i, i + LOTE))));
  return out;
}
const num = (v: unknown) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s || null; };
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

type Item = {
  ano: number; mes: number; data_faturamento: string | null; data_pedido: string | null; familia: string; descricao: string;
  conta_omie: string; codigo_cliente: string | null; numero_pedido: string | null; valor_total: number | null;
};

// Guardado na memória do servidor (José, 28/10/2026: "isso já deve ficar tudo carregado, e não ficar
// carregando sempre"): devolve na hora o último resultado e, passados 2 min, recalcula por trás.
// Mudou algo que aparece na lista (certificado da Mahindra, colocar no controle) → limparCacheVendidos().
const FRESCO_MS = 2 * 60_000;
const cacheVendidos = globalThis as unknown as { __vendidos?: Map<string, { em: number; lista: Promise<TratorVendido[]>; pronto: boolean }> };
export function limparCacheVendidos() { cacheVendidos.__vendidos?.clear(); }
export function tratoresVendidosRapido(desde: string, seminovos = false): Promise<TratorVendido[]> {
  const mapa = (cacheVendidos.__vendidos ??= new Map());
  const chave = `${desde}|${seminovos ? 1 : 0}`;
  const atual = mapa.get(chave);
  const calcular = () => {
    const nova = { em: Date.now(), lista: tratoresVendidos(desde, seminovos), pronto: false };
    nova.lista.then(() => { nova.pronto = true; mapa.set(chave, nova); }, () => { if (mapa.get(chave) === nova) mapa.delete(chave); });
    return nova;
  };
  if (!atual) { const n = calcular(); mapa.set(chave, n); return n.lista; }
  if (Date.now() - atual.em > FRESCO_MS && atual.pronto) { atual.em = Date.now(); calcular(); }
  return atual.lista;
}

/** Tratores vendidos desde `desde` (ISO). `seminovos` inclui "Trator Seminovo". */
export async function tratoresVendidos(desde: string, seminovos = false): Promise<TratorVendido[]> {
  const hoje = hojeBrasilia();
  const familias = seminovos ? ['Trator Novo', 'Trator Seminovo'] : ['Trator Novo'];
  const { data: itens, error } = await db.from('vendas_itens')
    .select('ano, mes, data_faturamento, data_pedido, familia, descricao, conta_omie, codigo_cliente, numero_pedido, valor_total')
    .in('familia', familias)
    .gte('ano', Number(desde.slice(0, 4)))
    .limit(5000);
  if (error) throw error;

  const brutos = ((itens || []) as Item[]).map((i) => {
    const d = dataISO(i.data_faturamento) || dataISO(i.data_pedido) || `${i.ano}-${String(i.mes).padStart(2, '0')}-01`;
    return {
      empresa: (String(i.conta_omie).toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA') as 'NOVA' | 'CASTRO',
      pedido: String(i.numero_pedido || ''),
      dataISO: d,
      chassi: chassiDaNota(i.descricao),
      item: i,
      cancelada: false,
    };
  }).filter((b) => b.dataISO >= desde && b.dataISO <= hoje);
  if (!brutos.length) return [];

  const pedidos = brutos.map((b) => b.pedido).filter(Boolean);
  const [notas, pedidosRel] = await Promise.all([
    emLotes(pedidos, async (l) => {
      const { data } = await db.from('notas_fiscais_docs')
        .select('conta_omie, numero, data_emissao, chave_nfe, cancelada, pedido_num, parte_doc')
        .eq('tipo', 'saida_produto').in('pedido_num', l as string[]);
      return (data || []) as { conta_omie: string; numero: string; data_emissao: string | null; chave_nfe: string | null; cancelada: boolean; pedido_num: string; parte_doc: string | null }[];
    }),
    emLotes(pedidos, async (l) => {
      const { data } = await db.from('pedidos_venda_relatorio')
        .select('empresa, numero_venda, vendedor, cancelada, devolvido').in('numero_venda', l as string[]);
      return (data || []) as { empresa: string; numero_venda: string; vendedor: string | null; cancelada: string | null; devolvido: string | null }[];
    }),
  ]);
  const chaveP = (empresa: string, pedido: string) => `${empresa.toUpperCase()}|${pedido}`;
  const notaDe = new Map<string, (typeof notas)[number]>();
  for (const n of notas) { const k = chaveP(n.conta_omie, n.pedido_num); if (!notaDe.has(k) || !n.cancelada) notaDe.set(k, n); }
  const pedidoDe = new Map(pedidosRel.map((p) => [chaveP(p.empresa, p.numero_venda), p]));

  for (const b of brutos) {
    const k = chaveP(b.empresa, b.pedido);
    const n = notaDe.get(k);
    const p = pedidoDe.get(k);
    b.cancelada = !!n?.cancelada || /^S/i.test(p?.cancelada || '') || /^S/i.test(p?.devolvido || '');
    if (n?.data_emissao) b.dataISO = n.data_emissao.slice(0, 10);
  }
  const vendas = umaPorChassi(brutos);

  // cliente + onde fica + controle de revisões
  const cods = vendas.map((v) => num(v.item.codigo_cliente)).filter((c): c is number => c != null);
  const finais = vendas.map((v) => (v.chassi ? finalDoChassi(v.chassi) : '')).filter(Boolean);
  const chassis = vendas.map((v) => v.chassi).filter((c): c is string => !!c);
  const prodsPromessa = produtosTrator().catch(() => [] as ProdutoTrator[]);
  const osPromessa = osDeRevisao(desde).catch(() => [] as OSRevisao[]);
  const certPromessa = certificadosPorChassi().catch(() => new Map<string, CertificadoResumo>());
  const [cadastros, principais, tratores, visitas] = await Promise.all([
    emLotes(cods, async (l) => {
      const { data } = await db.from('portal_nt_clientes_cadastro_omie')
        .select('cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, telefone, email, endereco, bairro, cidade, cep, inscricao_estadual, lat, lng')
        .in('cod_cli', l as number[]);
      return (data || []) as Record<string, unknown>[];
    }),
    emLotes(cods, async (l) => {
      const { data } = await db.from('portal_nt_clientes_PRINCIPAL')
        .select('id_omie, lat, lng, latitude, longitude, telefone, email').in('id_omie', l as number[]);
      return (data || []) as Record<string, unknown>[];
    }),
    // tratores: a tabela é pequena (centenas) — casa pelo final do chassi em memória
    finais.length ? db.from('tratores').select('*').limit(5000).then((r) => (r.data || []) as TratorBruto[]) : Promise.resolve([] as TratorBruto[]),
    // confirmações do vendedor (tabela pequena): casa pelo final do chassi, que às vezes é
    // gravado com um zero a menos (MDI07510CS005275 × MDI07510CS0005275)
    chassis.length
      ? db.from('trator_localizacao').select('chassis, resposta, lat, lng, vendedor_nome, confirmado_em').limit(5000)
        .then((r) => (r.error ? [] : (r.data || [])) as { chassis: string; resposta: string; lat: number | null; lng: number | null; vendedor_nome: string | null; confirmado_em: string | null }[])
      : Promise.resolve([]),
  ]);
  const docs = cadastros.map((c) => soDigitos(c.cnpj_cpf)).filter((d) => d.length >= 11);
  const fazendas = await emLotes(docs, async (l) => {
    const { data, error: e } = await db.from('clientes_localizacoes')
      .select('documento, nome, lat, lng, tecnico, confirmado_por, confirmado_em').in('documento', l as string[]);
    return e ? [] : (data || []) as { documento: string; nome: string; lat: number; lng: number; tecnico: string | null; confirmado_por: string | null; confirmado_em: string | null }[];
  });

  // chegada da fábrica: produto do mesmo chassi → notas de entrada
  const prods = await prodsPromessa;
  const prodDoChassi = new Map<string, ProdutoTrator>();
  for (const pr of prods) { const k = finalDoChassi(pr.codigo, 8); if (k && !prodDoChassi.has(k)) prodDoChassi.set(k, pr); }
  const produtoDe = (chassi: string | null) => (chassi ? prodDoChassi.get(finalDoChassi(chassi, 8)) : undefined);
  const idsVendidos = vendas.map((v) => produtoDe(v.chassi)?.codigo_produto).filter((x): x is number => x != null);
  const entradas = await entradasDosProdutos(idsVendidos).catch(() => new Map<string, EntradaTrator[]>());
  // casa pelo final 8 do chassi; se não bater, pelo final 6 quando só um certificado tem esse final
  // (a Mahindra às vezes digita errado o começo: MBNUZA2WFS2F00778 × nota MBNUZA2WFSZF00778)
  const certDoFinal = new Map<string, CertificadoResumo>();
  const certDoFinal6 = new Map<string, CertificadoResumo | null>();
  for (const c of (await certPromessa).values()) {
    certDoFinal.set(finalDoChassi(c.chassi, 8), c);
    const k6 = finalDoChassi(c.chassi, 6);
    certDoFinal6.set(k6, certDoFinal6.has(k6) ? null : c);
  }
  const certDe = (chassi: string | null) => (chassi ? certDoFinal.get(finalDoChassi(chassi, 8)) || certDoFinal6.get(finalDoChassi(chassi, 6)) || null : null);
  const osDoChassi = new Map<string, OSRevisao[]>();
  for (const o of await osPromessa) osDoChassi.set(o.chassiFinal, [...(osDoChassi.get(o.chassiFinal) || []), o]);

  const cadDe = (cod: number, empresa: 'NOVA' | 'CASTRO') => {
    const doCod = cadastros.filter((c) => Number(c.cod_cli) === cod);
    return doCod.find((c) => String(c.empresa).toUpperCase().startsWith(empresa === 'NOVA' ? 'NOVA' : 'CASTRO')) || doCod[0] || null;
  };
  const princDe = new Map(principais.map((p) => [Number(p.id_omie), p]));
  const tratorDe = new Map<string, TratorBruto>();
  for (const t of tratores) { const f = finalDoChassi(t.Chassis); if (f && !tratorDe.has(f)) tratorDe.set(f, t); }

  return vendas.map((v): TratorVendido => {
    const i = v.item;
    const k = chaveP(v.empresa, v.pedido);
    const n = notaDe.get(k);
    const p = pedidoDe.get(k);
    const cod = num(i.codigo_cliente);
    const c = cod != null ? cadDe(cod, v.empresa) : null;
    const pr = cod != null ? princDe.get(cod) : undefined;
    const doc = c ? soDigitos(c.cnpj_cpf) : soDigitos(n?.parte_doc);

    const locais: LocalCliente[] = [];
    for (const x of visitas.filter((x) => v.chassi && finalDoChassi(x.chassis, 5) === finalDoChassi(v.chassi, 5) && x.resposta === 'aqui' && x.lat != null && x.lng != null)) {
      locais.push({ nome: 'Onde o trator foi visto', lat: x.lat!, lng: x.lng!, origem: 'visita', quando: x.confirmado_em, quem: x.vendedor_nome });
    }
    for (const f of fazendas.filter((f) => doc && f.documento === doc)) {
      locais.push({ nome: f.nome, lat: f.lat, lng: f.lng, origem: 'gps', quando: f.confirmado_em, quem: f.tecnico || f.confirmado_por });
    }
    const latCrm = num(pr?.lat) ?? num(pr?.latitude), lngCrm = num(pr?.lng) ?? num(pr?.longitude);
    if (latCrm != null && lngCrm != null) locais.push({ nome: 'Ponto anotado no CRM', lat: latCrm, lng: lngCrm, origem: 'crm', quando: null, quem: null });
    const latCad = num(c?.lat), lngCad = num(c?.lng);
    if (!locais.length && latCad != null && lngCad != null) locais.push({ nome: 'Ponto do cadastro', lat: latCad, lng: lngCad, origem: 'cadastro', quando: null, quem: null });

    const enderecoTxt = c ? [txt(c.endereco), txt(c.bairro), txt(c.cidade)].filter(Boolean).join(', ') : '';
    const t = v.chassi ? tratorDe.get(finalDoChassi(v.chassi)) : undefined;
    let controle: TratorVendido['controle'] = null;
    if (t) {
      const { pontos, feitas } = pontosDaTabela(t);
      const revisoes = Object.keys(t)
        .map((col) => col.match(/^(\d+)h Data$/))
        .filter((m): m is RegExpMatchArray => !!m && !!txt(t[m[0]]))
        .map((m) => ({ horas: Number(m[1]), data: String(t[m[0]]) }))
        .sort((a, b) => a.horas - b.horas);
      const entrega = txt(t.Entrega);
      let previsao: NonNullable<TratorVendido['controle']>['previsao'] = null;
      try {
        const pv = preverRevisao({ entrega: entrega || v.dataISO, pontos, revisoesFeitas: feitas });
        previsao = { revisao: pv.revisaoOferta, data: pv.dataPrevista, situacao: ROTULO_SITUACAO[pv.situacao], explicacao: pv.explicacao };
      } catch { /* sem previsão */ }
      controle = {
        id: String(t.ID ?? ''), entrega, cliente: txt(t.Cliente), cidade: txt(t.Cidade), revisoes,
        inspecao: txt(t['Inspecao Data']), previsao,
      };
    }

    // a loja conta a entrega pela ENTREGA TÉCNICA do certificado da Mahindra (José, 27/10/2026)
    const cert = certDe(v.chassi);
    const base = cert?.dataEntrega && cert.dataEntrega >= v.dataISO.slice(0, 10) ? cert.dataEntrega : v.dataISO;
    return {
      chave: `${v.empresa}|${v.pedido}|${v.chassi || ''}`,
      empresa: v.empresa,
      pedido: v.pedido,
      dataVenda: v.dataISO,
      dias: diasEntre(v.dataISO, hoje),
      fase: faseDaVenda(base, hoje),
      marcos: marcosDaVenda(base, hoje),
      marcoSemana: marcoDaSemana(base, hoje),
      certificado: cert,
      entrega: { data: base, origem: cert && base === cert.dataEntrega ? 'mahindra' as const : 'nota' as const, dias: diasEntre(base, hoje) },
      valor: Number(i.valor_total) || 0,
      familia: i.familia,
      descricao: i.descricao,
      modelo: modeloDaNota(i.descricao),
      chassi: v.chassi,
      motor: motorDaNota(i.descricao),
      vendedor: txt(p?.vendedor),
      nota: n ? { numero: String(Number(n.numero) || n.numero), emissao: n.data_emissao, chave: n.chave_nfe } : null,
      cliente: c ? {
        cod: Number(c.cod_cli),
        nome: String(c.razao_social || c.nome_fantasia || ''),
        fantasia: txt(c.nome_fantasia) !== txt(c.razao_social) ? txt(c.nome_fantasia) : null,
        doc: txt(c.cnpj_cpf),
        telefone: txt(c.telefone) || txt(pr?.telefone),
        whats: whatsDe(c.telefone) || whatsDe(pr?.telefone),
        email: txt(c.email) || txt(pr?.email),
        endereco: txt(c.endereco), bairro: txt(c.bairro), cidade: txt(c.cidade), cep: txt(c.cep), ie: txt(c.inscricao_estadual),
        pasta: `/clientes?cod=${c.cod_cli}&doc=${encodeURIComponent(String(c.cnpj_cpf || ''))}&empresa=${v.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro Pecas'}&pv=${encodeURIComponent(v.pedido)}`,
      } : null,
      locais,
      mapa: locais.length ? linkMapa(locais[0]) : linkMapa({ endereco: enderecoTxt }),
      controle,
      chegada: (() => {
        const pr = produtoDe(v.chassi);
        const ch = pr ? chegadaDoTrator(entradas.get(String(pr.codigo_produto)) || [], v.dataISO) : null;
        return ch ? { data: ch.data, nf: ch.nf, fornecedor: nomeFornecedor(ch.emitente), diasEstoque: diasEntre(ch.data, v.dataISO) } : null;
      })(),
      ...(() => {
        const c50 = controle?.revisoes.find((r) => r.horas === 50);
        const rev = escolherRevisao50(v.chassi ? osDoChassi.get(finalDoChassi(v.chassi)) || [] : [], c50 ? dataISO(c50.data) : null);
        const entrega = base !== v.dataISO ? base : dataISO(controle?.entrega) || v.dataISO;
        return { revisao50: rev, previsao300: rev?.feita && rev.dataFeita ? previsao300(entrega, rev.dataFeita, hoje) : null };
      })(),
    };
  });
}

/**
 * Coloca (ou completa) o trator vendido no controle de revisões: cria a linha em
 * `tratores` com modelo, chassi, cliente, cidade, vendedor e a data da nota como
 * entrega; se já existe, só preenche o que estiver vazio (nunca sobrescreve).
 */
export async function colocarNoControle(t: TratorVendido): Promise<{ criado: boolean; id: string; preenchidos: string[] }> {
  if (!t.chassi) throw new Error('Nota sem chassi: não dá para colocar no controle.');
  const [a, m, d] = [t.dataVenda.slice(0, 4), t.dataVenda.slice(5, 7), t.dataVenda.slice(8, 10)];
  const novo: Record<string, string> = {
    Modelo: t.modelo.replace(/^Mahindra\s+/i, ''),
    Chassis: t.chassi,
    Cliente: t.cliente?.nome || '',
    Cidade: t.cliente?.cidade || '',
    Vendedor: t.vendedor || '',
    Entrega: `${d}/${m}/${a}`,
  };
  if (t.motor) novo.Numero_Motor = t.motor;
  if (t.controle?.id) {
    const { data: atual } = await db.from('tratores').select('*').eq('ID', t.controle.id).maybeSingle();
    const faltam = Object.fromEntries(Object.entries(novo).filter(([k, v]) => v && !String((atual as Record<string, unknown> | null)?.[k] ?? '').trim()));
    if (Object.keys(faltam).length) {
      const { error } = await db.from('tratores').update(faltam).eq('ID', t.controle.id);
      if (error) throw error;
    }
    return { criado: false, id: t.controle.id, preenchidos: Object.keys(faltam) };
  }
  const id = String(Date.now());
  const { error } = await db.from('tratores').insert([{ ID: id, ...novo }]);
  if (error) throw error;
  return { criado: true, id, preenchidos: Object.keys(novo) };
}
