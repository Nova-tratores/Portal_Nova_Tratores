// PATCH /api/organograma/funcoes — função das listas de tarefas ("Auxiliar Adm 1"…): quem ocupa e a ficha.
// Só admin. Corpo { funcao, pessoas?, tipo?, <campos da ficha>?, rascunho_ia?, acao?: 'aprovar' }.
// pessoas = ['u:<uid>' | 'rh:<id>']; lista vazia = ninguém (desliga a automática).
// Mexer em qualquer campo da ficha volta para rascunho; 'aprovar' marca aprovada (quem e quando).
// Com { novoNome, pessoas } renomeia em todas as tarefas (a ficha vai junto); nome que já existe
// devolve 409 até vir { juntar: true }.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { funcaoExiste, gravarFicha, renomearFuncao } from '@/lib/organograma/server';
import { CAMPOS_FICHA, normalizarEdicao } from '@/lib/organograma/fichas';
import { CATALOGO } from '@/lib/planta/regras';

export const dynamic = 'force-dynamic';

const CHAVE = /^(u|rh):[A-Za-z0-9-]{1,64}$/;

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador define as funções' }, { status: 403 });

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const funcao = typeof b?.funcao === 'string' ? b.funcao.trim() : '';
  if (!b || !funcao || funcao.length > 80) return NextResponse.json({ error: 'Função inválida' }, { status: 400 });

  let pessoas: string[] | null = null;
  if ('pessoas' in b) {
    if (!Array.isArray(b.pessoas) || b.pessoas.length > 30 || !b.pessoas.every((c) => typeof c === 'string' && CHAVE.test(c))) {
      return NextResponse.json({ error: 'Pessoas inválidas' }, { status: 400 });
    }
    pessoas = [...new Set(b.pessoas as string[])];
  }
  const novoNome = typeof b.novoNome === 'string' ? b.novoNome.trim().replace(/\s+/g, ' ') : '';
  if (b.novoNome != null && (!novoNome || novoNome.length > 80)) return NextResponse.json({ error: 'Nome da função: de 1 a 80 letras' }, { status: 400 });

  const { data: eu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  const autor = eu?.nome || auth.email || 'admin';
  try {
    if (novoNome) {
      if (!pessoas) return NextResponse.json({ error: 'Pessoas inválidas' }, { status: 400 });
      if (novoNome === funcao) return NextResponse.json({ ok: true, funcao, pessoas });
      if (b.juntar !== true && await funcaoExiste(novoNome)) {
        return NextResponse.json({ error: `Já existe a função "${novoNome}".`, existe: true }, { status: 409 });
      }
      await renomearFuncao(funcao, novoNome, pessoas, auth.userId);
      await registrarAuditLog({
        userId: auth.userId, userName: autor, sistema: 'organograma', acao: 'funcao_renomear',
        entidade: 'funcao', entidadeId: novoNome, entidadeLabel: novoNome, detalhes: { de: funcao, para: novoNome, juntou: b.juntar === true },
      }).catch(() => {});
      return NextResponse.json({ ok: true, funcao: novoNome, pessoas });
    }

    const patch: Record<string, unknown> = {};
    if (pessoas) patch.pessoas = pessoas;
    if (b.tipo === 'funcao' || b.tipo === 'grupo') patch.tipo = b.tipo;
    const mexeuFicha = CAMPOS_FICHA.some((c) => c in b);
    Object.assign(patch, normalizarEdicao(b, Object.keys(CATALOGO)));
    if (mexeuFicha) { patch.status = 'rascunho'; patch.aprovado_por = null; patch.aprovado_em = null; }
    if (typeof b.rascunho_ia === 'boolean') patch.rascunho_ia = b.rascunho_ia;
    if (b.acao === 'aprovar') { patch.status = 'aprovada'; patch.aprovado_por = auth.userId; patch.aprovado_em = new Date().toISOString(); }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada para salvar' }, { status: 400 });

    await gravarFicha(funcao, patch, auth.userId);
    await registrarAuditLog({
      userId: auth.userId, userName: autor, sistema: 'organograma',
      acao: b.acao === 'aprovar' ? 'aprovar_ficha' : mexeuFicha ? 'editar_ficha' : 'funcao',
      entidade: 'funcao', entidadeId: funcao, entidadeLabel: funcao, detalhes: pessoas && !mexeuFicha ? { pessoas } : { campos: Object.keys(patch) },
    }).catch(() => {});
    return NextResponse.json({ ok: true, funcao, pessoas: pessoas ?? undefined, patch });
  } catch (e) {
    if ((e as { faltando?: boolean }).faltando) {
      const ficha = CAMPOS_FICHA.some((c) => c in b) || 'acao' in b || 'tipo' in b;
      return NextResponse.json({ error: `Falta aplicar ${ficha ? 'sql/organograma-fichas.sql' : 'sql/organograma-tarefas.sql'} no Supabase.`, tarefasFaltando: !ficha }, { status: 503 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
