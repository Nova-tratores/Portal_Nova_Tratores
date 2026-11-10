// Relatórios exportáveis de /financeiro/notas (José, 10/11/2026).
// Permissão ESPECIAL: financeiro:notas-relatorios (ação explícita — o "acesso total"
// ao Financeiro não dá; só quem for marcado no Admin, ou admin/dev).
// Toda exportação fica no audit_log (sistema 'financeiro', ação 'exportar_relatorio_notas')
// com o relatório, o formato, os filtros e quantas notas saíram.
// O servidor monta a tabela (mesmos filtros da tela); o navegador só gera o arquivo.
import { NextRequest, NextResponse } from 'next/server';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { permite } from '@/lib/permissoes/explicitas';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { podeVerEntrada } from '@/lib/notas/cache-regras';
import {
  RELATORIOS, descreverFiltros, ehFormatoRelatorio, ehTipoRelatorio, montarRelatorio, type LinhaRel,
} from '@/lib/notas/filtros-relatorios';
import { buscarTodasNotas, colsRelatorio, comFallback, lerParamsNotas, montarConsultaNotas } from '@/lib/notas/consulta-server';

export const dynamic = 'force-dynamic';

const TETO = 30000;

export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'financeiro', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;
  const u = guarda.user;
  if (!permite(u.modulos, u.isAdmin, 'financeiro', 'notas-relatorios')) {
    return NextResponse.json({ erro: 'Exportar relatórios precisa da permissão "Notas fiscais — exportar relatórios" (peça no Admin).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const relatorio = body?.relatorio;
  const formato = body?.formato;
  if (!ehTipoRelatorio(relatorio)) return NextResponse.json({ erro: 'Relatório inválido' }, { status: 400 });
  if (!ehFormatoRelatorio(formato)) return NextResponse.json({ erro: 'Formato inválido' }, { status: 400 });

  const sp = new URLSearchParams(typeof body?.filtros === 'string' ? body.filtros : '');
  const p = lerParamsNotas(sp, podeVerEntrada(u.isAdmin, u.modulos));

  try {
    // descobre quais migrations opcionais existem com uma consulta barata
    const { res: sonda, faltando } = await comFallback((f) => montarConsultaNotas(p, f, { cols: colsRelatorio(f) }).limit(1));
    if (sonda.error) throw new Error(sonda.error.message);
    const { linhas, total, excedeu } = await buscarTodasNotas<LinhaRel>(p, faltando, colsRelatorio(faltando), TETO);
    if (excedeu) {
      return NextResponse.json({ erro: `O filtro tem ${total.toLocaleString('pt-BR')} notas — o relatório vai até ${TETO.toLocaleString('pt-BR')}. Diminua o período ou filtre mais.` }, { status: 413 });
    }
    const r = montarRelatorio(relatorio, linhas);
    const aba = p.tipo === 'entrada' ? 'entrada' : p.tipo === '' ? 'todas' : 'saida';
    const filtros = descreverFiltros({ conta: p.conta, aba, de: p.de, ate: p.ate, q: p.q, campo: p.campo, filtros: p.filtros });
    const nome = RELATORIOS.find((x) => x.id === relatorio)?.nome || relatorio;

    // sem log, sem relatório: a exportação só sai se ficou registrada
    const log = await supabaseAdmin.from('audit_log').insert([{
      user_id: u.id, user_nome: autorDe(u), sistema: 'financeiro', acao: 'exportar_relatorio_notas',
      entidade: 'notas_fiscais_docs', entidade_id: relatorio, entidade_label: `Notas fiscais — ${nome} (${formato.toUpperCase()})`,
      detalhes: { relatorio, formato, filtros, parametros: sp.toString(), notas: linhas.length, linhas: r.linhas.length },
    }]);
    if (log.error) return NextResponse.json({ erro: `Não foi possível registrar a exportação no log (${log.error.message}). Tente de novo.` }, { status: 500 });

    return NextResponse.json({ relatorio: r, filtros, notas: linhas.length, geradoPor: autorDe(u), geradoEm: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
