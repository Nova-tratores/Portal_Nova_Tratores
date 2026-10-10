'use client';
// Fila de leituras de km SEM SINAL (técnico na roça). Mesmo molde da fila do
// /lead: o que não conseguiu enviar fica no localStorage do celular e sai
// sozinho quando a rede volta ou quando a tela abre de novo.
// A foto vai junto, comprimida (~150 KB) como data URL; a fila guarda no
// máximo 10 leituras. O client_uuid faz o reenvio não duplicar no servidor.
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';

export interface LeituraPendente {
  client_uuid: string;
  placa: string;
  km: number;
  lida_em: string;
  foto_data_url: string | null;
  foto_url?: string | null;   // já subiu a foto numa tentativa anterior
  lat?: number | null;
  lng?: number | null;
}

const CHAVE = 'frota-fila-leituras';
export const MAX_FILA = 10;

export function lerFila(): LeituraPendente[] {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { return []; }
}
function gravarFila(f: LeituraPendente[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(f.slice(-MAX_FILA))); } catch { /* cota cheia: segue */ }
}
export function enfileirar(l: LeituraPendente): boolean {
  const f = lerFila().filter((x) => x.client_uuid !== l.client_uuid);
  if (f.length >= MAX_FILA) return false;
  f.push(l);
  gravarFila(f);
  return true;
}

export function semRede(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return e instanceof TypeError || /fetch|network|load failed/i.test(String((e as Error)?.message || ''));
}

function dataUrlParaBlob(u: string): Blob {
  const [cab, b64] = u.split(',');
  const tipo = /data:([^;]+)/.exec(cab)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo });
}

/** Sobe a foto para o storage (bucket público `anexos`) e devolve a URL. */
export async function subirFoto(placa: string, uuid: string, foto: Blob): Promise<string> {
  const caminho = `frota/leituras/${placa}/${uuid}.jpg`;
  const { error } = await supabase.storage.from('anexos').upload(caminho, foto, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('anexos').getPublicUrl(caminho).data.publicUrl;
}

export type RespostaLeitura = { ok?: boolean; situacao?: 'aceita' | 'suspeita'; motivos?: string[]; error?: string; migracaoFaltando?: boolean };

/** Envia uma leitura (sobe a foto se ainda não subiu). Lança em falha de rede. */
export async function enviarLeitura(l: LeituraPendente, foto?: Blob | null): Promise<RespostaLeitura> {
  let fotoUrl = l.foto_url || null;
  if (!fotoUrl) {
    const blob = foto || (l.foto_data_url ? dataUrlParaBlob(l.foto_data_url) : null);
    if (blob) fotoUrl = await subirFoto(l.placa, l.client_uuid, blob);
  }
  const r = await fetch('/api/frota/leituras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ placa: l.placa, km: l.km, lida_em: l.lida_em, foto_url: fotoUrl, client_uuid: l.client_uuid, lat: l.lat, lng: l.lng }),
  });
  const j = (await r.json().catch(() => ({}))) as RespostaLeitura;
  if (!r.ok && !j.error) j.error = `Falha ao salvar (${r.status}).`;
  return j;
}

/** Tenta enviar tudo o que está na fila. Devolve quantas saíram. */
export async function drenarFila(): Promise<number> {
  const fila = lerFila();
  if (!fila.length) return 0;
  const restam: LeituraPendente[] = [];
  let enviadas = 0;
  for (const l of fila) {
    try {
      const r = await enviarLeitura(l);
      if (r.migracaoFaltando) { restam.push(l); continue; } // espera a migration
      enviadas++;            // aceita, suspeita ou erro de validação: sai da fila
    } catch {
      restam.push(l);        // ainda sem rede
    }
  }
  gravarFila(restam);
  return enviadas;
}

/** Comprime a foto da câmera: lado maior 1280 px, JPEG 0,7. */
export async function comprimirFoto(arquivo: File): Promise<{ blob: Blob; dataUrl: string }> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Não deu para abrir a foto.'));
      i.src = url;
    });
    const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    return { blob: dataUrlParaBlob(dataUrl), dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
