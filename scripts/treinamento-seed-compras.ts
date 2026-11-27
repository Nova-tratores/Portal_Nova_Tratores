// Trilha "Solicitação de Compras: quem aprova" (27/11/2026) — Diretoria, Financeiro e Comprador.
//
//   npx tsx --env-file=.env.local scripts/treinamento-seed-compras.ts [--ativar]
//
// Etapas = artigo da SC + artigo do Pedido Fábrica (contexto). Só entram artigos PUBLICADOS: rodar de
// novo depois de publicar acrescenta a etapa e as perguntas que faltavam (idempotente pelo título).
// Quem faz = as pessoas do trilho lidas de tickets_compras_config (Diretoria 1 e 2, Financeiro,
// Comprador); atribuição MANUAL, público vazio. Nota mínima 70 %, prazo 15 dias.
// --ativar ativa, atribui e avisa no sino (uma vez por pessoa: quem já tem a atribuição não é avisado de novo).
import { createClient } from "@supabase/supabase-js";

const TITULO = "Solicitação de Compras: quem aprova";
const PRAZO_DIAS = 15;
const JOSE = { id: "2e388084-1295-4727-8743-4d4c29d54dd9", nome: "José Ortiz" };
const SC = "tickets-solicitacao-de-compras";
const FAB = "propostas-pedidos-fabrica";
const SLUGS = [SC, FAB];

const PERGUNTAS: { slug: string; enunciado: string; opcoes: string[]; correta: number; explicacao: string }[] = [
  { slug: SC, enunciado: "A SC acabou de ser aberta. Com quem está a bola e o que ela decide?", opcoes: ["Com o Financeiro, que aprova o pagamento", "Com a Diretoria, que define a quantidade aprovada e o valor unitário (com justificativa) ou devolve ao vendedor", "Com o Comprador, que já pode emitir o PC", "Com o vendedor, que precisa confirmar"], correta: 1, explicacao: "Toda SC nasce na Diretoria. É ela que define Quantidade aprovada, Valor unitário e Justificativa — só aí o valor total da SC passa a existir — ou devolve ao vendedor com o motivo." },
  { slug: SC, enunciado: "As duas pessoas da Diretoria (1ª e 2ª) recebem a SC. Quem pode decidir?", opcoes: ["Só a 1ª pessoa", "Qualquer uma das duas; a 1ª fica com a bola e a 2ª é avisada e decide igual", "As duas precisam aprovar", "Só o admin"], correta: 1, explicacao: "As duas decidem. A bola fica com a 1ª pessoa, a 2ª entra como participante e é avisada (sino, e-mail e WhatsApp)." },
  { slug: SC, enunciado: "No Financeiro, o que é obrigatório para aprovar e mandar ao Comprador?", opcoes: ["Só clicar em Aprovar", "O Parecer por escrito; o Prazo de compromisso (liquidação) é opcional", "O nº do Pedido de Compra", "Anexar o boleto"], correta: 1, explicacao: "\"Aprovar\" ou \"Aprovar com ressalva\" exige o Parecer. O prazo de compromisso é opcional e aparece para o Comprador como \"Compromisso até {data}\"." },
  { slug: SC, enunciado: "O Financeiro não concorda com a compra. Para onde a SC vai ao reprovar?", opcoes: ["É cancelada", "Volta para a Diretoria, com o parecer", "Volta para o vendedor", "Fica parada no Financeiro"], correta: 1, explicacao: "\"Reprovar e devolver à Diretoria\" (com parecer) devolve a decisão à Diretoria, que é avisada de novo. Cancelar é só de quem abriu ou do admin." },
  { slug: SC, enunciado: "A SC está com o selo \"⚠ sinalizada\". O que isso significa?", opcoes: ["Está travada até o admin liberar", "Passou do valor ou do estoque configurado: é um alerta para olhar com mais atenção, não trava nada", "Foi reprovada uma vez", "Falta o nº do pedido de venda"], correta: 1, explicacao: "A sinalização é só um sinal (valor total acima do limite ou estoque atual acima do limite configurado). A aprovação segue normalmente." },
  { slug: SC, enunciado: "O Comprador emitiu o Pedido de Compra na SC, que tinha um pedido de máquina (PVM) em \"Em montagem\" e veio de um pedido fábrica em \"Proposta Recebida\". O que acontece sozinho?", opcoes: ["Nada além de concluir a SC", "A SC conclui, o pedido fábrica vai para \"Pedido Feito / Aguardando Maq\" e o PVM vai para \"Aguardando máquina\"", "O PVM é enviado para a Omie", "O pedido fábrica é faturado"], correta: 1, explicacao: "Emitir o PC conclui a SC e move as duas pontas que ainda não tinham andado: o pedido fábrica e o pedido de venda da máquina (PVM). Nada vai para a Omie." },
  { slug: SC, enunciado: "Uma SC com motivo \"Venda fechada\" precisa de quê, além do cliente?", opcoes: ["Nada", "O pedido de venda: o pedido de máquina (PVM) escolhido na lista ou o nº de um pedido feito fora do portal", "O nº do Pedido de Compra", "A aprovação do Financeiro"], correta: 1, explicacao: "Venda fechada exige o pedido de venda. O certo é escolher o PVM (assim a SC e o pedido ficam ligados); o nº digitado é só para pedido feito fora do portal." },
  { slug: FAB, enunciado: "Alguém tentou abrir uma segunda SC para o mesmo pedido fábrica. O que acontece?", opcoes: ["Abre normalmente", "O portal recusa e diz qual SC já existe; só uma SC cancelada libera o pedido para outra", "A SC antiga é cancelada", "As duas são juntadas"], correta: 1, explicacao: "Um pedido fábrica tem uma SC em andamento. A mensagem diz \"O pedido fábrica #N já tem a Solicitação de Compras #M\"." },
  { slug: FAB, enunciado: "De onde vem o custo-alvo da SC aberta pelo botão \"ABRIR SOLICITAÇÃO DE COMPRA\" do pedido fábrica?", opcoes: ["Do preço de venda da proposta", "Do campo Custo (R$) do pedido fábrica", "Da tabela da Omie", "É sempre digitado na SC"], correta: 1, explicacao: "O formulário da SC vem preenchido com máquina, quantidade, cliente e o Custo do pedido fábrica — por isso o custo deve ser preenchido e salvo antes de abrir a SC." },
];

async function main() {
  const ativar = process.argv.includes("--ativar");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: arts, error: e0 } = await sb.from("kb_artigos").select("id, slug, status").in("slug", SLUGS);
  if (e0) throw new Error(e0.message);
  const publicados = new Map((arts || []).filter((a) => a.status === "publicado").map((a) => [a.slug as string, a.id as string]));
  const faltam = SLUGS.filter((s) => !publicados.has(s));
  if (!publicados.size) throw new Error(`Nenhum artigo publicado ainda (${SLUGS.join(", ")})`);
  if (faltam.length) console.log(`AVISO: ainda não publicados (entram ao rodar de novo): ${faltam.join(", ")}`);

  let { data: t } = await sb.from("lms_trilhas").select("*").eq("titulo", TITULO).maybeSingle();
  if (!t) {
    const { data, error } = await sb.from("lms_trilhas").insert({
      titulo: TITULO,
      descricao: "O trilho da Solicitação de Compras do lado de quem decide: Diretoria (quantidade e valor), Financeiro (parecer e prazo), Comprador (Pedido de Compra) e o que a emissão do PC move no pedido fábrica e no pedido de máquina.",
      modulo: "tickets", publico: [], obrigatoria: true, nota_minima: 70, prazo_dias: PRAZO_DIAS, status: "rascunho", criado_por: JOSE.id, criado_por_nome: JOSE.nome,
    }).select("*").single();
    if (error) throw new Error(error.message);
    t = data; console.log("trilha criada", t.id);
  } else console.log("trilha já existe", t.id);

  for (let i = 0; i < SLUGS.length; i++) {
    const artigo = publicados.get(SLUGS[i]);
    if (!artigo) continue;
    const { error } = await sb.from("lms_etapas").upsert({ trilha_id: t.id, artigo_id: artigo, ordem: (i + 1) * 10 }, { onConflict: "trilha_id,artigo_id" });
    if (error) throw new Error(error.message);
  }

  // Perguntas: só as dos artigos publicados, e só as que ainda não existem (pelo enunciado).
  const { data: ja } = await sb.from("lms_perguntas").select("enunciado, ordem").eq("trilha_id", t.id);
  const existentes = new Set((ja || []).map((p) => p.enunciado as string));
  const novas = PERGUNTAS.map((p, i) => ({ ...p, ordem: i + 1 })).filter((p) => publicados.has(p.slug) && !existentes.has(p.enunciado));
  if (novas.length) {
    const { error } = await sb.from("lms_perguntas").insert(novas.map((p) => ({ trilha_id: t.id, artigo_id: publicados.get(p.slug)!, ordem: p.ordem, enunciado: p.enunciado, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao })));
    if (error) throw new Error(error.message);
  }
  console.log(`perguntas: ${novas.length} novas, ${existentes.size} já existiam`);

  if (ativar) {
    const { data: cfg, error: ec } = await sb.from("tickets_compras_config").select("diretoria_id, diretoria2_id, financeiro_id, comprador_id").maybeSingle();
    if (ec) throw new Error(ec.message);
    const ids = [...new Set([cfg?.diretoria_id, cfg?.diretoria2_id, cfg?.financeiro_id, cfg?.comprador_id].filter(Boolean) as string[])];
    const { data: pessoas, error: ep } = await sb.from("financeiro_usu").select("id, nome").in("id", ids);
    if (ep) throw new Error(ep.message);

    if (t.status !== "ativa") { const { error } = await sb.from("lms_trilhas").update({ status: "ativa" }).eq("id", t.id); if (error) throw new Error(error.message); }
    const prazo = new Date(); prazo.setDate(prazo.getDate() + PRAZO_DIAS);
    const p = `${prazo.getFullYear()}-${String(prazo.getMonth() + 1).padStart(2, "0")}-${String(prazo.getDate()).padStart(2, "0")}`;
    const { data: jaAtrib } = await sb.from("lms_atribuicoes").select("user_id").eq("trilha_id", t.id);
    const atribuidos = new Set((jaAtrib || []).map((a) => a.user_id as string));
    const etapas = publicados.size;
    for (const u of pessoas || []) {
      if (atribuidos.has(u.id)) { console.log(`já atribuída a ${u.nome}`); continue; }
      const { error } = await sb.from("lms_atribuicoes").insert({ trilha_id: t.id, user_id: u.id, user_nome: u.nome, ciclo: 1, origem: "manual", prazo: p });
      if (error) throw new Error(`${u.nome}: ${error.message}`);
      await sb.from("portal_notificacoes").insert({ user_id: u.id, tipo: "sistema", titulo: "Treinamento para fazer", descricao: `${TITULO} · ${etapas} artigo${etapas > 1 ? "s" : ""} + prova · até ${p.split("-").reverse().join("/")}`, link: `/treinamento/${t.id}` });
      console.log(`atribuída a ${u.nome} (prazo ${p})`);
    }
  }
  console.log(`pronto: /treinamento/editar/${t.id}`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
