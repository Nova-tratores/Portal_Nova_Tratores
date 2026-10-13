import { NextResponse } from "next/server";
import { contaOmie } from "@/lib/omie/contas";
import { omie } from "@/lib/omie/porta";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface OmieAccount {
  name: string;
  key: string;
  secret: string;
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { name: "Castro Peças", ...contaOmie("Castro Peças") },
];

interface OmieProdutoResponse {
  pagina: number;
  total_de_paginas: number;
  produto_servico_cadastro: Array<{
    codigo_produto: number;
    codigo_produto_integracao: string;
    codigo: string;
    descricao: string;
    valor_unitario: number;
    preco_venda?: number;
    cmc?: number;
  }>;
}

async function omieCall<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  acc: OmieAccount
): Promise<T> {
  // Porta única: 429/rede são repetidos por ela (sem espera própria de 60 s).
  const data: any = await omie({ appKey: acc.key, appSecret: acc.secret, rotulo: acc.name }, endpoint, call, param, { lancarFault: false });

  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }

  return data as T;
}

async function supabaseUpsert(registros: Record<string, unknown>[]) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Produtos_Completos?on_conflict=id_omie`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(registros),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upsert falhou: ${err}`);
  }
}

export async function POST() {
  try {
    let total = 0;
    const erros: string[] = [];

    for (const acc of OMIE_ACCOUNTS) {
      let pagina = 1;
      let totalPaginas = 1;

      while (pagina <= totalPaginas) {
        try {
          const res = await omieCall<OmieProdutoResponse>(
            "/geral/produtos/",
            "ListarProdutos",
            { pagina, registros_por_pagina: 500, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N" },
            acc
          );

          totalPaginas = res.total_de_paginas;

          const registros = (res.produto_servico_cadastro || []).map((p) => ({
            id_omie: p.codigo_produto,
            Codigo_Produto: p.codigo || p.codigo_produto_integracao || String(p.codigo_produto),
            Descricao_Produto: p.descricao || "",
            Preco_Unit: p.valor_unitario || 0,
            Preco_Venda: p.preco_venda ?? p.valor_unitario ?? 0,
            CMC: p.cmc ?? null,
            Empresa: acc.name,
          }));

          if (registros.length > 0) {
            await supabaseUpsert(registros);
            total += registros.length;
          }

          console.log(`[Sync Produtos ${acc.name}] Pág ${pagina}/${totalPaginas} (${registros.length} registros)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Sync ${acc.name}] Erro pág ${pagina}:`, msg);
          erros.push(`${acc.name} pág ${pagina}: ${msg}`);
        }

        pagina++;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    return NextResponse.json({
      sucesso: true,
      total,
      erros: erros.length > 0 ? erros : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Sync Produtos] Erro geral:", msg);
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
