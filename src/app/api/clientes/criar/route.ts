import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import {
  empresaCanonica, soDigitos, mascararDocumento, validarNovoCliente, paramIncluirCliente,
  mensagemErroOmie, type FormNovoCliente,
} from "@/lib/clientes/novo-cliente";

// Cria o cliente no Omie (IncluirCliente) e grava no portal — usado pela Pasta
// Clientes e pelo atalho "Novo cliente" do POS. As regras (limites do Omie,
// CEP/cidade/IBGE, IE ou isento) ficam em lib/clientes/novo-cliente.ts. O Omie
// replica o cliente sozinho para a outra empresa (Nova ↔ Castro).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, empresa: string, tentativa = 1): Promise<T> {
  const acc = contaOmie(empresa);
  const payload = { call, app_key: acc.key, app_secret: acc.secret, param: [param] };

  // Timeout pra não pendurar a requisição se o Omie travar a resposta.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e: unknown) {
    if ((e as Error)?.name === "AbortError") throw new Error("O Omie demorou demais para responder (timeout de 25s). Tente novamente.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // Rate limit: retry limitado
  if (response.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, tentativa * 8000));
    return omieCall(endpoint, call, param, empresa, tentativa + 1);
  }
  const data = await response.json();
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data as T;
}

const isJaCadastrado = (err: unknown) => {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("já cadastrado") || m.includes("ja cadastrado") || m.includes("cadastrado anteriormente") || m.includes("-103");
};

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }, { modulo: "pos" }]);
  if (acesso.resposta) return acesso.resposta;

  try {
    const form = (await req.json()) as FormNovoCliente;
    const erros = validarNovoCliente(form);
    if (erros.length) return NextResponse.json({ error: erros[0], erros }, { status: 400 });

    const empresa = empresaCanonica(form.empresa)!;
    const doc = soDigitos(form.cnpj_cpf);
    const param = paramIncluirCliente(form);
    const codigoIntegracao = String(param.codigo_cliente_integracao);

    // Criar (ou recuperar se já existe) no Omie
    let codCli: number | null = null;
    let jaExistia = false;
    try {
      const r = await omieCall<{ codigo_cliente_omie?: number }>("/geral/clientes/", "IncluirCliente", param, empresa);
      codCli = r?.codigo_cliente_omie ?? null;
    } catch (err) {
      if (!isJaCadastrado(err)) {
        return NextResponse.json({ error: mensagemErroOmie(err instanceof Error ? err.message : String(err)) }, { status: 502 });
      }
      jaExistia = true;
      // já existia → recupera: 1) pelo código de integração, 2) pelo próprio CNPJ/CPF
      const r = await omieCall<{ codigo_cliente_omie?: number }>(
        "/geral/clientes/", "ConsultarCliente", { codigo_cliente_integracao: codigoIntegracao }, empresa
      ).catch(() => null);
      codCli = r?.codigo_cliente_omie ?? null;
      if (!codCli) {
        const lista = await omieCall<{ clientes_cadastro?: Array<{ codigo_cliente_omie: number }> }>(
          "/geral/clientes/", "ListarClientes",
          { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", clientesFiltro: { cnpj_cpf: mascararDocumento(doc) } },
          empresa
        ).catch(() => null);
        codCli = lista?.clientes_cadastro?.[0]?.codigo_cliente_omie ?? null;
      }
    }

    if (!codCli) {
      return NextResponse.json({ error: "Cliente já existe no Omie, mas não consegui recuperar o código. Confira o CNPJ/CPF." }, { status: 502 });
    }

    // Grava local (o que a pasta e o POS leem) — aparece na hora (e no realtime)
    const razao = String(param.razao_social);
    const fantasia = String(param.nome_fantasia);
    const endereco = [param.endereco, param.endereco_numero].filter(Boolean).join(", ");
    const linhaCadastro = {
      cod_cli: codCli,
      empresa,
      razao_social: razao,
      nome_fantasia: fantasia,
      cnpj_cpf: mascararDocumento(doc),
      email: (param.email as string) || null,
      telefone: form.telefone?.trim() || null,
      endereco: String(param.endereco || "") || null,
      bairro: (param.bairro as string) || null,
      cidade: String(param.cidade),
      estado: String(param.estado),
      cep: String(param.cep),
      inativo: "N",
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase
      .from("portal_nt_clientes_cadastro_omie")
      .upsert(linhaCadastro, { onConflict: "cod_cli,empresa" });

    // Tabela PRINCIPAL (o POS lê daqui) — erro só vira aviso
    const { error: errPrincipal } = await supabase.from("portal_nt_clientes_PRINCIPAL").upsert({
      id_omie: codCli,
      cnpj_cpf: mascararDocumento(doc),
      razao_social: razao,
      nome_fantasia: fantasia,
      email: linhaCadastro.email,
      telefone: linhaCadastro.telefone,
      endereco: linhaCadastro.endereco,
      numero: String(param.endereco_numero || "") || null,
      bairro: linhaCadastro.bairro,
      cidade: linhaCadastro.cidade,
      estado: linhaCadastro.estado,
      cep: linhaCadastro.cep,
    }, { onConflict: "id_omie" });
    if (errPrincipal) console.warn("[clientes/criar] PRINCIPAL:", errPrincipal.message);

    // Formato da lista do POS (chave OMIE:<cod>) — o atalho já seleciona o cliente
    const display = `${fantasia || razao} [CNPJ/CPF: ${mascararDocumento(doc)}] (OMIE)`; // igual a /api/pos/clientes
    const cliente = { chave: `OMIE:${codCli}`, display, razao, fantasia, cnpj: mascararDocumento(doc), endereco };

    if (dbErr) {
      return NextResponse.json({
        ok: true, cod_cli: codCli, empresa, ja_existia: jaExistia, cliente,
        aviso: "Cliente criado no Omie, mas falhou ao salvar localmente. Rode o sync para aparecer na pasta.",
      });
    }
    return NextResponse.json({ ok: true, cod_cli: codCli, empresa, ja_existia: jaExistia, cliente });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar cliente";
    console.error("Erro ao criar cliente:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
