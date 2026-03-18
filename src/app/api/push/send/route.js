import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:admin@sistema.com'

// Configura VAPID apenas se as chaves estiverem disponíveis
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// POST /api/push/send — envia push para todos os usuários (exceto o emissor)
export async function POST(req) {
  try {
    // Se VAPID não configurado, retorna sem erro (não quebra o app)
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'VAPID não configurado' })
    }

    const { payload, excludeUserId } = await req.json()
    if (!payload) {
      return NextResponse.json({ error: 'Sem payload' }, { status: 400 })
    }

    // Busca subscriptions — exclui o usuário que disparou a ação
    let query = supabase.from('push_subscriptions').select('*')
    if (excludeUserId) query = query.neq('user_id', excludeUserId)
    const { data: subs, error } = await query

    if (error) throw error
    if (!subs?.length) return NextResponse.json({ sent: 0, total: 0 })

    // Envia em paralelo, removendo subscriptions expiradas
    const resultados = await Promise.allSettled(
      subs.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify(payload))
        } catch (err) {
          // 410 Gone / 404 = subscription expirou ou foi revogada
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', row.endpoint)
          }
          throw err
        }
      })
    )

    const enviados = resultados.filter((r) => r.status === 'fulfilled').length
    return NextResponse.json({ sent: enviados, total: subs.length })
  } catch (err) {
    console.error('[push/send]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
