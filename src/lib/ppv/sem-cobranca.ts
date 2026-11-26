// =============================================
// PEÇA SEM COBRANÇA — servidor (PPV e OS)
//
// Marcar: o preço das movimentações da peça vai a 0 (assim TODAS as somas do
// portal — total do PPV, total da OS, mecânicos, garantias — já deixam de contar
// sozinhas) e o preço de antes + o motivo ficam em ppv_itens_sem_cobranca.
// Desmarcar: volta o preço guardado. Separar em remessa: tira as peças marcadas
// do pedido (Devolução) e cria um PPV novo do tipo Remessa com elas, no preço
// original (NF-e de remessa precisa de valor; remessa não gera conta a receber).
// =============================================

import { supabaseFetch, formatarDataBR } from "./supabase";
import { TBL_ITENS, TBL_PEDIDOS } from "./constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog, vincularPPVnaOS, gerarProximoId } from "./queries";
import { itensSemCobrancaAtivos, type SemCobrancaInfo } from "./sem-cobranca-regras";

export const TBL_SEM_COBRANCA = "ppv_itens_sem_cobranca";

type Linha = { id_ppv: string; cod_produto: string; motivo: string; preco_original: number | string; por?: string; em?: string };

/** Marcações de vários PPVs (tabela ainda não criada = nenhuma marcação). */
export async function semCobrancaDosPPVs(ids: string[]): Promise<Record<string, Record<string, SemCobrancaInfo>>> {
  const out: Record<string, Record<string, SemCobrancaInfo>> = {};
  const lista = Array.from(new Set(ids.map((s) => String(s || "").trim()).filter(Boolean)));
  if (!lista.length) return out;
  try {
    const linhas = await supabaseFetch<Linha[]>(
      `${TBL_SEM_COBRANCA}?id_ppv=in.(${lista.map((x) => `"${encodeURIComponent(x)}"`).join(",")})&select=*`
    );
    for (const l of linhas || []) {
      (out[l.id_ppv] ||= {})[l.cod_produto] = { motivo: l.motivo, precoOriginal: Number(l.preco_original) || 0, por: l.por, em: l.em };
    }
  } catch { /* tabela ainda não existe: segue sem marcações */ }
  return out;
}

export async function semCobrancaDoPPV(id: string): Promise<Record<string, SemCobrancaInfo>> {
  return (await semCobrancaDosPPVs([id]))[id] || {};
}

/** Quantas peças marcadas (com saldo) cada PPV tem — usado no faturamento da OS. */
export async function contarSemCobrancaAtivos(ids: string[]): Promise<Record<string, number>> {
  const marcas = await semCobrancaDosPPVs(ids);
  const out: Record<string, number> = {};
  for (const [id, porCod] of Object.entries(marcas)) {
    const cods = Object.keys(porCod);
    if (!cods.length) continue;
    const movs = await supabaseFetch<{ CodProduto?: string; TipoMovimento?: string; Qtde?: unknown }[]>(
      `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&select=CodProduto,TipoMovimento,Qtde`
    ).catch(() => []);
    const saldo: Record<string, number> = {};
    for (const m of movs || []) {
      const cod = String(m.CodProduto || "");
      if (!porCod[cod]) continue;
      const q = parseFloat(String(m.Qtde ?? 0).replace(",", ".")) || 0;
      saldo[cod] = (saldo[cod] || 0) + (/devolu/i.test(String(m.TipoMovimento || "")) ? -q : q);
    }
    const n = Object.values(saldo).filter((s) => s > 0.0005).length;
    if (n) out[id] = n;
  }
  return out;
}

async function lerPedido(id: string) {
  const r = await supabaseFetch<Record<string, unknown>[]>(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(id)}&limit=1`);
  return r?.[0] || null;
}

function bloqueioDeEdicao(p: Record<string, unknown>): string | null {
  if (/cancel/i.test(String(p.status || ""))) return "Este pedido está cancelado.";
  if (p.faturado_omie_em) return "Este pedido já foi faturado — não dá mais para mudar a cobrança das peças.";
  if (/remessa/i.test(String(p.Tipo_Pedido || ""))) return "Remessa já não gera cobrança — não precisa marcar.";
  return null;
}

export async function marcarSemCobranca(a: { id: string; codigo: string; motivo: string; por: string }): Promise<{ erro?: string }> {
  const motivo = a.motivo.trim();
  if (!motivo) return { erro: "Diga por que a peça não vai ser cobrada." };
  const p = await lerPedido(a.id);
  if (!p) return { erro: "Pedido não encontrado." };
  const bloq = bloqueioDeEdicao(p);
  if (bloq) return { erro: bloq };

  const filtro = `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(a.id)}&CodProduto=eq.${encodeURIComponent(a.codigo)}`;
  const ja = (await semCobrancaDoPPV(a.id))[a.codigo];
  if (ja) {
    // já marcada: só troca o motivo
    await supabaseFetch(`${TBL_SEM_COBRANCA}?id_ppv=eq.${encodeURIComponent(a.id)}&cod_produto=eq.${encodeURIComponent(a.codigo)}`, "PATCH", { motivo, por: a.por });
  } else {
    const movs = await supabaseFetch<{ Preco?: unknown }[]>(`${filtro}&select=Preco`);
    if (!movs?.length) return { erro: "Peça não encontrada neste pedido." };
    const precoOriginal = Math.max(...movs.map((m) => Number(m.Preco) || 0));
    // grava a marcação ANTES de zerar: se cair no meio, o preço de antes não se perde
    await supabaseFetch(TBL_SEM_COBRANCA, "POST", [{ id_ppv: a.id, cod_produto: a.codigo, motivo, preco_original: precoOriginal, por: a.por }]);
    await supabaseFetch(filtro, "PATCH", { Preco: 0 });
  }
  await atualizarValorTotal(a.id);
  await registrarLog(a.id, `Peça ${a.codigo} marcada como NÃO COBRADA — motivo: ${motivo}`, a.por);
  return {};
}

export async function desmarcarSemCobranca(a: { id: string; codigo: string; por: string }): Promise<{ erro?: string }> {
  const p = await lerPedido(a.id);
  if (!p) return { erro: "Pedido não encontrado." };
  if (p.faturado_omie_em) return { erro: "Este pedido já foi faturado." };
  const info = (await semCobrancaDoPPV(a.id))[a.codigo];
  if (!info) return {};
  await supabaseFetch(
    `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(a.id)}&CodProduto=eq.${encodeURIComponent(a.codigo)}`,
    "PATCH", { Preco: info.precoOriginal }
  );
  await supabaseFetch(`${TBL_SEM_COBRANCA}?id_ppv=eq.${encodeURIComponent(a.id)}&cod_produto=eq.${encodeURIComponent(a.codigo)}`, "DELETE");
  await atualizarValorTotal(a.id);
  await registrarLog(a.id, `Peça ${a.codigo} voltou a ser cobrada (R$ ${info.precoOriginal.toFixed(2)})`, a.por);
  return {};
}

/** Tira as peças marcadas do pedido e cria um PPV de Remessa (REM-xxxx) com elas. */
export async function separarSemCobrancaEmRemessa(a: { id: string; por: string }): Promise<{ novoId?: string; aviso?: string; erro?: string }> {
  const p = await lerPedido(a.id);
  if (!p) return { erro: "Pedido não encontrado." };
  const bloq = bloqueioDeEdicao(p);
  if (bloq) return { erro: bloq };
  const det = await buscarPPVPorId(a.id);
  if (!det) return { erro: "Pedido não encontrado." };
  const itens = itensSemCobrancaAtivos(det);
  if (!itens.length) return { erro: "Este pedido não tem peça marcada como não cobrada." };

  const novoId = await gerarProximoId("REM");
  const agora = formatarDataBR(new Date().toISOString(), true);
  const motivos = Array.from(new Set(itens.map((i) => i.info.motivo))).join("; ");
  await supabaseFetch(TBL_PEDIDOS, "POST", [{
    id_pedido: novoId, Tipo_Pedido: "Remessa", data: agora, status: "Aguardando",
    cliente: p.cliente, cliente_documento: p.cliente_documento ?? null, tecnico: p.tecnico,
    Id_Os: p.Id_Os ?? null, Projeto: p.Projeto ?? null, email_usuario: a.por,
    Motivo_Saida_Pedido: p.Motivo_Saida_Pedido ?? null,
    observacao: `Peças sem cobrança separadas do ${a.id}. Motivo: ${motivos}`,
    valor_total: 0,
  }]);

  const base = (tipo: string, ppv: string, i: (typeof itens)[number], preco: number) => ({
    Id: Math.floor(Math.random() * 9000000000) + 1000000000,
    Id_PPV: ppv, Data_Hora: agora, Tecnico: String(p.tecnico || ""), TipoMovimento: tipo,
    CodProduto: i.codigo, Descricao: i.descricao, Qtde: String(i.saldo), Preco: preco,
  });
  // 1º entra na remessa, depois sai do pedido: se cair no meio, a peça fica nos dois
  // (visível) em vez de sumir dos dois.
  await supabaseFetch(TBL_ITENS, "POST", itens.map((i) => base("Saída", novoId, i, i.info.precoOriginal)));
  await supabaseFetch(TBL_ITENS, "POST", itens.map((i) => base("Devolução", a.id, i, 0)));
  for (const i of itens) {
    await supabaseFetch(`${TBL_SEM_COBRANCA}?id_ppv=eq.${encodeURIComponent(a.id)}&cod_produto=eq.${encodeURIComponent(i.codigo)}`, "DELETE").catch(() => {});
  }

  const osId = String(p.Id_Os || "").trim();
  if (osId) await vincularPPVnaOS(osId, novoId);
  await atualizarValorTotal(novoId);
  await atualizarValorTotal(a.id);
  const lista = itens.map((i) => `${i.saldo}x ${i.codigo}`).join(", ");
  await registrarLog(a.id, `Peças sem cobrança separadas na remessa ${novoId}: ${lista}`, a.por);
  await registrarLog(novoId, `Remessa criada com as peças sem cobrança do ${a.id} (${lista}). Motivo: ${motivos}`, a.por);

  const aviso = p.pedido_omie
    ? `O pedido ${a.id} já estava no Omie com essas peças: na hora de faturar, a conferência vai mostrar a diferença — clique em atualizar o Omie.`
    : undefined;
  return { novoId, aviso };
}
