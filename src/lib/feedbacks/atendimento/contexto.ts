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
  mesclarMaquinas, norm, resumirAtendimentos, resumirPedidos, tagsDoCadastro, temTag, unificarServicos,
  TAG_PENDENCIA_CADASTRAL, type AtendimentoResumo, type Maquina, type OSPortalBruta, type Pedido, type Servico,
} from "./puro";
import { configRetorno, humoresRecentes, listarScripts } from "./roteiro-db";
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
  culturas: string | null;
  area_hectares: number | null;
  observacoes: string | null;
}

export interface ContextoAtendimento {
  cliente_key: string;
  codigo_omie: string | null;
  nome: string | null;
  codigos_omie: string[];
  identidade: Identidade | null;
  motivos: { oportunidades: Oportunidade[]; registros_abertos: AtendimentoResumo[] } | null;
  maquinas: Maquina[] | null;
  servicos: Servico[] | null;
  pedidos: Pedido[] | null;
  requisicoes_count: number;
  pasta: Pick<ClienteInfo, "funcionarios" | "fazendas" | "equipamentos" | "cidade" | "email"> | null;
  atendimentos: AtendimentoResumo[] | null;
  whatsapp: SecaoWhatsapp;
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

  const [info, principal, registros, oportunidades, historico, osPortal, tratores, whatsapp, roteiro, cfgRetorno, humores] = await Promise.all([
    guarda("pasta", carregarInfo(clienteKey, codigos, NOME)),
    guarda("cadastro", carregarPrincipal(codigos, nome)),
    guarda("atendimentos", carregarRegistros(codigos, NOME)),
    guarda("motivos", carregarOportunidades(codigos, NOME)),
    guarda("historico", buscarHistoricoCliente(sb, codigoOmie, nome || "", codigos)),
    guarda("os_portal", carregarOSPortal(nome)),
    guarda("maquinas", carregarTratores(nome)),
    guarda("whatsapp", buscarWhatsappDoCliente(codigos)),
    guarda("roteiro", listarScripts()),
    guarda("config_retorno", configRetorno()),
    guarda("humores", humoresRecentes(clienteKey)),
  ]);

  const identidade = montarIdentidade(nome, cad, principal, info, registros || []);

  return {
    cliente_key: clienteKey,
    codigo_omie: codigoOmie,
    nome,
    codigos_omie: codigos,
    identidade,
    motivos: registros && oportunidades
      ? {
          oportunidades,
          registros_abertos: resumirAtendimentos(registros.filter((r) => r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento"), 20),
        }
      : null,
    maquinas: tratores ? mesclarMaquinas(tratores, info?.equipamentos || []) : null,
    servicos: historico ? unificarServicos(historico.os, osPortal || []) : null,
    pedidos: historico ? resumirPedidos(historico.pv) : null,
    requisicoes_count: historico?.requisicoes.length ?? 0,
    pasta: info ? { funcionarios: info.funcionarios || [], fazendas: info.fazendas || [], equipamentos: info.equipamentos || [], cidade: info.cidade, email: info.email } : null,
    atendimentos: registros ? resumirAtendimentos(registros) : null,
    whatsapp: whatsapp ?? { estado: "indisponivel", motivo: erros.whatsapp || "falha" },
    roteiro: roteiro ?? [],
    config_retorno: cfgRetorno ?? CONFIG_RETORNO_PADRAO,
    humores_recentes: humores ?? [],
    erros,
    gerado_em: new Date().toISOString(),
  };
}

// --- fontes ------------------------------------------------------------------

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
  const sel = "id_omie, nome_fantasia, razao_social, cnpj_cpf, email, telefone, endereco, numero, bairro, cidade, estado, lat, lng, latitude, longitude, culturas, area_hectares, observacoes, inativo";
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

async function carregarOSPortal(nome: string | null): Promise<OSPortalBruta[]> {
  const n = (nome || "").trim();
  if (n.length < 3) return [];
  const { data, error } = await sb
    .from("Ordem_Servico")
    .select("Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Data, Data_Fim_Servico, Serv_Solicitado, Serv_Realizado, Status, Tipo_Servico, Valor_Total, Projeto, Ordem_Omie")
    .ilike("Os_Cliente", n)
    .order("Data", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data || []) as OSPortalBruta[];
}

async function carregarTratores(nome: string | null): Promise<Trator[]> {
  const n = (nome || "").trim();
  if (n.length < 3) return [];
  const { data, error } = await sb.from("tratores").select("*").ilike("Cliente", n).limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as Trator[];
}

// --- identidade --------------------------------------------------------------


function montarIdentidade(
  nome: string | null,
  cad: Record<string, unknown> | null,
  principal: Record<string, unknown>[] | null,
  info: ClienteInfo | null,
  registros: FeedbackRegistro[]
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
    culturas: s(p0?.culturas),
    area_hectares: n(p0?.area_hectares),
    observacoes: s(p0?.observacoes),
  };
}
