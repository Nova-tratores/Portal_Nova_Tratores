import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { buscarImagensBing } from "@/lib/visual-estoque/bing";

export const runtime = "nodejs";

// Consulta dados de uma placa na APIBrasil + busca imagem no Bing. Porta
// /api/frota-consultar. Degrada com mensagem clara se as credenciais APIBrasil
// não estiverem configuradas no ambiente.
export async function POST(req: NextRequest) {
  const { id_placa, placa } = await req.json();
  if (!id_placa || !placa) return NextResponse.json({ ok: false, mensagem: "Dados inválidos" }, { status: 400 });

  const BEARER = process.env.APIBRASIL_BEARER || "";
  const DEVICE = process.env.APIBRASIL_DEVICE || "";
  if (!BEARER || !DEVICE) {
    return NextResponse.json({ ok: false, mensagem: "Consulta de placa indisponível: configure APIBRASIL_BEARER e APIBRASIL_DEVICE no ambiente." }, { status: 503 });
  }

  try {
    const respPlaca = await fetch("https://gateway.apibrasil.io/api/v2/vehicles/dados", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + BEARER, DeviceToken: DEVICE },
      body: JSON.stringify({ placa: String(placa).replace(/[^A-Za-z0-9]/g, "") }),
    });
    const dados = await respPlaca.json();
    if (!dados || dados.error) {
      return NextResponse.json({ ok: false, mensagem: dados?.message || "Placa não encontrada" });
    }

    const marca = dados.MARCA || dados.marca || "";
    const modelo = dados.MODELO || dados.modelo || "";
    const ano = dados.ano || dados.ANO || dados.anoModelo || null;
    const cor = dados.cor || dados.COR || "";

    let imagemUrl: string | null = null;
    try {
      const imagens = await buscarImagensBing(`${marca} ${modelo} ${cor}`.trim(), 1);
      if (imagens.length > 0) imagemUrl = imagens[0];
    } catch {
      /* ignora erro de imagem */
    }

    const patch: Record<string, unknown> = {};
    if (ano) patch.ano = parseInt(ano);
    if (imagemUrl) patch.imagem_url = imagemUrl;
    if (Object.keys(patch).length > 0) await supabaseVE.from("Placas").update(patch).eq("IdPlaca", id_placa);

    return NextResponse.json({ ok: true, marca, modelo, ano: ano ? parseInt(ano) : null, cor, imagem_url: imagemUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, mensagem: msg }, { status: 500 });
  }
}
