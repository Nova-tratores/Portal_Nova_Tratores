import { NextResponse } from "next/server";
import { listarFuncionariosRH, rhConfigurado } from "@/lib/frota/rh";

// Busca de funcionários (RH) para o seletor da integração com o Chatwoot.
// Reaproveita listarFuncionariosRH() (que NÃO traz salário) e devolve só os
// campos escolhidos: nome, cargo, departamento, email.
const CHATWOOT_ORIGIN =
  process.env.CHATWOOT_URL || "https://chatwoot-production-e3ef.up.railway.app";
const CORS = {
  "Access-Control-Allow-Origin": CHATWOOT_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();

  if (!rhConfigurado()) {
    return NextResponse.json(
      { funcionarios: [], erro: "RH não configurado" },
      { headers: CORS }
    );
  }
  if (q.length < 2) {
    return NextResponse.json({ funcionarios: [] }, { headers: CORS });
  }

  try {
    const todos = await listarFuncionariosRH();
    const funcionarios = todos
      .filter(
        f =>
          (f.nome || "").toLowerCase().includes(q) ||
          (f.email || "").toLowerCase().includes(q) ||
          (f.cargo || "").toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map(f => ({
        id: f.id,
        nome: f.nome,
        cargo: f.cargo,
        departamento: f.departamento,
        email: f.email,
      }));

    return NextResponse.json({ funcionarios }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
