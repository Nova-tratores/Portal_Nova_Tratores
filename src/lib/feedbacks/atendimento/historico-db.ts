// Janela "Histórico do cliente" (SERVIDOR, service role). Versão enxuta do
// montador do cockpit (contexto.ts): só o que a janela mostra — OS com o PV
// dentro, compras de balcão, máquinas com a linha do tempo de revisões e
// requisições. Sem WhatsApp, roteiro, CAR nem atendimentos.

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { buscarHistoricoCliente, codigosDoCliente, desmontarClienteKey, type HistReq } from "@/lib/feedbacks/historico-cliente";
import type { Trator } from "@/lib/revisoes/types";
import { mesclarMaquinasFontes, mesmoChassi, norm, semZeros, unificarCompras, unificarServicos, type Compra, type Maquina, type ProjetoMaquina } from "./puro";
import { carregarInfo, carregarMaquinasFontes, carregarOSPortal, carregarPPV, carregarPrincipal, chassisCitados, chassisDosPPV } from "./contexto";
import { revisoesDoTrator, revisoesPendentes, vincularPedidosAsOS, type RevisaoFeita, type ServicoComPedidos } from "./historico-puro";

export interface MaquinaHistorico extends Maquina {
  /** revisões registradas no controle Mahindra (`tratores`), da inspeção à 3000h */
  revisoes: RevisaoFeita[];
  /** revisões do plano que ainda não constam */
  pendentes: string[];
  /** todos os projetos Omie desta máquina (Nova e Castro) */
  projetos: ProjetoMaquina[];
}

export interface HistoricoClienteCompleto {
  cliente_key: string;
  nome: string | null;
  codigo_omie: string | null;
  codigos_omie: string[];
  cnpj: string | null;
  /** OS (Omie ∪ POS), mais recentes primeiro, cada uma com o PV/PPV de peças dentro */
  servicos: ServicoComPedidos[] | null;
  /** PV/PPV sem OS (balcão) */
  avulsas: Compra[] | null;
  maquinas: MaquinaHistorico[] | null;
  requisicoes: HistReq[] | null;
  erros: Record<string, string>;
  gerado_em: string;
}

const sb = supabaseAdmin;
const LIMITE = 300; // a janela mostra o histórico inteiro, não só os 10 últimos do cockpit

export async function montarHistoricoCompleto(clienteKey: string, nomeReserva?: string | null): Promise<HistoricoClienteCompleto | { erro: string }> {
  const { codigoOmie, nome: nomeDaKey } = desmontarClienteKey(clienteKey);
  if (!codigoOmie && !nomeDaKey) return { erro: "key inválida (omie_<cod> ou nome_<NOME>)" };

  let cad: Record<string, unknown> | null = null;
  if (codigoOmie) {
    const { data } = await sb.from("portal_nt_clientes_cadastro_omie").select("nome_fantasia, razao_social, cnpj_cpf").eq("cod_cli", codigoOmie).limit(1);
    cad = (data?.[0] as Record<string, unknown>) ?? null;
  }
  const nome = nomeDaKey || (cad?.nome_fantasia as string) || (cad?.razao_social as string) || (nomeReserva || "").trim() || null;
  // todos os códigos do mesmo CPF/CNPJ (Nova e Castro) ou do mesmo nome
  const codigos = await codigosDoCliente(sb, codigoOmie, nome || "");
  const NOME = norm(nome);
  const erros: Record<string, string> = {};
  const guarda = <T,>(chave: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => { erros[chave] = (e as Error)?.message || String(e); return null; });

  const [info, principal, historico] = await Promise.all([
    guarda("pasta", carregarInfo(clienteKey, codigos, NOME)),
    guarda("cadastro", carregarPrincipal(codigos, nome)),
    guarda("historico", buscarHistoricoCliente(sb, codigoOmie, nome || "", codigos)),
  ]);
  const cnpj = String(cad?.cnpj_cpf ?? principal?.find((p) => p.cnpj_cpf)?.cnpj_cpf ?? "").trim() || null;
  const principalIds = (principal || []).map((p) => Number(p.id)).filter((n) => Number.isFinite(n));

  const osPortal = await guarda("os_portal", carregarOSPortal(nome, cnpj));
  const pvNums = (historico?.pv || []).map((p) => semZeros(p.num_pedido)).filter(Boolean);
  const osIds = (osPortal || []).map((o) => String(o.Id_Ordem ?? "")).filter(Boolean);
  const citadosOS = chassisCitados(historico?.os || [], osPortal || []);
  const [ppvs, fontes] = await Promise.all([
    guarda("ppv", carregarPPV(nome, cnpj, pvNums, osIds)),
    guarda("maquinas", carregarMaquinasFontes(codigos, cnpj, nome, principalIds, citadosOS)),
  ]);

  let servicos: ServicoComPedidos[] | null = null;
  let avulsas: Compra[] | null = null;
  if (historico) {
    const v = vincularPedidosAsOS(unificarServicos(historico.os, osPortal || [], LIMITE), unificarCompras(historico.pv, ppvs || [], LIMITE));
    servicos = v.servicos;
    avulsas = v.avulsas;
  }

  let maquinas: MaquinaHistorico[] | null = null;
  if (fontes) {
    const citados = [...citadosOS, ...chassisDosPPV(ppvs || [])];
    const base = mesclarMaquinasFontes({ ...fontes, citados, pasta: info?.equipamentos || [], nomeCliente: nome });
    const tratorPorId = new Map<string, Trator>(fontes.tratores.map((t) => [String(t.ID ?? "").trim(), t]));
    maquinas = base.map((m) => {
      const t = m.id_trator ? tratorPorId.get(m.id_trator) : undefined;
      const revisoes = t ? revisoesDoTrator(t) : [];
      return {
        ...m,
        revisoes,
        pendentes: t ? revisoesPendentes(revisoes) : [],
        projetos: m.chassi ? fontes.projetos.filter((p) => mesmoChassi(p.nome.split(/\s+/).pop(), m.chassi)) : m.projeto ? [m.projeto] : [],
      };
    });
  }

  return {
    cliente_key: clienteKey,
    nome,
    codigo_omie: codigoOmie,
    codigos_omie: codigos,
    cnpj,
    servicos,
    avulsas,
    maquinas,
    requisicoes: historico?.requisicoes ?? null,
    erros,
    gerado_em: new Date().toISOString(),
  };
}
