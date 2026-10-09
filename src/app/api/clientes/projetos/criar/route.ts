import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
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

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";
const NOME_MAX = 70; // limite do IncluirProjeto

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

  // Rate limit do Omie: tenta de novo poucas vezes, com espera curta.
  if (response.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, tentativa * 8000));
    return omieCall(endpoint, call, param, empresa, tentativa + 1);
  }

  const data = await response.json();
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data as T;
}

const normalizarNome = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }, { modulo: "pos" }]);
  if (acesso.resposta) return acesso.resposta;

  try {
    const body = await req.json();
    const nome = normalizarNome(body?.nome);
    const empresa = empresaCanonica(body?.empresa);

    if (!nome) return NextResponse.json({ error: "Nome do projeto / máquina é obrigatório" }, { status: 400 });
    if (nome.length > NOME_MAX) return NextResponse.json({ error: `Nome com ${nome.length} letras — o Omie aceita no máximo ${NOME_MAX}.` }, { status: 400 });
    if (!empresa) return NextResponse.json({ error: "Empresa inválida. Use Nova Tratores ou Castro Peças." }, { status: 400 });

    // Já existe com esse nome (qualquer grafia da empresa)? Usa o existente.
    const { data: existentes } = await supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .select("codigo, nome, empresa")
      .ilike("nome", nome)
      .limit(5);
    const mesmo = (existentes || []).find(p => normalizarNome(p.nome) === nome && empresaCanonica(p.empresa) === empresa);
    if (mesmo) {
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
            .upsert({ codigo: achado.codigo, empresa, nome, inativo: "N", updated_at: new Date().toISOString() }, { onConflict: "codigo,empresa" })
            .then(() => {}, () => {});
          return NextResponse.json({ ok: true, ja_existia: true, codigo: achado.codigo, nome, empresa });
        }
      }
      return NextResponse.json({ error: `Omie: ${msg}` }, { status: 502 });
    }

    const { error: dbError } = await supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .insert({ codigo, empresa, nome, inativo: "N", updated_at: new Date().toISOString() });

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
