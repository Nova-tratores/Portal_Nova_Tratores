/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// PÁGINA DA GARANTIA — acesso ao banco (SERVIDOR, service role).
//
// Tabelas com RLS sem policy (sql/garantia-pagina-cliente.sql). Se a migration
// ainda não foi aplicada, a página pública segue funcionando (a gravação falha
// calada na rota) e o painel mostra o aviso para rodar o SQL.
// =============================================================================
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { migrationFaltou } from '@/lib/marketing/erros';
import {
  rankingPorValor, resumirUso,
  type EventoValido, type DuvidaValida, type StatusDuvida,
} from './pagina-cliente';

export { migrationFaltou };

export const MSG_MIGRATION =
  'As tabelas da página da garantia ainda não existem no banco. Rode sql/garantia-pagina-cliente.sql no SQL Editor do Supabase.';

const T_EVENTOS = 'garantia_cliente_eventos';
const T_DUVIDAS = 'garantia_cliente_duvidas';

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

// ── Freio simples por IP (memória do processo) ───────────────────────────────
// Página pública: um robô não pode encher a tabela. Limite generoso para gente.
const janelas = new Map<string, { inicio: number; n: number }>();
export function passouDoLimite(chave: string, max: number, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || agora - j.inicio > janelaMs) {
    janelas.set(chave, { inicio: agora, n: 1 });
    if (janelas.size > 5000) janelas.clear();
    return false;
  }
  j.n += 1;
  return j.n > max;
}

export async function gravarEvento(e: EventoValido) {
  ok(await db.from(T_EVENTOS).insert(e));
}

export async function gravarDuvida(d: DuvidaValida) {
  ok(await db.from(T_DUVIDAS).insert(d));
  // conta também como evento, para o resumo do painel
  await db.from(T_EVENTOS).insert({ tipo: 'duvida_enviada', valor: null, sessao: d.sessao });
}

/** Tudo que o painel mostra, no período de `dias` dias. */
export async function painel(dias: number) {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  // eventos do período, paginados (teto de 1.000 por chamada do PostgREST)
  const eventos: { tipo: string; valor: string | null; sessao: string | null; criado_em: string }[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const lote = ok(await db.from(T_EVENTOS)
      .select('tipo, valor, sessao, criado_em')
      .gte('criado_em', desde)
      .order('criado_em', { ascending: true })
      .range(de, de + 999)) as any[];
    eventos.push(...lote);
    if (lote.length < 1000) break;
  }

  const duvidas = ok(await db.from(T_DUVIDAS)
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(300)) as any[];

  return {
    dias,
    resumo: resumirUso(eventos),
    perguntasRapidas: rankingPorValor(eventos, 'pergunta_rapida'),
    faq: rankingPorValor(eventos, 'faq'),
    buscas: rankingPorValor(eventos, 'busca', 20),
    buscasSemResultado: rankingPorValor(eventos, 'busca_sem_resultado', 20),
    whatsapp: rankingPorValor(eventos, 'whatsapp'),
    duvidas,
  };
}

export async function atualizarDuvida(
  id: number,
  campos: { status?: StatusDuvida; resposta?: string | null },
  quem: string,
) {
  const patch: Record<string, unknown> = {};
  if (campos.status) patch.status = campos.status;
  if (campos.resposta !== undefined) patch.resposta = campos.resposta;
  if (campos.status === 'respondida') {
    patch.respondido_por = quem;
    patch.respondido_em = new Date().toISOString();
  }
  return ok(await db.from(T_DUVIDAS).update(patch).eq('id', id).select('*').single());
}
