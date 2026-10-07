"use client";
// Cockpit de atendimento — tela de LEITURA para quem senta para ligar.
// Três colunas: quem é (esq.) · contexto (centro) · a ligação (dir., fixa).
// Linguagem de balcão, poucos botões, tudo visível sem caçar informação.
import { useMemo, useState } from "react";
import styles from "../feedbacks.module.css";
import CardContatosWhatsapp from "./CardContatosWhatsapp";
import { BannerBloqueio, FaixaBloqueio, VERMELHO, VERMELHO_ESCURO } from "./Bloqueado";
import { renderizarDetalhes, renderizarUltimaInteracao } from "../OportunidadeCard";
import { REGRA_ROTULO, STATUS_ATENDIMENTO_ROTULO, fmtDataBR, fmtMoeda, haQuanto } from "@/lib/feedbacks/atendimento/rotulos";
import type { ContextoAtendimento } from "@/lib/feedbacks/atendimento/contexto";
import type { RoteiroMontado } from "@/lib/feedbacks/atendimento/roteiro";
import { ligacoesPpvOs, type AtendimentoResumo, type Compra, type Maquina, type Servico } from "@/lib/feedbacks/atendimento/puro";
import { linkNF, linkOS, linkPPV, linkPV, linkProjeto, SEM_ACESSO, type Acesso, type LinkDoc } from "@/lib/feedbacks/atendimento/links";
import type { TipoFeedback } from "@/lib/feedbacks/types";

export const COR_ATENDIMENTO = "#d97706";
const COR_SERVICOS = "#7c3aed";
const COR_COMPRAS = "#0f766e";
const COR_MAQUINAS = "#0369a1";

interface Props {
  ctx: ContextoAtendimento | null;
  carregando: boolean;
  onRecarregar: () => void;
  onRegistrar: (tipo: TipoFeedback, registroId?: number) => void;
  onEditarPerfil: () => void;
  /** coluna direita (PainelLigacao) — montada pela página */
  painelDireito: React.ReactNode;
  /** oportunidade escolhida como "assunto" da ligação em andamento (null = nenhuma; undefined = sem ligação) */
  assuntoId?: number | null;
  onEscolherAssunto?: (id: number | null) => void;
  /** roteiro de ligação já resolvido (Fase 2) */
  roteiro?: RoteiroMontado[];
  /** abre o modal "Corrigir cadastro" (telefone/e-mail no Omie) */
  onCorrigirCadastro?: () => void;
  /** 💀 marcar "Não contatar" / reativar (mesma regra do CRM) */
  onNaoContatar?: () => void;
  /** módulos do usuário: decide se OS/PPV abrem a tela ou o PDF (links.ts) */
  acesso?: Acesso;
  /** clique numa máquina (ou no chip 🚜 de uma OS) → modal de histórico */
  onAbrirMaquina?: (m: Maquina) => void;
  /** auditoria: usuário abriu um documento a partir da ficha */
  onAbrirDocumento?: (tipo: string, id: string) => void;
}

export default function Cockpit({ ctx, carregando, onRecarregar, onRegistrar, onEditarPerfil, painelDireito, assuntoId, onEscolherAssunto, roteiro, onCorrigirCadastro, onNaoContatar, acesso = SEM_ACESSO, onAbrirMaquina, onAbrirDocumento }: Props) {
  const id = ctx?.identidade ?? null;
  const emLigacao = assuntoId !== undefined && !!onEscolherAssunto;
  // Destaque cruzado PPV ↔ POS: passar o mouse num item acende o par no outro card.
  const [foco, setFoco] = useState<string[] | null>(null);
  const vinculos = useMemo(() => ligacoesPpvOs(ctx?.servicos ?? [], ctx?.compras ?? []), [ctx?.servicos, ctx?.compras]);
  const idsServico = (s: Servico) => [s.id_ordem, ...s.ppv_ids, ...(s.id_ordem ? vinculos.ppvsPorOs[s.id_ordem.toUpperCase()] ?? [] : [])].filter((x): x is string => !!x).map((x) => x.toUpperCase());
  const idsCompra = (c: Compra) => [c.id_ppv, c.os_id, ...(c.id_ppv ? [vinculos.osPorPpv[c.id_ppv.toUpperCase()]] : [])].filter((x): x is string => !!x).map((x) => x.toUpperCase());
  const aceso = (ids: string[]) => !!foco && ids.some((i) => foco.includes(i));
  const maquinaDoChassi = (chassi: string | null): Maquina | null => {
    if (!chassi || !ctx?.maquinas) return null;
    const C = chassi.toUpperCase();
    return ctx.maquinas.find((m) => m.chassi && (m.chassi === C || (C.length >= 7 && m.chassi.endsWith(C.slice(-7))) || (m.chassi.length >= 7 && C.endsWith(m.chassi.slice(-7))))) ?? null;
  };
  // Cliente marcado "Não contatar": ficha em preto e branco, menos informação,
  // avisos vermelhos. "Mostrar ficha completa" revela o resto sem tirar a marca.
  const bloqueado = !!id?.nao_contatar;
  const [mostrarTudo, setMostrarTudo] = useState(false);
  const ocultar = bloqueado && !mostrarTudo;
  const cinza: React.CSSProperties = bloqueado ? { filter: "grayscale(1)", opacity: 0.8 } : {};

  const abertos = ctx?.motivos?.registros_abertos ?? [];
  const oportunidades = ctx?.motivos?.oportunidades ?? [];

  return (
    <>
    {bloqueado && <BannerBloqueio mostrarTudo={mostrarTudo} onAlternar={() => setMostrarTudo((v) => !v)} />}
    <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr) 380px", gap: 14, alignItems: "start" }}>
      {/* ───────── ESQUERDA: quem é ───────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bloqueado && <FaixaBloqueio texto="NÃO CONTATAR" />}
        <section className={styles.card} style={{ ["--fb-accent" as string]: bloqueado ? VERMELHO : COR_ATENDIMENTO }}>
          {carregando && !ctx ? (
            <Esqueleto linhas={5} />
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.8 }}>Cliente</div>
              <h1 style={{ margin: "2px 0 6px", fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                {bloqueado && <span title="Cliente marcado como NÃO CONTATAR">🚫 </span>}
                {id?.nome || ctx?.nome || ctx?.cliente_key}
              </h1>
              {bloqueado && <div style={{ color: VERMELHO_ESCURO, fontWeight: 900, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>CONTATO BLOQUEADO · NÃO CONTATAR</div>}
              <div style={cinza}>
              {id?.razao_social && id.razao_social !== id.nome && <Linha rotulo="Razão social" valor={id.razao_social} />}
              <Linha rotulo="Código Omie" valor={ctx?.codigo_omie ? `#${ctx.codigo_omie}${ctx.codigos_omie.length > 1 ? ` (+${ctx.codigos_omie.length - 1} cadastro${ctx.codigos_omie.length > 2 ? "s" : ""})` : ""}` : "sem cadastro"} />
              {id?.cnpj && <Linha rotulo="CPF/CNPJ" valor={id.cnpj} />}
              {id?.empresa && <Linha rotulo="Empresa" valor={id.empresa} />}
              <Linha rotulo="Cidade" valor={[id?.cidade, id?.estado].filter(Boolean).join("/") || "—"} />
              {id?.endereco && <Linha rotulo="Endereço" valor={id.endereco} />}
              {id?.email && <Linha rotulo="E-mail" valor={<span><a href={`mailto:${id.email}`} style={{ color: id.email_interno ? "#92400e" : "#0369a1" }}>{id.email}</a>{id.email_interno && <span title="É um e-mail da loja usado como preenchimento, não do cliente" style={{ fontSize: 10, marginLeft: 6, color: "#92400e", fontWeight: 700 }}>e-mail da loja</span>}</span>} />}
              {(id?.culturas || id?.area_hectares) && (
                <Linha rotulo="Propriedade" valor={[id?.culturas, id?.area_hectares ? `${id.area_hectares} ha` : null].filter(Boolean).join(" · ")} />
              )}
              {id?.lat != null && id?.lng != null && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${id.lat},${id.lng}`} target="_blank" rel="noopener noreferrer" className={styles.pill} style={{ background: "#ecfdf5", color: "#065f46", textDecoration: "none", marginTop: 6 }}>
                  📍 Ver no mapa
                </a>
              )}
              {(id?.tags.length ?? 0) > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                  {id!.tags.map((t) => (
                    <span key={t} className={styles.pill} style={tagStyle(t)}>{rotuloTag(t)}</span>
                  ))}
                </div>
              )}
              {id?.inativo && <Aviso cor="#991b1b" bg="#fee2e2">Cadastro INATIVO no Omie.</Aviso>}
              {id?.pendencia_cadastral && <Aviso cor="#92400e" bg="#fef3c7">Cadastro com pendência — confirme os dados na ligação.</Aviso>}
              {(id?.email_interno || (id && id.telefones.length === 0)) && <Aviso cor="#92400e" bg="#fef3c7">{id?.telefones.length === 0 ? "Sem telefone no cadastro." : "E-mail do cadastro é da loja."} Confirme com o cliente e use “Corrigir cadastro”.</Aviso>}
              {id?.observacoes && <p style={{ margin: "10px 0 0", fontSize: 12, fontStyle: "italic", opacity: 0.8 }}>“{id.observacoes}”</p>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {ctx?.codigo_omie && onCorrigirCadastro && <button type="button" onClick={onCorrigirCadastro} style={{ ...btn(COR_ATENDIMENTO, false), flex: 1 }} title="Telefone e e-mail — grava no Omie">✎ Corrigir cadastro</button>}
                <button type="button" onClick={onEditarPerfil} style={{ ...btn("#475569", false), flex: 1 }}>✎ Funcionários e fazendas</button>
              </div>
              {onNaoContatar && (
                <button type="button" onClick={onNaoContatar} style={{ ...btn(id?.nao_contatar ? "#16a34a" : "#111", false), marginTop: 6, width: "100%" }} title={id?.nao_contatar ? "Tira a marca Não contatar (e reativa no Omie, se tinha código)" : "Marca o cliente como Não contatar (caveira)"}>
                  {id?.nao_contatar ? "✅ Reativar contato" : "💀 Não contatar"}
                </button>
              )}
            </>
          )}
        </section>

        {!ocultar && <div style={cinza}><CardContatosWhatsapp secao={ctx?.whatsapp} carregando={carregando && !ctx} onRecarregar={onRecarregar} /></div>}
      </div>

      {/* ───────── CENTRO: contexto ───────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bloqueado && <FaixaBloqueio />}
        {!ocultar && roteiro && roteiro.length > 0 && (
          <Card cinza={cinza} titulo="Roteiro" emoji="🗣️" cor="#d97706" contagem={null} carregando={carregando && !ctx}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {roteiro.map((e, i) => (
                <details key={e.etapa} open={i === 0} style={{ border: "1px solid var(--portal-border)", borderRadius: 10, padding: "6px 10px" }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{e.emoji} {e.rotulo} <span style={{ opacity: 0.5, fontWeight: 500 }}>({e.itens.length})</span></summary>
                  <ul style={{ ...lista, marginTop: 6 }}>
                    {e.itens.map((it) => (
                      <li key={it.id} style={{ ...itemCompacto, background: "var(--portal-bg)" }}>
                        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>{it.titulo}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.5 }} title={it.faltando.length ? `sem dado de: ${it.faltando.join(", ")}` : undefined}>{it.texto}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </Card>
        )}
        <Card cinza={cinza} titulo="Por que ligar" emoji="🎯" cor="#dc2626" contagem={oportunidades.length + abertos.length} carregando={carregando && !ctx} erro={ctx?.erros.motivos}>
          {oportunidades.length === 0 && abertos.length === 0 ? (
            <Vazio>Nenhum motivo automático em aberto. Ligação por iniciativa própria — registre ao final.</Vazio>
          ) : (
            <ul style={lista}>
              {oportunidades.map((op) => {
                const r = REGRA_ROTULO[op.regra];
                const ui = renderizarUltimaInteracao(op);
                return (
                  <li key={`op${op.id}`} style={{ ...item, borderLeft: `4px solid ${r?.cor ?? "#999"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>{r?.emoji} {r?.titulo ?? op.regra}</strong>
                      <span className={styles.pill} style={prioStyle(op.prioridade)}>{op.prioridade}</span>
                      {op.trator && <span style={{ fontSize: 12, opacity: 0.75 }}>🚜 {op.trator}</span>}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{renderizarDetalhes(op)}</div>
                    {ui && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Última interação: {ui}</div>}
                    {r?.oQueFazer && <div style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: r.cor }}>👉 {r.oQueFazer}</div>}
                    {emLigacao && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", color: assuntoId === op.id ? "#16a34a" : "inherit" }}>
                        <input type="radio" name="assunto" checked={assuntoId === op.id} onChange={() => onEscolherAssunto?.(op.id)} />
                        {assuntoId === op.id ? "✓ Este é o assunto da ligação" : "Este é o assunto da ligação"}
                      </label>
                    )}
                  </li>
                );
              })}
              {abertos.map((a) => (
                <li key={`reg${a.id}`} style={{ ...item, borderLeft: `4px solid ${a.tipo === "crm" ? "#dc2626" : "#6366f1"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>📋 Atendimento {a.tipo.toUpperCase()} em aberto</strong>
                    <span className={styles.pill} style={{ background: "#f1f5f9", color: "#334155" }}>{STATUS_ATENDIMENTO_ROTULO[a.status_atendimento] ?? a.status_atendimento}</span>
                    {a.atendente && <span style={{ fontSize: 12, opacity: 0.75 }}>🎧 {a.atendente}</span>}
                  </div>
                  {a.resumo && <div style={{ fontSize: 12, marginTop: 4 }}>{a.resumo}</div>}
                  <button type="button" onClick={() => onRegistrar(a.tipo, a.id)} style={{ ...btn(COR_ATENDIMENTO, true), marginTop: 8 }}>Preencher este atendimento</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!ocultar && (<>
        <Card cinza={cinza} titulo="Máquinas" emoji="🚜" cor={COR_MAQUINAS} contagem={ctx?.maquinas?.length} carregando={carregando && !ctx} erro={ctx?.erros.maquinas}>
          {!ctx?.maquinas?.length ? (
            <Vazio>Nenhuma máquina encontrada (controle de revisões, projetos Omie, OS/PPV, CRM ou pasta).</Vazio>
          ) : (
            <>
              <table style={tabela}>
                <thead>
                  <tr><th style={{ textAlign: "left" }}>Máquina</th><th style={{ textAlign: "left" }}>Chassi</th><th style={{ textAlign: "left" }}>Entrega</th><th style={{ textAlign: "left" }}>Última revisão</th><th style={{ textAlign: "left" }}>Próxima revisão</th><th /></tr>
                </thead>
                <tbody>
                  {ctx.maquinas.map((m, i) => <LinhaMaquina key={`${m.chassi || m.modelo}-${i}`} m={m} onAbrir={onAbrirMaquina} />)}
                </tbody>
              </table>
              <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6 }}>Clique na máquina para ver o histórico completo (entrega, revisões, OS, peças, garantias, atendimentos).</div>
            </>
          )}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card cinza={cinza} titulo="Últimos serviços" emoji="🔧" cor={COR_SERVICOS} contagem={ctx?.servicos?.length} carregando={carregando && !ctx} erro={ctx?.erros.historico ?? ctx?.erros.os_portal}>
            {!ctx?.servicos?.length ? (
              <Vazio>Nenhuma ordem de serviço encontrada.</Vazio>
            ) : (
              <ul style={lista}>
                {ctx.servicos.map((s, i) => {
                  const ids = idsServico(s);
                  const doc = linkOS(s, acesso);
                  const nf = linkNF(s.link_nf);
                  const ppvsLigados = [...new Set([...s.ppv_ids, ...(s.id_ordem ? vinculos.ppvsPorOs[s.id_ordem.toUpperCase()] ?? [] : [])])];
                  const maq = maquinaDoChassi(s.chassi);
                  const rotulo = s.id_ordem ? (s.ordem_omie ? `${s.id_ordem} · OS ${s.ordem_omie}` : s.id_ordem) : `OS ${s.numero ?? "—"}`;
                  return (
                    <li key={`${s.origem}-${s.numero}-${i}`} style={{ ...itemCompacto, ...(aceso(ids) ? { outline: `2px solid ${COR_SERVICOS}`, outlineOffset: -1, background: "#f5f3ff" } : {}) }}
                      onMouseEnter={() => ids.length && setFoco(ids)} onMouseLeave={() => setFoco(null)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 12 }}>
                          {fmtDataBR(s.data)} · <LinkDocumento doc={doc} cor={COR_SERVICOS} onAbrir={() => onAbrirDocumento?.("os", s.id_ordem || `omie:${s.numero}`)}>{rotulo}</LinkDocumento>
                        </strong>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>{s.origem === "omie" ? (s.empresa || "Omie") : "Oficina (POS)"}</span>
                      </div>
                      <div style={clamp3} title={s.descricao ?? undefined}>{s.descricao ?? "—"}</div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                        {[s.tecnico && `👤 ${s.tecnico}`, s.status, s.valor != null && fmtMoeda(s.valor)].filter(Boolean).join(" · ")}
                      </div>
                      {(ppvsLigados.length > 0 || nf || s.chassi || s.pv_numero) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {ppvsLigados.map((p) => (
                            <ChipLink key={p} doc={linkPPV(p, acesso)} cor={COR_COMPRAS} titulo={`PPV ligado a esta OS — ${linkPPV(p, acesso)?.titulo ?? p}`} onAbrir={() => onAbrirDocumento?.("ppv", p)}>🧾 {p}</ChipLink>
                          ))}
                          {s.pv_numero && <span className={styles.pill} style={{ background: "#ccfbf1", color: "#115e59" }} title="Pedido de venda citado nesta OS da Omie">PV {s.pv_numero}</span>}
                          {s.chassi && (
                            <button type="button" className={styles.pill} style={{ background: "#e0f2fe", color: "#075985", border: "none", cursor: maq && onAbrirMaquina ? "pointer" : "default" }}
                              title={maq ? "Abrir o histórico desta máquina" : "Chassi citado na OS"} onClick={() => maq && onAbrirMaquina?.(maq)}>
                              🚜 {maq?.modelo ? `${maq.modelo} · ` : ""}…{s.chassi.slice(-6)}
                            </button>
                          )}
                          {nf && <ChipLink doc={nf} cor="#047857" titulo={nf.titulo} onAbrir={() => onAbrirDocumento?.("nf", s.numero || "")}>📄 NF</ChipLink>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card cinza={cinza} titulo="Últimas compras (PV · PPV)" emoji="🧾" cor={COR_COMPRAS} contagem={ctx?.compras?.length} carregando={carregando && !ctx} erro={ctx?.erros.historico ?? ctx?.erros.ppv}>
            {!ctx?.compras?.length ? (
              <Vazio>Nenhum pedido de venda nem pré-pedido encontrado.</Vazio>
            ) : (
              <ul style={lista}>
                {ctx.compras.map((c, i) => {
                  const ids = idsCompra(c);
                  const docPpv = linkPPV(c.id_ppv, acesso);
                  const docPv = c.origem === "ppv" ? null : linkPV(c);
                  const nf = linkNF(c.link_nf, c.nf);
                  const osLigada = c.os_id || (c.id_ppv ? vinculos.osPorPpv[c.id_ppv.toUpperCase()] : null) || null;
                  const servOs = osLigada ? ctx.servicos?.find((s) => s.id_ordem?.toUpperCase() === osLigada.toUpperCase()) : null;
                  const docOs = osLigada ? linkOS({ id_ordem: osLigada, cod_os: servOs?.cod_os ?? null, empresa: servOs?.empresa ?? null, ordem_omie: servOs?.ordem_omie ?? null }, acesso) : null;
                  return (
                    <li key={`${c.id_ppv || ""}-${c.numero_pv || ""}-${i}`} style={{ ...itemCompacto, ...(aceso(ids) ? { outline: `2px solid ${COR_COMPRAS}`, outlineOffset: -1, background: "#f0fdfa" } : {}) }}
                      onMouseEnter={() => ids.length && setFoco(ids)} onMouseLeave={() => setFoco(null)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 12 }}>
                          {fmtDataBR(c.data)} ·{" "}
                          {c.id_ppv && <LinkDocumento doc={docPpv} cor={COR_COMPRAS} onAbrir={() => onAbrirDocumento?.("ppv", c.id_ppv!)}>{c.id_ppv}</LinkDocumento>}
                          {c.id_ppv && c.numero_pv && <span style={{ opacity: 0.5 }}> → </span>}
                          {c.numero_pv && <LinkDocumento doc={c.origem === "ppv" ? docPpv : docPv} cor={COR_COMPRAS} onAbrir={() => onAbrirDocumento?.("pv", c.numero_pv!)}>PV {c.numero_pv}</LinkDocumento>}
                          {!c.id_ppv && !c.numero_pv && "PV —"}
                        </strong>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoeda(c.valor)}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                        {[c.empresa, c.faturado ? `Faturado${c.nf ? ` · NF ${c.nf}` : ""}` : c.status && (c.origem === "ppv" ? `PPV: ${c.status}` : `Etapa ${c.status}`), c.tipo && c.tipo !== "Pedido" && c.tipo, c.tecnico && `👤 ${c.tecnico}`].filter(Boolean).join(" · ")}
                      </div>
                      {(osLigada || nf || c.projeto) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {osLigada && <ChipLink doc={docOs} cor={COR_SERVICOS} titulo={`PPV nascido desta ordem de serviço — ${docOs?.titulo ?? osLigada}`} onAbrir={() => onAbrirDocumento?.("os", osLigada)}>🔧 {osLigada}</ChipLink>}
                          {c.projeto && (() => { const maq = maquinaDoChassi(c.projeto.split(/\s+/).pop() || null); return (
                            <button type="button" className={styles.pill} style={{ background: "#e0f2fe", color: "#075985", border: "none", cursor: maq && onAbrirMaquina ? "pointer" : "default" }} title={maq ? "Abrir o histórico desta máquina" : c.projeto} onClick={() => maq && onAbrirMaquina?.(maq)}>🚜 {maq?.modelo || c.projeto}</button>
                          ); })()}
                          {nf && <ChipLink doc={nf} cor="#047857" titulo={nf.titulo} onAbrir={() => onAbrirDocumento?.("nf", c.numero_pv || "")}>📄 NF</ChipLink>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card cinza={cinza} titulo="Funcionários e fazendas" emoji="🌾" cor="#65a30d" contagem={(ctx?.pasta?.funcionarios.length ?? 0) + (ctx?.pasta?.fazendas.length ?? 0)} carregando={carregando && !ctx} erro={ctx?.erros.pasta}>
          {!ctx?.pasta?.funcionarios.length && !ctx?.pasta?.fazendas.length ? (
            <Vazio>Nada anotado ainda. Use “Funcionários e fazendas” à esquerda para registrar quem é quem.</Vazio>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={subtitulo}>👥 Funcionários</div>
                {ctx.pasta.funcionarios.length === 0 ? <Vazio>—</Vazio> : ctx.pasta.funcionarios.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                    <strong>{f.nome}</strong>{f.cargo && ` · ${f.cargo}`}{f.fazenda && ` · ${f.fazenda}`}
                    {f.telefone && <> · <a href={`tel:${f.telefone.replace(/\D/g, "")}`} style={{ color: "#0369a1" }}>{f.telefone}</a></>}
                  </div>
                ))}
              </div>
              <div>
                <div style={subtitulo}>🌾 Fazendas</div>
                {ctx.pasta.fazendas.length === 0 ? <Vazio>—</Vazio> : ctx.pasta.fazendas.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                    <strong>{f.nome}</strong>{f.cidade && ` · ${f.cidade}`}
                    {f.tratores?.length > 0 && <div style={{ fontSize: 11, opacity: 0.75 }}>🚜 {f.tratores.join(", ")}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card cinza={cinza} titulo="Imóvel rural (CAR)" emoji="🗺️" cor="#16a34a" contagem={ctx?.car?.length} carregando={carregando && !ctx} erro={ctx?.erros.car}>
          {!ctx?.car?.length ? (
            <Vazio>Nenhum imóvel rural vinculado a este cliente. O vínculo é feito em Dashboard Agro → Prospecção ou Vínculos.</Vazio>
          ) : (
            <ul style={lista}>
              {ctx.car.map((c) => (
                <li key={c.cod_car} style={itemCompacto}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                    <strong style={{ fontSize: 13 }}>{c.cultura_nome || "Diversificado"}</strong>
                    {c.confianca && <span className={styles.pill} style={{ background: c.confianca === "alta" ? "#16a34a" : c.confianca === "media" ? "#d97706" : "#6b7280", color: "#fff" }}>confiança {c.confianca === "media" ? "média" : c.confianca}</span>}
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{c.municipio} · {c.area_ha != null ? Number(c.area_ha).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " ha" : "—"}{c.area_cultura_ha != null ? ` (${Number(c.area_cultura_ha).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha da cultura)` : ""}</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    Crédito rural 36 m: <strong>{Number(c.credito_36m) > 0 ? Number(c.credito_36m).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "sem registro"}</strong>
                    {Number(c.credito_invest_36m) > 0 && <> · <strong style={{ color: "#15803d" }}>investimento {Number(c.credito_invest_36m).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</strong></>}
                    {c.ultima_finalidade && <span style={{ opacity: 0.7 }}> · último: {c.ultima_finalidade}</span>}
                  </div>
                  {c.motivo_confianca && <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{c.motivo_confianca}</div>}
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, fontFamily: "ui-monospace,Consolas,monospace" }}>{c.cod_car}</div>
                  <a href="/dashboard-agro?tab=prospeccao" style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>Abrir no Dashboard Agro →</a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        </>)}
        <Card cinza={cinza} titulo="Atendimentos anteriores" emoji="📞" cor="#475569" contagem={ctx?.atendimentos?.length} carregando={carregando && !ctx} erro={ctx?.erros.atendimentos}>
          {!ctx?.atendimentos?.length ? (
            <Vazio>Primeira ligação registrada para este cliente.</Vazio>
          ) : (
            <ul style={lista}>
              {ctx.atendimentos.map((a) => <LinhaAtendimento key={a.id} a={a} onEditar={() => onRegistrar(a.tipo, a.id)} />)}
            </ul>
          )}
        </Card>
      </div>

      {/* ───────── DIREITA: a ligação (fixa) ───────── */}
      <div style={{ position: "sticky", top: 96, display: "flex", flexDirection: "column", gap: 12 }}>
        {painelDireito}
        {ctx && Object.keys(ctx.erros).length > 0 && (
          <Aviso cor="#92400e" bg="#fef3c7">
            Não carregou: {Object.keys(ctx.erros).join(", ")}. <button type="button" onClick={onRecarregar} style={btn("#92400e", false)}>Tentar de novo</button>
          </Aviso>
        )}
      </div>
    </div>
    </>
  );
}

// ───────── sub-componentes ─────────

const FONTE_PILULA: Record<Maquina["fonte"], { rotulo: string; bg: string; fg: string; titulo: string }> = {
  tratores: { rotulo: "revisões", bg: "#e0f2fe", fg: "#075985", titulo: "Está no controle de revisões (tratores)" },
  projeto: { rotulo: "Omie", bg: "#ede9fe", fg: "#5b21b6", titulo: "Projeto Omie faturado/atendido para este cliente" },
  os: { rotulo: "OS/PPV", bg: "#f5f3ff", fg: "#6d28d9", titulo: "Chassi citado numa ordem de serviço ou PPV" },
  crm: { rotulo: "CRM", bg: "#dcfce7", fg: "#166534", titulo: "Cadastrada pelo vendedor no CRM de vendas" },
  pasta: { rotulo: "anotado", bg: "#f1f5f9", fg: "#475569", titulo: "Anotado na pasta (Funcionários e fazendas)" },
};

function LinhaMaquina({ m, onAbrir }: { m: Maquina; onAbrir?: (m: Maquina) => void }) {
  const p = m.proxima_revisao;
  const clicavel = !!onAbrir && !!m.chassi;
  const abrir = () => { if (clicavel) onAbrir!(m); };
  const hrefProjeto = linkProjeto(m.projeto);
  return (
    <tr onClick={abrir} style={{ cursor: clicavel ? "pointer" : "default" }} title={clicavel ? "Abrir o histórico desta máquina" : m.chassi ? undefined : "Sem chassi — não dá para montar o histórico"}
      onKeyDown={(e) => { if (clicavel && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } }} tabIndex={clicavel ? 0 : -1}>
      <td style={{ verticalAlign: "top", padding: "5px 4px 5px 0" }}>
        <strong style={{ color: clicavel ? COR_MAQUINAS : "inherit" }}>{m.modelo ?? "—"}</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {m.fontes.map((f) => <span key={f} className={styles.pill} style={{ background: FONTE_PILULA[f].bg, color: FONTE_PILULA[f].fg, fontSize: 9, padding: "1px 7px" }} title={FONTE_PILULA[f].titulo}>{FONTE_PILULA[f].rotulo}</span>)}
        </div>
        {m.dono_tratores && <div style={{ fontSize: 10, color: "#92400e", marginTop: 2 }} title="Nome que consta no controle de revisões (vendido em nome de outra pessoa ou grafia diferente)">no controle de revisões: {m.dono_tratores}</div>}
        {m.crm && <div style={{ fontSize: 10, color: "#166534", marginTop: 2 }}>CRM: {[m.crm.tipo, m.crm.ano && `ano ${m.crm.ano}`, m.crm.estado && `estado ${m.crm.estado}`, m.crm.horimetro != null && `${m.crm.horimetro} h`].filter(Boolean).join(" · ")}</div>}
      </td>
      <td style={{ fontFamily: "monospace", fontSize: 12, verticalAlign: "top", padding: "5px 4px" }}>{m.chassi ?? "—"}</td>
      <td style={{ verticalAlign: "top", padding: "5px 4px" }}>{fmtDataBR(m.entrega)}</td>
      <td style={{ verticalAlign: "top", padding: "5px 4px" }}>{m.ultima_revisao ? `${m.ultima_revisao.rotulo} · ${fmtDataBR(m.ultima_revisao.data)}${m.ultima_revisao.horimetro != null ? ` · ${m.ultima_revisao.horimetro} h` : ""}` : m.fontes.includes("tratores") ? "nenhuma registrada" : "—"}</td>
      <td style={{ verticalAlign: "top", padding: "5px 4px" }}>
        {p ? (
          <span style={{ color: p.atrasada ? "#b91c1c" : "inherit", fontWeight: p.atrasada ? 800 : 500 }}>
            {p.horas} h · {p.data_estimada ? `${fmtDataBR(p.data_estimada)}${p.atrasada ? " · ATRASADA" : ` (${haQuanto(p.data_estimada)})`}` : "sem estimativa"}
          </span>
        ) : "—"}
      </td>
      <td style={{ verticalAlign: "top", padding: "5px 0 5px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
        {clicavel && <button type="button" onClick={(e) => { e.stopPropagation(); abrir(); }} style={{ ...btn(COR_MAQUINAS, false), padding: "3px 9px", fontSize: 11 }}>histórico ›</button>}
        {hrefProjeto && <a href={hrefProjeto} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Ficha completa do projeto (Pasta Clientes)" style={{ fontSize: 11, color: COR_MAQUINAS, marginLeft: 6 }}>ficha ↗</a>}
      </td>
    </tr>
  );
}

/** Número do documento como link (nova aba) ou texto quando não há para onde abrir. */
function LinkDocumento({ doc, cor, onAbrir, children }: { doc: LinkDoc | null; cor: string; onAbrir?: () => void; children: React.ReactNode }) {
  if (!doc) return <span title="Sem documento para abrir">{children}</span>;
  return (
    <a href={doc.href} target="_blank" rel="noopener noreferrer" title={`${doc.titulo} ↗`} onClick={onAbrir} style={{ color: cor, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>
      {children}{doc.tipo === "pdf" ? <span style={{ fontSize: 9, opacity: 0.7 }}> PDF</span> : null}
    </a>
  );
}

function ChipLink({ doc, cor, titulo, onAbrir, children }: { doc: LinkDoc | null; cor: string; titulo: string; onAbrir?: () => void; children: React.ReactNode }) {
  const estilo: React.CSSProperties = { background: "transparent", color: cor, border: `1px solid ${cor}`, textDecoration: "none", cursor: doc ? "pointer" : "default" };
  if (!doc) return <span className={styles.pill} style={estilo} title={titulo}>{children}</span>;
  return <a className={styles.pill} href={doc.href} target="_blank" rel="noopener noreferrer" style={estilo} title={`${titulo} ↗`} onClick={onAbrir}>{children} ↗</a>;
}

function LinhaAtendimento({ a, onEditar }: { a: AtendimentoResumo; onEditar: () => void }) {
  const cor = a.tipo === "crm" ? "#dc2626" : "#6366f1";
  return (
    <li style={{ ...item, borderLeft: `4px solid ${cor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 12 }}>{fmtDataBR(a.data)}</strong>
        <span style={{ fontSize: 11, opacity: 0.65 }}>{haQuanto(a.data)}</span>
        <span className={styles.pill} style={{ background: cor, color: "#fff" }}>{a.tipo.toUpperCase()}</span>
        <span className={styles.pill} style={{ background: "#f1f5f9", color: "#334155" }}>{STATUS_ATENDIMENTO_ROTULO[a.status_atendimento] ?? a.status_atendimento}</span>
        {a.nota != null && <span className={styles.pill} style={{ background: a.nota >= 8 ? "#d1fae5" : a.nota >= 5 ? "#fef3c7" : "#fee2e2", color: "#111" }}>nota {a.nota}/10</span>}
        {a.nps && <span style={{ fontSize: 11, opacity: 0.75 }}>indicaria: {a.nps}</span>}
        {a.atendente && <span style={{ fontSize: 11, opacity: 0.75 }}>🎧 {a.atendente}</span>}
        <button type="button" onClick={onEditar} style={{ ...btn("#475569", false), marginLeft: "auto" }}>ver / editar</button>
      </div>
      {a.resumo && <div style={{ fontSize: 12, marginTop: 4 }}>{a.resumo}</div>}
      {a.arquivado_motivo && <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>Arquivado: {a.arquivado_motivo}</div>}
      {(a.tecnico || a.trator) && <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>{[a.trator && `🚜 ${a.trator}`, a.tecnico && `👤 ${a.tecnico}`].filter(Boolean).join(" · ")}</div>}
    </li>
  );
}

function Card({ titulo, emoji, cor, contagem, carregando, erro, children, cinza }: { titulo: string; emoji: string; cor: string; contagem?: number | null; carregando: boolean; erro?: string; children: React.ReactNode; cinza?: React.CSSProperties }) {
  return (
    <section className={styles.card} style={{ ["--fb-accent" as string]: cor, ...(cinza || {}) }}>
      <header style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{emoji} {titulo}</h3>
        {contagem != null && contagem > 0 && <span className={styles.pill} style={{ background: cor, color: "#fff" }}>{contagem}</span>}
      </header>
      {carregando ? <Esqueleto linhas={3} /> : erro ? <Aviso cor="#92400e" bg="#fef3c7">Não carregou: {erro}</Aviso> : children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 6, fontSize: 12, padding: "3px 0", borderBottom: "1px dashed var(--portal-border)" }}>
      <span style={{ opacity: 0.6 }}>{rotulo}</span>
      <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{valor}</span>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>{children}</p>;
}

function Aviso({ cor, bg, children }: { cor: string; bg: string; children: React.ReactNode }) {
  return <div style={{ background: bg, color: cor, borderRadius: 10, padding: "8px 12px", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}

function Esqueleto({ linhas }: { linhas: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} style={{ height: 14, borderRadius: 6, background: "linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9)", width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

function rotuloTag(t: string): string {
  if (t === "!!#Pendências Cadastrais#!!") return "Pendência cadastral";
  return t;
}
function tagStyle(t: string): React.CSSProperties {
  const k = t.toLowerCase();
  if (k.includes("não contatar")) return { background: "#111", color: "#fff" };
  if (k.includes("pend")) return { background: "#fee2e2", color: "#991b1b" };
  if (k === "ouro") return { background: "#fef3c7", color: "#92400e" };
  if (["cliente", "fornecedor", "funcionário"].includes(k)) return { background: "#f1f5f9", color: "#64748b" };
  return { background: "#e0e7ff", color: "#3730a3" };
}
function prioStyle(p: string): React.CSSProperties {
  if (p === "Urgente") return { background: "#fee2e2", color: "#b91c1c", textTransform: "uppercase" };
  if (p === "Baixa") return { background: "#f0fdf4", color: "#15803d", textTransform: "uppercase" };
  return { background: "#fef3c7", color: "#92400e", textTransform: "uppercase" };
}
function btn(cor: string, preenchido: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${cor}`, background: preenchido ? cor : "transparent", color: preenchido ? "#fff" : cor, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
}
const lista: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 };
const item: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "var(--portal-bg)", border: "1px solid var(--portal-border)" };
const itemCompacto: React.CSSProperties = { padding: "6px 8px", borderRadius: 8, border: "1px solid var(--portal-border)" };
const clamp3: React.CSSProperties = { fontSize: 12, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" };
const tabela: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const subtitulo: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", marginBottom: 4 };
