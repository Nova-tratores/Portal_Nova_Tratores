// E-mails automáticos de vencimento do Financeiro, no SERVIDOR (29/10/2026):
//  - rodarLembretes: antes de vencer (janela 0–5 dias), pulando o que o Omie já dá como RECEBIDO;
//  - rodarCobrancas: depois de vencer (D+1 e D+7) para título ATRASADO no Omie. ENVIA E-MAIL A
//    CLIENTES: só roda com FINANCEIRO_COBRANCA=on (e o agendamento nasce desligado).
// Os dois saem pelo e-mail de quem enviou o boleto, na MESMA conversa (In-Reply-To), e só para
// card cujo boleto foi enviado por e-mail (financeiro_emails). Regras puras em emails-vencimento.ts.
//
// Anti-repetição: a linha em financeiro_emails é gravada ANTES do envio (com o Message-ID já
// decidido); se a gravação falhar (ex.: o tipo 'cobranca' ainda não está no CHECK — rode
// sql/financeiro-cobranca-vencido.sql), NÃO envia. Se o envio falhar, a linha é apagada.
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/cripto";
import { enviarComCopia, type ContaEmail } from "@/lib/financeiro/email-conta";
import { formatarBRL, valorTotalCard, formatarDataBR, montarParcelas } from "@/lib/financeiro/parcelas";
import { buscarTitulos, hojeBR, podeRecobrar, somaDias } from "@/lib/financeiro/fases-automaticas";
import { horaBR } from "@/lib/datas/brasil";
import {
  htmlCobranca, parcelaParaCobranca, parcelasParaLembrete, parcelaPaga, quandoVence, vencimentosISO, type CardEmail,
} from "@/lib/financeiro/emails-vencimento";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type StatsEmails = { candidatos: number; enviados: number; semEnvioEmail: number; jaFeito: number; recebidosNoOmie?: number; erros: string[] };

function urlsDoCard(card: any): { boletos: string[]; nfs: string[] } {
  const boletos: string[] = [];
  String(card.anexo_boleto || "").split(",").forEach((u: string) => { const t = u.trim(); if (t) boletos.push(t); });
  ["anexo_boleto_2", "anexo_boleto_3"].forEach((k) => { const t = String(card[k] || "").trim(); if (t && !boletos.includes(t)) boletos.push(t); });
  const nfs = [
    ...String(card.anexo_nf_servico || "").split(",").map((u: string) => u.trim()).filter(Boolean),
    ...String(card.anexo_nf_peca || "").split(",").map((u: string) => u.trim()).filter(Boolean),
  ];
  return { boletos, nfs };
}

async function baixarAnexos(urls: string[]) {
  const anexos: { filename: string; content: Buffer }[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) continue;
      const limpo = url.split("?")[0];
      anexos.push({ filename: decodeURIComponent(limpo.substring(limpo.lastIndexOf("/") + 1)) || "anexo.pdf", content: buffer });
    } catch { /* pula anexo */ }
  }
  return anexos;
}

const nfDoGrupo = (card: any, filhos: any[]) => [card, ...filhos]
  .map((c: any) => [c.num_nf_servico && `S ${c.num_nf_servico}`, c.num_nf_peca && `P ${c.num_nf_peca}`].filter(Boolean).join(" / "))
  .filter(Boolean).join(" · ");

type Contexto = { original: { destinatarios: string; message_id: string | null; user_id: string }; cfg: ContaEmail & { senha_enc: string }; senha: string };

/** Último envio do BOLETO por e-mail (remetente, destinatários, conversa) + transporte de quem enviou. */
async function contextoEnvio(sb: SupabaseClient, cardId: number): Promise<Contexto | { motivo: "sem_email" | string }> {
  const { data: envios } = await sb.from("financeiro_emails")
    .select("de_email, destinatarios, message_id, user_id")
    .eq("chamado_id", cardId).eq("direcao", "enviado").eq("tipo", "boleto")
    .order("id", { ascending: false }).limit(1);
  const original = envios?.[0];
  if (!original?.destinatarios || !original.user_id) return { motivo: "sem_email" };
  const { data: cfg } = await sb.from("financeiro_envio_config")
    .select("email_envio, smtp_host, smtp_port, smtp_secure, senha_enc")
    .eq("user_id", original.user_id).maybeSingle();
  if (!cfg?.email_envio || !cfg?.senha_enc) return { motivo: "remetente sem config de e-mail" };
  return { original, cfg, senha: decrypt(cfg.senha_enc) };
}

/** Grava a linha ANTES de enviar; envia; se falhar, apaga a linha. */
async function enviarRegistrando(sb: SupabaseClient, ctx: Contexto, reg: Record<string, unknown>, mail: { subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }) {
  const dominio = String(ctx.cfg.email_envio).split("@")[1] || "novatratores.com.br";
  const messageId = `<${randomUUID()}@${dominio}>`;
  const { data: linha, error } = await sb.from("financeiro_emails").insert({
    ...reg, direcao: "enviado", de_email: ctx.cfg.email_envio, destinatarios: ctx.original.destinatarios,
    assunto: mail.subject, corpo: mail.html, message_id: messageId, user_id: ctx.original.user_id,
  }).select("id").single();
  if (error || !linha) throw new Error(`não gravou o registro do e-mail (nada enviado): ${error?.message || "sem retorno"}`);
  try {
    await enviarComCopia(ctx.cfg, ctx.senha, {
      from: `"Nova Tratores" <${ctx.cfg.email_envio}>`,
      to: ctx.original.destinatarios,
      subject: mail.subject, html: mail.html, attachments: mail.attachments || [], messageId,
      ...(ctx.original.message_id ? { inReplyTo: ctx.original.message_id, references: ctx.original.message_id } : {}),
    });
  } catch (e) {
    await sb.from("financeiro_emails").delete().eq("id", linha.id);
    throw e;
  }
}

async function filhosDe(sb: SupabaseClient, ids: number[]): Promise<Map<number, any[]>> {
  const m = new Map<number, any[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("Chamado_NF").select("*").in("grupo_pai_id", ids.slice(i, i + 200));
    for (const f of data || []) m.set(f.grupo_pai_id, [...(m.get(f.grupo_pai_id) || []), f]);
  }
  return m;
}

/** Lembrete antes de vencer (0–5 dias). Um vencimento por card por rodada (o próximo sai na seguinte). */
export async function rodarLembretes(sb: SupabaseClient, agora = new Date()): Promise<StatsEmails & { janela: string }> {
  const hoje = hojeBR(agora);
  const saudacao = horaBR(agora) < 12 ? "Bom dia" : "Boa tarde";
  const stats: StatsEmails & { janela: string } = { janela: hoje, candidatos: 0, enviados: 0, semEnvioEmail: 0, jaFeito: 0, recebidosNoOmie: 0, erros: [] };
  const { data: lidos, error } = await sb.from("Chamado_NF").select("*").eq("status", "aguardando_vencimento").is("grupo_pai_id", null);
  if (error) throw new Error(`Chamado_NF: ${error.message}`);
  const cards = (lidos || []) as CardEmail[];
  const filhos = await filhosDe(sb, cards.map((c) => c.id));
  // primeiro filtro barato (sem Omie): tem vencimento na janela, sem comprovante
  const naJanela = cards.filter((c) => parcelasParaLembrete(c, hoje, new Set(), [], []).length > 0);
  const titulos = await buscarTitulos(sb, naJanela.flatMap((c) => [c, ...(filhos.get(c.id) || [])]));

  for (const card of naJanela) {
    try {
      const fs = filhos.get(card.id) || [];
      const { data: jaTem } = await sb.from("financeiro_emails").select("venc_ref").eq("chamado_id", card.id).eq("tipo", "lembrete");
      const lembrados = new Set((jaTem || []).map((r: any) => String(r.venc_ref || "").slice(0, 10)));
      const semOmie = parcelasParaLembrete(card, hoje, lembrados, [], fs);
      const vencs = parcelasParaLembrete(card, hoje, lembrados, titulos, fs);
      if (!semOmie.length) { stats.jaFeito++; continue; }
      if (!vencs.length) { stats.recebidosNoOmie = (stats.recebidosNoOmie || 0) + 1; continue; }
      stats.candidatos++;
      const alvo = vencs[0];
      const ctx = await contextoEnvio(sb, card.id);
      if ("motivo" in ctx) { if (ctx.motivo === "sem_email") stats.semEnvioEmail++; else stats.erros.push(`#${card.id}: ${ctx.motivo}`); continue; }

      const nf = nfDoGrupo(card, fs);
      const cliente = String(card.nom_cliente || "").replace(/[<>&"']/g, "");
      const qtd = parseInt(String(card.qtd_parcelas)) || 1;
      let bloco: string;
      if (qtd <= 1) {
        const total = valorTotalCard(card);
        bloco = `<p>${total != null ? `Valor: <strong>${formatarBRL(total)}</strong><br>` : ""}Vencimento: <strong>${formatarDataBR(alvo.iso)}</strong></p>`;
      } else {
        const parcelas = montarParcelas(card);
        const p = parcelas.find((x: any) => x.n === alvo.n);
        const isoDe = new Map(vencimentosISO(card).map((v) => [v.n, v.iso]));
        const futuras = parcelas.filter((x: any) => !parcelaPaga(card, x.n) && x.n !== alvo.n && (isoDe.get(x.n) || "") > alvo.iso);
        bloco = p ? `<p><strong>${p.n}ª parcela</strong> — vencimento <strong>${p.data}</strong>${p.valor ? ` — <strong>${p.valor}</strong>` : ""}</p>` : "";
        if (futuras.length) bloco += `<p style="color:#666;font-size:13px">(parcelas seguintes: ${futuras.map((x: any) => `${x.n}ª — ${x.data}${x.valor ? ` — ${x.valor}` : ""}`).join(" · ")})</p>`;
      }
      const subject = `Lembrete de vencimento${nf ? ` - NF ${nf}` : ""}${cliente ? ` - ${cliente}` : ""}`;
      const html = `
<p>${saudacao}${cliente ? `, <strong>${cliente}</strong>` : ""}.</p>
<p>Passando apenas para lembrar que o ${qtd > 1 ? "pagamento abaixo" : "boleto abaixo"} ${quandoVence(alvo.dias)}:</p>
${bloco}
<p>Para facilitar, reenviamos em anexo o boleto e as notas fiscais.</p>
<p>Se o pagamento já foi realizado, por favor desconsidere esta mensagem — e agradecemos!</p>
<p>Qualquer dúvida estamos à disposição.</p>
<p>Nova Tratores<br>&nbsp;&nbsp;&nbsp;Financeiro / Pós-Vendas</p>`;
      const { boletos, nfs } = urlsDoCard(card);
      for (const f of fs) {
        const extra = urlsDoCard(f);
        extra.boletos.forEach((u) => { if (!boletos.includes(u)) boletos.push(u); });
        extra.nfs.forEach((u) => { if (!nfs.includes(u)) nfs.push(u); });
      }
      const attachments = await baixarAnexos([...boletos, ...nfs]);
      await enviarRegistrando(sb, ctx, { chamado_id: card.id, tipo: "lembrete", venc_ref: alvo.iso, parcela_n: qtd > 1 ? alvo.n : null }, { subject, html, attachments });
      stats.enviados++;
    } catch (e) {
      stats.erros.push(`#${card.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return stats;
}

export const cobrancaLigada = () => process.env.FINANCEIRO_COBRANCA === "on";

/** Cobrança depois do vencimento (D+1 e D+7) para título ATRASADO no Omie. Só com FINANCEIRO_COBRANCA=on. */
export async function rodarCobrancas(sb: SupabaseClient, agora = new Date()): Promise<(StatsEmails & { hoje: string }) | { pulado: string }> {
  if (!cobrancaLigada()) return { pulado: "desligado (só com FINANCEIRO_COBRANCA=on)" };
  const hoje = hojeBR(agora);
  const saudacao = horaBR(agora) < 12 ? "Bom dia" : "Boa tarde";
  const stats: StatsEmails & { hoje: string } = { hoje, candidatos: 0, enviados: 0, semEnvioEmail: 0, jaFeito: 0, erros: [] };
  const { data: lidos, error } = await sb.from("Chamado_NF").select("*").in("status", ["vencido", "aguardando_vencimento"]).is("grupo_pai_id", null);
  if (error) throw new Error(`Chamado_NF: ${error.message}`);
  const cards = (lidos || []) as CardEmail[];
  // só quem tem parcela vencida há 1–13 dias sem comprovante
  const desde = somaDias(hoje, -13);
  // não se recobra: sem boleto gerado, Pix/cartão/cheque ou vencido há mais de 180 dias (podeRecobrar)
  const vencidos = cards.filter((c) => podeRecobrar(c, hoje).ok).filter((c) => vencimentosISO(c).some((v) => v.iso < hoje && v.iso >= desde && !parcelaPaga(c, v.n)));
  const filhos = await filhosDe(sb, vencidos.map((c) => c.id));
  const titulos = await buscarTitulos(sb, vencidos.flatMap((c) => [c, ...(filhos.get(c.id) || [])]));

  for (const card of vencidos) {
    try {
      const fs = filhos.get(card.id) || [];
      const { data: ja } = await sb.from("financeiro_emails").select("venc_ref, criado_em").eq("chamado_id", card.id).eq("tipo", "cobranca");
      const enviadas = new Map<string, string[]>();
      for (const r of (ja || []) as any[]) {
        const k = String(r.venc_ref || "").slice(0, 10);
        enviadas.set(k, [...(enviadas.get(k) || []), hojeBR(new Date(r.criado_em))]);
      }
      const alvo = parcelaParaCobranca(card, hoje, enviadas, titulos, fs);
      if (!alvo) { stats.jaFeito++; continue; }
      stats.candidatos++;
      const ctx = await contextoEnvio(sb, card.id);
      if ("motivo" in ctx) { if (ctx.motivo === "sem_email") stats.semEnvioEmail++; else stats.erros.push(`#${card.id}: ${ctx.motivo}`); continue; }
      const qtd = parseInt(String(card.qtd_parcelas)) || 1;
      const nf = nfDoGrupo(card, fs);
      const cliente = String(card.nom_cliente || "").replace(/[<>&"']/g, "");
      const parcela = qtd > 1 ? montarParcelas(card).find((x: any) => x.n === alvo.n) : null;
      const total = valorTotalCard(card);
      const valor = parcela ? parcela.valor : total != null ? formatarBRL(total) : "";
      const html = htmlCobranca({ saudacao, cliente, etapa: alvo.etapa, vencBR: formatarDataBR(alvo.iso), valor, parcela: qtd > 1 ? alvo.n : undefined, nf });
      const subject = `Boleto em aberto${nf ? ` - NF ${nf}` : ""}${cliente ? ` - ${cliente}` : ""}`;
      await enviarRegistrando(sb, ctx, { chamado_id: card.id, tipo: "cobranca", venc_ref: alvo.iso, parcela_n: qtd > 1 ? alvo.n : null }, { subject, html });
      stats.enviados++;
    } catch (e) {
      stats.erros.push(`#${card.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return stats;
}
