// =============================================================================
// Modo sombra das permissões v2 — lado servidor.
//
// PERM_V2 (env): 'sombra' (padrão em produção) = a regra antiga decide e a v2
// é calculada em segundo plano e registrada; 'on' = a v2 decide (se o banco
// falhar, cai na antiga) e a antiga vira a sombra; 'off' = nada. Fora de
// produção fica 'off' a menos que PERM_V2 esteja definida (o dev usa o mesmo banco).
//
// Custo: telas efetivas por usuário ficam 60 s em memória (1 RPC por usuário
// por minuto); o registro só incrementa um Map e o flush é a cada 60 s
// (instrumentation.ts), como o monitor de uso.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { diaLocal, normalizarRota } from '@/lib/uso/rota';
import { agregar, decidirV2, modoV2, rotuloChecagem, telasDaChecagem, type Checagem, type ItemSombra, type ModoV2 } from './sombra';

type Cache<T> = { em: number; valor: T };
const g = globalThis as unknown as {
  __permSombraItens?: (ItemSombra & { vezes: number })[];
  __permSombraEfetivas?: Map<string, Cache<Set<string>>>;
  __permSombraCatalogo?: Cache<Set<string>>;
  __permSombraFlushing?: boolean;
};
const itens = () => (g.__permSombraItens ??= []);
const cacheEfetivas = () => (g.__permSombraEfetivas ??= new Map());

export function modoAtual(): ModoV2 {
  if (process.env.NODE_ENV !== 'production' && !process.env.PERM_V2) return 'off';
  return modoV2(process.env.PERM_V2);
}

/** Descarta a cópia em memória (o espelho chama depois de mudar a v2 do usuário). */
export function esquecerEfetivas(userId: string): void {
  cacheEfetivas().delete(userId);
}

async function efetivasDe(userId: string): Promise<Set<string> | null> {
  const c = cacheEfetivas().get(userId);
  if (c && Date.now() - c.em < 60_000) return c.valor;
  const { data, error } = await supabaseAdmin.rpc('perm_efetivas', { p_user: userId });
  if (error || !Array.isArray(data)) return null;
  const set = new Set((data as { tela_id: string }[]).map((r) => r.tela_id));
  cacheEfetivas().set(userId, { em: Date.now(), valor: set });
  return set;
}

async function catalogo(): Promise<Set<string> | null> {
  const c = g.__permSombraCatalogo;
  if (c && Date.now() - c.em < 5 * 60_000) return c.valor;
  const { data, error } = await supabaseAdmin.from('perm_telas').select('id').limit(5000);
  if (error || !data) return null;
  const set = new Set(data.map((r: { id: string }) => r.id));
  g.__permSombraCatalogo = { em: Date.now(), valor: set };
  return set;
}

function rotaDe(req: Request): string {
  try { return normalizarRota(new globalThis.URL(req.url).pathname) || '?'; } catch { return '?'; }
}

async function avaliar(userId: string, ehAdmin: boolean, c: Checagem): Promise<{ v2: boolean; catalogada: boolean } | null> {
  const [ef, cat] = await Promise.all([efetivasDe(userId), catalogo()]);
  if (!ef) return null;
  const catalogada = !cat || telasDaChecagem(c).every((t) => t === '@admin' || cat.has(t));
  return { v2: decidirV2(c, ef, ehAdmin), catalogada };
}

function anotar(req: Request, userId: string, c: Checagem, antigo: boolean, r: { v2: boolean; catalogada: boolean }, decidiu: 'antigo' | 'v2') {
  itens().push({ dia: diaLocal(), user_id: userId, tela_id: rotuloChecagem(c), rota: rotaDe(req), antigo, v2: r.v2, catalogada: r.catalogada, decidiu, vezes: 1 });
  if (itens().length > 5000) {
    const juntos = agregar(itens());
    // flush falhando (ex.: migration da sombra não aplicada): não cresce sem fim
    g.__permSombraItens = juntos.length > 20000 ? juntos.slice(-20000) : juntos;
  }
}

/**
 * Ponto único usado pelos helpers de rota. Devolve a DECISÃO (respeitando o
 * modo) e registra a comparação. Nunca lança.
 */
export async function decidirPermissao(req: Request, userId: string, ehAdmin: boolean, c: Checagem, antigo: boolean): Promise<boolean> {
  const modo = modoAtual();
  if (modo === 'off') return antigo;
  if (modo === 'sombra') {
    void avaliar(userId, ehAdmin, c).then((r) => { if (r) anotar(req, userId, c, antigo, r, 'antigo'); }).catch(() => {});
    return antigo;
  }
  try {
    const r = await avaliar(userId, ehAdmin, c);
    if (!r) return antigo; // banco fora: não tranca ninguém
    anotar(req, userId, c, antigo, r, 'v2');
    return r.v2;
  } catch {
    return antigo;
  }
}

/** Flush do buffer (RPC perm_sombra_registrar). Nunca lança. */
export async function descarregarSombra(): Promise<{ itens: number; ok: boolean; erro?: string }> {
  if (g.__permSombraFlushing || itens().length === 0) return { itens: 0, ok: true };
  g.__permSombraFlushing = true;
  const lote = agregar(itens());
  g.__permSombraItens = [];
  try {
    const { error } = await supabaseAdmin.rpc('perm_sombra_registrar', { p_itens: lote });
    if (error) { itens().push(...lote); return { itens: lote.length, ok: false, erro: error.message }; }
    return { itens: lote.length, ok: true };
  } catch (e) {
    itens().push(...lote);
    return { itens: lote.length, ok: false, erro: (e as Error).message };
  } finally {
    g.__permSombraFlushing = false;
  }
}
