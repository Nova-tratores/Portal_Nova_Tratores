import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface Peca {
  catalogo_nome: string;
  catalogo_codigo: string;
  secao_nome: string;
  secao_codigo: string;
  conjunto_nome: string;
  conjunto_codigo: string;
  referencia_desenho: string;
  codigo_peca: string;
  nome_peca: string;
  quantidade: string;
  unidade: string;
  tipo_filho: string;
  observacoes: string;
}

let cachedData: Peca[] | null = null;

function loadCSV(): Peca[] {
  if (cachedData) return cachedData;

  const csvPath = path.join(process.cwd(), "pecazetec.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(";");

  cachedData = lines.slice(1).map((line) => {
    const values = line.split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] || "").trim();
    });
    return obj as unknown as Peca;
  });

  return cachedData;
}

export async function GET(req: NextRequest) {
  const data = loadCSV();
  const url = req.nextUrl.searchParams;

  const busca = (url.get("busca") || "").toLowerCase();
  const catalogo = url.get("catalogo") || "";
  const secao = url.get("secao") || "";
  const conjunto = url.get("conjunto") || "";
  const tipo = url.get("tipo") || "";
  const page = parseInt(url.get("page") || "1", 10);
  const limit = parseInt(url.get("limit") || "50", 10);
  const mode = url.get("mode") || "";

  // Mode: return filter options (cascading)
  if (mode === "filtros") {
    const catalogos = [...new Set(data.map((p) => p.catalogo_nome))].sort();

    let filtered = data;
    if (catalogo) filtered = filtered.filter((p) => p.catalogo_nome === catalogo);

    const secoes = [...new Set(filtered.map((p) => p.secao_nome))].sort();

    if (secao) filtered = filtered.filter((p) => p.secao_nome === secao);

    const conjuntos = [...new Set(filtered.map((p) => p.conjunto_nome))].sort();

    return NextResponse.json({ catalogos, secoes, conjuntos });
  }

  // Filter
  let filtered = data;

  if (catalogo) filtered = filtered.filter((p) => p.catalogo_nome === catalogo);
  if (secao) filtered = filtered.filter((p) => p.secao_nome === secao);
  if (conjunto) filtered = filtered.filter((p) => p.conjunto_nome === conjunto);
  if (tipo) filtered = filtered.filter((p) => p.tipo_filho === tipo);

  if (busca) {
    filtered = filtered.filter(
      (p) =>
        p.codigo_peca.toLowerCase().includes(busca) ||
        p.nome_peca.toLowerCase().includes(busca) ||
        p.observacoes.toLowerCase().includes(busca)
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return NextResponse.json({ items, total, page, totalPages, limit });
}
