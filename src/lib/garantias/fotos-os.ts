import { supabase } from '@/lib/pos/supabase';
import { FOTOS_OS } from './constants';

export interface FotoOS {
  chave: string;
  label: string;
  url: string;
}

// Fotos do relatório técnico da OS: campos nomeados (FOTOS_OS) + FotosExtras.
// A grade de fotos do app virou livre — "Câmera"/"Galeria" gravam TUDO em
// FotosExtras — então quem lê só os campos nomeados perde o que o técnico
// anexou (caso real: OS-0640/GAR-0038, chassi e horímetro invisíveis).
// Pode haver mais de uma linha por OS (rascunhos): preferimos a 'enviado'
// mais recente e nunca usamos maybeSingle (estoura com 2+ linhas).
export async function listarFotosOS(idOrdem: string): Promise<FotoOS[]> {
  const { data: rows } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select(`IdOs, Status, FotosExtras, ${FOTOS_OS.map((f) => f.chave).join(', ')}`)
    .eq('Ordem_Servico', idOrdem)
    .order('IdOs', { ascending: false });
  // select dinâmico deixa o parser de tipos do supabase-js perdido — cast via unknown
  const lista = (rows || []) as unknown as Record<string, unknown>[];
  const tec = lista.find((t) => String(t.Status || '').toLowerCase() === 'enviado') || lista[0];
  if (!tec) return [];

  const fotos: FotoOS[] = [];
  for (const f of FOTOS_OS) {
    const url = String(tec[f.chave] || '');
    if (url && !url.startsWith('data:')) fotos.push({ chave: f.chave, label: f.label, url });
  }

  const raw = tec.FotosExtras;
  let extras: unknown[] = Array.isArray(raw) ? raw : [];
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) extras = p; } catch { /* ignora */ } }
  const vistas = new Set(fotos.map((f) => f.url));
  extras.map((x) => String(x || '')).filter((u) => u && !u.startsWith('data:')).forEach((url, i) => {
    if (!vistas.has(url)) {
      vistas.add(url);
      fotos.push({ chave: `FotoExtra${i + 1}`, label: `Extra ${i + 1}`, url });
    }
  });
  return fotos;
}
