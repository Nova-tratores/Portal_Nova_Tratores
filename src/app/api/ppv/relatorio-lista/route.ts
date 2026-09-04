import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoModulo } from "@/lib/ajustes/permissao-server";
import { buscarPedidosPorIds, destinatariosPadrao, enviarRelacaoPPVPorEmail, CHAVE_ENVIO_PPV } from "@/lib/ppv/relatorio-lista";
import { registrarEnvioLog } from "@/lib/email/envios-config";

// pdfkit exige runtime Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function autenticar(req: NextRequest) {
  try {
    return await exigirAcessoModulo(req, "ppv");
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    throw NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
  }
}

// GET — configuração do envio (pré-preenche o modal "Enviar por e-mail").
export async function GET(req: NextRequest) {
  try {
    await autenticar(req);
  } catch (res) { return res as NextResponse; }
  const p = await destinatariosPadrao();
  return NextResponse.json({ to: p.to.join(", "), cc: p.cc.join(", "), gmailConfigurado: p.gmailConfigurado, migrationFaltando: p.migrationFaltando });
}

// POST — envia por e-mail a relação como está na tela.
// body: { ids: string[] (ordem da tela), filtrosResumo?: string[], to?: string, cc?: string, mensagem?: string, titulo?: string }
export async function POST(req: NextRequest) {
  let usuario: { id: string; email?: string; nome?: string };
  try {
    usuario = await autenticar(req);
  } catch (res) { return res as NextResponse; }
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 5000) : [];
    if (!ids.length) return NextResponse.json({ error: "Nenhum pedido na relação para enviar." }, { status: 400 });
    const to = typeof body?.to === "string" && body.to.trim() ? body.to : undefined;
    const cc = typeof body?.cc === "string" ? body.cc : undefined;
    if (!to && !(await destinatariosPadrao()).to.length) {
      return NextResponse.json({ error: "Informe pelo menos um destinatário (ou configure o padrão em Dev → Envios de e-mail)." }, { status: 400 });
    }

    // Os dados saem do BANCO (não do que o navegador mandou) — só a ordem/seleção vem da tela.
    const pedidos = await buscarPedidosPorIds(ids);
    const r = await enviarRelacaoPPVPorEmail({
      pedidos,
      to,
      cc,
      origem: "manual",
      titulo: typeof body?.titulo === "string" && body.titulo.trim() ? body.titulo.trim().slice(0, 120) : undefined,
      filtrosResumo: Array.isArray(body?.filtrosResumo) ? body.filtrosResumo.map(String).slice(0, 30) : [],
      mensagem: typeof body?.mensagem === "string" ? body.mensagem.slice(0, 2000) : undefined,
      enviadoPor: usuario.nome || usuario.email || "",
    });
    // Histórico (tela Dev → Envios de e-mail): envio manual a partir da tela do PPV.
    await registrarEnvioLog({
      chave: CHAVE_ENVIO_PPV, origem: "manual", ok: r.email.ok, motivo: r.email.ok ? undefined : (r.email.erro || r.email.motivo),
      assunto: "Relação de PPVs (tela /ppv)", destinatarios: r.destinatarios, total: r.total, usuario: usuario.email || usuario.nome,
      detalhes: { filtros: Array.isArray(body?.filtrosResumo) ? body.filtrosResumo.slice(0, 30) : [], arquivos: r.arquivos },
    });
    if (!r.email.ok) {
      const motivos: Record<string, string> = {
        gmail_nao_configurado: "E-mail não configurado no servidor (GMAIL_USER / GMAIL_APP_PASSWORD).",
        sem_destinatario: "Nenhum destinatário informado.",
        erro_gmail: `Falha no envio: ${r.email.erro || "erro do Gmail"}`,
      };
      return NextResponse.json({ ok: false, error: motivos[r.email.motivo || ""] || r.email.motivo || "Falha no envio", resultado: r }, { status: 502 });
    }
    return NextResponse.json({ ok: true, total: r.total, destinatarios: r.destinatarios, arquivos: r.arquivos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
