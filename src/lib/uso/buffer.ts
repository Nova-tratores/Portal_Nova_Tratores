// Monitor de uso — buffer em memória (PURO: só estruturas; o flush ao banco
// fica em buffer-server.ts). Chave = tipo|user|rota|dia → contador.

export type TipoUso = 'pagina' | 'api';

export interface ItemUso {
  tipo: TipoUso;
  user_id: string;
  rota: string;
  dia: string; // YYYY-MM-DD
  n: number;
}

export interface Presenca {
  user_id: string;
  rota: string;
  em: string; // ISO
}

export interface BufferUso {
  contagens: Map<string, ItemUso>;
  presenca: Map<string, Presenca>;
}

export function novoBuffer(): BufferUso {
  return { contagens: new Map(), presenca: new Map() };
}

export function chaveUso(tipo: TipoUso, userId: string, rota: string, dia: string): string {
  return `${tipo}|${userId}|${rota}|${dia}`;
}

/** Soma 1 (ou n) na chave. Rota vazia é ignorada. */
export function acumular(buf: BufferUso, item: Omit<ItemUso, 'n'> & { n?: number }): void {
  if (!item.user_id || !item.rota || !item.dia) return;
  const k = chaveUso(item.tipo, item.user_id, item.rota, item.dia);
  const atual = buf.contagens.get(k);
  const n = Math.max(1, Math.floor(item.n ?? 1));
  if (atual) atual.n += n;
  else buf.contagens.set(k, { tipo: item.tipo, user_id: item.user_id, rota: item.rota, dia: item.dia, n });
}

/** Marca a última página vista pelo usuário (só páginas, não API). */
export function marcarPresenca(buf: BufferUso, userId: string, rota: string, em: Date = new Date()): void {
  if (!userId) return;
  buf.presenca.set(userId, { user_id: userId, rota, em: em.toISOString() });
}

/** Esvazia o buffer e devolve o lote para gravar. */
export function drenar(buf: BufferUso): { itens: ItemUso[]; presenca: Presenca[] } {
  const itens = Array.from(buf.contagens.values());
  const presenca = Array.from(buf.presenca.values());
  buf.contagens.clear();
  buf.presenca.clear();
  return { itens, presenca };
}

/** Devolve o lote ao buffer (flush falhou) sem perder o que entrou nesse meio-tempo. */
export function devolver(buf: BufferUso, lote: { itens: ItemUso[]; presenca: Presenca[] }): void {
  for (const it of lote.itens) acumular(buf, it);
  for (const p of lote.presenca) {
    const atual = buf.presenca.get(p.user_id);
    if (!atual || atual.em < p.em) buf.presenca.set(p.user_id, p);
  }
}

export function tamanho(buf: BufferUso): number {
  return buf.contagens.size + buf.presenca.size;
}
