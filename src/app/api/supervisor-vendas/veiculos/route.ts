import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRotaExata, fetchTudo, computarESalvarRota } from "@/lib/pos/rastreamento";
import { normalizarPlaca } from "@/lib/frota/placa";

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
      const normPlaca = normalizarPlaca;

      const adesoes = await fetchTudo("/adesoes");

      // Define quais carros processar (+ dados da pessoa)
      let alvos: { ad: any; vendedor_id: any; vendedor_nome: string; vinculado: boolean }[] = [];

      if (fonte === "carros") {
        // Só os carros classificados como COMERCIAL e marcados pra exibir (ativo)
        const { data: carros } = await supabase
          .from("comercial_veiculos")
          .select("placa, pessoa_id, pessoa_nome")
          .eq("categoria", "comercial")
          .eq("ativo", true);
        const comerciais = new Map<string, any>();
        for (const c of carros || []) comerciais.set(normPlaca(c.placa), c);
        alvos = (adesoes as any[])
          .filter((a) => a.vei_placa && comerciais.has(normPlaca(a.vei_placa)))
          .map((ad) => {
            const v = comerciais.get(normPlaca(ad.vei_placa));
            return { ad, vendedor_id: v?.pessoa_id || null, vendedor_nome: v?.pessoa_nome || "", vinculado: !!v };
          });
      } else {
        // Vendedores que fizeram check-in hoje
        const { data: checkins } = await supabase.from("checkin_vendedor").select("*").eq("data", hoje);
        for (const ck of checkins || []) {
          const ad = (adesoes as any[]).find((a) => normPlaca(a.vei_placa) === normPlaca(ck.placa));
          if (ad) alvos.push({ ad, vendedor_id: ck.vendedor_id, vendedor_nome: ck.vendedor_nome || "", vinculado: true });
        }
      }

      if (alvos.length === 0) return NextResponse.json([]);

      const agora = new Date();
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      const BATCH = 10;
      const resultado: any[] = [];

      for (let i = 0; i < alvos.length; i += BATCH) {
        const batch = alvos.slice(i, i + BATCH);
        const lote = await Promise.all(batch.map(async ({ ad, vendedor_id, vendedor_nome, vinculado }) => {
          const placa = ad.vei_placa || "";
          if (!placa) return null;

          const veiculo: any = {
            vendedor_id,
            vendedor_nome,
            placa,
            modelo: ad.vei_descricao || ad.vei_modelo || "",
            adesao_id: ad.id,
            vinculado,
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

          return veiculo;
        }));
        resultado.push(...lote.filter(Boolean));
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

    if (acao === "historico") {
      const placa = req.nextUrl.searchParams.get("placa");
      if (!placa) return NextResponse.json({ error: "placa obrigatória" }, { status: 400 });
      const { data } = await supabase
        .from("rotas_vendedor")
        .select("data, km_total, paradas, visitas, tempo_dirigindo_min, tempo_parado_min, hora_inicio, hora_fim")
        .eq("placa", placa)
        .order("data", { ascending: false })
        .limit(90);
      const hist = (data || []).map((r: any) => ({
        data: r.data,
        km_total: r.km_total || 0,
        paradas: Array.isArray(r.paradas) ? r.paradas.length : 0,
        visitas: Array.isArray(r.visitas) ? r.visitas.length : 0,
        tempo_dirigindo_min: r.tempo_dirigindo_min || 0,
        tempo_parado_min: r.tempo_parado_min || 0,
        hora_inicio: r.hora_inicio,
        hora_fim: r.hora_fim,
      }));
      return NextResponse.json(hist);
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
