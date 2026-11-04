import { NextRequest, NextResponse } from "next/server";
import { comCronRun } from "@/lib/cron/observar";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { agendadorJaRodou } from "@/lib/agendador/reserva";
import { executarSyncCompleto } from "@/lib/clientes/sync-completo";

const CRON_SECRET = process.env.CRON_SECRET || "";

function veioDoCron(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const bearer = req.headers.get("authorization") || "";
  return req.headers.get("x-cron-secret") === CRON_SECRET || bearer === `Bearer ${CRON_SECRET}`;
}

// POST — botão "Sincronizar" da Pasta Clientes (espera o fim e devolve o resumo) OU o
// cron clientes-sync-omie.yml (reserva). Com o segredo do cron a resposta é
// IMEDIATA (202) e o sync segue no servidor: o proxy do Railway corta a request em
// 5 min e o GitHub marcava "failure" (502) todo dia, embora o sync terminasse. O
// resultado real fica em `cron_runs` (job `clientes-sync-omie`, tela /agendamentos);
// a trava de 3 h evita rodar em dobro com o botão.
export async function POST(req: NextRequest) {
  const anoInicioParam = req.nextUrl.searchParams.get("anoInicio");

  if (veioDoCron(req)) {
    // RESERVA (04/11/2026): o agendador do portal roda este sync às 22:30 no worker
    // (tarefa clientes-sync-omie). O GitHub só roda se o portal não tiver rodado bem.
    const feito = await agendadorJaRodou("clientes-sync-omie", 26);
    if (feito) return NextResponse.json({ sucesso: true, pulado: `o agendador do portal já rodou (${feito})` });
    comCronRun("clientes-sync-omie", () => executarSyncCompleto(anoInicioParam), {
      lockMinutos: 180,
      disparadoPor: "github",
      fechamento: (r) => ({ detalhe: JSON.stringify({ periodo: r.periodo, ...r.resultado }) }),
    })
      .then((r) => console.log("[clientes-sync] cron", r.pulado ? "pulado (já rodando)" : r.erro ? "erro: " + r.erro : "concluído", JSON.stringify(r.resultado?.resultado ?? {})))
      .catch((e) => console.error("[clientes-sync] cron erro", (e as Error).message));
    return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() }, { status: 202 });
  }

  // Botão / auto-sync da tela da Pasta Clientes: exige login com o módulo.
  const guarda = await protegerRota(req, [{ modulo: "clientes" }]);
  if (guarda.resposta) return guarda.resposta;

  try {
    return NextResponse.json(await executarSyncCompleto(anoInicioParam));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[clientes-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
