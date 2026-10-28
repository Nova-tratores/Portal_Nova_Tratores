// Base de conhecimento do módulo de POPs: o "?" do cabeçalho em /pops* e o tutorial.
//
//   npx tsx scripts/conhecimento-seed-pops.ts [--dry] [--sobrescrever]
//
// Entra tudo como RASCUNHO (origem 'seed'): o "?" só aparece depois que alguém
// publica em /conhecimento → "Para aprovar" (regra da base: nada publica sem humano).
// Idempotente por slug, como o conhecimento-seed-guia.ts.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sanitizarCorpo, slugify, textoDeBusca, type Bloco } from "../src/lib/conhecimento/blocos";
import { REGRAS_REDACAO } from "../src/lib/pops/redacao";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const SOBRESCREVER = args.includes("--sobrescrever");
const MODULO = "pops";
const FONTES = ["src/app/(portal)/pops/**", "src/components/pops/**", "src/lib/pops/**", "src/app/api/pops/**"];

interface Seed { titulo: string; tipo: "tela" | "procedimento" | "regra" | "faq"; telas: string[]; ordem: number; resumo: string; corpo: Bloco[] }

const ARTIGOS: Seed[] = [
  {
    titulo: "POP em 1 minuto: o que é e como funciona aqui",
    tipo: "tela", telas: ["/pops"], ordem: 1,
    resumo: "O que é um POP, quem faz o quê e o caminho rascunho → revisão → publicado → execução.",
    corpo: [
      { tipo: "p", texto: "**POP (Procedimento Operacional Padrão)** é o jeito certo e único de fazer uma tarefa que se repete. Serve para que qualquer pessoa treinada faça igual, sem depender de quem sabe de cabeça." },
      { tipo: "p", texto: "No portal o POP não é só um documento: ele vira um **checklist no celular**, com foto, número, assinatura, e fica registrado quem fez, quando e o que encontrou." },
      { tipo: "passos", itens: [
        { titulo: "Escrever (rascunho)", texto: "O dono da área cria o POP do zero ou a partir de um modelo, com cabeçalho (objetivo, escopo, materiais) e passos.", dica: "Use o quadro \"Como escrever um bom POP\" do editor." },
        { titulo: "Enviar para revisão", texto: "Diga o que mudou e escolha o aprovador da área. A versão fica travada enquanto está em revisão." },
        { titulo: "Aprovar ou devolver", texto: "O aprovador lê em \"Para aprovar\" e publica ou devolve com o motivo. Ninguém aprova a própria versão." },
        { titulo: "Executar", texto: "Quem tem permissão executa pelo celular (avulso, por rotina programada ou disparado pela OS)." },
        { titulo: "Dar ciência e revisar", texto: "As pessoas marcam \"li e entendi\" a versão vigente. Na data de revisão, o dono atualiza ou marca \"Continua valendo\"." },
      ] },
      { tipo: "termos", itens: [
        { termo: "Dono da área", definicao: "Cria e edita os POPs da área." },
        { termo: "Aprovador", definicao: "Publica (ou devolve) as versões enviadas pelos donos da área." },
        { termo: "Versão", definicao: "Cada publicação é uma versão (v1, v2…). A anterior fica no histórico; só a vigente é executada." },
        { termo: "Execução", definicao: "Uma vez que alguém seguiu o POP, com as respostas de cada passo." },
        { termo: "Ciência", definicao: "Registro de que a pessoa leu a versão vigente." },
        { termo: "Folha OPL", definicao: "A versão impressa em uma página A4, com QR que abre a versão vigente no portal." },
      ] },
      { tipo: "aviso", tom: "info", texto: "Quem define donos e aprovadores é o admin do módulo, em **Áreas e papéis**. Sem aprovador na área, não dá para publicar." },
    ],
  },
  {
    titulo: "Como escrever um bom POP",
    tipo: "regra", telas: ["/pops"], ordem: 2,
    resumo: "Verbo no começo de cada passo, uma ação por passo, critério de certo, foto e número bem pedidos.",
    corpo: [
      { tipo: "p", texto: "Escreva para quem vai executar **sem você do lado**, de luva, no pátio, pelo celular. Se a pessoa precisar perguntar alguma coisa, o POP ainda não está pronto." },
      { tipo: "titulo", texto: "As regras" },
      { tipo: "tabela", colunas: ["Regra", "Assim não", "Assim sim"], linhas: REGRAS_REDACAO.map((r) => [r.titulo, r.ruim, r.bom]) },
      { tipo: "titulo", texto: "Cabeçalho" },
      { tipo: "lista", itens: [
        { texto: "**Título**: o processo, direto. Ex.: \"Inspeção de combustível na entrega do trator\"." },
        { texto: "**Objetivo**: o RESULTADO que o POP garante, em uma frase positiva. Ex.: \"Trator entregue sem falha de alimentação de combustível\"." },
        { texto: "**Escopo**: QUANDO e para QUAIS casos vale. Ex.: \"Todo trator novo, antes da entrega ao cliente\". O que fazer fica nos passos, não aqui." },
        { texto: "**Materiais / EPIs**: lista do que separar antes de começar, item por item, sem \"como…\" nem \"etc.\"." },
      ] },
      { tipo: "titulo", texto: "Passos" },
      { tipo: "lista", itens: [
        { texto: "**Título do passo = a ação**, começando com verbo: Fotografe, Confira, Meça, Drene, Anote, Assine…" },
        { texto: "**Como fazer / o que é certo** (campo de ajuda): o detalhe e o critério. Ex.: \"Sem água e sem borra no copo do filtro\"." },
        { texto: "**Foto**: diga o que precisa aparecer (ângulo, peça inteira, etiqueta legível). Ponha uma foto de exemplo no passo." },
        { texto: "**Número**: sempre com unidade e faixa aceitável — o sistema avisa na hora quando sai da faixa." },
        { texto: "**Confirmação (sim/não)**: escreva como afirmação que pode ser conferida. \"Copo do filtro sem água\" → Sim/Não." },
        { texto: "**Obrigatório**: marque só o que realmente não pode faltar. O POP não fecha com obrigatório pendente." },
      ] },
      { tipo: "titulo", texto: "Exemplo: antes e depois" },
      { tipo: "tabela", colunas: ["Antes", "Depois"], linhas: [
        ["Objetivo: Prevenir que o trator não apresente falhas nos dias de entrega", "Objetivo: Trator entregue ao cliente sem falha de alimentação de combustível"],
        ["Escopo: Realizar a verificação do tanque, filtros e peneira…", "Escopo: Todo trator novo, antes da entrega ao cliente"],
        ["Materiais: Ferramentas, como chaves de fenda…", "Materiais: chave de fenda; chave do trator; bandeja; pano limpo"],
        ["1. Imagem da bomba alimentadora", "1. Fotografe a peneira da bomba alimentadora — de frente, peneira visível e sem borra"],
        ["2. Imagem/vídeo do líquido dentro do filtro", "2. Fotografe ou filme o copo do filtro — líquido visível; não pode ter água nem borra"],
      ] },
      { tipo: "aviso", tom: "info", texto: "O editor confere a escrita enquanto você digita e mostra sugestões em amarelo. Em título de passo sem verbo, o botão **Usar \"…\"** já troca pelo texto sugerido. As sugestões não impedem de salvar." },
    ],
  },
  {
    titulo: "Criar, editar e enviar um POP para aprovação",
    tipo: "procedimento", telas: ["/pops"], ordem: 3,
    resumo: "Novo POP, modelo, editor de passos, envio para o aprovador e o que acontece depois.",
    corpo: [
      { tipo: "passos", itens: [
        { titulo: "Em POPs, clique em \"Novo POP\"", texto: "Escolha a área e o título. Para começar de algo pronto, use a guia **Modelos** → Duplicar." },
        { titulo: "Preencha o cabeçalho", texto: "Objetivo, escopo e materiais (veja \"Como escrever um bom POP\")." },
        { titulo: "Inclua os passos", texto: "Escolha o tipo (Instrução, Confirmação, Foto, Número, Texto, Escolha, Assinatura). Arraste ou use ▲▼ para ordenar.", dica: "À direita fica a prévia de como o passo aparece para quem executa." },
        { titulo: "Salve", texto: "O rascunho só vale depois de salvo; dá para voltar e continuar depois." },
        { titulo: "Envie para revisão", texto: "Escreva o que mudou e escolha o aprovador. A versão trava até a decisão." },
      ] },
      { tipo: "lista", itens: [
        { texto: "**Aprovado**: vira a versão vigente; a anterior vai para o histórico." },
        { texto: "**Devolvido**: volta a rascunho com o motivo, para você ajustar e reenviar." },
        { texto: "**Mudar um POP publicado**: botão **Editar (cria vN)**. Os outros continuam executando a versão vigente até a nova ser aprovada." },
        { texto: "**Continua valendo**: na data de revisão, se nada mudou, empurra a próxima revisão sem criar versão." },
      ] },
    ],
  },
  {
    titulo: "Executar um POP no celular",
    tipo: "procedimento", telas: ["/pops/executar", "/pops/minhas"], ordem: 4,
    resumo: "Passo a passo na tela, fotos, sinal fraco e como encerrar.",
    corpo: [
      { tipo: "passos", itens: [
        { titulo: "Abra a execução", texto: "Por \"Minhas execuções\", pelo aviso que chegou, pelo botão Executar do POP ou lendo o QR da folha impressa." },
        { titulo: "Responda cada passo", texto: "Uma tela por passo. Número fora da faixa aparece em vermelho na hora." },
        { titulo: "Concluir", texto: "Só conclui quando todos os passos obrigatórios estão respondidos." },
      ] },
      { tipo: "aviso", tom: "atencao", texto: "Sem sinal? Pode continuar: as respostas ficam guardadas no celular e são enviadas sozinhas quando a internet voltar. Não feche a aba antes de ver \"tudo enviado\"." },
    ],
  },
  {
    titulo: "Ciência, rotina, disparo pela OS e folha impressa",
    tipo: "tela", telas: ["/pops"], ordem: 5,
    resumo: "As abas da ficha do POP: Ciência, Quando executar, Execuções e Imprimir (OPL).",
    corpo: [
      { tipo: "lista", itens: [
        { texto: "**Ciência**: escolha quem precisa ler a versão vigente. Cada pessoa recebe um aviso e marca \"li e entendi\"; a lista mostra quem falta." },
        { texto: "**Quando executar**: rotina diária, semanal, mensal ou a cada N meses, com o responsável; a execução é criada sozinha às 05:40. Também dá para ligar o POP a uma **fase da OS**: quando a OS daquele tipo entra na fase, a execução vai para o técnico da OS." },
        { texto: "**Execuções**: o histórico de quem executou, quando e o que encontrou (com busca pela referência, ex.: o chassi)." },
        { texto: "**Imprimir (OPL)**: uma página A4 com os passos e um QR. A cópia impressa pode envelhecer; o QR sempre abre a versão vigente." },
      ] },
    ],
  },
  {
    titulo: "Mapa de processos",
    tipo: "tela", telas: ["/pops/processos"], ordem: 6,
    resumo: "Lista dos processos da empresa e em que pé está o POP de cada um.",
    corpo: [
      { tipo: "p", texto: "O mapa mostra, área por área, os processos que precisam de POP, com dono, prioridade e prazo." },
      { tipo: "p", texto: "A **situação não é digitada**: ela vem do POP ligado (sem POP, rascunho, em revisão, publicado). Um processo só conta como pronto quando o POP tem versão publicada." },
      { tipo: "p", texto: "**Criar POP** a partir do processo já começa pelo modelo do sistema, quando existe um." },
    ],
  },
];

function lerEnv(): Record<string, string> {
  const p = path.resolve(".env.local");
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs.readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}

async function main() {
  for (const a of ARTIGOS) {
    const n = sanitizarCorpo(a.corpo).length;
    if (n !== a.corpo.length) throw new Error(`${a.titulo}: ${a.corpo.length - n} bloco(s) inválido(s)`);
    console.log(`  - ${a.titulo} (${a.telas.join(", ")}, ${n} blocos)`);
  }
  if (DRY) return;

  const env = { ...lerEnv(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (.env.local)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: existentes, error: e0 } = await sb.from("kb_artigos").select("slug, status, versao").eq("modulo", MODULO);
  if (e0) throw new Error(`kb_artigos: ${e0.message}`);
  const porSlug = new Map((existentes || []).map((r) => [r.slug as string, r]));

  let criados = 0, pulados = 0, atualizados = 0;
  for (const a of ARTIGOS) {
    const slug = slugify(`${MODULO} ${a.titulo}`);
    const agora = new Date().toISOString();
    const linha = {
      slug, titulo: a.titulo, tipo: a.tipo, modulo: MODULO, telas: a.telas, fontes: FONTES,
      resumo: a.resumo, corpo: a.corpo, tags: [MODULO, "tutorial"], publico: [], ordem: a.ordem, status: "rascunho", versao: 0, origem: "seed",
      texto_busca: textoDeBusca(a.titulo, a.resumo, a.corpo, [MODULO, "procedimento operacional padrao"]),
      criado_por_nome: "seed (tutorial dos POPs)", rascunho_por: "seed (tutorial dos POPs)", rascunho_em: agora,
    };
    const ja = porSlug.get(slug);
    if (ja) {
      if (!SOBRESCREVER || ja.status !== "rascunho" || Number(ja.versao) > 0) { pulados++; continue; }
      const { error } = await sb.from("kb_artigos").update({ ...linha, atualizado_em: agora }).eq("slug", slug);
      if (error) throw error;
      atualizados++; continue;
    }
    const { error } = await sb.from("kb_artigos").insert(linha);
    if (error) throw new Error(`${slug}: ${error.message}`);
    criados++;
  }
  console.log(`criados ${criados} · atualizados ${atualizados} · pulados ${pulados}`);
  console.log('Próximo passo: /conhecimento → "Para aprovar" → publicar. Aí o "?" aparece nas telas de /pops.');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
