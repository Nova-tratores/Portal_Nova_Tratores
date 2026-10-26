import { describe, it, expect } from "vitest";
import {
  avaliarRevisao, contatoVazio, dataISO, entregaEfetiva, horimetroDoTexto, chassiDoTexto, limparPontos, mediaUso, mensagemRevisao, montarFilaRevisoes,
  normNome, numeroHorimetro, pontosDaTabela, preverRevisao, revisaoAPartirDe, revisaoSeguinte, MEDIA_PADRAO_H_DIA,
  type PontoHorimetro, type TratorRevisao,
} from "../previsao-revisao";

const AGORA = Date.parse("2026-10-23T12:00:00-03:00");
const pt = (data: string, horas: number, x: Partial<PontoHorimetro> = {}): PontoHorimetro => ({ data, horas, fonte: "revisao", rotulo: "x", ...x });
const trator = (previsao: TratorRevisao["previsao"], x: Partial<TratorRevisao> = {}): TratorRevisao => ({
  id: "1", modelo: "6075E", chassi: "MDI0751300001234", cliente: "JOAO DA SILVA", cidade: null, vendedor: null, telefone: "(14) 99812-3344", codigo_omie: null, previsao, ...x,
});

describe("leitura dos campos", () => {
  it("datas nos dois formatos e horímetros BR/US", () => {
    expect(dataISO("28/02/2019")).toBe("2019-02-28");
    expect(dataISO("2019-02-28")).toBe("2019-02-28");
    expect(dataISO("31/13/2020")).toBeNull();
    expect(numeroHorimetro("304,3")).toBe(304.3);
    expect(numeroHorimetro("59.8")).toBe(59.8);
    expect(numeroHorimetro("1.234")).toBe(1234);
    expect(numeroHorimetro("1.234,5")).toBe(1234.5);
    expect(numeroHorimetro("9999H")).toBe(9999);
    expect(numeroHorimetro("609 h")).toBe(609);
    expect(numeroHorimetro("CLIENTE FEZ POR CONTA")).toBeNull();
  });
  it("horímetro e chassi no texto da OS", () => {
    expect(horimetroDoTexto("TRATOR 6075|CHASSI MBNY02352|HORIMETRO 175H|TROCA")).toBe(175);
    expect(horimetroDoTexto("Modelo: 6075 |Chassis: MBNYHBKYVKND00219|Horimetro: 3077,7|x")).toBe(3077.7);
    expect(horimetroDoTexto("9500S|HORIMETRO: 1800|")).toBe(1800);
    expect(horimetroDoTexto("troca de óleo")).toBeNull();
    expect(chassiDoTexto("Chassis: MBNYHBKYVKND00219|Horimetro")).toBe("MBNYHBKYVKND00219");
  });
  it("nome sem acento, sem parênteses e sem LTDA", () => {
    expect(normNome("José Antônio (Sítio Boa Vista)")).toBe("JOSE ANTONIO");
    expect(normNome("AGRO TRÊS IRMÃOS LTDA")).toBe("AGRO TRES IRMAOS");
  });
  it("sequência 50, 300, 600… de 300 em 300", () => {
    expect(revisaoSeguinte(0)).toBe(50);
    expect(revisaoSeguinte(50)).toBe(300);
    expect(revisaoSeguinte(3000)).toBe(3300);
    expect(revisaoAPartirDe(1450)).toBe(1500);
    expect(revisaoAPartirDe(30)).toBe(50);
  });
  it("revisões da tabela: com horímetro é leitura; só com data é aproximação", () => {
    const r = pontosDaTabela({ Entrega: "01/01/2025", "50h Data": "01/02/2025", "50h Horimetro": "52", "300h Data": "01/08/2025", "300h Horimetro": null });
    expect(r.feitas).toEqual([50, 300]);
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[1]).toMatchObject({ fonte: "revisao_sem_horimetro", horas: 300, aprox: true });
  });
});

describe("leituras incoerentes", () => {
  it("futuro, antes da entrega, não bate com a revisão e uso impossível saem com o motivo", () => {
    const { validos, descartados } = limparPontos("2025-01-01", [
      pt("2027-01-01", 900), pt("2024-12-01", 10), pt("2025-06-01", 3000, { revisao: 300 }), pt("2025-01-03", 300), pt("2025-07-01", 320, { revisao: 300 }),
    ], "2026-10-23");
    expect(validos.map((p) => p.horas)).toEqual([320]);
    expect(descartados.map((d) => d.motivo)).toEqual(expect.arrayContaining([
      "data no futuro", "data antes da entrega", expect.stringContaining("não bate com a revisão de 300 h"), expect.stringContaining("uso impossível"),
    ]));
  });
  it("horímetro que volta: sai só o ponto fora da curva, não os que vieram depois", () => {
    const { validos, descartados } = limparPontos("2024-01-01", [
      pt("2024-03-01", 60), pt("2024-09-01", 3100), pt("2025-01-01", 310), pt("2025-08-01", 620),
    ], "2026-10-23");
    expect(validos.map((p) => p.horas)).toEqual([60, 310, 620]);
    expect(descartados).toHaveLength(1);
    expect(descartados[0].horas).toBe(3100);
  });
  it("a mesma leitura em duas fontes conta uma vez (fica a mais confiável)", () => {
    const { validos, descartados } = limparPontos("2024-01-01", [pt("2024-06-01", 300, { fonte: "os" }), pt("2024-06-02", 301, { fonte: "revisao" })], "2026-10-23");
    expect(validos).toHaveLength(1);
    expect(validos[0].fonte).toBe("revisao");
    expect(descartados[0].motivo).toContain("repetida");
  });
  it("envio do cheque: repetido da leitura de verdade sai; o que não cabe nas leituras sai", () => {
    const { validos, descartados } = limparPontos("2024-01-01", [
      pt("2024-06-01", 310, { revisao: 300 }), pt("2024-06-20", 300, { fonte: "envio", revisao: 300, aprox: true }),
      pt("2025-03-01", 50, { fonte: "envio", revisao: 50, aprox: true }), pt("2025-06-01", 600, { revisao: 600 }),
    ], "2026-10-23");
    expect(validos.map((p) => p.horas)).toEqual([310, 600]);
    expect(descartados.map((d) => d.motivo)).toEqual([expect.stringContaining("repetida"), expect.stringContaining("não bate com as leituras")]);
  });
  it("entrega anotada depois da 1ª leitura: a entrega volta pela média padrão", () => {
    const e = entregaEfetiva("2022-04-02", [pt("2022-03-17", 60, { revisao: 50 })], "2026-10-23");
    expect(e.ajustada).toBe(true);
    expect(e.data).toBe(new Date(Date.parse("2022-03-17T12:00:00") - Math.round(60 / MEDIA_PADRAO_H_DIA) * 86_400_000).toISOString().slice(0, 10));
    expect(entregaEfetiva("2022-01-01", [pt("2022-03-01", 55)], "2026-10-23")).toEqual({ data: "2022-01-01", ajustada: false });
  });
});

describe("média e previsão", () => {
  it("uma leitura = horas ÷ dias; várias = reta pela origem", () => {
    expect(mediaUso("2025-01-01", [pt("2025-04-11", 200)])).toBeCloseTo(2, 5);
    const m = mediaUso("2025-01-01", [pt("2025-04-11", 100), pt("2025-07-20", 200)])!;
    expect(m).toBeCloseTo(1, 1);
  });
  it("revisão de 300 feita, 2 h/dia: próxima 600, data e dias certos", () => {
    const p = preverRevisao({ entrega: "01/01/2026", pontos: [pt("2026-03-12", 140, { revisao: 50 }), pt("2026-06-30", 360, { revisao: 300 })], revisoesFeitas: [50, 300] }, AGORA);
    expect(p.proximaDevida).toBe(600);
    expect(p.revisaoOferta).toBe(600);
    expect(p.mediaHDia).toBeCloseTo(2.03, 1);
    expect(p.horimetroHoje).toBeGreaterThan(560);
    expect(p.situacao).toBe("vence_30");
    expect(p.confianca).toBe("media");
    expect(p.dias).toBeGreaterThanOrEqual(0);
  });
  it("atrasada; parou (pulou uma revisão inteira); próxima a mais de 30 dias", () => {
    const atrasada = preverRevisao({ entrega: "2026-01-01", pontos: [pt("2026-05-01", 300, { revisao: 300 })], revisoesFeitas: [50, 300] }, AGORA);
    expect(atrasada.situacao).toBe("atrasada");
    expect(atrasada.dias).toBeLessThan(0);
    const parou = preverRevisao({ entrega: "2022-01-01", pontos: [pt("2022-07-01", 300, { revisao: 300 })], revisoesFeitas: [50, 300] }, AGORA);
    expect(parou.situacao).toBe("parou");
    expect(parou.revisaoOferta).toBeGreaterThan(600);
    const longe = preverRevisao({ entrega: "2026-01-01", pontos: [pt("2026-09-28", 300, { revisao: 300 })], revisoesFeitas: [50, 300] }, AGORA);
    expect(longe.situacao).toBe("proxima");
  });
  it("sem leitura: média padrão e marcada como estimada", () => {
    const p = preverRevisao({ entrega: "2026-09-01", pontos: [], revisoesFeitas: [] }, AGORA);
    expect(p.mediaPadrao).toBe(true);
    expect(p.confianca).toBe("sem_leitura");
    expect(p.mediaHDia).toBe(MEDIA_PADRAO_H_DIA);
    expect(p.revisaoOferta).toBe(50);
    expect(p.explicacao).toContain("estimada sem leitura");
  });
  it("sem data de entrega", () => {
    expect(preverRevisao({ entrega: "", pontos: [], revisoesFeitas: [] }, AGORA).situacao).toBe("sem_entrega");
  });
});

describe("fila das revisões", () => {
  const atrasada = preverRevisao({ entrega: "2026-01-01", pontos: [pt("2026-05-01", 300, { revisao: 300 })], revisoesFeitas: [300] }, AGORA);
  const longe = preverRevisao({ entrega: "2026-01-01", pontos: [pt("2026-09-28", 300, { revisao: 300 })], revisoesFeitas: [300] }, AGORA);
  const parou = preverRevisao({ entrega: "2022-01-01", pontos: [pt("2022-07-01", 300, { revisao: 300 })], revisoesFeitas: [300] }, AGORA);
  it("ordem: atrasada → parou → próxima (esperando)", () => {
    const f = montarFilaRevisoes([trator(longe, { id: "a" }), trator(parou, { id: "b" }), trator(atrasada, { id: "c" })], {}, AGORA);
    expect(f.map((i) => i.trator.id)).toEqual(["c", "b", "a"]);
    expect(f[2].acao).toBe("aguardar");
    expect(f[0].oQueFazer).toContain(`revisão de ${atrasada.revisaoOferta} h`);
  });
  it("tentativas, remarcado, agendado e contato de outra revisão", () => {
    const hoje = { ...contatoVazio("1"), revisao: atrasada.revisaoOferta, tentativas: [{ data: "2026-10-23T09:00:00-03:00", canal: "telefone" as const }] };
    expect(avaliarRevisao(trator(atrasada), hoje, AGORA).acao).toBe("retentar");
    const tres = { ...contatoVazio("1"), tentativas: [20, 21, 22].map((d) => ({ data: `2026-10-${d}T09:00:00-03:00`, canal: "telefone" as const })) };
    expect(avaliarRevisao(trator(atrasada), tres, AGORA).acao).toBe("whatsapp");
    expect(avaliarRevisao(trator(atrasada), { ...contatoVazio("1"), proximo_contato_em: "2026-11-05" }, AGORA)).toMatchObject({ acao: "aguardar", aPartirDe: "2026-11-05" });
    expect(avaliarRevisao(trator(atrasada), { ...contatoVazio("1"), status: "agendada", data_agendada: "2026-10-30" }, AGORA).oQueFazer).toContain("30/10/2026");
    // agendou a de 300 e agora a devida é outra: o contato velho não vale
    expect(avaliarRevisao(trator(atrasada), { ...contatoVazio("1"), revisao: 50, status: "agendada" }, AGORA).acao).toBe("ligar");
  });
  it("mensagem do WhatsApp", () => {
    const m = mensagemRevisao(trator(atrasada));
    expect(m).toContain("Olá, Joao!");
    expect(m).toContain("Mahindra 6075E");
    expect(m).toContain(`revisão de ${atrasada.revisaoOferta.toLocaleString("pt-BR")} horas`);
    expect(mensagemRevisao(trator(parou))).toContain("Faz um tempo");
  });
});
