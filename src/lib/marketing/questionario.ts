// =============================================================================
// QUESTIONÁRIO PÓS-EVENTO — catálogo das perguntas e regras de importação.
// Lib PURA (sem I/O), testada no vitest.
//
// As perguntas vivem no CÓDIGO e as respostas num JSONB chaveado por qNN. O
// texto da pergunta muda com o tempo; o id NÃO. Renumerar quebraria a leitura
// de tudo que já foi respondido — por isso os ids são fixos e nunca reusados.
// =============================================================================

export type SecaoQuestionario =
  | 'Sobre o evento'
  | 'Nossa participação'
  | 'Público e contatos'
  | 'Oportunidades e vendas'
  | 'Marca e concorrência'
  | 'Custos'
  | 'Avaliação'
  | 'Material';

export interface Pergunta {
  id: string;              // 'q01'... — FIXO
  secao: SecaoQuestionario;
  texto: string;
  /** Dica curta abaixo do campo. */
  ajuda?: string;
  /** Espera um número no meio do texto (a importação tenta extrair). */
  numerica?: boolean;
}

export const SECOES: SecaoQuestionario[] = [
  'Sobre o evento',
  'Nossa participação',
  'Público e contatos',
  'Oportunidades e vendas',
  'Marca e concorrência',
  'Custos',
  'Avaliação',
  'Material',
];

export const PERGUNTAS: Pergunta[] = [
  // Sobre o evento
  { id: 'q01', secao: 'Sobre o evento', texto: 'Nome completo, edição, datas e local do IRRIGASHOW 2026. Quem é o organizador?' },
  { id: 'q02', secao: 'Sobre o evento', texto: 'Quantos dias a Nova Tratores participou? Foi todos os dias do evento?', numerica: true },
  { id: 'q03', secao: 'Sobre o evento', texto: 'O organizador divulgou público total ou número de expositores? Se souber, qual?', numerica: true },

  // Nossa participação
  { id: 'q04', secao: 'Nossa participação', texto: 'Qual era o tamanho e a localização do stand? Era stand próprio ou dentro de um espaço da Mahindra?' },
  { id: 'q05', secao: 'Nossa participação', texto: 'Quais máquinas e implementos ficaram expostos?', ajuda: 'Modelo e quantidade.' },
  { id: 'q06', secao: 'Nossa participação', texto: 'Quem da equipe esteve presente e em quais dias?' },
  { id: 'q07', secao: 'Nossa participação', texto: 'Houve alguma ação no stand?', ajuda: 'Demonstração, teste de máquina, sorteio, brinde, condição comercial especial, parceria com banco ou consórcio.' },
  { id: 'q08', secao: 'Nossa participação', texto: 'Algum representante da Mahindra esteve presente? Quem?' },

  // Público e contatos
  { id: 'q09', secao: 'Público e contatos', texto: 'Estimativa de quantas pessoas passaram pelo stand por dia.', numerica: true },
  { id: 'q10', secao: 'Público e contatos', texto: 'Fizemos algum cadastro de visitantes?', ajuda: 'Lista, formulário, QR code, cartão.' },
  { id: 'q11', secao: 'Público e contatos', texto: 'Qual o perfil predominante dos visitantes e de quais cidades ou regiões vinham?' },
  { id: 'q12', secao: 'Público e contatos', texto: 'Quais produtos geraram mais interesse ou perguntas?' },

  // Oportunidades e vendas
  { id: 'q13', secao: 'Oportunidades e vendas', texto: 'Quantos leads reais (com nome e telefone) saíram do evento? Estão no CRM, em planilha ou no WhatsApp de alguém?' },
  { id: 'q14', secao: 'Oportunidades e vendas', texto: 'Alguma venda foi fechada durante o evento? Qual máquina e valor?' },
  { id: 'q15', secao: 'Oportunidades e vendas', texto: 'Alguma proposta foi aberta durante ou logo após o evento por contato feito lá? Quais?' },
  { id: 'q16', secao: 'Oportunidades e vendas', texto: 'Há negociações em andamento originadas do evento?', ajuda: 'Nome do cliente e estágio.' },
  { id: 'q17', secao: 'Oportunidades e vendas', texto: 'Surgiu algum contato de parceiro, revenda, cooperativa ou instituição (não cliente final)?' },

  // Marca e concorrência
  { id: 'q18', secao: 'Marca e concorrência', texto: 'Quais concorrentes estavam no evento e como era o stand deles em comparação ao nosso?' },
  { id: 'q19', secao: 'Marca e concorrência', texto: 'Como foi a percepção dos visitantes sobre a Mahindra?', ajuda: 'Já conheciam, tinham dúvidas, comparavam com quem.' },
  { id: 'q20', secao: 'Marca e concorrência', texto: 'A imprensa ou o organizador fez alguma cobertura mencionando a Nova Tratores?' },

  // Custos
  { id: 'q21', secao: 'Custos', texto: 'O que foi contratado para o evento? Fornecedores e valores aproximados.', ajuda: 'Stand, montagem, transporte, hospedagem, alimentação, brindes, gráfica, uniforme.' },
  { id: 'q22', secao: 'Custos', texto: 'Alguma despesa foi paga por fora (dinheiro, cartão pessoal) e ainda não está no sistema?' },

  // Avaliação
  { id: 'q23', secao: 'Avaliação', texto: 'O que funcionou bem e vale repetir?' },
  { id: 'q24', secao: 'Avaliação', texto: 'O que você faria diferente na próxima edição?' },
  { id: 'q25', secao: 'Avaliação', texto: 'Vale participar de novo em 2027? Por quê?' },

  // Material
  { id: 'q26', secao: 'Material', texto: 'Onde estão as fotos e vídeos do evento?', ajuda: 'Celular de quem, grupo de WhatsApp, Drive.' },
];

export const IDS_PERGUNTAS: string[] = PERGUNTAS.map((p) => p.id);
const SET_IDS = new Set(IDS_PERGUNTAS);

export function perguntasDaSecao(s: SecaoQuestionario): Pergunta[] {
  return PERGUNTAS.filter((p) => p.secao === s);
}

export function textoDaPergunta(id: string): string {
  return PERGUNTAS.find((p) => p.id === id)?.texto ?? id;
}

/**
 * Só chaves conhecidas e só texto. O corpo vem de uma rota PÚBLICA, então nada
 * além de qNN entra no JSONB, e cada resposta tem teto de tamanho.
 */
export const LIMITE_RESPOSTA = 8000;

export function sanitizarRespostas(entrada: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!entrada || typeof entrada !== 'object') return out;
  for (const [k, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (!SET_IDS.has(k)) continue;
    if (v === null || v === undefined) { out[k] = ''; continue; }
    if (typeof v !== 'string') continue;
    out[k] = v.slice(0, LIMITE_RESPOSTA);
  }
  return out;
}

/** Quantas perguntas já têm conteúdo — alimenta o "12 de 26" da tela. */
export function respondidas(respostas: Record<string, unknown>): number {
  return IDS_PERGUNTAS.filter((id) => String(respostas?.[id] ?? '').trim() !== '').length;
}

// =============================================================================
// Extração de número de texto livre.
//
// A pessoa escreve "uns 3 dias" ou "cerca de 12 mil pessoas". Quando dá pra ler
// um número com segurança, ele vai pro campo numérico da ficha; quando não dá,
// a resposta INTEIRA vai pras observações e ninguém inventa valor.
// =============================================================================
const PALAVRAS_NUM: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

export function extrairNumero(texto: unknown): number | null {
  if (texto === null || texto === undefined) return null;
  const s = String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s.trim()) return null;

  // "12 mil", "12,5 mil" -> 12000 / 12500
  const mil = s.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (mil) {
    const base = Number(mil[1].replace(',', '.'));
    if (Number.isFinite(base)) return Math.round(base * 1000);
  }

  // Primeiro número, aceitando ponto de milhar ("12.000") e decimal com vírgula.
  const num = s.match(/\d[\d.]*(?:,\d+)?/);
  if (num) {
    const limpo = num[0].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number(limpo);
    if (Number.isFinite(n)) return Math.round(n);
  }

  // "tres dias" — só palavras isoladas, pra não caçar número onde não há.
  for (const [palavra, valor] of Object.entries(PALAVRAS_NUM)) {
    if (new RegExp(`\\b${palavra}\\b`).test(s)) return valor;
  }
  return null;
}

// =============================================================================
// Mapa de importação: resposta -> campo da ficha.
//
// O que NÃO tem campo próprio vira uma linha em `mkt_acoes.observacoes` com o
// prefixo "qNN:", de propósito: fica legível e ninguém precisa caçar no JSON.
// =============================================================================
export type DestinoTabela = 'acao' | 'avaliacao';

export interface RegraImportacao {
  q: string;
  tabela: DestinoTabela;
  campo: string;
  /** O campo é inteiro: só importa se der pra ler um número. */
  numerico?: boolean;
}

export const MAPA_IMPORTACAO: RegraImportacao[] = [
  { q: 'q02', tabela: 'acao', campo: 'dias_participacao', numerico: true },
  { q: 'q03', tabela: 'acao', campo: 'publico_total_evento', numerico: true },
  { q: 'q04', tabela: 'acao', campo: 'stand_descricao' },
  { q: 'q09', tabela: 'acao', campo: 'publico_estimado', numerico: true },
  { q: 'q11', tabela: 'avaliacao', campo: 'perfil_publico' },
  { q: 'q12', tabela: 'avaliacao', campo: 'produtos_mais_interesse' },
  { q: 'q19', tabela: 'avaliacao', campo: 'percepcao_marca' },
  { q: 'q23', tabela: 'avaliacao', campo: 'funcionou' },
  { q: 'q24', tabela: 'avaliacao', campo: 'nao_funcionou' },
  // q25 é texto livre ("vale participar de novo? por quê"). O campo `repetir` é
  // uma escolha entre quatro opções — transformar um no outro seria a importação
  // adivinhando. O texto vai pra justificativa; a escolha continua humana.
  { q: 'q25', tabela: 'avaliacao', campo: 'justificativa' },
];

const Q_COM_CAMPO = new Set(MAPA_IMPORTACAO.map((r) => r.q));

export interface ItemPrevia {
  q: string;
  pergunta: string;
  tabela: DestinoTabela;
  campo: string;
  valor: string | number;
  /** Já havia conteúdo no destino: precisa de confirmação pra sobrescrever. */
  conflito: boolean;
  valorAtual?: string | number | null;
}

export interface PreviaImportacao {
  itens: ItemPrevia[];
  /** Respostas sem campo próprio, já formatadas pra `observacoes`. */
  paraObservacoes: string[];
  /** Numéricas em que não deu pra ler um número — vão pras observações. */
  numeroNaoLido: string[];
  conflitos: number;
}

/**
 * Monta o que a importação FARIA, sem escrever nada. A tela mostra isto antes de
 * confirmar, e o mesmo resultado é reusado na hora de gravar.
 */
export function preverImportacao(
  respostas: Record<string, unknown>,
  acaoAtual: Record<string, unknown>,
  avaliacaoAtual: Record<string, unknown> | null,
): PreviaImportacao {
  const itens: ItemPrevia[] = [];
  const paraObservacoes: string[] = [];
  const numeroNaoLido: string[] = [];

  for (const regra of MAPA_IMPORTACAO) {
    const bruto = String(respostas?.[regra.q] ?? '').trim();
    if (!bruto) continue;

    let valor: string | number = bruto;
    if (regra.numerico) {
      const n = extrairNumero(bruto);
      if (n === null) {
        // Não deu pra ler número: a resposta inteira vai pras observações.
        numeroNaoLido.push(regra.q);
        paraObservacoes.push(`${regra.q}: ${bruto}`);
        continue;
      }
      valor = n;
    }

    const atual = regra.tabela === 'acao'
      ? acaoAtual?.[regra.campo]
      : avaliacaoAtual?.[regra.campo];
    const preenchido = atual !== null && atual !== undefined && String(atual).trim() !== '';

    itens.push({
      q: regra.q,
      pergunta: textoDaPergunta(regra.q),
      tabela: regra.tabela,
      campo: regra.campo,
      valor,
      conflito: preenchido && String(atual) !== String(valor),
      valorAtual: preenchido ? (atual as string | number) : null,
    });
  }

  // Tudo que não tem campo próprio.
  for (const id of IDS_PERGUNTAS) {
    if (Q_COM_CAMPO.has(id)) continue;
    const v = String(respostas?.[id] ?? '').trim();
    if (v) paraObservacoes.push(`${id}: ${v}`);
  }

  return {
    itens,
    paraObservacoes,
    numeroNaoLido,
    conflitos: itens.filter((i) => i.conflito).length,
  };
}

/**
 * Junta as observações novas às que já existem, sem duplicar a mesma pergunta:
 * reimportar depois de o respondente corrigir uma resposta ATUALIZA a linha dela
 * em vez de empilhar outra.
 */
export function mesclarObservacoes(atual: string | null | undefined, novas: string[]): string {
  const linhas = String(atual ?? '').split('\n').filter((l) => l.trim() !== '');
  const chaveDe = (l: string) => l.match(/^(q\d{2}):/)?.[1] ?? null;
  const novasPorChave = new Map(novas.map((l) => [chaveDe(l), l] as const));

  const saida: string[] = [];
  for (const linha of linhas) {
    const k = chaveDe(linha);
    if (k && novasPorChave.has(k)) {
      saida.push(novasPorChave.get(k)!);
      novasPorChave.delete(k);
    } else {
      saida.push(linha);
    }
  }
  for (const [, linha] of novasPorChave) saida.push(linha);
  return saida.join('\n');
}
