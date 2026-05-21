import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccount,
  soDigitos,
  validarContaPagarParaOmie,
  type FinanPagarRow,
  type EnviarContaPagarOpts,
} from "@/lib/financeiro/omie-contapagar";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// =====================================================================
// POST — valida (sem enviar) um finan_pagar contra os requisitos do Omie.
//   body: {
//     finanPagarId,
//     opts?: { empresa, codigoCategoria, idContaCorrente, codigoProjeto, codigoVendedor, codigoTipoDocumento }
//   }
//   Em caso de sucesso (sem erros) atualiza status_envio='validado'.
// =====================================================================
export async function POST(req: NextRequest) {
  let body: {
    finanPagarId?: number | string;
    opts?: Partial<EnviarContaPagarOpts> & { empresa?: string };
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
    const opts = body.opts || {};
    const acc = getAccount(opts.empresa);

    const { data: row, error } = await supabase
      .from("finan_pagar")
      .select("*")
      .eq("id", body.finanPagarId)
      .single();
    if (error || !row) {
      return NextResponse.json({ ok: false, erro: `Registro finan_pagar #${body.finanPagarId} não encontrado.` }, { status: 404 });
    }

    // resolver fornecedor pra checar CNPJ
    // Estratégia em camadas (mais confiável → menos):
    //   1) CNPJ da NF-e (se XML foi importado) — match exato no documento
    //   2) Nome exato (case-insensitive)
    //   3) Nome parcial (ilike "%nome%")
    // Se encontrou cadastro SEM CNPJ mas a NF-e trouxe um → usa o da NF-e
    // pra desbloquear o envio e completa o cadastro de Fornecedores em background.
    let fornecedorCadastro: { documento?: string | null; id?: number | string; nome?: string } | null = null;
    let fornecedorMatchFonte: "cnpj-nfe" | "nome-exato" | "nome-parcial" | null = null;
    const cnpjNFe = soDigitos(String((row as Record<string, unknown>).nfe_cnpj_emitente || ""));

    if (cnpjNFe) {
      const { data: forns } = await supabase
        .from("Fornecedores")
        .select("id, nome, \"cpf/cnpj\"");
      const match = (forns || []).find((f) => soDigitos(String(f["cpf/cnpj"] || "")) === cnpjNFe);
      if (match) {
        fornecedorCadastro = { id: match.id, nome: match.nome, documento: String(match["cpf/cnpj"] || "") };
        fornecedorMatchFonte = "cnpj-nfe";
      }
    }

    if (!fornecedorCadastro && row.fornecedor) {
      const termo = String(row.fornecedor).trim();
      const { data: fornsExatos } = await supabase
        .from("Fornecedores")
        .select("id, nome, \"cpf/cnpj\"")
        .ilike("nome", termo)
        .limit(1);
      let forn = (fornsExatos || [])[0];
      let fonte: "nome-exato" | "nome-parcial" = "nome-exato";
      if (!forn) {
        const { data: fornsParciais } = await supabase
          .from("Fornecedores")
          .select("id, nome, \"cpf/cnpj\"")
          .ilike("nome", `%${termo}%`)
          .limit(5);
        forn = (fornsParciais || []).find((f) => soDigitos(String(f["cpf/cnpj"] || ""))) || (fornsParciais || [])[0];
        fonte = "nome-parcial";
      }
      if (forn) {
        fornecedorCadastro = { id: forn.id, nome: forn.nome, documento: String(forn["cpf/cnpj"] || "") };
        fornecedorMatchFonte = fonte;
      }
    }

    // Se achou cadastro mas sem CNPJ e a NF-e trouxe um, usa o da NF-e como documento
    // e completa o cadastro de Fornecedores (não bloqueia se falhar).
    if (fornecedorCadastro && !soDigitos(fornecedorCadastro.documento || "") && cnpjNFe) {
      fornecedorCadastro.documento = cnpjNFe;
      if (fornecedorCadastro.id != null) {
        supabase
          .from("Fornecedores")
          .update({ "cpf/cnpj": cnpjNFe })
          .eq("id", fornecedorCadastro.id)
          .then(({ error: upErr }) => {
            if (upErr) console.warn("[validar] falha ao completar CNPJ do fornecedor:", upErr.message);
          });
      }
    }

    const issues = validarContaPagarParaOmie({
      row: row as FinanPagarRow & Record<string, unknown>,
      opts: {
        empresa: acc.name,
        codigoCategoria: opts.codigoCategoria,
        idContaCorrente: opts.idContaCorrente ? Number(opts.idContaCorrente) : acc.codCC,
        codigoProjeto: opts.codigoProjeto ? Number(opts.codigoProjeto) : undefined,
        codigoVendedor: opts.codigoVendedor ? Number(opts.codigoVendedor) : undefined,
        codigoTipoDocumento: opts.codigoTipoDocumento,
      },
      fornecedorCadastro,
    });

    const erros = issues.filter((i) => i.severidade === "erro");
    const avisos = issues.filter((i) => i.severidade === "aviso");
    const valido = erros.length === 0;

    // se tudo válido E ainda está como rascunho, marca como 'validado'
    if (valido && row.status_envio === "rascunho") {
      await supabase
        .from("finan_pagar")
        .update({ status_envio: "validado", omie_validado_em: new Date().toISOString() })
        .eq("id", row.id);
    } else if (!valido && row.status_envio === "validado") {
      // se voltou a faltar algo, volta para rascunho
      await supabase
        .from("finan_pagar")
        .update({ status_envio: "rascunho" })
        .eq("id", row.id);
    }

    return NextResponse.json({
      ok: true,
      valido,
      erros,
      avisos,
      issues,
      fornecedorEncontrado: fornecedorCadastro
        ? {
            id: fornecedorCadastro.id ?? null,
            nome: fornecedorCadastro.nome ?? null,
            documento: fornecedorCadastro.documento || null,
            fonte: fornecedorMatchFonte,
          }
        : null,
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[contas-pagar/validar]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
