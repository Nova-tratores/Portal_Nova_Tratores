// Tickets — QUADROS: acesso ao banco (SERVIDOR, service role).
// Regras de papel em ./quadros.ts. Migration: sql/tickets-quadros.sql — sem ela
// a leitura devolve `migracaoFaltando` e o resto dos Tickets segue igual.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import type { Autenticado } from '@/lib/auth/server'
import {
  podeVerQuadro, podeTrabalhar, podeGerenciar, ordenarColunas, COLUNAS_PADRAO,
  type Quadro, type QuadroColuna, type QuadroResumo,
} from './quadros'
import { STATUS_FINAIS } from './constantes'

export { migrationFaltou }

export const MSG_MIGRATION_QUADROS =
  'Os quadros ainda não foram ativados no banco. Rode sql/tickets-quadros.sql no SQL Editor do Supabase.'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

const ator = (auth: Autenticado) => ({ userId: auth.userId, isAdmin: auth.isAdmin })

export interface QuadroCarregado {
  quadro: Quadro
  colunas: QuadroColuna[]
  membros: string[]
}

export async function carregarQuadro(id: string): Promise<QuadroCarregado | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const quadro = ok(await supabaseAdmin.from('tickets_quadros').select('*').eq('id', id).maybeSingle()) as Quadro | null
  if (!quadro) return null
  const [colunas, membros] = await Promise.all([
    supabaseAdmin.from('tickets_quadro_colunas').select('*').eq('quadro_id', id),
    supabaseAdmin.from('tickets_quadro_membros').select('user_id').eq('quadro_id', id),
  ])
  return {
    quadro,
    colunas: ordenarColunas(ok(colunas) as QuadroColuna[]),
    membros: (ok(membros) as { user_id: string }[]).map((m) => m.user_id),
  }
}

export function papeis(c: QuadroCarregado, auth: Autenticado) {
  return {
    ver: podeVerQuadro(c.quadro, c.membros, ator(auth)),
    trabalhar: podeTrabalhar(c.quadro, c.membros, ator(auth)),
    gerenciar: podeGerenciar(c.quadro, ator(auth)),
  }
}

/** Quadros que o usuário enxerga, com contagem de tickets abertos. */
export async function listarQuadros(auth: Autenticado, incluirArquivados: boolean): Promise<QuadroResumo[]> {
  let q = supabaseAdmin.from('tickets_quadros').select('*').order('nome')
  if (!incluirArquivados) q = q.eq('arquivado', false)
  const quadros = ok(await q) as Quadro[]
  if (quadros.length === 0) return []
  const ids = quadros.map((x) => x.id)
  const [membrosRes, ticketsRes] = await Promise.all([
    supabaseAdmin.from('tickets_quadro_membros').select('quadro_id, user_id').in('quadro_id', ids),
    supabaseAdmin.from('tickets').select('quadro_id').in('quadro_id', ids).not('status', 'in', `(${STATUS_FINAIS.join(',')})`),
  ])
  const membrosPor = new Map<string, string[]>()
  for (const m of ok(membrosRes) as { quadro_id: string; user_id: string }[]) {
    membrosPor.set(m.quadro_id, [...(membrosPor.get(m.quadro_id) || []), m.user_id])
  }
  const abertosPor = new Map<string, number>()
  for (const t of ok(ticketsRes) as { quadro_id: string }[]) abertosPor.set(t.quadro_id, (abertosPor.get(t.quadro_id) || 0) + 1)

  return quadros
    .map((quadro) => {
      const membros = membrosPor.get(quadro.id) || []
      const a = ator(auth)
      return {
        ...quadro,
        membros,
        tickets_abertos: abertosPor.get(quadro.id) || 0,
        // "Meus blocos": criei ou fui adicionado (admin/público não contam)
        meu: quadro.criado_por === auth.userId || membros.includes(auth.userId),
        pode_trabalhar: podeTrabalhar(quadro, membros, a),
        pode_gerenciar: podeGerenciar(quadro, a),
        _ver: podeVerQuadro(quadro, membros, a),
      }
    })
    .filter((x) => x._ver)
    .map(({ _ver, ...resto }) => { void _ver; return resto })
}

/** Cria o quadro com o criador como integrante e as colunas iniciais. */
export async function criarQuadro(
  auth: Autenticado,
  campos: Pick<Quadro, 'nome' | 'visibilidade'> & Partial<Pick<Quadro, 'descricao' | 'cor'>>,
  integrantes: string[],
): Promise<Quadro> {
  const quadro = ok(await supabaseAdmin.from('tickets_quadros')
    .insert({ ...campos, criado_por: auth.userId })
    .select('*').single()) as Quadro
  const membros = [...new Set([auth.userId, ...integrantes])]
  ok(await supabaseAdmin.from('tickets_quadro_membros')
    .insert(membros.map((user_id) => ({ quadro_id: quadro.id, user_id, adicionado_por: auth.userId }))))
  ok(await supabaseAdmin.from('tickets_quadro_colunas')
    .insert(COLUNAS_PADRAO.map((nome, posicao) => ({ quadro_id: quadro.id, nome, posicao }))))
  return quadro
}

/** Só ids de usuários ativos do portal. */
export async function filtrarUsuariosAtivos(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return []
  const lista = [...new Set(ids.map(String).filter((i) => /^[0-9a-f-]{36}$/i.test(i)))].slice(0, 200)
  if (lista.length === 0) return []
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, ativo').in('id', lista)
  return (data || []).filter((u: { ativo?: boolean }) => u.ativo !== false).map((u: { id: string }) => u.id)
}

/** Notifica integrantes adicionados (sino do portal). */
export async function notificarIntegrantes(quadro: Quadro, ids: string[], autorId: string) {
  const alvo = ids.filter((i) => i !== autorId)
  if (alvo.length === 0) return
  await supabaseAdmin.from('portal_notificacoes').insert(alvo.map((user_id) => ({
    user_id,
    tipo: 'tickets',
    titulo: `Você entrou no quadro "${quadro.nome}"`,
    descricao: 'Abra a aba Quadros em Tickets para ver.',
    link: `/tickets/quadros/${quadro.id}`,
  })))
}
