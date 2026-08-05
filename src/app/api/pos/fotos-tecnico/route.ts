import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

const CAMPOS_NOMEADOS: [string, string, string][] = [
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

// FotosExtras é a grade livre do app (Câmera/Galeria gravam TUDO ali) — sem
// ela, o que o técnico anexa fica invisível (caso real: OS-0640/GAR-0038)
function extrasDe(row: Record<string, unknown>): string[] {
  const raw = row.FotosExtras;
  let arr: unknown[] = Array.isArray(raw) ? raw : [];
  if (typeof raw === "string") { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p; } catch { /* ignora */ } }
  return arr.map((x) => String(x || "")).filter((u) => u && !u.startsWith("data:"));
}

const SELECT_FOTOS = CAMPOS_NOMEADOS.map(([c]) => c).join(", ") + ", FotosExtras";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const osId = searchParams.get("os");

  if (osId) {
    // Pode haver mais de uma linha por OS (rascunhos) — pega a 'enviado'
    // mais recente; maybeSingle estouraria com 2+ linhas.
    const { data: rows, error } = await supabase
      .from("Ordem_Servico_Tecnicos")
      .select(`IdOs, Status, Ordem_Servico, NomResp, AssCliente, AssTecnico, TipoServico, Motivo, ServicoRealizado, Chassis, Horimetro, ${SELECT_FOTOS}`)
      .eq("Ordem_Servico", osId)
      .order("IdOs", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const lista = (rows || []) as unknown as Record<string, any>[];
    const data = lista.find((t) => String(t.Status || "").toLowerCase() === "enviado") || lista[0];
    if (!data) return NextResponse.json({ error: "Nenhum relatório encontrado para esta OS" }, { status: 404 });

    // Montar lista de fotos
    const fotos: { label: string; url: string; categoria: string }[] = [];
    for (const [campo, label, cat] of CAMPOS_NOMEADOS) {
      const val = data[campo];
      if (val) fotos.push({ label, url: val, categoria: cat });
    }
    const vistas = new Set(fotos.map((f) => f.url));
    extrasDe(data).forEach((url, i) => {
      if (!vistas.has(url)) fotos.push({ label: `Extra ${i + 1}`, url, categoria: "Extras" });
    });

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
    .select(`Ordem_Servico, NomResp, TipoServico, ${SELECT_FOTOS}`)
    .order("Ordem_Servico", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = ((lista || []) as unknown as Record<string, any>[]).map((r) => {
    const urls: string[] = [];
    for (const [c] of CAMPOS_NOMEADOS) { if (r[c]) urls.push(r[c]); }
    for (const u of extrasDe(r)) { if (!urls.includes(u)) urls.push(u); }
    return {
      os: r.Ordem_Servico,
      tecnico: r.NomResp || "",
      tipoServico: r.TipoServico || "",
      totalFotos: urls.length,
      thumb: urls[0] || "",
    };
  });

  return NextResponse.json(items);
}
