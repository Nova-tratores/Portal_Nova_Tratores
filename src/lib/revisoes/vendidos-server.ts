// Tratores vendidos recentemente — leitura do banco (SÓ NO SERVIDOR, service role).
// Junta, por trator vendido: a nota (vendas_itens + notas_fiscais_docs), o pedido
// (vendedor, cancelado/devolvido), o cliente (cadastro do Omie), onde ele fica
// (GPS do vendedor na visita, fazendas confirmadas pelo carro do técnico, CRM) e
// o controle de revisões (`tratores`). Regras puras em ./vendidos.ts.

import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { pontosDaTabela, preverRevisao, ROTULO_SITUACAO, type TratorBruto } from '@/lib/feedbacks/previsao-revisao';
import {
  chassiDaNota, dataISO, diasEntre, faseDaVenda, finalDoChassi, linkMapa, marcoDaSemana, marcosDaVenda, modeloDaNota, motorDaNota,
  umaPorChassi, whatsDe, type Fase, type Marco, type MarcoDias,
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

    return {
      chave: `${v.empresa}|${v.pedido}|${v.chassi || ''}`,
      empresa: v.empresa,
      pedido: v.pedido,
      dataVenda: v.dataISO,
      dias: diasEntre(v.dataISO, hoje),
      fase: faseDaVenda(v.dataISO, hoje),
      marcos: marcosDaVenda(v.dataISO, hoje),
      marcoSemana: marcoDaSemana(v.dataISO, hoje),
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
