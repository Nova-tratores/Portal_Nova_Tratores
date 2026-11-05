import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { geocodificar, rotaDaOficina, OFICINA } from "@/lib/pos/ors";
import { buscarEnderecos } from "@/lib/pos/enderecos";

// estimativa de horas/km no drawer da OS (POS)
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const { cnpj, endereco, cidade, qtdHoras, enderecoManual } = await req.json();

  // Buscar todos os endereços disponíveis
  const enderecosDisponiveis = await buscarEnderecos(cnpj, endereco, cidade);

  // Se tem endereço manual (editado pelo usuário), usa direto
  // Senão, tenta cada endereço disponível até conseguir geocodificar
  let enderecoCompleto = "";
  let fonte = "";
  let coords: { lat: number; lng: number } | null = null;

  if (enderecoManual) {
    enderecoCompleto = enderecoManual;
    fonte = "Editado";
    coords = await geocodificar(enderecoCompleto + ", Brasil");
  } else {
    for (const opt of enderecosDisponiveis) {
      coords = await geocodificar(opt.endereco + ", Brasil");
      if (coords) {
        enderecoCompleto = opt.endereco;
        fonte = opt.fonte;
        break;
      }
    }
  }

  if (!enderecoCompleto) {
    return NextResponse.json({ erro: "Endereço do cliente não encontrado", enderecosDisponiveis }, { status: 400 });
  }

  if (!coords) {
    const orsKey = process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY || "";
    return NextResponse.json({ erro: `Não foi possível localizar o endereço. ${orsKey ? "" : "Chave ORS não configurada."}`, enderecosDisponiveis }, { status: 400 });
  }

  // Calcular rota da oficina até o cliente (ida)
  const rotaIda = await rotaDaOficina(coords.lat, coords.lng);
  if (!rotaIda) {
    return NextResponse.json({ erro: "Não foi possível calcular a rota", enderecosDisponiveis }, { status: 400 });
  }

  // Calcular tempo total (ida = volta)
  const horasServico = parseFloat(qtdHoras || 0);
  const tempoServicoMin = horasServico * 60;
  const tempoTotalMin = rotaIda.tempo_min + tempoServicoMin + rotaIda.tempo_min;
  const tempoTotalHoras = Math.round((tempoTotalMin / 60) * 10) / 10;

  return NextResponse.json({
    enderecoUsado: enderecoCompleto,
    fonte,
    enderecosDisponiveis,
    coordenadas: coords,
    oficina: OFICINA,
    ida: {
      distancia_km: rotaIda.distancia_km,
      tempo_min: rotaIda.tempo_min,
    },
    volta: {
      distancia_km: rotaIda.distancia_km,
      tempo_min: rotaIda.tempo_min,
    },
    servico: {
      horas: horasServico,
      tempo_min: tempoServicoMin,
    },
    total: {
      tempo_min: tempoTotalMin,
      tempo_horas: tempoTotalHoras,
      distancia_total_km: rotaIda.distancia_km * 2,
    },
  });
}
