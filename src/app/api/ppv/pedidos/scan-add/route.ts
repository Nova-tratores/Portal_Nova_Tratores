// PPV × rastreio — SCAN de uma unidade (QR) no contexto de um PPV:
//   - unidade em estoque + código JÁ é item do pedido → apenas RESERVA
//     (apenas_vincular: true — não duplica quantidade);
//   - unidade em estoque + código NOVO → adiciona a movimentação (Saída, 1 un,
//     preço do catálogo) E reserva ("adicionar peça escaneando o QR");
//   - unidade já reservada NESTE PPV → { ja_vinculada: true } (scan repetido).
//
// Ordem: RESERVA PRIMEIRO (guarda .eq status resolve corrida entre 2 PPVs),
// depois a movimentação; se o insert falhar, compensa com cancelar_retirada.
// Crash entre os passos deixa a unidade reservada sem item — estado DETECTÁVEL
// na conferência (rastreio_excedente), nunca silencioso.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { httpErr } from '@/lib/ajustes/cmc';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { transicionar } from '@/lib/pecas/unidades-server';
import { buscarCabecalhoPPV, saldoPorCodigo, CONTA_TO_EMPRESA, PPV_STATUS_TERMINAIS } from '@/lib/pecas/ppv-vinculo';
import { norm, type PecaUnidade } from '@/lib/pecas/unidades';
import { supabaseFetch, formatarDataBR } from '@/lib/ppv/supabase';
import { TBL_ITENS } from '@/lib/ppv/constants';
import { atualizarValorTotal, registrarLog } from '@/lib/ppv/queries';
import { logAndNotify } from '@/lib/server/audit-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idPPV = String(body.id_ppv || '').trim();
    const unidadeId = String(body.unidade_id || '').trim();
    const apenasVincular = body.apenas_vincular === true;

    // vincular a item existente = ação de liberador; criar item novo = adicionar_item
    const quem = apenasVincular
      ? await exigirAlguma(req, ['rastreio_liberar', 'adicionar_item'])
      : await exigirPermissao(req, 'ppv', 'adicionar_item');

    if (!idPPV) throw httpErr(400, 'Informe o PPV.');
    if (!UUID_RE.test(unidadeId)) throw httpErr(400, 'Unidade inválida.');

    // ---- unidade ----
    const { data: uRow } = await supabase.from('peca_unidades').select('*').eq('id', unidadeId).maybeSingle();
    if (!uRow) throw httpErr(404, 'Etiqueta não encontrada.');
    const u = uRow as PecaUnidade;

    if (u.status === 'retirada_pendente' && u.destino_ppv === idPPV) {
      return NextResponse.json({ ok: true, ja_vinculada: true, unidade: resumo(u) });
    }
    if (u.status !== 'estoque') {
      const onde = u.destino_ppv ? ` (${u.destino_ppv})` : u.destino_os ? ` (OS ${u.destino_os})` : '';
      throw httpErr(409, `${u.numero} não está em estoque — status: ${u.status}${onde}.`);
    }

    // ---- PPV ----
    const cab = await buscarCabecalhoPPV(idPPV);
    if (!cab) throw httpErr(404, `PPV ${idPPV} não encontrado.`);
    const eraTerminal = PPV_STATUS_TERMINAIS.includes(String(cab.status || ''));
    const eraCancelado = /^Cancel/i.test(String(cab.status || ''));
    const tinhaOmie = !!cab.pedido_omie;

    // ---- empresa (NOVA/CASTRO × Nova Tratores/Castro Peças) ----
    const empresas = [CONTA_TO_EMPRESA[norm(u.conta_omie)], CONTA_TO_EMPRESA[norm(u.alt_conta_omie)]].filter(Boolean);
    let avisoEmpresa: string | undefined;
    if (cab.omie_empresa) {
      if (empresas.length > 0 && !empresas.includes(cab.omie_empresa)) {
        throw httpErr(400, `Peça da ${empresas[0]} — este PPV é da ${cab.omie_empresa}.`);
      }
    } else if (empresas.length === 1) {
      avisoEmpresa = `Peça da ${empresas[0]} — confira a empresa do pedido antes de enviar ao Omie.`;
    }

    // ---- item do pedido / preço (ANTES dos guards de congelamento: o vínculo
    // puro precisa saber se o código tem saldo mesmo em PPV já enviado) ----
    const { data: movs } = await supabase
      .from('movimentacoes')
      .select('TipoMovimento, CodProduto, Descricao, Qtde, Preco')
      .eq('Id_PPV', idPPV);
    const porCod = saldoPorCodigo((movs as any[]) || []);
    const itemExistente = porCod.get(norm(u.codigo)) || porCod.get(norm(u.alt_codigo));
    const temSaldo = !!itemExistente && itemExistente.saldo > 0;
    const vaiVincularSo = apenasVincular && temSaldo;

    // Congelamento: vale pra quem vai CRIAR movimentação. O vínculo puro
    // (apenas_vincular com saldo) é permitido em PPV enviado/faturado — é a
    // liberação tardia de unidade nunca reservada. Cancelado bloqueia sempre.
    if (eraCancelado) throw httpErr(400, `${idPPV} está ${cab.status} — não aceita mais peças.`);
    if (!vaiVincularSo) {
      if (eraTerminal) throw httpErr(400, `${idPPV} está ${cab.status} — não aceita mais peças.`);
      if (tinhaOmie) throw httpErr(400, `${idPPV} já foi enviado ao Omie — os itens estão congelados.`);
    }

    // preço: body só vale no caminho que CRIA item (adicionar_item), nunca
    // negativo — todos os outros pontos de entrada validam com z.min(0)
    const precoBody = Number(body.preco);
    let preco: number = !apenasVincular && Number.isFinite(precoBody) && precoBody >= 0 ? precoBody : 0;
    if (!preco && itemExistente?.preco != null) preco = Math.max(0, itemExistente.preco);
    if (!preco) {
      // catálogo: prefere a linha da empresa da unidade
      const { data: prods } = await supabase
        .from('Produtos_Completos')
        .select('Preco_Venda, Empresa')
        .eq('Codigo_Produto', u.codigo)
        .limit(10);
      const lista = (prods as any[]) || [];
      const daEmpresa = lista.find((p) => empresas.includes(String(p.Empresa || '')));
      preco = Math.max(0, Number((daEmpresa || lista[0])?.Preco_Venda) || 0);
    }

    if (apenasVincular && !temSaldo) {
      // a tela pediu só vínculo mas o código não tem saldo no pedido — devolve
      // o contexto pra UI oferecer "adicionar item" (não decide sozinho)
      return NextResponse.json(
        { error: `${u.codigo} não está neste pedido.`, codigo_fora_do_ppv: true, unidade: resumo(u), preco_sugerido: preco },
        { status: 422 },
      );
    }

    // ---- 1) RESERVA (guarda de concorrência dentro do transicionar) ----
    await transicionar(unidadeId, 'reservar_ppv', { id: quem.id, nome: quem.nome || quem.email || 'Usuário' }, {
      destino_ppv: idPPV,
      destino_obs: `Reservada no ${idPPV}`,
      venda_preco: preco || null,
      payload: { origem: 'ppv_scan', ppv: idPPV, ...(vaiVincularSo ? { apenas_vinculo: true } : {}) },
    });

    // ---- 2) movimentação (só quando o item é novo no pedido). A compensação
    // cobre SÓ o insert — log/total vêm depois, não-fatais (se entrassem no
    // try, uma falha DELES desfaria a reserva com o item já gravado: item
    // órfão + duplicação no re-scan) ----
    const soltarReserva = async (motivo: string, origem: string) => {
      try {
        await transicionar(unidadeId, 'cancelar_retirada', { id: quem.id, nome: quem.nome || 'Usuário' }, {
          motivo,
          payload: { origem, ppv: idPPV },
        });
      } catch { /* fica reservada — conferência acusa e a fila resolve manual */ }
    };
    const linhaMov = (tipo: 'Saída' | 'Devolução') => ({
      Id: Math.floor(Math.random() * 9000000000) + 1000000000,
      Id_PPV: idPPV,
      Data_Hora: formatarDataBR(new Date().toISOString(), true),
      Tecnico: String(cab.tecnico || ''),
      TipoMovimento: tipo,
      CodProduto: u.codigo,
      Descricao: u.descricao || '',
      Qtde: '1',
      Preco: preco,
    });

    let itemCriado = false;
    if (!vaiVincularSo) {
      try {
        await supabaseFetch(TBL_ITENS, 'POST', [linhaMov('Saída')]);
        itemCriado = true;
      } catch (e) {
        await soltarReserva('rollback do scan-add (falha ao gravar o item)', 'rollback_scan_add');
        throw httpErr(500, `Falha ao gravar o item no pedido: ${e instanceof Error ? e.message : e}`);
      }
    }

    // ---- 3) TOCTOU: envio ao Omie / cancelamento pode ter corrido em paralelo
    // (o envio congela os itens no payload; um item que entrou no meio ficaria
    // fora da NF sem NENHUMA flag). Re-lê o cabeçalho e desfaz se mudou. ----
    const cabDepois = await buscarCabecalhoPPV(idPPV);
    const congelouAgora = !tinhaOmie && !!cabDepois?.pedido_omie;
    const cancelouAgora = !eraCancelado && /^Cancel/i.test(String(cabDepois?.status || ''));
    if (congelouAgora || cancelouAgora) {
      if (itemCriado) {
        try { await supabaseFetch(TBL_ITENS, 'POST', [linhaMov('Devolução')]); } catch { /* saldo fica errado mas o log abaixo registra */ }
      }
      await soltarReserva(
        congelouAgora ? 'PPV enviado ao Omie durante o scan' : 'PPV cancelado durante o scan',
        'rollback_scan_add',
      );
      try { await registrarLog(idPPV, `Scan de ${u.numero} desfeito (${congelouAgora ? 'pedido enviado ao Omie durante o scan' : 'pedido cancelado durante o scan'})`, quem.nome || 'Sistema'); } catch { /* segue */ }
      try { await atualizarValorTotal(idPPV); } catch { /* segue */ }
      throw httpErr(409, congelouAgora
        ? `${idPPV} foi enviado ao Omie durante o scan — a peça NÃO entrou na NF; lance num pedido novo.`
        : `${idPPV} foi cancelado durante o scan.`);
    }

    // ---- 4) log/total — não-fatais (o item/reserva já estão consistentes)
    if (itemCriado) {
      try { await registrarLog(idPPV, `Adicionou item por QR: 1 un de ${u.codigo} (${u.numero})`, quem.nome || 'Sistema'); } catch { /* segue */ }
      try { await atualizarValorTotal(idPPV); } catch { /* recalculado no próximo item */ }
    } else {
      try { await registrarLog(idPPV, `Reservou unidade ${u.numero} (${u.codigo}) por QR`, quem.nome || 'Sistema'); } catch { /* segue */ }
    }

    try {
      await logAndNotify({
        userName: quem.nome || 'Sistema', sistema: 'ppv', acao: 'adicionar_item',
        entidade: 'pedido', entidadeId: idPPV, entidadeLabel: `PPV ${idPPV}`,
        detalhes: { codigo: u.codigo, unidade: u.numero, por_qr: true, item_criado: itemCriado, preco },
        notifTitulo: `PPV ${idPPV}: peça escaneada`,
        notifDescricao: `${quem.nome || 'Usuário'} ${itemCriado ? 'adicionou' : 'reservou'} ${u.codigo} (${u.numero}) por QR`,
        notifLink: `/ppv?id=${idPPV}`,
      });
    } catch { /* best-effort */ }

    return NextResponse.json({
      ok: true,
      unidade: { ...resumo(u), status: 'retirada_pendente' },
      item_criado: itemCriado,
      preco,
      ...(avisoEmpresa ? { aviso_empresa: avisoEmpresa } : {}),
    });
  } catch (e) {
    const status = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status });
  }
}

function resumo(u: PecaUnidade) {
  return { id: u.id, numero: u.numero, codigo: u.codigo, descricao: u.descricao, conta_omie: u.conta_omie };
}

// aceita quem tem QUALQUER uma das ações granulares (ou o módulo puro/admin)
async function exigirAlguma(req: Request, acoes: string[]) {
  let ultimo: unknown;
  for (const acao of acoes) {
    try {
      return await exigirPermissao(req, 'ppv', acao);
    } catch (e) {
      ultimo = e;
      if ((e as { http?: number })?.http === 401) throw e; // sem sessão não adianta tentar outra ação
    }
  }
  throw ultimo;
}
