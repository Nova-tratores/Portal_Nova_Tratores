// Listas do Omie para a OS do portal espelhar a do Omie (José, 13/10/2026):
// departamentos, condições de parcela, contas correntes, categorias de receita
// e serviços cadastrados. Só LEITURA; cache de 30 min em memória.
//   GET ?os=<nº da OS no Omie>  → também devolve a OS do Omie (ConsultarOS)
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { contaOmie } from "@/lib/omie/contas";
import { omie as omiePorta } from "@/lib/omie/porta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// leitura pela porta única da Omie (fila + freio)
async function omie<T>(endpoint: string, call: string, param: Record<string, unknown>): Promise<T> {
  const { key, secret } = contaOmie("Nova Tratores");
  return omiePorta<T>({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, endpoint, call, param, { prioridade: "pessoa" });
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ListasOmie {
  departamentos: { codigo: string; nome: string }[];
  parcelas: { codigo: string; nome: string; uso: number }[];
  contas: { codigo: number; nome: string }[];
  categorias: { codigo: string; nome: string }[];
  servicos: { codigo: string; nCod: number; nome: string; preco: number; cabecalho: Record<string, unknown>; impostos: Record<string, unknown> }[];
  atualizadoEm: string;
}
const g = globalThis as unknown as { __omieListasPOS3?: { em: number; dados: ListasOmie } };

async function carregarListas(): Promise<ListasOmie> {
  if (g.__omieListasPOS3 && Date.now() - g.__omieListasPOS3.em < 30 * 60_000) return g.__omieListasPOS3.dados;
  const d = await omie<{ departamentos?: { codigo: string; descricao: string; inativo?: string }[] }>("/geral/departamentos/", "ListarDepartamentos", { pagina: 1, registros_por_pagina: 200 });
  await espera(400);
  const p = await omie<{ cadastros?: { nCodigo: string; cDescricao: string }[] }>("/geral/parcelas/", "ListarParcelas", { pagina: 1, registros_por_pagina: 200 });
  await espera(400);
  const c = await omie<{ ListarContasCorrentes?: { nCodCC: number; descricao: string; inativo?: string }[] }>("/geral/contacorrente/", "ListarContasCorrentes", { pagina: 1, registros_por_pagina: 200 });
  await espera(400);
  const cat = await omie<{ categoria_cadastro?: { codigo: string; descricao: string; conta_inativa?: string; conta_receita?: string; totalizadora?: string }[] }>("/geral/categorias/", "ListarCategorias", { pagina: 1, registros_por_pagina: 500 });
  await espera(400);
  // uso de cada condição de parcela nas OS mais recentes (ordem da lista = mais usada primeiro)
  const uso: Record<string, number> = {};
  try {
    const p1 = await omie<{ total_de_paginas?: number }>("/servicos/os/", "ListarOS", { pagina: 1, registros_por_pagina: 100 });
    const tot = Number(p1.total_de_paginas || 1);
    for (let pg = tot; pg >= Math.max(1, tot - 4); pg--) {
      const r = await omie<{ osCadastro?: { Cabecalho?: { cCodParc?: string } }[] }>("/servicos/os/", "ListarOS", { pagina: pg, registros_por_pagina: 100 });
      for (const o of r.osCadastro || []) { const k = String(o.Cabecalho?.cCodParc || ""); if (k) uso[k] = (uso[k] || 0) + 1; }
      await espera(400);
    }
  } catch { /* sem contagem: fica a ordem do Omie */ }
  const servicos: ListasOmie["servicos"] = [];
  for (let pag = 1, tot = 1; pag <= tot; pag++) {
    const s = await omie<{ nTotPaginas?: number; cadastros?: { cabecalho?: { cCodigo?: string; cDescricao?: string; nPrecoUnit?: number } & Record<string, unknown>; impostos?: Record<string, unknown>; intListar?: { nCodServ?: number }; info?: { inativo?: string } }[] }>("/servicos/servico/", "ListarCadastroServico", { nPagina: pag, nRegPorPagina: 100 });
    tot = s.nTotPaginas || 1;
    for (const x of s.cadastros || []) if (x.info?.inativo !== "S") servicos.push({ codigo: String(x.cabecalho?.cCodigo || ""), nCod: Number(x.intListar?.nCodServ || 0), nome: String(x.cabecalho?.cDescricao || "").replace(/^[.\s]+/, ""), preco: Number(x.cabecalho?.nPrecoUnit || 0), cabecalho: x.cabecalho || {}, impostos: x.impostos || {} });
    await espera(400);
  }
  const dados: ListasOmie = {
    departamentos: (d.departamentos || []).filter((x) => x.inativo !== "S").map((x) => ({ codigo: String(x.codigo), nome: String(x.descricao).replace(/\s+/g, " ").trim() })),
    parcelas: (p.cadastros || []).map((x) => ({ codigo: String(x.nCodigo), nome: String(x.cDescricao), uso: uso[String(x.nCodigo)] || 0 }))
      .sort((a, b) => b.uso - a.uso || a.codigo.localeCompare(b.codigo)),
    contas: (c.ListarContasCorrentes || []).filter((x) => x.inativo !== "S").map((x) => ({ codigo: Number(x.nCodCC), nome: String(x.descricao) })),
    categorias: (cat.categoria_cadastro || [])
      .filter((x) => x.conta_inativa !== "S" && x.totalizadora !== "S" && /^1\./.test(String(x.codigo)))
      .map((x) => ({ codigo: String(x.codigo), nome: String(x.descricao) })),
    servicos: servicos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    atualizadoEm: new Date().toISOString(),
  };
  g.__omieListasPOS3 = { em: Date.now(), dados };
  return dados;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const soCliente = req.nextUrl.searchParams.get("so") === "cliente";
  // só o cliente (botão de clipe do PPV): quem usa o PPV também pode
  if (!auth.isAdmin && !auth.modulos.includes("pos") && !auth.modulos.includes("ppv")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  try {
    const listas = soCliente ? null : await carregarListas();
    const num = String(req.nextUrl.searchParams.get("os") || "").replace(/\D/g, "").replace(/^0+/, "");
    const os = num && !soCliente ? await omie<Record<string, unknown>>("/servicos/os/", "ConsultarOS", { cNumOS: num }).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) })) : null;
    // cliente do Omie: pela OS (nCodCli) ou pelo CPF/CNPJ do portal
    const nCodCli = os && !("erro" in os) ? Number((os as { Cabecalho?: { nCodCli?: number } }).Cabecalho?.nCodCli || 0) : 0;
    const doc = String(req.nextUrl.searchParams.get("cnpj") || "").replace(/\D/g, "");
    let cliente: Record<string, unknown> | null = null;
    try {
      if (nCodCli) cliente = await omie("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: nCodCli });
      else if (doc) {
        const l = await omie<{ clientes_cadastro?: Record<string, unknown>[] }>("/geral/clientes/", "ListarClientes", { pagina: 1, registros_por_pagina: 5, clientesFiltro: { cnpj_cpf: doc } });
        cliente = l.clientes_cadastro?.[0] || null;
      }
    } catch { /* sem cliente */ }
    return NextResponse.json({ listas, os, cliente });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao ler o Omie." }, { status: 502 });
  }
}
