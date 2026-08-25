// Rastreio — liberação em LOTE (tela de liberação do PPV e fila do depto):
// um POST libera N unidades reservadas, registrando QUEM está pegando
// (retirado_por = usuário do portal escolhido na tela). Falha parcial não
// aborta o lote — cada erro volta em erros[].
//
// PPV já faturado: a liberação tardia vai DIRETO a 'aplicada' (aplicarDireto)
// — a peça saiu na NF, só faltava a confirmação física.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { httpErr } from '@/lib/ajustes/cmc';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { transicionar, notificarUsuario } from '@/lib/pecas/unidades-server';
import { buscarCabecalhoPPV, ppvFaturado, saldoPorCodigo } from '@/lib/pecas/ppv-vinculo';
import { norm, type PecaUnidade } from '@/lib/pecas/unidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const quem = await exigirPermissao(req, 'ppv', 'rastreio_liberar');
    const body = await req.json().catch(() => ({}));

    const ids: string[] = Array.isArray(body.unidade_ids)
      ? body.unidade_ids.map((x: unknown) => String(x)).filter((x: string) => UUID_RE.test(x))
      : [];
    if (ids.length === 0) throw httpErr(400, 'Nenhuma unidade válida no lote.');
    if (ids.length > 100) throw httpErr(400, 'Máximo de 100 unidades por lote.');

    const retiradorId = String(body.retirado_por_user_id || '').trim();
    if (!retiradorId) throw httpErr(400, 'Informe quem está pegando as peças.');
    const { data: usu } = await supabase
      .from('financeiro_usu')
      .select('id, nome')
      .eq('id', retiradorId)
      .maybeSingle();
    if (!usu) throw httpErr(400, 'Retirador não encontrado — escolha um usuário do portal.');
    const retirador = { id: (usu as any).id as string, nome: String((usu as any).nome || 'Usuário') };

    const idPPV = String(body.id_ppv || '').trim() || null;
    // destino 'ppv': o aplicar-direto NUNCA vem do cliente — só do faturamento
    // comprovado no servidor (senão um curl tiraria a peça do radar "saiu sem
    // NF" da conferência). Pra balcão/uso interno o body ainda vale.
    const aplicarDiretoBody = body.aplicar_direto === true;
    let ppvEstaFaturado = false;
    // preço final por código (o que saiu na NF) pra gravar na aplicação tardia
    let precoPorCod: Map<string, { preco: number | null }> | null = null;
    if (idPPV) {
      const cab = await buscarCabecalhoPPV(idPPV);
      ppvEstaFaturado = !!cab && ppvFaturado(cab);
      if (ppvEstaFaturado) {
        const { data: movs } = await supabase
          .from('movimentacoes')
          .select('TipoMovimento, CodProduto, Qtde, Preco')
          .eq('Id_PPV', idPPV);
        precoPorCod = saldoPorCodigo((movs as any[]) || []);
      }
    }

    const { data: rows } = await supabase.from('peca_unidades').select('*').in('id', ids);
    const porId = new Map(((rows as PecaUnidade[]) || []).map((u) => [u.id, u]));

    const ator = { id: quem.id, nome: quem.nome || quem.email || 'Usuário' };
    let liberadas = 0;
    let aplicadasDireto = 0;
    const erros: { unidade_id: string; numero?: string; erro: string }[] = [];

    for (const id of ids) {
      const u = porId.get(id);
      if (!u) { erros.push({ unidade_id: id, erro: 'não encontrada' }); continue; }
      if (u.status !== 'retirada_pendente') {
        erros.push({ unidade_id: id, numero: u.numero, erro: `status ${u.status}` });
        continue;
      }
      if (idPPV && u.destino_ppv !== idPPV) {
        erros.push({ unidade_id: id, numero: u.numero, erro: `não pertence ao ${idPPV}` });
        continue;
      }
      try {
        const ehPpv = u.destino_tipo === 'ppv';
        const item = precoPorCod ? (precoPorCod.get(norm(u.codigo)) || precoPorCod.get(norm(u.alt_codigo))) : null;
        const r = await transicionar(id, 'liberar', ator, {
          retirador,
          aplicarDireto: ehPpv ? ppvEstaFaturado : aplicarDiretoBody,
          faturadoConfirmado: ehPpv && ppvEstaFaturado,
          ...(idPPV ? { esperaDestinoPpv: idPPV } : {}),
          ...(ehPpv && ppvEstaFaturado && item?.preco != null ? { venda_preco: item.preco } : {}),
          payload: { origem: idPPV ? 'ppv_lote' : 'lote', ...(idPPV ? { ppv: idPPV } : {}), retirado_por_nome: retirador.nome },
        });
        liberadas += 1;
        if (r.para === 'aplicada') aplicadasDireto += 1;
      } catch (e) {
        erros.push({ unidade_id: id, numero: u.numero, erro: e instanceof Error ? e.message : 'erro' });
      }
    }

    // UMA notificação pro retirador (não N)
    if (liberadas > 0 && retirador.id !== quem.id) {
      await notificarUsuario(retirador.id, {
        titulo: idPPV
          ? `${idPPV}: ${liberadas} peça(s) liberada(s) para você`
          : `${liberadas} peça(s) liberada(s) para você`,
        descricao: `Liberadas por ${ator.nome}. Pode levar as peças.`,
        link: idPPV ? `/ppv?id=${idPPV}` : '/ppv/unidades',
      });
    }

    return NextResponse.json({ ok: true, liberadas, aplicadas_direto: aplicadasDireto, erros });
  } catch (e) {
    const status = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status });
  }
}
