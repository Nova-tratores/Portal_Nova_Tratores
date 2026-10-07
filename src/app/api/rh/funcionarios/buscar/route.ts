import { NextResponse } from "next/server";
import { listarFuncionariosRH, rhConfigurado } from "@/lib/frota/rh";
import { corsChatwoot } from "@/lib/chatwoot/cors";

// Busca de funcionários (RH) para o seletor da integração com o Chatwoot.
// Reaproveita listarFuncionariosRH() (que NÃO traz salário) e devolve só os
// campos escolhidos: nome, cargo, departamento, email.

// remove acentos + minúsculas → busca insensível a acento e maiúscula/minúscula
function normalizar(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function OPTIONS(req: Request) {
  const CORS = corsChatwoot(req, "GET, OPTIONS");
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const CORS = corsChatwoot(req, "GET, OPTIONS");
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
