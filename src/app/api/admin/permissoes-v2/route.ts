// GET /api/admin/permissoes-v2 — só admin/dev e SÓ LEITURA.
//   sem parâmetro: usuários (com conjuntos e extras) + conjuntos (com telas)
//   ?user=<id>:    todas as telas com nível e origem daquele usuário + overrides
import { NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só admin' }, { status: 403 })

  const userId = new URL(req.url).searchParams.get('user')

  if (userId) {
    const [telas, ef, ov] = await Promise.all([
      supabaseAdmin.from('perm_telas').select('id, nome, categoria_menu, explicita, so_dev').eq('ativo', true).limit(5000),
      supabaseAdmin.rpc('perm_efetivas', { p_user: userId }),
      supabaseAdmin.from('perm_usuario_overrides').select('tela_id, nivel, tipo, expira_em, motivo, criado_em').eq('user_id', userId).limit(2000),
    ])
    const erro = telas.error || ef.error || ov.error
    if (erro) return NextResponse.json({ error: erro.message }, { status: 500 })
    const efetivas = new Map(((ef.data ?? []) as { tela_id: string; nivel: string; origens: string[] }[]).map((e) => [e.tela_id, e]))
    return NextResponse.json({
      telas: (telas.data ?? []).map((t) => ({
        ...t, nivel: efetivas.get(t.id)?.nivel ?? null, origens: efetivas.get(t.id)?.origens ?? [],
      })),
      overrides: ov.data ?? [],
    })
  }

  const [perm, usu, conj, vinc, ov] = await Promise.all([
    supabaseAdmin.from('portal_permissoes').select('user_id, is_admin, is_dev, categoria').limit(5000),
    supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').limit(5000),
    supabaseAdmin.from('perm_conjuntos').select('id, nome, tipo, descricao, ativo, perm_conjunto_telas(tela_id, nivel)').limit(500),
    supabaseAdmin.from('perm_usuario_conjuntos').select('user_id, conjunto_id').limit(5000),
    supabaseAdmin.from('perm_usuario_overrides').select('user_id, tipo, expira_em').limit(10000),
  ])
  const erro = perm.error || usu.error || conj.error || vinc.error || ov.error
  if (erro) return NextResponse.json({ error: erro.message }, { status: 500 })

  const pessoa = new Map((usu.data ?? []).map((u) => [u.id, u]))
  const conjuntos = (conj.data ?? []) as { id: string; nome: string; tipo: string; descricao: string | null; ativo: boolean; perm_conjunto_telas: { tela_id: string; nivel: string }[] }[]
  const nomeConjunto = new Map(conjuntos.map((c) => [c.id, c.nome]))
  const agora = Date.now()
  const vigente = (o: { expira_em: string | null }) => !o.expira_em || new Date(o.expira_em).getTime() > agora

  return NextResponse.json({
    usuarios: (perm.data ?? []).map((p) => {
      const meus = (ov.data ?? []).filter((o) => o.user_id === p.user_id && vigente(o))
      return {
        id: p.user_id,
        nome: pessoa.get(p.user_id)?.nome ?? '(sem cadastro)',
        ativo: pessoa.get(p.user_id)?.ativo !== false,
        categoria: p.categoria ?? '',
        admin: !!p.is_admin, dev: !!p.is_dev,
        conjuntos: (vinc.data ?? []).filter((v) => v.user_id === p.user_id).map((v) => nomeConjunto.get(v.conjunto_id) ?? '?'),
        extras: meus.filter((o) => o.tipo === 'extra').length,
        bloqueios: meus.filter((o) => o.tipo === 'bloqueio').length,
      }
    }).sort((a, b) => a.nome.localeCompare(b.nome)),
    conjuntos: conjuntos.map((c) => ({
      id: c.id, nome: c.nome, tipo: c.tipo, descricao: c.descricao, ativo: c.ativo,
      telas: (c.perm_conjunto_telas ?? []).map((t) => ({ tela: t.tela_id, nivel: t.nivel })).sort((a, b) => a.tela.localeCompare(b.tela)),
      membros: (vinc.data ?? []).filter((v) => v.conjunto_id === c.id).length,
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
  })
}
