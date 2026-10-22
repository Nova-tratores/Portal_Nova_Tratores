// Localização do cliente da OS (José, 22/10/2026).
// GET  → localização confirmada do CPF/CNPJ + paradas ≥ 30 min do carro do técnico nos dias de execução.
// POST → confirma { lat, lng, origem, placa?, tecnico?, paradaInicio?, paradaMin? } para o documento do cliente.
import { NextRequest, NextResponse } from "next/server";
import { localizacaoDoDocumento, paradasDaOS, confirmarLocalizacao } from "@/lib/pos/localizacao-cliente-server";
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
    const { loc, semTabela } = await localizacaoDoDocumento(p.documento);
    return NextResponse.json({ ...p, confirmada: loc, semTabela });
  } catch (e) { return erroRota(e, "localizacao GET"); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  try {
    const b = await req.json().catch(() => ({}));
    const p = await paradasDaOS(id).catch(() => null);
    if (!p) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
    const origem = ["parada", "cadastro", "manual"].includes(b?.origem) ? b.origem : "manual";
    const loc = await confirmarLocalizacao({
      documento: p.documento, cliente: p.cliente, lat: Number(b?.lat), lng: Number(b?.lng), origem,
      placa: b?.placa ?? null, tecnico: b?.tecnico ?? null, paradaInicio: b?.paradaInicio ?? null,
      paradaMin: b?.paradaMin != null ? Number(b.paradaMin) : null, osId: id, autor: auth.email || auth.userId,
    });
    return NextResponse.json({ ok: true, confirmada: loc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/inválid|sem CPF|SQL/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return erroRota(e, "localizacao POST");
  }
}
