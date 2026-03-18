import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.SEURASTREIO_API_KEY || "";
const BASE_URL = "https://seurastreio.com.br/api/public/rastreio";

export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get("codigo");

  if (!codigo) {
    return NextResponse.json({ error: "Código de rastreio não informado" }, { status: 400 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "Chave da API de rastreio não configurada" }, { status: 500 });
  }

  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(codigo)}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 300 }, // cache 5 min
    });

    if (res.status === 429) {
      return NextResponse.json({ error: "Limite de consultas atingido. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao consultar rastreio" }, { status: 502 });
  }
}
