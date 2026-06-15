import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRotaExata, computarESalvarRota } from "@/lib/pos/rastreamento";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(req: NextRequest) {
  const acao = req.nextUrl.searchParams.get("acao") || "posicoes";
  const hoje = new Date().toISOString().split("T")[0];

  try {
    if (acao === "adesoes") {
      // Lista de carros da Rota Exata (pro admin escolher no vínculo)
      const vData = await fetchRotaExata("/adesoes", { limit: "300", page: "0" });
      const adesoes = (vData.data || []).map((a: any) => ({
        adesao_id: a.id,
        placa: a.vei_placa || "",
        descricao: a.vei_descricao || a.vei_modelo || "",
      })).filter((a: any) => a.placa);
      adesoes.sort((a: any, b: any) => a.placa.localeCompare(b.placa));
      return NextResponse.json(adesoes);
    }

    if (acao === "posicoes") {
      const fonte = req.nextUrl.searchParams.get("fonte");

      // Frota: carros do comercial (vínculo) OU vendedores que fizeram checkin hoje
      let frota: { placa: string; pessoa_id: any; pessoa_nome: string }[] = [];
      if (fonte === "carros") {
        const { data: carros } = await supabase
          .from("comercial_veiculos")
          .select("placa, pessoa_id, pessoa_nome")
          .eq("ativo", true);
        frota = (carros || []).map((c: any) => ({ placa: c.placa, pessoa_id: c.pessoa_id, pessoa_nome: c.pessoa_nome || "" }));
      } else {
        const { data: checkins } = await supabase
          .from("checkin_vendedor")
          .select("*")
          .eq("data", hoje);
        frota = (checkins || []).map((ck: any) => ({ placa: ck.placa, pessoa_id: ck.vendedor_id, pessoa_nome: ck.vendedor_nome || "" }));
      }

      if (frota.length === 0) return NextResponse.json([]);

      // Buscar veículos do Rota Exata
      const vData = await fetchRotaExata("/adesoes", { limit: "200", page: "0" });
      const adesoes = vData.data || [];

      const agora = new Date();
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      const resultado: any[] = [];

      for (const ck of frota) {
        const placaNorm = (ck.placa || "").replace(/[-\s]/g, "").toUpperCase();
        const ad = adesoes.find((a: any) => (a.vei_placa || "").replace(/[-\s]/g, "").toUpperCase() === placaNorm);
        if (!ad) continue;

        const veiculo: any = {
          vendedor_id: ck.pessoa_id,
          vendedor_nome: ck.pessoa_nome || "",
          placa: ck.placa,
          modelo: ad.vei_descricao || ad.vei_modelo || "",
          adesao_id: ad.id,
          lat: null, lng: null, ignicao: false, velocidade: 0,
          dt_posicao: null, paradas_hoje: [],
        };

        try {
          const w = JSON.stringify({
            adesao_id: ad.id,
            dt_posicao: { $gte: inicioDia.toISOString(), $lte: agora.toISOString() }
          });
          const posData = await fetchRotaExata("/posicoes", { where: w, limit: "200", page: "0" });
          const posicoes = (Array.isArray(posData.data) ? posData.data : [])
            .sort((a: any, b: any) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime());

          if (posicoes.length > 0) {
            const last = posicoes[posicoes.length - 1];
            veiculo.lat = last.latitude;
            veiculo.lng = last.longitude;
            veiculo.ignicao = last.ignicao === 1;
            veiculo.velocidade = last.velocidade || 0;
            veiculo.dt_posicao = last.dt_posicao;

            // Detectar paradas
            let paradaInicio: any = null;
            for (const pos of posicoes) {
              if (pos.ignicao === 0 && pos.velocidade === 0) {
                if (!paradaInicio) paradaInicio = pos;
              } else if (paradaInicio) {
                const durMin = Math.round((new Date(pos.dt_posicao).getTime() - new Date(paradaInicio.dt_posicao).getTime()) / 60000);
                if (durMin >= 5) {
                  veiculo.paradas_hoje.push({ lat: paradaInicio.latitude, lng: paradaInicio.longitude, inicio: paradaInicio.dt_posicao, fim: pos.dt_posicao, duracao_min: durMin });
                }
                paradaInicio = null;
              }
            }
            if (paradaInicio) {
              const durMin = Math.round((agora.getTime() - new Date(paradaInicio.dt_posicao).getTime()) / 60000);
              if (durMin >= 5) {
                veiculo.paradas_hoje.push({ lat: paradaInicio.latitude, lng: paradaInicio.longitude, inicio: paradaInicio.dt_posicao, fim: null, duracao_min: durMin });
              }
            }
          }
        } catch { /* sem posição */ }

        resultado.push(veiculo);
      }

      return NextResponse.json(resultado);
    }

    if (acao === "rota") {
      const placa = req.nextUrl.searchParams.get("placa");
      const data = req.nextUrl.searchParams.get("data") || hoje;
      if (!placa) return NextResponse.json({ error: "placa obrigatória" }, { status: 400 });
      const rota = await computarESalvarRota(supabase, placa, data);
      return NextResponse.json(rota);
    }

    if (acao === "checkin") {
      return NextResponse.json({ error: "Use POST" }, { status: 405 });
    }

    return NextResponse.json({ error: "acao desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { vendedor_id, vendedor_nome, placa } = await req.json();
    if (!vendedor_id || !placa) return NextResponse.json({ error: "vendedor_id e placa obrigatórios" }, { status: 400 });

    const hoje = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("checkin_vendedor").upsert({
      vendedor_id, vendedor_nome: vendedor_nome || "", placa, data: hoje,
    }, { onConflict: "vendedor_id,data" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
