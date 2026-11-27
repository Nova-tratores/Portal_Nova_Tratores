// Trilha "Financeiro no portal: do dia a dia da Omie para o Caixa" — Elizabete Lourdes (26/11/2026).
//
//   npx tsx --env-file=.env.local scripts/treinamento-seed-elizabete.ts [--ativar]
//
// Perfil (omie_log_agregado.csv, jan–nov/2026): 4.667 ações na Omie — Contas a Pagar: 2.089 baixas,
// 1.069 alterações, 704 inclusões, 142 pagamentos cancelados; Contas a Receber: 361 baixas, 210 alterações.
// Etapas = 7 artigos publicados (Começando/Hoje → Baixar contas → Vencidos → Correção → Boletos →
// Lançar conta → Recibos); prova = 2 perguntas por artigo. Nota mínima 70 %, prazo 15 dias. Público VAZIO:
// atribuição MANUAL só para a Elizabete. Nasce rascunho; --ativar ativa, atribui e avisa no sino.
import { createClient } from "@supabase/supabase-js";

const ELIZABETE = { id: "3cba18ae-1a88-429b-baa7-454c330a737b", nome: "Elizabete Lourdes" };
const JOSE = { id: "2e388084-1295-4727-8743-4d4c29d54dd9", nome: "José Ortiz" };
const TITULO = "Financeiro no portal: do dia a dia da Omie para o Caixa";
const PRAZO_DIAS = 15;
const SLUGS = [
  "financeiro-comecando-empresa-areas-e-o-dia",
  "financeiro-baixar-contas-dar-baixa-na-omie",
  "financeiro-vencidos-cobrar-e-dar-baixa-com-juros",
  "financeiro-correcao-de-contas-corrigir-lancamento-na-omie",
  "financeiro-boletos-de-fornecedor-boleto-agrupado",
  "financeiro-lancar-conta-a-pagar-na-omie",
  "financeiro-recibos-emitir-e-lancar-na-omie",
];

const PERGUNTAS: { slug: string; enunciado: string; opcoes: string[]; correta: number; explicacao: string }[] = [
  { slug: SLUGS[0], enunciado: "Você baixou um título direto na Omie e ele continua na lista do portal. Por quê?", opcoes: ["O portal perdeu a baixa", "A lista é uma cópia da Omie, atualizada a cada ~3 h; baixa feita pelo portal aparece na hora", "Precisa baixar de novo no portal", "A empresa do topo está errada"], correta: 1, explicacao: "As listas são cópia da Omie; só as ações feitas pelo portal atualizam a cópia na hora." },
  { slug: SLUGS[0], enunciado: "Onde se escolhe se você está vendo a NOVA ou a CASTRO?", opcoes: ["Em cada tela, num seletor próprio", "Nos dois botões NOVA/CASTRO no lado direito da faixa verde do Financeiro", "No Admin", "Não dá para escolher: aparece tudo junto"], correta: 1, explicacao: "Os botões NOVA (vermelho) e CASTRO (azul) do topo valem para todas as abas; não existe \"Todas\"." },
  { slug: SLUGS[1], enunciado: "Ao baixar uma duplicata de NF 10 dias antes do vencimento o portal pede o motivo na observação. Quando você NÃO deve baixar?", opcoes: ["Quando há desconto por antecipação", "Quando o fornecedor mandou um boleto agrupando várias NFs: registre o boleto e pague a parcela", "Quando o valor é pequeno", "Quando é da CASTRO"], correta: 1, explicacao: "Boleto agrupado não se baixa por duplicata: registra-se o boleto em Correção de contas e paga-se a parcela no painel Boletos de fornecedor." },
  { slug: SLUGS[1], enunciado: "O que a pílula \"Até hoje\" (padrão) mostra em Baixar contas?", opcoes: ["Só o que vence hoje", "Títulos em aberto com previsão até hoje, o mesmo recorte do card \"Pagar hoje\" da Omie", "Tudo em aberto", "Só os atrasados"], correta: 1, explicacao: "\"Até hoje\" = previsão até hoje. Para ver parcelas futuras, use \"Todos\"." },
  { slug: SLUGS[2], enunciado: "Em Vencidos, o que o botão \"Copiar cobrança\" faz?", opcoes: ["Manda WhatsApp para o cliente", "Manda e-mail", "Copia o texto da cobrança para você colar no WhatsApp ou e-mail", "Dá baixa com juros"], correta: 2, explicacao: "O portal não envia nada sozinho; só copia o texto da cobrança com as contas, o atraso e o total com juros." },
  { slug: SLUGS[2], enunciado: "Na baixa pela janela do cliente em Vencidos, como a multa e os juros vão para a Omie?", opcoes: ["Somados ao valor do título", "Como desconto negativo", "Separados: principal em valor, multa no campo multa e juros no campo juros", "Não vão; só o principal"], correta: 2, explicacao: "O portal lança o principal como valor e manda multa e juros nos campos próprios da Omie, com a observação \"Baixa pelo Caixa do portal…\"." },
  { slug: SLUGS[3], enunciado: "Na janela \"Corrigir lançamento\", deixar o campo Observação em branco faz o quê?", opcoes: ["Nada, campo vazio não é enviado", "Apaga a observação na Omie", "Mantém a observação anterior", "Dá erro"], correta: 1, explicacao: "Para data, projeto, conta corrente e nº do documento, vazio = não mexer. A Observação é a exceção: vazia = apaga na Omie." },
  { slug: SLUGS[3], enunciado: "Você só quer corrigir o vencimento de um título rateado em 3 departamentos. Qual é o cuidado?", opcoes: ["Nenhum, só o vencimento é enviado", "Conferir a seção Departamentos: a janela sempre envia o rateio que está nela, e ele começa com um departamento a 100 %", "Usar a alteração em massa", "Pedir para o Dev"], correta: 1, explicacao: "A janela sempre manda categoria e rateio; o rateio começa com um só departamento a 100 %. Refaça antes de aplicar." },
  { slug: SLUGS[4], enunciado: "O que o boleto agrupado faz com as duplicatas da NF na Omie?", opcoes: ["Baixa as duplicatas com desconto de 100 %", "Cria um título manual com as parcelas", "Reprograma previsão e vencimento para a parcela e grava o nº do boleto na observação; a baixa só no pagamento", "Cancela as duplicatas"], correta: 2, explicacao: "O boleto reprograma as duplicatas. Nada de título manual nem baixa antecipada; a baixa acontece ao pagar cada parcela." },
  { slug: SLUGS[4], enunciado: "Onde se registra o boleto agrupado e onde se paga a parcela?", opcoes: ["Os dois em Boletos de fornecedor", "Registra em Correção de contas › Lista › A pagar; paga em Baixar contas › painel Boletos de fornecedor", "Os dois em Baixar contas", "Só na Omie"], correta: 1, explicacao: "Registrar = marcar as duplicatas na Lista da Correção de contas; pagar = \"Pagar parcela\" no painel de Baixar contas; acompanhar = tela Boletos de fornecedor." },
  { slug: SLUGS[5], enunciado: "Depois de \"Lançar no Omie\" em Lançar conta, o título está pago?", opcoes: ["Sim, lançar já baixa", "Não: nasce em aberto na Omie; a baixa é em Baixar contas", "Só se marcar \"Prestador autônomo\"", "Depende da forma de pagamento"], correta: 1, explicacao: "Lançar não é baixar. O título entra em aberto na Omie com os anexos; pagou, baixe em Baixar contas." },
  { slug: SLUGS[5], enunciado: "O fornecedor não está no cadastro. O que fazer em Lançar conta?", opcoes: ["Digitar o nome livre", "\"+ Cadastrar fornecedor novo\": digite o CNPJ, o portal busca na Receita e preenche; depois \"Cadastrar e usar\"", "Lançar sem fornecedor", "Ir até a Omie primeiro"], correta: 1, explicacao: "O cadastro rápido cria o fornecedor pelo CNPJ (Receita + CEP). Na hora do envio, se ele não existe na Omie, o portal cria lá também." },
  { slug: SLUGS[6], enunciado: "Com a caixa \"Lançar no Omie\" marcada, o que o recibo faz na Omie?", opcoes: ["Só cria o título em aberto", "Cria o título E já dá a baixa na data e conta escolhidas", "Nada, é só um PDF", "Cria um pedido"], correta: 1, explicacao: "O recibo cria a conta a receber (ou a pagar) e já lança o recebimento/pagamento, não conciliado. Não baixe esse título de novo em Baixar contas." },
  { slug: SLUGS[6], enunciado: "Você cancelou um recibo no portal. E na Omie?", opcoes: ["O portal estorna a baixa e exclui a conta", "Nada muda: é preciso estornar a baixa e excluir a conta na Omie", "A conta vira em aberto", "A Omie recebe uma observação"], correta: 1, explicacao: "Cancelar o recibo só marca o recibo (PDF e QR saem CANCELADO). O lançamento na Omie não é desfeito." },
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
      titulo: TITULO, descricao: "O que você faz hoje na Omie (baixar, corrigir, lançar, cobrar, boleto agrupado, recibo) feito pelo portal, com a Omie recebendo tudo na hora.",
      modulo: "financeiro", publico: [], obrigatoria: true, nota_minima: 70, prazo_dias: PRAZO_DIAS, status: "rascunho", criado_por: JOSE.id, criado_por_nome: JOSE.nome,
    }).select("*").single();
    if (error) throw new Error(error.message);
    t = data; console.log("trilha criada", t.id);
  } else console.log("trilha já existe", t.id);

  for (let i = 0; i < SLUGS.length; i++) {
    const { error } = await sb.from("lms_etapas").upsert({ trilha_id: t.id, artigo_id: porSlug.get(SLUGS[i])!.id, ordem: (i + 1) * 10 }, { onConflict: "trilha_id,artigo_id" });
    if (error) throw new Error(error.message);
  }
  const { count } = await sb.from("lms_perguntas").select("*", { count: "exact", head: true }).eq("trilha_id", t.id);
  if (!count) {
    const { error } = await sb.from("lms_perguntas").insert(PERGUNTAS.map((p, i) => ({ trilha_id: t.id, artigo_id: porSlug.get(p.slug)!.id, ordem: i + 1, enunciado: p.enunciado, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao })));
    if (error) throw new Error(error.message);
    console.log(`${PERGUNTAS.length} perguntas`);
  } else console.log(`perguntas já existem (${count})`);

  if (ativar) {
    if (t.status !== "ativa") { const { error } = await sb.from("lms_trilhas").update({ status: "ativa" }).eq("id", t.id); if (error) throw new Error(error.message); }
    const prazo = new Date(); prazo.setDate(prazo.getDate() + PRAZO_DIAS);
    const p = `${prazo.getFullYear()}-${String(prazo.getMonth() + 1).padStart(2, "0")}-${String(prazo.getDate()).padStart(2, "0")}`;
    const { error: e2 } = await sb.from("lms_atribuicoes").upsert({ trilha_id: t.id, user_id: ELIZABETE.id, user_nome: ELIZABETE.nome, ciclo: 1, origem: "manual", prazo: p }, { onConflict: "trilha_id,user_id,ciclo", ignoreDuplicates: true });
    if (e2) throw new Error(e2.message);
    await sb.from("portal_notificacoes").insert({ user_id: ELIZABETE.id, tipo: "sistema", titulo: "Treinamento para fazer", descricao: `${TITULO} · 7 artigos + prova · até ${p.split("-").reverse().join("/")}`, link: `/treinamento/${t.id}` });
    console.log(`ativa; atribuída a ${ELIZABETE.nome} (prazo ${p})`);
  }
  console.log(`pronto: /treinamento/editar/${t.id}`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
