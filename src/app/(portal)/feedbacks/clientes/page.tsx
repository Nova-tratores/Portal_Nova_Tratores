"use client";
// Feedbacks → Clientes (refeita 23/10/2026; antes "Histórico de atendimentos"). Achar um cliente e ver
// tudo dele: (1) a busca no cadastro Omie abre o histórico completo (serviços, máquinas e revisões,
// compras, requisições — ModalHistoricoCliente), mesmo de quem nunca foi atendido; (2) a lista de quem
// já foi atendido (CRM/RFM) com a ficha ao lado — contato, tags, equipamentos, funcionários,
// fazendas, a linha do tempo dos atendimentos (clique edita) e os atalhos para a fila de hoje e o
// cockpit; (3) Contatos do WhatsApp por cargo (antes /feedbacks/atendimento/contatos).
// URL: ?registro=<id> abre aquele atendimento · ?cliente=<chave> seleciona · ?ver=contatos.
// Permissão: feedbacks:clientes ou feedbacks:atendimento (lib/feedbacks/telas).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import ClienteAutocomplete from "@/components/feedbacks/ClienteAutocomplete";
import ModalHistoricoCliente from "@/components/feedbacks/ModalHistoricoCliente";
import ModalPerfilCliente from "@/components/feedbacks/ModalPerfilCliente";
import ModalFeedback from "@/components/feedbacks/ModalFeedback";
import TimelineRegistros from "@/components/feedbacks/TimelineRegistros";
import Casca from "@/components/feedbacks/hoje/Casca";
import ContatosPorCargoAba from "@/components/feedbacks/hoje/ContatosPorCargo";
import { listarClientesInfo, listarRegistros } from "@/lib/feedbacks/api";
import { clienteKey, TAGS_CLIENTE, TAG_NAO_CONTATAR, type ClienteInfo, type FeedbackRegistro } from "@/lib/feedbacks/types";
import { podeAba } from "@/lib/feedbacks/telas";

interface ClienteAgregado {
  key: string; nome: string; codigoOmie: string | null; telefone: string | null;
  total: number; pos: number; reat: number; abertos: number; notaMedia: number | null; ultimaData: string; registros: FeedbackRegistro[];
}

const dataRef = (r: FeedbackRegistro) => r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em || "";
const fmtDia = (s: string) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

function agregar(registros: FeedbackRegistro[]): ClienteAgregado[] {
  const map = new Map<string, ClienteAgregado>();
  for (const r of registros) {
    const k = clienteKey(r.codigo_omie, r.nome);
    let a = map.get(k);
    if (!a) { a = { key: k, nome: r.nome, codigoOmie: r.codigo_omie, telefone: r.telefone, total: 0, pos: 0, reat: 0, abertos: 0, notaMedia: null, ultimaData: "", registros: [] }; map.set(k, a); }
    a.registros.push(r); a.total++;
    if (r.tipo === "crm") a.pos++; else a.reat++;
    if (r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento") a.abertos++;
    if (!a.telefone && r.telefone) a.telefone = r.telefone;
    if (!a.codigoOmie && r.codigo_omie) a.codigoOmie = r.codigo_omie;
    const d = dataRef(r);
    if (d > a.ultimaData) a.ultimaData = d;
  }
  for (const a of map.values()) {
    const notas = a.registros.map((r) => r.nota).filter((n): n is number => n != null);
    a.notaMedia = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
  }
  return [...map.values()];
}

type Ordem = "recente" | "atendidos" | "nome" | "pior_nota" | "melhor_nota";
const ORDENS: { v: Ordem; rot: string }[] = [
  { v: "recente", rot: "Mais recente" }, { v: "atendidos", rot: "Mais atendidos" }, { v: "nome", rot: "Nome (A–Z)" }, { v: "pior_nota", rot: "Pior nota" }, { v: "melhor_nota", rot: "Melhor nota" },
];
function ordenar(l: ClienteAgregado[], o: Ordem) {
  const a = [...l];
  if (o === "atendidos") return a.sort((x, y) => y.total - x.total || x.nome.localeCompare(y.nome, "pt-BR"));
  if (o === "nome") return a.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR", { sensitivity: "base" }));
  if (o === "pior_nota") return a.sort((x, y) => (x.notaMedia ?? 99) - (y.notaMedia ?? 99) || y.ultimaData.localeCompare(x.ultimaData));
  if (o === "melhor_nota") return a.sort((x, y) => (y.notaMedia ?? -1) - (x.notaMedia ?? -1) || y.ultimaData.localeCompare(x.ultimaData));
  return a.sort((x, y) => y.ultimaData.localeCompare(x.ultimaData));
}
const corNota = (n: number | null) => (n == null ? "#94a3b8" : n >= 8 ? "#16a34a" : n >= 5 ? "#d97706" : "#dc2626");

function TagPill({ tag }: { tag: string }) {
  const def = TAGS_CLIENTE.find((x) => x.tag === tag);
  const nao = tag === TAG_NAO_CONTATAR;
  return (
    <span className="fbn-pilula" style={{ ["--k" as string]: def?.cor || (nao ? "#991b1b" : "#475569") }}>
      {nao && <i className="fa-solid fa-ban" />} {def?.label || (nao ? "Não contatar" : tag)}
    </span>
  );
}

const PASSO = 80;

export default function FeedbacksClientesPage() {
  return <Suspense fallback={null}><Clientes /></Suspense>;
}

function Clientes() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeCockpit = pode("feedbacks", "atendimento");
  const podeHoje = podeAba(pode, "hoje");
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ver = sp.get("ver") === "contatos" && podeCockpit ? "contatos" : "atendidos";

  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [info, setInfo] = useState<ClienteInfo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const [soAbertos, setSoAbertos] = useState(false);
  const [n, setN] = useState(PASSO);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [omie, setOmie] = useState("");
  const [hist, setHist] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [registroEdit, setRegistroEdit] = useState<FeedbackRegistro | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [r, i] = await Promise.all([Promise.all([listarRegistros("crm"), listarRegistros("rfm")]).then((x) => x.flat()), listarClientesInfo()]);
      setRegistros(r); setInfo(i);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  // ?registro= abre o atendimento (e seleciona o cliente) · ?cliente= seleciona
  const aplicado = useRef(false);
  useEffect(() => {
    if (aplicado.current || registros.length === 0) return;
    aplicado.current = true;
    const cli = sp.get("cliente"), reg = sp.get("registro");
    const r = reg ? registros.find((x) => String(x.id) === reg) : null;
    let vivo = true;
    Promise.resolve().then(() => {
      if (!vivo) return;
      if (cli) setSelKey(cli);
      if (r) { if (!cli) setSelKey(clienteKey(r.codigo_omie, r.nome)); setRegistroEdit(r); }
    });
    return () => { vivo = false; };
  }, [registros, sp]);

  const agregados = useMemo(() => agregar(registros), [registros]);
  const infoPorKey = useMemo(() => new Map(info.map((i) => [i.cliente_key, i])), [info]);
  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const dig = q.replace(/\D/g, "");
    const base = agregados.filter((c) => {
      if (soAbertos && !c.abertos) return false;
      if (!q) return true;
      return c.nome.toLowerCase().includes(q) || (c.codigoOmie || "").includes(q) || (dig.length >= 4 && (c.telefone || "").replace(/\D/g, "").includes(dig))
        || (infoPorKey.get(c.key)?.cidade || "").toLowerCase().includes(q);
    });
    return ordenar(base, ordem);
  }, [agregados, filtro, ordem, soAbertos, infoPorKey]);

  const sel = selKey ? agregados.find((c) => c.key === selKey) ?? null : null;
  const infoSel = selKey ? infoPorKey.get(selKey) ?? null : null;
  const totais = useMemo(() => ({ clientes: agregados.length, abertos: agregados.filter((c) => c.abertos).length, atendimentos: registros.length }), [agregados, registros]);

  const trocarVer = (v: "atendidos" | "contatos") => router.replace(v === "atendidos" ? pathname : `${pathname}?ver=contatos`, { scroll: false });

  const equipamentos = useMemo(() => {
    if (!sel) return [];
    const norm = (s: string) => s.trim().toUpperCase();
    return [...new Map([...(infoSel?.equipamentos || []), ...sel.registros.map((r) => r.trator || "")].map((e) => (e || "").trim()).filter(Boolean).map((e) => [norm(e), e] as [string, string])).values()];
  }, [sel, infoSel]);

  return (
    <Casca>
      <div className="fbh-linha-topo">
        <div className="fbr-seg" role="tablist" aria-label="O que ver">
          <button type="button" role="tab" aria-selected={ver === "atendidos"} className={ver === "atendidos" ? "on" : ""} onClick={() => trocarVer("atendidos")}><i className="fa-solid fa-address-book" /> Clientes atendidos</button>
          {podeCockpit && <button type="button" role="tab" aria-selected={ver === "contatos"} className={ver === "contatos" ? "on" : ""} onClick={() => trocarVer("contatos")}><i className="fa-brands fa-whatsapp" /> Contatos do WhatsApp</button>}
        </div>
        <span style={{ flex: 1 }} />
        <div className="fbr-omie" title="Qualquer cliente do Omie, mesmo quem nunca foi atendido">
          <ClienteAutocomplete valor={omie} onChange={setOmie} placeholder="Procurar no cadastro Omie (nome, CNPJ ou CPF) e abrir o histórico"
            onSelecionar={(c) => { setOmie(c.nome_fantasia || c.razao_social || ""); setHist({ nome: c.razao_social || c.nome_fantasia || "", codigoOmie: c.id_omie }); }} />
        </div>
      </div>

      <details className="fbf-como">
        <summary><i className="fa-regular fa-circle-question" style={{ color: "var(--c)" }} /> Como ler esta tela</summary>
        <ul>
          <li><b>Procurar no cadastro Omie</b> (em cima, à direita) acha qualquer cliente e abre o <b>histórico completo</b>: serviços, máquinas e revisões, compras e requisições.</li>
          <li><b>Clientes atendidos</b> são os que já tiveram algum atendimento: <b>Pós-serviço</b> (o antigo CRM, depois de uma OS) ou <b>Reativação</b> (o antigo RFM). A bolinha ao lado do nome é a nota média: verde 8 a 10, âmbar 5 a 7, vermelha abaixo de 5, cinza sem nota.</li>
          <li>Os números do topo: clientes atendidos, quantos estão <b>em aberto</b> (atendimento ainda não concluído — clique filtra) e o total de atendimentos.</li>
          <li>Clique num cliente para ver a ficha: contato, tags, equipamentos, funcionários e fazendas, e a <b>linha do tempo</b> dos atendimentos (clique num atendimento para abrir e corrigir). <b>Editar perfil</b> muda cidade, e-mail, tags, funcionários e fazendas.</li>
          <li><b>Ver na fila de hoje</b> abre o cliente na aba Hoje (se ele tiver algum motivo para ligar); <b>Abrir no cockpit</b> é a tela da ligação.{podeCockpit ? " Contatos do WhatsApp lista quem é quem de cada cliente no NovaZap." : ""}</li>
        </ul>
      </details>

      {ver === "contatos" ? <ContatosPorCargoAba /> : (
        <>
          <div className="fbh-conts">
            {[
              { rot: "clientes atendidos", v: totais.clientes, ico: "fa-users", cor: "#475569", on: false, clique: () => setSoAbertos(false) },
              { rot: "com atendimento em aberto", v: totais.abertos, ico: "fa-hourglass-half", cor: "#d97706", on: soAbertos, clique: () => setSoAbertos(!soAbertos) },
              { rot: "atendimentos no total", v: totais.atendimentos, ico: "fa-comments", cor: "#dc2626", on: false, clique: () => setSoAbertos(false) },
            ].map((t, i) => (
              <button key={t.rot} type="button" className={`fbh-cont ${t.on ? "on" : ""}`} style={{ ["--k" as string]: t.cor, animationDelay: `${i * 60}ms` }} onClick={t.clique}>
                <span className="fbn-ico"><i className={`fa-solid ${t.ico}`} /></span>
                <span><b>{carregando ? "…" : t.v.toLocaleString("pt-BR")}</b><small>{t.rot}</small></span>
              </button>
            ))}
          </div>

          {erro && <div className="fbn-erro">Erro: {erro}</div>}

          <div className="fbh-o1">
            <div style={{ display: "grid", gap: 10, minWidth: 0, alignContent: "start" }}>
              <div className="fbh-filtros">
                <label className="fbn-busca">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input type="text" value={filtro} onChange={(e) => { setFiltro(e.target.value); setN(PASSO); }} placeholder="Nome, cidade, telefone ou código Omie" />
                  {filtro && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => setFiltro("")} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
                </label>
                <select className="fbn-campo" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordem">
                  {ORDENS.map((o) => <option key={o.v} value={o.v}>{o.rot}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--t2)" }}>{filtrados.length.toLocaleString("pt-BR")} de {agregados.length.toLocaleString("pt-BR")} clientes</div>
              {carregando ? <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Lendo os atendimentos…</div>
                : filtrados.length === 0 ? <div className="fbn-vazio">Nenhum cliente com esse filtro. Tente o cadastro Omie lá em cima.</div>
                : (
                  <div className="fbh-sec">
                    {filtrados.slice(0, n).map((c, i) => {
                      const inf = infoPorKey.get(c.key);
                      return (
                        <button key={c.key} type="button" className={`fbh-cli ${selKey === c.key ? "sel" : ""}`} onClick={() => setSelKey(c.key)} aria-pressed={selKey === c.key} style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                          <span className="pos" title={c.notaMedia != null ? `nota média ${c.notaMedia}` : "sem nota"}><span style={{ width: 10, height: 10, borderRadius: 5, background: corNota(c.notaMedia) }} /></span>
                          <span style={{ minWidth: 0 }}>
                            <span className="nm">{c.nome}</span>
                            <span className="sub">
                              {c.telefone && <span><i className="fa-solid fa-phone" /> {c.telefone}</span>}
                              {inf?.cidade && <span><i className="fa-solid fa-location-dot" /> {inf.cidade}</span>}
                              <span>último {fmtDia(c.ultimaData)}</span>
                            </span>
                            <span className="fbh-selos">
                              {c.pos > 0 && <span className="fbh-selo" style={{ ["--k" as string]: "#dc2626" }}><i className="fa-solid fa-screwdriver-wrench" /> {c.pos} pós-serviço</span>}
                              {c.reat > 0 && <span className="fbh-selo" style={{ ["--k" as string]: "#6366f1" }}><i className="fa-solid fa-user-clock" /> {c.reat} reativação</span>}
                              {c.abertos > 0 && <span className="fbh-selo" style={{ ["--k" as string]: "#d97706" }}><i className="fa-solid fa-hourglass-half" /> {c.abertos} em aberto</span>}
                              {inf?.tags.includes(TAG_NAO_CONTATAR) && <span className="fbh-selo" style={{ ["--k" as string]: "#991b1b" }}><i className="fa-solid fa-ban" /> Não contatar</span>}
                            </span>
                          </span>
                          <span className="fbh-pts">{c.notaMedia != null ? <><i className="fa-solid fa-star" style={{ color: "#ca8a04", fontSize: 11 }} /> {c.notaMedia}</> : "—"}</span>
                        </button>
                      );
                    })}
                    {filtrados.length > n && <button type="button" className="fbn-btn fbh-mais" onClick={() => setN((x) => x + PASSO * 2)}>Mostrar mais ({(filtrados.length - n).toLocaleString("pt-BR")})</button>}
                  </div>
                )}
            </div>

            <aside className={`fbh-lado ${sel ? "" : "vazio"}`}>
              {sel ? (
                <div className="fbh-painel">
                  <div className="fbh-fechar"><button type="button" className="fbn-acao cinza" onClick={() => setSelKey(null)}><i className="fa-solid fa-chevron-down" /> Fechar</button></div>
                  <div className="fbh-cab">
                    <span className="fbn-ico"><i className="fa-solid fa-user" /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h2>{sel.nome}</h2>
                      <div className="fbn-contato">
                        {sel.telefone && <a href={`tel:${sel.telefone.replace(/\D/g, "")}`}><i className="fa-solid fa-phone" /> {sel.telefone}</a>}
                        {sel.codigoOmie && <span>Omie {sel.codigoOmie}</span>}
                        {infoSel?.cidade && <span><i className="fa-solid fa-location-dot" /> {infoSel.cidade}</span>}
                        {infoSel?.email && <span><i className="fa-solid fa-envelope" /> {infoSel.email}</span>}
                      </div>
                    </div>
                  </div>
                  {!!infoSel?.tags.length && <div className="fbn-selos">{infoSel.tags.map((t) => <TagPill key={t} tag={t} />)}</div>}
                  <div className="fbn-acoes" style={{ borderTop: 0, paddingTop: 0 }}>
                    <button type="button" className="fbn-acao cheio" onClick={() => setHist({ nome: sel.nome, codigoOmie: sel.codigoOmie })}><i className="fa-solid fa-clock-rotate-left" /> Histórico completo</button>
                    <button type="button" className="fbn-acao" onClick={() => setPerfilAberto(true)}><i className="fa-solid fa-pen" /> Editar perfil</button>
                    {podeHoje && <Link className="fbn-acao" href={`/feedbacks?cliente=${encodeURIComponent(sel.key)}`}><i className="fa-solid fa-sun" /> Ver na fila de hoje</Link>}
                    {podeCockpit && <Link className="fbn-acao cinza" href={`/feedbacks/atendimento/${encodeURIComponent(sel.key)}`}><i className="fa-solid fa-headset" /> Abrir no cockpit</Link>}
                  </div>
                  <div className="fbn-dados">
                    <div><small>Atendimentos</small><span>{sel.total}</span></div>
                    <div><small>Pós-serviço</small><span>{sel.pos}</span></div>
                    <div><small>Reativação</small><span>{sel.reat}</span></div>
                    <div><small>Nota média</small><span>{sel.notaMedia ?? "—"}</span></div>
                  </div>
                  {equipamentos.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div className="fbf-sub" style={{ margin: 0 }}>Equipamentos ({equipamentos.length})</div>
                      <div className="fbn-selos">{equipamentos.map((e) => <span key={e} className="fbn-pilula" style={{ ["--k" as string]: "#0f766e" }}><i className="fa-solid fa-tractor" /> {e}</span>)}</div>
                    </div>
                  )}
                  {infoSel && (infoSel.funcionarios.length > 0 || infoSel.fazendas.length > 0) && (
                    <details className="fbh-det">
                      <summary><i className="fa-solid fa-users" style={{ color: "var(--c)" }} /> Funcionários ({infoSel.funcionarios.length}) e fazendas ({infoSel.fazendas.length})</summary>
                      <div style={{ display: "grid", gap: 4, fontSize: 13.5 }}>
                        {infoSel.funcionarios.map((f, i) => (
                          <div key={`f${i}`} className="fbh-item"><span>{f.nome}<div className="d">{[f.cargo, f.fazenda].filter(Boolean).join(" · ")}</div></span><span className="v">{f.telefone || ""}</span></div>
                        ))}
                        {infoSel.fazendas.map((fz, i) => (
                          <div key={`z${i}`} className="fbh-item"><span><i className="fa-solid fa-wheat-awn" style={{ color: "var(--t3)" }} /> {fz.nome}<div className="d">{fz.tratores.join(", ")}</div></span><span className="v">{fz.cidade || ""}</span></div>
                        ))}
                      </div>
                    </details>
                  )}
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="fbf-sub" style={{ margin: 0 }}>Linha do tempo dos atendimentos</div>
                    <TimelineRegistros registros={sel.registros} onEditar={(r) => setRegistroEdit(r)} />
                  </div>
                </div>
              ) : <div className="fbh-lado-vazio"><i className="fa-regular fa-hand-pointer" style={{ fontSize: 22, color: "var(--t3)", display: "block", marginBottom: 8 }} />Clique num cliente para ver a ficha e a linha do tempo dos atendimentos.</div>}
            </aside>
          </div>
        </>
      )}

      <ModalHistoricoCliente aberto={!!hist} nome={hist?.nome || ""} codigoOmie={hist?.codigoOmie ?? null} onFechar={() => setHist(null)} />
      {sel && (
        <ModalPerfilCliente aberto={perfilAberto} nome={sel.nome} codigoOmie={sel.codigoOmie} info={infoSel} onFechar={() => setPerfilAberto(false)}
          onSalvo={(salvo) => setInfo((p) => { const i = p.findIndex((x) => x.cliente_key === salvo.cliente_key); if (i < 0) return [salvo, ...p]; const nv = [...p]; nv[i] = salvo; return nv; })} />
      )}
      {registroEdit && (
        <ModalFeedback tipo={registroEdit.tipo} aberto={!!registroEdit} registro={registroEdit} onFechar={() => setRegistroEdit(null)}
          onSalvo={(salvo) => setRegistros((p) => { const i = p.findIndex((x) => x.id === salvo.id); if (i < 0) return [salvo, ...p]; const nv = [...p]; nv[i] = salvo; return nv; })} />
      )}
    </Casca>
  );
}
