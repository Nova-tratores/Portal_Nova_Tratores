// DADOS DE EXEMPLO da página de teste do CRM/RFM (José, 23/10/2026: "coloca dados fictícios ali
// pra eu entender como vai ficar"). Nomes e telefones inventados; as datas andam junto com o dia de
// hoje, então cada cliente cai sempre na mesma situação da fila (ligar hoje, esperar, atrasado…).
import type { FeedbackRegistro, Tentativa, TipoFeedback } from "@/lib/feedbacks/types";
import type { FeedbackDoServico as FeedbackDoServicoT, UltimoServico as UltimoServicoT } from "@/lib/feedbacks/ultimo-servico";
import { contatoVazio, preverRevisao, type ContatoRevisao, type PontoHorimetro, type TratorRevisao } from "@/lib/feedbacks/previsao-revisao";

const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(Date.now() - n * DIA).toLocaleDateString("sv-SE");
const diasFrente = (n: number) => new Date(Date.now() + n * DIA).toLocaleDateString("sv-SE");
const tentativas = (...dias: number[]): Tentativa[] => dias.map((d) => ({ data: new Date(Date.now() - d * DIA).toISOString(), canal: "telefone" as const }));

function base(id: number, tipo: TipoFeedback, x: Partial<FeedbackRegistro>): FeedbackRegistro {
  return {
    id, tipo, nome: "", telefone: null, email: null, trator: null, tecnico: null, codigo_omie: null, data_contato: null,
    servico: null, data_servico: null, status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null,
    ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [],
    atendente_id: null, atendente_nome: null, aberto_em: null, concluido_em: null, status_atendimento: "aberto", arquivado_motivo: null,
    origem_dados: "Exemplo", criado_em: diasAtras(10), atualizado_em: diasAtras(1), ...x,
  };
}

function crm(): FeedbackRegistro[] {
  let id = -100;
  const c = (x: Partial<FeedbackRegistro>) => base(id--, "crm", { origem_auto: "os_faturada", ...x });
  return [
    c({ nome: "ANTONIO CARLOS PEREIRA (SÍTIO BOA VISTA)", telefone: "(14) 99811-2030", trator: "6075 · Chassi 4512873", tecnico: "Gabriel Moraes",
      servico: "Revisão de 300 horas", faturado_em: diasAtras(4), data_servico: diasAtras(4), os_valor: 3480, os_ref: "NOVA:5401" }),
    c({ nome: "MARIA HELENA SOUZA (FAZENDA SANTA RITA)", telefone: "(14) 99702-5511", trator: "9500 · Chassi 1188420", tecnico: "Danilo de Souza",
      servico: "Troca de embreagem e regulagem do levante", faturado_em: diasAtras(5), data_servico: diasAtras(5), os_valor: 8920, os_ref: "NOVA:5398" }),
    c({ nome: "JOSÉ ROBERTO LIMA", telefone: "(14) 98123-4477", trator: "Jivo 245 · Chassi 7720155", tecnico: "Fernando Leonel",
      servico: "Revisão de 50 horas", faturado_em: diasAtras(3), data_servico: diasAtras(3), os_valor: 420, os_ref: "NOVA:5410" }),
    c({ nome: "PAULO SÉRGIO ANDRADE (CHÁCARA DO RIO)", telefone: "(14) 99655-0098", trator: "6065 · Chassi 3305871", tecnico: "Gabriel Moraes",
      servico: "Vazamento no hidráulico", faturado_em: diasAtras(6), data_servico: diasAtras(6), os_valor: 1650, os_ref: "NOVA:5395",
      status_cliente: "Insatisfeito", feedback: "Ligou na loja reclamando que voltou a vazar." }),
    c({ nome: "LUIZ FERNANDO CAMPOS", telefone: "(14) 99140-7712", trator: "6075 · Chassi 4499012", tecnico: "Danilo de Souza",
      servico: "Revisão de 600 horas", faturado_em: diasAtras(10), data_servico: diasAtras(10), os_valor: 2980, os_ref: "NOVA:5380" }),
    c({ nome: "AGROPECUÁRIA TRÊS IRMÃOS LTDA", telefone: "(14) 3351-8890", trator: "9500 · Chassi 1190035", tecnico: "José Antonio de Oliveira",
      servico: "Troca do radiador", faturado_em: diasAtras(22), data_servico: diasAtras(22), os_valor: 5400, os_ref: "CASTRO:812" }),
    c({ nome: "BENEDITO APARECIDO RAMOS", telefone: "(14) 99877-3321", trator: "6065 · Chassi 3301277", tecnico: "Fernando Leonel",
      servico: "Revisão de 300 horas", faturado_em: diasAtras(6), data_servico: diasAtras(6), os_valor: 3100, os_ref: "NOVA:5397",
      status_atendimento: "em_andamento", tentativas: tentativas(0.1) }),
    c({ nome: "CLAUDIO MARCOS VIEIRA", telefone: "(14) 99234-6650", trator: "Jivo 225 · Chassi 7718800", tecnico: "Gabriel Moraes",
      servico: "Troca de pneus dianteiros", faturado_em: diasAtras(9), data_servico: diasAtras(9), os_valor: 2200, os_ref: "NOVA:5385",
      status_atendimento: "sem_resposta", sem_resposta: true, tentativas: tentativas(3, 2, 1) }),
    c({ nome: "SEBASTIÃO DOS SANTOS (SÍTIO SÃO JOÃO)", telefone: "(14) 98877-1100", trator: "6075 · Chassi 4513390", tecnico: "Danilo de Souza",
      servico: "Revisão de 900 horas", faturado_em: diasAtras(1), data_servico: diasAtras(1), os_valor: 4100, os_ref: "NOVA:5415" }),
    c({ nome: "ROSANGELA MARTINS", telefone: "(14) 99766-4420", trator: "6065 · Chassi 3307721", tecnico: "José Antonio de Oliveira",
      servico: "Reparo no câmbio", faturado_em: diasAtras(8), data_servico: diasAtras(8), os_valor: 6300, os_ref: "NOVA:5388",
      status_atendimento: "em_andamento", tentativas: tentativas(2), proximo_contato_em: diasFrente(3), feedback: "Pediu para ligar depois que voltar da colheita." }),
    c({ nome: "GERALDO NUNES DE OLIVEIRA", telefone: "(14) 99321-0099", trator: "9500 · Chassi 1187744", tecnico: "Fernando Leonel",
      servico: "Revisão de 300 horas", faturado_em: diasAtras(12), data_servico: diasAtras(12), os_valor: 3350, os_ref: "NOVA:5371",
      status_atendimento: "concluido", concluido_em: new Date(Date.now() - 2 * DIA).toISOString(), data_contato: diasAtras(2),
      nota: 10, status_cliente: "Satisfeito", nps: "Sim", feedback: "Gostou muito do técnico, explicou tudo." }),
    c({ nome: "VALDIR COSTA (FAZENDA PRIMAVERA)", telefone: "(14) 99555-8812", trator: "6075 · Chassi 4500561", tecnico: "Gabriel Moraes",
      servico: "Troca da bomba injetora", faturado_em: diasAtras(14), data_servico: diasAtras(14), os_valor: 7800, os_ref: "NOVA:5360",
      status_atendimento: "concluido", concluido_em: new Date(Date.now() - 4 * DIA).toISOString(), data_contato: diasAtras(4),
      nota: 5, status_cliente: "Insatisfeito", nps: "Não", melhoria: "Prazo", feedback: "Achou que demorou demais para a peça chegar." }),
  ];
}

function rfm(): FeedbackRegistro[] {
  let id = -200;
  const r = (x: Partial<FeedbackRegistro>) => base(id--, "rfm", x);
  return [
    r({ nome: "OSVALDO PIRES (FAZENDA ÁGUA LIMPA)", telefone: "(14) 99410-2266", trator: "6075 · Chassi 4401120", tecnico: "Gabriel Moraes",
      ultimo_servico: diasAtras(400), prioridade: "Urgente" }),
    r({ nome: "MÁRCIO ALVES DE LIMA", telefone: "(14) 99133-8701", trator: "9500 · Chassi 1100287", tecnico: "Danilo de Souza",
      ultimo_servico: diasAtras(250), prioridade: "Urgente" }),
    r({ nome: "SÍTIO SANTA LUZIA AGRO LTDA", telefone: "(14) 3352-1144", trator: "6065 · Chassi 3200991", tecnico: "Fernando Leonel",
      ultimo_servico: diasAtras(320), prioridade: "Normal" }),
    r({ nome: "JOÃO BATISTA FERREIRA", telefone: "(14) 98765-2210", trator: "Jivo 245 · Chassi 7600123",
      ultimo_servico: diasAtras(500), prioridade: "Normal", status_atendimento: "em_andamento", tentativas: tentativas(0.2) }),
    r({ nome: "ADEMIR ROCHA", telefone: "(14) 99600-7788", trator: "6075 · Chassi 4390012", tecnico: "José Antonio de Oliveira",
      ultimo_servico: diasAtras(700), prioridade: "Inativo" }),
    r({ nome: "NEUSA APARECIDA MOURA", telefone: "(14) 99288-5533", trator: "6065 · Chassi 3199870",
      ultimo_servico: diasAtras(380), prioridade: "Normal", status_atendimento: "sem_resposta", sem_resposta: true, tentativas: tentativas(5, 3, 1) }),
    r({ nome: "EDSON LUIZ TEIXEIRA", telefone: "(14) 99377-4410", trator: "9500 · Chassi 1099554", tecnico: "Gabriel Moraes",
      ultimo_servico: diasAtras(290), prioridade: "Urgente", proximo_contato_em: diasFrente(5), feedback: "Está vendo de trocar o trator; pediu retorno semana que vem." }),
    r({ nome: "FRANCISCO DAS CHAGAS", telefone: "(14) 98812-0045", trator: "6075 · Chassi 4388001",
      ultimo_servico: diasAtras(420), prioridade: "Normal", status_atendimento: "concluido", concluido_em: new Date(Date.now() - 3 * DIA).toISOString(),
      data_contato: diasAtras(3), motivo: "Mudou de oficina por causa da distância", acao: "Oferecer revisão com deslocamento incluso" }),
  ];
}

export function registrosExemplo(tipo: TipoFeedback): FeedbackRegistro[] {
  return tipo === "crm" ? crm() : rfm();
}

// Último serviço inventado de cada cliente do RFM de exemplo — cada um num caso de feedback.
const SERVICOS_EX: Array<{ pedido: string; feito: string; itens: Array<[string, number, number]>; fb: "bom" | "ruim" | "sem" | "nao_atendeu" | "nunca" }> = [
  { pedido: "Revisão de 1200 horas", feito: "Troca de óleos e filtros, regulagem de válvulas e limpeza do radiador.", itens: [["Hora Trabalhada", 6, 200], ["Deslocamento por KM", 84, 3.6], ["REGULAGEM DE VÁLVULAS", 1, 350]], fb: "ruim" },
  { pedido: "Trator não liga de manhã", feito: "Troca do motor de partida e da bateria; teste de carga do alternador.", itens: [["Hora Trabalhada", 3, 200], ["Deslocamento por KM", 120, 3.6]], fb: "nunca" },
  { pedido: "Vazamento no comando hidráulico", feito: "Troca dos retentores do comando e do anel o-ring da válvula.", itens: [["Hora Trabalhada", 4, 200], ["MANUTENÇÃO HIDRÁULICA", 1, 280]], fb: "bom" },
  { pedido: "Revisão de 300 horas", feito: "Troca de óleo do motor, filtros de óleo e combustível; engraxamento geral.", itens: [["Hora Trabalhada", 2, 200], ["Deslocamento por KM", 60, 3.6]], fb: "nao_atendeu" },
  { pedido: "Barulho na tração dianteira", feito: "Troca dos rolamentos e retentores da tração e da cruzeta do cardan.", itens: [["Hora Trabalhada", 9, 200], ["Deslocamento por KM", 140, 3.6], ["ENCHER O EIXO", 1, 175]], fb: "sem" },
  { pedido: "Revisão de 600 horas", feito: "Troca de óleos, filtros e correia do alternador.", itens: [["Hora Trabalhada", 2, 200]], fb: "bom" },
  { pedido: "Ar condicionado não gela", feito: "Carga de gás, troca do filtro da cabine e limpeza do condensador.", itens: [["Hora Trabalhada", 2, 200], ["MANUTENÇÃO ELÉTRICA", 1, 240]], fb: "nunca" },
  { pedido: "Levante hidráulico não segura", feito: "Troca do kit de vedação do pistão do levante.", itens: [["Hora Trabalhada", 5, 200], ["Deslocamento por KM", 96, 3.6]], fb: "ruim" },
];

export function exemploUltimoServico(r: FeedbackRegistro): { u: UltimoServicoT; fb: FeedbackDoServicoT } {
  const i = Math.abs(r.id) % SERVICOS_EX.length;
  const ex = SERVICOS_EX[i];
  const itens = ex.itens.map(([desc, qtd, valor]) => ({ desc, qtd, valor, total: Math.round(qtd * valor * 100) / 100, tipo: (/hora/i.test(desc) ? "hora" : /km/i.test(desc) ? "km" : "outro") as "hora" | "km" | "outro" }));
  const [modelo, chassi] = String(r.trator || "").split(" · Chassi ");
  const u: UltimoServicoT = {
    numOs: String(4800 + i * 37), osRef: `NOVA:${4800 + i * 37}`, empresa: "Nova Tratores", data: r.ultimo_servico, faturada: true, situacao: "Faturada",
    valor: itens.reduce((s, x) => s + x.total, 0) + 640, numNf: String(700 + i), linkNf: null, modelo: modelo || null, chassi: chassi || null,
    horimetro: String(1180 + i * 213), solicitacao: ex.pedido, realizado: ex.feito, tecnico: r.tecnico || "Gabriel Moraes", itens, totalOS: 3 + i,
  };
  const crm = base(r.id - 1000, "crm", { nome: r.nome, data_servico: r.ultimo_servico, atendente_nome: "Vinicius Correa", data_contato: r.ultimo_servico });
  const fb: FeedbackDoServicoT =
    ex.fb === "bom" ? { tipo: "respondeu", registro: { ...crm, status_atendimento: "concluido", nota: 9, status_cliente: "Satisfeito", nps: "Sim", feedback: "Serviço rápido, o técnico foi muito atencioso." } }
    : ex.fb === "ruim" ? { tipo: "respondeu", registro: { ...crm, status_atendimento: "concluido", nota: 4, status_cliente: "Insatisfeito", nps: "Não", melhoria: "Preço", feedback: "Achou caro e o problema voltou depois de um mês." } }
    : ex.fb === "nao_atendeu" ? { tipo: "sem_resposta", registro: { ...crm, status_atendimento: "sem_resposta", sem_resposta: true, tentativas: tentativas(3, 2, 1) } }
    : ex.fb === "sem" ? { tipo: "arquivado", registro: { ...crm, status_atendimento: "arquivado", arquivado_motivo: "telefone errado" } }
    : { tipo: "nenhum" };
  return { u, fb };
}

// ─── Aba "Revisões" do RFM: tratores inventados, um por caso da previsão ────────────────────────
// Leituras em "dias atrás" (andam com o dia de hoje); a previsão é calculada pela mesma regra dos
// dados reais (lib/feedbacks/previsao-revisao).
type Leit = [diasAtras: number, horas: number, fonte?: PontoHorimetro["fonte"], revisao?: number];
const TRATORES_EX: Array<{ cli: string; tel: string | null; modelo: string; chassi: string; cidade: string; vend: string; entrega: number; leit: Leit[]; caso: string }> = [
  { caso: "atrasada", cli: "ANTONIO CARLOS PEREIRA (SÍTIO BOA VISTA)", tel: "(14) 99811-2030", modelo: "6075E CAB", chassi: "MDI07513LS0004512", cidade: "PIRAJU", vend: "DOUGRAS", entrega: 350,
    leit: [[324, 52, "revisao", 50], [200, 302, "revisao", 300], [199, 300, "envio", 300]] },
  { caso: "vence em 10 dias · uso alto", cli: "MARIA HELENA SOUZA (FAZENDA SANTA RITA)", tel: "(14) 99702-5511", modelo: "9500S CAB", chassi: "MDI09524CM0001188", cidade: "FARTURA", vend: "JOAQUIM", entrega: 215,
    leit: [[203, 50, "revisao", 50], [140, 302, "cheque", 300], [100, 461, "os"], [65, 602, "revisao", 600]] },
  { caso: "vence em 3 meses · uso baixo", cli: "JOSÉ ROBERTO LIMA", tel: "(14) 98123-4477", modelo: "JIVO 2025", chassi: "MBNYHBKYVPNL07720", cidade: "TEJUPÁ", vend: "FERNANDO", entrega: 1110,
    leit: [[1010, 50, "revisao", 50], [510, 300, "revisao", 300], [270, 420, "os"]] },
  { caso: "sem nenhuma revisão (entregue há pouco)", cli: "PAULO SÉRGIO ANDRADE (CHÁCARA DO RIO)", tel: "(14) 99655-0098", modelo: "5050", chassi: "MBNUZA2WFPZK00331", cidade: "SARUTAIÁ", vend: "DOUGRAS", entrega: 40, leit: [] },
  { caso: "leitura incoerente descartada", cli: "LUIZ FERNANDO CAMPOS", tel: "(14) 99140-7712", modelo: "6075", chassi: "MBNYHBKYVNNJ04499", cidade: "PIRAJU", vend: "JOAQUIM", entrega: 500,
    leit: [[470, 55, "revisao", 50], [330, 310, "revisao", 300], [250, 3100, "os"], [170, 612, "revisao", 600], [168, 600, "envio", 600]] },
  { caso: "parou de fazer na loja", cli: "AGROPECUÁRIA TRÊS IRMÃOS LTDA", tel: "(14) 3351-8890", modelo: "9500S", chassi: "MDI09501EN0001190", cidade: "TIMBURI", vend: "FERNANDO", entrega: 1500,
    leit: [[1460, 50, "revisao", 50], [1200, 298, "revisao", 300]] },
  { caso: "nunca fez revisão na loja", cli: "BENEDITO APARECIDO RAMOS", tel: null, modelo: "6065", chassi: "TNNXTODSL0003301", cidade: "IPAUSSU", vend: "JOAQUIM", entrega: 900, leit: [] },
  { caso: "vence em 25 dias · já tentou 2 vezes", cli: "CLAUDIO MARCOS VIEIRA", tel: "(14) 99234-6650", modelo: "JIVO 2025", chassi: "MBNYHBKYVPNL07718", cidade: "PIRAJU", vend: "DOUGRAS", entrega: 575,
    leit: [[525, 50, "revisao", 50], [275, 300, "revisao", 300]] },
  { caso: "remarcado pelo cliente", cli: "ROSANGELA MARTINS", tel: "(14) 99766-4420", modelo: "6075E", chassi: "MDI07508CN0003307", cidade: "FARTURA", vend: "FERNANDO", entrega: 205,
    leit: [[190, 50, "revisao", 50], [105, 305, "cheque", 300]] },
  { caso: "revisão já agendada", cli: "GERALDO NUNES DE OLIVEIRA", tel: "(14) 99321-0099", modelo: "6075E CAB", chassi: "MDI07513LS0001877", cidade: "PIRAJU", vend: "JOAQUIM", entrega: 400,
    leit: [[380, 50, "revisao", 50], [250, 300, "revisao", 300], [90, 590, "os"]] },
];

export function tratoresExemplo(agora = Date.now()): TratorRevisao[] {
  return TRATORES_EX.map((x, i) => {
    const pontos: PontoHorimetro[] = x.leit.map(([d, h, fonte = "revisao", revisao]) => ({
      data: diasAtras(d), horas: h, fonte, revisao: revisao ?? null, aprox: fonte === "envio",
      rotulo: fonte === "os" ? `OS ${5300 + i * 7 + d % 5}` : fonte === "cheque" ? `Cheque ${revisao} h` : fonte === "envio" ? `Envio do cheque ${revisao} h` : `Revisão ${revisao} h`,
    }));
    const feitas = x.leit.filter((l) => l[2] !== "os" && l[2] !== "envio" && l[3]).map((l) => l[3] as number);
    return {
      id: String(-300 - i), modelo: x.modelo, chassi: x.chassi, cliente: x.cli, cidade: x.cidade, vendedor: x.vend, telefone: x.tel, codigo_omie: null,
      // projeto Omie inventado (um em cada três fica sem, como na vida real)
      projeto: i % 3 === 2 ? null : { nome: `MAHINDRA ${x.modelo} ${x.chassi}`, empresa: i % 4 === 1 ? "Castro Pecas" : "Nova Tratores" },
      previsao: preverRevisao({ entrega: diasAtras(x.entrega), pontos, revisoesFeitas: feitas }, agora),
    };
  });
}

/** O "caso" que cada trator de exemplo mostra (aparece na ficha). */
export const casoExemplo = (id: string) => TRATORES_EX[-300 - Number(id)]?.caso ?? null;

export function contatosExemplo(tratores: TratorRevisao[]): Record<string, ContatoRevisao> {
  const out: Record<string, ContatoRevisao> = {};
  const por = (i: number, x: Partial<ContatoRevisao>) => { const t = tratores[i]; if (t) out[t.id] = { ...contatoVazio(t.id), revisao: t.previsao.revisaoOferta, ...x }; };
  por(7, { tentativas: tentativas(2, 1) });
  por(8, { tentativas: tentativas(3), proximo_contato_em: diasFrente(4), motivo: "Pediu para ligar depois da colheita." });
  por(9, { status: "agendada", data_agendada: diasFrente(6), concluido_em: new Date(Date.now() - DIA).toISOString(), motivo: "Agendada com o Gabriel" });
  return out;
}
