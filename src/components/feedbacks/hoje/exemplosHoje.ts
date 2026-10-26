// DADOS DE EXEMPLO da tela "Hoje" (página de teste /feedbacks/crm/teste/hoje — José, 23/10/2026).
// Reaproveita os clientes inventados do CRM, do RFM e das revisões (fila/exemplos.ts — os mesmos
// nomes aparecem em mais de uma fonte, de propósito) e soma oportunidades do robô e alguns clientes
// novos, para cobrir todos os tipos de motivo e as combinações: pós-serviço + revisão + peças,
// retorno combinado vencido e para outro dia, só peças, só cadastro, sem telefone, já feito hoje…
// As datas andam com o dia de hoje. Nada aqui grava em lugar nenhum.
import type { FeedbackRegistro, Oportunidade, RegraOportunidade } from "@/lib/feedbacks/types";
import { montarFilaRevisoes, type ContatoRevisao, type TratorRevisao } from "@/lib/feedbacks/previsao-revisao";
import type { ChamadaHoje } from "@/lib/feedbacks/hoje-painel";
import { contatosExemplo, registrosExemplo, tratoresExemplo } from "../fila/exemplos";

const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(Date.now() - n * DIA).toLocaleDateString("sv-SE");
const iso = (diasAtrasN: number, hora = 10) => { const d = new Date(Date.now() - diasAtrasN * DIA); d.setHours(hora, 15, 0, 0); return d.toISOString(); };

let opId = -500;
function op(regra: RegraOportunidade, cliente: string, codigo: string | null, x: Partial<Oportunidade> = {}): Oportunidade {
  return {
    id: opId--, regra, codigo_omie: codigo, cliente_nome: cliente, trator: null, chassis: null, detalhes: {}, prioridade: "Normal", status: "aberta",
    atendida_por: null, atendida_em: null, feedback_id: null, dispensada_motivo: null, computado_em: iso(0, 6), ...x,
  };
}

function registroExtra(id: number, x: Partial<FeedbackRegistro>): FeedbackRegistro {
  return {
    id, tipo: "rfm", nome: "", telefone: null, email: null, trator: null, tecnico: null, codigo_omie: null, data_contato: null,
    servico: null, data_servico: null, status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null,
    ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [],
    atendente_id: null, atendente_nome: null, aberto_em: iso(20), concluido_em: null, status_atendimento: "aberto", arquivado_motivo: null,
    origem_dados: "Exemplo", criado_em: iso(20), atualizado_em: iso(3), ...x,
  };
}

export interface DadosHojeExemplo {
  registros: FeedbackRegistro[];
  oportunidades: Oportunidade[];
  tratores: TratorRevisao[];
  contatos: Record<string, ContatoRevisao>;
  cadastro: Record<string, { telefone: string | null; email: string | null; cidade: string | null }>;
  tags: Record<string, string[]>;
  chamadas: ChamadaHoje[];
  nomes: Record<string, string>;
}

export function dadosHojeExemplo(): DadosHojeExemplo {
  opId = -500;
  const registros: FeedbackRegistro[] = [
    ...registrosExemplo("crm"),
    ...registrosExemplo("rfm"),
    // retorno combinado que já passou (vence há 2 dias) + peças
    registroExtra(-260, { nome: "VANDERLEI ROCHA (SÍTIO TRÊS PEDRAS)", telefone: "(14) 99512-7730", trator: "6065 · Chassi 3290011", tecnico: "Danilo de Souza",
      ultimo_servico: diasAtras(240), prioridade: "Normal", status_atendimento: "em_andamento", proximo_contato_em: diasAtras(2), feedback: "Pediu para ligar depois do dia 20, quando recebe a safra." }),
    // concluído hoje (conta em "feitos hoje")
    registroExtra(-261, { tipo: "crm", nome: "IVONE DIAS (FAZENDA RECANTO)", telefone: "(14) 99701-0042", servico: "Revisão de 600 horas", data_servico: diasAtras(6),
      status_atendimento: "concluido", concluido_em: new Date(Date.now() - 2 * 3600_000).toISOString(), data_contato: diasAtras(0), nota: 9, status_cliente: "Satisfeito", nps: "Sim", atendente_nome: "Larissa Mendes" }),
    // nota baixa de semana passada (Painel: notas baixas para tratar)
    registroExtra(-262, { tipo: "crm", nome: "CÍCERO BATISTA", telefone: "(14) 99340-6611", servico: "Troca do alternador", data_servico: diasAtras(14),
      status_atendimento: "concluido", concluido_em: iso(8), data_contato: diasAtras(8), nota: 3, status_cliente: "Insatisfeito", nps: "Não", melhoria: "Atendimento",
      feedback: "Disse que ninguém avisou que a peça ia atrasar.", atendente_nome: "Vinicius Correa" }),
    // RFM parado há 40 dias (Painel: coisas paradas)
    registroExtra(-263, { nome: "ODAIR MARTINS FILHO", telefone: "(14) 99620-3388", trator: "Jivo 245 · Chassi 7601190", ultimo_servico: diasAtras(420), prioridade: "Normal",
      status_atendimento: "em_andamento", atendente_nome: "Thiago Alves", atualizado_em: iso(40), tentativas: [{ data: iso(40), canal: "telefone" }] }),
  ];

  const oportunidades: Oportunidade[] = [
    // pós-serviço + revisão atrasada + peças no mesmo cliente
    op("R5_pecas", "ANTONIO CARLOS PEREIRA (SÍTIO BOA VISTA)", null, { detalhes: { meses_sem_pedido: 13, ultimo_pedido_numero: "3720" } }),
    op("R6_fora_garantia", "MARIA HELENA SOUZA (FAZENDA SANTA RITA)", null, { trator: "9500S CAB", detalhes: { tipo: "Trator" } }),
    op("R8_cadastro", "PAULO SÉRGIO ANDRADE (CHÁCARA DO RIO)", null, { detalhes: { faltando: ["email"] } }),
    op("R7_garantia_risco", "LUIZ FERNANDO CAMPOS", null, { trator: "6075", detalhes: { cheque_rotulo: "600h", data_limite: new Date(Date.now() + 18 * DIA).toISOString() } }),
    op("R5_pecas", "OSVALDO PIRES (FAZENDA ÁGUA LIMPA)", null, { detalhes: { meses_sem_pedido: 26 }, prioridade: "Urgente" }),
    op("R3_upsell", "OSVALDO PIRES (FAZENDA ÁGUA LIMPA)", null, { detalhes: { meses_sem_pedido: 26 } }),
    op("R2_sem_os", "MÁRCIO ALVES DE LIMA", null, { detalhes: { dias_sem_atividade: 210 } }),
    op("R5_pecas", "EDSON LUIZ TEIXEIRA", null, { detalhes: { meses_sem_pedido: 9 } }),
    op("R5_pecas", "VANDERLEI ROCHA (SÍTIO TRÊS PEDRAS)", null, { detalhes: { meses_sem_pedido: 11 } }),
    op("R6_fora_garantia", "AGROPECUÁRIA TRÊS IRMÃOS LTDA", null, { trator: "9500S", detalhes: { tipo: "Trator" } }),
    // clientes que só têm oportunidade do robô
    op("R1_revisao", "RENATO CÉSAR BUENO", "EX-1", { prioridade: "Urgente", trator: "6075E", detalhes: { revisao_alvo: "300 h" } }),
    op("R4_followup", "HÉLIO TAKAHASHI (SÍTIO SOL NASCENTE)", "EX-2"),
    op("R5_pecas", "AGRÍCOLA VALE DO PARANAPANEMA LTDA", "EX-3", { detalhes: { meses_sem_pedido: 18 } }),
    op("R6_fora_garantia", "AGRÍCOLA VALE DO PARANAPANEMA LTDA", "EX-3", { trator: "ROÇADEIRA KAMAQ", detalhes: { tipo: "Implemento" } }),
    op("R8_cadastro", "LUCIANA PRADO (SÍTIO SERRINHA)", "EX-4", { prioridade: "Baixa", detalhes: { faltando: ["telefone", "email"] } }),
    op("R6_fora_garantia", "CARLOS ALBERTO MENDES", "EX-5", { trator: "GRADE TATU", detalhes: { tipo: "Implemento" } }),
    op("R5_pecas", "JOAQUIM PEDROSO", "EX-6", { detalhes: { meses_sem_pedido: 7 } }),
    op("R2_sem_os", "JOAQUIM PEDROSO", "EX-6", { detalhes: { dias_sem_atividade: 150 } }),
    // atendida hoje (feitos hoje) e cliente "Não contatar" (fica fora)
    op("R5_pecas", "BRUNO HENRIQUE SALES", "EX-7", { status: "atendida", atendida_em: new Date(Date.now() - 3600_000).toISOString(), atendida_por: "u-tiago" }),
    op("R5_pecas", "SEBASTIÃO RIBEIRO (NÃO CONTATAR)", "EX-8", { detalhes: { meses_sem_pedido: 30 } }),
  ];

  const cadastro = {
    "EX-1": { telefone: "(14) 99880-1201", email: "renato.bueno@exemplo.com", cidade: "PIRAJU" },
    "EX-2": { telefone: "(14) 99761-4455", email: null, cidade: "TEJUPÁ" },
    "EX-3": { telefone: "(14) 3352-7700", email: "compras@valeparanapanema.exemplo", cidade: "FARTURA" },
    "EX-4": { telefone: null, email: null, cidade: "SARUTAIÁ" },
    "EX-5": { telefone: "(14) 99222-0303", email: null, cidade: "TIMBURI" },
    "EX-6": { telefone: "(14) 98110-7788", email: null, cidade: "IPAUSSU" },
    "EX-7": { telefone: "(14) 99300-1122", email: null, cidade: "PIRAJU" },
    "EX-8": { telefone: "(14) 99300-0000", email: null, cidade: "PIRAJU" },
  };

  const tratores = tratoresExemplo();
  const contatos = contatosExemplo(tratores);

  const h = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  let n = 0;
  const ch = (pessoa: string, id: string, diasAtrasN: number, desfecho: ChamadaHoje["desfecho"], aberta = false, minutosAtras = 0): ChamadaHoje => ({
    id: `ex-${n++}`, atendente_id: id, atendente_nome: pessoa, cliente_key: `nome_EXEMPLO ${n}`, feedback_id: null, oportunidade_id: null,
    iniciada_em: aberta ? h(minutosAtras) : iso(diasAtrasN, 9 + (n % 7)), encerrada_em: aberta ? null : iso(diasAtrasN, 9 + (n % 7)), duracao_seg: aberta ? null : 120 + (n % 5) * 60,
    desfecho: aberta ? null : desfecho, humor_cliente: aberta ? null : 3 + (n % 3), qualidade_conversa: aberta ? null : 4,
  });
  const chamadas: ChamadaHoje[] = [
    ch("Vinicius Correa", "u-vini", 0, null, true, 6),
    ch("Larissa Mendes", "u-lari", 0, null, true, 2),
    ch("Thiago Alves", "u-tiago", 0, null, true, 170), // esquecida aberta
    ...["servico_agendado", "sem_resposta", "retornar", "vendeu", "sem_resposta", "recusou"].map((d) => ch("Vinicius Correa", "u-vini", 0, d as ChamadaHoje["desfecho"])),
    ...["sem_resposta", "servico_agendado", "retornar", "sem_resposta"].map((d) => ch("Larissa Mendes", "u-lari", 0, d as ChamadaHoje["desfecho"])),
    ...["vendeu", "sem_resposta"].map((d) => ch("Thiago Alves", "u-tiago", 0, d as ChamadaHoje["desfecho"])),
    ...[1, 1, 2, 2, 3, 3, 4, 5, 5, 6].map((d, i) => ch(i % 3 === 0 ? "Larissa Mendes" : i % 3 === 1 ? "Vinicius Correa" : "Thiago Alves", "u", d,
      (["servico_agendado", "sem_resposta", "retornar", "recusou", "vendeu"] as const)[i % 5])),
  ];

  return {
    registros, oportunidades, tratores, contatos, cadastro, chamadas,
    tags: { "omie_EX-8": ["Não contatar"] },
    nomes: { "u-tiago": "Thiago Alves", "u-vini": "Vinicius Correa", "u-lari": "Larissa Mendes" },
  };
}

/** Itens de revisão prontos (mesma regra dos dados reais). */
export const revisoesExemplo = (d: DadosHojeExemplo) => montarFilaRevisoes(d.tratores, d.contatos);
