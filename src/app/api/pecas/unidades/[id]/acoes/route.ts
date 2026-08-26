// Rastreio de peças — TODAS as transições de estado de uma unidade, numa rota
// só (a máquina de estados vive em lib/pecas/unidades-server.transicionar).
//
// body: { acao, destino_tipo?, destino_os?, destino_ppv?, ppv_novo?, obs?,
//         motivo?, aplicar_direto? }
//
// Na RETIRADA com destino venda balcão / uso interno a pessoa diz em que
// pedido a peça vai entrar: `destino_ppv` (um PPV já aberto) OU `ppv_novo`
// ({cliente, documento?, tecnico?}) pra abrir um. O pedido novo só nasce na
// LIBERAÇÃO — retirada recusada não deixa pedido vazio pra trás.
//
// Quem pode o quê:
//  - retirar: qualquer usuário autenticado (portal ou app dos mecânicos)
//  - cancelar_retirada / devolver: o próprio retirador OU quem libera
//  - liberar / recusar / concluir / receber_devolucao / cancelar / extraviar /
//    recuperar: pode('ppv','rastreio_liberar') — ppv puro, granular ou admin/dev
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { httpErr } from '@/lib/ajustes/cmc';
import {
  exigirSessao,
  podeLiberarUnidades,
  transicionar,
  notificarResponsaveisPecas,
  notificarUsuario,
} from '@/lib/pecas/unidades-server';
import { destinoTemPpv, ppvAceitaItem, vincularUnidadeLiberadaAoPpv } from '@/lib/pecas/os-ppv';
import { DESTINO_LABEL, type DestinoTipo, type UnidadeAcao } from '@/lib/pecas/unidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACOES_DE_LIBERADOR: UnidadeAcao[] = ['liberar', 'recusar', 'concluir', 'receber_devolucao', 'cancelar', 'extraviar', 'recuperar'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Unidade inválida.' }, { status: 400 });

    const quem = await exigirSessao(req);
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || '') as UnidadeAcao;

    const { data: unidade } = await supabase
      .from('peca_unidades')
      .select('id, numero, codigo, descricao, conta_omie, status, destino_tipo, destino_os, destino_ppv, retirado_por, retirado_por_nome')
      .eq('id', id)
      .maybeSingle();
    if (!unidade) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
    const u = unidade as any;

    // ---- autorização por ação ----
    const liberador = await podeLiberarUnidades(quem.id);
    if (ACOES_DE_LIBERADOR.includes(acao) && !liberador) {
      throw httpErr(403, 'Sem permissão para esta ação (peça ao departamento de peças).');
    }
    if ((acao === 'cancelar_retirada' || acao === 'devolver') && !liberador && u.retirado_por !== quem.id) {
      throw httpErr(403, 'Só quem retirou (ou o departamento de peças) pode fazer isso.');
    }
    if (acao === 'aplicar_cron' || acao === 'devolver_cron' || acao === 'aplicar_faturamento') {
      throw httpErr(400, 'Ação reservada ao sistema.');
    }
    if (acao === 'reservar_ppv') {
      // reserva pro PPV só pela rota dedicada (valida PPV/empresa/movimentação)
      throw httpErr(400, 'Use a tela de liberação do PPV para reservar unidades.');
    }

    const ator = { id: quem.id, nome: quem.nome };
    const etiqueta = `${u.numero} · ${u.codigo}`;

    if (acao === 'retirar') {
      const destinoTipo = String(body.destino_tipo || '') as DestinoTipo;
      if (!['os', 'balcao', 'uso_interno'].includes(destinoTipo)) {
        throw httpErr(400, 'Informe o destino: OS, venda balcão ou uso interno.');
      }
      let destinoOs: string | null = null;
      if (destinoTipo === 'os') {
        destinoOs = String(body.destino_os || '').trim();
        if (!destinoOs) throw httpErr(400, 'Informe a OS de destino.');
        const { data: os } = await supabase
          .from('Ordem_Servico')
          .select('Id_Ordem')
          .eq('Id_Ordem', destinoOs)
          .maybeSingle();
        if (!os) throw httpErr(400, `OS ${destinoOs} não encontrada.`);
      }

      // balcão / uso interno: a peça também vira linha de um pedido. Ou a
      // pessoa aponta um aberto agora, ou diz pra qual cliente abrir um.
      // (Na OS o pedido é o da própria OS — resolvido na liberação.)
      let destinoPpv: string | null = null;
      let ppvNovo: { cliente: string; documento: string; tecnico: string } | null = null;
      if (destinoTipo === 'balcao' || destinoTipo === 'uso_interno') {
        destinoPpv = String(body.destino_ppv || '').trim() || null;
        if (destinoPpv) {
          const { data: cab } = await supabase
            .from('pedidos')
            .select('id_pedido, status, Tipo_Pedido, pedido_omie, faturado_omie_em')
            .eq('id_pedido', destinoPpv)
            .maybeSingle();
          if (!cab) throw httpErr(400, `Pedido ${destinoPpv} não encontrado.`);
          if (!ppvAceitaItem(cab as any)) {
            throw httpErr(400, `Pedido ${destinoPpv} já foi faturado ou fechado — escolha outro ou crie um novo.`);
          }
        } else {
          const n = (body.ppv_novo || {}) as Record<string, unknown>;
          const cliente = String(n.cliente || '').trim();
          if (!cliente) {
            throw httpErr(400, 'Escolha um pedido aberto ou informe o cliente para abrir um novo.');
          }
          ppvNovo = {
            cliente,
            documento: String(n.documento || '').trim(),
            tecnico: String(n.tecnico || '').trim(),
          };
        }
      }

      const r = await transicionar(id, 'retirar', ator, {
        destino_tipo: destinoTipo,
        destino_os: destinoOs,
        destino_ppv: destinoPpv,
        destino_obs: String(body.obs || '').trim(),
        // o pedido novo só nasce na liberação; até lá o pedido dele mora aqui
        ...(ppvNovo ? { payload: { ppv_novo: ppvNovo } } : {}),
      });

      const destinoTxt = destinoTipo === 'os'
        ? `OS ${destinoOs}`
        : `${DESTINO_LABEL[destinoTipo]}${destinoPpv ? ` · ${destinoPpv}` : ppvNovo ? ` · pedido novo para ${ppvNovo.cliente}` : ''}`;
      await notificarResponsaveisPecas({
        titulo: `Retirada aguardando liberação — ${u.numero}`,
        descricao: `${u.codigo} · ${u.descricao || ''} · por ${quem.nome} · destino: ${destinoTxt}`,
        link: '/ppv/unidades',
        excluirUserId: quem.id,
      });
      return NextResponse.json({ ok: true, status: r.para });
    }

    // demais ações — destino 'ppv' nunca aplica direto por aqui (só o
    // liberar-lote, que comprova o faturamento; senão vira "vendida" sem NF)
    const extras = {
      motivo: String(body.motivo || '').trim() || undefined,
      aplicarDireto: body.aplicar_direto === true && u.destino_tipo !== 'ppv',
    };
    const r = await transicionar(id, acao, ator, extras);

    // LIBEROU a peça → ela precisa virar venda em algum lugar. Acha o pedido
    // (o aberto da OS, ou o que a pessoa apontou na retirada) ou cria um, e
    // lança a peça nele. Roda DEPOIS da transição e nunca a desfaz: a peça já
    // saiu do balcão, e um PPV faltando é problema menor que estoque
    // discordando da realidade. Destino 'ppv' fica de fora — lá a peça já foi
    // escaneada dentro do pedido, quem cuida é a conferência.
    let vinculo: Awaited<ReturnType<typeof vincularUnidadeLiberadaAoPpv>> | null = null;
    if (acao === 'liberar' && destinoTemPpv(u.destino_tipo)) {
      vinculo = await vincularUnidadeLiberadaAoPpv(id, u, { ...ator, email: quem.email });
    }

    // notificações direcionadas
    if (acao === 'liberar' && u.retirado_por && u.retirado_por !== quem.id) {
      await notificarUsuario(u.retirado_por, {
        titulo: `Retirada liberada — ${etiqueta}`,
        descricao: `Liberada por ${quem.nome}. Pode levar a peça.`,
        link: `/p/${id}`,
      });
    }
    if (acao === 'recusar' && u.retirado_por && u.retirado_por !== quem.id) {
      await notificarUsuario(u.retirado_por, {
        titulo: `Retirada recusada — ${etiqueta}`,
        descricao: extras.motivo ? `Motivo: ${extras.motivo}` : 'Procure o departamento de peças.',
        link: `/p/${id}`,
      });
    }
    if (acao === 'devolver') {
      await notificarResponsaveisPecas({
        titulo: `Devolução para conferir — ${etiqueta}`,
        descricao: `${quem.nome} marcou a peça para devolução.`,
        link: '/ppv/unidades',
        excluirUserId: quem.id,
      });
    }

    return NextResponse.json({
      ok: true,
      status: r.para,
      ...(vinculo?.ppv ? { ppv: vinculo.ppv, ppvCriado: vinculo.criado } : {}),
      ...(vinculo?.aviso ? { aviso: vinculo.aviso } : {}),
    });
  } catch (e) {
    const status = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status });
  }
}
