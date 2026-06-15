import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccount,
  OMIE_ACCOUNTS,
  soDigitos,
  buscarOuCriarFornecedorOmie,
  listarCategoriasDespesa,
  listarContasCorrentes,
  listarProjetos,
  listarTiposDocumento,
  listarDepartamentos,
  carregarVendedoresOmie,
  enviarFinanPagarParaOmie,
  anexarDocumentosContaPagarOmie,
  validarContaPagarParaOmie,
  type FinanPagarRow,
  type OmieAccount,
} from "@/lib/financeiro/omie-contapagar";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// =====================================================================
// CACHE persistente em Supabase (tabela omie_cache, TTL 24h)
// =====================================================================
const TTL_HORAS = 24;

interface CacheEntry {
  codigo: string;
  descricao: string | null;
  payload: Record<string, unknown> | null;
  atualizado: string;
}

async function lerCacheFresco(empresa: string, tipo: string): Promise<CacheEntry[] | null> {
  const { data, error } = await supabase
    .from("omie_cache")
    .select("codigo, descricao, payload, atualizado")
    .eq("empresa", empresa)
    .eq("tipo", tipo)
    .order("atualizado", { ascending: false });
  if (error || !data || data.length === 0) return null;
  const ultimo = new Date(data[0].atualizado);
  const idadeHoras = (Date.now() - ultimo.getTime()) / 3_600_000;
  if (idadeHoras > TTL_HORAS) return null;
  return data as CacheEntry[];
}

async function gravarCache(empresa: string, tipo: string, itens: Array<{ codigo: string | number; descricao?: string; payload?: Record<string, unknown> }>): Promise<void> {
  if (!itens.length) return;
  const rows = itens.map((i) => ({
    empresa,
    tipo,
    codigo: String(i.codigo),
    descricao: i.descricao ?? null,
    payload: i.payload ?? null,
    atualizado: new Date().toISOString(),
  }));
  // upsert no PK composto (empresa, tipo, codigo)
  await supabase.from("omie_cache").upsert(rows, { onConflict: "empresa,tipo,codigo" });
}

async function obterListagem(
  acc: OmieAccount,
  tipo: "categorias" | "contas" | "projetos" | "vendedores" | "tipos_documento" | "departamentos",
): Promise<Array<{ codigo: string | number; descricao?: string; payload?: Record<string, unknown> }>> {
  const fresco = await lerCacheFresco(acc.name, tipo);
  if (fresco) {
    return fresco.map((e) => ({
      codigo: e.codigo,
      descricao: e.descricao || undefined,
      payload: e.payload || undefined,
    }));
  }

  let itens: Array<{ codigo: string | number; descricao?: string; payload?: Record<string, unknown> }> = [];
  if (tipo === "categorias") {
    const lista = await listarCategoriasDespesa(acc);
    itens = lista.map((c) => ({ codigo: c.codigo, descricao: c.descricao }));
  } else if (tipo === "contas") {
    const lista = await listarContasCorrentes(acc);
    itens = lista.map((c) => ({ codigo: c.id, descricao: c.descricao, payload: { tipo: c.tipo } }));
  } else if (tipo === "projetos") {
    const lista = await listarProjetos(acc);
    itens = lista.map((p) => ({ codigo: p.codigo, descricao: p.nome }));
  } else if (tipo === "vendedores") {
    const lista = await carregarVendedoresOmie(acc);
    itens = lista.map((v) => ({ codigo: v.codigo, descricao: v.nome }));
  } else if (tipo === "tipos_documento") {
    const lista = await listarTiposDocumento(acc);
    itens = lista.map((t) => ({ codigo: t.codigo, descricao: t.descricao }));
  } else if (tipo === "departamentos") {
    const lista = await listarDepartamentos(acc);
    itens = lista.map((d) => ({ codigo: d.codigo, descricao: d.descricao }));
  }
  // grava cache em paralelo (não bloqueia resposta)
  gravarCache(acc.name, tipo, itens).catch((e) => console.warn("[omie_cache] gravação falhou:", e instanceof Error ? e.message : e));
  return itens;
}

// =====================================================================
// GET — opções para os dropdowns (categorias, contas, projetos, vendedores, tiposDocumento)
//   /api/financeiro/contas-pagar/omie?empresa=Nova%20Tratores
//   opcional: &tipo=categorias|contas|projetos|vendedores|tipos_documento  (default: todas)
// =====================================================================
export async function GET(req: NextRequest) {
  try {
    const empresa = req.nextUrl.searchParams.get("empresa") || OMIE_ACCOUNTS[0].name;
    const tipoFiltro = req.nextUrl.searchParams.get("tipo");
    const acc = getAccount(empresa);

    const out: Record<string, unknown> = {
      empresa: acc.name,
      empresas: OMIE_ACCOUNTS.map((a) => a.name),
      contaCorrentePadrao: acc.codCC,
    };

    const todos = !tipoFiltro;
    if (todos || tipoFiltro === "categorias") {
      const itens = await obterListagem(acc, "categorias");
      out.categorias = itens.map((i) => ({ codigo: String(i.codigo), descricao: i.descricao || "" }));
    }
    if (todos || tipoFiltro === "contas") {
      const itens = await obterListagem(acc, "contas");
      out.contas = itens.map((i) => ({ id: Number(i.codigo), descricao: i.descricao || "", tipo: i.payload?.tipo }));
    }
    if (todos || tipoFiltro === "projetos") {
      const itens = await obterListagem(acc, "projetos");
      out.projetos = itens.map((i) => ({ codigo: Number(i.codigo), nome: i.descricao || "" }));
    }
    if (todos || tipoFiltro === "vendedores") {
      const itens = await obterListagem(acc, "vendedores");
      out.vendedores = itens.map((i) => ({ codigo: Number(i.codigo), nome: i.descricao || "" }));
    }
    if (todos || tipoFiltro === "tipos_documento") {
      const itens = await obterListagem(acc, "tipos_documento");
      out.tiposDocumento = itens.map((i) => ({ codigo: String(i.codigo), descricao: i.descricao || "" }));
    }
    if (todos || tipoFiltro === "departamentos") {
      const itens = await obterListagem(acc, "departamentos");
      out.departamentos = itens.map((i) => ({ codigo: String(i.codigo), descricao: i.descricao || "" }));
    }

    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[contas-pagar/omie GET]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}

// =====================================================================
// POST — cria o lançamento de contas a pagar no Omie a partir de um finan_pagar
//   body: { finanPagarId, empresa, codigoCategoria?, idContaCorrente?, codigoProjeto?,
//           codigoVendedor?, codigoTipoDocumento? }
// =====================================================================
export async function POST(req: NextRequest) {
  let body: {
    finanPagarId?: number | string;
    empresa?: string;
    codigoCategoria?: string;
    idContaCorrente?: number | string;
    codigoProjeto?: number | string;
    codigoVendedor?: number | string;
    codigoTipoDocumento?: string;
    codigoDepartamento?: string;
    chaveNFe?: string;
    enviadoPor?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  if (!body.finanPagarId) {
    return NextResponse.json({ ok: false, erro: "finanPagarId obrigatório." }, { status: 400 });
  }

  try {
    const acc = getAccount(body.empresa);

    // 1) carregar o registro finan_pagar
    const { data: row, error: rowErr } = await supabase
      .from("finan_pagar")
      .select("*")
      .eq("id", body.finanPagarId)
      .single();
    if (rowErr || !row) {
      return NextResponse.json({ ok: false, erro: `Registro finan_pagar #${body.finanPagarId} não encontrado.` }, { status: 404 });
    }

    // já enviado?
    if (row.omie_cod_lancamento) {
      return NextResponse.json({
        ok: true,
        jaEnviado: true,
        codigos: String(row.omie_cod_lancamento).split(",").map((s: string) => s.trim()).filter(Boolean),
        empresa: row.omie_empresa || acc.name,
      });
    }

    if (!row.fornecedor) {
      return NextResponse.json({ ok: false, erro: "Registro sem fornecedor." }, { status: 200 });
    }

    // 2) achar o fornecedor no cadastro (para obter CNPJ/telefone) e resolver o código no Omie
    //    Estratégia: CNPJ da NF-e → nome exato → nome parcial. Se achou cadastro
    //    sem CNPJ mas a NF-e trouxe um, usa o da NF-e e completa o cadastro.
    const colCache = acc.name.toLowerCase().includes("castro") ? "id_omie_castro" : "id_omie";
    const cnpjNFe = soDigitos(String((row as Record<string, unknown>).nfe_cnpj_emitente || ""));
    type FornRow = { id: number | string; nome: string; numero?: string | null; "cpf/cnpj"?: string | null; id_omie?: number | null; id_omie_castro?: number | null };
    let forn: FornRow | undefined;

    if (cnpjNFe) {
      const { data: forns } = await supabase
        .from("Fornecedores")
        .select("id, nome, numero, \"cpf/cnpj\", id_omie, id_omie_castro");
      forn = ((forns || []) as FornRow[]).find((f) => soDigitos(String(f["cpf/cnpj"] || "")) === cnpjNFe);
    }

    if (!forn) {
      const termo = String(row.fornecedor).trim();
      const { data: fornsExatos } = await supabase
        .from("Fornecedores")
        .select("id, nome, numero, \"cpf/cnpj\", id_omie, id_omie_castro")
        .ilike("nome", termo);
      forn = ((fornsExatos || []) as FornRow[]).find((f) => f.nome?.trim().toLowerCase() === termo.toLowerCase()) || (fornsExatos || [])[0] as FornRow | undefined;

      if (!forn) {
        const { data: fornsParciais } = await supabase
          .from("Fornecedores")
          .select("id, nome, numero, \"cpf/cnpj\", id_omie, id_omie_castro")
          .ilike("nome", `%${termo}%`)
          .limit(5);
        forn = ((fornsParciais || []) as FornRow[]).find((f) => soDigitos(String(f["cpf/cnpj"] || ""))) || (fornsParciais || [])[0] as FornRow | undefined;
      }
    }

    // Se achou cadastro sem CNPJ e a NF-e trouxe um, completa o cadastro antes do envio
    if (forn && !soDigitos(String(forn["cpf/cnpj"] || "")) && cnpjNFe) {
      forn["cpf/cnpj"] = cnpjNFe;
      await supabase.from("Fornecedores").update({ "cpf/cnpj": cnpjNFe }).eq("id", forn.id);
    }

    // -----------------------------------------------------------------
    // VALIDAÇÃO GATE — antes de qualquer chamada Omie (Fase 3.1)
    // -----------------------------------------------------------------
    const issues = validarContaPagarParaOmie({
      row: row as FinanPagarRow & Record<string, unknown>,
      opts: {
        empresa: acc.name,
        codigoCategoria: body.codigoCategoria,
        idContaCorrente: body.idContaCorrente ? Number(body.idContaCorrente) : acc.codCC,
        codigoProjeto: body.codigoProjeto ? Number(body.codigoProjeto) : undefined,
        codigoVendedor: body.codigoVendedor ? Number(body.codigoVendedor) : undefined,
        codigoTipoDocumento: body.codigoTipoDocumento,
      },
      fornecedorCadastro: forn ? { documento: String(forn["cpf/cnpj"] || "") } : null,
    });
    const erros = issues.filter((i) => i.severidade === "erro");
    if (erros.length > 0) {
      return NextResponse.json({ ok: false, erro: "Faltam dados obrigatórios para enviar.", issues, erros }, { status: 200 });
    }

    let codFornecedor: number;
    const cacheAtual = forn![colCache as "id_omie" | "id_omie_castro"];
    if (cacheAtual) {
      codFornecedor = Number(cacheAtual);
    } else {
      const documento = String(forn!["cpf/cnpj"] || "").trim();
      codFornecedor = await buscarOuCriarFornecedorOmie(
        { nome: forn!.nome, documento, telefone: forn!.numero || undefined, fornecedorId: forn!.id },
        acc,
      );
      // grava o código de volta no cadastro (cache)
      await supabase.from("Fornecedores").update({ [colCache]: codFornecedor }).eq("id", forn!.id);
    }

    // 3) criar o(s) lançamento(s) no Omie
    const codigoCategoria = body.codigoCategoria ? String(body.codigoCategoria) : undefined;
    const idContaCorrente = body.idContaCorrente ? Number(body.idContaCorrente) : acc.codCC;
    const codigoProjeto = body.codigoProjeto ? Number(body.codigoProjeto) : undefined;
    const codigoVendedor = body.codigoVendedor ? Number(body.codigoVendedor) : undefined;
    const codigoTipoDocumento = body.codigoTipoDocumento || undefined;
    // numero_documento_fiscal do Omie = NÚMERO da nota (ex "14052"), máx 20 chars.
    // NÃO é a chave de acesso de 44 dígitos (essa fica só no portal, em nfe_chave).
    const numeroDocumentoFiscal = row.numero_NF ? String(row.numero_NF).trim() : undefined;
    // Departamento: vem do select (body). Chave NF-e: do body (digitado/lido na
    // hora) com fallback para o que já está salvo no finan_pagar.
    const codigoDepartamento = body.codigoDepartamento ? String(body.codigoDepartamento) : undefined;
    const chaveNFe = (body.chaveNFe || row.nfe_chave) ? String(body.chaveNFe || row.nfe_chave) : undefined;

    let codigos: number[] = [];
    let jaExistia = false;
    try {
      const r = await enviarFinanPagarParaOmie(
        row as FinanPagarRow,
        { codFornecedor, codigoCategoria, idContaCorrente, codigoProjeto, codigoVendedor, codigoTipoDocumento, numeroDocumentoFiscal, codigoDepartamento, chaveNFe, enviadoPor: body.enviadoPor },
        acc,
      );
      codigos = r.codigos;
      jaExistia = r.jaExistia;
    } catch (envErr) {
      const erro = envErr instanceof Error ? envErr.message : String(envErr);
      await supabase
        .from("finan_pagar")
        .update({ status_envio: "erro", omie_ultimo_erro: erro })
        .eq("id", row.id);
      return NextResponse.json({ ok: false, erro }, { status: 200 });
    }

    // 4) gravar referências no finan_pagar
    await supabase
      .from("finan_pagar")
      .update({
        omie_cod_lancamento: codigos.join(", "),
        omie_empresa: acc.name,
        omie_sync_em: new Date().toISOString(),
        omie_categoria: codigoCategoria || null,
        omie_conta_corrente: idContaCorrente || null,
        omie_projeto: codigoProjeto || null,
        omie_vendedor: codigoVendedor || null,
        omie_tipo_documento: codigoTipoDocumento || null,
        omie_departamento: codigoDepartamento || null,
        nfe_chave: chaveNFe || null,
        status_envio: "enviado",
        omie_ultimo_erro: null,
      })
      .eq("id", row.id);

    // 5) anexar NF, boletos, requisições e XML ao lançamento (best-effort)
    let anexos: { ok: number; falhas: string[] } = { ok: 0, falhas: [] };
    try {
      anexos = await anexarDocumentosContaPagarOmie(row as Record<string, unknown>, codigos[0], acc);
    } catch (e) {
      console.warn("[omie anexos]", e instanceof Error ? e.message : e);
      anexos = { ok: 0, falhas: ["Falha geral ao anexar documentos."] };
    }

    return NextResponse.json({ ok: true, codigos, empresa: acc.name, jaExistia, anexos, issues: issues.filter((i) => i.severidade === "aviso") });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[contas-pagar/omie POST]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 200 });
  }
}
