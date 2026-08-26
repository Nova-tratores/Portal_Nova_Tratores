// Rastreio de peças — TODAS as transições de estado de uma unidade, numa rota
// só (a máquina de estados vive em lib/pecas/unidades-server.transicionar).
//
// body: { acao, destino_tipo?, destino_os?, obs?, motivo?, aplicar_direto? }
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
import { vincularUnidadeLiberadaAoPpvDaOS } from '@/lib/pecas/os-ppv';
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
      .select('id, numero, codigo, descricao, conta_omie, status, destino_tipo, destino_os, retirado_por, retirado_por_nome')
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

      const r = await transicionar(id, 'retirar', ator, {
        destino_tipo: destinoTipo,
        destino_os: destinoOs,
        destino_obs: String(body.obs || '').trim(),
      });

      const destinoTxt = destinoTipo === 'os' ? `OS ${destinoOs}` : DESTINO_LABEL[destinoTipo];
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

    // LIBEROU peça com destino OS → ela precisa virar venda em algum lugar.
    // Acha o PPV aberto da OS ou cria um vinculado, e lança a peça nele. Roda
    // DEPOIS da transição e nunca a desfaz: a peça já saiu do balcão, e um PPV
    // faltando é problema menor que estoque discordando da realidade.
    let vinculo: Awaited<ReturnType<typeof vincularUnidadeLiberadaAoPpvDaOS>> | null = null;
    if (acao === 'liberar' && u.destino_tipo === 'os' && u.destino_os) {
      vinculo = await vincularUnidadeLiberadaAoPpvDaOS(id, u, { ...ator, email: quem.email });
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
