// Push do Portal (28/10/2026): manda o aviso do sino para os aparelhos da pessoa (celular/computador),
// mesmo com o portal fechado. Tabela só do portal: portal_push_inscricoes (sql/portal-push.sql).
// A push_subscriptions é do app do mecânico — não mexer.
// Nunca lança: push não derruba nada.
import webpush, { type PushSubscription } from 'web-push';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:appnovat@gmail.com';

let configurado = false;
export function pushLigado(): boolean {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  if (!configurado) { webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE); configurado = true; }
  return true;
}

export interface AvisoPush { titulo: string; corpo?: string; link?: string; tag?: string }

interface Inscricao { endpoint: string; inscricao: PushSubscription; falhas: number | null }

export async function enviarPushUsuario(userId: string, aviso: AvisoPush): Promise<{ enviados: number; total: number }> {
  if (!pushLigado()) return { enviados: 0, total: 0 };
  try {
    const { data } = await supabaseAdmin.from('portal_push_inscricoes').select('endpoint, inscricao, falhas').eq('user_id', userId);
    const lista = (data || []) as Inscricao[];
    const corpo = JSON.stringify({ titulo: aviso.titulo.slice(0, 120), corpo: (aviso.corpo || '').slice(0, 300), link: aviso.link || '/dashboard', tag: aviso.tag });
    let enviados = 0;
    await Promise.all(lista.map(async (i) => {
      try {
        await webpush.sendNotification(i.inscricao, corpo, { TTL: 86400, urgency: 'high' });
        enviados++;
        await supabaseAdmin.from('portal_push_inscricoes').update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq('endpoint', i.endpoint);
      } catch (e) {
        const st = (e as { statusCode?: number }).statusCode;
        // 404/410 = aparelho desinstalou ou tirou a permissão; 5 falhas seguidas também sai
        if (st === 404 || st === 410 || (i.falhas || 0) >= 4) {
          await supabaseAdmin.from('portal_push_inscricoes').delete().eq('endpoint', i.endpoint);
        } else {
          await supabaseAdmin.from('portal_push_inscricoes').update({ falhas: (i.falhas || 0) + 1 }).eq('endpoint', i.endpoint);
        }
      }
    }));
    return { enviados, total: lista.length };
  } catch {
    return { enviados: 0, total: 0 };
  }
}
