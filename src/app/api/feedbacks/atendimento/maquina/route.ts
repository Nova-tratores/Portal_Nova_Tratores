import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { chassiValido, montarHistoricoMaquina } from "@/lib/feedbacks/atendimento/maquina-db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Histórico de UMA máquina (por chassi) para o modal do cockpit:
// entrega/revisões (tratores), cheques, OS do portal e da Omie, PPV/PV,
// garantias, requisições, atendimentos, observações e cadastro no CRM.
// Só leitura. Permissão vem da sessão (mesmo gate da ficha).
export type { HistoricoMaquina } from "@/lib/feedbacks/atendimento/maquina-db";

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, "feedbacks", "atendimento");
  } catch (e) {
    const err = e as { message?: string; http?: number };
    return NextResponse.json({ erro: err.message || "não autorizado" }, { status: err.http ?? 401 });
  }
  const chassi = (req.nextUrl.searchParams.get("chassi") || "").trim().toUpperCase();
  if (!chassiValido(chassi)) return NextResponse.json({ erro: "chassi inválido (6 a 25 caracteres alfanuméricos)" }, { status: 400 });
  const projeto = (req.nextUrl.searchParams.get("projeto") || "").trim() || null;
  const empresa = (req.nextUrl.searchParams.get("empresa") || "").trim() || null;
  try {
    const h = await montarHistoricoMaquina(chassi, projeto, empresa);
    return NextResponse.json(h);
  } catch (e) {
    console.error("[atendimento/maquina]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar o histórico" }, { status: 500 });
  }
}
