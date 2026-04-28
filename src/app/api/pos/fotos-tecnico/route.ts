import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const osId = searchParams.get("os");

  if (osId) {
    // Buscar fotos de uma OS específica
    const { data, error } = await supabase
      .from("Ordem_Servico_Tecnicos")
      .select("Ordem_Servico, NomResp, FotoHorimetro, FotoChassis, FotoFrente, FotoDireita, FotoEsquerda, FotoTraseira, FotoVolante, FotoFalha1, FotoFalha2, FotoFalha3, FotoFalha4, FotoPecaNova1, FotoPecaNova2, FotoPecaInstalada1, FotoPecaInstalada2, AssCliente, AssTecnico, TipoServico, Motivo, ServicoRealizado, Chassis, Horimetro")
      .eq("Ordem_Servico", osId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Nenhum relatório encontrado para esta OS" }, { status: 404 });

    // Montar lista de fotos
    const fotos: { label: string; url: string; categoria: string }[] = [];
    const map: [string, string, string][] = [
      ["FotoHorimetro", "Horímetro", "Identificação"],
      ["FotoChassis", "Chassis", "Identificação"],
      ["FotoFrente", "Frente", "Máquina"],
      ["FotoDireita", "Direita", "Máquina"],
      ["FotoEsquerda", "Esquerda", "Máquina"],
      ["FotoTraseira", "Traseira", "Máquina"],
      ["FotoVolante", "Volante", "Máquina"],
      ["FotoFalha1", "Falha 1", "Falhas"],
      ["FotoFalha2", "Falha 2", "Falhas"],
      ["FotoFalha3", "Falha 3", "Falhas"],
      ["FotoFalha4", "Falha 4", "Falhas"],
      ["FotoPecaNova1", "Peça Nova 1", "Peças"],
      ["FotoPecaNova2", "Peça Nova 2", "Peças"],
      ["FotoPecaInstalada1", "Peça Instalada 1", "Peças"],
      ["FotoPecaInstalada2", "Peça Instalada 2", "Peças"],
    ];
    for (const [campo, label, cat] of map) {
      const val = (data as Record<string, any>)[campo];
      if (val) fotos.push({ label, url: val, categoria: cat });
    }

    const assinaturas: { label: string; url: string }[] = [];
    if (data.AssCliente) assinaturas.push({ label: "Cliente", url: data.AssCliente });
    if (data.AssTecnico) assinaturas.push({ label: "Técnico", url: data.AssTecnico });

    return NextResponse.json({
      os: data.Ordem_Servico,
      tecnico: data.NomResp || "",
      tipoServico: data.TipoServico || "",
      diagnostico: data.Motivo || "",
      servicoRealizado: data.ServicoRealizado || "",
      chassis: data.Chassis || "",
      horimetro: data.Horimetro || "",
      fotos,
      assinaturas,
      totalFotos: fotos.length,
    });
  }

  // Listar todas as OS que têm relatório do técnico
  const { data: lista, error } = await supabase
    .from("Ordem_Servico_Tecnicos")
    .select("Ordem_Servico, NomResp, TipoServico, FotoHorimetro, FotoChassis, FotoFrente, FotoDireita, FotoEsquerda, FotoTraseira, FotoVolante, FotoFalha1, FotoFalha2, FotoFalha3, FotoFalha4, FotoPecaNova1, FotoPecaNova2, FotoPecaInstalada1, FotoPecaInstalada2")
    .order("Ordem_Servico", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (lista || []).map((row) => {
    let count = 0;
    const campos = ["FotoHorimetro", "FotoChassis", "FotoFrente", "FotoDireita", "FotoEsquerda", "FotoTraseira", "FotoVolante", "FotoFalha1", "FotoFalha2", "FotoFalha3", "FotoFalha4", "FotoPecaNova1", "FotoPecaNova2", "FotoPecaInstalada1", "FotoPecaInstalada2"];
    const r = row as Record<string, any>;
    for (const c of campos) { if (r[c]) count++; }
    // Thumbnail: primeira foto disponível
    let thumb = "";
    for (const c of campos) { if (r[c]) { thumb = r[c]; break; } }
    return {
      os: row.Ordem_Servico,
      tecnico: row.NomResp || "",
      tipoServico: row.TipoServico || "",
      totalFotos: count,
      thumb,
    };
  });

  return NextResponse.json(items);
}
