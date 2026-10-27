// Padrões de uso (aba "Padrões" de /atividades): onde o usuário passa por várias
// telas para juntar as informações de um caso. Lê portal_uso_transicoes (jornada
// entre telas), audit_log (sequência de ações) e portal_uso_oportunidades
// (o que o admin decidiu). Mesmo gate de /api/uso/resumo: admin ou módulo
// `atividades` vê todo mundo; os outros só a si mesmos.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { resumirPadroes, type EventoAudit, type LinhaTransicao, type Oportunidade, type UsuarioNome } from '@/lib/uso/padroes';
import { descarregarUso, monitorLigado } from '@/lib/uso/buffer-server';
import { diaLocal } from '@/lib/uso/rota';
import { ehRotaVendas, resumirApp, type LinhaAppEvento } from '@/lib/uso/app-vendas';

export const dynamic = 'force-dynamic';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const TETO_EVENTOS = 30000;
type Resp<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

async function tudo<T>(montar: (de: number, ate: number) => Resp<T>, teto = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < teto; off += 1000) {
    const { data, error } = await montar(off, off + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const lote = data || [];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

const tabelaFaltando = (e: unknown) =>
  /PGRST205|42P01|schema cache|does not exist/i.test(`${(e as { code?: string })?.code || ''} ${(e as Error)?.message || ''}`);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const podeVerTodos = auth.isAdmin || auth.modulos.includes('atividades');

  const sp = req.nextUrl.searchParams;
  const hoje = diaLocal();
  const ate = ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : hoje;
  const dePadrao = new Date(new Date(ate + 'T12:00:00Z').getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const de = ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : dePadrao;
  const usuarioFiltro = podeVerTodos ? (sp.get('usuario') || '') : auth.userId;
  // Sistema: portal | vendas (app de vendas, rotas /vendas/...) | todos
  const app = ['portal', 'vendas', 'todos'].includes(sp.get('app') || '') ? sp.get('app')! : 'todos';

  try {
    if (monitorLigado()) await descarregarUso();

    let migracaoFaltando = false;
    const transicoes = await tudo<LinhaTransicao>((a, b) => {
      let q = supabaseAdmin.from('portal_uso_transicoes')
        .select('user_id,de,para,dia,n,n_mesmo_alvo,n_volta,n_rapida,soma_gap_s')
        .gte('dia', de).lte('dia', ate)
        .order('dia').order('user_id').order('de').order('para')
        .range(a, b);
      if (usuarioFiltro) q = q.eq('user_id', usuarioFiltro);
      return q as unknown as Resp<LinhaTransicao>;
    }).catch((e) => {
      if (tabelaFaltando(e)) { migracaoFaltando = true; return [] as LinhaTransicao[]; }
      throw e;
    });

    const transicoesDoApp = app === 'todos' ? transicoes
      : transicoes.filter((t) => (ehRotaVendas(t.de) || ehRotaVendas(t.para)) === (app === 'vendas'));

    // Atalhos e fluxos do app de vendas (sql/portal-uso-app.sql)
    let appEventos: LinhaAppEvento[] = [];
    let migracaoAppFaltando = false;
    if (app !== 'portal') {
      appEventos = await tudo<LinhaAppEvento>((a, b) => {
        let q = supabaseAdmin.from('portal_uso_app_eventos')
          .select('user_id,tipo,chave,detalhe,dia,n,soma_s')
          .gte('dia', de).lte('dia', ate)
          .order('dia').order('user_id').order('tipo').order('chave').order('detalhe')
          .range(a, b);
        if (usuarioFiltro) q = q.eq('user_id', usuarioFiltro);
        return q as unknown as Resp<LinhaAppEvento>;
      }).catch((e) => {
        if (tabelaFaltando(e)) { migracaoAppFaltando = true; return [] as LinhaAppEvento[]; }
        throw e;
      });
    }

    // Ações do audit_log são do portal: somem quando o filtro é só o app.
    const eventos = app === 'vendas' ? [] : await tudo<EventoAudit>((a, b) => {
      let q = supabaseAdmin.from('audit_log').select('user_id,sistema,acao,entidade,created_at')
        .gte('created_at', de + 'T00:00:00-03:00').lte('created_at', ate + 'T23:59:59-03:00')
        .order('id').range(a, b);
      if (usuarioFiltro) q = q.eq('user_id', usuarioFiltro);
      return q as unknown as Resp<EventoAudit>;
    }, TETO_EVENTOS);

    const { data: opData, error: opErr } = await supabaseAdmin.from('portal_uso_oportunidades').select('chave,status,nota,feito_em,por');
    if (opErr && !tabelaFaltando(opErr)) throw new Error(opErr.message);
    if (opErr) migracaoFaltando = true;

    const { data: usuData, error: usuErr } = await supabaseAdmin.from('financeiro_usu').select('id,nome');
    if (usuErr) throw new Error(usuErr.message);
    // Vendedores e supervisores do app de vendas não têm linha em financeiro_usu.
    const nomesApp: UsuarioNome[] = [];
    for (const tabela of ['vendedores', 'supervisores']) {
      const { data } = await supabaseAdmin.from(tabela).select('auth_uid,nome').not('auth_uid', 'is', null);
      for (const v of (data || []) as Array<{ auth_uid: string; nome: string }>) nomesApp.push({ id: v.auth_uid, nome: v.nome });
    }
    const usuarios = [...nomesApp, ...((usuData || []) as UsuarioNome[])];

    const r = resumirPadroes({
      transicoes: transicoesDoApp, eventos,
      oportunidades: (opData || []) as Oportunidade[],
      usuarios,
      de, ate,
    });
    const appResumo = app === 'portal' ? null : resumirApp(appEventos);
    return NextResponse.json({
      ...r,
      pares: r.pares.slice(0, 300),
      sequencias: r.sequencias.slice(0, 100),
      periodo: { de, ate },
      eventosLidos: eventos.length,
      eventosTruncados: eventos.length >= TETO_EVENTOS,
      migracaoFaltando, monitorLigado: monitorLigado(), podeVerTodos, podeEditar: podeVerTodos,
      app, appResumo, migracaoAppFaltando,
    });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message || 'Erro' }, { status: 500 });
  }
}
