// Recobrança do Financeiro → card + TICKET no bloco do setor (SERVIDOR, service role).
// Regras puras em ./recobranca.ts. Chamado por POST /api/financeiro/recobranca.
//
// Fluxo: valida (podeRecobrar) → se já há ticket ABERTO desse card, devolve ele (não cria
// outro nem soma recobrança) → grava o card como as telas gravavam (status vencido, tarefa
// "Cobrar Cliente (Recobrança)", recombrancas_qtd+1) → garante o bloco "Cobranças — <setor>"
// → cria o ticket (rodízio do responsável, prazo hoje + 2 dias úteis) → audit_log.
//
// Ticket resolvido NÃO mexe no card (decisão do pedido de 29/10): quem cobrou anexa o
// comprovante no card e o robô de fases confere o Omie.
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { garantirParticipante, notificarTicket, registrarEvento } from "@/lib/tickets/server";
import type { Ticket } from "@/lib/tickets/constantes";
import { feriadosExtras, feriadosNacionais } from "@/lib/assistente/horario";
import {
  buscarTitulos, hojeBR, podeRecobrar, situacaoDosTitulos, titulosDoCard,
  type Situacao, type TituloOmie,
} from "./fases-automaticas";
import {
  COLUNA_INICIAL, COR_BLOCO, ROTULO_SETOR, descricaoRecobranca, escolherResponsavel, funcaoDoSetor,
  linkDoCard, nomeBlocoCobranca, setorDaRecobranca, somarDiasUteis, tituloRecobranca,
  type CardRecobranca, type Pessoa, type SetorRecobranca,
} from "./recobranca";

export class ErroRecobranca extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

/** Status do ticket que contam como "aberto" (ainda ninguém resolveu). */
const STATUS_FECHADOS = ["resolvido", "fechado", "cancelado"];
const PRAZO_DIAS_UTEIS = 2;

export type ResultadoRecobranca = {
  ticket: { id: string; numero: number; titulo: string };
  responsavel: Pessoa;
  bloco: string;
  /** true = já existia ticket aberto desse card; nada foi gravado agora. */
  jaExistia: boolean;
  recobrancas: number;
};

type Solicitante = { id: string; nome: string };

/** Ticket de recobrança ainda aberto para o card (idempotência). */
async function ticketAbertoDoCard(cardId: number): Promise<Ticket | null> {
  const { data } = await supabaseAdmin.from("tickets").select("*")
    .eq("payload->>origem", "recobranca_financeiro")
    .eq("payload->>chamado_nf_id", String(cardId))
    .not("status", "in", `(${STATUS_FECHADOS.join(",")})`)
    .order("created_at", { ascending: false }).limit(1);
  return ((data || [])[0] as Ticket) || null;
}

async function pessoasDoSetor(setor: SetorRecobranca): Promise<Pessoa[]> {
  const { data, error } = await supabaseAdmin.from("financeiro_usu").select("id, nome, funcao, ativo");
  if (error) throw new ErroRecobranca(`financeiro_usu: ${error.message}`, 500);
  return ((data || []) as { id: string; nome: string | null; funcao: string | null; ativo: boolean | null }[])
    .filter((u) => u.ativo !== false && funcaoDoSetor(u.funcao, setor))
    .map((u) => ({ id: u.id, nome: String(u.nome || "").trim() || "Sem nome" }));
}

/**
 * Bloco "Cobranças — <setor>": acha (não arquivado) ou cria. Privado com o setor inteiro de
 * integrante = "público para o setor" (admin vê tudo). Coluna inicial "A fazer". A cada
 * recobrança entra quem passou a ter a função (ninguém sai daqui).
 */
async function garantirBloco(setor: SetorRecobranca, pessoas: Pessoa[], criador: string): Promise<{ id: string; nome: string; colunaId: string | null }> {
  const nome = nomeBlocoCobranca(setor);
  const { data: achados, error } = await supabaseAdmin.from("tickets_quadros").select("id, nome")
    .eq("nome", nome).eq("arquivado", false).order("created_at").limit(1);
  if (error) throw new ErroRecobranca(`Blocos da Central de Trabalho indisponíveis (${error.message}).`, 500);
  let id = achados?.[0]?.id as string | undefined;
  if (!id) {
    const { data: q, error: eq } = await supabaseAdmin.from("tickets_quadros").insert({
      nome, cor: COR_BLOCO[setor], visibilidade: "privado", criado_por: criador,
      descricao: `Recobranças pedidas pelo Financeiro para o ${ROTULO_SETOR[setor]}. Cada ticket é um cliente a cobrar.`,
    }).select("id").single();
    if (eq || !q) throw new ErroRecobranca(`Não deu para criar o bloco: ${eq?.message || "?"}`, 500);
    id = q.id as string;
    await supabaseAdmin.from("tickets_quadro_colunas").insert(
      [COLUNA_INICIAL, "Fazendo", "Feito"].map((n, posicao) => ({ quadro_id: id, nome: n, posicao })));
  }
  // integrantes: o setor (upsert ignora quem já está)
  if (pessoas.length) {
    await supabaseAdmin.from("tickets_quadro_membros").upsert(
      pessoas.map((p) => ({ quadro_id: id, user_id: p.id, adicionado_por: criador })),
      { onConflict: "quadro_id,user_id", ignoreDuplicates: true });
  }
  const { data: cols } = await supabaseAdmin.from("tickets_quadro_colunas").select("id, nome, posicao")
    .eq("quadro_id", id).order("posicao");
  const lista = (cols || []) as { id: string; nome: string }[];
  const col = lista.find((c) => c.nome.trim().toLowerCase() === COLUNA_INICIAL.toLowerCase()) || lista[0];
  return { id: id!, nome, colunaId: col?.id || null };
}

/** Quantos tickets abertos cada pessoa tem no bloco (rodízio). */
async function abertosNoBloco(quadroId: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin.from("tickets").select("responsavel_id")
    .eq("quadro_id", quadroId).not("status", "in", `(${STATUS_FECHADOS.join(",")})`);
  const m = new Map<string, number>();
  for (const t of (data || []) as { responsavel_id: string }[]) m.set(t.responsavel_id, (m.get(t.responsavel_id) || 0) + 1);
  return m;
}

/** Situação no Omie (best-effort: sem contas_receber segue sem a linha). */
async function situacaoNoOmie(card: CardRecobranca): Promise<{ situacao: Situacao | null; titulos: TituloOmie[] }> {
  try {
    const todos = await buscarTitulos(supabaseAdmin, [card]);
    const meus = titulosDoCard(card, todos);
    return { situacao: situacaoDosTitulos(meus), titulos: meus };
  } catch {
    return { situacao: null, titulos: [] };
  }
}

const nomeDe = async (id: string) => {
  const { data } = await supabaseAdmin.from("financeiro_usu").select("nome").eq("id", id).maybeSingle();
  return String((data as { nome?: string } | null)?.nome || "").trim();
};

/** Faz a recobrança do card `cardId` pedida por `quem`. */
export async function recobrarCard(cardId: number, quem: Solicitante, opts: { moverParaVencido?: boolean } = {}): Promise<ResultadoRecobranca> {
  const moverParaVencido = opts.moverParaVencido !== false;
  const hoje = hojeBR();

  const { data: cardRow, error: eCard } = await supabaseAdmin.from("Chamado_NF").select("*").eq("id", cardId).maybeSingle();
  if (eCard) throw new ErroRecobranca(`Chamado_NF: ${eCard.message}`, 500);
  if (!cardRow) throw new ErroRecobranca("Card não encontrado.", 404);
  const card = cardRow as CardRecobranca;

  const setor = setorDaRecobranca(card);
  const bloco = nomeBlocoCobranca(setor);

  // Idempotência: já tem ticket aberto desse card → devolve ele, sem gravar nada.
  const existente = await ticketAbertoDoCard(cardId);
  if (existente) {
    return {
      ticket: { id: existente.id, numero: existente.numero, titulo: existente.titulo },
      responsavel: { id: existente.responsavel_id, nome: (await nomeDe(existente.responsavel_id)) || "responsável" },
      bloco, jaExistia: true, recobrancas: Number(card.recombrancas_qtd) || 0,
    };
  }

  const pode = podeRecobrar(card, hoje);
  if (!pode.ok) throw new ErroRecobranca(`Não dá para recobrar: ${pode.motivo || "regra do Financeiro"}.`, 409);

  const pessoas = await pessoasDoSetor(setor);
  if (!pessoas.length) throw new ErroRecobranca(`Ninguém ativo com a função ${ROTULO_SETOR[setor]} para receber a recobrança.`, 409);

  // 1) card, como as telas faziam (o .eq('status') evita sobrescrever quem mexeu agora)
  const numero = (Number(card.recombrancas_qtd) || 0) + 1;
  const upd: Record<string, unknown> = { tarefa: "Cobrar Cliente (Recobrança)", recombrancas_qtd: numero, setor: "Pós-Vendas" };
  if (moverParaVencido) upd.status = "vencido";
  const { data: gravou, error: eUpd } = await supabaseAdmin.from("Chamado_NF").update(upd)
    .eq("id", cardId).eq("status", card.status).select("id");
  if (eUpd) throw new ErroRecobranca(`Erro ao gravar o card: ${eUpd.message}`, 500);
  if (!gravou?.length) throw new ErroRecobranca("Alguém mudou este card agora — recarregue e tente de novo.", 409);
  // filhos de grupo acompanham o pai na fase
  if (moverParaVencido && !card.grupo_pai_id) {
    await supabaseAdmin.from("Chamado_NF").update({ status: "vencido", tarefa: upd.tarefa }).eq("grupo_pai_id", cardId);
  }

  // 2) bloco + responsável + prazo
  const blocoRow = await garantirBloco(setor, pessoas, quem.id);
  const resp = escolherResponsavel(pessoas, await abertosNoBloco(blocoRow.id))!;
  const ano = Number(hoje.slice(0, 4));
  const feriados = new Set([...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...feriadosExtras()]);
  const prazo = somarDiasUteis(hoje, PRAZO_DIAS_UTEIS, feriados);

  // 3) ticket
  const omie = await situacaoNoOmie(card);
  const link = linkDoCard(card);
  const titulo = tituloRecobranca(card);
  const descricao = descricaoRecobranca({
    card, solicitanteNome: quem.nome, hoje, numero, situacao: omie.situacao, titulos: omie.titulos, link,
  });
  const { data: tRow, error: eT } = await supabaseAdmin.from("tickets").insert({
    tipo: "generico", titulo, descricao, categoria: "Financeiro", prazo,
    visibilidade: "publico", // compartilhado com o bloco: o setor inteiro vê e alguém pega
    solicitante_id: quem.id, responsavel_id: resp.id,
    quadro_id: blocoRow.id, quadro_coluna_id: blocoRow.colunaId,
    status: "aberto", aceite: resp.id === quem.id ? "ok" : "pendente",
    // tickets_vinculos só aceita 'requisicao' no CHECK: o vínculo com o card fica aqui.
    payload: {
      origem: "recobranca_financeiro", chamado_nf_id: String(cardId), recobranca_n: numero,
      setor, link_card: link, situacao_omie: omie.situacao,
    },
  }).select("*").single();
  if (eT || !tRow) {
    // card já foi gravado: registra no histórico mesmo sem ticket, para não sumir
    await auditar(card, quem, numero, moverParaVencido, null, `Ticket não criado: ${eT?.message || "?"}`);
    throw new ErroRecobranca(`Recobrança gravada no card, mas o ticket falhou: ${eT?.message || "?"}`, 500);
  }
  const t = tRow as Ticket;
  await garantirParticipante(t.id, quem.id, null);
  await garantirParticipante(t.id, resp.id, quem.id);
  await registrarEvento(t.id, quem.id, "criacao", {
    titulo, responsavel_id: resp.id, origem: "recobranca_financeiro", chamado_nf_id: cardId, recobranca_n: numero,
  });

  // 4) avisos: o responsável recebe; o resto do setor fica sabendo que tem cobrança no bloco
  await notificarTicket(t, [resp.id], quem.id, `Recobrança #${t.numero}: ${titulo}`,
    `Você ficou com esta cobrança (pedido do Financeiro, prazo ${prazo.split("-").reverse().join("/")}). Confirme no ticket.`, "tarefa_nova");
  await notificarTicket(t, pessoas.map((p) => p.id).filter((id) => id !== resp.id), quem.id,
    `Nova recobrança no bloco ${bloco}`, `#${t.numero} ${titulo} — com ${resp.nome}.`);

  await auditar(card, quem, numero, moverParaVencido, t, null);

  return { ticket: { id: t.id, numero: t.numero, titulo }, responsavel: resp, bloco, jaExistia: false, recobrancas: numero };
}

async function auditar(card: CardRecobranca, quem: Solicitante, numero: number, moveu: boolean, t: Ticket | null, erro: string | null) {
  await supabaseAdmin.from("audit_log").insert({
    user_id: quem.id, user_nome: quem.nome,
    sistema: "financeiro", acao: "recobranca", entidade: "Chamado_NF", entidade_id: String(card.id),
    entidade_label: `NF #${card.id} - ${card.nom_cliente || ""}`,
    detalhes: {
      de: card.status, para: moveu ? "vencido" : card.status,
      acao_desc: t
        ? `Recobrança #${numero} → ticket #${t.numero} (${nomeBlocoCobranca(setorDaRecobranca(card))})`
        : `Recobrança #${numero} solicitada${erro ? ` — ${erro}` : ""}`,
      ticket_id: t?.id || null, ticket_numero: t?.numero || null,
    },
  });
}
