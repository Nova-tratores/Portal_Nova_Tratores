import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";

// Relatório do técnico montado NO SERVIDOR, a partir de Ordem_Servico_Tecnicos.
//
// Por que existe: o app dos mecânicos gera o PDF no CELULAR do técnico e só então grava
// o ID_Relatorio_Final na OS. Quando essa geração falha (foto que não baixou, memória,
// conexão), o relatório fica salvo na tabela mas sem PDF — e o POS não tinha o que abrir.
// Aqui o relatório é renderizado direto dos dados, então sempre funciona. É HTML pronto
// pra impressão (Ctrl+P → Salvar como PDF).

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
const temValor = (v: unknown) => !!String(v ?? "").trim();
const dataBR = (d: unknown) => {
  const s = String(d ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: osRows } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", id).limit(1);
  const os = osRows?.[0] as Record<string, unknown> | undefined;

  // Pode haver mais de um registro (rascunhos). Pega o ENVIADO mais recente.
  const { data: rels } = await supabase.from("Ordem_Servico_Tecnicos").select("*").eq("Ordem_Servico", id);
  const lista = (rels || []) as Record<string, unknown>[];
  const r = lista.find((x) => String(x.Status || "").toLowerCase() === "enviado")
    || [...lista].sort((a, b) => Number(b.IdOs || 0) - Number(a.IdOs || 0))[0];

  if (!r) {
    return new NextResponse(`<html><body style="font-family:Inter,sans-serif;padding:40px">
      <h2>Sem relatório do técnico</h2>
      <p>A OS <b>${esc(id)}</b> ainda não tem relatório preenchido no app dos mecânicos.</p>
    </body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // ── Blocos de data/hora/km (o app permite até 3) ──
  const blocos = [
    { d: r.DataInicio, hi: r.InicioHora, hf: r.FinalHora, ki: r.InicioKm, kf: r.FinalKm },
    { d: r.DataInicio2, hi: r.InicioHora2, hf: r.FinalHora2, ki: r.InicioKm2, kf: r.FinalKm2 },
    { d: r.DataInicio3, hi: r.InicioHora3, hf: r.FinaHora3, ki: r.InicioKm3, kf: r.FinalKm3 },
  ].filter((b) => temValor(b.d) || temValor(b.hi));

  const linhasData = blocos.map((b, i) => `
    <tr>
      <td>${i + 1}º dia</td>
      <td>${esc(dataBR(b.d))}</td>
      <td>${esc(b.hi) || "—"} às ${esc(b.hf) || "—"}</td>
      <td>${esc(b.ki) || "—"} → ${esc(b.kf) || "—"}</td>
    </tr>`).join("");

  // ── Peças ──
  let pecas: Record<string, unknown>[] = [];
  try {
    const p = typeof r.PecasInfo === "string" ? JSON.parse(r.PecasInfo as string) : r.PecasInfo;
    if (Array.isArray(p)) pecas = p;
  } catch { /* ignora */ }
  const linhasPecas = pecas.map((p) => {
    const dev = p.devolvida || p.naoUsada;
    return `<tr>
      <td>${esc(p.codigo)}</td>
      <td>${esc(p.descricao)}</td>
      <td style="text-align:center">${esc(p.qtdUsada ?? "—")}</td>
      <td style="text-align:center">${dev ? `<b style="color:#B45309">Devolvida${p.qtdDevolvida ? ` (${esc(p.qtdDevolvida)})` : ""}</b>` : "Usada"}</td>
    </tr>`;
  }).join("");

  // ── Fotos ──
  const fotos: [string, unknown][] = [
    ["Horímetro", r.FotoHorimetro], ["Chassis", r.FotoChassis],
    ["Frente", r.FotoFrente], ["Direita", r.FotoDireita], ["Esquerda", r.FotoEsquerda],
    ["Traseira", r.FotoTraseira], ["Volante", r.FotoVolante],
    ["Local 1", r.TratorLocal1], ["Local 2", r.TratorLocal2],
    ["Falha 1", r.FotoFalha1], ["Falha 2", r.FotoFalha2], ["Falha 3", r.FotoFalha3], ["Falha 4", r.FotoFalha4],
    ["Peça nova 1", r.FotoPecaNova1], ["Peça nova 2", r.FotoPecaNova2],
    ["Peça instalada 1", r.FotoPecaInstalada1], ["Peça instalada 2", r.FotoPecaInstalada2],
    ["Extra 1", r.FotoExtra1], ["Extra 2", r.FotoExtra2], ["Extra 3", r.FotoExtra3],
    ["Extra 4", r.FotoExtra4], ["Extra 5", r.FotoExtra5],
  ];
  const fotosHTML = fotos.filter(([, u]) => temValor(u)).map(([lbl, u]) =>
    `<figure><img src="${esc(u)}" /><figcaption>${esc(lbl)}</figcaption></figure>`).join("");

  // ── Almoços ──
  let almocos: Record<string, unknown>[] = [];
  try {
    const a = typeof r.AlmocosFotos === "string" ? JSON.parse(r.AlmocosFotos as string) : r.AlmocosFotos;
    if (Array.isArray(a)) almocos = a;
  } catch { /* ignora */ }
  const almocosHTML = almocos.filter((a) => temValor(a.foto)).map((a) =>
    `<figure><img src="${esc(a.foto)}" /><figcaption>Almoço ${esc(dataBR(a.data))}</figcaption></figure>`).join("");

  const campo = (lbl: string, val: unknown) => temValor(val)
    ? `<div class="f"><span class="f-lbl">${esc(lbl)}</span><span class="f-val">${esc(val)}</span></div>` : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório do Técnico — ${esc(id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #111; margin: 0; padding: 28px 34px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #B91C1C; padding-bottom:12px; margin-bottom:18px; }
  .head h1 { margin:0; font-size:20px; }
  .head .sub { color:#6B7280; font-size:13px; margin-top:3px; }
  .aviso { background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; padding:8px 12px; border-radius:8px; font-size:12px; margin-bottom:16px; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#B91C1C; border-bottom:1px solid #FECACA; padding-bottom:4px; margin:20px 0 10px; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px 16px; }
  .f { padding:7px 10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:7px; }
  .f-lbl { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#6B7280; font-weight:700; }
  .f-val { font-size:13px; font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th { text-align:left; background:#F3F4F6; padding:7px 9px; font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
  td { padding:7px 9px; border-bottom:1px solid #eee; }
  .texto { padding:12px 14px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; font-size:13px; line-height:1.6; white-space:pre-wrap; }
  .fotos { display:flex; flex-wrap:wrap; gap:12px; }
  figure { margin:0; width:170px; }
  figure img { width:100%; height:130px; object-fit:cover; border:1px solid #E5E7EB; border-radius:8px; }
  figcaption { font-size:10px; color:#6B7280; text-align:center; margin-top:3px; }
  .ass { display:flex; gap:30px; margin-top:8px; }
  .ass div { flex:1; text-align:center; }
  .ass img { max-height:90px; max-width:100%; }
  .ass .linha { border-top:1px solid #111; margin-top:4px; padding-top:4px; font-size:11px; color:#374151; }
  @media print { body { padding:0; } .noprint { display:none; } }
</style></head><body>

<div class="head">
  <div>
    <h1>Relatório do Técnico — ${esc(id)}</h1>
    <div class="sub">${esc(os?.Os_Cliente)} · Técnico: ${esc(r.TecResp1 || os?.Os_Tecnico)}${temValor(r.TecResp2) ? ` e ${esc(r.TecResp2)}` : ""}</div>
  </div>
  <button class="noprint" onclick="window.print()" style="padding:9px 16px;border:none;border-radius:8px;background:#B91C1C;color:#fff;font-weight:700;cursor:pointer">Imprimir / Salvar PDF</button>
</div>

${!temValor(os?.ID_Relatorio_Final) ? `<div class="aviso">
  Este relatório foi montado a partir dos dados enviados pelo técnico no app. O PDF gerado no
  celular não chegou a ser salvo — o conteúdo abaixo é o mesmo. Use <b>Imprimir / Salvar PDF</b>.
</div>` : ""}

<h2>Dados do Serviço</h2>
<div class="grid">
  ${campo("Responsável", r.NomResp)}
  ${campo("Tipo de Serviço", r.TipoServico)}
  ${campo("Revisão", r.TipoRev)}
  ${campo("Marca / Modelo", [r.Marca, r.Modelo].filter(temValor).join(" "))}
  ${campo("Chassis", r.Chassis)}
  ${campo("Horímetro", r.Horimetro)}
  ${campo("Fazenda", r.Fazenda)}
  ${campo("Cidade", r.Cidade)}
  ${campo("Veículo", r.NumPlaca)}
  ${campo("Total de Horas", r.TotalHora)}
  ${campo("Total de KM", r.TotalKm)}
  ${campo("Garantia", r.Garantia ? "Sim" : "")}
</div>

${linhasData ? `<h2>Datas, Horas e KM</h2>
<table><thead><tr><th>Dia</th><th>Data</th><th>Horário</th><th>KM (início → fim)</th></tr></thead>
<tbody>${linhasData}</tbody></table>` : ""}

${temValor(r.Motivo) ? `<h2>Solicitação do Cliente</h2><div class="texto">${esc(r.Motivo)}</div>` : ""}
${temValor(r.ServicoRealizado) ? `<h2>Serviço Realizado</h2><div class="texto">${esc(r.ServicoRealizado)}</div>` : ""}
${temValor(r.JustificativaAtraso) ? `<h2>Justificativa de Atraso</h2><div class="texto">${esc(r.JustificativaAtraso)}</div>` : ""}
${temValor(r.JustificativaPecaExtra) ? `<h2>Justificativa de Peça Extra</h2><div class="texto">${esc(r.JustificativaPecaExtra)}</div>` : ""}
${temValor(r.CartaCorrecao) ? `<h2>Carta de Correção</h2><div class="texto">${esc(r.CartaCorrecao)}</div>` : ""}

${linhasPecas ? `<h2>Peças</h2>
<table><thead><tr><th>Código</th><th>Descrição</th><th style="text-align:center">Qtd</th><th style="text-align:center">Situação</th></tr></thead>
<tbody>${linhasPecas}</tbody></table>` : ""}

${r.TemAlmoco || almocosHTML ? `<h2>Alimentação</h2>
${campo("Valor do almoço", r.ValorAlmoco)}
<div class="fotos">${almocosHTML || (temValor(r.FotoAlmoco) ? `<figure><img src="${esc(r.FotoAlmoco)}" /><figcaption>Nota do almoço</figcaption></figure>` : "")}</div>` : ""}

${fotosHTML ? `<h2>Fotos</h2><div class="fotos">${fotosHTML}</div>` : ""}

${temValor(r.AssTecnico) || temValor(r.AssCliente) ? `<h2>Assinaturas</h2>
<div class="ass">
  <div>${temValor(r.AssTecnico) ? `<img src="${esc(r.AssTecnico)}" />` : ""}<div class="linha">Técnico — ${esc(r.TecResp1 || os?.Os_Tecnico)}</div></div>
  <div>${temValor(r.AssCliente) ? `<img src="${esc(r.AssCliente)}" />` : ""}<div class="linha">Cliente — ${esc(r.NomResp)}</div></div>
</div>` : ""}

</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
