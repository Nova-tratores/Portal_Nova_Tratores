import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Segredo do SSO para os apps externos (consulta-estoque/omie). Antes estava
// hardcoded no código (versionado no git), o que permitia forjar o token offline.
// Agora vem só de env var — defina PORTAL_SECRET no Railway/.env.local.
const PORTAL_SECRET = process.env.PORTAL_SECRET || "";

// Só quem vê os cards Visual Estoque / Consulta Estoque no dashboard (mesmo
// temAcesso da tela). Antes qualquer um sem login cunhava o token do SSO.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque" }, { modulo: "estoque" }]);
  if (g.resposta) return g.resposta;
  if (!PORTAL_SECRET) {
    return NextResponse.json({ error: "PORTAL_SECRET não configurado" }, { status: 500 });
  }
  const { ts } = await req.json();
  if (!ts) return NextResponse.json({ error: "ts required" }, { status: 400 });
  const hash = crypto.createHmac("sha256", PORTAL_SECRET).update(String(ts)).digest("hex");
  return NextResponse.json({ hash });
}
