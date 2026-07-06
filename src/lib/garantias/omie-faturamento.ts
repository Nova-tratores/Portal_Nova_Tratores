// =============================================================================
// FATURAMENTO DE OS DE GARANTIA NO OMIE
//
// Quando uma garantia é aprovada, esta função altera a OS correspondente no
// Omie pra ficar marcada como serviço de garantia:
//   - Cada serviço com cCodCateg = "3. #Serv Prest Garantia" + cNaoGerarReceber=S
//   - InformacoesAdicionais com a mesma categoria + categoria de Deslocamento,
//     nCodCC = conta INTERNO, nCodProj = "{Montadora}-pgo"
//   - Produtos: peças do PPV viram itens da OS (não vão como PV separado)
//   - Email com cEnvRecibo = "S" (envia recibo, não NFS-e) pro e-mail fixo
//
// Best-effort: erros são gravados em garantias.omie_os_garantia_erro pra
// que o garantista consiga reprocessar depois.
// =============================================================================

import { supabase } from '@/lib/pos/supabase';
import {
  listarCategoriasDespesa,
  listarContasCorrentes,
  listarProjetos,
  listarDepartamentos,
  OMIE_ACCOUNTS,
  type OmieAccount,
} from '@/lib/financeiro/omie-contapagar';

const OMIE_BASE_URL = 'https://app.omie.com.br/api/v1';
const EMAIL_RECIBO_GARANTIA = 'posvendas.novatratores@gmail.com';

interface OmieMovimentacao {
  CodProduto?: string;
  Descricao?: string;
  Qtde?: string;
  Preco?: string;
  TipoMovimento?: string;
}

interface ServicoLinha {
  cCodCategItem?: string;
  cNaoGerarFinanceiro?: 'S' | 'N';
  nCodServico?: number;
  nQtde?: number;
  nValUnit?: number;
  cDescServ?: string;
  nValorDesconto?: number;
}

interface ProdutoLinha {
  nCodProd?: number;
  cCodProd?: string;
  cDescr?: string;
  nQtde?: number;
  nValUnit?: number;
}

export interface OmieGarantiaCodigos {
  acc: OmieAccount;
  codCategGarantia: string;
  codCategDeslocamento: string | null;
  nCodCC_Interno: number;
  nCodProj_Pgo: number | null;
  codDeptGarantia: string | null; // departamento "03. # Garantias"
}

// Chamada genérica à API Omie
async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount): Promise<T> {
  const res = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 30000));
    return omieCall(endpoint, call, param, acc);
  }
  const data = await res.json();
  if (data?.faultstring) throw new Error(`Omie [${call}]: ${data.faultstring}`);
  return data as T;
}

// Busca os códigos do Omie por nome (case-insensitive contém).
// Hardcoded:
//   Categoria  = qualquer uma com "Serv Prest Garantia" na descrição
//   Categoria  = qualquer uma com "Deslocamento" na descrição
//   Conta      = INTERNO (match exato)
//   Projeto    = termina com "-pgo" e contém o nome da montadora (ex: "Kuhn-pgo")
//
// Cache: as funções listarX já cacheiam em memória.
export async function buscarCodigosGarantia(
  empresa: string | undefined,
  montadoraNome: string | null | undefined,
): Promise<OmieGarantiaCodigos> {
  const acc = (OMIE_ACCOUNTS.find((a) => a.name.toLowerCase() === String(empresa || '').toLowerCase()) || OMIE_ACCOUNTS[0]);
  const [categorias, contas, projetos, departamentos] = await Promise.all([
    listarCategoriasDespesa(acc),
    listarContasCorrentes(acc),
    listarProjetos(acc),
    listarDepartamentos(acc),
  ]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const buscarCateg = (termo: string) => {
    const t = norm(termo);
    return categorias.find((c) => norm(c.descricao || '').includes(t))?.codigo || null;
  };
  const codCategGarantia = buscarCateg('Serv Prest Garantia');
  if (!codCategGarantia) throw new Error('Categoria "Serv Prest Garantia" não encontrada no Omie.');
  const codCategDeslocamento = buscarCateg('Deslocamento');

  const contaInterno = contas.find((c) => norm(c.descricao || '').trim() === 'interno');
  if (!contaInterno) throw new Error('Conta corrente "INTERNO" não encontrada no Omie.');

  // Departamento "03. # Garantias" (único que contém "garantia" na descrição).
  const deptGarantia = departamentos.find((d) => norm(d.descricao || '').includes('garantia'));
  const codDeptGarantia = deptGarantia ? String(deptGarantia.codigo) : null;

  let nCodProj_Pgo: number | null = null;
  if (montadoraNome) {
    const m = norm(montadoraNome);
    const proj = projetos.find((p) => {
      const n = norm(p.nome || '');
      return n.endsWith('-pgo') && n.includes(m);
    });
    nCodProj_Pgo = proj ? Number(proj.codigo) : null;
  }

  return {
    acc,
    codCategGarantia,
    codCategDeslocamento,
    nCodCC_Interno: Number(contaInterno.id),
    nCodProj_Pgo,
    codDeptGarantia,
  };
}

// Monta a Lista de Produtos a partir do PPV (mesma lógica que outros
// módulos usam pra ler movimentações). Exportado pra ser reusado em
// `src/lib/pos/omie.ts` durante a criação inicial da OS de garantia.
export async function montarListaProdutosPPV(ppvIds: string[]): Promise<ProdutoLinha[]> {
  if (ppvIds.length === 0) return [];
  const { data: itens } = await supabase
    .from('movimentacoes')
    .select('*')
    .in('Id_PPV', ppvIds);
  // Agrega por código (PPV pode ter linhas duplicadas / devoluções negativas)
  const resumo: Record<string, { descricao: string; qtde: number; totalFin: number }> = {};
  for (const item of (itens || []) as OmieMovimentacao[]) {
    const cod = String(item.CodProduto || '');
    if (!cod) continue;
    const tipo = String(item.TipoMovimento || '').toLowerCase();
    const preco = parseFloat(item.Preco || '0');
    let qtd = Math.abs(parseFloat(item.Qtde || '0'));
    if (tipo.includes('devolu')) qtd = -qtd;
    if (!resumo[cod]) resumo[cod] = { descricao: item.Descricao || cod, qtde: 0, totalFin: 0 };
    resumo[cod].qtde += qtd;
    resumo[cod].totalFin += preco * qtd;
  }
  const produtos: ProdutoLinha[] = [];
  for (const [cod, p] of Object.entries(resumo)) {
    if (p.qtde === 0) continue;
    produtos.push({
      cCodProd: cod,
      cDescr: p.descricao,
      nQtde: p.qtde,
      nValUnit: p.qtde !== 0 ? p.totalFin / p.qtde : 0,
    });
  }
  return produtos;
}

interface OsRow {
  Id_Ordem: string;
  Ordem_Omie?: string | null;
  id_omie?: string | null;
  ID_PPV?: string | null;
  empresa?: string | null;
}

// Atualiza só o nCodProj da OS no Omie (chamado quando o garantista
// escolhe/troca a montadora em /garantias — a OS já foi criada no Omie
// pelo /pos sem projeto definido).
export async function sincronizarProjetoMontadoraNoOmie(params: {
  idOrdem: string;
  montadoraNome: string;
}): Promise<ResultadoFaturamento> {
  const { idOrdem, montadoraNome } = params;

  const { data: osRow } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Ordem_Omie, id_omie, empresa')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  if (!osRow) return { ok: false, motivo: 'OS não encontrada no Supabase.' };
  const os = osRow as OsRow;
  if (!os.id_omie && !os.Ordem_Omie) {
    return { ok: false, motivo: 'OS ainda não está no Omie — aguarde a sincronização.' };
  }

  let codigos: OmieGarantiaCodigos;
  try {
    codigos = await buscarCodigosGarantia(os.empresa || undefined, montadoraNome);
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'Falha ao resolver projeto Omie.' };
  }
  if (!codigos.nCodProj_Pgo) {
    return {
      ok: false,
      motivo: `Projeto "${montadoraNome}-pgo" não encontrado no Omie. Crie-o no cadastro de projetos.`,
    };
  }

  // Resolve nCodOS
  const idOmie = String(os.id_omie || os.Ordem_Omie);
  let nCodOS: number | undefined;
  try {
    const consulta = await omieCall<{ Cabecalho?: { nCodOS?: number } }>(
      '/servicos/os/',
      'ConsultarOS',
      idOmie.match(/^\d+$/) ? { nCodOS: Number(idOmie) } : { cCodIntOS: idOmie },
      codigos.acc,
    );
    nCodOS = consulta?.Cabecalho?.nCodOS;
  } catch (err) {
    return { ok: false, motivo: `Falha ao consultar OS no Omie: ${err instanceof Error ? err.message : 'erro'}` };
  }
  if (!nCodOS) return { ok: false, motivo: 'nCodOS não encontrado na consulta do Omie.' };

  try {
    await omieCall(
      '/servicos/os/',
      'AlterarOS',
      {
        Cabecalho: { nCodOS },
        InformacoesAdicionais: { nCodProj: codigos.nCodProj_Pgo },
      },
      codigos.acc,
    );
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'erro AlterarOS' };
  }

  return { ok: true, nCodOS: String(nCodOS) };
}

export interface ResultadoFaturamento {
  ok: boolean;
  motivo?: string;
  nCodOS?: string;
}

// Faz AlterarOS no Omie aplicando o padrão de garantia.
// idOrdem = Id_Ordem da OS no nosso banco.
export async function faturarOSGarantiaNoOmie(params: {
  idOrdem: string;
  montadoraNome: string | null | undefined;
}): Promise<ResultadoFaturamento> {
  const { idOrdem, montadoraNome } = params;

  // 1) Busca OS
  const { data: osRow } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Ordem_Omie, id_omie, ID_PPV, empresa')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  if (!osRow) return { ok: false, motivo: 'OS não encontrada no Supabase.' };
  const os = osRow as OsRow;
  if (!os.id_omie && !os.Ordem_Omie) {
    return { ok: false, motivo: 'OS ainda não foi criada no Omie — sincronize a OS antes de faturar a garantia.' };
  }

  // 2) Resolve códigos
  let codigos: OmieGarantiaCodigos;
  try {
    codigos = await buscarCodigosGarantia(os.empresa || undefined, montadoraNome);
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'Falha ao resolver códigos Omie.' };
  }

  // 3) Consulta a OS no Omie pra pegar os ServicosPrestados existentes
  //    (vamos alterar eles preservando nCodServico/nQtde/nValUnit; só
  //    adicionando cCodCateg + cNaoGerarReceber em cada linha.)
  const idOmie = String(os.id_omie || os.Ordem_Omie);
  let osOmie: { Cabecalho?: { nCodOS?: number; cCodIntOS?: string }; ServicosPrestados?: ServicoLinha[]; Produtos?: ProdutoLinha[] };
  try {
    osOmie = await omieCall<{ Cabecalho?: { nCodOS?: number; cCodIntOS?: string }; ServicosPrestados?: ServicoLinha[]; Produtos?: ProdutoLinha[] }>(
      '/servicos/os/',
      'ConsultarOS',
      idOmie.match(/^\d+$/) ? { nCodOS: Number(idOmie) } : { cCodIntOS: idOmie },
      codigos.acc,
    );
  } catch (err) {
    return { ok: false, motivo: `Falha ao consultar OS no Omie: ${err instanceof Error ? err.message : 'erro'}` };
  }
  const nCodOS = osOmie?.Cabecalho?.nCodOS;
  if (!nCodOS) return { ok: false, motivo: 'nCodOS não encontrado na consulta do Omie.' };

  // 4) Aplica categoria de garantia + "não gerar financeiro" em cada linha de
  //    serviço. No nó ServicosPrestados os campos são cCodCategItem e
  //    cNaoGerarFinanceiro (cCodCateg/cNaoGerarReceber fazem o Omie rejeitar).
  const servicosPatched: ServicoLinha[] = (osOmie.ServicosPrestados || []).map((s) => {
    const { impostos, ...rest } = s as ServicoLinha & { impostos?: unknown };
    return {
      ...rest,
      cCodCategItem: codigos.codCategGarantia,
      cNaoGerarFinanceiro: 'S',
    };
  });

  // 5) Monta Lista de Produtos a partir do PPV
  const ppvIds = String(os.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean);
  const produtos = await montarListaProdutosPPV(ppvIds);

  // 6) Monta payload AlterarOS
  const payload: Record<string, unknown> = {
    Cabecalho: { nCodOS },
    InformacoesAdicionais: {
      cCodCateg: codigos.codCategGarantia,
      nCodCC: codigos.nCodCC_Interno,
      ...(codigos.nCodProj_Pgo ? { nCodProj: codigos.nCodProj_Pgo } : {}),
    },
    ServicosPrestados: servicosPatched,
    ...(produtos.length > 0 ? { Produtos: produtos } : {}),
    Email: {
      cEnvBoleto: 'N',
      cEnvLink: 'N',
      cEnvRecibo: 'S',
      cEnviarPara: EMAIL_RECIBO_GARANTIA,
    },
  };

  try {
    await omieCall('/servicos/os/', 'AlterarOS', payload, codigos.acc);
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'erro AlterarOS' };
  }

  return { ok: true, nCodOS: String(nCodOS) };
}
