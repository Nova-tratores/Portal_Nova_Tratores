/* eslint-disable @typescript-eslint/no-explicit-any */
// Etiquetas de peças (Feature B — núcleo). Fila compartilhada + folhas (snapshot).
// Escrita só via service role (rotas /api/ppv/etiquetas/*). A locação vem das
// características #PRATELEIRA/#ANDAR/#CAIXA (JSONB de produtos_caracteristicas),
// lida AO VIVO na hora de imprimir e congelada no snapshot da folha.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export interface AutorEtiqueta { userId?: string; userName: string }
export interface ItemFila { id: number; empresa: string; codigo_produto: string; codigo: string | null; descricao: string | null; quantidade: number; criado_nome: string | null; criado_em: string }
export interface ItemFolha { empresa: string; codigo: string; descricao: string; locacao: string }
export interface Folha { id: number; papel: string; inicio_posicao: number; total_etiquetas: number; itens: ItemFolha[]; criado_nome: string | null; criado_em: string }

function norm(s: string): string { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
function getCar(car: Record<string, any> | undefined, canon: string): string {
  if (!car) return '';
  const alvo = norm(canon);
  for (const k of Object.keys(car)) if (norm(k) === alvo) return String(car[k] ?? '');
  return '';
}
// locação legível a partir do JSONB de características (coalesce das secundárias)
function locacaoDe(car: Record<string, any> | undefined): string {
  const prat = getCar(car, '#PRATELEIRA').trim();
  const andar = (getCar(car, '#ANDAR') || getCar(car, '#ANDAR2')).trim();
  const caixa = (getCar(car, '#CAIXA') || getCar(car, '#CAIXA2')).trim();
  return [prat, andar, caixa].filter(Boolean).join(' ');
}

// ---------- fila ----------
export async function listarFila(): Promise<ItemFila[]> {
  const { data, error } = await supabase.from('etiquetas_fila')
    .select('id, empresa, codigo_produto, codigo, descricao, quantidade, criado_nome, criado_em')
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data || []) as ItemFila[];
}
export async function adicionarFila(it: { empresa: string; codigo_produto: string | number; codigo?: string; descricao?: string; quantidade?: number }, autor?: AutorEtiqueta): Promise<ItemFila> {
  const row = {
    empresa: String(it.empresa).toUpperCase(),
    codigo_produto: String(it.codigo_produto),
    codigo: it.codigo ?? null,
    descricao: it.descricao ?? null,
    quantidade: Math.max(1, Number(it.quantidade) || 1),
    criado_por: autor?.userId ?? null,
    criado_nome: autor?.userName ?? null,
  };
  const { data, error } = await supabase.from('etiquetas_fila').insert(row).select().single();
  if (error) throw error;
  return data as ItemFila;
}
export async function atualizarQtd(id: number, quantidade: number): Promise<void> {
  const q = Math.max(1, Number(quantidade) || 1);
  const { error } = await supabase.from('etiquetas_fila').update({ quantidade: q }).eq('id', id);
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

// lê a locação atual (por empresa+codigo_produto) para um conjunto de itens
async function mapaLocacao(itens: ItemFila[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  // agrupa por empresa para consultar em lote via .in()
  const porEmpresa = new Map<string, string[]>();
  for (const it of itens) {
    const arr = porEmpresa.get(it.empresa) || porEmpresa.set(it.empresa, []).get(it.empresa)!;
    arr.push(String(it.codigo_produto));
  }
  for (const [empresa, cps] of porEmpresa) {
    // dedup
    const unicos = Array.from(new Set(cps));
    for (let i = 0; i < unicos.length; i += 200) {
      const fatia = unicos.slice(i, i + 200);
      const { data, error } = await supabase.from('produtos_caracteristicas')
        .select('codigo_produto, caracteristicas')
        .eq('conta_omie', empresa)
        .in('codigo_produto', fatia);
      if (error) throw error;
      for (const r of (data || []) as any[]) mapa.set(`${empresa}|${String(r.codigo_produto)}`, locacaoDe(r.caracteristicas));
    }
  }
  return mapa;
}

// ---------- folhas ----------
// Gera uma folha a partir da fila atual: enriquece a locação, expande por
// quantidade, grava o snapshot, ESVAZIA a fila e devolve a folha (com html).
export async function imprimirFilaComoFolha(opts: { papel: string; inicio: number }, autor?: AutorEtiqueta): Promise<Folha> {
  const fila = await listarFila();
  if (fila.length === 0) throw new Error('Fila vazia');
  const loc = await mapaLocacao(fila);
  const itens: ItemFolha[] = [];
  for (const it of fila) {
    const locacao = loc.get(`${it.empresa}|${String(it.codigo_produto)}`) || '';
    for (let n = 0; n < Math.max(1, it.quantidade); n++) {
      itens.push({ empresa: it.empresa, codigo: it.codigo || String(it.codigo_produto), descricao: it.descricao || '', locacao });
    }
  }
  const papel = opts.papel === 'comum' ? 'comum' : '3x10';
  const inicio = Math.min(30, Math.max(1, Number(opts.inicio) || 1));
  const { data, error } = await supabase.from('etiquetas_folhas').insert({
    papel, inicio_posicao: inicio, total_etiquetas: itens.length, itens,
    criado_por: autor?.userId ?? null, criado_nome: autor?.userName ?? null,
  }).select().single();
  if (error) throw error;
  await limparFila();
  return data as Folha;
}
export async function listarFolhas(limite = 100): Promise<Omit<Folha, 'itens'>[]> {
  const { data, error } = await supabase.from('etiquetas_folhas')
    .select('id, papel, inicio_posicao, total_etiquetas, criado_nome, criado_em')
    .order('criado_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data || []) as any;
}
export async function getFolha(id: number): Promise<Folha | null> {
  const { data, error } = await supabase.from('etiquetas_folhas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Folha) || null;
}

// ---------- HTML da folha (3×10 Pimaco/Avery 6180 ou papel comum) ----------
function esc(s: string): string { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)); }
export function gerarHtmlFolha(folha: Folha): string {
  const comum = folha.papel === 'comum';
  const inicio = Math.min(30, Math.max(1, folha.inicio_posicao || 1));
  const celulas: string[] = [];
  // células em branco puladas
  for (let i = 1; i < inicio; i++) celulas.push(`<div class="cel vazia"></div>`);
  for (const it of folha.itens) {
    celulas.push(`<div class="cel${comum ? ' comum' : ''}">
      <div class="emp">${esc(it.empresa)}</div>
      <div class="cod">${esc(it.codigo)}</div>
      <div class="desc">${esc((it.descricao || '').slice(0, 60))}</div>
      <div class="loc">${it.locacao ? '&#128205; ' + esc(it.locacao) : '<span class="semloc">sem locação</span>'}</div>
    </div>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas — folha ${folha.id}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .folha { width: 210mm; padding: 12.7mm 4.76mm 0; }
  .grade { display: grid; grid-template-columns: repeat(3, 66.7mm); column-gap: 2mm; row-gap: 0; }
  .cel { width: 66.7mm; height: 25.4mm; padding: 1.5mm 3mm; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
  .cel.comum { border: 1px dashed #94a3b8; }
  .cel .emp { font-size: 7pt; font-weight: 800; letter-spacing: .5px; color: #334155; }
  .cel .cod { font-size: 12pt; font-weight: 800; color: #0f172a; line-height: 1.05; }
  .cel .desc { font-size: 7pt; color: #475569; line-height: 1.15; max-height: 8mm; overflow: hidden; }
  .cel .loc { font-size: 8.5pt; font-weight: 700; color: #1d4ed8; margin-top: .5mm; }
  .cel .semloc { color: #b45309; font-weight: 600; }
  .aviso { padding: 6mm; font-size: 9pt; color: #64748b; }
  @media screen { body { background: #e2e8f0; } .folha { background: #fff; margin: 10px auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); min-height: 297mm; } }
</style></head><body>
  <div class="folha">
    ${folha.itens.length === 0 ? '<div class="aviso">Folha sem etiquetas.</div>' : `<div class="grade">${celulas.join('')}</div>`}
  </div>
</body></html>`;
}
