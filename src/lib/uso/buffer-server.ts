// Monitor de uso — lado servidor: buffer global do processo + flush por RPC.
//
// registrarUsoPagina/registrarUsoApi só incrementam um Map (nanossegundos). O
// descarregarUso() roda a cada 60 s (instrumentation.ts) e chama UMA RPC com o
// lote inteiro; se falhar, devolve o lote ao buffer e tenta no próximo ciclo.
// Em deploy/queda perde-se no máximo 1 minuto de contagem — aceitável.
//
// O buffer vive em globalThis para sobreviver ao HMR do `next dev`.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import {
  acumular, acumularTransicao, devolver, devolverTransicoes, drenar, drenarTransicoes, marcarPresenca, novoBuffer, tamanho,
  type BufferUso, type MapaTransicoes,
} from './buffer';
import { diaLocal, ehRotaAutomatica, normalizarRota } from './rota';

const g = globalThis as unknown as {
  __portalUsoBuffer?: BufferUso; __portalUsoFlushing?: boolean;
  __portalUsoTransicoes?: MapaTransicoes; __portalUsoTransSemRpc?: boolean;
};
function buffer(): BufferUso {
  if (!g.__portalUsoBuffer) g.__portalUsoBuffer = novoBuffer();
  return g.__portalUsoBuffer;
}
function transicoes(): MapaTransicoes {
  if (!g.__portalUsoTransicoes) g.__portalUsoTransicoes = new Map();
  return g.__portalUsoTransicoes;
}

/** Liga a coleta? Produção sempre; local só com USO_MONITOR=on (o dev usa o mesmo banco). */
export function monitorLigado(): boolean {
  if (process.env.USO_MONITOR === 'off') return false;
  return process.env.NODE_ENV === 'production' || process.env.USO_MONITOR === 'on';
}

/** Página vista (vem do beacon do PortalLayout). */
export function registrarUsoPagina(userId: string, pathname: string): void {
  if (!monitorLigado()) return;
  const rota = normalizarRota(pathname);
  if (!rota || rota.startsWith('/api/')) return;
  const buf = buffer();
  acumular(buf, { tipo: 'pagina', user_id: userId, rota, dia: diaLocal() });
  marcarPresenca(buf, userId, rota);
}

/** Transição de → para (jornada do navegador). Só booleanos e tempo; nada do caso. */
export function registrarTransicao(
  userId: string,
  t: { de: string; para: string; gapS: number; mesmoAlvo: boolean; volta: boolean },
): void {
  if (!monitorLigado()) return;
  const de = normalizarRota(t.de);
  const para = normalizarRota(t.para);
  if (!de || !para || de === para || de.startsWith('/api/') || para.startsWith('/api/')) return;
  const gapS = Math.min(1800, Math.max(0, Math.round(Number(t.gapS) || 0)));
  acumularTransicao(transicoes(), { user_id: userId, de, para, dia: diaLocal(), gapS, mesmoAlvo: !!t.mesmoAlvo, volta: !!t.volta });
}

/** Chamada de API autenticada (vem de autenticar()). Rotas do próprio monitor não contam. */
export function registrarUsoApi(userId: string, pathname: string): void {
  if (!monitorLigado()) return;
  const rota = normalizarRota(pathname);
  if (!rota || rota.startsWith('/api/uso/')) return;
  acumular(buffer(), { tipo: 'api', user_id: userId, rota, dia: diaLocal() });
}

/** Descarrega o buffer no banco (RPC portal_uso_incrementar). Nunca lança. */
export async function descarregarUso(): Promise<{ itens: number; presenca: number; ok: boolean; erro?: string }> {
  const buf = buffer();
  if (g.__portalUsoFlushing) return { itens: 0, presenca: 0, ok: true };
  if (tamanho(buf) === 0 && transicoes().size === 0) return { itens: 0, presenca: 0, ok: true };
  g.__portalUsoFlushing = true;
  await descarregarTransicoes();
  if (tamanho(buf) === 0) { g.__portalUsoFlushing = false; return { itens: 0, presenca: 0, ok: true }; }
  const lote = drenar(buf);
  try {
    const { error } = await supabaseAdmin.rpc('portal_uso_incrementar', {
      p_itens: lote.itens,
      p_presenca: lote.presenca,
    });
    if (error) {
      devolver(buf, lote);
      return { itens: lote.itens.length, presenca: lote.presenca.length, ok: false, erro: error.message };
    }
    return { itens: lote.itens.length, presenca: lote.presenca.length, ok: true };
  } catch (e) {
    devolver(buf, lote);
    return { itens: lote.itens.length, presenca: lote.presenca.length, ok: false, erro: (e as Error).message };
  } finally {
    g.__portalUsoFlushing = false;
  }
}

/**
 * Lote de transições → RPC portal_uso_incrementar_transicoes. Se a migration
 * (sql/portal-uso-transicoes.sql) não foi aplicada, avisa UMA vez e descarta —
 * não devolve o lote, senão o buffer cresceria para sempre.
 */
async function descarregarTransicoes(): Promise<void> {
  const mapa = transicoes();
  if (mapa.size === 0) return;
  const lote = drenarTransicoes(mapa);
  try {
    const { error } = await supabaseAdmin.rpc('portal_uso_incrementar_transicoes', { p_itens: lote });
    if (!error) { g.__portalUsoTransSemRpc = false; return; }
    if (/PGRST202|42883|could not find the function|does not exist/i.test(`${error.code || ''} ${error.message}`)) {
      if (!g.__portalUsoTransSemRpc) console.warn('[uso] transições descartadas: aplicar sql/portal-uso-transicoes.sql');
      g.__portalUsoTransSemRpc = true;
      return;
    }
    devolverTransicoes(mapa, lote);
  } catch {
    devolverTransicoes(mapa, lote);
  }
}

/** Para a tela: quais rotas são "automáticas" (polling). */
export { ehRotaAutomatica };
