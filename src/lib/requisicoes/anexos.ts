// Helpers dos anexos de uma requisição, compartilhados entre a capa do card e o
// modal completo (antes só existiam dentro do CardReq).
import { supabase } from '@/lib/supabase';

export const CAMPOS_ANEXO = [
  { field: 'foto_nf', label: 'Nota Fiscal' },
  { field: 'boleto_fornecedor', label: 'Boleto' },
  { field: 'recibo_fornecedor', label: 'Recibo / Outros' },
] as const;

// Arquivo antigo do Google Drive (prefixo abaixo) não tem URL direta — o link é
// resolvido por JSONP numa aba nova, então não dá pra baixar/imprimir aqui.
export const ehDoDrive = (v: any) => String(v || '').startsWith('SupaAtualizarReq_Images/');

export function getUrlAnexo(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (caminho.startsWith('http')) return caminho;
  if (ehDoDrive(caminho)) return null;
  return supabase.storage.from('requisicoes').getPublicUrl(caminho).data.publicUrl;
}

export interface AnexoDaReq { field: string; label: string; url: string }

/** Anexos com URL utilizável (fora os do Drive antigo). */
export function anexosDaReq(dados: any): AnexoDaReq[] {
  return CAMPOS_ANEXO
    .map(c => ({ field: c.field as string, label: c.label as string, url: getUrlAnexo(dados?.[c.field]) }))
    .filter((c): c is AnexoDaReq => Boolean(c.url));
}

/** Anexos que existem, mas ficaram presos no Drive antigo. */
export function anexosNoDrive(dados: any) {
  return CAMPOS_ANEXO.filter(c => ehDoDrive(dados?.[c.field]));
}
