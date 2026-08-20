/* eslint-disable @typescript-eslint/no-explicit-any */
// Fila de etiquetas COMPARTILHADA + histórico de folhas (Feature B — lacunas).
// Complementa o EtiquetasPanel (que já existia): a fila deixa de ser local e
// passa a ser persistida/compartilhada, e cada impressão vira uma "folha" no
// histórico (snapshot p/ reimprimir). Escrita só via service role.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export interface AutorEtiqueta { userId?: string; userName: string }
export interface LinhaEtiqueta { conta: string; empresa: string; codigo: string; descricao: string; locacao: string }
export interface ItemFila { id: number; linhas: LinhaEtiqueta[]; copias: number; criado_nome: string | null; criado_em: string }
export interface ItemFolha { linhas: LinhaEtiqueta[]; numero?: string; unidade_id?: string }
export interface Folha { id: number; formato: string; rastreado: boolean; usadas: number[]; total: number; itens: ItemFolha[]; criado_nome: string | null; criado_em: string }

// ---------- fila ----------
export async function listarFila(): Promise<ItemFila[]> {
  const { data, error } = await supabase.from('etiquetas_fila')
    .select('id, linhas, copias, criado_nome, criado_em')
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data || []) as ItemFila[];
}
export async function adicionarFila(linhas: LinhaEtiqueta[], copias: number, autor?: AutorEtiqueta): Promise<ItemFila> {
  if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('linhas obrigatórias');
  if (linhas.length > 2) throw new Error('máximo de 2 peças por etiqueta');
  const { data, error } = await supabase.from('etiquetas_fila').insert({
    linhas, copias: Math.min(50, Math.max(1, Number(copias) || 1)),
    criado_por: autor?.userId ?? null, criado_nome: autor?.userName ?? null,
  }).select('id, linhas, copias, criado_nome, criado_em').single();
  if (error) throw error;
  return data as ItemFila;
}

// Adiciona VÁRIAS etiquetas de uma vez (seleção múltipla no painel) num único insert —
// pra etiquetar uma prateleira inteira sem clicar peça por peça. Cada item vira sua
// própria etiqueta; `copias` é aplicado a todas.
export async function adicionarVarias(itens: { linhas: LinhaEtiqueta[]; copias?: number }[], autor?: AutorEtiqueta): Promise<ItemFila[]> {
  const rows = (Array.isArray(itens) ? itens : [])
    .filter(it => Array.isArray(it?.linhas) && it.linhas.length >= 1 && it.linhas.length <= 2)
    .map(it => ({
      linhas: it.linhas,
      copias: Math.min(50, Math.max(1, Number(it.copias) || 1)),
      criado_por: autor?.userId ?? null, criado_nome: autor?.userName ?? null,
    }));
  if (rows.length === 0) throw new Error('nenhum item válido (1 a 2 peças por etiqueta)');
  const { data, error } = await supabase.from('etiquetas_fila')
    .insert(rows)
    .select('id, linhas, copias, criado_nome, criado_em')
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []) as ItemFila[];
}
export async function atualizarCopias(id: number, copias: number): Promise<void> {
  const { error } = await supabase.from('etiquetas_fila')
    .update({ copias: Math.min(50, Math.max(1, Number(copias) || 1)) }).eq('id', id);
  if (error) throw error;
}
export async function removerFila(id: number): Promise<void> {
  const { error } = await supabase.from('etiquetas_fila').delete().eq('id', id);
  if (error) throw error;
}
export async function limparFila(): Promise<void> {
  const { error } = await supabase.from('etiquetas_fila').delete().neq('id', 0);
  if (error) throw error;
}

// ---------- folhas (histórico) ----------
export async function registrarFolha(f: { formato?: string; rastreado?: boolean; usadas?: number[]; itens: ItemFolha[] }, autor?: AutorEtiqueta): Promise<Folha> {
  const itens = Array.isArray(f.itens) ? f.itens : [];
  const { data, error } = await supabase.from('etiquetas_folhas').insert({
    formato: f.formato === 'recorte' ? 'recorte' : 'folha',
    rastreado: !!f.rastreado,
    usadas: Array.isArray(f.usadas) ? f.usadas : [],
    total: itens.length,
    itens,
    criado_por: autor?.userId ?? null, criado_nome: autor?.userName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as Folha;
}
export async function listarFolhas(limite = 60): Promise<Omit<Folha, 'itens'>[]> {
  const { data, error } = await supabase.from('etiquetas_folhas')
    .select('id, formato, rastreado, usadas, total, criado_nome, criado_em')
    .order('criado_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data || []) as any;
}
export async function getFolha(id: number): Promise<Folha | null> {
  const { data, error } = await supabase.from('etiquetas_folhas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Folha) || null;
}
