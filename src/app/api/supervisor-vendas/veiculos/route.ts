import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRotaExata } from "@/lib/pos/rastreamento";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(req: NextRequest) {
  const acao = req.nextUrl.searchParams.get("acao") || "posicoes";
  const hoje = new Date().toISOString().split("T")[0];

  try {
    if (acao === "posicoes") {
      // Buscar checkins de hoje
      const { data: checkins } = await supabase
        .from("checkin_vendedor")
        .select("*")
        .eq("data", hoje);

      if (!checkins || checkins.length === 0) return NextResponse.json([]);

      // Buscar veículos do Rota Exata
      const vData = await fetchRotaExata("/adesoes", { limit: "200", page: "0" });
      const adesoes = vData.data || [];

      const agora = new Date();
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      const resultado: any[] = [];

      for (const ck of checkins) {
        const placaNorm = (ck.placa || "").replace(/[-\s]/g, "").toUpperCase();
        const ad = adesoes.find((a: any) => (a.vei_placa || "").replace(/[-\s]/g, "").toUpperCase() === placaNorm);
        if (!ad) continue;

        const veiculo: any = {
          vendedor_id: ck.vendedor_id,
          vendedor_nome: ck.vendedor_nome || "",
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

      // Buscar rota salva
      const { data: rotaSalva } = await supabase
        .from("rotas_vendedor")
        .select("*")
        .eq("placa", placa)
        .eq("data", data)
        .maybeSingle();

      if (rotaSalva && rotaSalva.pontos && rotaSalva.pontos.length > 0) {
        return NextResponse.json(rotaSalva);
      }

      // Se não tem salva, buscar do Rota Exata em tempo real
      const vData = await fetchRotaExata("/adesoes", { limit: "200", page: "0" });
      const placaNorm = (placa).replace(/[-\s]/g, "").toUpperCase();
      const ad = (vData.data || []).find((a: any) => (a.vei_placa || "").replace(/[-\s]/g, "").toUpperCase() === placaNorm);
      if (!ad) return NextResponse.json({ pontos: [], paradas: [], km_total: 0 });

      const inicio = `${data}T00:00:00.000Z`;
      const fim = data === hoje ? new Date().toISOString() : `${data}T23:59:59.000Z`;
      const w = JSON.stringify({ adesao_id: ad.id, dt_posicao: { $gte: inicio, $lte: fim } });
      const posData = await fetchRotaExata("/posicoes", { where: w, limit: "1000", page: "0" });
      const posicoes = (Array.isArray(posData.data) ? posData.data : [])
        .sort((a: any, b: any) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime());

      const pontos = posicoes.map((p: any) => ({ lat: p.latitude, lng: p.longitude, dt: p.dt_posicao, ignicao: p.ignicao, vel: p.velocidade }));

      // Calcular métricas
      let kmTotal = 0;
      for (let i = 1; i < pontos.length; i++) {
        const R = 6371;
        const dLat = (pontos[i].lat - pontos[i - 1].lat) * Math.PI / 180;
        const dLng = (pontos[i].lng - pontos[i - 1].lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(pontos[i - 1].lat * Math.PI / 180) * Math.cos(pontos[i].lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        kmTotal += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      // Paradas
      const paradas: any[] = [];
      let paradaInicio: any = null;
      for (const p of pontos) {
        if (p.ignicao === 0 && p.vel === 0) {
          if (!paradaInicio) paradaInicio = p;
        } else if (paradaInicio) {
          const dur = Math.round((new Date(p.dt).getTime() - new Date(paradaInicio.dt).getTime()) / 60000);
          if (dur >= 5) paradas.push({ lat: paradaInicio.lat, lng: paradaInicio.lng, inicio: paradaInicio.dt, fim: p.dt, duracao_min: dur });
          paradaInicio = null;
        }
      }

      const rota = {
        placa, data, pontos, paradas, km_total: Math.round(kmTotal),
        hora_inicio: pontos.length > 0 ? pontos[0].dt : null,
        hora_fim: pontos.length > 0 ? pontos[pontos.length - 1].dt : null,
      };

      // Salvar rota se é dia passado
      if (data !== hoje && pontos.length > 0) {
        const { data: ck } = await supabase.from("checkin_vendedor").select("vendedor_id, vendedor_nome").eq("placa", placa).eq("data", data).maybeSingle();
        await supabase.from("rotas_vendedor").upsert({
          ...rota, vendedor_id: ck?.vendedor_id || null, vendedor_nome: ck?.vendedor_nome || null,
        }, { onConflict: "placa,data" });
      }

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
