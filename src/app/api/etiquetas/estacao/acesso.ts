import { NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { EstacaoSemMigracao } from '@/lib/etiquetas/estacao-server'

// Quem tem acesso a alguma tela de etiqueta (PPV, Opa Peças S/Estoque, Patrimônio)
// manda para a estação — e a própria estação entra com um login desses.
export const ACESSO_ETIQUETAS = [{ modulo: 'ppv', acao: 'etiquetas' }, { modulo: 'opa-pecas' }, { modulo: 'patrimonio' }]

export async function acessoEtiquetas(req: Request) {
  const g = await protegerRota(req, ACESSO_ETIQUETAS)
  if (g.resposta) return { resposta: g.resposta }
  return { autor: { id: g.user.id, nome: g.user.nome || g.user.email || '—' } }
}

export function erroEstacao(e: unknown) {
  if (e instanceof EstacaoSemMigracao) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: e.message }, { status: 503 })
  return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
}
