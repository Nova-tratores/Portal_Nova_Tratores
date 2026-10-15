// POST { ppvId } → envia ao Omie o PPV da OS que ficou de fora no envio (ex.: produto
// não achado). Vai como remessa se a OS é interna; procura o produto na Nova e, se não
// achar, na Castro. Depois atualiza o "Nº do Pedido do Cliente" da OS no Omie.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { enviarPPVParaOmie } from "@/lib/ppv/omie";
import { pedidoClienteDaOS } from "@/lib/pos/pedido-cliente";
import { contaOmie } from "@/lib/omie/contas";
import { omie } from "@/lib/omie/porta";
import { temModuloPOS } from "../faturar/comum";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ppvId = String(body?.ppvId || "").trim();
  if (!ppvId) return NextResponse.json({ error: "Informe o PPV." }, { status: 400 });

  const { data } = await supabase.from(TBL_OS).select("Id_Ordem, Ordem_Omie, omie_ncodos, Servico_Interno, ID_PPV, faturado_omie_em").eq("Id_Ordem", id).limit(1);
  const os = data?.[0] as Record<string, unknown> | undefined;
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  const ids = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.includes(ppvId)) return NextResponse.json({ error: `${ppvId} não é desta OS.` }, { status: 400 });
  const numOS = String(os.Ordem_Omie || "").replace(/^0+(?=\d)/, "");
  if (!numOS) return NextResponse.json({ error: "Envie a OS ao Omie primeiro." }, { status: 400 });

  const r = await enviarPPVParaOmie(ppvId, { remessa: !!os.Servico_Interno, numeroOSOmie: numOS });
  if (!r.sucesso) return NextResponse.json({ error: r.erro || "O Omie não aceitou." }, { status: 400 });

  // "Nº do Pedido do Cliente" da OS (só dá enquanto ela não foi faturada)
  let aviso: string | null = null;
  if (os.omie_ncodos && !os.faturado_omie_em) {
    try {
      const { key, secret } = contaOmie("Nova Tratores");
      await omie({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, "/servicos/os/", "AlterarOS",
        { Cabecalho: { nCodOS: Number(os.omie_ncodos) }, InformacoesAdicionais: { cNumPedido: await pedidoClienteDaOS(ids) } },
        { gravacao: true, tentativas: 0, prioridade: "pessoa" });
    } catch (e) { aviso = `Peças enviadas, mas não gravei o nº na OS ${numOS}: ${e instanceof Error ? e.message : e}`; }
  }
  await logAndNotify({
    userName: auth.email || "Portal", sistema: "pos", acao: "enviar_pecas_omie", entidade: "ordem_servico", entidadeId: id, entidadeLabel: `OS ${id}`,
    detalhes: { ppvId, numero: r.numeroPedido, aviso }, notifTitulo: "", notifDescricao: "", notifLink: "",
  }).catch(() => {});
  return NextResponse.json({ ok: true, numero: r.numeroPedido, aviso });
}
