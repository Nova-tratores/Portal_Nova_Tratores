import { NextResponse } from "next/server";

const OMIE_BASE = "https://app.omie.com.br/api/v1";

const CONTAS = [
  { empresa: "Nova Tratores", key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131" },
  { empresa: "Castro Peças", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];

export async function GET() {
  const results: any[] = [];

  for (const acc of CONTAS) {
    const payload = {
      call: "ListarNF",
      app_key: acc.key,
      app_secret: acc.secret,
      param: [{
        pagina: 1,
        registros_por_pagina: 2,
        tpNF: "0",
        tpAmb: "1",
        dEmiInicial: "01/01/2025",
        dEmiFinal: "31/01/2025",
      }],
    };

    try {
      const res = await fetch(`${OMIE_BASE}/produtos/nfconsultar/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      const nf0 = data.nfCadastro?.[0];
      results.push({
        empresa: acc.empresa,
        status: res.status,
        tem_fault: !!data.faultstring,
        faultstring: data.faultstring || null,
        total_paginas: data.total_de_paginas || null,
        total_registros: data.total_de_registros || null,
        qtd_nfCadastro: (data.nfCadastro || []).length,
        keys_resposta: Object.keys(data),
        keys_nf: nf0 ? Object.keys(nf0) : null,
        ide: nf0?.ide || null,
        tem_nCodNF_em_ide: nf0?.ide?.nCodNF !== undefined,
        tem_nCodNF_raiz: nf0?.nCodNF !== undefined,
        nNF: nf0?.ide?.nNF || null,
        serie: nf0?.ide?.serie || null,
      });
    } catch (e: any) {
      results.push({ empresa: acc.empresa, erro: e.message });
    }
  }

  return NextResponse.json(results, { status: 200 });
}
