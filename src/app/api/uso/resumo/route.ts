// Resumo de uso por usuário / página / módulo / dia (aba "Uso" de /atividades).
// Admin vê todo mundo; usuário comum só a si mesmo. Lê as tabelas agregadas
// (portal_uso_*) paginando de 1000 em 1000 (teto do PostgREST).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { resumirUso, type LinhaApi, type LinhaPagina, type LinhaPresenca, type Usuario } from '@/lib/uso/resumo';
import { descarregarUso, monitorLigado } from '@/lib/uso/buffer-server';
import { diaLocal } from '@/lib/uso/rota';

export const dynamic = 'force-dynamic';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

async function tudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < 50000; off += 1000) {
    const { data, error } = await montar(off, off + 999);
    if (error) throw new Error(error.message);
    const lote = data || [];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

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

  try {
    // Garante que o que está no buffer (até 60 s) entre na leitura.
    if (monitorLigado()) await descarregarUso();

    const base = <T,>(tabela: string, cols: string) => (a: number, b: number) => {
      let q = supabaseAdmin.from(tabela).select(cols).gte('dia', de).lte('dia', ate).order('dia', { ascending: false }).range(a, b);
      if (usuarioFiltro) q = q.eq('user_id', usuarioFiltro);
      return q as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
    };
    const [paginas, api, presRaw, usuRaw] = await Promise.all([
      tudo<LinhaPagina>(base<LinhaPagina>('portal_uso_paginas', 'user_id,rota,dia,acessos,ultimo_em')),
      tudo<LinhaApi>(base<LinhaApi>('portal_uso_api', 'user_id,rota,dia,chamadas,ultimo_em')),
      supabaseAdmin.from('portal_uso_presenca').select('user_id,rota,ultimo_em'),
      supabaseAdmin.from('financeiro_usu').select('id,nome,funcao,ativo').order('nome'),
    ]);
    if (presRaw.error) throw new Error(presRaw.error.message);
    if (usuRaw.error) throw new Error(usuRaw.error.message);
    let presenca = (presRaw.data || []) as LinhaPresenca[];
    let usuarios = (usuRaw.data || []) as Usuario[];
    if (usuarioFiltro) {
      presenca = presenca.filter((p) => p.user_id === usuarioFiltro);
      usuarios = usuarios.filter((u) => u.id === usuarioFiltro);
    }

    const resumo = resumirUso({ paginas, api, presenca, usuarios, de, ate, incluirSemUso: podeVerTodos && !usuarioFiltro });
    return NextResponse.json({ ...resumo, monitorLigado: monitorLigado(), podeVerTodos });
  } catch (e) {
    const msg = (e as Error).message || '';
    // Tabela ainda não criada (migration sql/portal-uso.sql não aplicada).
    if (/portal_uso_|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json({ erro: 'Monitor de uso ainda não instalado no banco (aplicar sql/portal-uso.sql).', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
