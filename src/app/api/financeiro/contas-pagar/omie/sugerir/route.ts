// POST /api/financeiro/contas-pagar/omie/sugerir — sugere a classificação
// Omie (categoria, conta corrente, tipo de documento, departamento) para uma
// conta a pagar nascida de requisição, na ordem de confiança:
//
//   1. HISTÓRICO: o mesmo fornecedor já teve conta ENVIADA ao Omie? Copia a
//      classificação mais frequente das últimas — é como o financeiro já
//      classifica esse fornecedor, ninguém precisa adivinhar.
//   2. IA (Tratorilson): sem histórico, o gpt-4o-mini escolhe a categoria
//      pelo contexto da requisição (tipo, título, obs) dentre as categorias
//      REAIS do omie_cache — resposta fora da lista é descartada.
//   3. Padrões: conta corrente cai no codCC da empresa. Tipo de documento e
//      departamento só saem do histórico (chutar esses não ajuda ninguém).
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

    // 2) sem histórico de categoria → Tratorilson escolhe da lista real
    if (!codigoCategoria) {
      const { data: cats } = await supabase
        .from("omie_cache")
        .select("codigo, descricao")
        .eq("empresa", acc.name)
        .eq("tipo", "categorias")
        .order("codigo");
      const lista = (cats || []).filter((c) => c.codigo && c.descricao);
      if (lista.length > 0 && process.env.OPENAI_API_KEY) {
        const contexto = [
          body.tipoReq ? `Tipo da requisição: ${body.tipoReq}` : "",
          body.titulo ? `Título: ${body.titulo}` : "",
          fornecedor ? `Fornecedor: ${fornecedor}` : "",
          body.setor ? `Setor: ${body.setor}` : "",
          body.obs ? `Descrição: ${String(body.obs).slice(0, 400)}` : "",
        ].filter(Boolean).join("\n");
        const pergunta =
          `Classifique esta despesa de uma concessionária de tratores na categoria mais adequada.\n\n${contexto}\n\n` +
          `Categorias disponíveis (código — descrição):\n` +
          lista.map((c) => `${c.codigo} — ${c.descricao}`).join("\n") +
          `\n\nResponda SOMENTE o código da categoria escolhida (ex.: 2.01.03). Nada além do código.`;
        try {
          const resp = await chamarIA({
            messages: [
              { role: "system", content: "Você classifica despesas no plano de categorias do Omie. Responda apenas o código." },
              { role: "user", content: pergunta },
            ],
            max_tokens: 20,
            temperature: 0,
          });
          const texto = String(resp?.choices?.[0]?.message?.content || "").trim();
          // vale só se for um código que EXISTE na lista (IA não inventa categoria)
          const achada = lista.find((c) => texto === c.codigo || texto.startsWith(String(c.codigo)));
          if (achada) {
            codigoCategoria = String(achada.codigo);
            origem.categoria = "ia";
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
          console.warn("[sugerir categoria IA]", e instanceof Error ? e.message : e);
        }
      }
    }

    // 3) conta corrente padrão da empresa quando o histórico não disse
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
