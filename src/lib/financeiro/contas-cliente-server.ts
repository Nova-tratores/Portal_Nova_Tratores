// Servidor da tela /financeiro/contas-cliente (09/11/2026): busca da pessoa no
// cadastro Omie (NOVA + CASTRO juntas pelo CPF/CNPJ), títulos a pagar e a
// receber do ESPELHO (contas_pagar / contas_receber) e a regra de juros por empresa.
// Nada aqui escreve na Omie.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { STATUS_ABERTO, ultimaSincronizacao } from '@/lib/ajustes/contas';
import { REGRA_PADRAO, normalizarRegra, type RegraJuros } from './divida';

export type ContaOmie = 'NOVA' | 'CASTRO';
export const CONTAS: ContaOmie[] = ['NOVA', 'CASTRO'];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function contaDaEmpresa(empresa: string): ContaOmie | null {
  const e = normalizar(empresa || '');
  if (e.startsWith('nova')) return 'NOVA';
  if (e.startsWith('castro')) return 'CASTRO';
  return null;
}

// ---------------------------------------------------------------- busca
interface Cadastro {
  cod: number; conta: ContaOmie; nome: string; fantasia: string | null; documento: string | null;
  cidade: string | null; estado: string | null; telefone: string | null; email: string | null; inativo: boolean;
  _nome: string; _dig: string;
}

const TTL = 5 * 60_000;
let cache: Cadastro[] | null = null;
let cacheEm = 0;

async function carregarCadastros(): Promise<Cadastro[]> {
  if (cache && Date.now() - cacheEm < TTL) return cache;
  const out: Cadastro[] = [];
  const PAG = 1000;
  for (let de = 0; ; de += PAG) {
    const { data, error } = await supabaseAdmin
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, cidade, estado, telefone, email, inativo')
      .order('cod_cli').order('empresa')
      .range(de, de + PAG - 1);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const conta = contaDaEmpresa(String(c.empresa || ''));
      if (!conta) continue;
      out.push({
        cod: Number(c.cod_cli), conta,
        nome: c.razao_social || c.nome_fantasia || `Cadastro ${c.cod_cli}`,
        fantasia: c.nome_fantasia ?? null, documento: c.cnpj_cpf ?? null,
        cidade: c.cidade ?? null, estado: c.estado ?? null, telefone: c.telefone ?? null, email: c.email ?? null,
        inativo: c.inativo === true || c.inativo === 'S',
        _nome: normalizar(`${c.razao_social ?? ''} ${c.nome_fantasia ?? ''}`),
        _dig: String(c.cnpj_cpf ?? '').replace(/\D/g, ''),
      });
    }
    if ((data ?? []).length < PAG) break;
  }
  cache = out; cacheEm = Date.now();
  return out;
}

export interface Pessoa {
  chave: string;              // dígitos do documento, ou "NOVA:123" sem documento
  nome: string;
  fantasia: string | null;
  documento: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
  codigos: Record<ContaOmie, number[]>;
}

function agrupar(lista: Cadastro[]): Pessoa[] {
  const mapa = new Map<string, Pessoa>();
  for (const c of lista) {
    const chave = c._dig.length >= 11 ? c._dig : `${c.conta}:${c.cod}`;
    let p = mapa.get(chave);
    if (!p) {
      p = { chave, nome: c.nome, fantasia: c.fantasia, documento: c.documento, cidade: c.cidade, estado: c.estado,
        telefone: c.telefone, email: c.email, codigos: { NOVA: [], CASTRO: [] } };
      mapa.set(chave, p);
    }
    if (!p.codigos[c.conta].includes(c.cod)) p.codigos[c.conta].push(c.cod);
    p.telefone ||= c.telefone; p.email ||= c.email; p.cidade ||= c.cidade; p.estado ||= c.estado;
  }
  return [...mapa.values()];
}

/** Busca por nome (sem acento) ou documento; devolve pessoas agrupadas pelo CPF/CNPJ. */
export async function buscarPessoas(q: string): Promise<{ pessoas: Pessoa[]; total: number }> {
  const termo = q.trim();
  if (termo.length < 3) return { pessoas: [], total: 0 };
  const base = await carregarCadastros();
  const alvo = normalizar(termo);
  const dig = termo.replace(/\D/g, '');
  const soDigitos = dig.length >= 3 && dig.length === termo.replace(/[\s./-]/g, '').length;
  const achados = base.filter((c) => (soDigitos ? c._dig.includes(dig) : c._nome.includes(alvo) || (dig.length >= 6 && c._dig.includes(dig))));
  // agrupa com TODOS os cadastros do mesmo documento (inclusive o da outra empresa que não casou no nome)
  const docs = new Set(achados.map((c) => c._dig).filter((d) => d.length >= 11));
  const comIrmaos = base.filter((c) => achados.includes(c) || (c._dig.length >= 11 && docs.has(c._dig)));
  const pessoas = agrupar(comIrmaos);
  return { pessoas: pessoas.slice(0, 25), total: pessoas.length };
}

/** Uma pessoa pela chave (documento ou CONTA:cod) — usado no deep-link ?doc=. */
export async function pessoaPorChave(chave: string): Promise<Pessoa | null> {
  const base = await carregarCadastros();
  const dig = chave.replace(/\D/g, '');
  const m = /^(NOVA|CASTRO):(\d+)$/.exec(chave);
  const lista = m ? base.filter((c) => c.conta === m[1] && c.cod === Number(m[2]))
    : dig.length >= 11 ? base.filter((c) => c._dig === dig) : [];
  return lista.length ? agrupar(lista)[0] : null;
}

// ---------------------------------------------------------------- títulos
export interface TituloConta {
  id: string;                // "<tipo>:<conta>:<codigo_lancamento>"
  tipo: 'receber' | 'pagar';
  conta: ContaOmie;
  codigoLancamento: number;
  codigoCliente: number | null;
  numeroDoc: string | null;
  notaFiscal: string | null;
  parcela: string | null;
  emissao: string | null;
  vencimento: string | null;
  previsao: string | null;
  pagamento: string | null;
  valorDocumento: number;
  valorPago: number;
  valorAberto: number;
  status: string;
  aberto: boolean;
  categoria: string | null;
  observacao: string | null;
  origem: string | null;
}

interface LinhaEspelho {
  codigo_lancamento: number | string; codigo_cliente_fornecedor: number | string | null;
  numero_documento: string | null; numero_documento_fiscal: string | null; numero_parcela: string | null;
  data_emissao: string | null; data_vencimento: string | null; data_previsao: string | null; data_pagamento: string | null;
  valor_documento: number | string | null; valor_pago: number | string | null; status_titulo: string | null;
  descricao_categoria: string | null; observacao: string | null; id_origem: string | null;
}

const COLS = 'codigo_lancamento, conta_omie, codigo_cliente_fornecedor, numero_documento, numero_documento_fiscal, numero_parcela, data_emissao, data_vencimento, data_previsao, data_pagamento, valor_documento, valor_pago, status_titulo, descricao_categoria, observacao, id_origem:raw->>id_origem';

async function lerTabela(tipo: 'receber' | 'pagar', conta: ContaOmie, cods: number[], o: { situacao: 'abertos' | 'todos'; de?: string; ate?: string }): Promise<TituloConta[]> {
  if (!cods.length) return [];
  const tabela = tipo === 'receber' ? 'contas_receber' : 'contas_pagar';
  const out: TituloConta[] = [];
  const PAG = 1000;
  for (let de = 0; ; de += PAG) {
    let q = supabaseAdmin.from(tabela).select(COLS).eq('conta_omie', conta).in('codigo_cliente_fornecedor', cods);
    if (o.situacao === 'abertos') q = q.in('status_titulo', STATUS_ABERTO);
    else {
      if (o.de) q = q.gte('data_vencimento', o.de);
      if (o.ate) q = q.lte('data_vencimento', o.ate);
    }
    const { data, error } = await q.order('codigo_lancamento').range(de, de + PAG - 1);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as LinhaEspelho[]) {
      const doc = Number(r.valor_documento) || 0;
      const pago = Number(r.valor_pago) || 0;
      const status = String(r.status_titulo || '');
      const aberto = STATUS_ABERTO.includes(status);
      out.push({
        id: `${tipo}:${conta}:${r.codigo_lancamento}`,
        tipo, conta,
        codigoLancamento: Number(r.codigo_lancamento),
        codigoCliente: r.codigo_cliente_fornecedor != null ? Number(r.codigo_cliente_fornecedor) : null,
        numeroDoc: r.numero_documento || null,
        notaFiscal: r.numero_documento_fiscal || null,
        parcela: r.numero_parcela || null,
        emissao: r.data_emissao || null,
        vencimento: r.data_vencimento || null,
        previsao: r.data_previsao || null,
        pagamento: r.data_pagamento || null,
        valorDocumento: doc,
        valorPago: pago,
        valorAberto: aberto ? Math.max(0, Math.round((doc - pago) * 100) / 100) : 0,
        status, aberto,
        categoria: r.descricao_categoria || null,
        observacao: r.observacao || null,
        origem: r.id_origem || null,
      });
    }
    if ((data ?? []).length < PAG) break;
  }
  return out;
}

export async function titulosDaPessoa(codigos: Record<ContaOmie, number[]>, o: { situacao: 'abertos' | 'todos'; de?: string; ate?: string }) {
  const tarefas: Promise<TituloConta[]>[] = [];
  for (const conta of CONTAS) for (const tipo of ['receber', 'pagar'] as const) tarefas.push(lerTabela(tipo, conta, codigos[conta] || [], o));
  const sinc: Promise<[string, string | null]>[] = [];
  for (const conta of CONTAS) {
    if (!codigos[conta]?.length) continue;
    for (const tipo of ['receber', 'pagar'] as const) sinc.push(ultimaSincronizacao(tipo, conta).then((s) => [`${tipo}:${conta}`, s]));
  }
  const [listas, sincs] = await Promise.all([Promise.all(tarefas), Promise.all(sinc)]);
  const titulos = listas.flat().sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
  return { titulos, sincronizadoEm: Object.fromEntries(sincs) as Record<string, string | null> };
}

// ---------------------------------------------------------------- regra
const faltaTabela = (msg: string) => /financeiro_regra_juros|does not exist|schema cache|PGRST205|42P01/i.test(msg);

export async function lerRegras(): Promise<{ regras: Record<ContaOmie, RegraJuros & { atualizado_por?: string | null; atualizado_em?: string | null }>; migracaoFaltando: boolean }> {
  const padrao = { NOVA: { ...REGRA_PADRAO }, CASTRO: { ...REGRA_PADRAO } };
  const { data, error } = await supabaseAdmin.from('financeiro_regra_juros').select('*');
  if (error) {
    if (faltaTabela(error.message)) return { regras: padrao, migracaoFaltando: true };
    throw new Error(error.message);
  }
  const regras: Record<ContaOmie, RegraJuros & { atualizado_por?: string | null; atualizado_em?: string | null }> = { ...padrao };
  for (const r of data ?? []) {
    const c = String(r.conta_omie) as ContaOmie;
    if (!CONTAS.includes(c)) continue;
    regras[c] = { ...normalizarRegra(r), atualizado_por: r.atualizado_por ?? null, atualizado_em: r.atualizado_em ?? null };
  }
  return { regras, migracaoFaltando: false };
}

export async function salvarRegra(conta: ContaOmie, regra: RegraJuros, autor: string): Promise<{ antes: RegraJuros | null; depois: RegraJuros }> {
  const { data: atual, error: e1 } = await supabaseAdmin.from('financeiro_regra_juros').select('*').eq('conta_omie', conta).maybeSingle();
  if (e1) throw Object.assign(new Error(e1.message), { migracaoFaltando: faltaTabela(e1.message) });
  const depois = normalizarRegra(regra);
  const { error } = await supabaseAdmin.from('financeiro_regra_juros').upsert({
    conta_omie: conta, ...depois, atualizado_por: autor, atualizado_em: new Date().toISOString(),
  });
  if (error) throw Object.assign(new Error(error.message), { migracaoFaltando: faltaTabela(error.message) });
  return { antes: atual ? normalizarRegra(atual) : null, depois };
}
