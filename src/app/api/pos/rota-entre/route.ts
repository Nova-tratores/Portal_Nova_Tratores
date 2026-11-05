import { NextRequest, NextResponse } from "next/server";
import { calcularRota } from "@/lib/pos/ors";
import { autenticar } from "@/lib/auth/server";

/**
 * Calcula rota entre dois pontos (coordenadas)
 * Usado para roteirização multi-parada (A→B)
 */
export async function POST(req: NextRequest) {
  // ORS é API paga: só logado
  if (!(await autenticar(req))) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { origemLat, origemLng, destinoLat, destinoLng } = await req.json();

  if (!origemLat || !origemLng || !destinoLat || !destinoLng) {
    return NextResponse.json({ erro: "Coordenadas incompletas" }, { status: 400 });
  }

  const rota = await calcularRota(origemLat, origemLng, destinoLat, destinoLng);
  if (!rota) {
    return NextResponse.json({ erro: "Não foi possível calcular a rota" }, { status: 400 });
  }

  return NextResponse.json({
    distancia_km: rota.distancia_km,
    tempo_min: rota.tempo_min,
  });
}
