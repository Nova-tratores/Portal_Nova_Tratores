// Quem é gestor de cada departamento (para os avisos "só para o gestor").
// O Organograma (org_pessoas) é fechado para o navegador; aqui a leitura é com a
// service role e devolve só o necessário: os setores que EU gero (para a tela e o
// pop-up saberem se mostram o aviso) e o nome de cada gestor (para quem escreve
// o aviso conferir para quem vai).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabase } from '@/lib/pos/supabase';
import { gestoresDoSetor, setoresQueGere, SETORES, type LinhaOrg, type PermUsuario } from '@/lib/avisos/destino';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });

  const [{ data: permsRaw }, { data: orgRaw }] = await Promise.all([
    supabase.from('portal_permissoes').select('user_id, categoria, mecanico_role'),
    supabase.from('org_pessoas').select('pessoa_chave, gestor_chave, fora'),
  ]);
  const perms = (permsRaw || []) as PermUsuario[];
  const org = (orgRaw || []) as LinhaOrg[];

  const porSetor = SETORES.filter((s) => s.key !== 'todos').map((s) => ({
    setor: s.key, ids: gestoresDoSetor(s.key, perms, org),
  }));
  const ids = [...new Set(porSetor.flatMap((g) => g.ids))];
  const { data: usus } = ids.length
    ? await supabase.from('financeiro_usu').select('id, nome').in('id', ids)
    : { data: [] as { id: string; nome: string | null }[] };
  const nome = new Map((usus || []).map((u: any) => [u.id, String(u.nome || 'Sem nome')]));

  return NextResponse.json({
    meusSetores: setoresQueGere(auth.userId, perms, org),
    gestores: porSetor.map((g) => ({ setor: g.setor, nomes: g.ids.map((i) => nome.get(i) || 'Sem nome') })),
  });
}
