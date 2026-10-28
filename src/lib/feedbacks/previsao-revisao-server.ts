// Lê do banco o que a aba "Revisões" do RFM (página de teste do CRM) precisa e monta a previsão de
// cada trator com a regra pura de previsao-revisao.ts. Só leitura, service role (revisao_cheques
// não tem policy). Cache de 5 min no processo; "Atualizar" força.
// Fontes: tratores (entrega + revisões anotadas), revisao_cheques (horímetro do cheque online),
// revisao_emails (envio do cheque = aproximação), portal_nt_clientes_os (horímetro no texto da OS),
// feedback_registros + portal_nt_clientes_cadastro_omie (telefone/código do cliente, casado pelo NOME)
// e feedback_revisoes_contato (o atendimento; pode não existir — sql/feedbacks-rfm-revisoes.sql).
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { paginar } from "@/lib/db/paginar";
import { separarModeloChassi } from "./atendimento/puro";
import {
  chassiDoTexto, contatoVazio, dataISO, finalChassi, horimetroDoTexto, MOTIVOS_SEM_REVISAO, normNome, numeroHorimetro, pontosDaTabela, preverRevisao,
  type ContatoRevisao, type MotivoSemRevisao, type PontoHorimetro, type StatusContatoRevisao, type TratorBruto, type TratorRevisao,
} from "./previsao-revisao";

export const TABELA_CONTATO = "feedback_revisoes_contato";
/** Horímetros informados pelo cliente (um por ligação; histórico). sql/feedbacks-rfm-revisoes.sql */
export const TABELA_LEITURAS = "revisoes_leituras";

export interface DadosRevisoes {
  tratores: TratorRevisao[];
  contatos: Record<string, ContatoRevisao>;
  /** false = a tabela do atendimento ainda não existe (só simulação) */
  tabelaContato: boolean;
  avisos: string[];
  geradoEm: string;
}

type Cheque = { chassis: string | null; horas: number | null; os_id: string | null; dados: Record<string, unknown> | null };
type Envio = { chassis: string | null; chassis_final: string | null; horas: string | number | null; enviado_em: string | null };
type OS = { num_os: string | null; empresa: string | null; descricao: string | null; projeto: string | null; data_inclusao: string | null; data_faturamento: string | null; cancelada: boolean | null };
type Contato = { nome: string | null; telefone: string | null; codigo_omie: string | null };
type Cadastro = { cod_cli: number | string | null; empresa: string | null; razao_social: string | null; nome_fantasia: string | null; telefone: string | null };

export const tabelaFaltando = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist/i.test(e.message || ""));

const cache = globalThis as unknown as { __revisoesRfm?: { em: number; dados: DadosRevisoes }; __revisoesRfmCalc?: Promise<DadosRevisoes> | null };

/** Monta uma vez por vez (pedidos juntos esperam o mesmo cálculo) e guarda. */
function recalcular(): Promise<DadosRevisoes> {
  cache.__revisoesRfmCalc ??= montar()
    .then((dados) => { cache.__revisoesRfm = { em: Date.now(), dados }; return dados; })
    .finally(() => { cache.__revisoesRfmCalc = null; });
  return cache.__revisoesRfmCalc;
}

// Passados 5 min devolve o guardado na hora e recalcula por trás (Radar Tratores → Controle de
// Revisões, 28/10/2026: a tela não pode ficar carregando). "Atualizar" (forcar) espera o novo.
export async function carregarRevisoes(forcar = false): Promise<DadosRevisoes> {
  const c = cache.__revisoesRfm;
  if (!forcar && c) {
    if (Date.now() - c.em >= 5 * 60_000) void recalcular().catch((e) => console.error("[revisoes] recálculo", e));
    return c.dados;
  }
  return recalcular();
}
export function limparCacheRevisoes() { cache.__revisoesRfm = undefined; }

async function montar(): Promise<DadosRevisoes> {
  const avisos: string[] = [];
  const sb = supabaseAdmin;
  const [tr, ch, em, os, fr, cad, pj] = await Promise.all([
    paginar<TratorBruto>((de, ate) => sb.from("tratores").select("*").order("ID").range(de, ate)),
    paginar<Cheque>((de, ate) => sb.from("revisao_cheques").select("chassis,horas,os_id,dados").order("id").range(de, ate)),
    paginar<Envio>((de, ate) => sb.from("revisao_emails").select("chassis,chassis_final,horas,enviado_em").order("id").range(de, ate)),
    paginar<OS>((de, ate) => sb.from("portal_nt_clientes_os").select("num_os,empresa,descricao,projeto,data_inclusao,data_faturamento,cancelada")
      .or('descricao.ilike.%horim%,descricao.ilike."%hor:%"').order("cod_os").range(de, ate)),
    paginar<Contato>((de, ate) => sb.from("feedback_registros").select("nome,telefone,codigo_omie").order("id").range(de, ate)),
    paginar<Cadastro>((de, ate) => sb.from("portal_nt_clientes_cadastro_omie").select("cod_cli,empresa,razao_social,nome_fantasia,telefone").order("cod_cli").range(de, ate)),
    paginar<{ nome: string | null; empresa: string | null }>((de, ate) => sb.from("portal_nt_projetos_PRINCIPAL").select("nome,empresa").order("nome").range(de, ate)),
  ]);
  if (tr.error) throw new Error(`tratores: ${tr.error.message}`);
  for (const [nome, r] of [["cheques de revisão", ch], ["envios de cheque", em], ["OS do Omie", os], ["CRM", fr], ["cadastro Omie", cad], ["projetos Omie", pj]] as const) {
    if (r.error) avisos.push(`Não deu para ler ${nome}: ${r.error.message}`);
  }

  // índice de chassi (final 7) → trator; final curto do envio só vale se for de um trator só
  const porFinal = new Map<string, TratorBruto[]>();
  for (const t of tr.data) {
    const f = finalChassi(t.Chassis);
    if (f.length < 4) continue;
    porFinal.set(f, [...(porFinal.get(f) || []), t]);
  }
  const acharPorFinal = (fin: string): TratorBruto | null => {
    const f = finalChassi(fin);
    if (f.length >= 7) { const l = porFinal.get(f); return l && l.length === 1 ? l[0] : null; }
    if (f.length < 4) return null;
    const achados = tr.data.filter((t) => finalChassi(t.Chassis).endsWith(f));
    return achados.length === 1 ? achados[0] : null;
  };
  const extras = new Map<TratorBruto, { pontos: PontoHorimetro[]; feitas: number[] }>();
  const extra = (t: TratorBruto) => { let e = extras.get(t); if (!e) { e = { pontos: [], feitas: [] }; extras.set(t, e); } return e; };

  for (const c of ch.data) {
    const t = acharPorFinal(c.chassis || "");
    if (!t || !c.horas) continue;
    const d = dataISO(c.dados?.dataRevisao);
    const h = numeroHorimetro(String(c.dados?.horimetro ?? ""));
    if (!d) continue; // cheque atrasado sem data: não prova que a revisão foi feita
    extra(t).feitas.push(c.horas);
    if (h != null) extra(t).pontos.push({ data: d, horas: h, fonte: "cheque", rotulo: `Cheque ${c.horas} h${c.os_id ? ` · ${c.os_id}` : ""}`, revisao: c.horas });
  }
  for (const e of em.data) {
    const t = acharPorFinal(e.chassis_final || e.chassis || "");
    const h = numeroHorimetro(e.horas);
    const d = dataISO(e.enviado_em);
    if (!t || !h || !d) continue;
    extra(t).pontos.push({ data: d, horas: h, fonte: "envio", rotulo: `Envio do cheque ${h} h`, revisao: h, aprox: true });
  }
  for (const o of os.data) {
    if (o.cancelada) continue;
    const h = horimetroDoTexto(o.descricao);
    const chassi = chassiDoTexto(o.descricao) || String(o.projeto || "").trim().split(/\s+/).pop() || "";
    const d = dataISO(o.data_inclusao) || dataISO(o.data_faturamento);
    if (h == null || !d || finalChassi(chassi).length < 7) continue;
    const t = acharPorFinal(chassi);
    if (!t) continue;
    extra(t).pontos.push({ data: d, horas: h, fonte: "os", rotulo: `OS ${o.num_os || "?"}${o.empresa && o.empresa !== "Nova Tratores" ? ` · ${o.empresa}` : ""}` });
  }

  // cliente pelo nome: CRM primeiro (tem o telefone que o atendimento usa), depois o cadastro Omie
  const clientes = new Map<string, { telefone: string | null; codigo: string | null }>();
  const por = (nome: unknown, telefone: unknown, codigo: unknown) => {
    const k = normNome(nome);
    if (k.length < 5) return;
    const atual = clientes.get(k);
    const tel = String(telefone || "").replace(/\D/g, "").length >= 10 ? String(telefone) : null;
    if (!atual) clientes.set(k, { telefone: tel, codigo: codigo != null && String(codigo) ? String(codigo) : null });
    else { atual.telefone ??= tel; atual.codigo ??= codigo != null && String(codigo) ? String(codigo) : null; }
  };
  for (const r of fr.data) por(r.nome, r.telefone, r.codigo_omie);
  const cadOrd = [...cad.data].sort((a, b) => (a.empresa === "Nova Tratores" ? 0 : 1) - (b.empresa === "Nova Tratores" ? 0 : 1));
  for (const r of cadOrd) { por(r.razao_social, r.telefone, r.cod_cli); if (r.nome_fantasia) por(r.nome_fantasia, r.telefone, r.cod_cli); }
  const acharCliente = (nome: string) => clientes.get(normNome(nome)) || clientes.get(normNome(nome.split("/")[0])) || null;

  // projeto Omie pelo final do chassi (nome do projeto = "MODELO CHASSI"); só vale se for de um chassi só
  const projPorFinal = new Map<string, { nome: string; empresa: string }[]>();
  for (const p of pj.data) {
    const ch = separarModeloChassi(p.nome).chassi;
    const f = finalChassi(ch);
    if (!ch || f.length < 7) continue;
    projPorFinal.set(f, [...(projPorFinal.get(f) || []), { nome: String(p.nome), empresa: String(p.empresa || "Nova Tratores") }]);
  }
  const projetoDe = (chassi: unknown) => {
    const l = projPorFinal.get(finalChassi(chassi));
    return l?.length ? (l.find((p) => p.empresa === "Nova Tratores") ?? l[0]) : null;
  };

  // horímetro que o cliente falou na ligação (Radar Tratores → Controle de Revisões); sem a tabela, segue sem
  const leituras = new Map<string, PontoHorimetro[]>();
  const lt = await paginar<{ trator_id: string; horas: number; data: string; user_nome: string | null }>((de, ate) => sb.from(TABELA_LEITURAS).select("trator_id,horas,data,user_nome").order("id").range(de, ate));
  if (lt.error && !tabelaFaltando(lt.error)) avisos.push(`Não deu para ler os horímetros informados: ${lt.error.message}`);
  for (const l of lt.data) {
    const h = Number(l.horas), d = dataISO(l.data);
    if (!Number.isFinite(h) || !d) continue;
    leituras.set(l.trator_id, [...(leituras.get(l.trator_id) || []), { data: d, horas: h, fonte: "cliente", rotulo: `Cliente informou${l.user_nome ? ` a ${l.user_nome}` : ""}` }]);
  }

  const agora = Date.now();
  const tratores: TratorRevisao[] = tr.data.map((t) => {
    const tab = pontosDaTabela(t);
    const ex0 = extras.get(t) || { pontos: [], feitas: [] };
    const ex = { ...ex0, pontos: [...ex0.pontos, ...(leituras.get(String(t.ID ?? t.Chassis ?? "")) || [])] };
    const cli = acharCliente(String(t.Cliente || ""));
    return {
      id: String(t.ID ?? t.Chassis ?? ""),
      modelo: String(t.Modelo || "").replace(/\.0$/, "").trim(),
      chassi: String(t.Chassis || "").trim().toUpperCase(),
      cliente: String(t.Cliente || "").trim() || "Cliente sem nome",
      cidade: String(t.Cidade || "").trim() || null,
      vendedor: String(t.Vendedor || "").trim() || null,
      telefone: cli?.telefone ?? null,
      codigo_omie: cli?.codigo ?? null,
      projeto: projetoDe(t.Chassis),
      previsao: preverRevisao({ entrega: t.Entrega, pontos: [...tab.pontos, ...ex.pontos], revisoesFeitas: [...tab.feitas, ...ex.feitas] }, agora),
    };
  }).filter((t) => t.id);

  // atendimento já registrado
  const contatos: Record<string, ContatoRevisao> = {};
  let tabelaContato = true;
  const ct = await paginar<ContatoRevisao>((de, ate) => sb.from(TABELA_CONTATO).select("*").order("trator_id").range(de, ate));
  if (ct.error) {
    if (tabelaFaltando(ct.error)) tabelaContato = false;
    else avisos.push(`Não deu para ler o atendimento das revisões: ${ct.error.message}`);
  }
  for (const c of ct.data) contatos[c.trator_id] = { ...contatoVazio(c.trator_id), ...c, tentativas: Array.isArray(c.tentativas) ? c.tentativas : [] };

  return { tratores, contatos, tabelaContato, avisos, geradoEm: new Date().toISOString() };
}

const STATUS: StatusContatoRevisao[] = ["aberto", "agendada", "nao_quer", "arquivado"];
const dataOk = (s: unknown) => s == null || (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s));

/** Valida o que a tela manda gravar (o estado novo do atendimento daquele trator). */
export function validarContato(b: Record<string, unknown>): { ok: true; linha: Omit<ContatoRevisao, "atualizado_em"> } | { ok: false; erro: string } {
  const trator_id = String(b.trator_id ?? "").trim();
  if (!trator_id || trator_id.length > 40) return { ok: false, erro: "trator_id inválido" };
  const status = String(b.status ?? "aberto") as StatusContatoRevisao;
  if (!STATUS.includes(status)) return { ok: false, erro: "status inválido" };
  if (!dataOk(b.proximo_contato_em) || !dataOk(b.data_agendada)) return { ok: false, erro: "data inválida (use AAAA-MM-DD)" };
  const tent = Array.isArray(b.tentativas) ? b.tentativas : [];
  if (tent.length > 60) return { ok: false, erro: "tentativas demais" };
  const tentativas = tent.map((t) => {
    const x = t as Record<string, unknown>;
    return { data: String(x.data || ""), canal: (["wpp", "telefone", "email", "outro"].includes(String(x.canal)) ? x.canal : "outro") as "wpp" | "telefone" | "email" | "outro" };
  }).filter((t) => Number.isFinite(Date.parse(t.data)));
  const revisao = b.revisao == null ? null : Number(b.revisao);
  if (revisao != null && (!Number.isInteger(revisao) || revisao < 0 || revisao > 30000)) return { ok: false, erro: "revisão inválida" };
  const motivo = b.motivo == null ? null : String(b.motivo).slice(0, 300);
  if (status === "nao_quer" && !motivo?.trim()) return { ok: false, erro: "diga o motivo de não querer a revisão" };
  const codigo = b.motivo_codigo == null || b.motivo_codigo === "" ? null : String(b.motivo_codigo) as MotivoSemRevisao;
  if (codigo && !MOTIVOS_SEM_REVISAO.some((m) => m.id === codigo)) return { ok: false, erro: "motivo inválido" };
  return {
    ok: true,
    linha: {
      trator_id, revisao, status, tentativas,
      proximo_contato_em: (b.proximo_contato_em as string | null) ?? null,
      data_agendada: (b.data_agendada as string | null) ?? null,
      motivo,
      ...(codigo ? { motivo_codigo: codigo } : {}),
      concluido_em: status === "aberto" ? null : (typeof b.concluido_em === "string" ? b.concluido_em : new Date().toISOString()),
    },
  };
}
