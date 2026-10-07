// Montador do contexto do cockpit (SERVIDOR, service role). Cada seção falha
// isolada: a que cair vira `null` + entrada em `erros`, o resto segue.
//
// Entrada sempre por cliente_key / códigos Omie; nome só como fallback (a
// costura por nome entre tratores/OS/PV é a mais frágil do módulo).

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { buscarHistoricoCliente, codigosDoCliente, desmontarClienteKey } from "@/lib/feedbacks/historico-cliente";
import { buscarWhatsappDoCliente } from "@/lib/chatwoot/contatos-cliente";
import type { SecaoWhatsapp } from "@/lib/chatwoot/parsers";
import { normalizarTelefoneWa } from "@/lib/feedbacks/telefone";
import { clienteKey as montarKey, TAG_NAO_CONTATAR, type ClienteInfo, type FeedbackRegistro, type Oportunidade } from "@/lib/feedbacks/types";
import type { Trator } from "@/lib/revisoes/types";
import {
  chassiDoServicoOmie, chassiPlausivel, mesclarMaquinasFontes, norm, resumirAtendimentos, semZeros, separarModeloChassi, tagsDoCadastro, temTag, unificarCompras, unificarServicos,
  TAG_PENDENCIA_CADASTRAL, type AtendimentoResumo, type ChassiCitado, type Compra, type Maquina, type MaquinaCrm, type OSPortalBruta, type PPVBruto, type ProjetoMaquina, type Servico,
} from "./puro";
import { extrairChassis } from "@/lib/pos/extrairTrator";
import type { HistOS } from "@/lib/feedbacks/historico-cliente";
import { configR8, configRetorno, humoresRecentes, listarScripts } from "./roteiro-db";
import { emailEhInterno, type ParametrosR8 } from "@/lib/feedbacks/oportunidades/r8-puro";
import type { Script } from "./roteiro";
import { CONFIG_RETORNO_PADRAO, type ConfigRetorno } from "./retorno";

export interface Telefone { numero: string; wa: string | null; origem: string }

export interface Identidade {
  nome: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  empresa: string | null;
  telefones: Telefone[];
  email: string | null;
  cidade: string | null;
  estado: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  nao_contatar: boolean;
  pendencia_cadastral: boolean;
  inativo: boolean;
  email_interno: boolean; // e-mail é da loja (placeholder), não do cliente
  culturas: string | null;
  area_hectares: number | null;
  observacoes: string | null;
}

/** Imóvel rural (CAR) vinculado ao cliente — módulo Inteligência Agrícola (agro_*). */
export interface ImovelCar {
  cod_car: string; municipio: string; area_ha: number | null; area_util_ha: number | null;
  cultura_nome: string | null; cultura_principal: string | null; area_cultura_ha: number | null; pct_area_util: number | null;
  confianca: "alta" | "media" | "baixa" | null; motivo_confianca: string | null;
  credito_12m: number | null; credito_36m: number | null; credito_invest_36m: number | null;
  ultima_finalidade: string | null; ultimo_credito_em: string | null; score_oportunidade: number | null;
  origem_vinculo: string | null; vinculado_por: string | null;
}

export interface ContextoAtendimento {
  cliente_key: string;
  codigo_omie: string | null;
  nome: string | null;
  codigos_omie: string[];
  identidade: Identidade | null;
  motivos: { oportunidades: Oportunidade[]; registros_abertos: AtendimentoResumo[] } | null;
  /** CPF/CNPJ do cliente (cadastro Omie / PRINCIPAL) — usado para casar OS/PPV/projetos */
  cnpj: string | null;
  maquinas: Maquina[] | null;
  servicos: Servico[] | null;
  /** PV da Omie ∪ PPV do portal (um item quando é o mesmo pedido) */
  compras: Compra[] | null;
  requisicoes_count: number;
  pasta: Pick<ClienteInfo, "funcionarios" | "fazendas" | "equipamentos" | "cidade" | "email"> | null;
  atendimentos: AtendimentoResumo[] | null;
  whatsapp: SecaoWhatsapp;
  car: ImovelCar[] | null; // imóveis rurais vinculados (null = fonte falhou; [] = nenhum)
  // Fase 2
  roteiro: Script[];
  config_retorno: ConfigRetorno;
  humores_recentes: number[]; // últimas ligações encerradas, mais recente primeiro
  erros: Record<string, string>;
  gerado_em: string;
}

const sb = supabaseAdmin;

export async function montarContexto(clienteKey: string): Promise<ContextoAtendimento | { erro: string }> {
  const { codigoOmie, nome: nomeDaKey } = desmontarClienteKey(clienteKey);
  if (!codigoOmie && !nomeDaKey) return { erro: "cliente_key inválido (omie_<cod> ou nome_<NOME>)" };

  // cadastro Omie espelhado (pelo código) — dá o nome para achar duplicados
  let cad: Record<string, unknown> | null = null;
  if (codigoOmie) {
    const { data } = await sb.from("portal_nt_clientes_cadastro_omie").select("*").eq("cod_cli", codigoOmie).limit(1);
    cad = (data?.[0] as Record<string, unknown>) ?? null;
  }
  const nome = nomeDaKey || (cad?.nome_fantasia as string) || (cad?.razao_social as string) || null;
  const codigos = await codigosDoCliente(sb, codigoOmie, nome || "");
  const NOME = norm(nome);
  const erros: Record<string, string> = {};
  const guarda = <T,>(chave: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => { erros[chave] = (e as Error)?.message || String(e); return null; });

  const [info, principal, registros, oportunidades, historico, whatsapp, roteiro, cfgRetorno, humores, cfgR8, car] = await Promise.all([
    guarda("pasta", carregarInfo(clienteKey, codigos, NOME)),
    guarda("cadastro", carregarPrincipal(codigos, nome)),
    guarda("atendimentos", carregarRegistros(codigos, NOME)),
    guarda("motivos", carregarOportunidades(codigos, NOME)),
    guarda("historico", buscarHistoricoCliente(sb, codigoOmie, nome || "", codigos)),
    guarda("whatsapp", buscarWhatsappDoCliente(codigos)),
    guarda("roteiro", listarScripts()),
    guarda("config_retorno", configRetorno()),
    guarda("humores", humoresRecentes(clienteKey)),
    guarda("config_r8", configR8()),
    guarda("car", carregarCar(codigos)),
  ]);

  // CPF/CNPJ: casa OS do portal (817 de 821 têm Cnpj_Cliente), PPV e projetos Omie
  // sem depender da grafia do nome.
  const cnpj = String(cad?.cnpj_cpf ?? principal?.find((p) => p.cnpj_cpf)?.cnpj_cpf ?? "").trim() || null;
  const principalIds = (principal || []).map((p) => Number(p.id)).filter((n) => Number.isFinite(n));

  const osPortal = await guarda("os_portal", carregarOSPortal(nome, cnpj));

  // 2ª rodada: PPV precisa dos nºs de PV e das POS; máquinas precisam dos chassis citados.
  const pvNums = (historico?.pv || []).map((p) => semZeros(p.num_pedido)).filter(Boolean);
  const osIds = (osPortal || []).map((o) => String(o.Id_Ordem ?? "")).filter(Boolean);
  const [ppvs, maquinasFontes] = await Promise.all([
    guarda("ppv", carregarPPV(nome, cnpj, pvNums, osIds)),
    guarda("maquinas", carregarMaquinasFontes(codigos, cnpj, nome, principalIds, chassisCitados(historico?.os || [], osPortal || []))),
  ]);
  const citados = [...chassisCitados(historico?.os || [], osPortal || []), ...chassisDosPPV(ppvs || [])];

  const identidade = montarIdentidade(nome, cad, principal, info, registros || [], (cfgR8 ?? {}) as ParametrosR8);

  return {
    cliente_key: clienteKey,
    codigo_omie: codigoOmie,
    nome,
    codigos_omie: codigos,
    cnpj,
    identidade,
    motivos: registros && oportunidades
      ? {
          oportunidades,
          registros_abertos: resumirAtendimentos(registros.filter((r) => r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento"), 20),
        }
      : null,
    maquinas: maquinasFontes
      ? mesclarMaquinasFontes({ ...maquinasFontes, citados, pasta: info?.equipamentos || [], nomeCliente: nome })
      : null,
    servicos: historico ? unificarServicos(historico.os, osPortal || []) : null,
    compras: historico ? unificarCompras(historico.pv, ppvs || []) : null,
    requisicoes_count: historico?.requisicoes.length ?? 0,
    pasta: info ? { funcionarios: info.funcionarios || [], fazendas: info.fazendas || [], equipamentos: info.equipamentos || [], cidade: info.cidade, email: info.email } : null,
    atendimentos: registros ? resumirAtendimentos(registros) : null,
    whatsapp: whatsapp ?? { estado: "indisponivel", motivo: erros.whatsapp || "falha" },
    car,
    roteiro: roteiro ?? [],
    config_retorno: cfgRetorno ?? CONFIG_RETORNO_PADRAO,
    humores_recentes: humores ?? [],
    erros,
    gerado_em: new Date().toISOString(),
  };
}

// --- fontes ------------------------------------------------------------------

/**
 * Imóveis rurais (CAR) que alguém da Nova vinculou a este cliente. O vínculo guarda
 * cliente_omie_id = id_omie da portal_nt_clientes_PRINCIPAL (o mesmo código de `codigos`).
 * Tabela ausente (migration agro não aplicada) = lista vazia, não erro no cockpit.
 */
async function carregarCar(codigos: string[]): Promise<ImovelCar[]> {
  if (!codigos.length) return [];
  const { data: vinc, error } = await sb.from("agro_car_cliente_vinculo").select("cod_car, origem, confirmado_por").in("cliente_omie_id", codigos);
  if (error) { if (/does not exist|schema cache|not find/i.test(error.message)) return []; throw new Error(error.message); }
  const cods = Array.from(new Set((vinc || []).map((v) => v.cod_car as string)));
  if (!cods.length) return [];
  const { data, error: e2 } = await sb.from("agro_v_car_perfil")
    .select("cod_car, municipio, area_ha, area_util_ha, cultura_nome, cultura_principal, area_cultura_ha, pct_area_util, confianca, motivo_confianca, credito_12m, credito_36m, credito_invest_36m, ultima_finalidade, ultimo_credito_em, score_oportunidade")
    .in("cod_car", cods);
  if (e2) throw new Error(e2.message);
  const porCod = new Map((vinc || []).map((v) => [v.cod_car as string, v]));
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ImovelCar),
    origem_vinculo: (porCod.get(r.cod_car as string)?.origem as string) ?? null,
    vinculado_por: (porCod.get(r.cod_car as string)?.confirmado_por as string) ?? null,
  })).sort((a, b) => Number(b.area_ha || 0) - Number(a.area_ha || 0));
}

async function carregarInfo(key: string, codigos: string[], NOME: string): Promise<ClienteInfo | null> {
  const keys = new Set<string>([key, ...codigos.map((c) => montarKey(c, "")), NOME ? montarKey(null, NOME) : ""].filter(Boolean));
  const { data, error } = await sb.from("feedback_clientes_info").select("*").in("cliente_key", [...keys]);
  if (error) throw new Error(error.message);
  const linhas = (data || []) as ClienteInfo[];
  if (linhas.length === 0) return null;
  // mescla as pastas (pode existir omie_ e nome_ do mesmo cliente)
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => String(x).trim()).filter(Boolean))];
  return {
    ...linhas[0],
    funcionarios: linhas.flatMap((l) => l.funcionarios || []),
    fazendas: linhas.flatMap((l) => l.fazendas || []),
    tags: uniq(linhas.flatMap((l) => l.tags || [])),
    equipamentos: uniq(linhas.flatMap((l) => l.equipamentos || [])),
    cidade: linhas.find((l) => l.cidade)?.cidade ?? null,
    email: linhas.find((l) => l.email)?.email ?? null,
  };
}

async function carregarPrincipal(codigos: string[], nome: string | null): Promise<Record<string, unknown>[]> {
  // `id` = propriedade_id do CRM de vendas (visitas/maquinas apontam para ele)
  const sel = "id, id_omie, nome_fantasia, razao_social, cnpj_cpf, email, telefone, endereco, numero, bairro, cidade, estado, lat, lng, latitude, longitude, culturas, area_hectares, observacoes, inativo";
  if (codigos.length > 0) {
    const { data, error } = await sb.from("portal_nt_clientes_PRINCIPAL").select(sel).in("id_omie", codigos);
    if (error) throw new Error(error.message);
    if (data?.length) return data as Record<string, unknown>[];
  }
  const n = (nome || "").trim();
  if (n.length < 3) return [];
  const { data } = await sb.from("portal_nt_clientes_PRINCIPAL").select(sel).ilike("nome_fantasia", n).limit(5);
  return (data || []) as Record<string, unknown>[];
}

async function carregarRegistros(codigos: string[], NOME: string): Promise<FeedbackRegistro[]> {
  const out = new Map<number, FeedbackRegistro>();
  if (codigos.length > 0) {
    const { data, error } = await sb.from("feedback_registros").select("*").in("codigo_omie", codigos).order("criado_em", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    for (const r of (data || []) as FeedbackRegistro[]) out.set(r.id, r);
  }
  if (NOME) {
    const { data } = await sb.from("feedback_registros").select("*").ilike("nome", NOME).order("criado_em", { ascending: false }).limit(200);
    for (const r of (data || []) as FeedbackRegistro[]) out.set(r.id, r);
  }
  return [...out.values()];
}

async function carregarOportunidades(codigos: string[], NOME: string): Promise<Oportunidade[]> {
  const out = new Map<number, Oportunidade>();
  if (codigos.length > 0) {
    const { data, error } = await sb.from("feedback_oportunidades").select("*").eq("status", "aberta").in("codigo_omie", codigos);
    if (error) throw new Error(error.message);
    for (const o of (data || []) as Oportunidade[]) out.set(o.id, o);
  }
  if (NOME) {
    const { data } = await sb.from("feedback_oportunidades").select("*").eq("status", "aberta").eq("cliente_nome_norm", NOME);
    for (const o of (data || []) as Oportunidade[]) out.set(o.id, o);
  }
  const peso = { Urgente: 0, Normal: 1, Baixa: 2 } as const;
  return [...out.values()].sort((a, b) => peso[a.prioridade] - peso[b.prioridade]);
}

const SEL_OS_PORTAL = "Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Os_Tecnico2, Data, Data_Fim_Servico, Serv_Solicitado, Serv_Realizado, Status, Tipo_Servico, Valor_Total, Projeto, Ordem_Omie, id_omie, ID_PPV";

/**
 * POS do portal por NOME e por CPF/CNPJ (duas consultas — um `.or` com nome
 * contendo vírgula/parênteses quebra o filtro do PostgREST), sem repetir.
 */
async function carregarOSPortal(nome: string | null, cnpj: string | null): Promise<OSPortalBruta[]> {
  const n = (nome || "").trim();
  const buscas: PromiseLike<{ data: unknown; error: { message: string } | null }>[] = [];
  if (n.length >= 3) buscas.push(sb.from("Ordem_Servico").select(SEL_OS_PORTAL).ilike("Os_Cliente", n).order("Data", { ascending: false }).limit(40));
  if (cnpj) buscas.push(sb.from("Ordem_Servico").select(SEL_OS_PORTAL).eq("Cnpj_Cliente", cnpj).order("Data", { ascending: false }).limit(40));
  if (!buscas.length) return [];
  const res = await Promise.all(buscas);
  const out = new Map<string, OSPortalBruta>();
  for (const r of res) {
    if (r.error) throw new Error(r.error.message);
    for (const o of (r.data || []) as OSPortalBruta[]) out.set(String(o.Id_Ordem), o);
  }
  return [...out.values()];
}

/**
 * PPV (pré-pedido do portal, tabela `pedidos`) por nome, documento, nº do PV
 * (pedido_omie zero-padded) e POS de origem (Id_Os). Só 58 de 511 têm
 * cliente_documento — por isso as quatro portas.
 */
async function carregarPPV(nome: string | null, cnpj: string | null, pvNums: string[], osIds: string[]): Promise<PPVBruto[]> {
  const sel = "id_pedido, data, cliente, status, valor_total, pedido_omie, Id_Os, Projeto, tecnico, Tipo_Pedido, nf_numero, faturado_omie_em, omie_empresa";
  const n = (nome || "").trim();
  const buscas: PromiseLike<{ data: unknown; error: { message: string } | null }>[] = [];
  if (n.length >= 3) buscas.push(sb.from("pedidos").select(sel).ilike("cliente", n).limit(60));
  if (cnpj) buscas.push(sb.from("pedidos").select(sel).eq("cliente_documento", cnpj).limit(60));
  if (pvNums.length) {
    const variantes = [...new Set(pvNums.flatMap((p) => [p, p.padStart(15, "0")]))].slice(0, 200);
    buscas.push(sb.from("pedidos").select(sel).in("pedido_omie", variantes).limit(200));
  }
  if (osIds.length) buscas.push(sb.from("pedidos").select(sel).in("Id_Os", osIds.slice(0, 100)).limit(200));
  if (!buscas.length) return [];
  const res = await Promise.all(buscas);
  const out = new Map<string, PPVBruto>();
  for (const r of res) {
    if (r.error) throw new Error(r.error.message);
    for (const p of (r.data || []) as PPVBruto[]) out.set(p.id_pedido, p);
  }
  return [...out.values()];
}

/** Chassis citados nas OS (portal: Projeto/Serv_Solicitado; Omie: projeto / cabeçalho do serviço). */
function chassisCitados(osOmie: HistOS[], osPortal: OSPortalBruta[]): ChassiCitado[] {
  const out: ChassiCitado[] = [];
  for (const o of osPortal) {
    const ch = extrairChassis({ Projeto: o.Projeto, Serv_Solicitado: o.Serv_Solicitado });
    if (ch) out.push({ chassi: ch, modelo: separarModeloChassi(o.Projeto).chassi ? separarModeloChassi(o.Projeto).modelo : null });
  }
  for (const o of osOmie) {
    const proj = separarModeloChassi(o.projeto);
    if (proj.chassi) out.push({ chassi: proj.chassi, modelo: proj.modelo || null });
    else {
      const ch = chassiDoServicoOmie(o.servicos);
      if (ch) out.push({ chassi: ch, modelo: (String(o.servicos || "").match(/MODELO\s*:\s*([^|"]+)/i)?.[1] || "").trim() || null });
    }
  }
  return out;
}

function chassisDosPPV(ppvs: PPVBruto[]): ChassiCitado[] {
  return ppvs.flatMap((p) => {
    const { modelo, chassi } = separarModeloChassi(p.Projeto);
    return chassi ? [{ chassi, modelo: modelo || null }] : [];
  });
}

/**
 * Fontes de máquinas do cliente (a mescla é pura, em `mesclarMaquinasFontes`):
 * - `tratores` (controle de revisões): por nome E pelos chassis já conhecidos
 *   (projetos / OS) — o trator pode estar em nome de outra pessoa;
 * - projetos Omie "MODELO CHASSI" por código do cliente e por CPF/CNPJ
 *   (mesma fonte da Pasta Clientes e do ícone de trator do POS/PPV);
 * - CRM de vendas (`maquinas` por propriedade = portal_nt_clientes_PRINCIPAL.id);
 *   tabela ausente ou erro = lista vazia.
 */
async function carregarMaquinasFontes(codigos: string[], cnpj: string | null, nome: string | null, principalIds: number[], citados: ChassiCitado[]): Promise<{ tratores: Trator[]; projetos: ProjetoMaquina[]; crm: MaquinaCrm[] }> {
  const n = (nome || "").trim();

  // projetos Omie
  const projetos = new Map<string, ProjetoMaquina>();
  const addProj = (rows: Record<string, unknown>[] | null) => {
    for (const p of rows || []) {
      if (p.inativo === "S" || !p.nome) continue;
      projetos.set(`${p.nome}|${p.empresa}`, { nome: String(p.nome), empresa: String(p.empresa || "") });
    }
  };
  const buscasProj: PromiseLike<unknown>[] = [];
  if (codigos.length) buscasProj.push(sb.from("portal_nt_projetos_PRINCIPAL").select("nome, empresa, inativo").in("cod_cli_ultimo", codigos).limit(100).then(({ data }) => addProj(data as Record<string, unknown>[] | null)));
  if (cnpj) buscasProj.push(sb.from("portal_nt_projetos_PRINCIPAL").select("nome, empresa, inativo").eq("cnpj_cpf_ultimo", cnpj).limit(100).then(({ data }) => addProj(data as Record<string, unknown>[] | null)));
  await Promise.allSettled(buscasProj);

  // tratores: por nome + pelos chassis conhecidos (projetos e OS)
  const chassis = new Set<string>();
  for (const p of projetos.values()) { const c = separarModeloChassi(p.nome).chassi; if (c) chassis.add(c); }
  for (const c of citados) { const ch = chassiPlausivel(c.chassi); if (ch) chassis.add(ch); }
  const tratores = new Map<string, Trator>();
  const addTrat = (rows: Trator[] | null) => { for (const t of rows || []) tratores.set(String(t.ID ?? t.Chassis), t); };
  const buscasTrat: PromiseLike<unknown>[] = [];
  if (n.length >= 3) buscasTrat.push(sb.from("tratores").select("*").ilike("Cliente", n).limit(50).then(({ data, error }) => { if (error) throw new Error(error.message); addTrat(data as Trator[] | null); }));
  const lista = [...chassis].slice(0, 60);
  if (lista.length) {
    buscasTrat.push(sb.from("tratores").select("*").in("Chassis", lista).limit(100).then(({ data }) => addTrat(data as Trator[] | null)));
    // final-7 (chassi digitado incompleto num lado ou noutro)
    buscasTrat.push(sb.from("tratores").select("*").or(lista.map((c) => `Chassis.ilike.%${c.slice(-7)}`).join(",")).limit(100).then(({ data }) => addTrat(data as Trator[] | null)));
  }
  const rt = await Promise.allSettled(buscasTrat);
  const falhaNome = rt[0]?.status === "rejected" && n.length >= 3 ? (rt[0] as PromiseRejectedResult).reason : null;
  if (falhaNome && tratores.size === 0) throw falhaNome instanceof Error ? falhaNome : new Error(String(falhaNome));

  // CRM de vendas
  let crm: MaquinaCrm[] = [];
  if (principalIds.length) {
    const { data, error } = await sb.from("maquinas").select("id, tipo, marca, modelo, ano, numero_serie, horimetro, estado, observacoes").in("propriedade_id", principalIds).limit(50);
    if (!error) crm = (data || []) as MaquinaCrm[];
  }

  return { tratores: [...tratores.values()], projetos: [...projetos.values()], crm };
}

// --- identidade --------------------------------------------------------------


function montarIdentidade(
  nome: string | null,
  cad: Record<string, unknown> | null,
  principal: Record<string, unknown>[] | null,
  info: ClienteInfo | null,
  registros: FeedbackRegistro[],
  cfgR8: ParametrosR8 = {}
): Identidade | null {
  const p0 = principal?.[0] ?? null;
  if (!nome && !cad && !p0 && !info) return null;
  const s = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const n = (v: unknown) => { const x = Number(v); return v == null || v === "" || Number.isNaN(x) ? null : x; };

  const telefones: Telefone[] = [];
  const addTel = (t: unknown, origem: string) => {
    const txt = s(t);
    if (!txt) return;
    const wa = normalizarTelefoneWa(txt);
    const dig = txt.replace(/\D/g, "");
    const sufixo = dig.slice(-8);
    // "3882-5655" e "(14) 3882-5655" são o mesmo número: compara pelos 8 últimos dígitos
    const igual = (x: Telefone) => (wa && x.wa === wa) || x.numero === txt || (sufixo.length === 8 && x.numero.replace(/\D/g, "").endsWith(sufixo));
    const existente = telefones.find(igual);
    if (existente) {
      // fica com a versão mais completa (com DDD)
      if (dig.length > existente.numero.replace(/\D/g, "").length) { existente.numero = txt; existente.wa = wa; }
      return;
    }
    telefones.push({ numero: txt, wa, origem });
  };
  addTel(cad?.telefone, "Cadastro Omie");
  for (const p of principal || []) addTel(p.telefone, "Cadastro Omie");
  for (const r of registros) addTel(r.telefone, `Atendimento ${r.tipo.toUpperCase()}`);

  const tags = [...new Set([...(info?.tags || []), ...tagsDoCadastro(cad?.tags)].map((t) => t.trim()).filter(Boolean))];
  const endereco = [s(cad?.endereco) ?? s(p0?.endereco), s(p0?.numero), s(cad?.bairro) ?? s(p0?.bairro)].filter(Boolean).join(", ") || null;

  return {
    nome: nome || s(cad?.nome_fantasia) || s(p0?.nome_fantasia) || "",
    nome_fantasia: s(cad?.nome_fantasia) ?? s(p0?.nome_fantasia),
    razao_social: s(cad?.razao_social) ?? s(p0?.razao_social),
    cnpj: s(cad?.cnpj_cpf) ?? s(p0?.cnpj_cpf),
    empresa: s(cad?.empresa),
    telefones,
    email: s(cad?.email) ?? s(p0?.email) ?? info?.email ?? null,
    cidade: s(cad?.cidade) ?? s(p0?.cidade) ?? info?.cidade ?? null,
    estado: s(cad?.estado) ?? s(p0?.estado),
    endereco,
    lat: n(cad?.lat) ?? n(p0?.lat) ?? n(p0?.latitude),
    lng: n(cad?.lng) ?? n(p0?.lng) ?? n(p0?.longitude),
    tags,
    nao_contatar: temTag(tags, TAG_NAO_CONTATAR),
    pendencia_cadastral: temTag(tags, TAG_PENDENCIA_CADASTRAL),
    inativo: cad?.inativo === true || p0?.inativo === true,
    email_interno: emailEhInterno(s(cad?.email) ?? s(p0?.email), cfgR8),
    culturas: s(p0?.culturas),
    area_hectares: n(p0?.area_hectares),
    observacoes: s(p0?.observacoes),
  };
}
