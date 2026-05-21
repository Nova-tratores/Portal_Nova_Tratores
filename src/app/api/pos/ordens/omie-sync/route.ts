import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

const NCODSERV_HORA = 1979758762;
const NCODSERV_KM = 1975974257;
const NCODSERV_SOL = 2209673817;

interface OmieAccount { name: string; key: string; secret: string }

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", key: process.env.OMIE_APP_KEY || "2729522270475", secret: process.env.OMIE_APP_SECRET || "113d785bb86c48d064889d4d73348131" },
  { name: "Castro Pecas", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount): Promise<T> {
  const res = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param, acc);
  }
  const data = await res.json();
  if (data?.faultstring) throw new Error(`Omie [${acc.name}]: ${data.faultstring}`);
  return data as T;
}

function parseDataOmie(d: string): string | null {
  if (!d) return null;
  const [dia, mes, ano] = d.split("/");
  return `${ano}-${mes}-${dia}`;
}

function limparNomeVendedor(nome: string): string[] {
  const semPrefixo = nome.replace(/^(T[eé]cnicos?(\s+Externo)?|Vendedor|Motorista)\s*:\s*/i, "").trim();
  return semPrefixo.split(/\s*\/\/\s*/).map(n => n.trim()).filter(Boolean);
}

// Normaliza nome removendo acentos e lowercase para comparacao
function normNome(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Constroi mapa de nomes canonicos a partir dos vendedores "solo" (1 tecnico)
// Depois mapeia variantes (combo) para o nome canonico mais proximo
function buildCanonicalMap(vendedores: OmieVendedor[]): Map<string, string> {
  const canonicos: string[] = [];
  // Primeiro passo: coletar nomes dos vendedores solo (prefixo "Técnico:" singular)
  for (const v of vendedores) {
    if (v.inativo === "S") continue;
    const nome = v.nome;
    // Solo = tem "Técnico:" (singular, sem "s") e nao tem "//"
    if (/^T[eé]cnico[^s]/i.test(nome) && !nome.includes("//")) {
      const partes = limparNomeVendedor(nome);
      if (partes.length === 1 && partes[0].length > 2) {
        canonicos.push(partes[0]);
      }
    }
  }

  // Mapa: normNome -> nome canonico
  const normToCanon = new Map<string, string>();
  for (const c of canonicos) normToCanon.set(normNome(c), c);

  // Funcao para encontrar o canonico mais proximo de um nome
  function findCanon(nome: string): string {
    const n = normNome(nome);
    // Match exato
    if (normToCanon.has(n)) return normToCanon.get(n)!;
    // Match parcial: primeiro nome + algum sobrenome em comum
    const partes = n.split(/\s+/).filter(p => p.length > 2);
    if (partes.length === 0) return nome;
    let melhor = "";
    let melhorScore = 0;
    for (const [cn, cv] of normToCanon) {
      const cp = cn.split(/\s+/).filter(p => p.length > 2);
      if (cp[0] !== partes[0]) continue; // primeiro nome deve bater
      // Contar partes em comum
      const set = new Set(cp);
      const score = partes.filter(p => set.has(p)).length;
      if (score > melhorScore) { melhorScore = score; melhor = cv; }
    }
    if (melhor) {
      // Cachear para proximas buscas
      normToCanon.set(n, melhor);
      return melhor;
    }
    return nome;
  }

  // Segundo passo: mapear TODOS os nomes (incluindo combos) para canonico
  const result = new Map<string, string>();
  for (const v of vendedores) {
    if (v.inativo === "S") continue;
    const partes = limparNomeVendedor(v.nome);
    for (const p of partes) {
      if (p.length > 2 && !result.has(p)) {
        result.set(p, findCanon(p));
      }
    }
  }

  return result;
}

interface OmieVendedor { codigo: number; nome: string; inativo: string }
interface OmieOS {
  Cabecalho: {
    cNumOS: string; nCodOS: number; cCodIntOS: string; cEtapa: string;
    dDtPrevisao: string; nCodCli: number; nCodVend: number; nValorTotal: number;
  };
  InfoCadastro: { dDtInc: string; dDtFat: string; cCancelada: string; cFaturada: string };
  InformacoesAdicionais: { cDadosAdicNF?: string; cCidPrestServ?: string; cNumContrato?: string };
  Observacoes: { cObsOS?: string };
  ServicosPrestados: Array<{ nCodServico: number; nQtde: number; nValUnit: number; cDescServ?: string; cNaoGerarFinanceiro?: string }>;
}

const ETAPA_LABEL: Record<string, string> = {
  "10": "Em Aberto", "20": "Parcial", "30": "Executada",
  "50": "Faturando", "60": "Faturada",
};

export async function POST(req: NextRequest) {
  const ano = req.nextUrl.searchParams.get("ano") || String(new Date().getFullYear());

  try {
    let totalSync = 0;

    for (const acc of OMIE_ACCOUNTS) {
      // 1. Buscar vendedores
      const vendMap = new Map<number, string>();
      const tecMap = new Map<number, string[]>();
      const allVendedores: OmieVendedor[] = [];
      let pag = 1, totPag = 1;
      while (pag <= totPag) {
        const r = await omieCall<{ cadastro?: OmieVendedor[]; total_de_paginas?: number }>(
          "/geral/vendedores/", "ListarVendedores", { pagina: pag, registros_por_pagina: 200 }, acc
        );
        if (pag === 1 && r.total_de_paginas) totPag = r.total_de_paginas;
        allVendedores.push(...(r.cadastro || []));
        pag++;
      }

      // Construir mapa de nomes canonicos
      const canonMap = buildCanonicalMap(allVendedores);

      for (const v of allVendedores) {
        vendMap.set(v.codigo, v.nome);
        const nomes = limparNomeVendedor(v.nome).map(n => canonMap.get(n) || n);
        tecMap.set(v.codigo, nomes);
      }

      // 2. Buscar OS do ano (paginado)
      const rows: Record<string, unknown>[] = [];
      pag = 1; totPag = 1;
      while (pag <= totPag) {
        const r = await omieCall<{ osCadastro?: OmieOS[]; total_de_paginas?: number }>(
          "/servicos/os/", "ListarOS", {
            pagina: pag, registros_por_pagina: 500,
            filtrar_por_data_de: `01/01/${ano}`, filtrar_por_data_ate: `31/12/${ano}`,
            filtrar_apenas_inclusao: "S",
          }, acc
        );
        if (pag === 1 && r.total_de_paginas) totPag = r.total_de_paginas;

        for (const os of r.osCadastro || []) {
          const cab = os.Cabecalho;
          const info = os.InfoCadastro;
          const servs = os.ServicosPrestados || [];

          const horas = servs.filter(s => s.nCodServico === NCODSERV_HORA).reduce((a, s) => a + s.nQtde, 0);
          const km = servs.filter(s => s.nCodServico === NCODSERV_KM).reduce((a, s) => a + s.nQtde, 0);
          const solServ = servs.find(s => s.nCodServico === NCODSERV_SOL);
          const descricao = solServ?.cDescServ || "";

          const tecnicos = tecMap.get(cab.nCodVend) || [];
          const vendedorNome = vendMap.get(cab.nCodVend) || "";
          const interno = servs.length > 0 && servs.every(s => s.cNaoGerarFinanceiro === "S");

          let status = ETAPA_LABEL[cab.cEtapa] || cab.cEtapa;
          if (info.cCancelada === "S") status = "Cancelada";

          rows.push({
            os_num: cab.cNumOS,
            empresa: acc.name,
            cod_int: cab.cCodIntOS || "",
            tecnicos,
            vendedor_nome: vendedorNome,
            data: parseDataOmie(cab.dDtPrevisao),
            data_inc: parseDataOmie(info.dDtInc),
            data_fat: parseDataOmie(info.dDtFat || "") || null,
            horas,
            km,
            valor: cab.nValorTotal,
            status,
            cancelada: info.cCancelada === "S",
            faturada: info.cFaturada === "S",
            interno,
            contrato: os.InformacoesAdicionais?.cNumContrato || "",
            cidade: os.InformacoesAdicionais?.cCidPrestServ || "",
            dados_adic: os.InformacoesAdicionais?.cDadosAdicNF || "",
            descricao,
            obs: os.Observacoes?.cObsOS || "",
            updated_at: new Date().toISOString(),
          });
        }

        pag++;
        if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
      }

      // 3. Deduplicar (Omie pode retornar mesma OS em paginas diferentes)
      const dedupMap = new Map<string, Record<string, unknown>>();
      for (const r of rows) dedupMap.set(`${r.os_num}|${r.empresa}`, r);
      const dedupRows = Array.from(dedupMap.values());

      // 4. Upsert em lotes de 200
      for (let i = 0; i < dedupRows.length; i += 200) {
        const batch = dedupRows.slice(i, i + 200);
        const { error } = await supabase
          .from("Ordens_Omie")
          .upsert(batch, { onConflict: "os_num,empresa" });
        if (error) {
          console.error(`[omie-sync] Erro upsert ${acc.name} lote ${i}:`, error.message);
          throw new Error(`Erro upsert: ${error.message}`);
        }
      }

      totalSync += dedupRows.length;
      console.log(`[omie-sync] ${acc.name}: ${dedupRows.length} OS sincronizadas`);
    }

    return NextResponse.json({ sucesso: true, ano, total: totalSync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[omie-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
