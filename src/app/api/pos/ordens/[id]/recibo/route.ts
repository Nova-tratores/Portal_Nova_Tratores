// Recibo de Prestação de Serviço da OS interna (José, 15/10/2026). O Omie gera o recibo
// (nº em StatusOS.cNumRecibo) mas a API não entrega o PDF — o portal monta o documento com
// os dados do Omie (serviços e total lidos na hora) para imprimir/salvar em PDF.
// Mesmo acesso da impressão da OS (/api/pos/ordens/[id]/print).
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import { omie } from "@/lib/omie/porta";
import { PORTAL_BASE } from "@/lib/portal-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sem0 = (s: unknown) => String(s ?? "").replace(/^0+(?=\d)/, "");

interface OSOmie {
  Cabecalho?: { cNumOS?: string; nValorTotal?: number };
  InfoCadastro?: { dDtFat?: string; cFaturada?: string };
  InformacoesAdicionais?: { cNumRecibo?: string; cNumContrato?: string; cDadosAdicNF?: string };
  ServicosPrestados?: Array<{ cDescServ?: string; cCodigo?: string; nQtde?: number; nValUnit?: number; nValorDesconto?: number }>;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", id).limit(1);
  const os = data?.[0] as Record<string, unknown> | undefined;
  if (!os) return new NextResponse("OS não encontrada.", { status: 404 });
  if (!os.omie_ncodos && !os.Ordem_Omie) return new NextResponse("A OS ainda não está no Omie.", { status: 400 });

  let o: OSOmie = {};
  try {
    const { key, secret } = contaOmie("Nova Tratores");
    o = await omie<OSOmie>({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, "/servicos/os/", "ConsultarOS",
      os.omie_ncodos ? { nCodOS: Number(os.omie_ncodos) } : { cNumOS: sem0(os.Ordem_Omie) }, { prioridade: "pessoa" });
  } catch (e) {
    return new NextResponse(`Não consegui ler a OS no Omie: ${e instanceof Error ? e.message : e}`, { status: 503 });
  }
  const recibo = sem0(o.InformacoesAdicionais?.cNumRecibo || os.recibo_numero || "");
  if (!recibo || recibo === "0") return new NextResponse("Esta OS ainda não tem recibo no Omie (fature com recibo primeiro).", { status: 404 });

  const itens = (o.ServicosPrestados || []).map((s) => {
    const q = Number(s.nQtde || 0), u = Number(s.nValUnit || 0), d = Number(s.nValorDesconto || 0);
    const texto = String(s.cDescServ || "").replace(/\|/g, "\n");
    const sol = s.cCodigo === "sol.aber.os" || u <= 0.01;
    return { desc: sol ? texto.split("\n").filter(Boolean).slice(0, 6).join("\n") : (texto.split("\n")[0] || "Serviço"), q, u, total: Math.max(0, q * u - d), sol };
  });
  const total = Number(o.Cabecalho?.nValorTotal || itens.reduce((t, i) => t + i.total, 0));
  const numOS = sem0(o.Cabecalho?.cNumOS || os.Ordem_Omie);
  const dataFat = o.InfoCadastro?.dDtFat || (os.faturado_omie_em ? new Date(String(os.faturado_omie_em)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

  const linhas = itens.map((i) => i.sol
    ? `<tr><td colspan="4" class="sol">${esc(i.desc).replace(/\n/g, "<br>")}</td></tr>`
    : `<tr><td>${esc(i.desc)}</td><td class="n">${i.q.toLocaleString("pt-BR")}</td><td class="n">${brl(i.u)}</td><td class="n">${brl(i.total)}</td></tr>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo ${esc(recibo)} - OS ${esc(numOS)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 24px; background: #fff; font-size: 11pt; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #4B5563; padding-bottom: 12px; }
  .topo img { height: 46px; }
  .doc { text-align: right; }
  .doc .t { font-size: 8pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #4B5563; }
  .doc .n { font-size: 20pt; font-weight: 900; color: #111827; }
  .doc .d { font-size: 9pt; color: #4B5563; margin-top: 2px; }
  h2 { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #4B5563; border-bottom: 1px solid #D1D5DB; padding-bottom: 3px; margin: 18px 0 8px; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
  .l { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #6B7280; }
  .v { font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; font-size: 7.5pt; text-transform: uppercase; color: #6B7280; border-bottom: 1px solid #D1D5DB; padding: 5px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  td.sol { font-size: 9pt; color: #374151; background: #F9FAFB; }
  .total { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2.5px solid #4B5563; margin-top: 12px; padding-top: 10px; }
  .total .lbl { font-weight: 800; text-transform: uppercase; color: #4B5563; font-size: 9pt; letter-spacing: 1px; }
  .total .val { font-size: 20pt; font-weight: 900; }
  .aviso { margin-top: 14px; padding: 10px 12px; border: 1px solid #D1D5DB; background: #F9FAFB; font-size: 9.5pt; color: #374151; }
  .decl { margin-top: 18px; font-size: 10.5pt; line-height: 1.6; }
  .ass { margin-top: 46px; display: flex; justify-content: center; }
  .ass div { border-top: 1px solid #111827; width: 280px; text-align: center; padding-top: 4px; font-size: 9pt; }
  .rodape { margin-top: 26px; font-size: 8pt; color: #9CA3AF; text-align: center; }
  .barra { position: fixed; top: 10px; right: 10px; }
  .barra button { background: #4B5563; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; }
  @media print { .barra { display: none; } body { padding: 0; } }
</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
<div class="topo">
  <img src="${PORTAL_BASE}/Logo_Nova.png" alt="Nova Tratores">
  <div class="doc"><div class="t">Recibo de Prestação de Serviço</div><div class="n">Nº ${esc(recibo)}</div><div class="d">OS nº ${esc(numOS)} · ${esc(os.Id_Ordem)}${dataFat ? ` · ${esc(dataFat)}` : ""}</div></div>
</div>
<h2>Cliente</h2>
<div class="grade">
  <div><div class="l">Nome</div><div class="v">${esc(os.Os_Cliente)}</div></div>
  <div><div class="l">CPF / CNPJ</div><div class="v">${esc(os.Cnpj_Cliente)}</div></div>
  <div style="grid-column: span 2"><div class="l">Endereço</div><div class="v">${esc(os.Endereco_Cliente)}</div></div>
</div>
<h2>Serviço</h2>
<div class="grade">
  <div><div class="l">Projeto / Equipamento</div><div class="v">${esc(os.Projeto || "—")}</div></div>
  <div><div class="l">Técnico</div><div class="v">${esc(os.Os_Tecnico || "—")}</div></div>
  <div><div class="l">Nº do Contrato de Venda</div><div class="v">${esc(o.InformacoesAdicionais?.cNumContrato || "—")}</div></div>
  <div><div class="l">Tipo</div><div class="v">${esc(os.Tipo_Servico || "—")}</div></div>
</div>
<h2>Itens</h2>
<table><thead><tr><th>Descrição</th><th class="n">Qtde</th><th class="n">Unitário</th><th class="n">Total</th></tr></thead><tbody>${linhas}</tbody></table>
<div class="total"><span class="lbl">Valor total</span><span class="val">${brl(total)}</span></div>
<div class="aviso">Ordem de serviço <b>interna</b> — não gera cobrança nem conta a receber. Este recibo substitui a NFS-e.</div>
<div class="decl">Declaramos que os serviços descritos acima foram prestados pela <b>Nova Tratores Máquinas Agrícolas Ltda.</b>, no valor total de <b>${brl(total)}</b>.</div>
<div class="ass"><div>Nova Tratores Máquinas Agrícolas Ltda.</div></div>
<div class="rodape">Recibo nº ${esc(recibo)} gerado no Omie · documento montado pelo Portal Nova Tratores</div>
</body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
