// Organograma (aba Processos de /atividades → "Organograma").
// GET: pessoas (portal + RH), responsabilidades, uso e chefes — admin ou módulo `atividades`.
// PATCH: grava o chefe / topo / fora / cargo de uma pessoa — só admin. Recusa círculo (409).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { criaCiclo } from '@/lib/organograma/arvore';
import { gravarVinculo, lerOrganograma, lerVinculos } from '@/lib/organograma/server';

export const dynamic = 'force-dynamic';

const CHAVE = /^(u|rh):[A-Za-z0-9-]{1,64}$/;
const SEM_MIGRACAO = 'Falta aplicar sql/organograma.sql no Supabase para salvar os chefes.';

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes('atividades')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  try {
    const dados = await lerOrganograma();
    return NextResponse.json({ ...dados, podeEditar: auth.isAdmin });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador edita o organograma' }, { status: 403 });

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const pessoa = typeof b?.pessoa_chave === 'string' ? b.pessoa_chave : '';
  if (!CHAVE.test(pessoa)) return NextResponse.json({ error: 'Pessoa inválida' }, { status: 400 });
  if (b?.gestor_chave != null && (typeof b.gestor_chave !== 'string' || !CHAVE.test(b.gestor_chave))) {
    return NextResponse.json({ error: 'Chefe inválido' }, { status: 400 });
  }
  if (b?.cargo != null && (typeof b.cargo !== 'string' || b.cargo.length > 80)) return NextResponse.json({ error: 'Cargo até 80 letras' }, { status: 400 });

  try {
    const vinculos = await lerVinculos();
    const atual = vinculos.find((v) => v.pessoa_chave === pessoa);
    const novo = {
      pessoa_chave: pessoa,
      gestor_chave: atual?.gestor_chave ?? null,
      topo: atual?.topo ?? false,
      fora: atual?.fora ?? false,
      cargo: atual?.cargo ?? null,
    };
    if ('gestor_chave' in (b || {})) { novo.gestor_chave = (b!.gestor_chave as string | null) || null; if (novo.gestor_chave) novo.topo = false; }
    if (typeof b?.topo === 'boolean') { novo.topo = b.topo; if (b.topo) novo.gestor_chave = null; }
    if (typeof b?.fora === 'boolean') novo.fora = b.fora;
    if ('cargo' in (b || {})) novo.cargo = (typeof b!.cargo === 'string' && b!.cargo.trim()) ? b!.cargo.trim() : null;

    if (criaCiclo(pessoa, novo.gestor_chave, vinculos.filter((v) => v.pessoa_chave !== pessoa))) {
      return NextResponse.json({ error: 'Essa pessoa já está acima de quem você escolheu como chefe — escolha outra.' }, { status: 409 });
    }
    await gravarVinculo(novo, auth.userId);

    const { data: eu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    await registrarAuditLog({
      userId: auth.userId, userName: eu?.nome || auth.email || 'admin', sistema: 'organograma', acao: 'editar',
      entidade: 'pessoa', entidadeId: pessoa, entidadeLabel: typeof b?.nome === 'string' ? b.nome : pessoa,
      detalhes: { de: atual || null, para: novo },
    }).catch(() => {});
    return NextResponse.json({ ok: true, vinculo: novo });
  } catch (e) {
    if ((e as { faltando?: boolean }).faltando) return NextResponse.json({ error: SEM_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
