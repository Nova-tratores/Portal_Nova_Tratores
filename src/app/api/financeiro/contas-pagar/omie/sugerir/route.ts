// POST /api/financeiro/contas-pagar/omie/sugerir — sugere a classificação
// Omie (categoria, conta corrente, tipo de documento, departamento) para uma
// conta a pagar nascida de requisição, na ordem de confiança:
//
//   1. HISTÓRICO: o mesmo fornecedor já teve conta ENVIADA ao Omie? Copia a
//      classificação mais frequente das últimas — é como o financeiro já
//      classifica esse fornecedor, ninguém precisa adivinhar.
//   2. ANEXOS: tipo de documento sem histórico sai do que a requisição TEM —
//      NF → DANFE, boleto → BOL, recibo → REC (validado contra o cache).
//   3. IA (Tratorilson): sem histórico, o gpt-4o-mini escolhe categoria e
//      departamento pelo contexto da requisição (tipo, título, obs, setor)
//      dentre as listas REAIS do omie_cache — resposta fora da lista é
//      descartada. Uma chamada só pros dois campos.
//   4. Padrões: conta corrente cai no codCC da empresa.
//
// É SUGESTÃO: o painel abre com os selects preenchidos e o revisor troca à
// vontade — nada vai ao Omie sem passar pelo checklist de envio.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { getAccount } from "@/lib/financeiro/omie-contapagar";
import { chamarIA } from "@/lib/assistente/ia";
import { logTratorilson } from "@/lib/assistente/log";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface HistRow {
  omie_empresa: string | null;
  omie_cod_lancamento: string | number | null;
  omie_categoria: string | null;
  omie_conta_corrente: number | null;
  omie_tipo_documento: string | null;
  omie_departamento: string | null;
}

// valor mais frequente (empate: o mais recente vence — a lista chega ordenada)
function moda<T>(valores: (T | null | undefined)[]): T | null {
  const contagem = new Map<T, number>();
  for (const v of valores) {
    if (v === null || v === undefined || v === ("" as unknown as T)) continue;
    contagem.set(v, (contagem.get(v) || 0) + 1);
  }
  let melhor: T | null = null;
  let max = 0;
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    const n = contagem.get(v) || 0;
    if (n > max) { max = n; melhor = v; }
  }
  return melhor;
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  let body: {
    empresa?: string;
    fornecedor?: string;
    tipoReq?: string;
    titulo?: string;
    obs?: string;
    setor?: string;
    temNF?: boolean;
    temBoleto?: boolean;
    temRecibo?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  try {
    const acc = getAccount(body.empresa);
    const fornecedor = String(body.fornecedor || "").trim();

    const origem: Record<string, string> = {};
    let codigoCategoria: string | null = null;
    let idContaCorrente: number | null = null;
    let codigoTipoDocumento: string | null = null;
    let codigoDepartamento: string | null = null;

    // 1) histórico do fornecedor (só contas que chegaram ao Omie de verdade)
    if (fornecedor) {
      const { data: hist } = await supabase
        .from("finan_pagar")
        .select("omie_empresa, omie_cod_lancamento, omie_categoria, omie_conta_corrente, omie_tipo_documento, omie_departamento")
        .ilike("fornecedor", fornecedor)
        .not("omie_cod_lancamento", "is", null)
        .order("id", { ascending: false })
        .limit(30);
      // códigos de categoria/conta são POR EMPRESA — histórico de outra conta
      // Omie não serve
      const doMesmo = ((hist || []) as HistRow[]).filter(
        (r) => !r.omie_empresa || r.omie_empresa === acc.name,
      );
      codigoCategoria = moda(doMesmo.map((r) => r.omie_categoria));
      idContaCorrente = moda(doMesmo.map((r) => r.omie_conta_corrente));
      codigoTipoDocumento = moda(doMesmo.map((r) => r.omie_tipo_documento));
      codigoDepartamento = moda(doMesmo.map((r) => r.omie_departamento));
      if (codigoCategoria) origem.categoria = "historico";
      if (idContaCorrente) origem.contaCorrente = "historico";
      if (codigoTipoDocumento) origem.tipoDocumento = "historico";
      if (codigoDepartamento) origem.departamento = "historico";
    }

    // 2) tipo de documento sem histórico: regra pelos ANEXOS da requisição —
    //    os códigos usados na prática (DANFE/BOL/REC) casam direto com o que
    //    a req tem. Só vale se o código existir na lista da empresa no cache.
    if (!codigoTipoDocumento) {
      const palpite = body.temNF ? "DANFE" : body.temBoleto ? "BOL" : body.temRecibo ? "REC" : null;
      if (palpite) {
        const { data: tipos } = await supabase
          .from("omie_cache")
          .select("codigo")
          .eq("empresa", acc.name)
          .eq("tipo", "tipos_documento")
          .eq("codigo", palpite)
          .limit(1);
        if (tipos && tipos.length > 0) {
          codigoTipoDocumento = palpite;
          origem.tipoDocumento = "anexos";
        }
      }
    }

    // 3) categoria e/ou departamento sem histórico → Tratorilson escolhe das
    //    listas reais do cache, numa chamada só (resposta em JSON)
    if (!codigoCategoria || !codigoDepartamento) {
      const lerCache = async (tipo: string) => {
        const { data } = await supabase
          .from("omie_cache")
          .select("codigo, descricao")
          .eq("empresa", acc.name)
          .eq("tipo", tipo)
          .order("codigo");
        return (data || []).filter((c) => c.codigo && c.descricao);
      };
      const cats = !codigoCategoria ? await lerCache("categorias") : [];
      const deps = !codigoDepartamento ? await lerCache("departamentos") : [];
      if ((cats.length > 0 || deps.length > 0) && process.env.OPENAI_API_KEY) {
        const contexto = [
          body.tipoReq ? `Tipo da requisição: ${body.tipoReq}` : "",
          body.titulo ? `Título: ${body.titulo}` : "",
          fornecedor ? `Fornecedor: ${fornecedor}` : "",
          body.setor ? `Setor solicitante: ${body.setor}` : "",
          body.obs ? `Descrição: ${String(body.obs).slice(0, 400)}` : "",
        ].filter(Boolean).join("\n");
        const partes: string[] = [];
        if (cats.length > 0) {
          partes.push(`Categorias de despesa disponíveis (código — descrição):\n` +
            cats.map((c) => `${c.codigo} — ${c.descricao}`).join("\n"));
        }
        if (deps.length > 0) {
          partes.push(`Departamentos disponíveis (código — descrição):\n` +
            deps.map((d) => `${d.codigo} — ${d.descricao}`).join("\n"));
        }
        const pedir = [
          cats.length > 0 ? '"categoria" (código da categoria mais adequada)' : "",
          deps.length > 0 ? '"departamento" (código do departamento mais adequado; null se nenhum encaixar)' : "",
        ].filter(Boolean).join(" e ");
        const pergunta =
          `Classifique esta despesa de uma concessionária de tratores.\n\n${contexto}\n\n` +
          partes.join("\n\n") +
          `\n\nResponda SOMENTE um JSON com ${pedir}. Ex.: {"categoria":"2.01.03","departamento":"123"}`;
        try {
          const resp = await chamarIA({
            messages: [
              { role: "system", content: "Você classifica despesas no plano de contas do Omie. Responda apenas o JSON pedido, sem comentários." },
              { role: "user", content: pergunta },
            ],
            max_tokens: 60,
            temperature: 0,
            response_format: { type: "json_object" },
          });
          const texto = String(resp?.choices?.[0]?.message?.content || "").trim();
          let json: Record<string, unknown> = {};
          try { json = JSON.parse(texto); } catch { /* resposta fora do formato: descarta */ }
          // vale só o que EXISTE nas listas (IA não inventa código)
          const catIA = String(json.categoria ?? "").trim();
          if (!codigoCategoria && catIA && cats.some((c) => String(c.codigo) === catIA)) {
            codigoCategoria = catIA;
            origem.categoria = "ia";
          }
          const depIA = String(json.departamento ?? "").trim();
          if (!codigoDepartamento && depIA && deps.some((d) => String(d.codigo) === depIA)) {
            codigoDepartamento = depIA;
            origem.departamento = "ia";
          }
          logTratorilson({
            userId: auth.userId,
            userName: auth.email || undefined,
            tipo: "financeiro:categoria",
            pergunta: contexto,
            resposta: texto,
            modelo: String(resp?.model || ""),
            tokens: Number(resp?.usage?.total_tokens) || 0,
          });
        } catch (e) {
          console.warn("[sugerir categoria/departamento IA]", e instanceof Error ? e.message : e);
        }
      }
    }

    // 4) conta corrente padrão da empresa quando o histórico não disse
    if (!idContaCorrente && acc.codCC) {
      idContaCorrente = Number(acc.codCC);
      origem.contaCorrente = "padrao";
    }

    return NextResponse.json({
      ok: true,
      empresa: acc.name,
      codigoCategoria,
      idContaCorrente,
      codigoTipoDocumento,
      codigoDepartamento,
      origem,
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[contas-pagar/omie/sugerir]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
