// POST /api/ppv/pedidos/faturar — fatura o Pedido de Venda no Omie (emite NF-e).
// EXIGE login + módulo PPV (ao contrário da rota /omie legada). Ato fiscal:
// a UI faz confirmação dupla; aqui garantimos permissão e anti-duplicidade.
import { NextRequest, NextResponse, after } from "next/server";
import { faturarPPVNoOmie, obterComunicacaoSefaz } from "@/lib/ppv/omie";
import { avisarUsuarioPorEmail } from "@/lib/notif/avisar-usuario";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// a janela pode fechar ("avisar no sino"): o faturamento segue até o fim no servidor (molde do POS)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const id = body?.id;
    const categoria = body?.categoria;
    const userName = body?.userName || auth.email || "Sistema";
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });
    }

    const resultado = await faturarPPVNoOmie(id, { categoria });
    const link = `/ppv?id=${id}`;
    if (!resultado.sucesso) {
      // quem faturou fica sabendo mesmo com a janela fechada (José, 23/10/2026)
      await avisarUsuarioPorEmail(auth.email, "ppv", resultado.pendente ? `PPV ${id}: faturamento aguardando o Omie` : `PPV ${id}: o Omie recusou o faturamento`, String(resultado.erro || ""), link);
      // "pendente" (faturamento acionado, NF ainda não autorizada) NÃO é erro duro:
      // devolve 200 pra a UI mostrar "aguardando SEFAZ" em vez de erro vermelho.
      if (resultado.pendente) {
        return NextResponse.json({ success: false, pendente: true, error: resultado.erro, numeroPedido: resultado.numeroPedido, empresa: resultado.empresa });
      }
      return NextResponse.json({ error: resultado.erro, jaFaturado: resultado.jaFaturado }, { status: 400 });
    }

    await logAndNotify({
      userName, sistema: "ppv", acao: "faturar",
      entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
      detalhes: { numeroPedido: resultado.numeroPedido, categoria, empresa: resultado.empresa, etapa: resultado.etapa },
      notifTitulo: `PPV ${id} faturada (NF-e)`,
      notifDescricao: `${userName} faturou a PPV ${id} no Omie (pedido nº ${resultado.numeroPedido}).`,
      notifLink: `/ppv?id=${id}`,
    });

    // NF-e: já saiu → avisa agora; senão acompanha a SEFAZ depois de responder (até ~4 min) e avisa quando sair
    const semZeros = (v: unknown) => String(v ?? "").replace(/^0+(?=\d)/, "");
    const pedidoTxt = resultado.numeroPedido ? ` do pedido ${semZeros(resultado.numeroPedido)}` : "";
    if (resultado.nfNumero) await avisarUsuarioPorEmail(auth.email, "ppv", `NF-e ${resultado.nfNumero}${pedidoTxt} pronta`, `PPV ${id} faturada no Omie (${resultado.empresa || ""}).`, link);
    else after(async () => {
      for (let i = 0; i < 8; i++) {
        await new Promise((ok) => setTimeout(ok, 30_000));
        const c = await obterComunicacaoSefaz(id, { refresh: true }).catch(() => null) as { faturado?: boolean; numero?: string } | null;
        if (c?.faturado && c.numero) { await avisarUsuarioPorEmail(auth.email, "ppv", `NF-e ${semZeros(c.numero)}${pedidoTxt} pronta`, `PPV ${id} faturada no Omie.`, link); return; }
      }
      await avisarUsuarioPorEmail(auth.email, "ppv", `PPV ${id}: NF-e ainda em autorização`, `O pedido${pedidoTxt} foi faturado, mas a SEFAZ ainda não devolveu a NF-e. Confira no bloco de notas.`, link);
    });

    return NextResponse.json({
      success: true,
      aguardandoSefaz: resultado.aguardandoSefaz,
      numeroPedido: resultado.numeroPedido,
      nfNumero: resultado.nfNumero,
      etapa: resultado.etapa,
      empresa: resultado.empresa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API pedidos/faturar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
