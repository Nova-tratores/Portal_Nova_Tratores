// POST { id } → fatura a REMESSA do PPV no Omie (emite a NF-e de remessa). Serve para
// faturar pela tela do PPV ou pela OS (José, 15/10/2026). Ato fiscal: precisa da
// permissão de faturar (PPV ou OS); uma chamada só ao Omie, sem repetir.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPVouPOS } from "@/lib/ppv/server";
import { faturarRemessaPPV } from "@/lib/ppv/omie";
import { podeFaturarOS, podeFaturarPPV } from "@/lib/pos/faturamento";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPVouPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (!podeFaturarPPV(auth) && !podeFaturarOS(auth)) return NextResponse.json({ error: "Você não tem permissão para faturar." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Informe o PPV." }, { status: 400 });
  const usuario = auth.email || "Portal";
  try {
    const r = await faturarRemessaPPV(id, usuario);
    if (r.ok && !r.jaFaturada) {
      await logAndNotify({
        userName: usuario, sistema: "ppv", acao: "faturar_remessa", entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
        detalhes: { nf: r.nf }, notifTitulo: `Remessa ${id} faturada`, notifDescricao: `${usuario} faturou a remessa ${id}${r.nf ? ` (NF-e ${r.nf})` : ""}.`, notifLink: `/ppv?id=${id}`,
      }).catch(() => {});
    }
    return NextResponse.json(r.ok ? { ok: true, nf: r.nf ?? null, jaFaturada: !!r.jaFaturada } : { ok: false, error: r.erro }, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
