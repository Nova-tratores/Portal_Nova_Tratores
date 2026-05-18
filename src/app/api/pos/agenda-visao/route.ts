import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { buscarEnderecos } from "@/lib/pos/enderecos";
import { geocodificar, rotaDaOficina, calcularRota, OFICINA } from "@/lib/pos/ors";

const TBL = "agenda_visao";

/** GET — busca agenda do dia ou range de datas */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  const tecnico = searchParams.get("tecnico");

  let query = supabase.from(TBL).select("*").order("ordem_sequencia");

  if (de && ate) {
    // Range de datas (visao mensal)
    query = query.gte("data", de).lte("data", ate);
  } else {
    query = query.eq("data", data || new Date().toISOString().split("T")[0]);
  }

  if (tecnico) query = query.eq("tecnico_nome", tecnico);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(rows || []);
}

/** POST — sync rápido: salva dados básicos das ordens SEM chamar ORS */
export async function POST(req: NextRequest) {
  const { data: dataStr, tecnicos } = await req.json();

  if (!dataStr || !Array.isArray(tecnicos)) {
    return NextResponse.json({ erro: "data e tecnicos obrigatórios" }, { status: 400 });
  }

  const toInsert: any[] = [];

  for (const tec of tecnicos) {
    // Buscar existentes de uma vez
    const { data: existentes } = await supabase
      .from(TBL)
      .select("id_ordem, id, qtd_horas")
      .eq("data", dataStr)
      .eq("tecnico_nome", tec.nome);

    const existentesMap = new Map((existentes || []).map((e: any) => [e.id_ordem, e]));

    let seq = existentesMap.size;
    for (const o of tec.ordens) {
      const horasOS = parseFloat(String(o.qtdHoras || 0)) || 2;
      const existente = existentesMap.get(o.id);
      if (existente) {
        // Atualizar qtd_horas se mudou na OS
        if (existente.qtd_horas !== horasOS) {
          await supabase.from(TBL).update({ qtd_horas: horasOS }).eq("id", existente.id);
        }
        continue;
      }

      // Buscar coordenadas já salvas para este cliente
      let coordPre: { lat: number; lng: number } | null = null;
      let enderecoPre = o.endereco || "";
      const cnpjO = (o.cnpj || "").replace(/\D/g, "");
      if (cnpjO || o.cliente) {
        let qc = supabase.from("clientes_coordenadas").select("coordenadas, endereco");
        if (cnpjO) {
          qc = qc.or(`cnpj.eq.${cnpjO},nome_cliente.eq.${o.cliente || ""}`);
        } else {
          qc = qc.eq("nome_cliente", o.cliente || "");
        }
        const { data: cc } = await qc.order("atualizado_em", { ascending: false }).limit(1);
        if (cc && cc.length > 0 && cc[0].coordenadas) {
          coordPre = cc[0].coordenadas as { lat: number; lng: number };
          enderecoPre = cc[0].endereco || enderecoPre;
        }
      }

      toInsert.push({
        data: dataStr,
        tecnico_nome: tec.nome,
        id_ordem: o.id,
        cliente: o.cliente || "",
        cnpj: o.cnpj || "",
        servico: o.servico || "",
        endereco: enderecoPre,
        cidade: o.cidade || "",
        endereco_opcoes: [],
        coordenadas: coordPre,
        tempo_ida_min: 0,
        distancia_ida_km: 0,
        tempo_volta_min: 0,
        distancia_volta_km: 0,
        qtd_horas: horasOS,
        hora_inicio: o.horaInicio || "",
        hora_fim: o.horaFim || "",
        ordem_sequencia: seq,
        status: "pendente",
        observacoes: o.observacoes || "",
      });
      seq++;
    }

    // Limpar ordens que saíram de "Execução" (stale records)
    const ordensAtuais = tec.ordens.map((o: any) => o.id);
    if (existentes && existentes.length > 0) {
      const idsRemover = existentes
        .filter((e: any) => !ordensAtuais.includes(e.id_ordem))
        .map((e: any) => e.id);
      if (idsRemover.length > 0) {
        await supabase.from(TBL).delete().in("id", idsRemover);
      }
    }
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from(TBL).insert(toInsert);
    if (insertErr) {
      console.error("[agenda-visao] Erro insert:", insertErr.message, "| payload sample:", JSON.stringify(toInsert[0]));
      return NextResponse.json({ erro: insertErr.message }, { status: 500 });
    }
  }

  // Retorna tudo do dia
  const { data: rows, error: selErr } = await supabase
    .from(TBL).select("*").eq("data", dataStr).order("ordem_sequencia");

  if (selErr) {
    console.error("[agenda-visao] Erro select:", selErr.message);
    return NextResponse.json({ erro: selErr.message }, { status: 500 });
  }

  return NextResponse.json(rows || []);
}

/** PATCH — atualiza item. Se manda calcular=true, faz geocode+rota */
export async function PATCH(req: NextRequest) {
  const dados = await req.json();
  const { id, calcular, ...campos } = dados;

  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  // Calcular rotas (chamado pelo frontend para cada row)
  if (calcular) {
    // Buscar row atual para pegar cnpj/endereco/cidade/cliente
    const { data: row } = await supabase.from(TBL).select("*").eq("id", id).single();
    if (!row) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });

    const cnpj = row.cnpj || "";
    const cliente = row.cliente || "";

    // 1. Tentar buscar coordenadas já confirmadas para este cliente
    let coordSalvas: { lat: number; lng: number } | null = null;
    let enderecoSalvo = "";
    if (cnpj || cliente) {
      const cnpjLimpo = cnpj.replace(/\D/g, "");
      let q = supabase.from("clientes_coordenadas").select("*");
      if (cnpjLimpo) {
        q = q.or(`cnpj.eq.${cnpjLimpo},nome_cliente.eq.${cliente}`);
      } else {
        q = q.eq("nome_cliente", cliente);
      }
      const { data: cached } = await q.order("atualizado_em", { ascending: false }).limit(1);
      if (cached && cached.length > 0 && cached[0].coordenadas) {
        coordSalvas = cached[0].coordenadas as { lat: number; lng: number };
        enderecoSalvo = cached[0].endereco || "";
      }
    }

    const opcoes = await buscarEnderecos(cnpj, row.endereco || "", row.cidade || "");

    let coordenadas = coordSalvas;
    let enderecoUsado = coordSalvas ? enderecoSalvo : (row.endereco || "");
    let tempoIda = 0, distIda = 0, tempoVolta = 0, distVolta = 0;

    // Origem customizada (última localização do técnico) ou oficina
    const origemLat = campos.origemLat as number | undefined;
    const origemLng = campos.origemLng as number | undefined;
    const usarOrigem = origemLat && origemLng;

    // 2. Se não tem coordenadas salvas, geocodificar
    if (!coordenadas) {
      for (const opt of opcoes) {
        coordenadas = await geocodificar(opt.endereco + ", Brasil");
        if (coordenadas) {
          enderecoUsado = opt.endereco;
          break;
        }
      }
    }

    // 3. Calcular rotas se tem coordenadas
    if (coordenadas) {
      const rotaIda = usarOrigem
        ? await calcularRota(origemLat, origemLng, coordenadas.lat, coordenadas.lng)
        : await rotaDaOficina(coordenadas.lat, coordenadas.lng);
      if (rotaIda) { tempoIda = rotaIda.tempo_min; distIda = rotaIda.distancia_km; }
      const rotaVolta = await rotaDaOficina(coordenadas.lat, coordenadas.lng);
      if (rotaVolta) { tempoVolta = rotaVolta.tempo_min; distVolta = rotaVolta.distancia_km; }

      // 4. Salvar coordenadas confirmadas para este cliente (upsert)
      if (!coordSalvas) {
        const cnpjLimpo = cnpj.replace(/\D/g, "") || null;
        await supabase.from("clientes_coordenadas").upsert({
          cnpj: cnpjLimpo,
          nome_cliente: cliente,
          endereco: enderecoUsado,
          cidade: row.cidade || "",
          coordenadas,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "cnpj,nome_cliente,endereco" }).then(() => {});
      }
    }

    const { data: updated, error } = await supabase.from(TBL).update({
      endereco: enderecoUsado,
      endereco_opcoes: opcoes,
      coordenadas,
      tempo_ida_min: tempoIda,
      distancia_ida_km: distIda,
      tempo_volta_min: tempoVolta,
      distancia_volta_km: distVolta,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  // Edição manual de endereço — recalcular rota e salvar coordenadas do cliente
  if (campos.endereco) {
    const coords = await geocodificar(campos.endereco + ", Brasil");
    if (coords) {
      campos.coordenadas = coords;
      const rota = await rotaDaOficina(coords.lat, coords.lng);
      if (rota) {
        campos.tempo_ida_min = rota.tempo_min;
        campos.distancia_ida_km = rota.distancia_km;
        campos.tempo_volta_min = rota.tempo_min;
        campos.distancia_volta_km = rota.distancia_km;
      }
      // Salvar coordenadas confirmadas para este cliente
      const { data: rowEdit } = await supabase.from(TBL).select("cliente, cnpj, cidade").eq("id", id).single();
      if (rowEdit?.cliente) {
        const cnpjLimpo = (rowEdit.cnpj || "").replace(/\D/g, "") || null;
        await supabase.from("clientes_coordenadas").upsert({
          cnpj: cnpjLimpo,
          nome_cliente: rowEdit.cliente,
          endereco: campos.endereco,
          cidade: rowEdit.cidade || "",
          coordenadas: coords,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "cnpj,nome_cliente,endereco" }).then(() => {});
      }
    }
  }

  campos.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from(TBL).update(campos).eq("id", id).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE — remove item */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from(TBL).delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
