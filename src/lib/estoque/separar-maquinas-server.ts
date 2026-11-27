// Separar máquinas recebidas em lote — banco + Omie.
// Ordem do "Separar" (tudo ou nada, com desfazer):
//  1. relê o produto da nota e a posição do estoque na Omie; confere séries livres;
//  2. produto da nota vira a 1ª máquina (AlterarProduto: código = série 1, descrição);
//  3. IncluirProduto das outras (cópia do produto da nota, código = série);
//  4. ajustarEstoque: produto da nota fica com (estoque − N + 1), cada novo com 1 un. ao mesmo CMC;
//  5. projeto "MARCA MODELO SÉRIE" de cada máquina (projetoNaConta);
//  6. espelho `produtos` + registro (maquinas_separacoes, se existir) + audit_log.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { omieRequest } from '@/lib/ajustes/omie';
import type { Conta } from '@/lib/ajustes/conta';
import { posicaoPorLocal, localSugerido, ajustarEstoque } from '@/lib/ajustes/ajuste-estoque';
import { getAccount, projetoNaConta } from '@/lib/ppv/omie';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import {
  precisaSeparar, validarMaquinas, descricaoDaMaquina, projetoDaMaquina, normalizarSerie, MAX_POR_VEZ,
  type LinhaRecebida, type ProdutoAtual, type MaquinaSeparar,
} from './separar-maquinas';

export class ErroSeparar extends Error {
  constructor(public status: number, msg: string, public extra?: Record<string, unknown>) { super(msg); }
}

const contaUp = (c: unknown): Conta => (String(c || '').toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA');
const empresaDe = (c: Conta) => (c === 'CASTRO' ? 'Castro Peças' : 'Nova Tratores');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msgErro = (e: any) => String(e?.faultstring || e?.message || e);

// ---------------------------------------------------------------------------
// Lista: linhas de notas recebidas (180 dias) com máquina em lote ainda junta
// ---------------------------------------------------------------------------
export async function listarPendentes(): Promise<Array<LinhaRecebida & { produto: ProdutoAtual }>> {
  const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from('recebimentos_nfe')
    .select('id_receb, conta_omie, numero_nfe, fornecedor, emissao_nfe, recebido_em, produtos')
    .gte('recebido_em', desde).order('recebido_em', { ascending: false }).limit(2000);
  if (error) throw error;
  const linhas: LinhaRecebida[] = [];
  for (const r of data || []) {
    for (const p of (r.produtos as any[]) || []) {
      const qtde = Number(p?.nQtde) || 0;
      const id = Number(p?.nCodProduto) || 0;
      if (qtde > 1 && id > 0) {
        linhas.push({
          idReceb: Number(r.id_receb), conta: contaUp(r.conta_omie), numeroNfe: String(r.numero_nfe || '').replace(/^0+/, ''),
          fornecedor: String(r.fornecedor || ''), emissao: r.emissao_nfe || null, recebidoEm: r.recebido_em || null,
          seq: Number(p.nSequencia) || 0, codigoFornecedor: String(p.cCodigo || ''), descricaoNota: String(p.cDescricao || ''),
          qtde, idProduto: id,
        });
      }
    }
  }
  if (!linhas.length) return [];
  const ids = [...new Set(linhas.map((l) => l.idProduto))];
  const prods = new Map<string, ProdutoAtual>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ps, error: e2 } = await supabaseAdmin.from('produtos')
      .select('codigo_produto, conta_omie, codigo, descricao, familia_nome, estoque, inativo')
      .in('codigo_produto', ids.slice(i, i + 200));
    if (e2) throw e2;
    for (const p of ps || []) {
      prods.set(`${contaUp(p.conta_omie)}:${p.codigo_produto}`, {
        codigo: String(p.codigo || ''), descricao: String(p.descricao || ''), familia: p.familia_nome ?? null,
        estoque: Number(p.estoque) || 0, inativo: p.inativo === true,
      });
    }
  }
  const out: Array<LinhaRecebida & { produto: ProdutoAtual }> = [];
  const vistos = new Set<string>();
  for (const l of linhas) {
    const k = `${l.conta}:${l.idProduto}`;
    const p = prods.get(k);
    if (vistos.has(k) || !precisaSeparar(l, p)) continue;
    vistos.add(k);
    out.push({ ...l, produto: p! });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prévia de uma linha: produto ao vivo + posição + sugestão das N máquinas
// ---------------------------------------------------------------------------
async function consultarProduto(conta: Conta, idProd: number) {
  return omieRequest('/geral/produtos/', 'ConsultarProduto', { codigo_produto: idProd }, conta);
}

async function codigoExiste(conta: Conta, codigo: string): Promise<boolean> {
  try {
    const r = await omieRequest('/geral/produtos/', 'ConsultarProduto', { codigo }, conta);
    return !!(r && Number(r.codigo_produto) > 0);
  } catch (e) {
    if (/n[aã]o (cadastrad|encontrad)|n[aã]o existe/i.test(msgErro(e))) return false;
    throw e;
  }
}

export async function previa(contaIn: string, idProd: number) {
  const conta = contaUp(contaIn);
  const prod = await consultarProduto(conta, idProd);
  const locais = await posicaoPorLocal(conta, idProd);
  const codLocal = localSugerido(locais);
  const local = locais.find((l) => l.id === codLocal) || null;
  const estoque = Number(local?.fisico || 0);
  const n = Math.min(Math.max(2, Math.floor(estoque)), MAX_POR_VEZ);
  const maquinas: MaquinaSeparar[] = Array.from({ length: n }, () => ({ serie: '', descricao: '', projeto: '' }));
  return {
    conta, idProduto: idProd,
    produto: {
      codigo: prod.codigo, descricao: prod.descricao, marca: prod.marca || '', modelo: prod.modelo || '',
      familia: prod.descricao_familia || '', unidade: prod.unidade, lote: prod.produto_lote === 'S', inativo: prod.inativo === 'S',
    },
    local: local ? { id: local.id, nome: local.nome, fisico: estoque, cmc: Number(local.cmc || 0) } : null,
    locais,
    maquinas,
    sugestao: { descricaoBase: prod.descricao, marca: prod.marca || '', modelo: prod.modelo || '' },
  };
}

// ---------------------------------------------------------------------------
// Separar
// ---------------------------------------------------------------------------
export interface PedidoSeparar {
  conta: string; idProduto: number; idReceb?: number | null; numeroNfe?: string | null; seq?: number | null;
  maquinas: MaquinaSeparar[]; gravar: boolean;
}

function payloadNovo(orig: any, m: MaquinaSeparar, idOrig: number) {
  const serie = normalizarSerie(m.serie);
  const p: Record<string, unknown> = {
    codigo_produto_integracao: `SEP-${idOrig}-${serie}`.slice(0, 60),
    codigo: serie,
    descricao: m.descricao.trim(),
    unidade: orig.unidade || 'UN',
    ncm: orig.ncm || '',
    valor_unitario: Number(orig.valor_unitario) || 0,
    tipoItem: orig.tipoItem || '99',
    produto_lote: 'N',
    marca: orig.marca || '',
    modelo: orig.modelo || '',
    peso_liq: Number(orig.peso_liq) || 0,
    peso_bruto: Number(orig.peso_bruto) || 0,
  };
  if (Number(orig.codigo_familia) > 0) p.codigo_familia = Number(orig.codigo_familia);
  if (orig.cest) p.cest = orig.cest;
  const rf = orig.recomendacoes_fiscais || {};
  if (rf.origem_mercadoria != null && rf.origem_mercadoria !== '') p.recomendacoes_fiscais = { origem_mercadoria: String(rf.origem_mercadoria) };
  return p;
}

async function incluirOuAchar(conta: Conta, payload: Record<string, unknown>): Promise<number> {
  try {
    const r = await omieRequest('/geral/produtos/', 'IncluirProduto', payload, conta);
    const id = Number(r?.codigo_produto) || 0;
    if (id) return id;
  } catch (e) {
    // reexecução: o código de integração já existe → pega o produto
    if (!/j[aá] (cadastrad|existe)|duplicad/i.test(msgErro(e))) throw e;
  }
  const r = await omieRequest('/geral/produtos/', 'ConsultarProduto', { codigo_produto_integracao: payload.codigo_produto_integracao }, conta);
  const id = Number(r?.codigo_produto) || 0;
  if (!id) throw new Error(`produto ${payload.codigo} não foi criado na Omie`);
  return id;
}

export async function separar(ped: PedidoSeparar, usuario: { id: string; nome: string }) {
  const conta = contaUp(ped.conta);
  const idOrig = Number(ped.idProduto);
  if (!idOrig) throw new ErroSeparar(400, 'Produto da nota não informado.');
  const orig = await consultarProduto(conta, idOrig);
  if (orig.inativo === 'S') throw new ErroSeparar(409, 'O produto da nota está inativo na Omie.');
  const locais = await posicaoPorLocal(conta, idOrig);
  const codLocal = localSugerido(locais);
  const local = locais.find((l) => l.id === codLocal);
  if (!local) throw new ErroSeparar(502, 'Local de estoque não encontrado.');
  const cmc = Number(local.cmc) || 0;
  if (!(cmc > 0)) throw new ErroSeparar(409, 'O produto da nota está sem custo (CMC) na Omie; acerte antes de separar.');

  const maqs = (ped.maquinas || []).map((m) => ({
    serie: normalizarSerie(m.serie),
    descricao: String(m.descricao || '').trim() || descricaoDaMaquina(orig.descricao, m.serie),
    projeto: String(m.projeto || '').trim().toUpperCase() || projetoDaMaquina(orig.marca, orig.modelo, m.serie),
  }));

  // séries já usadas como código (a 1ª pode ser o próprio código atual do produto da nota)
  const usados = new Set<string>();
  for (const m of maqs) {
    if (!m.serie || m.serie.toLowerCase() === String(orig.codigo || '').toLowerCase()) continue;
    if (await codigoExiste(conta, m.serie)) usados.add(m.serie.toLowerCase());
    await sleep(250);
  }
  const erros = validarMaquinas(maqs, Number(local.fisico) || 0, usados);
  const plano = {
    conta, local: { id: local.id, nome: local.nome, fisico: local.fisico, cmc },
    origem: { id: idOrig, codigoAntes: orig.codigo, descricaoAntes: orig.descricao, codigoDepois: maqs[0]?.serie, descricaoDepois: maqs[0]?.descricao, estoqueDepois: (Number(local.fisico) || 0) - maqs.length + 1 },
    novos: maqs.slice(1).map((m) => ({ codigo: m.serie, descricao: m.descricao, estoque: 1, custo: cmc })),
    projetos: maqs.map((m) => m.projeto),
    lote: orig.produto_lote === 'S',
  };
  if (erros.length) return { ok: false, gravado: false, erros, plano };
  if (!ped.gravar) return { ok: true, gravado: false, erros: [], plano };

  // --- grava ---
  const feito: { renomeado: boolean; criados: Array<{ id: number; codigo: string }>; ajustes: any[]; projetos: Array<{ nome: string; codigo: number }> } =
    { renomeado: false, criados: [], ajustes: [], projetos: [] };
  const desfazer = async () => {
    const problemas: string[] = [];
    for (const c of feito.criados) {
      try { await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: c.id, inativo: 'S' }, conta); } catch (e) { problemas.push(`inativar ${c.codigo}: ${msgErro(e)}`); }
    }
    if (feito.renomeado) {
      try { await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: idOrig, codigo: orig.codigo, descricao: orig.descricao }, conta); } catch (e) { problemas.push(`voltar o código ${orig.codigo}: ${msgErro(e)}`); }
    }
    return problemas;
  };

  try {
    // 2) produto da nota vira a 1ª máquina
    await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: idOrig, codigo: maqs[0].serie, descricao: maqs[0].descricao }, conta);
    feito.renomeado = true;
    // 3) as outras
    for (const m of maqs.slice(1)) {
      await sleep(400);
      const id = await incluirOuAchar(conta, payloadNovo(orig, m, idOrig));
      feito.criados.push({ id, codigo: m.serie });
    }
    // 4) estoque (tudo ou nada, a própria função desfaz os ajustes)
    const motivo = `Separação de máquinas da NF ${ped.numeroNfe || '?'} (${maqs.length} un. de ${orig.codigo})`;
    const aj = await ajustarEstoque({
      gravar: true, motivo,
      itens: [
        { conta, codigoProduto: idOrig, codLocal: local.id, codigo: maqs[0].serie, novaQtd: plano.origem.estoqueDepois },
        ...feito.criados.map((c) => ({ conta, codigoProduto: c.id, codLocal: local.id, codigo: c.codigo, novaQtd: 1, novoCusto: cmc })),
      ],
    }, usuario);
    if (!aj.ok) throw new Error(aj.erro || (aj.problemas || []).map((p: any) => p.erro).join('; ') || 'ajuste de estoque recusado');
    feito.ajustes = aj.ajustes || [];
  } catch (e) {
    const problemas = await desfazer();
    await registrarAuditLog({
      userId: usuario.id, userName: usuario.nome, sistema: 'recebimentos', acao: 'separar_maquinas_erro',
      entidade: 'produto', entidadeId: String(idOrig), entidadeLabel: `${orig.codigo} (${conta})`,
      detalhes: { erro: msgErro(e), desfazer: problemas, plano, nf: ped.numeroNfe },
    }).catch(() => {});
    throw new ErroSeparar(502, `Não separei: ${msgErro(e)}${problemas.length ? ` — ATENÇÃO, não consegui desfazer: ${problemas.join('; ')}` : ' (nada ficou gravado)'}`);
  }

  // 5) projetos (não desfaz a separação se falhar: só avisa)
  const acc = getAccount(empresaDe(conta));
  const avisos: string[] = [];
  for (const m of maqs) {
    const cod = await projetoNaConta(m.projeto, acc, true).catch(() => 0);
    feito.projetos.push({ nome: m.projeto, codigo: cod });
    if (!cod) avisos.push(`Projeto "${m.projeto}" não foi criado; crie na Omie.`);
    await sleep(300);
  }

  // 6) espelho + registro
  const contaLow = conta.toLowerCase();
  await supabaseAdmin.from('produtos').update({ codigo: maqs[0].serie, descricao: maqs[0].descricao, estoque: plano.origem.estoqueDepois })
    .eq('codigo_produto', idOrig).eq('conta_omie', contaLow).then(() => {}, () => {});
  for (const [i, c] of feito.criados.entries()) {
    const m = maqs[i + 1];
    await supabaseAdmin.from('produtos').insert({
      codigo_produto: c.id, conta_omie: contaLow, codigo: c.codigo, descricao: m.descricao,
      familia_nome: orig.descricao_familia || null, marca: orig.marca || null, modelo: orig.modelo || null,
      estoque: 1, valor_unitario: Number(orig.valor_unitario) || 0, inativo: false,
    }).then(() => {}, () => {});
  }
  const registro = {
    conta, id_receb: ped.idReceb ?? null, numero_nfe: ped.numeroNfe ?? null, seq: ped.seq ?? null,
    produto_origem: idOrig, codigo_origem_antes: orig.codigo, series: maqs.map((m) => m.serie),
    produtos_criados: feito.criados, ajustes: feito.ajustes, projetos: feito.projetos,
    cmc, local_estoque: local.id, usuario: usuario.nome, usuario_id: usuario.id,
  };
  const reg = await supabaseAdmin.from('maquinas_separacoes').insert(registro);
  if (reg.error) avisos.push('Registro da separação não gravado (aplicar sql/maquinas-separacoes.sql); ficou no histórico de atividades.');
  await registrarAuditLog({
    userId: usuario.id, userName: usuario.nome, sistema: 'recebimentos', acao: 'separar_maquinas',
    entidade: 'produto', entidadeId: String(idOrig), entidadeLabel: `${orig.codigo} → ${maqs.map((m) => m.serie).join(', ')} (${conta})`,
    detalhes: registro,
  }).catch(() => {});

  return { ok: true, gravado: true, plano, criados: feito.criados, projetos: feito.projetos, avisos };
}
