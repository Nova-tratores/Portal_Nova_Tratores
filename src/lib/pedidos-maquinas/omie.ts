// Pedido de Máquinas → Omie (IncluirPedido / FaturarPedidoVenda / CancelarPedidoVenda).
// Reaproveita as peças do PPV (lib/ppv/omie.ts) — cliente, vendedor, conta corrente,
// departamentos, projeto, consulta — mas com as regras de MÁQUINA:
//  - sem o CST 60 forçado (isso é de peça com ICMS-ST);
//  - consumidor final vem do campo do pedido (não fixo em "S");
//  - categoria/cenário escolhidos na tela (sem padrão de peças);
//  - vendedor = o vendedor do pedido (não o técnico);
//  - parcelas exatas do pedido (datas e valores), não "30/60/90".
// Código de integração: "PM-<id_pedido>" (o PPV usa "PV-").
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import {
  buscarNcodCli, buscarNcodVend, contaCorrenteDoPedido, departamentosDoPedido, projetoNaConta,
  consultarPedidoOmie, getAccount, omieNaConta, buscarNFdoPedido,
  type OmieAccount, type OmiePedidoConsulta,
} from '@/lib/ppv/omie';
import { statusOmieErro, descricaoOmie } from '@/lib/ppv/omie-status';
import { hojeSaoPaulo } from '@/lib/pagamento/parcelas';
import { T, ErroPedido, lerCompleto, log, type PedidoMaquina } from './server';
import { parcelasParaOmie, validarParaOmie, totalItens, referenciaPedido, CONTA_PADRAO } from './regras';

const ETAPA_FATURADO = 60;
const PORTAL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.novatratores.com').replace(/\/$/, '');
const codInt = (idPedido: string) => `PM-${idPedido}`;

function contaDoPedido(p: PedidoMaquina): OmieAccount {
  return getAccount(p.empresa || 'Nova Tratores');
}

/** Payload do IncluirPedido — exportado para a prévia ("Simular") mostrar o que vai. */
export async function montarPayload(id: number | string): Promise<{ acc: OmieAccount; payload: Record<string, unknown>; avisos: string[]; pedido: PedidoMaquina }> {
  const { pedido, itens, parcelas, vendedor } = await lerCompleto(id);
  const hoje = hojeSaoPaulo();
  const erros = validarParaOmie({ ...pedido, itens, parcelas }, hoje);
  if (!pedido.categoria_pedido) erros.push('Escolha a categoria do pedido (aba Omie).');
  if (erros.length) throw new ErroPedido(422, erros.join(' '), { erros });

  const acc = contaDoPedido(pedido);
  const avisos: string[] = [];
  const nCodCli = pedido.cliente_cod_omie || await buscarNcodCli(String(pedido.cliente_documento), acc);
  const nCodVend = vendedor?.nome ? await buscarNcodVend(vendedor.nome, acc).catch(() => 0) : 0;
  if (!nCodVend) avisos.push(`Vendedor "${vendedor?.nome || '—'}" não achado na Omie (${acc.name}): o pedido vai sem vendedor.`);

  const total = totalItens(itens);
  const parc = parcelasParaOmie(parcelas, total, hoje);
  const cc = await contaCorrenteDoPedido(acc, pedido.conta_corrente || CONTA_PADRAO);
  if (cc.aviso) avisos.push(cc.aviso);
  const depR = await departamentosDoPedido(acc, (pedido.departamentos || []).map((d) => ({ codigo: String(d.codigo), perc: Number(d.perc) || 0 })));
  if (depR.aviso) avisos.push(depR.aviso);
  let nCodProj = 0;
  if (pedido.projeto) {
    try { nCodProj = await projetoNaConta(pedido.projeto, acc, true); } catch (e) { avisos.push(`Projeto não resolvido: ${e instanceof Error ? e.message : e}`); }
  }

  const refs = [referenciaPedido(pedido.id_pedido, pedido.proposta_id), `Portal: ${PORTAL}/propostas?aba=pedidos&pvm=${pedido.id_pedido}`];
  const chassis = itens.map((i) => i.chassi).filter(Boolean);
  if (chassis.length) refs.unshift(`Chassi: ${chassis.join(', ')}`);
  const obs = [pedido.dados_nf, refs.join('\n')].filter(Boolean).join('\n\n');
  const vencimentos = parcelas.map((p) => p.vencimento).filter(Boolean).sort();
  const previsao = pedido.previsao_faturamento || hoje;

  const det = itens.map((it, i) => ({
    ide: { codigo_item_integracao: `${pedido.id_pedido}-${i + 1}` },
    produto: {
      codigo_produto: Number(it.codigo_produto),
      quantidade: Number(it.qtde),
      valor_unitario: Number(it.preco),
      ...(Number(it.desconto) > 0 ? { tipo_desconto: 'V', valor_desconto: Number(it.desconto) } : {}),
    },
    ...(it.chassi ? { inf_adic: { dados_adicionais_item: `Chassi ${it.chassi}`.slice(0, 500) } } : {}),
  }));

  const payload: Record<string, unknown> = {
    cabecalho: {
      codigo_pedido_integracao: codInt(pedido.id_pedido),
      codigo_cliente: nCodCli,
      data_previsao: `${previsao.slice(8, 10)}/${previsao.slice(5, 7)}/${previsao.slice(0, 4)}`,
      etapa: '10',
      quantidade_itens: det.length,
      codigo_parcela: parc.codigo_parcela,
      qtde_parcelas: parc.qtde_parcelas,
      ...(pedido.cenario_fiscal ? { codigo_cenario_impostos: pedido.cenario_fiscal } : {}),
    },
    informacoes_adicionais: {
      codigo_categoria: pedido.categoria_pedido,
      codigo_conta_corrente: cc.codigo,
      ...(nCodVend ? { codVend: nCodVend } : {}),
      numero_pedido_cliente: pedido.proposta_id ? `PROP ${pedido.proposta_id}` : pedido.id_pedido,
      consumidor_final: pedido.consumo_final ? 'S' : 'N',
      ...(pedido.contato ? { contato: pedido.contato } : {}),
      ...(nCodProj ? { codProj: nCodProj } : {}),
    },
    observacoes: { obs_venda: obs },
    det,
    ...(parc.lista_parcelas ? { lista_parcelas: parc.lista_parcelas } : {}),
    ...(depR.deps.length
      ? { departamentos: depR.deps.map((d) => ({ cCodDepto: String(d.codigo), nPerc: d.perc, nValor: Math.round(total * d.perc) / 100, nValorFixo: 'N' })) }
      : {}),
  };
  if (vencimentos.length && vencimentos[0] < hoje) avisos.push('Há parcela com data no passado.');
  return { acc, payload, avisos, pedido };
}

/** Envia o pedido à Omie (etapa 10). Idempotente: "já cadastrado" adota o que está lá. */
export async function enviarPedidoMaquina(id: number | string, usuario: string) {
  const { acc, payload, avisos, pedido } = await montarPayload(id);
  if (pedido.pedido_omie) throw new ErroPedido(409, `Já enviado (nº ${pedido.pedido_omie}).`);

  let resp: { numero_pedido?: string; codigo_pedido?: number };
  try {
    resp = await omieNaConta<{ numero_pedido?: string; codigo_pedido?: number }>(acc, '/produtos/pedido/', 'IncluirPedido', payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/j[aá]\s+cadastrad|Client-10[23]\b/i.test(msg) && !(e as { incerto?: boolean })?.incerto) throw new ErroPedido(502, `A Omie recusou: ${msg}`);
    const ja = await consultarPedidoOmie(codInt(pedido.id_pedido), acc);
    if (!ja?.cabecalho?.codigo_pedido) throw new ErroPedido(502, `A Omie respondeu "${msg}" e o pedido não foi achado. Confira na Omie antes de enviar de novo.`);
    if (Number(ja.cabecalho.codigo_cliente) !== Number((payload.cabecalho as { codigo_cliente: number }).codigo_cliente)) {
      throw new ErroPedido(409, `Já existe na Omie o pedido ${codInt(pedido.id_pedido)} de OUTRO cliente. Confira na Omie.`);
    }
    resp = { numero_pedido: ja.cabecalho.numero_pedido, codigo_pedido: ja.cabecalho.codigo_pedido };
  }
  const numero = String(resp.numero_pedido || resp.codigo_pedido || '').trim();
  const { error } = await supabaseAdmin.from(T.pedidos).update({
    pedido_omie: numero, omie_codigo_pedido: resp.codigo_pedido || null, enviado_omie_em: new Date().toISOString(),
    empresa: acc.name, status: 'enviado_omie',
  }).eq('id', pedido.id);
  if (error) throw error;
  await log(pedido.id, `Enviado à Omie — pedido nº ${numero} (${acc.name})`, usuario, { avisos });
  return { numero, empresa: acc.name, avisos };
}

async function achar(pedido: PedidoMaquina): Promise<{ acc: OmieAccount; ped: OmiePedidoConsulta }> {
  const acc = contaDoPedido(pedido);
  const chave = pedido.omie_codigo_pedido ? { codigo_pedido: pedido.omie_codigo_pedido } : codInt(pedido.id_pedido);
  const ped = await consultarPedidoOmie(chave, acc);
  if (!ped?.cabecalho?.codigo_pedido) throw new ErroPedido(404, `Pedido não encontrado na Omie (${acc.name}).`);
  return { acc, ped };
}

export async function simularFaturamento(id: number | string) {
  const { pedido, itens } = await lerCompleto(id);
  if (!pedido.pedido_omie) throw new ErroPedido(409, 'Envie o pedido à Omie antes de faturar.');
  const { acc, ped } = await achar(pedido);
  const totalOmie = Number(ped.total_pedido?.valor_total_pedido || 0);
  const totalPortal = totalItens(itens);
  return {
    empresa: acc.name,
    numero: ped.cabecalho?.numero_pedido,
    etapa: ped.cabecalho?.etapa,
    jaFaturado: Number(ped.cabecalho?.etapa || 0) >= ETAPA_FATURADO,
    totalOmie, totalPortal,
    diverge: Math.round(totalOmie * 100) !== Math.round(totalPortal * 100),
    itens: (ped.det || []).map((d) => ({ descricao: d.produto?.descricao, quantidade: d.produto?.quantidade, valor: d.produto?.valor_total })),
  };
}

/** Fatura (emite a NF-e). Trava por lease de 10 min; nunca refatura às cegas. */
export async function faturarPedidoMaquina(id: number | string, usuario: string) {
  const { pedido } = await lerCompleto(id);
  if (pedido.faturado_omie_em) throw new ErroPedido(409, 'Pedido já faturado.');
  if (!pedido.pedido_omie) throw new ErroPedido(409, 'Envie o pedido à Omie antes de faturar.');

  const limite = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: travou } = await supabaseAdmin.from(T.pedidos)
    .update({ faturando_desde: new Date().toISOString() })
    .eq('id', pedido.id).is('faturado_omie_em', null)
    .or(`faturando_desde.is.null,faturando_desde.lt.${limite}`)
    .select('id');
  if (!travou?.length) throw new ErroPedido(409, 'Outro faturamento deste pedido está em andamento. Espere alguns minutos.');

  const soltar = () => supabaseAdmin.from(T.pedidos).update({ faturando_desde: null }).eq('id', pedido.id);
  try {
    const { acc, ped } = await achar(pedido);
    const nCodPed = Number(ped.cabecalho?.codigo_pedido);
    const marcar = async (nf?: string) => {
      await supabaseAdmin.from(T.pedidos).update({
        faturado_omie_em: new Date().toISOString(), faturado_por: usuario, status: 'faturado', faturando_desde: null,
        ...(nf ? { nf_numero: nf } : {}),
      }).eq('id', pedido.id);
      await log(pedido.id, `Faturado na Omie${nf ? ` — NF-e ${nf}` : ' (NF-e em autorização)'}`, usuario);
    };
    const nfDe = async () => {
      const nf = await buscarNFdoPedido(acc, nCodPed, Number(ped.cabecalho?.codigo_cliente) || undefined);
      const n = String(((nf?.ide || {}) as { nNF?: string }).nNF || '').replace(/^0+/, '');
      return n || undefined;
    };

    if (Number(ped.cabecalho?.etapa || 0) >= ETAPA_FATURADO) {
      const nf = await nfDe();
      if (!nf) throw new ErroPedido(409, 'O pedido já está na etapa de faturamento na Omie, mas sem NF-e autorizada. Veja o erro fiscal na Omie.');
      await marcar(nf);
      return { jaFaturado: true, nf };
    }

    const v = await omieNaConta<Record<string, unknown>>(acc, '/produtos/pedidovendafat/', 'ValidarPedidoVenda', { nCodPed }).catch(() => null);
    if (v && statusOmieErro(v)) throw new ErroPedido(422, `A Omie não deixa faturar: ${descricaoOmie(v)}`);

    try {
      const r = await omieNaConta<Record<string, unknown>>(acc, '/produtos/pedidovendafat/', 'FaturarPedidoVenda',
        { nCodPed, cCodIntPed: codInt(pedido.id_pedido) });
      if (statusOmieErro(r)) throw new ErroPedido(422, `A Omie recusou o faturamento: ${descricaoOmie(r)}`);
    } catch (e) {
      if (e instanceof ErroPedido) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/sem resposta|incert|AbortError|timeout/i.test(msg)) throw new ErroPedido(422, `A Omie recusou o faturamento: ${msg}`);
      // sem resposta: confere antes de dizer qualquer coisa
    }

    let confirmado = false;
    const chaves: Record<string, unknown>[] = [{ numero_pedido: String(ped.cabecalho?.numero_pedido || '') }, { codigo_pedido: nCodPed }, { codigo_pedido_integracao: codInt(pedido.id_pedido) }];
    for (const [i, ms] of [2000, 5000, 9000].entries()) {
      await new Promise((ok) => setTimeout(ok, ms));
      const d = await consultarPedidoOmie(chaves[i], acc).catch(() => null);
      const info = (d as unknown as { infoCadastro?: { faturado?: string } } | null)?.infoCadastro;
      if (d && (Number(d.cabecalho?.etapa || 0) >= ETAPA_FATURADO || info?.faturado === 'S')) { confirmado = true; break; }
    }
    if (!confirmado) {
      await soltar();
      await log(pedido.id, 'FaturarPedidoVenda enviado, mas o pedido ainda não aparece faturado na Omie', usuario);
      return { pendente: true, erro: 'A Omie ainda não mostra o pedido faturado. NÃO fature de novo agora: confira na Omie em alguns minutos.' };
    }
    const nf = await nfDe();
    await marcar(nf);
    return { nf, aguardandoSefaz: !nf };
  } catch (e) {
    await soltar();
    throw e;
  }
}

export async function cancelarPedidoMaquina(id: number | string, motivo: string, usuario: string) {
  const { pedido } = await lerCompleto(id);
  if (pedido.faturado_omie_em) throw new ErroPedido(409, 'Pedido faturado: cancele a NF-e na Omie.');
  if (!motivo.trim()) throw new ErroPedido(400, 'Informe o motivo.');
  if (pedido.pedido_omie) {
    const { acc, ped } = await achar(pedido);
    const r = await omieNaConta<Record<string, unknown>>(acc, '/produtos/pedidovendafat/', 'CancelarPedidoVenda', { nCodPed: Number(ped.cabecalho?.codigo_pedido) });
    if (statusOmieErro(r)) throw new ErroPedido(422, `A Omie não cancelou: ${descricaoOmie(r)}`);
  }
  await supabaseAdmin.from(T.pedidos).update({ status: 'cancelado', motivo_cancelamento: motivo.slice(0, 500) }).eq('id', pedido.id);
  await log(pedido.id, `Cancelado${pedido.pedido_omie ? ` (pedido Omie ${pedido.pedido_omie} cancelado)` : ''}: ${motivo}`, usuario);
  return { ok: true };
}
