import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { gerarRelatorioFaturamento } from "@/lib/clientes/relatorio-faturamento-db";
import { periodoDaSemana, isoDia } from "@/lib/clientes/relatorio-faturamento";

// Relatório semanal de faturamento (OS + pedidos de peças, por técnico, com km).
// GET ?semana=YYYY-MM-DD (qualquer dia da semana) &dia=1..7 (dia do envio; padrão 5 = sexta)
// ou ?inicio=&fim= explícitos. Tela: /clientes/relatorios (aba Faturamento semanal).
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return acesso.resposta;

  const sp = req.nextUrl.searchParams;
  const hoje = isoDia(new Date(Date.now() - 3 * 3600000)); // dia em Brasília
  let inicio = sp.get("inicio") || "";
  let fim = sp.get("fim") || "";
  if (!ISO.test(inicio) || !ISO.test(fim)) {
    const ref = ISO.test(sp.get("semana") || "") ? String(sp.get("semana")) : hoje;
    const dia = Math.min(Math.max(Number(sp.get("dia")) || 5, 1), 7);
    ({ inicio, fim } = periodoDaSemana(ref, dia, hoje));
  }
  if (fim < inicio) return NextResponse.json({ error: "Período inválido" }, { status: 400 });

  try {
    const relatorio = await gerarRelatorioFaturamento(inicio, fim);
    return NextResponse.json(relatorio, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
