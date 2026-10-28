// Janela da MÁQUINA (José, 23/10/2026: "faz um modal e explica de qual projeto você tá falando,
// deixa os últimos serviços ali e as últimas revisões"). Funções PURAS, testadas em
// __tests__/maquina-modal.test.ts:
//   maquinaDoMotivo  → qual máquina é de cada motivo da fila Hoje (revisão, pós-serviço, robô)
//   rotuloMaquina    → "Mahindra 6075 · chassi …4973 · projeto 6075 MBNAA…4973 (Castro)"
//   revisoesDaMaquina→ linha do tempo das revisões: feitas (tabela, cheque, envio), as que faltaram
//                      na sequência 50 · 300 · 600… e a próxima (atrasada ou prevista)
//   servicosDaMaquina→ OS que citam o chassi, cada uma com o pedido de peças e o pós-serviço do CRM
// A linha do tempo bruta vem de lib/feedbacks/atendimento/maquina.ts (montarLinhaDoTempo).
import type { EventoMaquina } from "./atendimento/maquina";
import { chassiDoTexto, finalChassi, horasDoRotulo, revisaoDaSequencia, type Previsao, type TratorRevisao } from "./previsao-revisao";
import type { Motivo } from "./hoje";

export interface ProjetoRef { nome: string; empresa: string }

export interface MaquinaRef {
  chassi: string | null;
  modelo: string | null;
  projeto: ProjetoRef | null;
  /** quando o motivo é de revisão, a previsão já calculada vem junto */
  trator: TratorRevisao | null;
}

/** Chassi escrito num texto livre ("6075 ZK00331", "Chassi: MBNY…", "Mahindra 6075 - MBNAAF…"). */
export function chassiDeTexto(t: string | null | undefined): string | null {
  const s = String(t || "").trim();
  if (!s) return null;
  const rot = chassiDoTexto(s);
  if (rot) return rot;
  const tokens = s.toUpperCase().split(/[\s/|,;·-]+/).filter((x) => /^[A-Z0-9]{6,25}$/.test(x) && /\d/.test(x) && /[A-Z]/.test(x));
  return tokens.length ? tokens[tokens.length - 1] : null;
}

function modeloDeTexto(t: string | null | undefined, chassi: string | null): string | null {
  let s = String(t || "").trim();
  if (!s) return null;
  if (chassi) s = s.replace(new RegExp(chassi, "i"), " ");
  s = s.replace(/\bchassis?\b\s*[:.\-]?/i, " ").replace(/[|·,;-]+\s*$/, "").replace(/\s+/g, " ").trim();
  return s || null;
}

/** Qual máquina é o motivo (null quando o motivo não é de uma máquina: cadastro, peças, cliente sumido…). */
export function maquinaDoMotivo(m: Motivo): MaquinaRef | null {
  if (m.revisao) {
    const t = m.revisao.trator;
    return { chassi: t.chassi || null, modelo: t.modelo || null, projeto: t.projeto ?? null, trator: t };
  }
  if (m.oportunidade) {
    const o = m.oportunidade;
    const chassi = (o.chassis || "").trim().toUpperCase() || chassiDeTexto(o.trator);
    if (!chassi && !o.trator) return null;
    return { chassi: chassi || null, modelo: modeloDeTexto(o.trator, chassi) , projeto: null, trator: null };
  }
  if (m.registro) {
    const r = m.registro;
    const chassi = chassiDeTexto(r.trator);
    if (!chassi && !r.trator) return null;
    return { chassi, modelo: modeloDeTexto(r.trator, chassi), projeto: null, trator: null };
  }
  return null;
}

const nomeEmpresa = (e: string) => (/castro/i.test(e) ? "Castro" : /nova/i.test(e) ? "Nova" : e);

/** Nome do projeto sem repetir o chassi inteiro: "MAHINDRA 6075 MBNY…J04499" → "MAHINDRA 6075 …J04499". */
export function nomeProjetoCurto(nome: string, chassi: string | null): string {
  const n = String(nome || "").trim();
  if (!chassi) return n;
  const ch = chassi.toUpperCase();
  const i = n.toUpperCase().indexOf(ch);
  return i >= 0 ? `${n.slice(0, i)}…${finalChassi(ch, 6)}${n.slice(i + ch.length)}`.replace(/\s+/g, " ").trim() : n;
}

/**
 * Máquina de cada motivo do cliente. Motivo sem chassi (o robô às vezes só sabe o modelo) pega a
 * máquina de outro motivo do mesmo cliente quando é o mesmo modelo, ou quando o cliente só tem uma.
 */
export function maquinasDosMotivos(motivos: Motivo[]): (MaquinaRef | null)[] {
  const refs = motivos.map(maquinaDoMotivo);
  const comChassi = refs.filter((r): r is MaquinaRef => !!r?.chassi);
  const unicos = [...new Map(comChassi.map((r) => [finalChassi(r.chassi), r])).values()];
  return refs.map((r) => {
    if (!r || r.chassi) return r;
    const num = (s: string | null) => (s || "").match(/\d{3,5}/)?.[0] ?? "";
    const mod = num(r.modelo);
    const mesmo = unicos.filter((u) => mod && num(u.modelo) === mod);
    const achou = mesmo.length === 1 ? mesmo[0] : unicos.length === 1 ? unicos[0] : null;
    return achou ? { ...achou, modelo: achou.modelo || r.modelo } : r;
  });
}

/** Só o modelo, para o título do cartão: "Mahindra 6075E CAB". */
export function nomeModelo(r: Pick<MaquinaRef, "modelo">): string {
  const modelo = (r.modelo || "").trim();
  return modelo ? (/mahindra/i.test(modelo) || !/^\d/.test(modelo) ? modelo : `Mahindra ${modelo}`) : "";
}

/** Uma linha só para dizer de qual máquina é: modelo · final do chassi · projeto Omie. */
export function rotuloMaquina(r: Pick<MaquinaRef, "chassi" | "modelo" | "projeto">): string {
  const partes = [
    nomeModelo(r),
    r.chassi ? `chassi …${finalChassi(r.chassi, 6)}` : "sem chassi",
    r.projeto ? `projeto Omie “${nomeProjetoCurto(r.projeto.nome, r.chassi)}” (${nomeEmpresa(r.projeto.empresa)})` : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

// ─── revisões ────────────────────────────────────────────────────────────────

export type EstadoRevisao = "feita" | "faltou" | "proxima" | "atrasada";
export interface LinhaRevisao {
  rev: number;
  estado: EstadoRevisao;
  data: string | null;
  horimetro: number | null;
  /** de onde veio: "controle de revisões", "cheque assinado", "envio do cheque", "leitura da OS 5339"… */
  origem: string | null;
  link: { href: string; rotulo: string } | null;
}

/**
 * Revisões da máquina, da próxima para a mais antiga. Feita = anotada no controle (tratores), cheque
 * assinado/enviado ou leitura que diz a revisão. Faltou = está antes da próxima na sequência e não
 * aparece em lugar nenhum (pode ter sido feita fora da loja). Sem previsão (máquina fora do controle),
 * mostra só as feitas.
 */
export function revisoesDaMaquina(eventos: EventoMaquina[], p: Previsao | null): LinhaRevisao[] {
  const feitas = new Map<number, LinhaRevisao>();
  const anota = (rev: number | null, l: Omit<LinhaRevisao, "rev" | "estado">, forte: boolean) => {
    if (!rev || rev < 50) return;
    const atual = feitas.get(rev);
    if (!atual) { feitas.set(rev, { rev, estado: "feita", ...l }); return; }
    // completa o que faltava; a anotação do controle manda na data
    if (forte && l.data) atual.data = l.data;
    atual.data ??= l.data; atual.horimetro ??= l.horimetro; atual.link ??= l.link;
    if (forte && l.origem) atual.origem = l.origem;
  };
  for (const e of eventos) {
    if (e.tipo === "revisao") anota(horasDoRotulo(e.titulo), { data: e.data, horimetro: e.horimetro, origem: "controle de revisões", link: null }, true);
    else if (e.tipo === "cheque" && e.status !== "pendente") {
      const link = e.ref.tipo === "url" ? { href: e.ref.href, rotulo: e.ref.rotulo } : null;
      anota(horasDoRotulo(e.titulo), { data: e.data, horimetro: e.horimetro, origem: e.status === "assinado" ? "cheque assinado" : "cheque enviado à Mahindra", link }, false);
    }
  }
  for (const x of p ? [...p.validos, ...p.descartados.filter((d) => d.motivo.startsWith("repetida"))] : []) {
    if (x.revisao) anota(x.revisao, { data: x.data, horimetro: x.aprox ? null : x.horas, origem: x.rotulo, link: null }, false);
  }

  const out: LinhaRevisao[] = [];
  if (p) {
    const alvo = p.revisaoOferta;
    out.push({ rev: alvo, estado: p.situacao === "atrasada" ? "atrasada" : "proxima", data: p.dataPrevista, horimetro: null, origem: p.situacao === "atrasada" ? "atrasada pela previsão" : "prevista pela média de uso", link: null });
    for (let i = 0; ; i++) {
      const r = revisaoDaSequencia(i);
      if (r >= alvo) break;
      out.push(feitas.get(r) ?? { rev: r, estado: "faltou", data: null, horimetro: null, origem: "não consta na loja", link: null });
    }
    for (const f of feitas.values()) if (f.rev >= alvo) out.push(f);
  } else {
    out.push(...feitas.values());
  }
  const peso = (l: LinhaRevisao) => (l.estado === "proxima" || l.estado === "atrasada" ? 1e9 : l.rev);
  return out.sort((a, b) => peso(b) - peso(a));
}

// ─── serviços ────────────────────────────────────────────────────────────────

export interface ServicoMaquina {
  os: EventoMaquina;
  /** PPV/PV ligados à OS (pedido de peças dentro do serviço) */
  pecas: EventoMaquina[];
  /** atendimentos do CRM até 45 dias depois do serviço (o pós-serviço daquela OS) */
  posServico: EventoMaquina[];
}

const idsDaOS = (e: EventoMaquina): string[] => {
  const r = e.ref.tipo === "os" ? e.ref : null;
  return [r?.id_ordem, r?.ordem_omie && `OS ${r.ordem_omie}`, r?.ordem_omie].filter((x): x is string => !!x);
};

/** As OS da máquina (mais recentes primeiro), cada uma com as peças e o pós-serviço. */
export function servicosDaMaquina(eventos: EventoMaquina[], max = 8): ServicoMaquina[] {
  const oss = eventos.filter((e) => e.tipo === "os").sort((a, b) => b.ts - a.ts).slice(0, max);
  const pedidos = eventos.filter((e) => e.tipo === "ppv" || e.tipo === "pv");
  const atend = eventos.filter((e) => e.tipo === "atendimento");
  const usados = new Set<string>();
  return oss.map((os) => {
    const ids = new Set([...idsDaOS(os), ...os.ligados]);
    const pecas = pedidos.filter((p) => !usados.has(p.id) && (ids.has(p.ref.tipo === "ppv" ? p.ref.id : "") || p.ligados.some((l) => ids.has(l)) || os.ligados.some((l) => p.ligados.includes(l))));
    for (const p of pecas) usados.add(p.id);
    const fim = os.ts + 45 * 86_400_000;
    const posServico = os.ts ? atend.filter((a) => a.ts >= os.ts - 86_400_000 && a.ts <= fim) : [];
    return { os, pecas, posServico };
  });
}

/** Mesmo chassi pelo final de 7 (o banco tem o chassi com e sem prefixo). */
export function mesmoChassiFinal(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = finalChassi(a), y = finalChassi(b);
  return x.length >= 6 && x === y;
}
