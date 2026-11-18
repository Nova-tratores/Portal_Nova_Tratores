// Módulo Remessas — servidor (18/11/2026). Regras em ./regras.ts, Omie em ./omie.ts.
//
// Fonte da lista = espelho `remessas` (sync estoque-sync-remessas, 2x/dia) + `remessas_controle`
// (prazo e decisões humanas) + `remessas_emissoes` (o que o portal criou). O que o portal emite
// entra no espelho na hora (gravarEspelho) — não espera o sync.
//
// Demonstração = Remessa de Produtos 5.912/6.912, fiscal copiado da última demonstração da empresa.
// Volta = nota de ENTRADA própria 1.913/2.913 com a chave da remessa referenciada (o jeito que a
// NOVA e a CASTRO já fazem). Renovar = volta + remessa nova, ligadas.
// Criar e emitir a NF-e são dois passos: o portal cria o documento na Omie, a pessoa confere o que
// a Omie calculou e só então "Emitir NF-e" (primeiras notas acompanhadas — decisão do plano).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import type { Conta } from '@/lib/ajustes/conta';
import * as omie from './omie';
import {
  tipoDaRemessa, situacaoDe, prazoDe, diasEntre, hojeISO, dataISO, dataBR, somarDias, cfopRetornoDemo, cfopDemo,
  itemRetorno, itemDemo, validarDemo, textoDemo, textoRetorno, codDemo, codRetorno, avisoDevido, limparTexto,
  CATEGORIA_RETORNO, CATEGORIA_DEMO, PRAZO_PADRAO_DIAS, SITUACOES, TIPOS,
  type LinhaRemessa, type ItemSimples,
} from './regras';

type Json = omie.Json;
type Low = 'nova' | 'castro';
export interface Quem { id: string; nome: string }

const up = (c: Low | string): Conta => (String(c).toLowerCase() === 'castro' ? 'CASTRO' : 'NOVA');
const agora = () => new Date().toISOString();
/** o cadastro da Omie guarda '&' como '&amp;' */
const desescapar = (s: unknown) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const sem0 = (s: unknown) => String(s ?? '').replace(/^0+(?=\d)/, '');

export const MSG_MIGRACAO = 'Falta aplicar sql/remessas-modulo.sql no banco.';
export function tabelaFaltando(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /remessas_(controle|eventos|emissoes)/.test(e.message || ''));
}
export class ErroRemessa extends Error {
  constructor(msg: string, public status = 400, public migracao = false) { super(msg); }
}

// ── leitura ─────────────────────────────────────────────────────────────────
async function todas<T>(tabela: string, cols: string, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(cols).order('id_remessa', { ascending: true }).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface Espelho {
  id_remessa: number; conta_omie: Low; numero_nfe: string | null; emissao: string | null; natureza: string | null; cfop: string | null;
  status: string | null; destinatario: string | null; destinatario_cnpj: string | null; total_nfe: number | null;
  itens: Array<{ cDescricao?: string; nCodProduto?: string | number; nQtde?: number; nValUnit?: number }> | string | null; atualizado_em: string | null;
}
interface Controle {
  conta_omie: Low; id_remessa: number; prazo_ate: string | null; situacao_manual: string | null; renovada_para: number | null;
  renovada_de: number | null; pedido_venda: string | null; responsavel_id: string | null; obs: string | null; aviso_nivel: number;
}

const itensDe = (e: Espelho) => {
  const v = e.itens;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};

async function lerControles(): Promise<{ mapa: Map<string, Controle>; migracaoFaltando: boolean }> {
  const { data, error } = await sb.from('remessas_controle').select('*').limit(20000);
  if (error) {
    if (tabelaFaltando(error)) return { mapa: new Map(), migracaoFaltando: true };
    throw error;
  }
  return { mapa: new Map(((data || []) as Controle[]).map((c) => [`${c.conta_omie}|${c.id_remessa}`, c])), migracaoFaltando: false };
}

function linha(e: Espelho, c: Controle | undefined, portal: Set<string>, hoje: string): LinhaRemessa {
  const tipo = tipoDaRemessa(e.cfop);
  const emissao = dataISO(e.emissao);
  const situacao = situacaoDe({ tipo, status: e.status, emissao, prazoAte: c?.prazo_ate, manual: c?.situacao_manual }, hoje);
  const prazo = tipo === 'demonstracao' ? prazoDe({ emissao, prazoAte: c?.prazo_ate }) : null;
  return {
    conta: e.conta_omie, idRemessa: Number(e.id_remessa), numero: sem0(e.numero_nfe), emissao, cfop: e.cfop || '', tipo,
    status: e.status || '', situacao, destinatario: e.destinatario || '', cnpj: e.destinatario_cnpj || '', total: Number(e.total_nfe) || 0,
    itens: itensDe(e).map((i: { cDescricao?: string }) => String(i.cDescricao || '')).filter(Boolean),
    prazoAte: prazo, diasPrazo: prazo && SITUACOES[situacao].aberta ? diasEntre(hoje, prazo) : null,
    obs: [c?.obs, e.natureza].filter(Boolean).join(' · '), origemPortal: portal.has(`${e.conta_omie}|${e.id_remessa}`),
    renovadaDe: c?.renovada_de ?? null, renovadaPara: c?.renovada_para ?? null,
  };
}

export async function lerLista() {
  const cols = 'id_remessa,conta_omie,numero_nfe,emissao,natureza,cfop,status,destinatario,destinatario_cnpj,total_nfe,itens,atualizado_em';
  const [esp, ctl, emis] = await Promise.all([
    todas<Espelho>('remessas', cols),
    lerControles(),
    sb.from('remessas_emissoes').select('conta_omie,n_cod,tipo').eq('tipo', 'demonstracao'),
  ]);
  const castro = new Set(esp.filter((e) => e.conta_omie === 'castro').map((e) => e.id_remessa));
  // cópias antigas da CASTRO gravadas como 'nova' pelo app legado (sql/remessas-modulo.sql apaga)
  const validas = esp.filter((e) => !(e.conta_omie === 'nova' && castro.has(e.id_remessa) && String(e.atualizado_em || '') < '2026-04-09'));
  const portal = new Set(((emis.data || []) as Array<{ conta_omie: string; n_cod: number }>).map((x) => `${x.conta_omie}|${x.n_cod}`));
  const hoje = hojeISO();
  const linhas = validas.map((e) => linha(e, ctl.mapa.get(`${e.conta_omie}|${e.id_remessa}`), portal, hoje))
    .sort((a, b) => (b.emissao || '').localeCompare(a.emissao || '') || b.idRemessa - a.idRemessa);
  return { linhas, hoje, migracaoFaltando: ctl.migracaoFaltando };
}

// ── ficha ───────────────────────────────────────────────────────────────────
export async function lerFicha(conta: Low, idRemessa: number) {
  const { data: e } = await sb.from('remessas').select('*').eq('conta_omie', conta).eq('id_remessa', idRemessa).maybeSingle();
  if (!e) throw new ErroRemessa('Remessa não encontrada.', 404);
  const ctl = await lerControles();
  const c = ctl.mapa.get(`${conta}|${idRemessa}`);
  const [ev, em] = await Promise.all([
    sb.from('remessas_eventos').select('*').eq('conta_omie', conta).eq('id_remessa', idRemessa).order('criado_em', { ascending: true }),
    sb.from('remessas_emissoes').select('*').eq('conta_omie', conta).or(`n_cod.eq.${idRemessa},id_remessa_ref.eq.${idRemessa}`).order('criado_em', { ascending: true }),
  ]);
  const portal = new Set(((em.data || []) as Array<{ tipo: string; n_cod: number }>).filter((x) => x.tipo === 'demonstracao').map((x) => `${conta}|${x.n_cod}`));
  const l = linha(e as Espelho, c, portal, hojeISO());

  // ao vivo na Omie: itens com impostos e a NF-e (não derruba a ficha se a Omie estiver fora)
  let omieDoc: Json | null = null; let nf: omie.StatusDoc['nf'] = null; let omieErro: string | null = null;
  try {
    omieDoc = await omie.consultar(up(conta), 'remessa', idRemessa);
    nf = (await omie.status(up(conta), 'remessa', idRemessa))?.nf || null;
  } catch (er) { omieErro = omie.erroOmie(er); }

  // a volta registrada fora do portal: nota de entrada x.913 com o mesmo produto depois da saída
  const prods = itensDe(e as Espelho).map((i: { nCodProduto?: string | number }) => String(i.nCodProduto || '')).filter(Boolean);
  let voltas: Array<{ numero: string; data: string; cfop: string; destinatario: string; total: number }> = [];
  if (l.tipo === 'demonstracao' && prods.length) {
    const { data: oe } = await sb.from('outras_entradas').select('numero_nfe,data_emissao,cfop,destinatario,total_nfe,produtos')
      .eq('conta_omie', conta).in('cfop', ['1.913', '2.913']).order('id_nota_entrada', { ascending: false }).limit(800);
    voltas = ((oe || []) as Array<{ numero_nfe: string; data_emissao: string; cfop: string; destinatario: string; total_nfe: number; produtos: Array<{ nCodProduto?: string }> | null }>)
      .filter((x) => (x.produtos || []).some((p) => prods.includes(String(p.nCodProduto))) && (dataISO(x.data_emissao) || '') >= (l.emissao || ''))
      .map((x) => ({ numero: sem0(x.numero_nfe), data: dataBR(x.data_emissao), cfop: x.cfop, destinatario: x.destinatario, total: Number(x.total_nfe) || 0 }))
      .reverse();
  }
  return {
    linha: l, controle: c || null, eventos: ev.data || [], emissoes: em.data || [], nf, omieErro, voltas,
    itens: ((omieDoc?.produtos || []) as Json[]).map((p) => ({
      nCodProd: Number(p.nCodProd), descricao: (itensDe(e as Espelho).find((i: { nCodProduto?: string | number }) => String(i.nCodProduto) === String(p.nCodProd)) as { cDescricao?: string } | undefined)?.cDescricao || null,
      qtd: Number(p.nQtde), valorUnit: Number(p.nValUnit), cfop: p.cCFOP, cst: p.ICMS?.cSitTrib || null, origem: p.ICMS?.cOrigem ?? null,
    })),
    dadosAdic: omieDoc?.infAdic?.cDadosAdic || null,
    migracaoFaltando: ctl.migracaoFaltando,
  };
}

// ── escrita no banco ─────────────────────────────────────────────────────────
async function evento(conta: Low, idRemessa: number, tipo: string, detalhe: string, quem: Quem | null, dados?: Json) {
  const { error } = await sb.from('remessas_eventos').insert({ conta_omie: conta, id_remessa: idRemessa, tipo, detalhe, dados: dados || null, user_id: quem?.id || null, user_nome: quem?.nome || null });
  if (error && !tabelaFaltando(error)) console.warn('[remessas] evento:', error.message);
}

async function salvarControle(conta: Low, idRemessa: number, campos: Partial<Controle>) {
  const { error } = await sb.from('remessas_controle').upsert({ conta_omie: conta, id_remessa: idRemessa, ...campos, atualizado_em: agora() }, { onConflict: 'conta_omie,id_remessa' });
  if (error) throw tabelaFaltando(error) ? new ErroRemessa(MSG_MIGRACAO, 503, true) : error;
}

/** põe/atualiza a remessa no espelho na hora (o sync de 2x/dia regrava depois, preservando Devolvida) */
async function gravarEspelho(conta: Low, idRemessa: number, campos: Json) {
  const { error } = await sb.from('remessas').upsert({ id_remessa: idRemessa, conta_omie: conta, ...campos, atualizado_em: agora() }, { onConflict: 'id_remessa,conta_omie' });
  if (error) console.warn('[remessas] espelho:', error.message);
}

// ── modelos (copiar o que a empresa já faz) ──────────────────────────────────
/** a última demonstração da empresa na Omie: cenário de impostos, categoria, frete e item-modelo */
async function modeloDemo(conta: Low): Promise<Json | null> {
  const { data } = await sb.from('remessas').select('id_remessa').eq('conta_omie', conta).in('cfop', ['5.912', '6.912'])
    .neq('status', 'Cancelada').order('id_remessa', { ascending: false }).limit(3);
  for (const r of data || []) {
    try { const d = await omie.consultar(up(conta), 'remessa', Number(r.id_remessa)); if (d?.produtos?.length) return d; } catch { /* tenta a próxima */ }
  }
  return null;
}
/** a última nota de entrada de retorno de demonstração (1.913/2.913) da empresa */
async function modeloRetorno(conta: Low): Promise<Json | null> {
  const { data } = await sb.from('outras_entradas').select('id_nota_entrada').eq('conta_omie', conta).in('cfop', ['1.913', '2.913'])
    .order('id_nota_entrada', { ascending: false }).limit(3);
  for (const r of data || []) {
    try { const d = await omie.consultar(up(conta), 'notaent', Number(r.id_nota_entrada)); if (d?.produtos?.length) return d; } catch { /* tenta a próxima */ }
  }
  return null;
}

// ── buscas da nova demonstração ──────────────────────────────────────────────
export async function buscarClientes(conta: Low, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  const dig = t.replace(/\D/g, '');
  let qy = sb.from('portal_nt_clientes_cadastro_omie').select('cod_cli,razao_social,nome_fantasia,cnpj_cpf,cidade,estado,inativo')
    .ilike('empresa', conta === 'castro' ? 'castro%' : 'nova%').limit(20);
  qy = dig.length >= 5 ? qy.ilike('cnpj_cpf', `%${dig.slice(0, 3)}%`) : qy.or(`razao_social.ilike.%${t}%,nome_fantasia.ilike.%${t}%`);
  const { data } = await qy;
  return ((data || []) as Json[])
    .filter((c) => c.inativo !== 'S' && (dig.length < 5 || String(c.cnpj_cpf || '').replace(/\D/g, '').includes(dig)))
    .map((c) => ({ codCli: Number(c.cod_cli), nome: desescapar(c.razao_social || c.nome_fantasia), doc: c.cnpj_cpf, cidade: c.cidade, uf: c.estado }));
}

export async function buscarProdutos(conta: Low, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  const { data } = await sb.from('produtos').select('codigo_produto,codigo,descricao,familia_nome,estoque,valor_unitario,inativo')
    .eq('conta_omie', conta).eq('inativo', false).or(`descricao.ilike.%${t}%,codigo.ilike.%${t}%`)
    .order('valor_unitario', { ascending: false }).limit(80);
  // demonstração é de máquina/implemento: máquina em estoque primeiro, peças no fim (continuam acháveis)
  const ehPeca = (f: unknown) => /^pe[cç]as?$/i.test(String(f || '').trim());
  const peso = (p: Json) => (ehPeca(p.familia_nome) ? 2 : 0) + (Number(p.estoque) > 0 ? 0 : 1); // máquina em estoque primeiro
  return ((data || []) as Json[]).sort((a, b) => peso(a) - peso(b)).slice(0, 25).map((p) => ({
    nCodProd: Number(p.codigo_produto), codigo: p.codigo, descricao: p.descricao, familia: p.familia_nome,
    estoque: Number(p.estoque) || 0, valor: Number(p.valor_unitario) || 0,
  }));
}

// ── emitir demonstração ──────────────────────────────────────────────────────
export interface DemoArgs {
  conta: Low; nCodCli: number; itens: ItemSimples[]; prazoAte: string; obs?: string | null;
  renovacaoDe?: number | null; quem: Quem;
}

export async function criarDemo(a: DemoArgs) {
  const erros = validarDemo({ nCodCli: a.nCodCli, itens: a.itens, prazoAte: a.prazoAte });
  if (erros.length) throw new ErroRemessa(erros.join(' '));
  const { data: cli } = await sb.from('portal_nt_clientes_cadastro_omie').select('razao_social,nome_fantasia,cnpj_cpf,estado').eq('cod_cli', a.nCodCli).limit(1);
  const cliente = (cli?.[0] || {}) as Json;
  const modelo = await modeloDemo(a.conta);
  const cfop = cfopDemo(cliente.estado);
  const itemModelo = (modelo?.produtos || [])[0] || null;
  const cod = codDemo(Date.now().toString(36).toUpperCase());
  const texto = textoDemo({ obs: a.obs, prazoAte: a.prazoAte });
  const total = Math.round(a.itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0) * 100) / 100;

  const { data: ficha, error: eIns } = await sb.from('remessas_emissoes').insert({
    conta_omie: a.conta, tipo: 'demonstracao', cod_int: cod, id_remessa_ref: a.renovacaoDe || null, renovacao: !!a.renovacaoDe,
    n_cod_cli: a.nCodCli, cliente: desescapar(cliente.razao_social || cliente.nome_fantasia) || null, itens: a.itens, valor_total: total,
    prazo_ate: a.prazoAte, texto, status: 'criando', user_id: a.quem.id, user_nome: a.quem.nome,
  }).select('id').single();
  if (eIns) throw tabelaFaltando(eIns) ? new ErroRemessa(MSG_MIGRACAO, 503, true) : eIns;

  const payload = {
    cabec: {
      nCodCli: a.nCodCli, dPrevisao: dataBR(hojeISO()),
      ...(modelo?.cabec?.codigo_cenario_impostos ? { codigo_cenario_impostos: Number(modelo.cabec.codigo_cenario_impostos) } : {}),
    },
    infAdic: { cCodCateg: modelo?.infAdic?.cCodCateg || CATEGORIA_DEMO, cDadosAdic: texto },
    frete: { cTpFrete: modelo?.frete?.cTpFrete || '9' },
    produtos: a.itens.map((it) => itemDemo(it, cfop, itemModelo)),
  };
  const r = await omie.incluir(up(a.conta), 'remessa', payload, cod);
  if (!r.id) {
    await sb.from('remessas_emissoes').update({ status: 'falhou', erro: r.erro, atualizado_em: agora() }).eq('id', ficha.id);
    throw new ErroRemessa(`A Omie não criou a remessa: ${r.erro}`, 502);
  }
  let numero = '';
  try { numero = sem0((await omie.consultar(up(a.conta), 'remessa', r.id))?.cabec?.cNumeroRemessa); } catch { /* segue */ }
  await sb.from('remessas_emissoes').update({ status: 'criada', n_cod: r.id, erro: null, atualizado_em: agora() }).eq('id', ficha.id);
  await gravarEspelho(a.conta, r.id, {
    numero_nfe: numero || null, emissao: dataBR(hojeISO()), natureza: texto, cfop, status: 'Aberta',
    destinatario: desescapar(cliente.razao_social || cliente.nome_fantasia) || null, destinatario_cnpj: cliente.cnpj_cpf || null, total_nfe: total,
    itens: a.itens.map((i) => ({ cDescricao: i.descricao || '', nCodProduto: String(i.nCodProd), nQtde: i.qtd, nValUnit: i.valorUnit, nValorTotal: i.qtd * i.valorUnit, cCFOP: cfop })),
    qtd_itens: a.itens.length,
  });
  await salvarControle(a.conta, r.id, { prazo_ate: a.prazoAte, responsavel_id: a.quem.id, renovada_de: a.renovacaoDe || null });
  await evento(a.conta, r.id, 'emitida', `Remessa de demonstração criada na Omie pelo portal (nº ${numero || '?'}), retorno até ${dataBR(a.prazoAte)}`, a.quem, { cod, cfop });
  return { emissaoId: ficha.id as string, idRemessa: r.id, numero };
}

// ── volta (nota de entrada 1.913/2.913) ─────────────────────────────────────
export async function criarRetorno(a: { conta: Low; idRemessa: number; obs?: string | null; quem: Quem; renovacao?: boolean }) {
  const C = up(a.conta);
  const rem = await omie.consultar(C, 'remessa', a.idRemessa);
  const cfopRem = String(rem?.produtos?.[0]?.cCFOP || '');
  if (tipoDaRemessa(cfopRem) !== 'demonstracao') throw new ErroRemessa('Só remessa de demonstração (5.912/6.912) volta por aqui.');
  const st = await omie.status(C, 'remessa', a.idRemessa);
  if (!st?.faturada || !st.nf?.chave) throw new ErroRemessa('A remessa ainda não tem NF-e emitida — não dá para fazer a volta.');
  const { data: ja } = await sb.from('remessas_emissoes').select('id,status,cod_int').eq('conta_omie', a.conta).eq('tipo', 'retorno').eq('id_remessa_ref', a.idRemessa);
  const vivas = (ja || []).filter((x) => x.status !== 'falhou' && x.status !== 'cancelada');
  if (vivas.length) throw new ErroRemessa('Esta remessa já tem uma nota de volta criada pelo portal. Abra a ficha e emita/confira por lá.');

  const modelo = await modeloRetorno(a.conta);
  const itemModelo = (modelo?.produtos || [])[0] || null;
  const cfop = cfopRetornoDemo(cfopRem);
  const cod = codRetorno(a.idRemessa, (ja || []).length + 1);
  const texto = textoRetorno({ nfRemessa: st.nf.numero, emissao: dataISO(st.nf.emissao), obs: a.obs });
  const prods = (rem.produtos || []) as Json[];
  const total = Math.round(prods.reduce((s, p) => s + Number(p.nQtde) * Number(p.nValUnit), 0) * 100) / 100;

  const { data: ficha, error: eIns } = await sb.from('remessas_emissoes').insert({
    conta_omie: a.conta, tipo: 'retorno', cod_int: cod, id_remessa_ref: a.idRemessa, renovacao: !!a.renovacao,
    n_cod_cli: Number(rem.cabec?.nCodCli) || null, itens: prods.map((p) => ({ nCodProd: Number(p.nCodProd), qtd: Number(p.nQtde), valorUnit: Number(p.nValUnit) })),
    valor_total: total, texto, status: 'criando', user_id: a.quem.id, user_nome: a.quem.nome,
  }).select('id').single();
  if (eIns) throw tabelaFaltando(eIns) ? new ErroRemessa(MSG_MIGRACAO, 503, true) : eIns;

  const payload = {
    cabec: { nCodCli: Number(rem.cabec?.nCodCli), dPrevisao: dataBR(hojeISO()), ...(Number(rem.cabec?.nCodVend) ? { nCodVend: Number(rem.cabec.nCodVend) } : {}) },
    infAdic: { cCodCateg: modelo?.infAdic?.cCodCateg || CATEGORIA_RETORNO, cDadosAdic: texto, nfRelacionada: { cChaveRef: st.nf.chave } },
    frete: { cTpFrete: rem.frete?.cTpFrete || '9' },
    produtos: prods.map((p) => itemRetorno(p, cfop, itemModelo)),
  };
  const r = await omie.incluir(C, 'notaent', payload, cod);
  if (!r.id) {
    await sb.from('remessas_emissoes').update({ status: 'falhou', erro: r.erro, atualizado_em: agora() }).eq('id', ficha.id);
    await evento(a.conta, a.idRemessa, 'erro', `A Omie não criou a nota de volta: ${r.erro}`, a.quem);
    throw new ErroRemessa(`A Omie não criou a nota de volta: ${r.erro}`, 502);
  }
  await sb.from('remessas_emissoes').update({ status: 'criada', n_cod: r.id, erro: null, atualizado_em: agora() }).eq('id', ficha.id);
  await evento(a.conta, a.idRemessa, 'retorno_criado', `Nota de entrada de volta (${cfop}) criada na Omie pelo portal`, a.quem, { cod, nCodNotaEnt: r.id });
  return { emissaoId: ficha.id as string, nCodNotaEnt: r.id };
}

/** confere e emite a NF-e de uma emissão já criada (demonstração ou volta). Serve para "tentar de novo". */
export async function emitirNF(emissaoId: string, quem: Quem) {
  const { data: f, error } = await sb.from('remessas_emissoes').select('*').eq('id', emissaoId).maybeSingle();
  if (error) throw tabelaFaltando(error) ? new ErroRemessa(MSG_MIGRACAO, 503, true) : error;
  if (!f) throw new ErroRemessa('Emissão não encontrada.', 404);
  if (f.status === 'faturada') return { ok: true, nf: f.nf_numero };
  const conta = f.conta_omie as Low;
  const doc: omie.Doc = f.tipo === 'retorno' ? 'notaent' : 'remessa';
  const id = Number(f.n_cod) || (await omie.idPorCodigo(up(conta), doc, f.cod_int));
  if (!id) throw new ErroRemessa('O documento não foi encontrado na Omie.');
  const idRem = f.tipo === 'retorno' ? Number(f.id_remessa_ref) : id;
  const res = await omie.faturar(up(conta), doc, id);
  if (!res.ok) {
    await sb.from('remessas_emissoes').update({ status: res.cancelada ? 'cancelada' : 'criada', n_cod: id, erro: res.erro, atualizado_em: agora() }).eq('id', emissaoId);
    await evento(conta, idRem, 'erro', res.erro || 'Falhou ao emitir a NF-e', quem);
    return { ok: false, erro: res.erro, podeTentarDeNovo: !res.cancelada };
  }
  const nf = res.nf;
  await sb.from('remessas_emissoes').update({ status: 'faturada', n_cod: id, nf_numero: nf?.numero || null, nf_chave: nf?.chave || null, erro: null, faturado_em: agora(), atualizado_em: agora() }).eq('id', emissaoId);
  if (f.tipo === 'demonstracao') {
    await gravarEspelho(conta, id, { status: 'Faturada', ...(nf?.chave ? { chave_nfe: nf.chave } : {}) });
    await evento(conta, id, 'faturada', `NF-e de demonstração emitida${nf ? ` — nº ${nf.numero}` : ''}`, quem, { nf });
    if (f.renovacao && f.id_remessa_ref) await evento(conta, Number(f.id_remessa_ref), 'renovada', `Renovada: nova remessa${nf ? ` NF ${nf.numero}` : ''}`, quem, { para: id });
  } else {
    // a volta fecha a remessa (a renovação já marcou 'renovada' antes)
    const { data: c } = await sb.from('remessas_controle').select('situacao_manual').eq('conta_omie', conta).eq('id_remessa', idRem).maybeSingle();
    if (!c || c.situacao_manual !== 'renovada') await salvarControle(conta, idRem, { situacao_manual: 'devolvida' });
    await evento(conta, idRem, 'devolvida', `Nota de entrada de volta emitida${nf ? ` — NF ${nf.numero}` : ''}`, quem, { nf });
  }
  return { ok: true, nf: nf?.numero || null };
}

// ── renovar = volta da original + remessa nova ───────────────────────────────
export async function renovar(a: { conta: Low; idRemessa: number; prazoAte?: string | null; obs?: string | null; quem: Quem }) {
  const C = up(a.conta);
  const rem = await omie.consultar(C, 'remessa', a.idRemessa);
  const { data: esp } = await sb.from('remessas').select('itens').eq('conta_omie', a.conta).eq('id_remessa', a.idRemessa).maybeSingle();
  const desc = new Map<string, string>(itensDe((esp || { itens: [] }) as Espelho).map((i: { nCodProduto?: string | number; cDescricao?: string }) => [String(i.nCodProduto), String(i.cDescricao || '')] as [string, string]));
  const prazo = a.prazoAte || somarDias(hojeISO(), PRAZO_PADRAO_DIAS);
  // valida antes de criar qualquer coisa
  const itens: ItemSimples[] = ((rem?.produtos || []) as Json[]).map((p) => ({
    nCodProd: Number(p.nCodProd), qtd: Number(p.nQtde), valorUnit: Number(p.nValUnit), descricao: desc.get(String(p.nCodProd)) || null,
    localEstoque: Number(p.codigo_local_estoque) || null,
  }));
  const erros = validarDemo({ nCodCli: Number(rem?.cabec?.nCodCli), itens, prazoAte: prazo });
  if (erros.length) throw new ErroRemessa(erros.join(' '));

  const volta = await criarRetorno({ conta: a.conta, idRemessa: a.idRemessa, obs: a.obs, quem: a.quem, renovacao: true });
  let nova: Awaited<ReturnType<typeof criarDemo>>;
  try {
    nova = await criarDemo({ conta: a.conta, nCodCli: Number(rem.cabec.nCodCli), itens, prazoAte: prazo, obs: a.obs, renovacaoDe: a.idRemessa, quem: a.quem });
  } catch (e) {
    await evento(a.conta, a.idRemessa, 'erro', `Renovação parou: a volta foi criada, mas a remessa nova não (${(e as Error).message})`, a.quem);
    throw new ErroRemessa(`A nota de volta foi criada, mas a remessa nova não: ${(e as Error).message}. Tente renovar de novo pela ficha.`, 502);
  }
  await salvarControle(a.conta, a.idRemessa, { situacao_manual: 'renovada', renovada_para: nova.idRemessa });
  await evento(a.conta, a.idRemessa, 'renovacao_criada', `Renovação: nota de volta + remessa nova (nº ${nova.numero || '?'}) criadas na Omie, retorno até ${dataBR(prazo)}`, a.quem, { volta, nova });
  return { volta, nova };
}

// ── decisões humanas ─────────────────────────────────────────────────────────
export async function definirPrazo(conta: Low, idRemessa: number, prazoAte: string, quem: Quem) {
  const iso = dataISO(prazoAte);
  if (!iso) throw new ErroRemessa('Data inválida.');
  await salvarControle(conta, idRemessa, { prazo_ate: iso, aviso_nivel: 0 });
  await evento(conta, idRemessa, 'prazo', `Prazo de retorno: ${dataBR(iso)}`, quem);
}
export async function marcar(conta: Low, idRemessa: number, sit: 'virou_venda' | 'devolvida' | null, quem: Quem, extra?: { pedido?: string | null; obs?: string | null }) {
  await salvarControle(conta, idRemessa, { situacao_manual: sit, ...(extra?.pedido !== undefined ? { pedido_venda: extra.pedido } : {}) });
  const txt = sit === 'virou_venda' ? `Marcada como venda${extra?.pedido ? ` — pedido ${extra.pedido}` : ''}`
    : sit === 'devolvida' ? 'Marcada como devolvida (volta registrada fora do portal)' : 'Situação manual desfeita';
  await evento(conta, idRemessa, sit || 'desfeito', extra?.obs ? `${txt}. ${limparTexto(extra.obs)}` : txt, quem);
}
export async function anotar(conta: Low, idRemessa: number, obs: string, quem: Quem) {
  const t = limparTexto(obs);
  if (!t) throw new ErroRemessa('Escreva a observação.');
  await evento(conta, idRemessa, 'obs', t, quem);
}
export async function definirResponsavel(conta: Low, idRemessa: number, userId: string | null, quem: Quem) {
  await salvarControle(conta, idRemessa, { responsavel_id: userId });
  await evento(conta, idRemessa, 'responsavel', userId ? 'Responsável pelo acompanhamento definido' : 'Responsável removido', quem, { userId });
}

// ── avisos de prazo (agendador, diário) ──────────────────────────────────────
export async function avisarPrazos(): Promise<string> {
  const { linhas, migracaoFaltando } = await lerLista();
  if (migracaoFaltando) return 'pulado: ' + MSG_MIGRACAO;
  const { mapa } = await lerControles();
  const demos = linhas.filter((l) => l.tipo === 'demonstracao' && (l.situacao === 'vence_logo' || l.situacao === 'vencida'));
  // sem responsável: quem tem o módulo Remessas marcado
  const { data: perms } = await sb.from('portal_permissoes').select('user_id, modulos_permitidos');
  const doModulo = ((perms || []) as Array<{ user_id: string; modulos_permitidos: string[] | null }>)
    .filter((p) => (p.modulos_permitidos || []).some((m) => m === 'remessas' || m.startsWith('remessas:'))).map((p) => p.user_id);
  let enviados = 0;
  for (const l of demos) {
    const c = mapa.get(`${l.conta}|${l.idRemessa}`);
    const nivel = avisoDevido(l.situacao, c?.aviso_nivel || 0);
    if (!nivel) continue;
    const ids = c?.responsavel_id ? [c.responsavel_id] : doModulo;
    if (!ids.length) continue;
    const titulo = nivel === 2 ? `Demonstração vencida — ${l.destinatario}` : `Demonstração vence em ${l.diasPrazo} dia(s) — ${l.destinatario}`;
    const descricao = `Remessa ${l.numero} (${l.conta.toUpperCase()}) · ${l.itens[0] || ''} · prazo ${dataBR(l.prazoAte)}. Renove, registre a volta ou marque como venda.`;
    const { error } = await sb.from('portal_notificacoes').insert(ids.map((user_id) => ({ user_id, tipo: 'propostas', titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link: `/remessas?ficha=${l.conta}-${l.idRemessa}` })));
    if (error) { console.warn('[remessas] aviso:', error.message); continue; }
    await salvarControle(l.conta, l.idRemessa, { aviso_nivel: nivel });
    await evento(l.conta, l.idRemessa, 'aviso_prazo', nivel === 2 ? 'Aviso: prazo vencido' : 'Aviso: vence em até 5 dias', null, { para: ids.length });
    enviados++;
  }
  return `${demos.length} demonstração(ões) perto/fora do prazo, ${enviados} aviso(s) enviado(s)`;
}

export { TIPOS, SITUACOES };
