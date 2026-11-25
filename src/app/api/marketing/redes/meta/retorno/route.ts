// Volta do login da Meta (25/11/2026). Endereço cadastrado no app da Meta como "URL de redirecionamento".
// Chega SEM login do portal (quem redireciona é a Meta): a garantia é o `state` assinado com META_APP_SECRET,
// que só o botão "Ligar" (logado, com permissão) sabe gerar, e vale 15 min. Ver lib/marketing/redes/meta.ts.
import { NextResponse } from 'next/server'
import { sb } from '@/lib/marketing/redes/server'
import { PORTAL, acharInstagram, coletarInstagram, lerState, trocarCodigo } from '@/lib/marketing/redes/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const voltar = (q: Record<string, string>) =>
  NextResponse.redirect(`${PORTAL}/marketing/conteudo/contas?${new URLSearchParams(q)}`, 303)

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const st = lerState(p.get('state'))
  if (!st) return voltar({ erro: 'O link de ligar venceu ou não veio do portal. Toque em "Ligar" de novo.' })
  if (p.get('error')) return voltar({ erro: p.get('error_description') || 'A ligação foi cancelada na Meta.' })
  const code = p.get('code')
  if (!code) return voltar({ erro: 'A Meta não devolveu a autorização. Toque em "Ligar" de novo.' })

  try {
    const { token, expiraEm } = await trocarCodigo(code)
    const ig = await acharInstagram(token)
    const { error } = await sb.from('site_redes_contas').upsert({
      rede: 'instagram', nome: ig.username ? `@${ig.username}` : 'Instagram', conta_id: ig.id, token,
      expira_em: expiraEm, ligado_por: st.quem, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'rede' })
    if (error) throw new Error(error.message)
    // 30 dias para trás, sem segurar a pessoa esperando (o servidor do Railway fica de pé)
    coletarInstagram(30).catch((e) => console.warn('[meta] primeira coleta:', (e as Error).message))
    return voltar({ ligado: 'instagram', nome: ig.username ? `@${ig.username}` : '' })
  } catch (e) {
    console.warn('[meta] retorno:', (e as Error).message)
    return voltar({ erro: (e as Error).message.slice(0, 300) })
  }
}
