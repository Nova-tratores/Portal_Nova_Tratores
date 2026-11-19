// Devolução em garantia pela Omie — servidor (16/11/2026). Regras em retorno-remessa.ts.
//
// Fluxo: prévia (lê a nota da fábrica na Omie + o que já voltou + padrões da última remessa
// de garantia para esse fornecedor) → emitir (grava a ficha, IncluirRemessa com código de
// integração RG<receb>-<n>) → faturar (ConferirRemessa + ConcluirRemessa, espera a NF-e no
// StatusRemessa) → se veio da garantia, dá baixa na pendência "Devolução de peças".
// Gravação na Omie passa pela porta única (sem reenvio às cegas); resposta incerta → confere
// pelo código de integração antes de dizer que falhou.
import type { Conta } from '@/lib/ajustes/conta';
import { omieRequest } from '@/lib/ajustes/omie';
import { supabase } from '@/lib/ajustes/supabase';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import {
  itensDaEntrada, itemRemessa, valorItem, validarEscolha, disponivel, textoRetorno, codIntRem,
  limparTexto, ehItemGarantia, cfopRetorno, CATEGORIA_PADRAO, FRETE_PADRAO, type ItemEntrada, type Escolha,
  cBenefDoXml, cstPedeBeneficio, situacaoNfe,
} from './retorno-remessa';

const TBL = 'garantia_retornos';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sem0 = (s: unknown) => String(s ?? '').replace(/^0+(?=\d)/, '');

export function tabelaFaltando(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /garantia_retornos/.test(e.message || ''));
}
const MSG_MIGRACAO = 'Falta aplicar sql/garantia-retorno-remessa.sql no banco.';

export interface Padroes { categoria: string; projeto: number | null; vendedor: number | null; email: string | null; frete: string; deRemessa: string | null }

interface Nota {
  idReceb: number; numero: string | null; emissao: string | null; chave: string | null; fornecedor: string | null;
  cnpj: string | null; nCodCli: number | null; recebido: boolean; itens: ItemEntrada[]; xmlLido: boolean;
  volumes: { qtd: number; especie: string | null; marca: string | null; pesoBruto: number; pesoLiq: number };
}

async function lerNota(conta: Conta, idReceb: number): Promise<Nota> {
  const d = await omieRequest('/produtos/recebimentonfe/', 'ConsultarRecebimento', { nIdReceb: idReceb }, conta);
  if (d?.faultstring) throw new Error('Omie: ' + d.faultstring);
  const cab = d?.cabec || {};
  const tr = d?.transporte || {};
  const itens = itensDaEntrada(d);
  // código de benefício fiscal de cada item: vem do XML da nota (guardado em notas-fiscais)
  const benef = cab.cChaveNFe ? await beneficiosDoXml(String(cab.cChaveNFe)) : null;
  for (const it of itens) it.cBenef = benef?.[it.seq] ?? null;
  return {
    idReceb,
    numero: cab.cNumeroNFe ?? null,
    emissao: cab.dEmissaoNFe ?? null,
    chave: cab.cChaveNFe ?? null,
    fornecedor: cab.cRazaoSocial || cab.cNome || null,
    cnpj: cab.cCNPJ_CPF ?? null,
    nCodCli: Number(cab.nIdFornecedor) || null,
    recebido: d?.infoCadastro?.cRecebido === 'S',
    itens,
    xmlLido: benef != null,
    volumes: {
      qtd: Number(tr.nQtdeVolume) || 0, especie: tr.cEspecieVolume || null, marca: tr.cMarcaVolume || null,
      pesoBruto: Number(tr.nPesoBruto) || 0, pesoLiq: Number(tr.nPesoLiquido) || 0,
    },
  };
}

/** cBenef por item a partir do XML guardado da nota de entrada (null = sem XML no portal) */
async function beneficiosDoXml(chave: string): Promise<Record<number, string> | null> {
  try {
    const { data } = await supabase.from('notas_fiscais_docs').select('xml_path')
      .eq('tipo', 'entrada').eq('chave_nfe', chave).not('xml_path', 'is', null).limit(1).maybeSingle();
    if (!data?.xml_path) return null;
    const { data: arq } = await supabase.storage.from('notas-fiscais').download(data.xml_path);
    if (!arq) return null;
    return cBenefDoXml(await arq.text());
  } catch { return null; }
}

/** retornos já gravados desta nota + quanto de cada item já voltou (remessas não canceladas/falhas) */
async function historico(conta: Conta, idReceb: number) {
  const { data, error } = await supabase.from(TBL)
    .select('id, cod_int_rem, n_cod_rem, status, nf_numero, itens, valor_total, erro, user_nome, criado_em, faturado_em, garantia_id')
    .eq('conta_omie', conta).eq('id_receb', idReceb).order('criado_em', { ascending: true });
  if (error) {
    if (tabelaFaltando(error)) return { migracaoFaltando: true, linhas: [], porSeq: {} as Record<number, number> };
    throw new Error(error.message);
  }
  const porSeq: Record<number, number> = {};
  for (const l of data || []) {
    if (l.status === 'falhou' || l.status === 'cancelada') continue;
    for (const it of (l.itens as Array<{ seq: number; qtd: number }>) || []) porSeq[it.seq] = (porSeq[it.seq] || 0) + Number(it.qtd || 0);
  }
  return { migracaoFaltando: false, linhas: data || [], porSeq };
}

/** categoria/projeto/vendedor/e-mail/frete da última remessa de garantia faturada p/ esse fornecedor */
async function padroes(conta: Conta, cnpj: string | null): Promise<Padroes> {
  const base: Padroes = { categoria: CATEGORIA_PADRAO, projeto: null, vendedor: null, email: null, frete: FRETE_PADRAO, deRemessa: null };
  if (!cnpj) return base;
  try {
    const { data } = await supabase.from('remessas').select('id_remessa, numero_nfe')
      .eq('conta_omie', conta.toLowerCase()).eq('destinatario_cnpj', cnpj).in('cfop', ['5.949', '6.949'])
      .eq('status', 'Faturada').order('id_remessa', { ascending: false }).limit(1);
    const ult = data?.[0];
    if (!ult) return base;
    const r = await omieRequest('/produtos/remessa/', 'ConsultarRemessa', { nCodRem: Number(ult.id_remessa) }, conta);
    return {
      categoria: r?.infAdic?.cCodCateg || CATEGORIA_PADRAO,
      projeto: Number(r?.infAdic?.nCodProj) || null,
      vendedor: Number(r?.cabec?.nCodVend) || null,
      email: r?.email?.cEmail || null,
      frete: r?.frete?.cTpFrete || FRETE_PADRAO,
      deRemessa: sem0(ult.numero_nfe) || null,
    };
  } catch {
    return base;
  }
}

/** prévia para a janela: itens com o que ainda pode voltar, histórico e padrões */
export async function previaRetorno(conta: Conta, idReceb: number) {
  const nota = await lerNota(conta, idReceb);
  const h = await historico(conta, idReceb);
  const pad = await padroes(conta, nota.cnpj);
  return {
    nota: {
      idReceb, numero: sem0(nota.numero), emissao: nota.emissao, chave: nota.chave, fornecedor: nota.fornecedor,
      cnpj: nota.cnpj, recebido: nota.recebido, volumes: nota.volumes,
    },
    itens: nota.itens.map((it) => {
      const disp = disponivel(it, h.porSeq[it.seq] || 0);
      return {
        seq: it.seq, codigo: it.codigo, descricao: it.descricao, cfopForn: it.cfopForn, cfop: cfopRetorno(it.cfopForn),
        garantia: ehItemGarantia(it.cfopForn), temProduto: !!it.nCodProd, qtdNF: it.qtdNF, precoUnit: it.precoUnit,
        jaDevolvido: it.devolvidoNaOmie ? it.qtdNF : (h.porSeq[it.seq] || 0), devolvidoNaOmie: it.devolvidoNaOmie,
        disponivel: disp, valorDisponivel: valorItem(it, disp), icmsCst: it.icms?.cSitTrib || null, temST: !!it.st,
      };
    }),
    historico: h.linhas,
    padroes: pad,
    texto: textoRetorno({ numero: nota.numero, emissao: nota.emissao, chave: nota.chave }),
    avisos: !nota.xmlLido && nota.itens.some((i) => cstPedeBeneficio(i.icms?.cSitTrib))
      ? ['O XML desta nota ainda não está guardado no portal: o código de benefício fiscal do ICMS não será copiado e a SEFAZ pode rejeitar. Abra "ver DANFE" da nota uma vez e tente de novo.']
      : [],
    migracaoFaltando: h.migracaoFaltando,
  };
}

export interface EmitirArgs {
  conta: Conta; idReceb: number; escolha: Escolha[]; texto: string;
  frete?: { tipo?: string; qtdVol?: number; especie?: string | null; marca?: string | null; pesoBruto?: number; pesoLiq?: number };
  categoria?: string | null; garantiaId?: string | null; userId: string; userNome: string;
}

/** grava a ficha, cria a remessa na Omie e já fatura. Cada passo fica registrado na ficha. */
export async function emitirRetorno(a: EmitirArgs) {
  const nota = await lerNota(a.conta, a.idReceb);
  if (!nota.recebido) return { ok: false, erro: 'Dê entrada nesta nota antes de devolver (a Omie só referencia nota recebida).' };
  if (!nota.nCodCli) return { ok: false, erro: 'A Omie não devolveu o fornecedor desta nota.' };
  const h = await historico(a.conta, a.idReceb);
  if (h.migracaoFaltando) return { ok: false, erro: MSG_MIGRACAO, migracaoFaltando: true };
  if (h.linhas.some((l) => l.status === 'criando')) return { ok: false, erro: 'Já existe uma devolução desta nota em andamento. Atualize a janela.' };
  const erros = validarEscolha(nota.itens, a.escolha, h.porSeq);
  if (erros.length) return { ok: false, erro: erros.join(' ') };

  const pad = await padroes(a.conta, nota.cnpj);
  const escolhidos = a.escolha.filter((e) => e.qtd > 0).map((e) => ({ e, it: nota.itens.find((i) => i.seq === e.seq)! }));
  const itensFicha = escolhidos.map(({ e, it }) => ({ seq: it.seq, nCodProd: it.nCodProd, codigo: it.codigo, descricao: it.descricao, qtd: e.qtd, valor: valorItem(it, e.qtd) }));
  const total = Math.round(itensFicha.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  const cod = codIntRem(a.idReceb, h.linhas.length + 1);
  const texto = limparTexto(a.texto || textoRetorno({ numero: nota.numero, emissao: nota.emissao, chave: nota.chave }));

  const { data: ficha, error: eIns } = await supabase.from(TBL).insert({
    conta_omie: a.conta, id_receb: a.idReceb, numero_nfe: nota.numero, chave_ref: nota.chave, fornecedor: nota.fornecedor,
    n_cod_cli: nota.nCodCli, garantia_id: a.garantiaId || null, cod_int_rem: cod, itens: itensFicha, valor_total: total,
    texto, status: 'criando', user_id: a.userId, user_nome: a.userNome,
  }).select('id').single();
  if (eIns) return { ok: false, erro: tabelaFaltando(eIns) ? MSG_MIGRACAO : eIns.message };

  const f = a.frete || {};
  const payload = {
    cabec: { cCodIntRem: cod, nCodCli: nota.nCodCli, dPrevisao: hojeBR(), ...(pad.vendedor ? { nCodVend: pad.vendedor } : {}) },
    infAdic: {
      cCodCateg: a.categoria || pad.categoria,
      ...(pad.projeto ? { nCodProj: pad.projeto } : {}),
      cDadosAdic: texto,
      ...(nota.chave ? { nfRelacionada: { cChaveRef: nota.chave } } : {}),
    },
    frete: {
      cTpFrete: f.tipo || pad.frete,
      ...(Number(f.qtdVol ?? nota.volumes.qtd) > 0 ? { nQtdVol: Number(f.qtdVol ?? nota.volumes.qtd) } : {}),
      ...((f.especie ?? nota.volumes.especie) ? { cEspVol: f.especie ?? nota.volumes.especie } : {}),
      ...((f.marca ?? nota.volumes.marca) ? { cMarVol: f.marca ?? nota.volumes.marca } : {}),
      ...(Number(f.pesoBruto ?? nota.volumes.pesoBruto) > 0 ? { nPesoBruto: Number(f.pesoBruto ?? nota.volumes.pesoBruto) } : {}),
      ...(Number(f.pesoLiq ?? nota.volumes.pesoLiq) > 0 ? { nPesoLiq: Number(f.pesoLiq ?? nota.volumes.pesoLiq) } : {}),
    },
    ...(pad.email ? { email: { cEmail: pad.email } } : {}),
    produtos: escolhidos.map(({ e, it }) => itemRemessa(it, e.qtd)),
  };

  let nCodRem = 0;
  try {
    const r = await omieRequest('/produtos/remessa/', 'IncluirRemessa', payload, a.conta);
    nCodRem = Number(r?.nCodRem) || 0;
  } catch (e) {
    // resposta incerta ou erro: confere pelo código de integração antes de desistir
    nCodRem = await nCodRemPorCodigo(a.conta, cod);
    if (!nCodRem) {
      const erro = (e as { faultstring?: string; message?: string }).faultstring || (e as Error).message;
      await supabase.from(TBL).update({ status: 'falhou', erro: `IncluirRemessa: ${erro}`, atualizado_em: new Date().toISOString() }).eq('id', ficha.id);
      return { ok: false, erro: `A Omie não criou a remessa: ${erro}`, fichaId: ficha.id };
    }
  }
  if (!nCodRem) nCodRem = await nCodRemPorCodigo(a.conta, cod);
  await supabase.from(TBL).update({ status: 'criada', n_cod_rem: nCodRem || null, erro: null, atualizado_em: new Date().toISOString() }).eq('id', ficha.id);
  const fat = await faturarRetorno(ficha.id, a.userNome);
  return { ...fat, fichaId: ficha.id, nCodRem };
}

async function nCodRemPorCodigo(conta: Conta, cod: string): Promise<number> {
  try {
    const r = await omieRequest('/produtos/remessa/', 'ConsultarRemessa', { cCodIntRem: cod }, conta);
    return Number(r?.cabec?.nCodRem) || 0;
  } catch { return 0; }
}

function hojeBR(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

type StatusRem = { faturada?: string; cancelada?: string; ListaNfe?: Array<{ cNumNFe?: string; cChaveNFe?: string; cStatusNFe?: string; mensagens?: Array<{ cCodigo?: string; cDescricao?: string }> }> };
async function statusRem(conta: Conta, nCodRem: number): Promise<StatusRem | null> {
  try { return await omieRequest('/produtos/remessa/', 'StatusRemessa', { nCodRem }, conta); } catch { return null; }
}
type NfeStatus = { cNumNFe?: string; cChaveNFe?: string; cStatusNFe?: string; mensagens?: Array<{ cCodigo?: string; cDescricao?: string }> };
const ultimaNfe = (st: StatusRem | null): NfeStatus | null => { const l = (st?.ListaNfe || []) as NfeStatus[]; return l[l.length - 1] || null; };
const nfDe = (st: StatusRem | null) => { const l = st?.ListaNfe || []; const n = l[l.length - 1]; return n?.cNumNFe ? { numero: sem0(n.cNumNFe), chave: n.cChaveNFe || null } : null; };

/** fatura (emite a NF-e) a remessa de uma ficha já criada. Serve também para "tentar de novo". */
export async function faturarRetorno(fichaId: string, userNome: string) {
  const { data: f, error } = await supabase.from(TBL).select('*').eq('id', fichaId).maybeSingle();
  if (error) return { ok: false, erro: tabelaFaltando(error) ? MSG_MIGRACAO : error.message };
  if (!f) return { ok: false, erro: 'Devolução não encontrada.' };
  const conta = f.conta_omie as Conta;
  let nCodRem = Number(f.n_cod_rem) || 0;
  if (!nCodRem) nCodRem = await nCodRemPorCodigo(conta, f.cod_int_rem);
  if (!nCodRem) return { ok: false, erro: 'A remessa não foi encontrada na Omie.' };
  const marcarErro = async (erro: string) => {
    await supabase.from(TBL).update({ status: 'criada', n_cod_rem: nCodRem, erro, atualizado_em: new Date().toISOString() }).eq('id', fichaId);
    return { ok: false, erro, podeTentarDeNovo: true };
  };

  const st0 = await statusRem(conta, nCodRem);
  if (st0?.cancelada === 'S') {
    await supabase.from(TBL).update({ status: 'cancelada', erro: 'Remessa cancelada na Omie.', atualizado_em: new Date().toISOString() }).eq('id', fichaId);
    return { ok: false, erro: 'A remessa está cancelada na Omie.' };
  }
  const sit0 = situacaoNfe(ultimaNfe(st0));
  const reenviar = st0?.faturada === 'S' && sit0.situacao === 'rejeitada';
  if (st0?.faturada !== 'S' || reenviar) {
    // acerta os itens da remessa já criada com a regra atual (ex.: IPI, código de benefício) antes de faturar
    const al = await alinharItens(conta, f, nCodRem);
    if (al) return marcarErro(al);
    try { await omieRequest('/produtos/remessafat/', 'ConferirRemessa', { nCodRem }, conta); }
    catch (e) { return marcarErro(`A Omie não validou a remessa: ${(e as { faultstring?: string }).faultstring || (e as Error).message}`); }
    try {
      const r = await omieRequest('/produtos/remessafat/', 'ConcluirRemessa', { nCodRem }, conta);
      if (r?.cCodStatus && r.cCodStatus !== '0') return marcarErro(`A Omie não faturou a remessa: ${r.cDescStatus || r.cCodStatus}`);
    } catch (e) {
      // incerta: confere o status antes de dizer que falhou
      const st = await statusRem(conta, nCodRem);
      if (st?.faturada !== 'S') return marcarErro(`A Omie não faturou a remessa: ${(e as { faultstring?: string }).faultstring || (e as Error).message}`);
    }
  }
  // a NF-e leva alguns segundos para aparecer e a SEFAZ responde depois: espera autorizar ou rejeitar
  let st = reenviar ? null : st0;
  let sit = reenviar ? { situacao: 'aguardando' as const, mensagem: null } : situacaoNfe(ultimaNfe(st0));
  for (let i = 0; i < 8 && (!st || sit.situacao === 'aguardando'); i++) {
    await espera(4000);
    st = await statusRem(conta, nCodRem);
    sit = situacaoNfe(ultimaNfe(st));
  }
  const nf = nfDe(st);
  if (sit.situacao === 'rejeitada') {
    await supabase.from(TBL).update({ status: 'criada', n_cod_rem: nCodRem, nf_numero: nf?.numero || null, nf_chave: nf?.chave || null, erro: `A SEFAZ rejeitou a NF-e${nf ? ` ${nf.numero}` : ''}: ${sit.mensagem}`, atualizado_em: new Date().toISOString() }).eq('id', fichaId);
    return { ok: false, erro: `A SEFAZ rejeitou a NF-e${nf ? ` ${nf.numero}` : ''}: ${sit.mensagem}`, podeTentarDeNovo: true };
  }
  const agora = new Date().toISOString();
  await supabase.from(TBL).update({
    status: 'faturada', n_cod_rem: nCodRem, nf_numero: nf?.numero || null, nf_chave: nf?.chave || null,
    erro: null, faturado_em: agora, atualizado_em: agora,
  }).eq('id', fichaId);
  if (f.garantia_id) await baixarNaGarantia(f.garantia_id, nf?.numero || null, f.numero_nfe, userNome).catch(() => {});
  return { ok: true, nf: nf?.numero || null, nCodRem };
}

/** Regrava os itens da remessa com a regra de hoje (mesmos itens e quantidades da ficha). Devolve o erro ou null. */
async function alinharItens(conta: Conta, f: { id_receb: number; itens: unknown }, nCodRem: number): Promise<string | null> {
  try {
    const nota = await lerNota(conta, Number(f.id_receb));
    const rc = await omieRequest('/produtos/remessa/', 'ConsultarRemessa', { nCodRem }, conta);
    const atuais = (rc?.produtos || []) as Array<{ nCodIt?: number; cCodItInt?: string; nCodProd?: number }>;
    const produtos = ((f.itens as Array<{ seq: number; qtd: number }>) || []).map((fi) => {
      const it = nota.itens.find((i) => i.seq === Number(fi.seq));
      if (!it) throw new Error(`item ${fi.seq} não está mais na nota`);
      const esp = itemRemessa(it, Number(fi.qtd));
      const atual = atuais.find((a) => a.cCodItInt === esp.cCodItInt) || atuais.find((a) => Number(a.nCodProd) === Number(it.nCodProd));
      return { ...esp, ...(atual?.nCodIt ? { nCodIt: atual.nCodIt } : {}) };
    });
    if (!produtos.length) return null;
    // a Omie exige o cliente na alteração (mesma regra do PPV)
    await omieRequest('/produtos/remessa/', 'AlterarRemessa', { cabec: { nCodRem, nCodCli: Number(rc?.cabec?.nCodCli) || undefined }, produtos }, conta);
    return null;
  } catch (e) {
    return `A Omie não aceitou acertar os itens da remessa: ${(e as { faultstring?: string }).faultstring || (e as Error).message}`;
  }
}

/** dá baixa na pendência "Devolução de peças" da garantia com a NF-e emitida */
async function baixarNaGarantia(garantiaId: string, nf: string | null, nfFabrica: string | null, ator: string) {
  const { data: g } = await supabase.from('garantias').select('id, numero, id_ordem, devolucao_status').eq('id', garantiaId).maybeSingle();
  if (!g) return;
  const detalhe = `Devolução emitida pelo portal na Omie${nf ? ` — NF ${nf}` : ''} (retorno da NF ${sem0(nfFabrica)} da fábrica)`;
  if (g.devolucao_status === 'pendente') {
    const agora = new Date().toISOString();
    await supabase.from('garantias').update({
      devolucao_status: 'enviada', devolucao_enviada_em: agora, devolucao_nf: nf, updated_at: agora,
      devolucao_obs: `Remessa de retorno em garantia emitida pelo portal (NF da fábrica ${sem0(nfFabrica)}).`,
    }).eq('id', garantiaId);
    await notificarGarantistas({ titulo: `Peças da garantia ${g.numero} devolvidas à fábrica`, descricao: `OS ${g.id_ordem}${nf ? ` · NF ${nf}` : ''}`, link: `/garantias?id=${garantiaId}` });
  }
  await registrarEvento(garantiaId, { tipo: 'devolucao_registrar', ator, detalhe });
}

/** notas da fábrica (recebimentos x.949) que a garantia pode devolver — as ligadas primeiro */
export async function notasParaGarantia(garantiaId: string) {
  const { notasDaGarantia } = await import('./notas-server');
  const ng = await notasDaGarantia(garantiaId);
  if (!ng) return { erro: 'Garantia não encontrada.', notas: [] };
  const lista = [...ng.pecas.sugeridas, ...ng.pecas.outras];
  const out: Array<{ conta: Conta; idReceb: number; numero: string; data: string; fornecedor: string; valor: number; sugerida: boolean }> = [];
  for (const n of lista) {
    const { data: ent } = await supabase.from('notas_entrada').select('complemento, emitente').eq('id', n.entradaId).maybeSingle();
    const chave = (ent?.complemento as { cChaveNFe?: string } | null)?.cChaveNFe || (ent?.emitente as { cChaveNFe?: string } | null)?.cChaveNFe;
    if (!chave) continue;
    const { data: rec } = await supabase.from('recebimentos_nfe').select('id_receb, conta_omie').eq('chave_nfe', chave).limit(1);
    if (!rec?.[0]) continue;
    out.push({
      conta: String(rec[0].conta_omie).toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA', idReceb: Number(rec[0].id_receb),
      numero: n.numero, data: n.data, fornecedor: n.fornecedor, valor: n.valor, sugerida: ng.pecas.sugeridas.includes(n),
    });
  }
  return { garantia: ng.garantia, notas: out };
}
