import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
import { omie } from "@/lib/omie/porta";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { empresaCanonica } from "@/lib/clientes/novo-cliente";

// Cria um projeto (= máquina/equipamento, ex.: "NEW HOLLAND TL 75 5426") no Omie
// e no portal — Pasta Clientes ("Novo projeto") e atalho "Nova máquina" do POS.
// Empresa gravada como o sync grava ("Castro Pecas"): com "Castro Peças" cada
// máquina criada aparecia DUPLICADA na busca do POS. Nome igual já existente
// → devolve o existente em vez de criar outro.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const NOME_MAX = 70; // limite do IncluirProjeto

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, empresa: string): Promise<T> {
  const acc = contaOmie(empresa);
  // Fila, freio e repetição em erro transitório ficam com a porta única. Gravação
  // (Incluir*) nunca é repetida: sem resposta clara vira OmieIncertoError.
  let data: { faultstring?: unknown };
  try {
    data = await omie<{ faultstring?: unknown }>(
      { appKey: acc.key, appSecret: acc.secret, rotulo: empresa }, endpoint, call, param,
      { lancarFault: false, timeoutMs: 25000 },
    );
  } catch (e: unknown) {
    if ((e as Error)?.name === "AbortError") throw new Error("O Omie demorou demais para responder (timeout de 25s). Tente novamente.");
    throw e;
  }
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data as T;
}

const normalizarNome = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

// Máquina criada de dentro da OS já nasce do cliente da OS: grava o "último
// cliente" na hora (antes só o sync fazia isso, a partir das OS faturadas), e
// ela aparece em "Máquinas deste cliente" sem esperar faturar. O sync depois só
// sobrescreve quando achar OS do projeto — nunca apaga.
async function vinculoCliente(cnpj: string, empresa: string): Promise<Record<string, unknown>> {
  if (!cnpj) return {};
  const { data } = await supabase
    .from("portal_nt_clientes_cadastro_omie")
    .select("cod_cli, empresa, nome_fantasia, razao_social")
    .eq("cnpj_cpf", cnpj)
    .limit(5);
  const lista = data || [];
  const c = lista.find(x => empresaCanonica(x.empresa) === empresa) || lista[0];
  return {
    cnpj_cpf_ultimo: cnpj,
    ...(c ? { cod_cli_ultimo: c.cod_cli, cliente_nome_ultimo: c.nome_fantasia || c.razao_social || "" } : {}),
  };
}

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }, { modulo: "pos" }]);
  if (acesso.resposta) return acesso.resposta;

  try {
    const body = await req.json();
    const nome = normalizarNome(body?.nome);
    const empresa = empresaCanonica(body?.empresa);
    const cnpjCliente = String(body?.cnpj_cliente ?? "").trim();

    if (!nome) return NextResponse.json({ error: "Nome do projeto / máquina é obrigatório" }, { status: 400 });
    if (nome.length > NOME_MAX) return NextResponse.json({ error: `Nome com ${nome.length} letras — o Omie aceita no máximo ${NOME_MAX}.` }, { status: 400 });
    if (!empresa) return NextResponse.json({ error: "Empresa inválida. Use Nova Tratores ou Castro Peças." }, { status: 400 });

    // Já existe com esse nome (qualquer grafia da empresa)? Usa o existente.
    const { data: existentes } = await supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .select("codigo, nome, empresa, cnpj_cpf_ultimo")
      .ilike("nome", nome)
      .limit(5);
    const mesmo = (existentes || []).find(p => normalizarNome(p.nome) === nome && empresaCanonica(p.empresa) === empresa);
    const vinculo = await vinculoCliente(cnpjCliente, empresa);
    if (mesmo) {
      // Já existia sem dono: passa a ser do cliente desta OS (com dono, não mexe)
      if (!mesmo.cnpj_cpf_ultimo && cnpjCliente) {
        await supabase.from("portal_nt_projetos_PRINCIPAL").update(vinculo)
          .eq("codigo", mesmo.codigo).eq("empresa", mesmo.empresa).then(() => {}, () => {});
      }
      return NextResponse.json({ ok: true, ja_existia: true, codigo: mesmo.codigo, nome: mesmo.nome, empresa });
    }

    // Omie exige um código de integração único (codInt), máx. 20 caracteres.
    const slug = (nome.replace(/[^A-Z0-9]+/g, "").slice(0, 10)) || "PROJ";
    const codInt = `${slug}-${Date.now().toString(36).toUpperCase()}`.slice(0, 20);

    let codigo: number;
    try {
      const res = await omieCall<{ codigo: number }>("/geral/projetos/", "IncluirProjeto", { codInt, nome, inativo: "N" }, empresa);
      codigo = res.codigo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // já existe no Omie (cadastrado lá e ainda não sincronizado): procura pelo nome
      if (/j[aá] (existe|cadastrad)/i.test(msg)) {
        const l = await omieCall<{ cadastro?: { codigo: number; nome: string }[] }>(
          "/geral/projetos/", "ListarProjetos", { pagina: 1, registros_por_pagina: 20, nome_projeto: nome }, empresa
        ).catch(() => null);
        const achado = (l?.cadastro || []).find(p => normalizarNome(p.nome) === nome);
        if (achado) {
          await supabase.from("portal_nt_projetos_PRINCIPAL")
            .upsert({ codigo: achado.codigo, empresa, nome, inativo: "N", ...vinculo, updated_at: new Date().toISOString() }, { onConflict: "codigo,empresa" })
            .then(() => {}, () => {});
          return NextResponse.json({ ok: true, ja_existia: true, codigo: achado.codigo, nome, empresa });
        }
      }
      return NextResponse.json({ error: `Omie: ${msg}` }, { status: 502 });
    }

    const { error: dbError } = await supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .insert({ codigo, empresa, nome, inativo: "N", ...vinculo, updated_at: new Date().toISOString() });

    if (dbError) {
      console.error("Projeto criado no Omie mas falhou no Supabase:", dbError.message);
      return NextResponse.json({
        ok: true, codigo, nome, empresa,
        aviso: "Criado no Omie, mas falhou ao salvar no portal. Rode o sync para aparecer na busca.",
      });
    }

    return NextResponse.json({ ok: true, codigo, nome, empresa });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar projeto";
    console.error("Erro ao criar projeto:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
