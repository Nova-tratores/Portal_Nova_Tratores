// Tratorilson na SG Mahindra: pega o que o técnico escreveu no app (texto
// cru, misturado, com erros de digitação) e devolve os 4 campos da SG
// formatados — Reclamação do Cliente, Diagnóstico, Ação Tomada e Observações
// (esta só quando há algo relevante, ex.: itens em serviços de terceiros).
//
// Regra de ouro do prompt: NUNCA inventar fato/peça/causa — só reescrever e
// organizar o que o técnico relatou. O garantista revisa e pode editar tudo
// antes de gerar a SG (os textos ficam em checklist_respostas.sg_*).

import { chamarIA } from '@/lib/assistente/ia';

export interface TextosSG {
  reclamacao: string;
  diagnostico: string;
  acao_tomada: string;
  observacoes: string | null;
}

export interface EntradaTextosSG {
  reclamacaoBruta: string | null; // Ordem_Servico.Serv_Solicitado (vem com cabeçalho misturado)
  diagnosticoBruto: string | null; // Ordem_Servico_Tecnicos.Motivo
  acaoBruta: string | null; // Ordem_Servico_Tecnicos.ServicoRealizado
  pecas: string[]; // descrições das peças da garantia (contexto)
  servicosTerceiros: string[]; // itens vindos de requisições (contexto p/ Observações)
  modelo?: string | null;
}

const SISTEMA = `Você é o Tratorilson, assistente técnico da Nova Tratores (concessionária Mahindra).
Sua tarefa: reescrever os textos de uma Solicitação de Garantia (SG) Mahindra a partir do relato CRU do técnico (escrito às pressas no app, com erros de digitação e informação misturada).

REGRAS OBRIGATÓRIAS:
1. NUNCA invente fatos, peças, causas ou condições que não estejam no relato. Reescreva e organize — não crie.
2. Português técnico formal, terceira pessoa, frases completas. Corrija ortografia e digitação (ex.: "percebudo"→"percebido", "dieles"→"diesel").
3. RECLAMACAO: SÓ a queixa original do cliente, em 1–2 frases ("Cliente relatou que..."). Ignore cabeçalhos misturados (Modelo/Chassis/Horímetro) e NÃO descreva o serviço aqui.
4. DIAGNOSTICO: o que foi constatado na análise técnica (avarias/causa). Não repita a ação tomada.
5. ACAO_TOMADA: o que foi feito para corrigir (desmontagens, trocas, substituições), em texto corrido ou itens claros.
6. OBSERVACOES: SOMENTE se houver informação relevante que não coube nos outros campos — ex.: itens pedidos em SERVIÇOS DE TERCEIROS (informe isso quando a lista vier no contexto), condições especiais de atendimento. Se não houver nada, use null.
7. Cada campo em texto puro (sem markdown, sem aspas decorativas). Não mencione que você é uma IA.

Responda SOMENTE com JSON válido neste formato:
{"reclamacao":"...","diagnostico":"...","acao_tomada":"...","observacoes":"..." ou null}`;

function bloco(titulo: string, corpo: string | null | undefined): string {
  return `### ${titulo}\n${String(corpo ?? '').trim() || '(vazio)'}`;
}

export async function formatarTextosSG(e: EntradaTextosSG): Promise<TextosSG> {
  const usuario = [
    e.modelo ? `Trator: ${e.modelo}` : null,
    bloco('RELATO — SOLICITAÇÃO DO CLIENTE (cru, pode vir com cabeçalho misturado)', e.reclamacaoBruta),
    bloco('RELATO — DIAGNÓSTICO DO TÉCNICO (cru)', e.diagnosticoBruto),
    bloco('RELATO — SERVIÇO REALIZADO (cru)', e.acaoBruta),
    e.pecas.length ? `### PEÇAS DA GARANTIA (contexto)\n- ${e.pecas.join('\n- ')}` : null,
    e.servicosTerceiros.length
      ? `### ITENS EM SERVIÇOS DE TERCEIROS (se relevantes, cite nas observações)\n- ${e.servicosTerceiros.join('\n- ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const resp = await chamarIA({
    messages: [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: usuario },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const conteudo = resp?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error('IA não devolveu conteúdo.');

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(conteudo);
  } catch {
    throw new Error('IA devolveu resposta fora do formato JSON.');
  }

  const txt = (v: unknown): string => String(v ?? '').trim();
  const reclamacao = txt(json.reclamacao);
  const diagnostico = txt(json.diagnostico);
  const acao = txt(json.acao_tomada);
  if (!reclamacao || !diagnostico || !acao) {
    throw new Error('IA devolveu campos vazios — tente de novo ou preencha manualmente.');
  }
  const obs = txt(json.observacoes);
  return {
    reclamacao,
    diagnostico,
    acao_tomada: acao,
    observacoes: obs && obs.toLowerCase() !== 'null' ? obs : null,
  };
}
