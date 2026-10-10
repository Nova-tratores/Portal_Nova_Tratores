// Modelos fiscais dos itens de serviço — BANCO (service role).
// Tabelas de sql/pos-modelos-fiscais.sql. Regras dos campos: ./modelo-fiscal.ts
import { supabase } from './supabase';
import { validarCampos, type CamposFiscais } from './modelo-fiscal';

export class ModelosFiscaisFaltando extends Error {
  constructor() { super('Falta aplicar a migration sql/pos-modelos-fiscais.sql no banco.'); this.name = 'ModelosFiscaisFaltando'; }
}

export interface ModeloFiscal {
  id: string;
  nome: string;
  descricao: string | null;
  campos: CamposFiscais;
  padrao: boolean;
  atualizadoPor: string | null;
  atualizadoEm: string;
}
export interface VinculoModelo {
  documento: string;
  modeloId: string;
  clienteNome: string | null;
  atualizadoPor: string | null;
  atualizadoEm: string;
}

function tabelaFaltando(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(err.message || ''));
}
function falhou(err: { code?: string; message?: string } | null): never {
  if (tabelaFaltando(err)) throw new ModelosFiscaisFaltando();
  throw new Error(err?.message || 'Erro no banco');
}

export const soDocumento = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function paraModelo(r: Record<string, unknown>): ModeloFiscal {
  return {
    id: String(r.id), nome: String(r.nome), descricao: (r.descricao as string) || null,
    campos: validarCampos(r.campos).campos, padrao: !!r.padrao,
    atualizadoPor: (r.atualizado_por as string) || null, atualizadoEm: String(r.atualizado_em),
  };
}

export async function listarModelos(): Promise<ModeloFiscal[]> {
  const { data, error } = await supabase.from('pos_modelos_fiscais').select('*').eq('ativo', true).order('padrao', { ascending: false }).order('nome');
  if (error) falhou(error);
  return (data || []).map(paraModelo);
}

export async function listarVinculos(): Promise<VinculoModelo[]> {
  const { data, error } = await supabase.from('pos_modelo_fiscal_clientes').select('*').order('cliente_nome');
  if (error) falhou(error);
  return (data || []).map((r) => ({
    documento: String(r.documento), modeloId: String(r.modelo_id), clienteNome: r.cliente_nome || null,
    atualizadoPor: r.atualizado_por || null, atualizadoEm: String(r.atualizado_em),
  }));
}

/** Cria ou atualiza. `padrao: true` tira o padrão do anterior. */
export async function salvarModelo(
  dados: { id?: string | null; nome: string; descricao?: string | null; campos: unknown; padrao?: boolean },
  usuario: string,
): Promise<{ ok: true; modelo: ModeloFiscal } | { ok: false; erros: string[] }> {
  const nome = String(dados.nome || '').trim().slice(0, 80);
  if (!nome) return { ok: false, erros: ['Dê um nome ao modelo.'] };
  const { campos, erros } = validarCampos(dados.campos);
  if (erros.length) return { ok: false, erros };

  if (dados.padrao) {
    const q = supabase.from('pos_modelos_fiscais').update({ padrao: false }).eq('padrao', true);
    const { error } = dados.id ? await q.neq('id', dados.id) : await q;
    if (error) falhou(error);
  }
  const linha = {
    nome, descricao: String(dados.descricao || '').trim().slice(0, 300) || null, campos,
    padrao: !!dados.padrao, atualizado_por: usuario, atualizado_em: new Date().toISOString(),
  };
  const { data, error } = dados.id
    ? await supabase.from('pos_modelos_fiscais').update(linha).eq('id', dados.id).eq('ativo', true).select('*').single()
    : await supabase.from('pos_modelos_fiscais').insert({ ...linha, criado_por: usuario }).select('*').single();
  if (error) {
    if (error.code === '23505') return { ok: false, erros: ['Já existe um modelo com esse nome.'] };
    falhou(error);
  }
  return { ok: true, modelo: paraModelo(data as Record<string, unknown>) };
}

/** Desativa (não apaga: OS já faturadas guardam o nome no registro). Remove os vínculos. */
export async function desativarModelo(id: string, usuario: string): Promise<void> {
  const { error } = await supabase.from('pos_modelos_fiscais')
    .update({ ativo: false, padrao: false, atualizado_por: usuario, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) falhou(error);
  const { error: e2 } = await supabase.from('pos_modelo_fiscal_clientes').delete().eq('modelo_id', id);
  if (e2) falhou(e2);
}

/** Vincula (ou desvincula, com modeloId null) o modelo a um cliente pelo CNPJ/CPF. */
export async function vincularCliente(documento: string, modeloId: string | null, clienteNome: string | null, usuario: string): Promise<string | null> {
  const doc = soDocumento(documento);
  if (doc.length !== 11 && doc.length !== 14) return 'CNPJ/CPF inválido.';
  if (!modeloId) {
    const { error } = await supabase.from('pos_modelo_fiscal_clientes').delete().eq('documento', doc);
    if (error) falhou(error);
    return null;
  }
  const { error } = await supabase.from('pos_modelo_fiscal_clientes').upsert({
    documento: doc, modelo_id: modeloId, cliente_nome: clienteNome ? String(clienteNome).slice(0, 120) : null,
    atualizado_por: usuario, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'documento' });
  if (error) falhou(error);
  return null;
}

/** Modelo que vale para o cliente: o vinculado ao CNPJ, senão o Padrão. */
export async function modeloDoCliente(documento: string | null | undefined): Promise<{ modelo: ModeloFiscal | null; origem: 'cliente' | 'padrao' | null }> {
  const doc = soDocumento(documento);
  if (doc) {
    const { data, error } = await supabase.from('pos_modelo_fiscal_clientes').select('modelo_id').eq('documento', doc).maybeSingle();
    if (error) falhou(error);
    if (data?.modelo_id) {
      const { data: m, error: e2 } = await supabase.from('pos_modelos_fiscais').select('*').eq('id', data.modelo_id).eq('ativo', true).maybeSingle();
      if (e2) falhou(e2);
      if (m) return { modelo: paraModelo(m), origem: 'cliente' };
    }
  }
  const { data: p, error: e3 } = await supabase.from('pos_modelos_fiscais').select('*').eq('padrao', true).eq('ativo', true).maybeSingle();
  if (e3) falhou(e3);
  return p ? { modelo: paraModelo(p), origem: 'padrao' } : { modelo: null, origem: null };
}

export async function lerModelo(id: string): Promise<ModeloFiscal | null> {
  const { data, error } = await supabase.from('pos_modelos_fiscais').select('*').eq('id', id).eq('ativo', true).maybeSingle();
  if (error) falhou(error);
  return data ? paraModelo(data) : null;
}
