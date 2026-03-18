import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Usa service role key para bypassar RLS (somente no servidor)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// POST /api/push/subscribe — salva/atualiza a subscription do usuário
export async function POST(req) {
  try {
    const { subscription, userId } = await req.json()

    if (!subscription?.endpoint || !userId) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        subscription: subscription,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/push/subscribe — remove subscription (ex: usuário revogou permissão)
export async function DELETE(req) {
  try {
    const { endpoint, userId } = await req.json()
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
