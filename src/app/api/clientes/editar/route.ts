// Editar o cadastro do cliente no Omie pelo portal (José, 15/10/2026) — da OS
// (Informações do cliente) e da Pasta Clientes. Altera nas DUAS empresas onde o
// CNPJ/CPF existir (Nova e Castro) e atualiza as cópias do portal na hora.
// Regras (limites do Omie, CEP/cidade/IBGE, IE ou isento) = lib/clientes/novo-cliente.ts.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
import { omie } from "@/lib/omie/porta";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { logAndNotify } from "@/lib/server/audit-notify";
import {
  EMPRESAS_CLIENTE, soDigitos, mascararDocumento, validarNovoCliente, paramAlterarCliente, mensagemErroOmie, formDoCadastroOmie, alertaCepGeral, type FormNovoCliente,
} from "@/lib/clientes/novo-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function omieCall<T>(empresa: string, call: string, param: Record<string, unknown>, gravacao = false): Promise<T> {
  const acc = contaOmie(empresa);
  const data = await omie<Record<string, unknown>>({ appKey: acc.key, appSecret: acc.secret, rotulo: empresa }, "/geral/clientes/", call, param,
    { lancarFault: false, timeoutMs: 25000, ...(gravacao ? { gravacao: true, tentativas: 0 } : {}) });
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data as T;
}

/** GET ?doc=<cnpj/cpf> ou ?cod=<codigo Omie>&empresa= → formulário preenchido com o cadastro do Omie. */
export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }, { modulo: "pos" }, { modulo: "ppv" }]);
  if (acesso.resposta) return acesso.resposta;
  const doc = soDigitos(req.nextUrl.searchParams.get("doc"));
  const cod = Number(req.nextUrl.searchParams.get("cod") || 0);
  const empresaPedida = req.nextUrl.searchParams.get("empresa") || "";
  if (!doc && !cod) return NextResponse.json({ error: "Informe o CNPJ/CPF ou o código do cliente." }, { status: 400 });
  const ordem = /castro/i.test(empresaPedida) ? [...EMPRESAS_CLIENTE].reverse() : [...EMPRESAS_CLIENTE];
  for (const empresa of ordem) {
    try {
      let cad: Record<string, unknown> | null = null;
      if (cod && (!empresaPedida || empresa === ordem[0])) {
        cad = await omieCall<Record<string, unknown>>(empresa, "ConsultarCliente", { codigo_cliente_omie: cod }).catch(() => null);
      }
      if (!cad && doc) {
        const l = await omieCall<{ clientes_cadastro?: Record<string, unknown>[] }>(empresa, "ListarClientes",
          { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", clientesFiltro: { cnpj_cpf: mascararDocumento(doc) } });
        cad = l.clientes_cadastro?.[0] || null;
      }
      if (cad) {
        const form = formDoCadastroOmie(cad, empresa);
        return NextResponse.json({ ok: true, form, empresa, cod_cli: cad.codigo_cliente_omie, alertaCep: alertaCepGeral(form.cep) });
      }
    } catch { /* tenta a outra empresa */ }
  }
  return NextResponse.json({ error: "Cliente não encontrado no Omie." }, { status: 404 });
}

export async function PATCH(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }, { modulo: "pos" }, { modulo: "ppv" }]);
  if (acesso.resposta) return acesso.resposta;
  const form = (await req.json().catch(() => ({}))) as FormNovoCliente;
  const erros = validarNovoCliente({ ...form, empresa: "Nova Tratores" });
  if (erros.length) return NextResponse.json({ error: erros[0], erros }, { status: 400 });
  const doc = soDigitos(form.cnpj_cpf);
  const usuario = (acesso as { email?: string }).email || "Portal";

  const resultado: { empresa: string; ok: boolean; erro?: string; cod_cli?: number }[] = [];
  for (const empresa of EMPRESAS_CLIENTE) {
    let cod: number | null = null;
    try {
      const l = await omieCall<{ clientes_cadastro?: { codigo_cliente_omie: number }[] }>(empresa, "ListarClientes",
        { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", clientesFiltro: { cnpj_cpf: mascararDocumento(doc) } });
      cod = l.clientes_cadastro?.[0]?.codigo_cliente_omie ?? null;
    } catch { cod = null; }
    if (!cod) continue; // não existe nessa empresa
    try {
      const param = paramAlterarCliente(form, cod);
      await omieCall(empresa, "AlterarCliente", param, true);
      resultado.push({ empresa, ok: true, cod_cli: cod });
      // cópias do portal (o que a Pasta e o POS leem)
      const linha = {
        razao_social: String(param.razao_social), nome_fantasia: String(param.nome_fantasia),
        email: (param.email as string) || null, telefone: form.telefone?.trim() || null,
        endereco: String(param.endereco || "") || null, bairro: (param.bairro as string) || null,
        cidade: String(param.cidade), estado: String(param.estado), cep: String(param.cep), updated_at: new Date().toISOString(),
      };
      await supabase.from("portal_nt_clientes_cadastro_omie").update(linha).eq("cod_cli", cod).eq("empresa", empresa).then(() => {}, () => {});
      const { updated_at: _u, ...semData } = linha; void _u;
      await supabase.from("portal_nt_clientes_PRINCIPAL").update({ ...semData, numero: String(param.endereco_numero || "") || null }).eq("id_omie", cod).then(() => {}, () => {});
    } catch (e) {
      resultado.push({ empresa, ok: false, erro: mensagemErroOmie(e instanceof Error ? e.message : String(e)) });
    }
  }
  if (!resultado.length) return NextResponse.json({ error: "Não achei este CNPJ/CPF no Omie (Nova nem Castro)." }, { status: 404 });
  const ok = resultado.some((r) => r.ok);
  await logAndNotify({
    userName: usuario, sistema: "clientes", acao: ok ? "editar_cliente_omie" : "editar_cliente_omie_falhou",
    entidade: "cliente", entidadeId: mascararDocumento(doc), entidadeLabel: String(form.razao_social || doc),
    detalhes: { resultado, form }, notifTitulo: "", notifDescricao: "", notifLink: "",
  }).catch(() => {});
  const falhas = resultado.filter((r) => !r.ok);
  return NextResponse.json({ ok, resultado, error: ok ? undefined : falhas.map((f) => `${f.empresa}: ${f.erro}`).join(" · ") }, { status: ok ? 200 : 502 });
}
