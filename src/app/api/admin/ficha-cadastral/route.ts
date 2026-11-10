import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { MODULO_FICHA_CADASTRAL } from '@/lib/permissoes/modulos-admin'
import { semSensiveis, manterSensiveis, type Dados } from '@/lib/admin/ficha-cadastral'
import { lerRH, completarComRH } from '@/lib/admin/ficha-rh-server'
import { fichaAprovada, pedidoPendente, pedirMudanca, mascarar, nomeDe, ehDiretor } from '@/lib/admin/ficha-pedidos-server'

// Ficha cadastral do colaborador (José, 09/11/2026). Três níveis:
//  - Dev: vê tudo, inclusive salário/comissão do RH;
//  - Admin (não Dev) ou quem tem o módulo Ficha cadastral (10/11/2026): vê só o que não é sensível (sem documentos, saúde e banco) —
//    os sensíveis salvos ficam intactos;
//  - a própria pessoa (?eu=1, Configurações → Minha ficha): a ficha inteira dela, sem salário.
// Salvar NÃO muda a ficha: vira pedido para o Diretor autorizar (mesmo esquema da
// comissão). Autorizado, grava e manda ao RH. Tabelas sem RLS de leitura: só o servidor.
const SEM_TABELA = 'A tabela da ficha ainda não existe: rode sql/ficha-cadastral.sql no Supabase do portal.'
const semTabela = (msg?: string) => !!msg && /usuario_ficha_cadastral/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)

type Nivel = 'total' | 'parcial' | 'proprio'

async function quem(req: NextRequest, alvo: string | null, eu: boolean) {
  const auth = await autenticar(req)
  if (!auth) return { erro: 'Faça login de novo', status: 401 as const }
  if (eu || !alvo || alvo === auth.userId) return { auth, userId: auth.userId, nivel: (auth.isDev ? 'total' : 'proprio') as Nivel }
  if (!auth.isAdmin && !auth.modulos.includes(MODULO_FICHA_CADASTRAL)) return { erro: 'Sem permissão', status: 403 as const }
  return { auth, userId: alvo, nivel: (auth.isDev ? 'total' : 'parcial') as Nivel }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = await quem(req, sp.get('user_id'), sp.get('eu') === '1')
  if ('erro' in q) return NextResponse.json({ error: q.erro }, { status: q.status })
  try {
    const ap = await fichaAprovada(q.userId)
    const pend = await pedidoPendente(q.userId)
    const { email } = await nomeDe(q.userId)
    const { resumo, sugestao } = await lerRH(q.userId, email, q.nivel === 'total')
    // com pedido pendente, quem abre vê a ficha como foi pedida (e o aviso do pedido)
    let dados: Dados = completarComRH(pend?.dados || ap.dados, sugestao)
    if (q.nivel === 'parcial') dados = semSensiveis(dados)
    return NextResponse.json({
      dados, nivel: q.nivel, rh: resumo,
      souDiretor: await ehDiretor(q.auth.userId),
      atualizado_em: ap.atualizado_em, atualizado_por_nome: ap.atualizado_por_nome,
      pendente: pend ? { id: pend.id, criado_em: pend.criado_em, atualizado_em: pend.atualizado_em, pedido_por_nome: pend.pedido_por_nome, mudancas: mascarar(pend.mudancas || [], q.nivel !== 'parcial') } : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: semTabela(e?.message) ? SEM_TABELA : e?.message || 'erro' }, { status: e?.status || 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const q = await quem(req, body.user_id ? String(body.user_id) : null, body.eu === true)
  if ('erro' in q) return NextResponse.json({ error: q.erro }, { status: q.status })
  let dados = body.dados
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
  if (JSON.stringify(dados).length > 80_000) return NextResponse.json({ error: 'ficha grande demais' }, { status: 400 })
  try {
    if (q.nivel === 'parcial') {
      const pend = await pedidoPendente(q.userId)
      dados = manterSensiveis(dados, pend?.dados || (await fichaAprovada(q.userId)).dados)
    }
    const eu = await nomeDe(q.auth.userId)
    const r = await pedirMudanca(q.userId, dados, { id: q.auth.userId, nome: eu.nome })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: semTabela(e?.message) ? SEM_TABELA : e?.message || 'erro' }, { status: e?.status || 500 })
  }
}
