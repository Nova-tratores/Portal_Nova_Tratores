import { supabase } from '@/lib/supabase';

// Valor (R$) a partir do qual a requisição fica bloqueada para edição
// sem permissão de um Dev. Acima deste valor = bloqueada.
export const LIMITE_BLOQUEIO = 500;

export interface Autorizacao {
  id: number;
  requisicao_id: number;
  solicitante_id: string | null;
  solicitante_nome: string | null;
  motivo: string;
  status: 'pendente' | 'aprovado' | 'recusado' | 'consumido';
  dev_id: string | null;
  dev_nome: string | null;
  criado_em: string;
  resolvido_em: string | null;
  consumido_em: string | null;
}

// Converte "1.550,00" / "1550,00" / "1550" / "1550.00" em número
export function parseValorBR(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  if (s.includes(',')) {
    // Formato BR: ponto = milhar, vírgula = decimal
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Formato numérico/americano: ponto = decimal
  return parseFloat(s) || 0;
}

// A requisição é de "valor alto" (acima do limite)?
export function isValorAlto(req: any): boolean {
  return parseValorBR(req?.valor_despeza) > LIMITE_BLOQUEIO;
}

// Procura uma autorização APROVADA e ainda não consumida para esta requisição
export async function buscarAutorizacaoAtiva(requisicaoId: number): Promise<Autorizacao | null> {
  const { data } = await supabase
    .from('requisicao_autorizacoes')
    .select('*')
    .eq('requisicao_id', requisicaoId)
    .eq('status', 'aprovado')
    .order('resolvido_em', { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

// Cria um pedido de permissão (status pendente)
export async function criarPedidoPermissao(params: {
  requisicaoId: number;
  solicitanteId?: string | null;
  solicitanteNome?: string | null;
  motivo: string;
}) {
  return supabase.from('requisicao_autorizacoes').insert({
    requisicao_id: params.requisicaoId,
    solicitante_id: params.solicitanteId || null,
    solicitante_nome: params.solicitanteNome || null,
    motivo: params.motivo,
    status: 'pendente',
  });
}

// Dev aprova um pedido
export async function aprovarPedido(id: number, devId: string, devNome: string) {
  return supabase
    .from('requisicao_autorizacoes')
    .update({ status: 'aprovado', dev_id: devId, dev_nome: devNome, resolvido_em: new Date().toISOString() })
    .eq('id', id);
}

// Dev recusa um pedido
export async function recusarPedido(id: number, devId: string, devNome: string) {
  return supabase
    .from('requisicao_autorizacoes')
    .update({ status: 'recusado', dev_id: devId, dev_nome: devNome, resolvido_em: new Date().toISOString() })
    .eq('id', id);
}

// Consome uma autorização (após a alteração) — volta a bloquear
export async function consumirAutorizacao(id: number) {
  return supabase
    .from('requisicao_autorizacoes')
    .update({ status: 'consumido', consumido_em: new Date().toISOString() })
    .eq('id', id);
}
