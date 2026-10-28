// DADOS DE EXEMPLO da janela da máquina (ModalMaquina) na página de teste da Hoje. Inventados e
// coerentes com o trator de exemplo: as revisões saem das leituras da própria previsão (as que não
// têm leitura ficam como "faltou"), mais duas OS (uma de revisão com PPV de peças e pós-serviço do
// CRM, outra de manutenção). Nada aqui grava nem lê do banco.
import type { EventoMaquina } from "@/lib/feedbacks/atendimento/maquina";
import { finalChassi, type TratorRevisao } from "@/lib/feedbacks/previsao-revisao";
import type { MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import type { RespostaMaquina } from "../ModalMaquina";

const DIA = 86_400_000;
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00`) + n * DIA).toLocaleDateString("sv-SE");
const ts = (iso: string | null) => (iso ? Date.parse(`${iso}T12:00:00`) : 0);

function ev(x: Partial<EventoMaquina> & Pick<EventoMaquina, "id" | "tipo" | "titulo">): EventoMaquina {
  return { data: null, detalhe: null, horimetro: null, status: null, valor: null, quem: null, ref: { tipo: "nenhum" }, ligados: [], ts: ts(x.data ?? null), ...x };
}

export function historicoMaquinaExemplo(alvo: MaquinaRef): RespostaMaquina {
  const t: TratorRevisao | null = alvo.trator;
  const chassi = alvo.chassi || t?.chassi || "MBNAAFRPXLKG04973";
  const fin = finalChassi(chassi, 6);
  const modelo = t?.modelo || alvo.modelo || "6075";
  const hoje = new Date().toLocaleDateString("sv-SE");
  const entrega = t?.previsao.entregaAnotada || somaDias(hoje, -720);
  const eventos: EventoMaquina[] = [
    ev({ id: "entrega", tipo: "entrega", data: entrega, titulo: `Entrega do ${modelo}`, detalhe: t?.cidade || "Piraju", quem: t?.vendedor || "Dougras" }),
  ];
  for (const x of t?.previsao.validos ?? []) {
    if (!x.revisao) continue;
    eventos.push(ev({ id: `rev-${x.revisao}`, tipo: "revisao", data: x.data, titulo: `Revisão de ${x.revisao}h registrada`, horimetro: x.aprox ? null : x.horas }));
    eventos.push(ev({ id: `chq-${x.revisao}`, tipo: "cheque", data: x.data, titulo: `Cheque de ${x.revisao}h assinado pelo cliente`, status: "assinado", ref: { tipo: "url", href: "#cheque-exemplo", rotulo: "Abrir cheque" } }));
  }
  const ult = t?.previsao.ultimaLeitura?.data || somaDias(hoje, -120);
  const os1 = somaDias(ult, 0), os2 = somaDias(hoje, -40);
  eventos.push(
    ev({ id: "os-OS-5339", tipo: "os", data: os1, titulo: `OS-5339 · Revisão${t?.previsao.ultimaRevisaoFeita ? ` ${t.previsao.ultimaRevisaoFeita}h` : ""}`, detalhe: "Pediu: revisão do plano + barulho na tomada de força. Feito: troca de óleo do motor e da transmissão, filtros, regulagem do freio; TDP sem defeito (folga normal).", horimetro: t?.previsao.ultimaLeitura?.horas ?? 610, status: "Concluída", valor: 1480, quem: "Carlos Técnico", ref: { tipo: "os", id_ordem: "OS-5339", cod_os: null, empresa: "Nova Tratores", ordem_omie: "5339", link_nf: null, nf: null }, ligados: ["PPV-1180"] }),
    ev({ id: "ppv-PPV-1180", tipo: "ppv", data: os1, titulo: "PPV-1180 → PV 20871", detalhe: "Nova Tratores · NF 9921", status: "Faturado", valor: 2236.4, quem: "Carlos Técnico", ref: { tipo: "ppv", id: "PPV-1180" }, ligados: ["OS-5339", "PV 20871"] }),
    ev({ id: "at-1", tipo: "atendimento", data: somaDias(os1, 5), titulo: "Atendimento CRM", detalhe: "Nota 9 · gostou do atendimento, pediu para avisar da próxima revisão.", quem: "Larissa", status: "concluido" }),
    ev({ id: "os-OS-5402", tipo: "os", data: os2, titulo: "OS-5402 · Manutenção", detalhe: "Pediu: vazamento no hidráulico. Feito: troca do retentor do cilindro e da mangueira do levante.", horimetro: null, status: "Concluída", valor: 690, quem: "Marcos Técnico", ref: { tipo: "os", id_ordem: "OS-5402", cod_os: null, empresa: "Nova Tratores", ordem_omie: "5402", link_nf: null, nf: null } }),
  );
  eventos.sort((a, b) => b.ts - a.ts);
  return {
    historico: {
      chassi, eventos, erros: {},
      projetos: [alvo.projeto ?? t?.projeto ?? { nome: `MAHINDRA ${modelo} ${chassi}`, empresa: "Nova Tratores" }],
      horimetro_recente: t?.previsao.ultimaLeitura ? { valor: t.previsao.ultimaLeitura.horas, data: t.previsao.ultimaLeitura.data, origem: "Revisão" } : { valor: 610, data: os1, origem: "Ordem de serviço" },
      maquina: { modelo, dono_tratores: t?.cliente || "Cliente de exemplo", cidade: t?.cidade || "Piraju", vendedor: t?.vendedor || "Dougras", entrega },
    },
    revisao: t,
    avisos: [`Dados de exemplo (chassi …${fin}): nada aqui é real.`],
  };
}
