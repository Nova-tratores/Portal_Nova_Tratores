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

// remove acentos + minúsculas → busca insensível a acento e maiúscula/minúscula
function normalizar(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  if (!rhConfigurado()) {
    return NextResponse.json(
      { funcionarios: [], erro: "RH não configurado" },
      { headers: CORS }
    );
  }
  if (q.length < 2) {
    return NextResponse.json({ funcionarios: [] }, { headers: CORS });
  }

  const nq = normalizar(q);

  try {
    const todos = await listarFuncionariosRH();
    const funcionarios = todos
      .filter(
        f =>
          normalizar(f.nome).includes(nq) ||
          normalizar(f.email).includes(nq) ||
          normalizar(f.cargo).includes(nq)
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
