// OS do portal × OS do Omie, antes de faturar (José, 14/10/2026).
// conferirOS = só leitura (ConsultarOS). alinharOS = deixa o Omie igual ao portal
// (AlterarOS: cabeçalho/infos/departamentos/e-mail + itens por nIdItem com
// cAcaoItem A/I/E) e confere de novo.
import { EMAIL_INTERNO } from "@/lib/pos/omie-espelho";
import { pedidoClienteDaOS } from "@/lib/pos/pedido-cliente";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import { omie as omiePorta } from "@/lib/omie/porta";
import { montarServicosDetalhe, montarDadosAdic } from "@/lib/pos/omie";
import { normalizarEspelho, espelhoPadrao, calcularParcelas, diasDoEspelho, type OmieEspelho } from "@/lib/pos/omie-espelho";
import { estadoNoOmie } from "@/lib/pos/faturamento-regras";
import {
  compararItens, compararCampo, compararDepartamentos, compararParcelas, diferente, textoNormal,
  type Divergencia, type ItemComparavel, type ResultadoConferencia,
} from "@/lib/omie/conferencia";

type Rec = Record<string, unknown>;
const NCOD_SOL = 2209673817, NCOD_HORA = 1979758762, NCOD_KM = 1975974257;

function omie<T>(call: string, param: Rec): Promise<T> {
  const { key, secret } = contaOmie("Nova Tratores");
  return omiePorta<T>({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, "/servicos/os/", call, param, { prioridade: "pessoa" });
}
const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

interface ItemOmieOS { nIdItem?: number; nSeqItem?: number; nCodServico?: number; nQtde?: number; nValUnit?: number; cTpDesconto?: string; nValorDesconto?: number; nPercDesconto?: number; cDescServ?: string; cNaoGerarFinanceiro?: string }
interface OSOmie {
  Cabecalho?: { nCodOS?: number; cNumOS?: string; cEtapa?: string; nValorTotal?: number; dDtPrevisao?: string; cCodParc?: string; nQtdeParc?: number };
  Parcelas?: { nParcela?: number; dDtVenc?: string; nDias?: number; nPercentual?: number; nValor?: number }[];
  InfoCadastro?: { cFaturada?: string; cCancelada?: string };
  InformacoesAdicionais?: { cCodCateg?: string; nCodCC?: number; cNumContrato?: string; cDadosAdicNF?: string; cNumPedido?: string };
  Departamentos?: { cCodDepto?: string; nPerc?: number }[];
  Email?: { cEnviarPara?: string; cEnvRecibo?: string };
  ServicosPrestados?: ItemOmieOS[];
}

const nomeServ: Record<number, string> = { [NCOD_SOL]: "Solicitação de Serviço", [NCOD_HORA]: "Hora Trabalhada", [NCOD_KM]: "KM Deslocamento" };
const descontoOmie = (s: ItemOmieOS) => n(s.nValorDesconto) > 0 ? n(s.nValorDesconto)
  : (s.cTpDesconto === "P" ? n(s.nQtde) * n(s.nValUnit) * n(s.nPercDesconto) / 100 : 0);

/** o que a OS do portal manda (mesma montagem do envio + serviços extras do espelho) */
async function esperadoDaOS(os: Rec, esp: OmieEspelho | null) {
  const det = await montarServicosDetalhe(os, String(os.Id_Ordem));
  const base = det.servicos;
  const itens: (ItemComparavel & { nCodServico: number })[] = base.map((s) => ({
    chave: String(s.nCodServico), nCodServico: s.nCodServico,
    rotulo: nomeServ[s.nCodServico] || (s.cDescServ ? `"${String(s.cDescServ).slice(0, 40)}"` : `serviço ${s.nCodServico}`),
    qtde: n(s.nQtde), unit: n(s.nValUnit), desconto: n(s.nValorDesconto),
    // a solicitação compara o texto; os "div." (requisições) usam o texto para casar
    descricao: s.nCodServico === NCOD_SOL ? String(os.Serv_Solicitado || s.cDescServ || "")
      : (s.cDescServ && !nomeServ[s.nCodServico]) ? String(s.cDescServ || "") : undefined,
  }));
  // serviços incluídos à mão na OS (espelho): acha o nCodServico pelo código
  for (const x of esp?.extras || []) {
    let nCod = 0;
    try {
      const c = await omiePorta<{ intListar?: { nCodServ?: number } }>(
        (() => { const { key, secret } = contaOmie("Nova Tratores"); return { appKey: key, appSecret: secret, rotulo: "Nova Tratores" }; })(),
        "/servicos/servico/", "ConsultarCadastroServico", { cCodigo: x.codigo }, { prioridade: "pessoa" });
      nCod = n(c.intListar?.nCodServ);
    } catch { /* fica sem conferir */ }
    if (!nCod) continue;
    itens.push({ chave: String(nCod), nCodServico: nCod, rotulo: x.nome || x.codigo, qtde: n(x.qtde), unit: n(x.unit), desconto: x.cobrar ? 0 : n(x.qtde) * n(x.unit), descricao: x.descricao || undefined });
  }
  return Object.assign(itens, { descontoGeral: det.descontoGeral, descontoNaoAplicado: det.descontoNaoAplicado });
}

const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const isoBR = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
/** previsão de faturamento da OS no portal (vazia = hoje) */
const previsaoDaOS = (os: Rec) => String(os.Previsao_Faturamento || "").slice(0, 10) || hojeISO();
/** nº do(s) pedido(s) de venda no Omie: "PPV-0446:000000000007739" → "7739" */
// "Nº do pedido do cliente": dos PPVs da OS no Omie, com "CASTRO " quando o pedido é da Castro
const pedidosDaOS = (os: Rec) => pedidoClienteDaOS(String(os.ID_PPV || "").split(","));
/** parcelas esperadas: as editadas à mão na OS ou as da condição, a partir da previsão */
function parcelasDaOS(esp: OmieEspelho, previsao: string, total: number) {
  const l = esp.parcelas.length ? esp.parcelas : calcularParcelas(diasDoEspelho(esp), previsao, total);
  return l.map((p, i) => ({ nParcela: i + 1, nDias: Math.max(0, Math.round(Number(p.dias) || 0)), dDtVenc: isoBR(String(p.venc)), nValor: Math.round(Number(p.valor) * 100) / 100 }));
}

async function lerOSDoPortal(idOs: string): Promise<Rec | null> {
  const { data } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOs).limit(1);
  return (data?.[0] as Rec) || null;
}

async function consultarOS(os: Rec): Promise<OSOmie> {
  if (os.omie_ncodos) return omie<OSOmie>("ConsultarOS", { nCodOS: Number(os.omie_ncodos) });
  return omie<OSOmie>("ConsultarOS", { cNumOS: String(os.Ordem_Omie || "").replace(/^0+/, "") });
}

function espelhoDe(os: Rec): OmieEspelho | null {
  return os.Omie_Espelho && typeof os.Omie_Espelho === "object"
    ? normalizarEspelho(os.Omie_Espelho, espelhoPadrao({ interna: !!os.Servico_Interno }))
    : null;
}

export async function conferirOS(idOs: string): Promise<ResultadoConferencia & { _omie?: OSOmie; _esperado?: (ItemComparavel & { nCodServico: number })[] }> {
  const os = await lerOSDoPortal(idOs);
  const base = { doc: idOs, tipo: "OS", numeroOmie: "", divergencias: [] as Divergencia[] };
  if (!os) return { ...base, erro: "OS não encontrada no portal." };
  const num = String(os.Ordem_Omie || "").replace(/^0+/, "");
  if (!num) return { ...base, pulado: "ainda não foi enviada ao Omie" };
  let dados: OSOmie;
  try { dados = await consultarOS(os); } catch (e) { return { ...base, numeroOmie: num, erro: `Não consegui ler a OS ${num} no Omie: ${e instanceof Error ? e.message : e}` }; }
  const estado = estadoNoOmie(dados.Cabecalho as never, dados.InfoCadastro as never);
  if (estado === "faturada" || estado === "faturando") return { ...base, numeroOmie: num, pulado: "já está faturada no Omie" };
  if (estado === "cancelada") return { ...base, numeroOmie: num, erro: `A OS ${num} está CANCELADA no Omie.` };

  const esp = espelhoDe(os);
  const esperado = await esperadoDaOS(os, esp);
  const omieItens: ItemComparavel[] = (dados.ServicosPrestados || []).map((s) => ({
    chave: String(n(s.nCodServico)), rotulo: nomeServ[n(s.nCodServico)] || (s.cDescServ ? `"${String(s.cDescServ).slice(0, 40)}"` : `serviço ${s.nCodServico}`),
    qtde: n(s.nQtde), unit: n(s.nValUnit), desconto: descontoOmie(s), descricao: s.cDescServ,
  }));
  // o texto só conta onde o portal tem texto (solicitação e "div.")
  const omieAjust = omieItens.map((o) => esperado.some((p) => p.chave === o.chave && p.descricao !== undefined) ? o : { ...o, descricao: undefined });
  const div: Divergencia[] = compararItens(idOs, esperado, omieAjust, "Serviço");
  if (esperado.descontoNaoAplicado > 0) {
    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    div.push({
      doc: idOs, campo: "descontoGeral", rotulo: "Desconto geral da OS", portal: brl(esperado.descontoGeral), omie: brl(esperado.descontoGeral - esperado.descontoNaoAplicado), ajustavel: false,
      explicacao: `O desconto da OS (${brl(esperado.descontoGeral)}) é maior que os serviços: ${brl(esperado.descontoNaoAplicado)} não cabem na OS do Omie. Dê essa parte como desconto no pedido de peças (PPV) ou diminua o desconto da OS.`,
    });
  }

  // cabeçalho: só quando a OS já tem o espelho do Omie salvo (OS antigas não têm)
  const ia = dados.InformacoesAdicionais || {};
  {
    const add = (d: Divergencia | null) => { if (d) div.push(d); };
    add(compararCampo(idOs, "previsao", "Previsão de faturamento", isoBR(previsaoDaOS(os)), dados.Cabecalho?.dDtPrevisao, { vazioIgnora: false }));
    add(compararCampo(idOs, "pedidoCliente", "Nº do pedido do cliente (pedido de venda das peças)", await pedidosDaOS(os), ia.cNumPedido));
    // OS interna não tem parcelas (não é cobrada) — José, 15/10/2026
    if (esp && !os.Servico_Interno) {
      const total = esperado.reduce((t, p) => t + Math.max(0, p.qtde * p.unit - p.desconto), 0);
      add(compararParcelas(idOs, parcelasDaOS(esp, previsaoDaOS(os), total).map((p) => ({ venc: p.dDtVenc, valor: p.nValor })),
        (dados.Parcelas || []).map((p) => ({ venc: String(p.dDtVenc || ""), valor: n(p.nValor) }))));
    }
  }
  if (os.Servico_Interno) {
    // OS interna: TODOS os serviços com "não gerar conta a receber" — é o que faz sair recibo
    const cobrando = (dados.ServicosPrestados || []).filter((s) => s.cNaoGerarFinanceiro !== "S").length;
    const em = String(dados.Email?.cEnviarPara || "").trim().toLowerCase();
    if (em !== EMAIL_INTERNO) div.push({
      doc: idOs, campo: "emailInterna", rotulo: "E-mail (OS interna)", portal: EMAIL_INTERNO, omie: em || "—", ajustavel: true,
      explicacao: "OS interna não manda nada para o cliente: o recibo vai só para o pós-vendas. Ao atualizar, o e-mail do cliente sai.",
    });
    if (cobrando) div.push({
      doc: idOs, campo: "naoGerarFinanceiro", rotulo: "Serviços que geram conta a receber", portal: "nenhum (OS interna)", omie: `${cobrando} serviço(s)`, ajustavel: true,
      explicacao: "OS interna não é cobrada: todos os serviços precisam estar com \"não gerar conta a receber\" (é isso que faz o Omie emitir RECIBO em vez de NFS-e). Ao atualizar, o portal marca todos.",
    });
  }
  if (esp) {
    const add = (d: Divergencia | null) => { if (d) div.push(d); };
    add(compararCampo(idOs, "categoria", "Categoria", esp.info.categoria, ia.cCodCateg));
    add(compararCampo(idOs, "conta", "Conta corrente", esp.info.conta ? String(esp.info.conta) : "", ia.nCodCC ? String(ia.nCodCC) : ""));
    add(compararCampo(idOs, "contrato", "Nº do contrato de venda", esp.info.contrato, ia.cNumContrato));
    add(compararCampo(idOs, "dadosNF", "Dados adicionais da nota", esp.info.dadosNF || montarDadosAdic(os), ia.cDadosAdicNF, { texto: true }));
    const omieDep: Record<string, number> = {};
    for (const d of dados.Departamentos || []) omieDep[String(d.cCodDepto)] = n(d.nPerc);
    add(compararDepartamentos(idOs, esp.deptos, omieDep, (c) => c));
    if (!os.Servico_Interno) add(compararCampo(idOs, "email", "E-mail do cliente", esp.email.para, dados.Email?.cEnviarPara));
    add(compararCampo(idOs, "recibo", "Recibo em vez de NFS-e", esp.email.recibo ? "S" : "N", dados.Email?.cEnvRecibo || "N",
      { exibirPortal: esp.email.recibo ? "sim" : "não", exibirOmie: dados.Email?.cEnvRecibo === "S" ? "sim" : "não", vazioIgnora: false }));
  }
  return { ...base, numeroOmie: num, divergencias: div, _omie: dados, _esperado: esperado };
}

/** Deixa a OS do Omie igual ao portal e confere de novo. */
export async function alinharOS(idOs: string): Promise<ResultadoConferencia> {
  const conf = await conferirOS(idOs);
  if (conf.erro || conf.pulado || !conf._omie || !conf.divergencias.length) return limpar(conf);
  const os = (await lerOSDoPortal(idOs))!;
  const esp = espelhoDe(os);
  const dados = conf._omie, esperado = conf._esperado || [];
  const nCodOS = n(dados.Cabecalho?.nCodOS);
  const interna = !!os.Servico_Interno;

  // itens: casa igual à comparação (chave + texto quando repete)
  const omieItens = [...(dados.ServicosPrestados || [])];
  const usados = new Set<ItemOmieOS>();
  const servicos: Rec[] = [];
  // texto do item: o Omie só troca o cDescServ numa alteração que leva a SEQUÊNCIA
  // e só o texto (testado na OS-0729, 14/10/2026) — vai numa chamada separada
  const textos: Rec[] = [];
  let proxSeq = omieItens.reduce((m, o) => Math.max(m, n(o.nSeqItem)), 0);
  for (const p of esperado) {
    const cands = omieItens.filter((o) => !usados.has(o) && String(n(o.nCodServico)) === p.chave);
    const o = cands.find((x) => p.descricao !== undefined && String(x.cDescServ || "").replace(/\|/g, "\n").trim() === p.descricao.trim()) || cands[0];
    const campos: Rec = { nCodServico: p.nCodServico, nQtde: p.qtde, nValUnit: p.unit, cTpDesconto: "V", nValorDesconto: Math.round(p.desconto * 100) / 100 };
    if (p.descricao !== undefined) campos.cDescServ = p.descricao.slice(0, 2000);
    if (interna) campos.cNaoGerarFinanceiro = "S";
    if (o) {
      usados.add(o);
      const textoMudou = p.descricao !== undefined && textoNormal(o.cDescServ) !== textoNormal(p.descricao);
      const mudou = diferente(n(o.nQtde), p.qtde, 0.0005) || diferente(n(o.nValUnit), p.unit) || diferente(descontoOmie(o), p.desconto);
      const { cDescServ, ...valores } = campos;
      if (mudou || (interna && o.cNaoGerarFinanceiro !== "S")) servicos.push({ nSeqItem: o.nSeqItem, nIdItem: o.nIdItem, cAcaoItem: "A", ...valores });
      if (textoMudou) textos.push({ nSeqItem: o.nSeqItem, nIdItem: o.nIdItem, cAcaoItem: "A", cDescServ });
    } else servicos.push({ nSeqItem: ++proxSeq, cAcaoItem: "I", ...campos });
  }
  for (const o of omieItens) if (!usados.has(o) && o.nIdItem) servicos.push({ nSeqItem: o.nSeqItem, nIdItem: o.nIdItem, cAcaoItem: "E" });

  const total = esperado.reduce((s, p) => s + Math.max(0, p.qtde * p.unit - p.desconto), 0);
  const cab: Rec = { nCodOS, dDtPrevisao: isoBR(previsaoDaOS(os)) };
  const param: Rec = { Cabecalho: cab };
  if (esp && !interna) {
    const parc = parcelasDaOS(esp, previsaoDaOS(os), total);
    const soma = parc.reduce((t, p) => t + p.nValor, 0) || 1;
    cab.cCodParc = "999"; cab.nQtdeParc = parc.length;
    param.Parcelas = parc.map((p) => ({ ...p, nPercentual: Math.round((p.nValor / soma) * 10000) / 100 }));
  }
  const pedCli = await pedidosDaOS(os);
  if (servicos.length) param.ServicosPrestados = servicos;
  if (esp) {
    param.InformacoesAdicionais = {
      cCodCateg: esp.info.categoria || undefined,
      nCodCC: esp.info.conta || undefined,
      cNumContrato: esp.info.contrato || undefined,
      cDadosAdicNF: (esp.info.dadosNF || montarDadosAdic(os)) || undefined,
      ...(pedCli ? { cNumPedido: pedCli } : {}),
    };
    const deps = Object.entries(esp.deptos).filter(([, v]) => n(v) > 0);
    if (deps.length) param.Departamentos = deps.map(([c, v]) => ({ cCodDepto: c, nPerc: n(v), nValor: Math.round(total * n(v)) / 100, nValorFixo: "N" }));
    param.Email = interna ? { cEnviarPara: EMAIL_INTERNO, cEnvRecibo: "S", cEnvLink: "N", cEnvBoleto: "N" } : { cEnviarPara: esp.email.para || undefined, cEnvRecibo: esp.email.recibo ? "S" : "N" };
  } else if (pedCli) param.InformacoesAdicionais = { cNumPedido: pedCli };
  if (interna && !esp) param.Email = { cEnviarPara: EMAIL_INTERNO, cEnvRecibo: "S", cEnvLink: "N", cEnvBoleto: "N" };
  try {
    await omie("AlterarOS", param);
    if (textos.length) await omie("AlterarOS", { Cabecalho: { nCodOS }, ServicosPrestados: textos });
  }
  catch (e) {
    const r = await conferirOS(idOs);
    return { ...limpar(r), erro: `O Omie recusou a atualização: ${e instanceof Error ? e.message : e}` };
  }
  return limpar(await conferirOS(idOs));
}

function limpar(r: ResultadoConferencia & { _omie?: unknown; _esperado?: unknown }): ResultadoConferencia {
  const { _omie, _esperado, ...resto } = r; void _omie; void _esperado;
  return resto;
}
export const conferirOSPublico = async (id: string) => limpar(await conferirOS(id));
