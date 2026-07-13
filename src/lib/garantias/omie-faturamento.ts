// =============================================================================
// FATURAMENTO DE OS DE GARANTIA NO OMIE
//
// O caminho NORMAL é o criarOSNoOmie (src/lib/pos/omie.ts): quando a OS de
// garantia é fechada no POS, ela já nasce no Omie com o padrão de garantia.
//
// Este módulo cobre o caminho INVERSO — a OS já está no Omie (foi enviada
// como OS comum) e a garantia aparece/muda DEPOIS. faturarOSGarantiaNoOmie
// retro-aplica o padrão completo via AlterarOS:
//   - Cada serviço com cCodCategItem = "3. #Serv Prest Garantia" +
//     cNaoGerarFinanceiro = 'S' (não gera conta a receber)
//   - InformacoesAdicionais: cCodCateg garantia, nCodCC = conta INTERNO,
//     nCodProj = projeto "{Montadora}-pgo", cNumContrato = "{Montadora}-pgo"
//   - Email com cEnvRecibo = "S" (recibo, não NFS-e) pro e-mail fixo
//   - Departamento "03. # Garantias" 100% (AlterarOS seguinte com o
//     nValorTotal real — o Omie exige o valor da distribuição)
//   (peças NÃO entram na OS: o osCadastro do Omie não tem nó "Produtos";
//    elas seguem indo como Pedido de Venda do PPV no fechamento)
//
// Disparada quando: garantia criada manualmente sobre OS já enviada
// (criar-manual), montadora definida/trocada (checklist) e reprocesso
// manual (refaturar-omie). Resultado gravado em
// garantias.omie_os_garantia_faturada_em / omie_os_garantia_erro.
// =============================================================================

import { supabase } from '@/lib/pos/supabase';
import {
  listarCategoriasReceita,
  listarContasCorrentes,
  listarProjetos,
  listarDepartamentos,
  OMIE_ACCOUNTS,
  type OmieAccount,
} from '@/lib/financeiro/omie-contapagar';

const OMIE_BASE_URL = 'https://app.omie.com.br/api/v1';
const EMAIL_RECIBO_GARANTIA = 'posvendas.novatratores@gmail.com';

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
async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount, tentativa = 0): Promise<T> {
  const res = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 30000));
    return omieCall(endpoint, call, param, acc, tentativa);
  }
  const data = await res.json();
  if (data?.faultstring) {
    const fs = String(data.faultstring);
    // Anti-flood da Omie ("Consumo redundante detectado, aguarde Ns"): espera
    // o tempo pedido e reenvia — mesmo tratamento do omieCall de pos/omie.ts.
    const mRed = /aguarde\s+(\d+)\s+segundo/i.exec(fs);
    if ((mRed || /redundant/i.test(fs)) && tentativa < 3) {
      const espera = Math.min((mRed ? parseInt(mRed[1], 10) : 30) + 3, 65);
      await new Promise((r) => setTimeout(r, espera * 1000));
      return omieCall(endpoint, call, param, acc, tentativa + 1);
    }
    throw new Error(`Omie [${call}]: ${fs}`);
  }
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
  // ⚠️ Categorias de RECEITA: "3. #Serv Prest Garantia" e "7. #Deslocamento"
  // têm conta_receita='S' (não são despesa). Buscar na lista de despesa era o
  // que fazia TODA OS de garantia sair do POS sem o padrão (categoria nunca
  // encontrada → erro → OS padrão).
  const [categorias, contas, projetos, departamentos] = await Promise.all([
    listarCategoriasReceita(acc),
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

// ⚠️ Ordem_Servico NÃO tem coluna "empresa" — as OS do POS são sempre da
// Nova Tratores (criarOSNoOmie usa as credenciais OMIE_APP_KEY/SECRET).
interface OsRow {
  Id_Ordem: string;
  Ordem_Omie?: string | null;
  id_omie?: string | null;
}

interface OmieOSConsulta {
  Cabecalho?: { nCodOS?: number; cCodIntOS?: string; nValorTotal?: number };
  ServicosPrestados?: ServicoLinha[];
  Produtos?: ProdutoLinha[];
  InformacoesAdicionais?: { nCodProj?: number; cDadosAdicNF?: string; cNumContrato?: string };
}

// Acha a OS no Omie pelo código de integração (cCodIntOS = Id_Ordem — é assim
// que o criarOSNoOmie cria). ⚠️ Ordem_Omie/id_omie guardam o cNumOS (número
// visível da OS), que NÃO é chave de consulta — usá-lo como nCodOS dá
// "OS não cadastrada". Fica só como fallback pra registros antigos que
// porventura tenham gravado o código interno do Omie.
async function consultarOSDoPortal(os: OsRow, acc: OmieAccount): Promise<OmieOSConsulta | null> {
  try {
    return await omieCall<OmieOSConsulta>('/servicos/os/', 'ConsultarOS', { cCodIntOS: os.Id_Ordem }, acc);
  } catch {
    const idOmie = String(os.id_omie || os.Ordem_Omie || '');
    if (/^\d+$/.test(idOmie)) {
      try {
        return await omieCall<OmieOSConsulta>('/servicos/os/', 'ConsultarOS', { nCodOS: Number(idOmie) }, acc);
      } catch { /* não achou por nenhum dos dois */ }
    }
    return null;
  }
}

// Marca na garantia o resultado do (re)faturamento — best-effort.
async function marcarResultadoNaGarantia(garantiaId: string | undefined, erro: string | null) {
  if (!garantiaId) return;
  try {
    await supabase
      .from('garantias')
      .update(erro ? { omie_os_garantia_erro: erro } : { omie_os_garantia_faturada_em: new Date().toISOString(), omie_os_garantia_erro: null })
      .eq('id', garantiaId);
  } catch { /* coluna pode não existir em ambientes antigos */ }
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
    .select('Id_Ordem, Ordem_Omie, id_omie')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  if (!osRow) return { ok: false, motivo: 'OS não encontrada no Supabase.' };
  const os = osRow as OsRow;
  if (!os.id_omie && !os.Ordem_Omie) {
    return { ok: false, motivo: 'OS ainda não está no Omie — aguarde a sincronização.' };
  }

  let codigos: OmieGarantiaCodigos;
  try {
    codigos = await buscarCodigosGarantia(undefined, montadoraNome);
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
  const consulta = await consultarOSDoPortal(os, codigos.acc);
  const nCodOS = consulta?.Cabecalho?.nCodOS;
  if (!nCodOS) return { ok: false, motivo: `OS ${os.Id_Ordem} não encontrada no Omie (ConsultarOS).` };

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
  // OS ainda não foi enviada ao Omie — não é erro: o criarOSNoOmie aplica o
  // padrão de garantia quando ela for fechada no POS.
  pendenteEnvio?: boolean;
}

// Faz AlterarOS no Omie retro-aplicando o padrão COMPLETO de garantia numa
// OS que já existe lá (mesmas regras do criarOSNoOmie em src/lib/pos/omie.ts).
// idOrdem = Id_Ordem da OS no nosso banco.
// montadoraNome: se não vier, busca da garantia vinculada mais recente.
// garantiaId: quando informado, grava o resultado em
//   garantias.omie_os_garantia_faturada_em / omie_os_garantia_erro.
export async function faturarOSGarantiaNoOmie(params: {
  idOrdem: string;
  montadoraNome?: string | null;
  garantiaId?: string;
}): Promise<ResultadoFaturamento> {
  const { idOrdem } = params;
  let { montadoraNome, garantiaId } = params;

  const falha = async (motivo: string): Promise<ResultadoFaturamento> => {
    await marcarResultadoNaGarantia(garantiaId, motivo);
    return { ok: false, motivo };
  };

  // 1) Busca OS
  const { data: osRow } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Ordem_Omie, id_omie')
    .eq('Id_Ordem', idOrdem)
    .maybeSingle();
  if (!osRow) return falha('OS não encontrada no Supabase.');
  const os = osRow as OsRow;
  if (!os.id_omie && !os.Ordem_Omie) {
    // Estado normal do fluxo (garantia antes do fechamento) — não marca erro.
    return {
      ok: false,
      pendenteEnvio: true,
      motivo: 'OS ainda não foi enviada ao Omie — ao fechar no POS ela já sai no padrão de garantia.',
    };
  }

  // 1b) Montadora (e garantia pra marcar o resultado) a partir da garantia
  //     vinculada mais recente, quando não vieram por parâmetro.
  if (montadoraNome === undefined || !garantiaId) {
    const { data: garRow } = await supabase
      .from('garantias')
      .select('id, montadora_id')
      .eq('id_ordem', idOrdem)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!garantiaId && garRow?.id) garantiaId = String(garRow.id);
    if (montadoraNome === undefined) {
      montadoraNome = null;
      if (garRow?.montadora_id) {
        const { data: mont } = await supabase
          .from('garantia_montadoras')
          .select('nome')
          .eq('id', garRow.montadora_id)
          .maybeSingle();
        montadoraNome = mont?.nome ? String(mont.nome).trim() : null;
      }
    }
  }

  // 2) Resolve códigos
  let codigos: OmieGarantiaCodigos;
  try {
    codigos = await buscarCodigosGarantia(undefined, montadoraNome);
  } catch (err) {
    return falha(err instanceof Error ? err.message : 'Falha ao resolver códigos Omie.');
  }

  // 3) Consulta a OS no Omie pra pegar serviços/produtos/inf. adicionais
  //    existentes (vamos preservar nCodServico/nQtde/nValUnit/nCodProj/
  //    cDadosAdicNF; só aplicando o padrão de garantia por cima).
  const osOmie = await consultarOSDoPortal(os, codigos.acc);
  const nCodOS = osOmie?.Cabecalho?.nCodOS;
  if (!osOmie || !nCodOS) return falha(`OS ${os.Id_Ordem} não encontrada no Omie (ConsultarOS).`);

  // 4) Aplica categoria de garantia + "não gerar financeiro" em cada linha de
  //    serviço. No nó ServicosPrestados os campos são cCodCategItem e
  //    cNaoGerarFinanceiro (cCodCateg/cNaoGerarReceber fazem o Omie rejeitar).
  const servicosPatched: ServicoLinha[] = (osOmie.ServicosPrestados || []).map((s) => {
    const { impostos, ...rest } = s as ServicoLinha & { impostos?: unknown };
    void impostos;
    return {
      ...rest,
      cCodCategItem: codigos.codCategGarantia,
      cNaoGerarFinanceiro: 'S',
    };
  });

  // 5) Monta payload AlterarOS. ⚠️ SEM nó "Produtos" — o osCadastro do Omie
  //    não aceita a tag ("Tag [PRODUTOS] não faz parte da estrutura") e as
  //    peças do PPV já vão pro Omie como Pedido de Venda no fechamento.
  const ia = osOmie.InformacoesAdicionais || {};
  const nCodProjFinal = codigos.nCodProj_Pgo || ia.nCodProj || undefined;
  const payload: Record<string, unknown> = {
    Cabecalho: { nCodOS },
    InformacoesAdicionais: {
      cCodCateg: codigos.codCategGarantia,
      nCodCC: codigos.nCodCC_Interno,
      ...(nCodProjFinal ? { nCodProj: nCodProjFinal } : {}),
      ...(ia.cDadosAdicNF ? { cDadosAdicNF: ia.cDadosAdicNF } : {}),
      // Nº Contrato de Venda = "{Montadora}-pgo" (ex.: Mahindra-pgo)
      ...(montadoraNome ? { cNumContrato: `${montadoraNome}-pgo` } : {}),
    },
    ServicosPrestados: servicosPatched,
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
    return falha(err instanceof Error ? err.message : 'erro AlterarOS');
  }

  // 6) Departamento "03. # Garantias" 100%. Vai num AlterarOS separado porque
  //    o Omie exige o nValor da distribuição, lido do total real da OS.
  //    Best-effort: se falhar, o resto já valeu.
  if (codigos.codDeptGarantia) {
    try {
      const consulta = await omieCall<OmieOSConsulta>('/servicos/os/', 'ConsultarOS', { nCodOS }, codigos.acc);
      const totalOS = Number(consulta?.Cabecalho?.nValorTotal || 0);
      if (totalOS > 0) {
        await omieCall(
          '/servicos/os/',
          'AlterarOS',
          {
            Cabecalho: { nCodOS },
            Departamentos: [{ cCodDepto: codigos.codDeptGarantia, nPerc: 100, nValor: totalOS, nValorFixo: 'N' }],
          },
          codigos.acc,
        );
      }
    } catch (err) {
      console.warn(`[garantias→omie] Falha ao aplicar departamento Garantias na OS ${nCodOS}:`, err);
    }
  }

  await marcarResultadoNaGarantia(garantiaId, null);
  return { ok: true, nCodOS: String(nCodOS) };
}
