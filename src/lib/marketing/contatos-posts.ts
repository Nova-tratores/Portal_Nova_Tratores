// =============================================================================
// Contatos por post (Fase 4.3 do plano do Marketing, 23/11/2026).
// A cada 15 min (agendador: 'marketing-contatos-posts') lê as conversas do NovaZap (Chatwoot) criadas nos
// últimos 3 dias que ainda não foram lidas, pega a PRIMEIRA mensagem do cliente e procura o código de um post
// ("Oi! Vi o post 6075CAB…"). Achou = um contato daquele post (mkt_conversas_lidas.codigo).
// Só LÊ o Chatwoot. Cada conversa é lida uma vez (mkt_conversas_lidas guarda as já vistas, com ou sem código).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { baseApiConta, chatwootConfigurado, CHATWOOT_API_TOKEN } from '@/lib/chatwoot/config';
import { codigoNaMensagem } from './redes/etiquetas';

type Conversa = { id: number; created_at?: number; meta?: { sender?: { name?: string | null; phone_number?: string | null } } };
type Msg = { message_type?: number; content?: string | null; created_at?: number };

const cw = async (path: string) => {
  const r = await fetch(baseApiConta() + path, { headers: { api_access_token: CHATWOOT_API_TOKEN }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Chatwoot ${r.status} em ${path}`);
  return r.json();
};

export async function cronContatosPosts(dias = 3): Promise<{ pulado?: string; lidas: number; achadas: number }> {
  if (!chatwootConfigurado()) return { pulado: 'Chatwoot não configurado', lidas: 0, achadas: 0 };

  // códigos dos posts dos últimos 120 dias (post velho ainda pode trazer cliente)
  const { data: posts, error } = await supabaseAdmin.from('site_posts').select('codigo')
    .not('codigo', 'is', null).gte('criado_em', new Date(Date.now() - 120 * 86_400_000).toISOString());
  if (error) return { pulado: /codigo/.test(error.message) ? 'falta rodar sql/marketing-fase4.sql' : error.message, lidas: 0, achadas: 0 };
  const codigos = (posts || []).map((p) => String(p.codigo)).filter(Boolean);
  if (!codigos.length) return { pulado: 'nenhum post com código ainda', lidas: 0, achadas: 0 };

  // conversas recentes (a lista vem da mais recente para a mais velha)
  const desde = Math.floor(Date.now() / 1000) - dias * 86_400;
  const recentes: Conversa[] = [];
  for (let page = 1; page <= 10; page++) {
    const j = await cw(`/conversations?status=all&assignee_type=all&page=${page}`);
    const lote: Conversa[] = j?.data?.payload || [];
    recentes.push(...lote.filter((c) => (c.created_at || 0) >= desde));
    if (lote.length < 25 || lote.every((c) => (c.created_at || 0) < desde)) break;
  }
  if (!recentes.length) return { lidas: 0, achadas: 0 };

  const { data: vistas, error: e2 } = await supabaseAdmin.from('mkt_conversas_lidas').select('conversa_id').in('conversa_id', recentes.map((c) => c.id));
  if (e2) return { pulado: /mkt_conversas_lidas/.test(e2.message) ? 'falta rodar sql/marketing-fase4.sql' : e2.message, lidas: 0, achadas: 0 };
  const jaVistas = new Set((vistas || []).map((v) => Number(v.conversa_id)));

  let lidas = 0, achadas = 0;
  for (const c of recentes.filter((x) => !jaVistas.has(x.id)).slice(0, 60)) {   // no máximo 60 por rodada
    try {
      const j = await cw(`/conversations/${c.id}/messages`);
      const msgs: Msg[] = (j?.payload || []).slice().sort((a: Msg, b: Msg) => (a.created_at || 0) - (b.created_at || 0));
      const primeira = msgs.find((m) => m.message_type === 0 && String(m.content || '').trim());   // 0 = mensagem do cliente
      if (!primeira) continue;   // ainda sem mensagem do cliente: tenta na próxima rodada
      const codigo = codigoNaMensagem(String(primeira.content), codigos);
      await supabaseAdmin.from('mkt_conversas_lidas').upsert({
        conversa_id: c.id, codigo, contato_nome: c.meta?.sender?.name ?? null, contato_telefone: c.meta?.sender?.phone_number ?? null,
        primeira_mensagem: String(primeira.content).slice(0, 300), conversa_em: c.created_at ? new Date(c.created_at * 1000).toISOString() : null,
      }, { onConflict: 'conversa_id' });
      lidas++; if (codigo) achadas++;
    } catch (e) { console.error('[marketing] contatos-posts conversa', c.id, e); }
  }
  return { lidas, achadas };
}
