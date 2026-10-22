// Localizações do cliente da OS (José, 22/10/2026) — várias por CPF/CNPJ, cada uma com o nome da fazenda.
// GET  → localizações do cliente + paradas ≥ 30 min do carro do técnico nos dias de execução.
// POST → { nome, lat, lng, origem, placa?, tecnico?, paradaInicio?, paradaMin? } adiciona;
//        { acao: 'renomear', id, nome } | { acao: 'remover', id } altera uma do mesmo cliente.
import { NextRequest, NextResponse } from "next/server";
import { localizacoesDoDocumento, paradasDaOS, adicionarLocalizacao, alterarLocalizacao } from "@/lib/pos/localizacao-cliente-server";
import { temModuloPOS, erroRota } from "../faturar/comum";
import { autenticar } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  try {
    const p = await paradasDaOS(id);
    const { lista, semTabela } = await localizacoesDoDocumento(p.documento);
    return NextResponse.json({ ...p, localizacoes: lista, semTabela });
  } catch (e) { return erroRota(e, "localizacao GET"); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const autor = auth.email || auth.userId;
  try {
    const b = await req.json().catch(() => ({}));
    const p = await paradasDaOS(id).catch(() => null);
    if (!p) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
    if (b?.acao === "renomear" || b?.acao === "remover") {
      await alterarLocalizacao(p.documento, String(b.id || ""), b.acao === "remover" ? { remover: true } : { nome: String(b.nome || "") }, autor);
      return NextResponse.json({ ok: true });
    }
    const origem = ["parada", "cadastro", "manual"].includes(b?.origem) ? b.origem : "manual";
    const loc = await adicionarLocalizacao({
      documento: p.documento, cliente: p.cliente, nome: String(b?.nome || ""), lat: Number(b?.lat), lng: Number(b?.lng), origem,
      placa: b?.placa ?? null, tecnico: b?.tecnico ?? null, paradaInicio: b?.paradaInicio ?? null,
      paradaMin: b?.paradaMin != null ? Number(b.paradaMin) : null, osId: id, autor,
    });
    return NextResponse.json({ ok: true, localizacao: loc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/inválid|sem CPF|SQL|nome|já está cadastrada|Já existe|não é deste/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return erroRota(e, "localizacao POST");
  }
}
