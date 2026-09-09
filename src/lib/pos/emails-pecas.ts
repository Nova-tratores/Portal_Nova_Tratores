// =============================================================================
// E-MAILS DE SEPARAÇÃO DE PEÇAS — pedido aprovado com data (checkbox de
// reserva → "Orçamento Aprovado") e com PEÇAS vinculadas (OS + PPV com itens):
//
//  1. Na APROVAÇÃO: e-mail pro Zezo e pro Danilo — "pedido aprovado pro dia X
//     com estas peças".
//  2. Na VÉSPERA às 15h (cron): RESPOSTA no mesmo e-mail pedindo pra separar
//     as peças. Serviço na segunda → o lembrete sai na SEXTA (nunca domingo).
//     Aprovou DEPOIS do horário do lembrete → a separação já sai na hora.
//
//  Só serviço COM peças: OS sem PPV/itens não manda; PPV sem OS também não.
//  Registro em pos_emails (migration sql/pos-emails-pecas.sql) + linha no
//  histórico da OS (logs_ppo). Tudo best-effort — nunca trava a fase.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "@/lib/dre-financeiro/email";

export const DESTINATARIOS_PECAS = ["zezo.piraju@gmail.com", "danilo.novatratores@gmail.com"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false } },
);

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmtBR = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

function agoraBRT(): Date {
  return new Date(Date.now() - 3 * 3600 * 1000); // aproximação BRT p/ comparação de datas/horas
}

/** Quando o lembrete de separação deve sair: véspera às 15h BRT; serviço na
 *  segunda → sexta às 15h; serviço no domingo → sexta também (domingo não envia). */
export function horarioLembrete(dataServico: string): Date {
  const dia = new Date(dataServico + "T12:00:00-03:00").getDay(); // 0=dom 1=seg
  let diasAntes = 1;
  if (dia === 1) diasAntes = 3; // segunda → sexta
  if (dia === 0) diasAntes = 2; // domingo → sexta
  const d = new Date(dataServico + "T15:00:00-03:00");
  d.setDate(d.getDate() - diasAntes);
  return d;
}

async function logNaOS(idOs: string, acao: string) {
  try {
    const agora = new Date();
    await supabase.from("logs_ppo").insert({
      Id_ppo: idOs,
      Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora),
      Hora_Acao: agora.toLocaleTimeString("pt-BR"),
      UsuEmail: "Sistema",
      acao,
      Status_Anterior: "", Status_Atual: "",
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });
  } catch { /* best-effort */ }
}

interface Peca { codigo: string; descricao: string; qtde: number }

/** Peças dos PPVs vinculados à OS (lista ID_PPV + Id_Os); vazio = sem peças. */
async function pecasDaOS(idOs: string): Promise<{ pecas: Peca[]; os: any } | null> {
  const { data: osRows } = await supabase
    .from("Ordem_Servico")
    .select("Id_Ordem, Os_Cliente, Os_Tecnico, Projeto, ID_PPV, Status, Previsao_Execucao")
    .eq("Id_Ordem", idOs).limit(1);
  const os = osRows?.[0];
  if (!os) return null;

  const ids = new Set(String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean));
  const { data: porIdOs } = await supabase.from("pedidos").select("id_pedido").eq("Id_Os", idOs);
  for (const p of porIdOs || []) { const id = String(p.id_pedido || "").trim(); if (id) ids.add(id); }
  if (!ids.size) return { pecas: [], os };

  const { data: movs } = await supabase
    .from("movimentacoes").select("CodProduto, Descricao, Qtde, TipoMovimento")
    .in("Id_PPV", [...ids]);
  const porCod = new Map<string, Peca>();
  for (const m of movs || []) {
    const cod = String(m.CodProduto || "").trim();
    if (!cod) continue;
    let q = Math.abs(Number(m.Qtde) || 0);
    if (String(m.TipoMovimento || "").toLowerCase().includes("devolu")) q = -q;
    const e = porCod.get(cod) || { codigo: cod, descricao: String(m.Descricao || "").trim(), qtde: 0 };
    e.qtde += q;
    if (!e.descricao && m.Descricao) e.descricao = String(m.Descricao).trim();
    porCod.set(cod, e);
  }
  return { pecas: [...porCod.values()].filter((p) => p.qtde > 0), os };
}

function tabelaPecas(pecas: Peca[]): string {
  const linhas = pecas.map((p) =>
    `<tr><td style="padding:5px 10px;border:1px solid #d8d2c6;font-family:monospace">${p.codigo}</td>` +
    `<td style="padding:5px 10px;border:1px solid #d8d2c6">${p.descricao || "—"}</td>` +
    `<td style="padding:5px 10px;border:1px solid #d8d2c6;text-align:center"><b>${p.qtde}</b></td></tr>`).join("");
  return `<table style="border-collapse:collapse;font-size:14px;margin:10px 0">` +
    `<tr style="background:#edeae4"><th style="padding:5px 10px;border:1px solid #d8d2c6">Código</th><th style="padding:5px 10px;border:1px solid #d8d2c6">Descrição</th><th style="padding:5px 10px;border:1px solid #d8d2c6">Qtde</th></tr>` +
    linhas + `</table>`;
}

async function registrar(idOs: string, tipo: string, assunto: string, corpo: string, messageId: string | undefined, dataServico: string) {
  try {
    await supabase.from("pos_emails").insert({
      id_ordem: idOs, tipo, para: DESTINATARIOS_PECAS.join(", "),
      assunto, corpo: corpo.slice(0, 8000), message_id: messageId || null,
      data_servico: dataServico || null,
    });
  } catch { /* migration pendente — segue só com o log da OS */ }
}

async function enviarSeparacao(idOs: string, dataServico: string, os: any, pecas: Peca[], aprovacao?: { message_id?: string; assunto?: string }) {
  const assunto = aprovacao?.assunto ? `Re: ${aprovacao.assunto.replace(/^re:\s*/i, "")}` : `Separar peças — OS ${idOs} (serviço ${fmtBR(dataServico)})`;
  const html =
    `<p>Bom dia! Serviço da <b>OS ${idOs}</b> está chegando: <b>${fmtBR(dataServico)}</b>.</p>` +
    `<p><b>Por favor, separar as peças abaixo:</b></p>` +
    tabelaPecas(pecas) +
    `<p style="font-size:12.5px;color:#666">Cliente: ${os.Os_Cliente || "—"} · Técnico: ${os.Os_Tecnico || "—"}${os.Projeto ? ` · ${os.Projeto}` : ""}</p>` +
    `<p style="font-size:12px;color:#999">E-mail automático do Portal Nova Tratores.</p>`;
  const r = await enviarEmail({
    to: DESTINATARIOS_PECAS, subject: assunto, html,
    fromNome: "Portal Nova Tratores — Peças",
    ...(aprovacao?.message_id ? { inReplyTo: aprovacao.message_id } : {}),
  });
  if (r.ok) {
    await registrar(idOs, "separacao", assunto, html, r.messageId, dataServico);
    await logNaOS(idOs, `E-mail de SEPARAÇÃO de peças enviado pro Zezo e Danilo (serviço ${fmtBR(dataServico)})`);
  }
  return r;
}

/** Chamado quando a OS entra em "Orçamento Aprovado" com data marcada. */
export async function processarAprovacao(idOs: string, dataServicoIn?: string): Promise<void> {
  try {
    const res = await pecasDaOS(idOs);
    if (!res) return;
    const { pecas, os } = res;
    if (!pecas.length) return; // só serviço, sem peças → não manda
    const dataServico = String(dataServicoIn || os.Previsao_Execucao || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataServico)) return; // sem data confirmada → não manda

    // já mandou aprovação pra esta OS+data? não duplica
    let jaTem: any = null;
    try {
      const { data } = await supabase.from("pos_emails").select("id, message_id, assunto, tipo")
        .eq("id_ordem", idOs).eq("data_servico", dataServico).order("id", { ascending: true });
      jaTem = data || [];
    } catch { jaTem = []; }
    const aprovAnterior = (jaTem || []).find((e: any) => e.tipo === "aprovacao");
    const sepAnterior = (jaTem || []).find((e: any) => e.tipo === "separacao");

    let aprovacao = aprovAnterior;
    if (!aprovAnterior) {
      const assunto = `Pedido aprovado — OS ${idOs} · serviço ${fmtBR(dataServico)} (${os.Os_Cliente || "cliente"})`;
      const html =
        `<p>O pedido da <b>OS ${idOs}</b> foi <b>APROVADO</b> e o serviço ficou agendado pra <b>${fmtBR(dataServico)}</b>.</p>` +
        `<p>Cliente: <b>${os.Os_Cliente || "—"}</b> · Técnico: ${os.Os_Tecnico || "—"}${os.Projeto ? ` · ${os.Projeto}` : ""}</p>` +
        `<p><b>Peças do pedido (ficam reservadas):</b></p>` +
        tabelaPecas(pecas) +
        `<p style="font-size:12px;color:#999">Na véspera do serviço mando o lembrete de separação neste mesmo e-mail. E-mail automático do Portal Nova Tratores.</p>`;
      const r = await enviarEmail({ to: DESTINATARIOS_PECAS, subject: assunto, html, fromNome: "Portal Nova Tratores — Peças" });
      if (!r.ok) { console.error(`[emails-pecas] aprovação ${idOs}: ${r.motivo || r.erro}`); return; }
      await registrar(idOs, "aprovacao", assunto, html, r.messageId, dataServico);
      await logNaOS(idOs, `E-mail de pedido APROVADO (serviço ${fmtBR(dataServico)}, ${pecas.length} peça(s)) enviado pro Zezo e Danilo`);
      aprovacao = { message_id: r.messageId, assunto };
    }

    // aprovou depois da hora do lembrete (véspera 15h; segunda → sexta 15h)
    // → a separação já sai na hora, respondendo o e-mail de aprovação
    if (!sepAnterior && Date.now() > horarioLembrete(dataServico).getTime()) {
      await enviarSeparacao(idOs, dataServico, os, pecas, aprovacao || undefined);
    }
  } catch (e) {
    console.error(`[emails-pecas] ${idOs} falhou (ignorado):`, e instanceof Error ? e.message : e);
  }
}

/** Cron diário das 15h BRT: manda a separação dos serviços que vencem. */
export async function processarLembretes(): Promise<{ enviados: number; detalhe: string[] }> {
  const hoje = agoraBRT();
  const diaSemana = hoje.getUTCDay(); // agoraBRT já deslocado → getUTCDay = dia BRT
  const detalhe: string[] = [];
  if (diaSemana === 0) return { enviados: 0, detalhe: ["domingo — não envia"] };

  const alvos: string[] = [];
  const addDias = (n: number) => {
    const d = new Date(hoje); d.setUTCDate(d.getUTCDate() + n);
    alvos.push(d.toISOString().slice(0, 10));
  };
  if (diaSemana === 5) { addDias(1); addDias(2); addDias(3); } // sexta cobre sáb/dom/seg
  else addDias(1);

  let aprovacoes: any[] = [];
  try {
    const { data } = await supabase.from("pos_emails")
      .select("id, id_ordem, tipo, data_servico, message_id, assunto")
      .in("data_servico", alvos);
    aprovacoes = data || [];
  } catch { return { enviados: 0, detalhe: ["tabela pos_emails ausente — rode a migration"] }; }

  const porOsData = new Map<string, { aprov?: any; sep?: any }>();
  for (const e of aprovacoes) {
    const k = `${e.id_ordem}|${e.data_servico}`;
    const g = porOsData.get(k) || {};
    if (e.tipo === "aprovacao" && !g.aprov) g.aprov = e;
    if (e.tipo === "separacao") g.sep = e;
    porOsData.set(k, g);
  }

  let enviados = 0;
  for (const [k, g] of porOsData) {
    if (!g.aprov || g.sep) continue;
    const [idOs, dataServico] = k.split("|");
    const res = await pecasDaOS(idOs);
    if (!res || !res.pecas.length) { detalhe.push(`${idOs}: sem peças (pulado)`); continue; }
    const { os, pecas } = res;
    if (["Cancelada", "Concluída"].includes(String(os.Status || ""))) { detalhe.push(`${idOs}: ${os.Status} (pulado)`); continue; }
    if (String(os.Previsao_Execucao || "").slice(0, 10) !== dataServico) { detalhe.push(`${idOs}: data mudou (pulado)`); continue; }
    const r = await enviarSeparacao(idOs, dataServico, os, pecas, g.aprov);
    if (r.ok) { enviados++; detalhe.push(`${idOs}: separação enviada (${dataServico})`); }
    else detalhe.push(`${idOs}: falhou (${r.motivo || r.erro})`);
  }
  return { enviados, detalhe };
}
