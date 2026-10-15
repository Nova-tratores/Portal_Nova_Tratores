// GET /api/permissoes/quem-acessa?rota=/estoque/notas — só Dev.
// Quem abre a página: resolve rota → tela (perm_tela_rotas; sem a migration,
// o catálogo do código) e devolve cada usuário com o resultado de HOJE
// (portal_permissoes) e o da v2 (view permissoes_efetivas), com nível e origem.
// Só leitura: nada aqui muda acesso.
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { antigoTem } from '@/lib/permissoes/resolver'
import { catalogoRotas, catalogoTelas, rotaDoCaminho, type RotaDef } from '@/lib/permissoes/telas'

export const dynamic = 'force-dynamic'

const faltaTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(e.message || ''))

export async function GET(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isDev) return NextResponse.json({ error: 'Só Dev' }, { status: 403 })

  const caminho = new URL(req.url).searchParams.get('rota') || '/'

  const rotasDb = await supabaseAdmin.from('perm_tela_rotas').select('padrao, acesso, tela_id, alternativas, nota')
  const migracaoFaltando = faltaTabela(rotasDb.error)
  const rotas: RotaDef[] = !rotasDb.error && rotasDb.data?.length
    ? rotasDb.data.map((r) => ({ ...r, tela_id: r.tela_id ?? undefined, alternativas: r.alternativas ?? [], nota: r.nota ?? undefined }))
    : catalogoRotas()
  const rota = rotaDoCaminho(caminho, rotas)
  const alvo = rota?.acesso === 'tela' ? [rota.tela_id!, ...(rota.alternativas ?? [])] : []

  const [perms, usu] = await Promise.all([
    supabaseAdmin.from('portal_permissoes').select('user_id, is_admin, is_dev, categoria, modulos_permitidos'),
    supabaseAdmin.from('financeiro_usu').select('id, nome, ativo, avatar_url'),
  ])
  if (perms.error) return NextResponse.json({ error: perms.error.message }, { status: 500 })
  const pessoa = new Map((usu.data ?? []).map((u) => [u.id, u]))

  // v2: só se a migration existe e o backfill rodou
  let v2: Map<string, { tela_id: string; nivel: string; origens: string[] }[]> | null = null
  if (!migracaoFaltando && alvo.length) {
    const ef = await supabaseAdmin.from('permissoes_efetivas').select('user_id, tela_id, nivel, origens').in('tela_id', alvo)
    if (!ef.error) {
      v2 = new Map()
      for (const e of ef.data ?? []) v2.set(e.user_id, [...(v2.get(e.user_id) ?? []), e])
    }
  }

  const nomesTela = new Map(catalogoTelas().map((t) => [t.id, t.nome]))
  const usuarios = (perms.data ?? []).map((p) => {
    const admin = !!(p.is_admin || p.is_dev)
    const mods: string[] = p.modulos_permitidos ?? []
    const porFlag = rota?.acesso === 'livre' ? true : rota?.acesso === 'admin' ? admin : rota?.acesso === 'dev' ? !!p.is_dev : null
    const hoje = porFlag ?? alvo.some((t) => antigoTem(mods, { admin, dev: !!p.is_dev }, t))
    const linhas = v2?.get(p.user_id) ?? []
    const v2Tem = porFlag ?? (v2 ? linhas.length > 0 : null)
    const u = pessoa.get(p.user_id)
    return {
      id: p.user_id,
      nome: u?.nome ?? '(sem cadastro)',
      ativo: u?.ativo !== false,
      avatar_url: u?.avatar_url ?? null,
      categoria: p.categoria ?? '',
      admin: !!p.is_admin, dev: !!p.is_dev,
      hoje, v2: v2Tem,
      detalhe: linhas.map((l) => ({ tela: l.tela_id, nivel: l.nivel, origens: l.origens })),
    }
  }).sort((a, b) => Number(b.hoje) - Number(a.hoje) || Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))

  return NextResponse.json({
    caminho,
    rota: rota ? { ...rota, nome: rota.tela_id ? nomesTela.get(rota.tela_id) ?? rota.tela_id : null,
      alternativasNomes: (rota.alternativas ?? []).map((a) => nomesTela.get(a) ?? a) } : null,
    fonte: v2 ? 'v2' : 'hoje',
    migracaoFaltando,
    usuarios,
  })
}
