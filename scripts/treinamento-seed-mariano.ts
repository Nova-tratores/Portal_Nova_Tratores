// Trilha "Venda de máquina: da proposta ao caixa" — material do Mariano (26/11/2026).
//
//   npx tsx --env-file=.env.local scripts/treinamento-seed-mariano.ts [--ativar]
//
// Etapas = os 7 artigos de scripts/conhecimento-seed-mariano (precisam estar PUBLICADOS);
// prova = 2 perguntas por artigo. Nota mínima 70 %, prazo 15 dias. Público VAZIO: atribuição
// MANUAL só para o Mariano (mariano.novatratores@gmail.com). Nasce rascunho; --ativar ativa,
// atribui e avisa no sino. Idempotente pelo título.
// 27/11/2026: + etapa Pedidos Fabrica (2ª) e 2 perguntas; rodar de novo acrescenta só as perguntas que faltam.
import { createClient } from "@supabase/supabase-js";

const MARIANO = { id: "3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa", nome: "Mariano Ramos Do Val" };
const JOSE = { id: "2e388084-1295-4727-8743-4d4c29d54dd9", nome: "José Ortiz" };
const TITULO = "Venda de máquina: da proposta ao caixa";
const PRAZO_DIAS = 15;
const SLUGS = [
  "propostas-criar-acompanhar-e-gerar-o-pdf",
  "propostas-pedidos-fabrica",
  "remessas-demonstracao-de-maquina",
  "pedidos-maquinas-do-pedido-a-nota-fiscal",
  "financeiro-baixar-contas-dar-baixa-na-omie",
  "financeiro-correcao-de-contas-corrigir-lancamento-na-omie",
  "financeiro-boletos-de-fornecedor-boleto-agrupado",
  "tickets-solicitacao-de-compras",
];

const S = {
  proposta: SLUGS[0], fabrica: SLUGS[1], remessa: SLUGS[2], pvm: SLUGS[3],
  baixar: SLUGS[4], correcao: SLUGS[5], boleto: SLUGS[6], sc: SLUGS[7],
};

const PERGUNTAS: { slug: string; enunciado: string; opcoes: string[]; correta: number; explicacao: string }[] = [
  { slug: S.proposta, enunciado: "Onde se muda a fase de uma proposta (Enviar proposta → Aguardando cliente → …)?", opcoes: ["Dentro da janela de edição da proposta", "Pelo seletor \"Alterar\" na lista ou pelo seletor do cartão no kanban", "Só o administrador muda", "Pelo botão Imprimir PDF"], correta: 1, explicacao: "A janela de edição não tem seletor de fase. A fase muda na lista (coluna Alterar) ou no cartão do kanban." },
  { slug: S.proposta, enunciado: "O PDF da proposta não saiu com \"Vendedor X sem nome de carimbo\". O que fazer?", opcoes: ["Imprimir de novo", "Cadastrar o carimbo do vendedor em Gestão de Vendas › Ajustes por Venda › Vendedores › Carimbos", "Trocar o cliente", "Apagar a proposta"], correta: 1, explicacao: "O PDF exige vendedor com carimbo (ou imagem de assinatura). O cadastro fica em Gestão de Vendas › Ajustes por Venda › Vendedores › Carimbos." },
  { slug: S.fabrica, enunciado: "Em Pedidos Fabrica, de onde vem o custo-alvo da Solicitação de Compras aberta pelo botão \"ABRIR SOLICITAÇÃO DE COMPRA\"?", opcoes: ["Do preço de venda da proposta", "Do campo Custo (R$) do pedido fábrica, que deve estar preenchido e salvo antes", "Da tabela da Omie", "É sempre digitado na SC"], correta: 1, explicacao: "A SC vem preenchida com máquina, quantidade, cliente e o Custo do pedido fábrica. Sem o custo salvo, a SC nasce sem custo-alvo." },
  { slug: S.fabrica, enunciado: "Quando o pedido fábrica passa para \"Pedido Feito / Aguardando Maq\" sem ninguém mexer?", opcoes: ["Quando a máquina chega", "Quando o Comprador emite o Pedido de Compra na Solicitação de Compras aberta a partir dele", "Quando a proposta do cliente é vendida", "Nunca, sempre é manual"], correta: 1, explicacao: "Emitir o PC na SC move o pedido fábrica (se ainda estava em Proposta solicitada ou Recebida) e o pedido de máquina ligado à SC vai para Aguardando máquina." },
  { slug: S.remessa, enunciado: "Depois de \"Criar a remessa na Omie\", a máquina já saiu do estoque?", opcoes: ["Sim, na hora", "Não: só quando alguém clica em \"Emitir NF-e\" na ficha", "Só quando o cliente assina", "Só no fim do prazo"], correta: 1, explicacao: "Criar não é emitir. A remessa fica \"Sem nota\" até o clique em Emitir NF-e; é nesse momento que a máquina sai do estoque na Omie." },
  { slug: S.remessa, enunciado: "O cliente pediu mais 30 dias de demonstração. Qual botão usar?", opcoes: ["Mudar o prazo", "Renovar (cria a nota de volta e uma remessa nova)", "Virou venda", "Anotar"], correta: 1, explicacao: "Renovar faz a volta fiscal e uma remessa nova com o novo prazo. \"Mudar o prazo\" só altera o controle do portal, não mexe na nota." },
  { slug: S.pvm, enunciado: "O pedido de máquina não vai para a Omie com \"As parcelas somam R$ X e o pedido vale R$ Y\". Por quê?", opcoes: ["Falta o vendedor", "As parcelas precisam fechar no centavo com o total dos itens", "O cliente está inativo", "A categoria está errada"], correta: 1, explicacao: "O envio exige que as parcelas somem exatamente o total do pedido e que nenhuma vença no passado." },
  { slug: S.pvm, enunciado: "Depois de \"Enviado Omie\", o preço de uma máquina do pedido estava errado. O que dá para fazer?", opcoes: ["Editar o item e reenviar", "Mudar a fase para Montagem e corrigir", "Cancelar o pedido (também cancela na Omie) e fazer outro", "Nada, só a Omie altera"], correta: 2, explicacao: "Depois do envio só Observação interna e Previsão de faturamento ficam editáveis. Para mudar item, preço ou parcela, cancele e faça outro pedido." },
  { slug: S.baixar, enunciado: "Em Baixar contas, a lista mostra um título que você sabe que já foi pago direto na Omie. O que isso quer dizer?", opcoes: ["O pagamento não entrou na Omie", "A lista é uma cópia (espelho) e ainda não sincronizou; veja o selo \"espelho atualizado há X\"", "Precisa baixar de novo", "O título está duplicado"], correta: 1, explicacao: "A lista vem do espelho da Omie, atualizado a cada poucas horas. A janela de baixa consulta a Omie ao vivo." },
  { slug: S.baixar, enunciado: "Ao baixar uma duplicata de NF 10 dias antes do vencimento o portal pede o motivo. Qual é o caso em que você NÃO deve baixar?", opcoes: ["Quando há desconto por antecipação", "Quando o fornecedor mandou um boleto agrupando várias NFs: registre o boleto e pague a parcela", "Quando o valor é pequeno", "Quando é da CASTRO"], correta: 1, explicacao: "Boleto agrupado não se baixa por duplicata: registra-se o boleto em Correção de contas e paga-se a parcela no painel Boletos de fornecedor." },
  { slug: S.correcao, enunciado: "Na janela \"Corrigir lançamento\", deixar o campo Observação em branco faz o quê?", opcoes: ["Nada, campo vazio não é enviado", "Apaga a observação na Omie", "Mantém a observação anterior", "Dá erro"], correta: 1, explicacao: "Para data, projeto, conta corrente e nº do documento, vazio = não mexer. A Observação é a exceção: vazia = apaga na Omie." },
  { slug: S.correcao, enunciado: "Você só quer corrigir o vencimento de um título que tinha rateio em 3 departamentos. Qual é o cuidado?", opcoes: ["Nenhum, só o vencimento é enviado", "Conferir a seção Departamentos: a janela sempre envia o rateio que está nela, e ele começa com um departamento a 100 %", "Usar a alteração em massa", "Pedir para o Dev"], correta: 1, explicacao: "A janela sempre manda categoria e rateio; o rateio começa com um só departamento a 100 %. Refaça o rateio antes de aplicar." },
  { slug: S.boleto, enunciado: "O que o boleto agrupado faz com as duplicatas da NF na Omie?", opcoes: ["Baixa as duplicatas com desconto de 100 %", "Cria um título manual com as parcelas", "Reprograma previsão e vencimento para a parcela e grava o nº do boleto na observação; a baixa só no pagamento", "Cancela as duplicatas"], correta: 2, explicacao: "O boleto reprograma as duplicatas. Nada de título manual nem baixa antecipada; a baixa acontece ao pagar cada parcela." },
  { slug: S.boleto, enunciado: "O boleto ficou em \"Erro na Omie\" depois do registro. O que fazer antes de pagar a parcela?", opcoes: ["Estornar", "Pagar mesmo assim", "Clicar em Reaplicar em Boletos de fornecedor", "Registrar de novo"], correta: 2, explicacao: "Erro na Omie = alguma duplicata não foi reprogramada. Reaplicar refaz as pendentes; pagar só depois." },
  { slug: S.sc, enunciado: "Como o Comprador conclui uma Solicitação de Compras?", opcoes: ["Arrastando o cartão para Concluída", "Clicando em \"Emitir Pedido de Compra\", digitando o nº do PC da Omie e as condições finais", "Pedindo ao Financeiro para fechar", "Vinculando uma Requisição"], correta: 1, explicacao: "A SC só conclui pelo botão \"Emitir Pedido de Compra\", com o nº do PC emitido na Omie (digitado à mão) e as condições por escrito. O cartão não arrasta." },
  { slug: S.sc, enunciado: "O Comprador discorda do prazo de compromisso dado pelo Financeiro. O que ele faz?", opcoes: ["Cancela a SC", "Clica em \"Devolver ao Financeiro\" com o motivo por escrito", "Muda o prazo ele mesmo", "Abre outra SC"], correta: 1, explicacao: "O Comprador não cancela a SC (só quem abriu ou admin). Devolver ao Financeiro, com motivo, leva a SC de volta para nova decisão." },
];

async function main() {
  const ativar = process.argv.includes("--ativar");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: arts, error: e0 } = await sb.from("kb_artigos").select("id, slug, status").in("slug", SLUGS);
  if (e0) throw new Error(e0.message);
  const porSlug = new Map((arts || []).map((a) => [a.slug as string, a]));
  const faltam = SLUGS.filter((s) => porSlug.get(s)?.status !== "publicado");
  if (faltam.length) throw new Error(`Artigos não publicados ainda: ${faltam.join(", ")}`);

  let { data: t } = await sb.from("lms_trilhas").select("*").eq("titulo", TITULO).maybeSingle();
  if (!t) {
    const { data, error } = await sb.from("lms_trilhas").insert({
      titulo: TITULO, descricao: "Da proposta ao dinheiro em caixa: proposta, demonstração, pedido de máquinas na Omie, baixa de contas, correção de lançamentos, boleto agrupado de fornecedor e solicitação de compras.",
      modulo: "financeiro", publico: [], obrigatoria: true, nota_minima: 70, prazo_dias: PRAZO_DIAS, status: "rascunho", criado_por: JOSE.id, criado_por_nome: JOSE.nome,
    }).select("*").single();
    if (error) throw new Error(error.message);
    t = data; console.log("trilha criada", t.id);
  } else console.log("trilha já existe", t.id);

  for (let i = 0; i < SLUGS.length; i++) {
    const { error } = await sb.from("lms_etapas").upsert({ trilha_id: t.id, artigo_id: porSlug.get(SLUGS[i])!.id, ordem: (i + 1) * 10 }, { onConflict: "trilha_id,artigo_id" });
    if (error) throw new Error(error.message);
  }
  // Só as que faltam (pelo enunciado); a ordem das que já existem é realinhada à lista.
  const { data: ja } = await sb.from("lms_perguntas").select("id, enunciado").eq("trilha_id", t.id);
  const existentes = new Map((ja || []).map((q) => [q.enunciado as string, q.id as string]));
  const novas = PERGUNTAS.map((p, i) => ({ ...p, ordem: i + 1 })).filter((p) => !existentes.has(p.enunciado));
  if (novas.length) {
    const { error } = await sb.from("lms_perguntas").insert(novas.map((p) => ({ trilha_id: t.id, artigo_id: porSlug.get(p.slug)!.id, ordem: p.ordem, enunciado: p.enunciado, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao })));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < PERGUNTAS.length; i++) {
    const id = existentes.get(PERGUNTAS[i].enunciado);
    if (id) await sb.from("lms_perguntas").update({ ordem: i + 1 }).eq("id", id);
  }
  console.log(`perguntas: ${novas.length} novas, ${existentes.size} já existiam`);

  if (ativar) {
    if (t.status !== "ativa") { const { error } = await sb.from("lms_trilhas").update({ status: "ativa" }).eq("id", t.id); if (error) throw new Error(error.message); }
    const prazo = new Date(); prazo.setDate(prazo.getDate() + PRAZO_DIAS);
    const p = `${prazo.getFullYear()}-${String(prazo.getMonth() + 1).padStart(2, "0")}-${String(prazo.getDate()).padStart(2, "0")}`;
    const { error: e2 } = await sb.from("lms_atribuicoes").upsert({ trilha_id: t.id, user_id: MARIANO.id, user_nome: MARIANO.nome, ciclo: 1, origem: "manual", prazo: p }, { onConflict: "trilha_id,user_id,ciclo", ignoreDuplicates: true });
    if (e2) throw new Error(e2.message);
    await sb.from("portal_notificacoes").insert({ user_id: MARIANO.id, tipo: "sistema", titulo: "Treinamento para fazer", descricao: `${TITULO} · ${SLUGS.length} artigos + prova · até ${p.split("-").reverse().join("/")}`, link: `/treinamento/${t.id}` });
    console.log(`ativa; atribuída a ${MARIANO.nome} (prazo ${p})`);
  }
  console.log(`pronto: /treinamento/editar/${t.id}`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
