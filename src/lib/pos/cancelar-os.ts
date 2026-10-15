// Cancelar a OS ainda NÃO faturada (José, 15/10/2026): no Omie (CancelarOS) e no portal
// (fase Cancelada), com motivo. Opcional: cancelar junto os pedidos de venda da OS que
// ainda não foram faturados (CancelarPedidoVenda). OS faturada não cancela por aqui —
// para ela existe "Corrigir nota" (cancelar a NFS-e e refazer).
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import { omie as omiePorta } from "@/lib/omie/porta";
import { aplicarMudancaFase } from "@/lib/pos/fase";
import { cancelarPedidoVendaOmie } from "@/lib/ppv/omie";

type Rec = Record<string, unknown>;
const semZeros = (n: unknown) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");
const cred = () => { const { key, secret } = contaOmie("Nova Tratores"); return { appKey: key, appSecret: secret, rotulo: "Nova Tratores" }; };
const ler = <T,>(call: string, param: Rec) => omiePorta<T>(cred(), "/servicos/os/", call, param, { prioridade: "pessoa" });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function logOS(id: string, acao: string, usuario: string) {
  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: id, Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR"),
    UsuEmail: usuario, acao, Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  }).then(() => {}, () => {});
}

export interface ResultadoCancelarOS { ok: boolean; erro?: string; avisos?: string[]; pedidosCancelados?: string[] }

export async function cancelarOSNaoFaturada(idOrdem: string, opts: { motivo: string; cancelarPedidos: boolean; usuario: string }): Promise<ResultadoCancelarOS> {
  const motivo = String(opts.motivo || "").replace(/\s+/g, " ").trim();
  if (motivo.length < 5) return { ok: false, erro: "Escreva o motivo do cancelamento." };
  const { data: rows, error } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOrdem).limit(1);
  if (error) return { ok: false, erro: error.message };
  const os = rows?.[0] as Rec | undefined;
  if (!os) return { ok: false, erro: "OS não encontrada." };
  if (os.faturado_omie_em) return { ok: false, erro: "A OS já foi faturada — use \"Corrigir nota\" para cancelar a NFS-e e refazer." };
  if (/cancel/i.test(String(os.Status || ""))) return { ok: false, erro: "A OS já está cancelada." };
  const num = semZeros(os.Ordem_Omie);
  const avisos: string[] = [];

  // 1) Omie (se a OS foi enviada)
  if (num) {
    let nCodOS = Number(os.omie_ncodos || 0);
    if (!nCodOS) {
      try { nCodOS = Number((await ler<{ Cabecalho?: { nCodOS?: number } }>("ConsultarOS", { cNumOS: num })).Cabecalho?.nCodOS || 0); }
      catch (e) { return { ok: false, erro: `Não achei a OS ${num} no Omie: ${e instanceof Error ? e.message : e}` }; }
    }
    if (!nCodOS) return { ok: false, erro: `Não achei a OS ${num} no Omie.` };
    let st: { cFaturada?: string; cCancelada?: string };
    try { st = await ler("StatusOS", { nCodOS }); } catch (e) { return { ok: false, erro: `Não consegui ler a OS ${num} no Omie: ${e instanceof Error ? e.message : e}` }; }
    if (st.cFaturada === "S" && st.cCancelada !== "S") return { ok: false, erro: `A OS ${num} já está FATURADA no Omie — use "Corrigir nota". Nada foi cancelado.` };
    if (st.cCancelada !== "S") {
      try {
        await omiePorta(cred(), "/servicos/osp/", "CancelarOS", { nCodOS, cCancelarNfse: "N" }, { prioridade: "pessoa", gravacao: true, tentativas: 0, timeoutMs: 90_000 });
      } catch (e) { return { ok: false, erro: `O Omie não cancelou a OS ${num}: ${e instanceof Error ? e.message : e}. Nada mudou no portal.` }; }
      // o Omie leva alguns segundos para mostrar cancelada
      let viu = false;
      for (let i = 0; i < 4 && !viu; i++) {
        await espera(3000);
        try { viu = (await ler<{ cCancelada?: string }>("StatusOS", { nCodOS })).cCancelada === "S"; } catch { /* de novo */ }
      }
      if (!viu) avisos.push(`O Omie aceitou o cancelamento da OS ${num}, mas ainda não mostra como cancelada — confira em alguns minutos.`);
    }
  }

  // 2) pedidos de venda da OS ainda não faturados
  const pedidosCancelados: string[] = [];
  if (opts.cancelarPedidos) {
    const ids = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) {
      const { data: peds } = await supabase.from("pedidos").select("id_pedido, status, faturado_omie_em, Tipo_Pedido").in("id_pedido", ids);
      for (const p of (peds || []) as Rec[]) {
        const id = String(p.id_pedido);
        if (/cancel/i.test(String(p.status || ""))) continue;
        if (p.faturado_omie_em) { avisos.push(`${id} já foi faturado — não foi cancelado (cancele a NF-e pelo PPV).`); continue; }
        if (/remessa/i.test(String(p.Tipo_Pedido || ""))) { avisos.push(`${id} é remessa — cancele direto no Omie se precisar.`); continue; }
        const r = await cancelarPedidoVendaOmie(id, `OS ${num || idOrdem} cancelada: ${motivo}`, opts.usuario);
        if (r.sucesso) pedidosCancelados.push(id);
        else avisos.push(`${id}: não cancelou (${r.erro}).`);
      }
    }
  }

  // 3) portal: fase Cancelada + Pasta Clientes
  const fase = await aplicarMudancaFase(idOrdem, "Cancelada", opts.usuario, { acaoLog: `OS cancelada${num ? ` (no Omie: ${num})` : ""} — motivo: ${motivo}` });
  if (!fase.success) avisos.push(`A OS foi cancelada no Omie, mas o portal não mudou a fase (${fase.erro || "erro"}). Mude para Cancelada à mão.`);
  if (os.omie_ncodos) await supabase.from("portal_nt_clientes_os").update({ cancelada: true, status: "Cancelada" }).eq("cod_os", Number(os.omie_ncodos)).then(() => {}, () => {});
  await logOS(idOrdem, `Cancelamento: ${motivo}${pedidosCancelados.length ? ` · pedidos cancelados: ${pedidosCancelados.join(", ")}` : ""}`, opts.usuario);
  return { ok: true, avisos, pedidosCancelados };
}
