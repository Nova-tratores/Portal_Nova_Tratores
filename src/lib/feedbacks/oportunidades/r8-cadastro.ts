// R8 — Cadastro incompleto (higiene de cadastro).
//
// Cliente do cadastro Omie SEM telefone ou SEM e-mail — ou com e-mail INTERNO
// da loja no lugar do e-mail do cliente (rodrigo.novatratores@..., posvendas@...,
// qualquer @novatratores). Vira uma tarefa na fila: ligar, confirmar os dados
// e corrigir pelo botão "Corrigir cadastro" do cockpit (grava no Omie).
//
// Só entra quem tem ATIVIDADE (OS ou pedido de venda) nos últimos N meses —
// senão a fila afoga em cadastros antigos. Prioridade: Normal com atividade nos
// últimos 6 meses, Baixa no resto. A oportunidade some sozinha na recomputação
// seguinte quando o cadastro é corrigido (expirarAusentes).

import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import { lerTudo } from "./_paginar";
import { faltandoNoCadastro, rotuloFaltando, R8_PADRAO, type ParametrosR8 } from "./r8-puro";
export { emailEhInterno, faltandoNoCadastro, rotuloFaltando, R8_PADRAO, type Faltando, type ParametrosR8 } from "./r8-puro";

interface OportunidadeR8 {
  regra: "R8_cadastro";
  codigo_omie: string;
  cliente_nome: string;
  trator: null;
  chassis: null;
  detalhes: Record<string, unknown>;
  prioridade: "Normal" | "Baixa";
}

export async function computarR8(parametros: ParametrosR8 = {}): Promise<OportunidadeR8[]> {
  const p = { ...R8_PADRAO, ...parametros };
  console.log(`[R8] start — atividade ${p.atividade_meses}m, somente_com_atividade=${p.somente_com_atividade}`);

  const clientes = await lerTudo<{
    cod_cli: number | string; empresa: string | null; nome_fantasia: string | null; razao_social: string | null;
    telefone: string | null; email: string | null; inativo: boolean | null; tags: string | null;
  }>((from, to) =>
    supabase.from("portal_nt_clientes_cadastro_omie").select("cod_cli, empresa, nome_fantasia, razao_social, telefone, email, inativo, tags").range(from, to)
  );

  // última atividade por código (PV + OS) dentro da janela
  const corte = new Date();
  corte.setMonth(corte.getMonth() - p.atividade_meses);
  const corteISO = corte.toISOString().slice(0, 10);
  const ultimaAtividade = new Map<string, string>();
  const registrar = (cod: unknown, data: unknown) => {
    if (cod == null || !data) return;
    const k = String(cod);
    const d = String(data).slice(0, 10);
    if (!ultimaAtividade.has(k) || d > (ultimaAtividade.get(k) as string)) ultimaAtividade.set(k, d);
  };
  const pv = await lerTudo<{ cod_cli: unknown; data_inclusao: string | null }>((from, to) =>
    supabase.from("portal_nt_clientes_pv").select("cod_cli, data_inclusao").gte("data_inclusao", corteISO).range(from, to)
  );
  for (const r of pv) registrar(r.cod_cli, r.data_inclusao);
  const os = await lerTudo<{ cod_cli: unknown; data_inclusao: string | null }>((from, to) =>
    supabase.from("portal_nt_clientes_os").select("cod_cli, data_inclusao").gte("data_inclusao", corteISO).range(from, to)
  );
  for (const r of os) registrar(r.cod_cli, r.data_inclusao);
  console.log(`[R8] cadastros: ${clientes.length}; com atividade em ${p.atividade_meses}m: ${ultimaAtividade.size}`);

  const recente = new Date();
  recente.setMonth(recente.getMonth() - p.recente_meses);
  const recenteISO = recente.toISOString().slice(0, 10);

  const out: OportunidadeR8[] = [];
  let semAtividade = 0;
  for (const c of clientes) {
    if (c.inativo === true) continue;
    if (String(c.tags ?? "").toLowerCase().includes("fornecedor")) continue;
    const faltando = faltandoNoCadastro(c, p);
    if (faltando.length === 0) continue;
    const cod = String(c.cod_cli);
    const ultima = ultimaAtividade.get(cod) ?? null;
    if (p.somente_com_atividade && !ultima) { semAtividade++; continue; }
    const nome = (c.nome_fantasia || c.razao_social || "").trim();
    if (!nome) continue;
    const empresa = String(c.empresa ?? "");
    out.push({
      regra: "R8_cadastro",
      codigo_omie: cod,
      cliente_nome: nome,
      trator: null,
      chassis: null,
      prioridade: ultima && ultima >= recenteISO ? "Normal" : "Baixa",
      detalhes: {
        origem: `Omie ${/castro/i.test(empresa) ? "CASTRO" : "NOVA"}`,
        faltando,
        telefone_atual: c.telefone || null,
        email_atual: c.email || null,
        ultima_atividade: ultima,
        sugestao: `Confirmar ${faltando.map(rotuloFaltando).join(" e ")} do cliente e corrigir no cadastro.`,
      },
    });
  }
  console.log(`[R8] oportunidades: ${out.length} (descartados sem atividade: ${semAtividade})`);
  return out;
}

