"use client";
import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { clienteKey } from "@/lib/feedbacks/types";
import { linkNF, linkOS, linkPPV, linkPV, linkRequisicao, type Acesso, type LinkDoc } from "@/lib/feedbacks/atendimento/links";
import { servicoCancelado } from "@/lib/feedbacks/atendimento/historico-puro";
import { mesmoChassi, type Compra } from "@/lib/feedbacks/atendimento/puro";
import type { HistoricoClienteCompleto, MaquinaHistorico } from "@/lib/feedbacks/atendimento/historico-db";
import type { ServicoComPedidos } from "@/lib/feedbacks/atendimento/historico-puro";
import type { MaquinaRef } from "@/lib/feedbacks/maquina-modal";
import ModalMaquina from "./ModalMaquina";

interface Props {
  aberto: boolean;
  nome: string;
  codigoOmie: string | null;
  onFechar: () => void;
}

type Aba = "servicos" | "maquinas" | "avulsas" | "requisicoes";

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[1]}/${br[2]}/${br[3]}` : s;
}
function fmtMoeda(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtHoras(h: number | null | undefined): string {
  return h == null ? "" : `${h.toLocaleString("pt-BR")} h`;
}
const somar = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

export default function ModalHistoricoCliente({ aberto, ...resto }: Props) {
  // Só monta (e só lê permissões/dados) quando a janela abre.
  if (!aberto) return null;
  return <JanelaHistorico {...resto} />;
}

function JanelaHistorico({ nome, codigoOmie, onFechar }: Omit<Props, "aberto">) {
  const [dados, setDados] = useState<HistoricoClienteCompleto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>("servicos");
  // janela da máquina por cima (clique no cartão da aba Máquinas e revisões)
  const [maq, setMaq] = useState<MaquinaRef | null>(null);
  const { userProfile } = useAuth();
  // Com o módulo, OS/PPV abrem a tela; sem ele, o PDF (mesma regra do cockpit, links.ts).
  const { temAcesso } = usePermissoes(userProfile?.id);
  const acesso: Acesso = { pos: temAcesso("pos"), ppv: temAcesso("ppv") };

  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(async () => {
      if (!vivo) return;
      setCarregando(true);
      setDados(null);
      setErro(null);
      setAba("servicos");
      try {
        const q = new URLSearchParams({ key: clienteKey(codigoOmie, nome), nome: nome || "" });
        const r = await fetchAuth(`/api/feedbacks/historico-cliente?${q}`);
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErro(j?.erro || `erro ${r.status}`);
        else setDados(j as HistoricoClienteCompleto);
      } catch (e) {
        if (vivo) setErro((e as Error)?.message || "falha de rede");
      } finally {
        if (vivo) setCarregando(false);
      }
    });
    return () => { vivo = false; };
  }, [codigoOmie, nome]);

  // Esc fecha
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFechar]);

  const servicos = dados?.servicos ?? [];
  const avulsas = dados?.avulsas ?? [];
  const maquinas = dados?.maquinas ?? [];
  const requisicoes = dados?.requisicoes ?? [];
  const ativos = servicos.filter((s) => !servicoCancelado(s));
  const totalOS = somar(ativos.map((s) => s.valor));
  const totalPecasOS = somar(ativos.flatMap((s) => s.pedidos.map((p) => p.valor)));
  const totalAvulsas = somar(avulsas.map((c) => c.valor));
  const atrasadas = maquinas.filter((m) => m.proxima_revisao?.atrasada).length;
  const errosTxt = dados ? Object.keys(dados.erros || {}) : [];

  const abas: { id: Aba; ico: string; rot: string; qtd: number }[] = [
    { id: "servicos", ico: "fa-screwdriver-wrench", rot: "Serviços", qtd: servicos.length },
    { id: "maquinas", ico: "fa-tractor", rot: "Máquinas e revisões", qtd: maquinas.length },
    { id: "avulsas", ico: "fa-file-invoice-dollar", rot: "Compras avulsas", qtd: avulsas.length },
    { id: "requisicoes", ico: "fa-boxes-stacked", rot: "Requisições", qtd: requisicoes.length },
  ];

  const sub = [
    codigoOmie ? `Omie ${codigoOmie}` : "sem código Omie — buscando pelo nome",
    dados?.cnpj ? `CPF/CNPJ ${dados.cnpj}` : "",
    dados && dados.codigos_omie.length > 1 ? `${dados.codigos_omie.length} cadastros no Omie (Nova e Castro)` : "",
  ].filter(Boolean).join(" · ");

  return (
    <>
    <ModalMaquina alvo={maq} onFechar={() => setMaq(null)} />
    <div className="hcx-fundo" onClick={onFechar}>
      <style>{ESTILO_HCX}</style>
      <div className="hcx" role="dialog" aria-modal="true" aria-label={`Histórico de ${nome}`} onClick={(e) => e.stopPropagation()}>
        <header className="hcx-cab">
          <span className="hcx-ico" style={{ ["--c" as string]: "#0369a1" }}><i className="fa-solid fa-clock-rotate-left" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hcx-rot">Histórico do cliente</div>
            <h2 className="hcx-nome">{dados?.nome || nome}</h2>
            <div className="hcx-rot">{sub}</div>
          </div>
          <button type="button" onClick={onFechar} className="hcx-x" aria-label="Fechar (Esc)"><i className="fa-solid fa-xmark" /></button>
        </header>

        {dados && (
          <nav className="hcx-abas" role="tablist">
            {abas.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`hcx-aba${aba === a.id ? " on" : ""}`} onClick={() => setAba(a.id)}>
                <i className={`fa-solid ${a.ico}`} /> {a.rot} <span className="hcx-qtd">{a.qtd}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="hcx-corpo">
          {carregando ? (
            <div className="hcx-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Carregando o histórico…</div>
          ) : !dados ? (
            <div className="hcx-vazio">Não foi possível carregar{erro ? `: ${erro}` : "."}</div>
          ) : (
            <>
              <div className="hcx-resumo">
                <Resumo ico="fa-screwdriver-wrench" cor="#0369a1" label="Ordens de serviço" valor={String(ativos.length)} sub={fmtMoeda(totalOS)} />
                <Resumo ico="fa-gears" cor="#16a34a" label="Peças nas OS" valor={fmtMoeda(totalPecasOS)} sub={`${ativos.reduce((n, s) => n + s.pedidos.length, 0)} pedido(s)`} />
                <Resumo ico="fa-tractor" cor="#7c3aed" label="Máquinas" valor={String(maquinas.length)} sub={atrasadas ? `${atrasadas} com revisão atrasada` : ""} />
                <Resumo ico="fa-file-invoice-dollar" cor="#ea580c" label="Balcão" valor={String(avulsas.length)} sub={fmtMoeda(totalAvulsas)} />
              </div>
              {errosTxt.length > 0 && (
                <div className="hcx-aviso"><i className="fa-solid fa-triangle-exclamation" /> Parte do histórico não carregou ({errosTxt.join(", ")}). O resto está abaixo.</div>
              )}

              {aba === "servicos" && (
                <div className="hcx-lista">
                  {servicos.length === 0 ? <Nada /> : servicos.map((s, i) => <CartaoOS key={`${s.origem}-${s.numero}-${i}`} s={s} acesso={acesso} maquinas={maquinas} />)}
                </div>
              )}
              {aba === "maquinas" && (
                <div className="hcx-lista">
                  {maquinas.length === 0 ? <Nada texto="Nenhuma máquina encontrada (controle de revisões, projetos Omie, OS/PPV, CRM ou pasta)." /> : maquinas.map((m, i) => <CartaoMaquina key={`${m.chassi || m.modelo}-${i}`} m={m} onAbrir={m.chassi ? () => setMaq({ chassi: m.chassi, modelo: m.modelo, projeto: m.projetos[0] ?? m.projeto ?? null, trator: null }) : undefined} />)}
                </div>
              )}
              {aba === "avulsas" && (
                <div className="hcx-lista">
                  {avulsas.length === 0 ? <Nada texto="Nenhum pedido de venda sem OS." /> : avulsas.map((c, i) => <LinhaCompra key={`${c.id_ppv || ""}-${c.numero_pv || ""}-${i}`} c={c} acesso={acesso} solta />)}
                </div>
              )}
              {aba === "requisicoes" && (
                <div className="hcx-lista">
                  {requisicoes.length === 0 ? <Nada /> : requisicoes.map((rq) => {
                    const href = linkRequisicao(rq.id);
                    return (
                      <div key={`req${rq.id}`} className="hcx-linha">
                        <div className="hcx-linha-t">
                          <span className="hcx-min"><Doc doc={href ? { href, titulo: `Abrir a requisição ${rq.id}`, tipo: "tela" } : null}>{rq.titulo || "Requisição"}</Doc>{rq.tipo && <span className="hcx-emp"> · {rq.tipo}</span>}</span>
                          <span className="hcx-valor">{fmtMoeda(rq.valor_despeza)}</span>
                        </div>
                        <div className="hcx-linha-d">
                          <span><i className="fa-regular fa-calendar" /> {fmtData(rq.data)}</span>
                          {rq.status && <Pilula texto={rq.status} />}
                        </div>
                        {(rq.fornecedor || rq.ordem_servico) && <div className="hcx-det">{[rq.fornecedor ? `Fornecedor: ${rq.fornecedor}` : "", rq.ordem_servico ? `OS ${rq.ordem_servico}` : ""].filter(Boolean).join(" · ")}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// --- cartões -----------------------------------------------------------------

function CartaoOS({ s, acesso, maquinas }: { s: ServicoComPedidos; acesso: Acesso; maquinas: MaquinaHistorico[] }) {
  const doc = linkOS(s, acesso);
  const nf = linkNF(s.link_nf);
  const cancelada = servicoCancelado(s);
  const maq = s.chassi ? maquinas.find((m) => mesmoChassi(m.chassi, s.chassi)) : null;
  const rotulo = s.id_ordem ? (s.ordem_omie ? `OS ${s.ordem_omie} · ${s.id_ordem}` : s.id_ordem) : `OS ${s.numero ?? "—"}`;
  const pecas = somar(s.pedidos.map((p) => p.valor));
  return (
    <article className={`hcx-linha${cancelada ? " cancelada" : ""}`}>
      <div className="hcx-linha-t">
        <span className="hcx-min"><b><Doc doc={doc}>{rotulo}</Doc></b><span className="hcx-emp"> · {s.origem === "omie" ? (s.empresa || "Omie") : "Oficina (POS)"}</span></span>
        <span className="hcx-valor">{fmtMoeda(s.valor)}</span>
      </div>
      <div className="hcx-linha-d">
        <span><i className="fa-regular fa-calendar" /> {fmtData(s.data)}</span>
        {s.status && <Pilula texto={s.status} />}
        {s.tecnico && <span><i className="fa-regular fa-user" /> {s.tecnico}</span>}
        {s.chassi && <span><i className="fa-solid fa-tractor" /> {maq?.modelo ? `${maq.modelo} · ` : ""}…{s.chassi.slice(-6)}</span>}
        {nf && <a className="hcx-a" href={nf.href} target="_blank" rel="noopener noreferrer" title={nf.titulo}><i className="fa-regular fa-file-lines" /> NF</a>}
      </div>
      {s.descricao && <div className="hcx-det hcx-clamp" title={s.descricao}>{s.descricao}</div>}
      {s.pedidos.length > 0 && (
        <div className="hcx-pecas">
          <div className="hcx-pecas-t"><span><i className="fa-solid fa-gears" /> Peças desta OS</span><span className="hcx-valor p">{fmtMoeda(pecas)}</span></div>
          {s.pedidos.map((c, i) => <LinhaCompra key={`${c.id_ppv || ""}-${c.numero_pv || ""}-${i}`} c={c} acesso={acesso} />)}
          {s.valor != null && <div className="hcx-rot" style={{ textAlign: "right" }}>Serviço + peças: <b>{fmtMoeda((s.valor ?? 0) + pecas)}</b></div>}
        </div>
      )}
    </article>
  );
}

function LinhaCompra({ c, acesso, solta = false }: { c: Compra; acesso: Acesso; solta?: boolean }) {
  const docPpv = linkPPV(c.id_ppv, acesso);
  const docPv = c.origem === "ppv" ? docPpv : linkPV(c);
  const nf = linkNF(c.link_nf, c.nf);
  const situacao = c.faturado ? `Faturado${c.nf ? ` · NF ${c.nf}` : ""}` : c.status ? (c.origem === "ppv" ? `PPV: ${c.status}` : c.status) : "";
  return (
    <div className={solta ? "hcx-linha" : "hcx-pv"}>
      <div className="hcx-linha-t">
        <span className="hcx-min">
          {c.id_ppv && <Doc doc={docPpv}>{c.id_ppv}</Doc>}
          {c.id_ppv && c.numero_pv && <span className="hcx-emp"> → </span>}
          {c.numero_pv && <Doc doc={docPv}>PV {c.numero_pv}</Doc>}
          {!c.id_ppv && !c.numero_pv && "Pedido —"}
          {c.empresa && <span className="hcx-emp"> · {c.empresa}</span>}
        </span>
        <span className={`hcx-valor${solta ? "" : " p"}`}>{fmtMoeda(c.valor)}</span>
      </div>
      <div className="hcx-linha-d">
        <span><i className="fa-regular fa-calendar" /> {fmtData(c.data)}</span>
        {situacao && <Pilula texto={situacao} />}
        {c.tipo && c.tipo !== "Pedido" && <span>{c.tipo}</span>}
        {c.tecnico && <span><i className="fa-regular fa-user" /> {c.tecnico}</span>}
        {nf && <a className="hcx-a" href={nf.href} target="_blank" rel="noopener noreferrer" title={nf.titulo}><i className="fa-regular fa-file-lines" /> NF</a>}
      </div>
    </div>
  );
}

function CartaoMaquina({ m, onAbrir }: { m: MaquinaHistorico; onAbrir?: () => void }) {
  const prox = m.proxima_revisao;
  const temControle = !!m.id_trator;
  const proximaRot = prox ? `${prox.horas}h` : null;
  // depois da próxima, mostra só mais duas do plano (o resto é ruído)
  const futuras = m.pendentes.filter((r) => r !== proximaRot).slice(0, 2);
  const dados: [string, string][] = [
    ["Entrega", fmtData(m.entrega)],
    ["Vendedor", m.vendedor || "—"],
    ["Cidade", m.cidade || "—"],
  ];
  return (
    <article className={`hcx-linha ${onAbrir ? "hcx-clica" : ""}`} onClick={onAbrir} role={onAbrir ? "button" : undefined} tabIndex={onAbrir ? 0 : undefined}
      onKeyDown={onAbrir ? (e) => { if (e.key === "Enter") onAbrir(); } : undefined} title={onAbrir ? "Abrir a máquina: projeto, últimas revisões e últimos serviços" : undefined}>
      <div className="hcx-linha-t">
        <span className="hcx-min"><b><i className="fa-solid fa-tractor" style={{ color: "#7c3aed" }} /> {m.modelo || "Máquina"}</b></span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {prox?.atrasada && <Pilula texto="Revisão atrasada" cor="#dc2626" />}
          {onAbrir && <span className="hcx-a" style={{ fontSize: 13, whiteSpace: "nowrap" }}>ver a máquina <i className="fa-solid fa-chevron-right" style={{ fontSize: 10 }} /></span>}
        </span>
      </div>
      <div className="hcx-linha-d">
        <span className="hcx-mono">{m.chassi ? `Chassi ${m.chassi}` : "sem chassi"}</span>
        {m.projetos.map((p) => <span key={`${p.nome}|${p.empresa}`} className="hcx-tag">Projeto · {p.empresa || "Omie"}</span>)}
      </div>
      {m.dono_tratores && <div className="hcx-det"><i className="fa-solid fa-circle-info" /> No controle de revisões está em nome de <b>{m.dono_tratores}</b>.</div>}
      {temControle && (
        <div className="hcx-dados">
          {dados.map(([k, v]) => <div key={k}><div className="hcx-rot">{k}</div><div>{v}</div></div>)}
        </div>
      )}
      {temControle ? (
        <ol className="hcx-tempo">
          {m.entrega && <Passo estado="feito" titulo="Entrega" data={m.entrega} />}
          {m.revisoes.map((r) => (
            <Passo key={r.rotulo} estado="feito" titulo={r.rotulo === "Inspeção" ? "Inspeção de entrega" : `Revisão ${r.rotulo}`} data={r.data} extra={fmtHoras(r.horimetro)} pdf={r.pdf} />
          ))}
          {prox && (
            <Passo estado={prox.atrasada ? "atrasada" : "proxima"} titulo={`Próxima: revisão ${prox.horas}h`}
              data={prox.data_estimada} prefixoData="prevista para" extra={prox.atrasada ? "atrasada" : prox.media_horas_dia ? `~${prox.media_horas_dia.toLocaleString("pt-BR")} h/dia` : ""} />
          )}
          {futuras.map((r) => <Passo key={r} estado="futura" titulo={`Revisão ${r}`} />)}
          {m.revisoes.length === 0 && !m.entrega && <li className="hcx-rot">Nenhuma revisão registrada.</li>}
        </ol>
      ) : (
        <div className="hcx-det">Fora do controle de revisões Mahindra — só os dados da máquina.</div>
      )}
    </article>
  );
}

function Passo({ estado, titulo, data, extra, pdf, prefixoData }: { estado: "feito" | "proxima" | "atrasada" | "futura"; titulo: string; data?: string | null; extra?: string; pdf?: string | null; prefixoData?: string }) {
  return (
    <li className={`hcx-passo ${estado}`}>
      <span className="hcx-ponto" aria-hidden><i className={`fa-solid ${estado === "feito" ? "fa-check" : estado === "atrasada" ? "fa-exclamation" : estado === "proxima" ? "fa-clock" : "fa-circle"}`} /></span>
      <div className="hcx-min">
        <div>{titulo}</div>
        <div className="hcx-rot">
          {[data ? `${prefixoData ? `${prefixoData} ` : ""}${fmtData(data)}` : estado === "feito" ? "sem data" : "", extra].filter(Boolean).join(" · ")}
          {pdf && <> · <a className="hcx-a" href={pdf} target="_blank" rel="noopener noreferrer">ver cheque</a></>}
        </div>
      </div>
    </li>
  );
}

// --- miúdos ------------------------------------------------------------------

/** Documento clicável (nova aba, como no cockpit); sem link vira texto. */
function Doc({ doc, children }: { doc: LinkDoc | null; children: React.ReactNode }) {
  if (!doc) return <>{children}</>;
  return <a className="hcx-a" href={doc.href} target="_blank" rel="noopener noreferrer" title={doc.titulo}>{children}</a>;
}

/** cor da situação: faturada verde, cancelada vermelha, aberta âmbar, o resto cinza */
function corBadge(b: string): string {
  const t = b.toLowerCase();
  if (/fatur|conclu|aprov|executad/.test(t)) return "#16a34a";
  if (/cancel|devolv|recus/.test(t)) return "#dc2626";
  if (/aberto|parcial|pend|aguard|execu/.test(t)) return "#d97706";
  return "#64748b";
}
function Pilula({ texto, cor }: { texto: string; cor?: string }) {
  return <span className="hcx-pil" style={{ ["--k" as string]: cor || corBadge(texto) }}>{texto}</span>;
}

function Resumo({ ico, cor, label, valor, sub }: { ico: string; cor: string; label: string; valor: string; sub: string }) {
  return (
    <div className="hcx-card" style={{ ["--c" as string]: cor }}>
      <span className="hcx-ico p"><i className={`fa-solid ${ico}`} /></span>
      <div className="hcx-min">
        <div className="hcx-rot">{label}</div>
        <div className="hcx-num">{valor}</div>
        {sub && <div className="hcx-rot">{sub}</div>}
      </div>
    </div>
  );
}
function Nada({ texto = "Nada registrado." }: { texto?: string }) {
  return <div className="hcx-rot" style={{ padding: "4px 2px" }}>{texto}</div>;
}

// Estilo POS NewPortal (docs/estilo-pos-newportal.md) — José, 23/10/2026: "aplicar o estilo aqui também".
export const ESTILO_HCX = `
.hcx-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; font-family: Inter, system-ui, sans-serif }
.hcx { --s: var(--portal-bg-card, #fefefe); --b: var(--portal-border, #e2e8f0); --soft: var(--portal-bg-secondary, #f8fafc); --t: var(--portal-text, #0f172a); --t2: var(--portal-text-secondary, #475569);
  background: var(--soft); width: 100%; max-width: 860px; max-height: 92vh; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px -30px rgba(15,23,42,.6); color: var(--t) }
.hcx *:not(i):not([class*="fa-"]) { font-weight: inherit } .hcx b { font-weight: 500 }
.hcx-cab { display: flex; gap: 12px; align-items: center; padding: 16px 20px; background: var(--s); border-bottom: 1px solid var(--b) }
.hcx-ico { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-size: 17px; flex: none; color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--s)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.hcx-ico.p { width: 36px; height: 36px; border-radius: 10px; font-size: 14px }
.hcx-rot { font-size: 12.5px; color: var(--t2); overflow-wrap: anywhere }
.hcx-nome { font-size: 20px; font-weight: 500; letter-spacing: -.01em; margin: 1px 0; overflow-wrap: anywhere }
.hcx-x { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--b); background: var(--s); color: var(--t2); cursor: pointer; font-size: 15px; flex: none }
.hcx-x:hover { color: var(--t); border-color: #94a3b8 }
.hcx-abas { display: flex; gap: 6px; padding: 10px 20px; background: var(--s); border-bottom: 1px solid var(--b); overflow-x: auto; scrollbar-width: thin }
.hcx-aba { flex: none; display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--b); background: var(--s); color: var(--t2); font-size: 13.5px; cursor: pointer; font-family: inherit }
.hcx-aba:hover { color: var(--t) }
.hcx-aba.on { color: #0369a1; border-color: color-mix(in srgb, #0369a1 35%, transparent); background: color-mix(in srgb, #0369a1 8%, var(--s)) }
.hcx-corpo { padding: 18px 20px 22px; overflow-y: auto; overflow-x: hidden; flex: 1; display: grid; gap: 14px; align-content: start }
.hcx-vazio { padding: 50px; text-align: center; color: var(--t2); font-size: 14px }
.hcx-aviso { font-size: 13px; color: #92400e; background: color-mix(in srgb, #f59e0b 10%, var(--s)); border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent); border-radius: 12px; padding: 8px 12px }
.hcx-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px }
.hcx-card { display: flex; gap: 12px; align-items: center; background: var(--s); border: 1px solid var(--b); border-radius: 16px; padding: 14px 16px; min-width: 0 }
.hcx-num { font-size: 20px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.15; overflow-wrap: anywhere }
.hcx-qtd { font-size: 12px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, #0369a1 10%, var(--s)) }
.hcx-lista { display: grid; gap: 10px; min-width: 0 }
.hcx-min { min-width: 0; overflow-wrap: anywhere }
.hcx-linha { background: var(--s); border: 1px solid var(--b); border-radius: 16px; padding: 12px 14px; display: grid; gap: 6px; min-width: 0 }
.hcx-linha.cancelada { opacity: .5 }
.hcx-linha.hcx-clica { cursor: pointer; transition: border-color .2s, box-shadow .2s } .hcx-linha.hcx-clica:hover { border-color: color-mix(in srgb, #7c3aed 40%, var(--b)); box-shadow: 0 10px 22px -18px rgba(15,23,42,.55) }
.hcx-linha-t { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; font-size: 14.5px; min-width: 0 }
.hcx-emp { color: var(--t2); font-size: 13px }
.hcx-valor { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.hcx-valor.p { font-size: 13.5px }
.hcx-linha-d { display: flex; gap: 6px 12px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--t2); min-width: 0 }
.hcx-pil { font-size: 12px; padding: 1px 9px; border-radius: 999px; color: color-mix(in srgb, var(--k) 80%, #0f172a); background: color-mix(in srgb, var(--k) 11%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 22%, transparent) }
.hcx-tag { font-size: 12px; padding: 1px 9px; border-radius: 999px; border: 1px solid var(--b) }
.hcx-det { font-size: 13px; color: var(--t2); line-height: 1.5; overflow-wrap: anywhere }
.hcx-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden }
.hcx-mono { font-variant-numeric: tabular-nums; letter-spacing: .01em; overflow-wrap: anywhere }
.hcx-a { color: #0369a1; text-decoration: none } .hcx-a:hover { text-decoration: underline }
.hcx-pecas { margin-top: 4px; display: grid; gap: 6px; background: var(--soft); border: 1px solid var(--b); border-radius: 14px; padding: 10px 12px }
.hcx-pecas-t { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--t2) } .hcx-pecas-t i { color: #16a34a }
.hcx-pv { display: grid; gap: 4px; padding: 8px 10px; border-radius: 12px; background: var(--s); border: 1px solid var(--b); min-width: 0 }
.hcx-pv .hcx-linha-t { font-size: 13.5px }
.hcx-dados { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; font-size: 13.5px; padding: 8px 0 2px }
.hcx-tempo { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 0 }
.hcx-passo { display: grid; grid-template-columns: 26px 1fr; gap: 10px; position: relative; padding-bottom: 10px; font-size: 13.5px }
.hcx-passo:not(:last-child)::before { content: ""; position: absolute; left: 12px; top: 24px; bottom: 0; width: 2px; background: var(--b) }
.hcx-ponto { width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; --k: #94a3b8; color: color-mix(in srgb, var(--k) 85%, #0f172a); background: color-mix(in srgb, var(--k) 12%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 30%, transparent) }
.hcx-passo.feito .hcx-ponto { --k: #16a34a }
.hcx-passo.proxima .hcx-ponto { --k: #0369a1 }
.hcx-passo.atrasada .hcx-ponto { --k: #dc2626 }
.hcx-passo.atrasada > div > div:first-child { color: #dc2626 }
.hcx-passo.futura { color: var(--t2) } .hcx-passo.futura .hcx-ponto i { font-size: 6px }
@media (max-width: 640px) {
  .hcx-fundo { padding: 16px }
  .hcx { max-height: calc(100vh - 32px); border-radius: 16px }
  .hcx-cab { padding: 14px 16px } .hcx-abas { padding: 8px 16px } .hcx-corpo { padding: 14px 16px 18px }
  .hcx-resumo { grid-template-columns: 1fr 1fr } .hcx-card { padding: 10px 12px; gap: 8px } .hcx-card .hcx-ico.p { display: none }
  .hcx-num { font-size: 17px }
}
`;
