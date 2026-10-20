// Banco da classificação comercial × não comercial das OS de serviço
// (tabela os_classificacao, sql/servicos-nao-comerciais.sql). Regras puras em
// servicos-classe.ts.
//
//   classificarOSServico — relê os itens das OS (os_servicos_itens) + nome do
//     cliente, aplica as regras e grava (origem 'regra'). OS movida à mão
//     (origem 'manual') NÃO é sobrescrita: só guarda o que a regra diria.
//   classesDasOS         — mapa ncod_os → classe (para filtrar itens/OS).
//   definirClasseManual  — mover uma OS de classe, ou voltar à regra (null).
// Sem a migration: tudo devolve vazio / { pulado } e o dashboard segue como antes.

import { supabase } from './supabase';
import { invalidarResumoVendas } from './resumo-cache';
import { classificarOS, type ClasseServico, type ItemParaClasse } from './servicos-classe';
import type { Conta } from './conta';

const TABELA = 'os_classificacao';

export interface ClasseDaOS {
  classe: ClasseServico;
  origem: 'regra' | 'manual';
  motivo: string | null;
  classeRegra: ClasseServico | null;
  alteradoPorNome: string | null;
}

const tabelaFaltando = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /os_classificacao/.test(e.message || ''));

async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const linhas = (data || []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return out;
}

/** Nomes (fantasia e razão) dos clientes — a regra de seguro olha os dois. */
async function nomesClientes(codigos: number[]): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  for (let i = 0; i < codigos.length; i += 200) {
    const { data } = await supabase
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli,nome_fantasia,razao_social')
      .in('cod_cli', codigos.slice(i, i + 200));
    for (const c of (data || []) as Array<{ cod_cli: number; nome_fantasia: string | null; razao_social: string | null }>) {
      mapa.set(Number(c.cod_cli), [c.razao_social, c.nome_fantasia].filter(Boolean).join(' / '));
    }
  }
  return mapa;
}

export interface ResultadoClassificacao {
  pulado?: string;
  os: number;
  naoComerciais: number;
  manuaisPreservadas: number;
  /** OS e valor (soma dos itens) por classe que a regra deu. */
  porClasse: Partial<Record<ClasseServico, { os: number; valor: number }>>;
}

/**
 * Classifica as OS de uma conta. `filtro`: um mês ({mes, ano}), um ano ({ano})
 * ou tudo (undefined).
 */
export async function classificarOSServico(
  conta: Conta,
  filtro?: { mes?: number; ano: number },
  opts: { gravar?: boolean } = {},
): Promise<ResultadoClassificacao> {
  const gravar = opts.gravar !== false;
  type Item = { ncod_os: number; codigo_cliente: number | null; categoria: string | null; contrato: string | null; descricao: string | null; valor_total: number | string | null };
  const itens = await paginar<Item>((de, ate) => {
    let q = supabase.from('os_servicos_itens').select('ncod_os,codigo_cliente,categoria,contrato,descricao,valor_total').eq('conta_omie', conta);
    if (filtro) q = q.eq('ano', filtro.ano);
    if (filtro?.mes) q = q.eq('mes', filtro.mes);
    return q.order('id').range(de, ate);
  });
  const porOS = new Map<number, { cliente: number | null; itens: ItemParaClasse[]; valor: number }>();
  for (const it of itens) {
    if (!it.ncod_os) continue;
    let o = porOS.get(Number(it.ncod_os));
    if (!o) { o = { cliente: it.codigo_cliente, itens: [], valor: 0 }; porOS.set(Number(it.ncod_os), o); }
    o.itens.push(it);
    o.valor += Number(it.valor_total) || 0;
  }
  if (porOS.size === 0) return { os: 0, naoComerciais: 0, manuaisPreservadas: 0, porClasse: {} };

  const ncods = [...porOS.keys()];
  // Linhas manuais existentes: a regra não mexe nelas (só anota a classe_regra).
  const manuais = new Set<number>();
  for (let i = 0; i < ncods.length; i += 200) {
    const { data, error } = await supabase.from(TABELA).select('ncod_os').eq('conta_omie', conta).eq('origem', 'manual').in('ncod_os', ncods.slice(i, i + 200));
    if (error) {
      if (tabelaFaltando(error)) {
        if (gravar) return { pulado: 'migration sql/servicos-nao-comerciais.sql não aplicada', os: 0, naoComerciais: 0, manuaisPreservadas: 0, porClasse: {} };
        break; // simulação: segue sem saber das manuais
      }
      throw new Error(error.message);
    }
    for (const r of (data || []) as Array<{ ncod_os: number }>) manuais.add(Number(r.ncod_os));
  }

  const nomes = await nomesClientes([...new Set([...porOS.values()].map((o) => o.cliente).filter((c): c is number => !!c))]);
  const agora = new Date().toISOString();
  const regra: Array<Record<string, unknown>> = [];
  const soRegra: Array<{ ncod: number; classe: ClasseServico }> = [];
  let naoComerciais = 0;
  const porClasse: ResultadoClassificacao['porClasse'] = {};
  for (const [ncod, o] of porOS) {
    const r = classificarOS(o.itens, o.cliente ? nomes.get(Number(o.cliente)) ?? null : null);
    if (r.classe !== 'comercial') naoComerciais++;
    const pc = (porClasse[r.classe] ||= { os: 0, valor: 0 });
    pc.os++; pc.valor += o.valor;
    if (manuais.has(ncod)) { soRegra.push({ ncod, classe: r.classe }); continue; }
    regra.push({ conta_omie: conta, ncod_os: ncod, classe: r.classe, origem: 'regra', motivo: r.motivo || null, classe_regra: r.classe, atualizado_em: agora });
  }
  if (!gravar) return { os: porOS.size, naoComerciais, manuaisPreservadas: soRegra.length, porClasse };
  for (let i = 0; i < regra.length; i += 500) {
    const { error } = await supabase.from(TABELA).upsert(regra.slice(i, i + 500), { onConflict: 'conta_omie,ncod_os' });
    if (error) throw new Error('os_classificacao: ' + error.message);
  }
  for (const m of soRegra) {
    await supabase.from(TABELA).update({ classe_regra: m.classe }).eq('conta_omie', conta).eq('ncod_os', m.ncod);
  }
  invalidarResumoVendas();
  return { os: porOS.size, naoComerciais, manuaisPreservadas: soRegra.length, porClasse };
}

/** Classe de cada OS (só as que têm linha; OS sem linha = comercial). */
export async function classesDasOS(conta: string, ncods: number[]): Promise<Map<number, ClasseDaOS>> {
  const mapa = new Map<number, ClasseDaOS>();
  const unicos = [...new Set(ncods.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase
      .from(TABELA)
      .select('ncod_os,classe,origem,motivo,classe_regra,alterado_por_nome')
      .eq('conta_omie', conta)
      .in('ncod_os', unicos.slice(i, i + 200));
    if (error) {
      if (tabelaFaltando(error)) return mapa;
      throw new Error(error.message);
    }
    for (const r of (data || []) as Array<{ ncod_os: number; classe: ClasseServico; origem: 'regra' | 'manual'; motivo: string | null; classe_regra: ClasseServico | null; alterado_por_nome: string | null }>) {
      mapa.set(Number(r.ncod_os), { classe: r.classe, origem: r.origem, motivo: r.motivo, classeRegra: r.classe_regra, alteradoPorNome: r.alterado_por_nome });
    }
  }
  return mapa;
}

/** Move uma OS de classe à mão; `classe = null` volta para o que a regra diz. */
export async function definirClasseManual(
  conta: string,
  ncod: number,
  classe: ClasseServico | null,
  usuario: { id: string; nome: string },
): Promise<ClasseDaOS> {
  const { data: atual, error } = await supabase.from(TABELA).select('classe,classe_regra,motivo').eq('conta_omie', conta).eq('ncod_os', ncod).maybeSingle();
  if (error) throw Object.assign(new Error(tabelaFaltando(error) ? 'migracaoFaltando' : error.message), { status: tabelaFaltando(error) ? 503 : 500 });
  const classeRegra = ((atual?.classe_regra as ClasseServico | null) ?? 'comercial');
  const linha = classe == null
    ? { conta_omie: conta, ncod_os: ncod, classe: classeRegra, origem: 'regra', classe_regra: classeRegra, alterado_por: usuario.id, alterado_por_nome: usuario.nome, atualizado_em: new Date().toISOString() }
    : { conta_omie: conta, ncod_os: ncod, classe, origem: 'manual', classe_regra: classeRegra, motivo: atual?.motivo ?? null, alterado_por: usuario.id, alterado_por_nome: usuario.nome, atualizado_em: new Date().toISOString() };
  const { error: e2 } = await supabase.from(TABELA).upsert(linha, { onConflict: 'conta_omie,ncod_os' });
  if (e2) throw new Error(e2.message);
  invalidarResumoVendas();
  return { classe: linha.classe as ClasseServico, origem: linha.origem as 'regra' | 'manual', motivo: (linha as { motivo?: string | null }).motivo ?? null, classeRegra, alteradoPorNome: usuario.nome };
}

/** OS NÃO comerciais da conta (ncod_os). Vazio sem a migration. */
export async function osNaoComerciais(conta: string): Promise<Set<number>> {
  const out = new Set<number>();
  try {
    const linhas = await paginar<{ ncod_os: number }>((de, ate) =>
      supabase.from(TABELA).select('ncod_os').eq('conta_omie', conta).neq('classe', 'comercial').order('ncod_os').range(de, ate));
    for (const l of linhas) out.add(Number(l.ncod_os));
  } catch (e) {
    if (!tabelaFaltando(e as { code?: string; message?: string })) throw e;
  }
  return out;
}
