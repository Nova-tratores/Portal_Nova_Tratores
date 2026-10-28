import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { chassiValido, montarHistoricoMaquina } from "@/lib/feedbacks/atendimento/maquina-db";
import { carregarRevisoes } from "@/lib/feedbacks/previsao-revisao-server";
import { mesmoChassiFinal } from "@/lib/feedbacks/maquina-modal";
import type { TratorRevisao } from "@/lib/feedbacks/previsao-revisao";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Janela da MÁQUINA (components/feedbacks/ModalMaquina, 23/10/2026) — aberta da tela Hoje e do
// Histórico do cliente. Irmã de /api/feedbacks/atendimento/maquina (que exige feedbacks:atendimento,
// do cockpit): aqui basta o módulo Feedbacks, como /api/feedbacks/historico-cliente. Só leitura.
// GET ?chassi=&projeto=&empresa= → { historico (linha do tempo da máquina), revisao (previsão do
// controle de revisões, quando o trator está lá), avisos }.
const ACESSO = [{ modulo: "feedbacks" }];
const TEMPO_REVISOES_MS = 15_000;

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const chassi = (req.nextUrl.searchParams.get("chassi") || "").trim().toUpperCase();
  if (!chassiValido(chassi)) return NextResponse.json({ erro: "chassi inválido (6 a 25 caracteres alfanuméricos)" }, { status: 400 });
  const projeto = (req.nextUrl.searchParams.get("projeto") || "").trim() || null;
  const empresa = (req.nextUrl.searchParams.get("empresa") || "").trim() || null;
  const avisos: string[] = [];
  try {
    // a previsão vem do mesmo cálculo da fila (cache de 5 min); se demorar, a janela abre sem ela
    const rev = Promise.race([
      carregarRevisoes().then((d) => d.tratores.find((t) => mesmoChassiFinal(t.chassi, chassi)) ?? null),
      new Promise<"tempo">((r) => setTimeout(() => r("tempo"), TEMPO_REVISOES_MS)),
    ]).catch((e) => { avisos.push(`Previsão de revisão não carregou: ${(e as Error)?.message || e}`); return null; });
    const [historico, r] = await Promise.all([montarHistoricoMaquina(chassi, projeto, empresa), rev]);
    if (r === "tempo") avisos.push("A previsão de revisão demorou e ficou de fora; tente de novo em instantes.");
    const revisao: TratorRevisao | null = r === "tempo" ? null : r;
    return NextResponse.json({ historico, revisao, avisos });
  } catch (e) {
    console.error("[feedbacks/maquina]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar a máquina" }, { status: 500 });
  }
}
