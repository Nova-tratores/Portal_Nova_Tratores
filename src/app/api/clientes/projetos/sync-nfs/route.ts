import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";

const CONTAS = [
  { empresa: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { empresa: "Castro Peças", ...contaOmie("Castro Peças") },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry com backoff exponencial — nunca desiste antes de 3 tentativas
async function omieCall(endpoint: string, call: string, param: Record<string, unknown>, acc: typeof CONTAS[number], tentativa = 1): Promise<any> {
  const MAX = 3;
  const payload = { call, app_key: acc.key, app_secret: acc.secret, param: [param] };

  try {
    const res = await fetch(`${OMIE_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const wait = tentativa * 30000; // 30s, 60s, 90s
      console.warn(`[sync-nfs] Rate limit ${acc.empresa} — tentativa ${tentativa}/${MAX}, aguardando ${wait / 1000}s`);
      await sleep(wait);
      if (tentativa < MAX) return omieCall(endpoint, call, param, acc, tentativa + 1);
      throw new Error(`Rate limit persistente após ${MAX} tentativas`);
    }

    const data = await res.json();

    if (data?.faultstring) {
      // "Não existem registros" não é erro real — retorna vazio
      if (String(data.faultstring).includes("existem registros") || String(data.faultstring).includes("não localizad")) {
        return { nfCadastro: [] };
      }
      throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
    }

    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (tentativa < MAX) {
      const wait = tentativa * 5000;
      console.warn(`[sync-nfs] Erro ${acc.empresa} tentativa ${tentativa}/${MAX}: ${msg} — retry em ${wait / 1000}s`);
      await sleep(wait);
      return omieCall(endpoint, call, param, acc, tentativa + 1);
    }
    throw e;
  }
}

function parseData(d: string | undefined | null): string {
  if (!d) return "";
  if (d.includes("T")) { const p = d.split("T")[0].split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }
  return d;
}

function extrairCnpj(obj: Record<string, unknown> | null | undefined): string {
  if (!obj) return "";
  return String(obj.CNPJ || obj.cCNPJCPF || obj.cnpj_cpf || obj.cCNPJ || "").replace(/\D/g, "");
}

function extrairNome(obj: Record<string, unknown> | null | undefined): string {
  if (!obj) return "";
  return String(obj.xNome || obj.razao_social || obj.nome_fantasia || obj.xFant || "");
}

function cnpjFromChave(chave: string | null | undefined): string {
  if (!chave || typeof chave !== "string") return "";
  const d = chave.replace(/\D/g, "");
  return d.length === 44 ? d.substring(6, 20) : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsarNota(n: any, tipoNf: string, empresa: string) {
  const ide = n.ide || {};
  const numeroNf = String(ide.nNF || "").replace(/^0+/, "");
  const serie = ide.serie || ide["série"] || "";
  if (!numeroNf) return null;

  const emit = n.emit || n.nfEmitInt || null;
  const dest = n.dest || n.nfDestInt || null;
  const icms = (n.total && n.total.ICMSTot) || {};
  const compl = n.compl || null;
  const chave = (compl && typeof compl === "object" && compl.cChaveNFe) ? String(compl.cChaveNFe) : "";

  let cnpjEmit = extrairCnpj(emit as Record<string, unknown>);
  if (!cnpjEmit && chave) cnpjEmit = cnpjFromChave(chave);

  return {
    tipo_nf: tipoNf, empresa, ncod_nf: ide.nCodNF || n.nCodNF || null,
    numero_nf: numeroNf, serie, modelo: ide.mod || "",
    chave_nfe: chave,
    data_emissao: parseData(ide.dhEmi || ide.dEmi || ""),
    data_registro: ide.dReg || "", data_saida_entrada: ide.dSaiEnt || "",
    hora_emissao: ide.hEmi || "", finalidade: ide.finNFe || "",
    tipo_pagamento: ide.indPag || "", cancelada: ide.dCan || "",
    emitente: emit ? Object.assign({}, emit) : null,
    destinatario: dest ? Object.assign({}, dest) : null,
    nome_emitente: extrairNome(emit as Record<string, unknown>),
    cnpj_emitente: cnpjEmit,
    nome_destinatario: extrairNome(dest as Record<string, unknown>),
    cnpj_destinatario: extrairCnpj(dest as Record<string, unknown>),
    valor_produtos: parseFloat(icms.vProd || "0"), valor_nf: parseFloat(icms.vNF || "0"),
    valor_icms: parseFloat(icms.vICMS || "0"), valor_ipi: parseFloat(icms.vIPI || "0"),
    valor_pis: parseFloat(icms.vPIS || "0"), valor_cofins: parseFloat(icms.vCOFINS || "0"),
    valor_frete: parseFloat(icms.vFrete || "0"), valor_desconto: parseFloat(icms.vDesc || "0"),
    valor_total_tributos: parseFloat(icms.vTotTrib || "0"),
    itens: n.det || [], parcelas: n.titulos || [],
    pedido: n.pedido || null, complemento: compl, info: n.info || null,
    updated_at: new Date().toISOString(),
  };
}

// Busca NFs de um mês — sequencial, com retry em cada página, nunca pula
async function buscarNfsMes(acc: typeof CONTAS[number], tipoNf: string, tpNF: string, deStr: string, ateStr: string) {
  const rows: ReturnType<typeof parsarNota>[] = [];
  let pag = 1;
  while (true) {
    const r = await omieCall("/produtos/nfconsultar/", "ListarNF", {
      pagina: pag, registros_por_pagina: 100, tpNF, tpAmb: "1",
      dEmiInicial: deStr, dEmiFinal: ateStr,
    }, acc);

    const notas = r.nfCadastro || [];
    if (notas.length === 0) break;

    for (const n of notas) {
      const row = parsarNota(n, tipoNf, acc.empresa);
      if (row) rows.push(row);
    }

    const totalPag = r.total_de_paginas || 0;
    if (totalPag && pag >= totalPag) break;
    if (notas.length < 100) break;
    pag++;
    await sleep(3000);
  }
  return rows;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function gerarMeses(dataInicio: Date, dataFim: Date) {
  const meses: { ini: string; fim: string; label: string }[] = [];
  let cur = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
  while (cur <= dataFim) {
    const ultimo = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    meses.push({
      ini: `${pad2(1)}/${pad2(cur.getMonth() + 1)}/${cur.getFullYear()}`,
      fim: `${pad2(ultimo.getDate())}/${pad2(cur.getMonth() + 1)}/${cur.getFullYear()}`,
      label: `${pad2(cur.getMonth() + 1)}/${cur.getFullYear()}`,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return meses;
}

async function upsertLote(rows: NonNullable<ReturnType<typeof parsarNota>>[]) {
  const erros: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200);
    const { error } = await supabase
      .from("portal_nt_notas_fiscais_PRINCIPAL")
      .upsert(lote, { onConflict: "numero_nf,serie,empresa" });
    if (error) erros.push(error.message);
  }
  return erros;
}

// ─── GET = modo cron (automático, sincroniza mês atual + anterior) ───
export async function GET() {
  const agora = new Date();
  const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const meses = gerarMeses(mesAnterior, agora);

  let totalEntrada = 0;
  let totalSaida = 0;
  let totalUpserted = 0;
  const erros: string[] = [];

  for (const acc of CONTAS) {
    for (const mes of meses) {
      // Sequencial: entrada primeiro, depois saída
      const entradas = await buscarNfsMes(acc, "entrada", "0", mes.ini, mes.fim);
      await sleep(2000);
      const saidas = await buscarNfsMes(acc, "saida", "1", mes.ini, mes.fim);
      await sleep(2000);

      totalEntrada += entradas.length;
      totalSaida += saidas.length;

      const todas = [...entradas, ...saidas].filter(Boolean) as NonNullable<typeof entradas[number]>[];
      if (todas.length > 0) {
        const upsertErros = await upsertLote(todas);
        erros.push(...upsertErros);
        totalUpserted += todas.length - upsertErros.length;
      }

      console.log(`[cron-nfs] ${acc.empresa} ${mes.label}: ${entradas.length} ent + ${saidas.length} sai`);
    }
  }

  return Response.json({
    ok: true,
    modo: "cron",
    total_entrada: totalEntrada,
    total_saida: totalSaida,
    total_upserted: totalUpserted,
    erros: erros.length > 0 ? erros : undefined,
  });
}

// ─── POST = modo backfill (streaming com progresso para UI) ───
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const anosAtras = Number(body.anos) || 3;
  const agora = new Date();
  const inicio = new Date(agora.getFullYear() - anosAtras, 0, 1);
  const meses = gerarMeses(inicio, agora);
  // Cada mês = 1 conta × 2 tipos (entrada+saída), processados sequencialmente
  // Total de steps = contas × meses (cada step faz entrada e saída)
  const totalSteps = CONTAS.length * meses.length;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let step = 0;
      let totalEntrada = 0;
      let totalSaida = 0;
      let totalUpserted = 0;
      const erros: string[] = [];
      const startTime = Date.now();

      send({ type: "inicio", totalSteps, contas: CONTAS.map(c => c.empresa), meses: meses.length, anos: anosAtras });

      for (const acc of CONTAS) {
        for (const mes of meses) {
          step++;
          const elapsed = (Date.now() - startTime) / 1000;
          const avgPerStep = step > 1 ? elapsed / (step - 1) : 8;
          const remaining = Math.round(avgPerStep * (totalSteps - step));

          send({
            type: "progresso", step, totalSteps,
            empresa: acc.empresa, mes: mes.label,
            pct: Math.round((step / totalSteps) * 100),
            nfs_ate_agora: totalEntrada + totalSaida,
            tempo_restante: remaining,
          });

          try {
            // Sequencial — entrada, pausa, saída
            const entradas = await buscarNfsMes(acc, "entrada", "0", mes.ini, mes.fim);
            await sleep(2000);
            const saidas = await buscarNfsMes(acc, "saida", "1", mes.ini, mes.fim);

            totalEntrada += entradas.length;
            totalSaida += saidas.length;

            const todas = [...entradas, ...saidas].filter(Boolean) as NonNullable<typeof entradas[number]>[];
            if (todas.length > 0) {
              const upsertErros = await upsertLote(todas);
              erros.push(...upsertErros);
              totalUpserted += todas.length - upsertErros.length;
            }

            send({
              type: "mes_concluido", step, totalSteps,
              empresa: acc.empresa, mes: mes.label,
              entradas: entradas.length, saidas: saidas.length,
              total_acumulado: totalEntrada + totalSaida,
              pct: Math.round((step / totalSteps) * 100),
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            erros.push(`${acc.empresa} ${mes.label}: ${msg}`);
            send({ type: "erro_mes", empresa: acc.empresa, mes: mes.label, erro: msg });
          }

          await sleep(1500);
        }
      }

      send({
        type: "fim",
        total_entrada: totalEntrada, total_saida: totalSaida,
        total_upserted: totalUpserted,
        total_nfs: totalEntrada + totalSaida,
        tempo_total: Math.round((Date.now() - startTime) / 1000),
        erros: erros.length > 0 ? erros : undefined,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
