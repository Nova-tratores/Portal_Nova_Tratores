import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

const OMIE_ACCOUNTS: Record<string, { key: string; secret: string }> = {
  "Nova Tratores": contaOmie("Nova Tratores"),
  "Castro Peças": contaOmie("Castro Peças"),
};

const soDigitos = (s: string) => String(s || "").replace(/\D/g, "");

function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

function cnpjValido(c: string): boolean {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number): number => {
    let pos = len - 7, sum = 0;
    for (let i = len; i >= 1; i--) { sum += parseInt(c[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  if (calc(12) !== parseInt(c[12])) return false;
  return calc(13) === parseInt(c[13]);
}

const docValido = (doc: string) => doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false;

function parseTelefone(tel?: string): { ddd: string; num: string } {
  const d = soDigitos(tel || "");
  if (d.length < 10) return { ddd: "", num: "" };
  return { ddd: d.slice(0, 2), num: d.slice(2) };
}

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, empresa: string, tentativa = 1): Promise<T> {
  const acc = OMIE_ACCOUNTS[empresa];
  if (!acc) throw new Error(`Empresa desconhecida: ${empresa}`);
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
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("O Omie demorou demais para responder (timeout de 25s). Tente novamente.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // Rate limit: retry limitado (antes era infinito a cada 60s → travava pra sempre).
  if (response.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, tentativa * 8000));
    return omieCall(endpoint, call, param, empresa, tentativa + 1);
  }
  const data = await response.json();
  if (data?.faultstring) throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  return data as T;
}

const isJaCadastrado = (err: unknown) => {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("já cadastrado") || m.includes("ja cadastrado") || m.includes("cadastrado anteriormente") || m.includes("-103");
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      empresa, cnpj_cpf, razao_social, nome_fantasia,
      email, telefone, endereco, numero, bairro, cidade, estado, cep,
    } = body;

    if (!empresa || !OMIE_ACCOUNTS[empresa]) {
      return NextResponse.json({ error: "Empresa inválida. Use 'Nova Tratores' ou 'Castro Peças'" }, { status: 400 });
    }
    if (!razao_social?.trim()) {
      return NextResponse.json({ error: "Razão Social é obrigatória" }, { status: 400 });
    }
    const doc = soDigitos(cnpj_cpf);
    if (!doc) {
      return NextResponse.json({ error: "CNPJ/CPF é obrigatório" }, { status: 400 });
    }
    if (!docValido(doc)) {
      return NextResponse.json({
        error: `CPF/CNPJ inválido: ${cnpj_cpf}. Confira os dígitos verificadores (o Omie não aceita documento inválido).`,
      }, { status: 400 });
    }

    const codigoIntegracao = `CLI-${doc}`;
    const pessoaFisica = doc.length === 11 ? "S" : "N";
    const nomeFant = (nome_fantasia?.trim() || razao_social.trim()).slice(0, 100);
    const { ddd, num } = parseTelefone(telefone);

    const param: Record<string, unknown> = {
      codigo_cliente_integracao: codigoIntegracao,
      razao_social: razao_social.trim().slice(0, 100),
      nome_fantasia: nomeFant,
      cnpj_cpf: String(cnpj_cpf).trim(),
      pessoa_fisica: pessoaFisica,
      inativo: "N",
    };
    if (ddd && num) { param.telefone1_ddd = ddd; param.telefone1_numero = num; }
    if (email?.trim()) param.email = email.trim();
    if (endereco?.trim()) param.endereco = endereco.trim();
    if (numero?.trim()) param.endereco_numero = String(numero).trim();
    if (bairro?.trim()) param.bairro = bairro.trim();
    if (cidade?.trim()) param.cidade = cidade.trim();
    if (estado?.trim()) param.estado = String(estado).trim().toUpperCase().slice(0, 2);
    if (cep?.trim()) param.cep = soDigitos(cep);

    // Criar (ou recuperar se já existe) no Omie
    let codCli: number | null = null;
    try {
      const r = await omieCall<{ codigo_cliente_omie?: number }>("/geral/clientes/", "IncluirCliente", param, empresa);
      codCli = r?.codigo_cliente_omie ?? null;
    } catch (err) {
      if (!isJaCadastrado(err)) throw err;
      // já existia → recupera: 1) pelo código de integração, 2) pelo próprio CNPJ/CPF
      const r = await omieCall<{ codigo_cliente_omie?: number }>(
        "/geral/clientes/", "ConsultarCliente", { codigo_cliente_integracao: codigoIntegracao }, empresa
      ).catch(() => null);
      codCli = r?.codigo_cliente_omie ?? null;
      if (!codCli) {
        const lista = await omieCall<{ clientes_cadastro?: Array<{ codigo_cliente_omie: number }> }>(
          "/geral/clientes/", "ListarClientes",
          { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", clientesFiltro: { cnpj_cpf: String(cnpj_cpf).trim() } },
          empresa
        ).catch(() => null);
        codCli = lista?.clientes_cadastro?.[0]?.codigo_cliente_omie ?? null;
      }
    }

    if (!codCli) {
      return NextResponse.json({ error: "Cliente já existe no Omie, mas não consegui recuperar o código. Confira o CNPJ/CPF." }, { status: 502 });
    }

    // Grava local (na tabela que a lista de clientes lê) — aparece na hora
    const linhaCadastro = {
      cod_cli: codCli,
      empresa,
      razao_social: razao_social.trim(),
      nome_fantasia: nomeFant,
      cnpj_cpf: String(cnpj_cpf).trim(),
      email: email?.trim() || null,
      telefone: telefone?.trim() || null,
      endereco: endereco?.trim() || null,
      bairro: bairro?.trim() || null,
      cidade: cidade?.trim() || null,
      estado: estado?.trim()?.toUpperCase()?.slice(0, 2) || null,
      cep: cep ? soDigitos(cep) : null,
      inativo: "N",
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase
      .from("portal_nt_clientes_cadastro_omie")
      .upsert(linhaCadastro, { onConflict: "cod_cli,empresa" });

    // Espelha na tabela PRINCIPAL (usada por outros módulos) — não bloqueia
    await supabase.from("portal_nt_clientes_PRINCIPAL").upsert({
      id_omie: codCli,
      cnpj_cpf: String(cnpj_cpf).trim(),
      razao_social: razao_social.trim(),
      nome_fantasia: nomeFant,
      email: email?.trim() || null,
      telefone: telefone?.trim() || null,
      endereco: endereco?.trim() || null,
      numero: numero ? String(numero).trim() : null,
      bairro: bairro?.trim() || null,
      cidade: cidade?.trim() || null,
      estado: estado?.trim()?.toUpperCase()?.slice(0, 2) || null,
      cep: cep ? soDigitos(cep) : null,
    }, { onConflict: "id_omie" }).then(() => {}, () => {});

    if (dbErr) {
      return NextResponse.json({
        cod_cli: codCli, empresa,
        aviso: "Cliente criado no Omie, mas falhou ao salvar localmente. Rode o sync para aparecer.",
      });
    }

    return NextResponse.json({ ok: true, cod_cli: codCli, empresa });
  } catch (err: any) {
    console.error("Erro ao criar cliente:", err?.message);
    return NextResponse.json({ error: err?.message || "Erro ao criar cliente" }, { status: 500 });
  }
}
