// Pendências REGISTRADAS da frota (tabela frota_pendencias) — com rastro
// completo: quem abriu e quando, quem resolveu, quando e como, e o vínculo
// com a Requisição ou a OS do Pós usada pra resolver.
//
// TODA pendência vira registro aqui — inclusive as automáticas (cadastro,
// checklist, requisição "Veicular Manutenção" e OS do Pós com o projeto do
// carro). O motor que abre/fecha sozinho é lib/frota/pendencias-sync.
//
//   GET  [?placa=XXX][&sync=1]      -> pendências (sync roda a sincronização antes)
//   POST { placa, titulo, ... }     -> abrir pendência manual (km/responsável opcionais)
//   PATCH { id, acao:'resolver' }   -> resolver com resolução + vínculo
//   PATCH { id, acao:'classificar' }-> definir o componente da taxonomia
// Migration: sql/frota-pendencias.sql (v1 + alters v2).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloPendencias } from '@/lib/frota/server';
import { sincronizarPendencias } from '@/lib/frota/pendencias-sync';
import { ehGravidade } from '@/lib/frota/gravidade';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

async function nomeDoUsuario(userId: string, email: string | null): Promise<string> {
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle();
  return data?.nome || email || 'Usuário do portal';
}

const erroTabela = (msg: string) =>
  /relation .* does not exist/i.test(msg)
    ? 'Tabelas de pendências ainda não criadas — aplique sql/frota-pendencias.sql no Supabase.'
    : msg;

// '*' e não a lista de colunas: a coluna `gravidade` chega pela migração
// sql/frota-gravidade-e-checklist.sql, e o deploy é automático a partir do main.
// Com a lista explícita, pedir uma coluna que ainda não existe derruba a tela
// inteira de pendências até alguém rodar o SQL; com '*' a tela funciona nos
// dois momentos — antes da migração cada pendência só cai no padrão do
// componente (lib/frota/gravidade.ts).
const SELECT_PEND = '*';

/**
 * Grava respeitando a possibilidade de a coluna `gravidade` ainda não existir.
 *
 * Mesmo motivo do SELECT '*': o deploy sai do main automaticamente e a migração
 * é rodada à mão. Abrir a pendência importa mais que classificar o risco —
 * então, se o banco não conhecer a coluna, a operação vai adiante SEM ela em
 * vez de falhar. Quando a migração roda, passa a gravar normalmente, sem
 * mudança de código.
 */
type Escrita = { data: unknown; error: { message: string } | null };
async function gravarComGravidade(
  executar: (extra: Record<string, unknown>) => PromiseLike<Escrita>,
  gravidadeBruta: unknown,
): Promise<Escrita> {
  const g = ehGravidade(gravidadeBruta) ? gravidadeBruta : null;
  if (g === null) return executar({});
  const r = await executar({ gravidade: g });
  if (r.error && /gravidade/i.test(r.error.message) && /column|coluna/i.test(r.error.message)) {
    return executar({});
  }
  return r;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (req.nextUrl.searchParams.get('sync') === '1') {
    try { await sincronizarPendencias(); } catch { /* o select abaixo reporta o problema real */ }
  }

  const placa = req.nextUrl.searchParams.get('placa');
  let q = supabase.from('frota_pendencias').select(SELECT_PEND).order('aberta_em', { ascending: false });
  if (placa) q = q.eq('placa', placa);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: erroTabela(error.message) }, { status: 500 });
  return NextResponse.json({ pendencias: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const placa = String(body.placa || '').trim().toUpperCase();
  const titulo = String(body.titulo || '').trim();
  const responsavel = String(body.responsavel || '').trim();
  if (!placa || !titulo) return NextResponse.json({ error: 'Placa e título são obrigatórios.' }, { status: 400 });
  // responsável = usuário do PORTAL, sempre obrigatório na pendência manual
  if (!responsavel) return NextResponse.json({ error: 'Responsável (usuário do portal) é obrigatório.' }, { status: 400 });

  const nome = await nomeDoUsuario(auth.userId, auth.email ?? null);
  const base = {
    placa,
    veiculo_id: body.veiculo_id || null,
    origem: 'manual',
    origem_ref: null,
    titulo,
    descricao: String(body.descricao || '').trim() || null,
    componente_id: body.componente_id || null,
    data_ocorrencia: body.data_ocorrencia || null,
    km: body.km != null && String(body.km).trim() !== '' ? Number(String(body.km).replace(/\D/g, '')) || null : null,
    responsavel,
    foto_url: String(body.foto_url || '').trim() || null,
    status: 'aberta',
    aberta_por: nome,
  };
  const { data, error } = await gravarComGravidade(
    (extra) => supabase.from('frota_pendencias').insert({ ...base, ...extra }).select(SELECT_PEND).single(),
    body.gravidade,
  );

  if (error) return NextResponse.json({ error: erroTabela(error.message) }, { status: 500 });
  return NextResponse.json({ pendencia: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'Passe o id da pendência.' }, { status: 400 });

  if (body.acao === 'resolver') {
    const resolucao = String(body.resolucao || '').trim();
    if (!resolucao) return NextResponse.json({ error: 'Descreva como a pendência foi resolvida.' }, { status: 400 });
    const vinculoTipo = body.vinculo_tipo === 'requisicao' || body.vinculo_tipo === 'os' ? body.vinculo_tipo : null;
    const nome = await nomeDoUsuario(auth.userId, auth.email ?? null);

    const { data, error } = await supabase
      .from('frota_pendencias')
      .update({
        status: 'resolvida',
        resolvida_por: nome,
        resolvida_em: new Date().toISOString(),
        resolucao,
        vinculo_tipo: vinculoTipo,
        vinculo_ref: vinculoTipo ? String(body.vinculo_ref || '').trim() || null : null,
      })
      .eq('id', body.id)
      .eq('status', 'aberta')
      .select(SELECT_PEND)
      .single();

    if (error) return NextResponse.json({ error: erroTabela(error.message) }, { status: 500 });
    return NextResponse.json({ pendencia: data });
  }

  // classificar = definir o componente e/ou o grau de perigo. Os dois juntos
  // porque é a mesma pergunta ("o que é e quão sério é") e a tela pede junto.
  if (body.acao === 'classificar') {
    const mudaComponente = Object.prototype.hasOwnProperty.call(body, 'componente_id');
    const { data, error } = await gravarComGravidade(
      (extra) => supabase
        .from('frota_pendencias')
        .update({ ...(mudaComponente ? { componente_id: body.componente_id || null } : {}), ...extra })
        .eq('id', body.id)
        .select(SELECT_PEND)
        .single(),
      body.gravidade,
    );
    if (error) return NextResponse.json({ error: erroTabela(error.message) }, { status: 500 });
    return NextResponse.json({ pendencia: data });
  }

  if (body.acao === 'reabrir') {
    const { data, error } = await supabase
      .from('frota_pendencias')
      .update({ status: 'aberta', resolvida_por: null, resolvida_em: null, resolucao: null, vinculo_tipo: null, vinculo_ref: null })
      .eq('id', body.id)
      .select(SELECT_PEND)
      .single();
    if (error) return NextResponse.json({ error: erroTabela(error.message) }, { status: 500 });
    return NextResponse.json({ pendencia: data });
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
}
