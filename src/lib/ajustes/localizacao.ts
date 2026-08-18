/* eslint-disable @typescript-eslint/no-explicit-any */
// Localização física de peças (Feature A — Visão por Localização).
//
// A localização de cada peça vive como características comuns da Omie dentro do
// JSONB `produtos_caracteristicas.caracteristicas`: #PRATELEIRA, #ANDAR, #CAIXA
// (primárias) + #ANDAR2, #CAIXA2 (encoding alternativo raro — ver Feature A).
// Não há coluna dedicada. Este módulo reusa `editarCaractProduto` (grava Omie +
// espelho + audit_log) para "mover/trocar o produto de uma posição".
//
// CUIDADO com o casing da chave: `editarCaractProduto` faz `car[nome] = valor` no
// JSONB do espelho. Se a Omie tiver gravado a chave com casing diferente do que
// passarmos, criaríamos uma chave DUPLICADA. Por isso resolvemos sempre a chave
// REAL já presente na linha (match sem acento/maiúsculas) e só caímos no nome
// canônico quando a peça ainda não tem aquela característica.
import { createClient } from '@supabase/supabase-js';
import { editarCaractProduto, type AutorEdicao } from './caracteristicas';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export type SlotLoc = 'prateleira' | 'andar' | 'caixa' | 'andar2' | 'caixa2';

// Nome canônico da característica por slot (usado quando a peça ainda não tem a chave).
const CANON: Record<SlotLoc, string> = {
  prateleira: '#PRATELEIRA', andar: '#ANDAR', caixa: '#CAIXA', andar2: '#ANDAR2', caixa2: '#CAIXA2',
};
const SLOTS_PRIMARIOS: SlotLoc[] = ['prateleira', 'andar', 'caixa'];
const SLOTS_SECUNDARIOS: SlotLoc[] = ['andar2', 'caixa2'];

function norm(s: string): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Lê a linha do espelho e devolve o mapa slot -> { key real na Omie, valor atual }.
async function lerSlots(empresa: string, codigoProduto: number | string): Promise<Record<SlotLoc, { key: string; valor: string }>> {
  const label = String(empresa).toUpperCase();
  const cp = Number(codigoProduto) || codigoProduto;
  const { data, error } = await supabase
    .from('produtos_caracteristicas')
    .select('caracteristicas')
    .eq('conta_omie', label)
    .eq('codigo_produto', cp)
    .maybeSingle();
  if (error) throw error;
  const car: Record<string, any> = (data && (data as any).caracteristicas) || {};
  // índice das chaves reais por nome normalizado
  const porNorm = new Map<string, string>();
  for (const k of Object.keys(car)) porNorm.set(norm(k), k);
  const out = {} as Record<SlotLoc, { key: string; valor: string }>;
  (Object.keys(CANON) as SlotLoc[]).forEach((slot) => {
    const real = porNorm.get(norm(CANON[slot]));
    out[slot] = real !== undefined
      ? { key: real, valor: car[real] == null ? '' : String(car[real]) }
      : { key: CANON[slot], valor: '' };
  });
  return out;
}

export interface AlvoProduto { empresa: string; codigo_produto: number | string }

// Limpa (esvazia) todas as chaves de localização que a peça REALMENTE tem preenchidas.
// Só toca no que existe/está não-vazio — evita Incluir com conteúdo vazio na Omie.
export async function liberarLocalizacao(alvo: AlvoProduto, autor?: AutorEdicao): Promise<{ limpou: string[] }> {
  const slots = await lerSlots(alvo.empresa, alvo.codigo_produto);
  const limpou: string[] = [];
  for (const slot of Object.keys(CANON) as SlotLoc[]) {
    const { key, valor } = slots[slot];
    if (valor.trim() !== '') {
      await editarCaractProduto(alvo.empresa, alvo.codigo_produto, key, '', autor, 'localizacao-liberar');
      limpou.push(key);
    }
  }
  return { limpou };
}

// Define a posição (prateleira/andar/caixa) numa peça. Normaliza: grava as 3
// primárias e ZERA #ANDAR2/#CAIXA2 se existirem (o encoding alternativo vira
// posição primária limpa). Usa a chave real da Omie para não duplicar no JSONB.
export async function definirLocalizacao(
  alvo: AlvoProduto,
  destino: { prateleira: string; andar: string; caixa: string },
  autor?: AutorEdicao,
): Promise<{ gravou: Record<string, string> }> {
  const slots = await lerSlots(alvo.empresa, alvo.codigo_produto);
  const valores: Record<SlotLoc, string> = {
    prateleira: (destino.prateleira ?? '').toString().trim(),
    andar: (destino.andar ?? '').toString().trim(),
    caixa: (destino.caixa ?? '').toString().trim(),
    andar2: '', caixa2: '',
  };
  const gravou: Record<string, string> = {};
  // primárias: sempre grava (mesmo vazio, para sobrescrever o que havia)
  for (const slot of SLOTS_PRIMARIOS) {
    const { key, valor } = slots[slot];
    if (valor === valores[slot]) continue; // sem mudança real
    await editarCaractProduto(alvo.empresa, alvo.codigo_produto, key, valores[slot], autor, 'localizacao-definir');
    gravou[key] = valores[slot];
  }
  // secundárias: só limpa se tinham valor (normalização)
  for (const slot of SLOTS_SECUNDARIOS) {
    const { key, valor } = slots[slot];
    if (valor.trim() !== '') {
      await editarCaractProduto(alvo.empresa, alvo.codigo_produto, key, '', autor, 'localizacao-definir');
      gravou[key] = '';
    }
  }
  return { gravou };
}
