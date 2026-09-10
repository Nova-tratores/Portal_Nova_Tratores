"use client";
// Cockpit de atendimento — tela de LEITURA para quem senta para ligar.
// Três colunas: quem é (esq.) · contexto (centro) · a ligação (dir., fixa).
// Linguagem de balcão, poucos botões, tudo visível sem caçar informação.
import styles from "../feedbacks.module.css";
import CardContatosWhatsapp from "./CardContatosWhatsapp";
import { renderizarDetalhes, renderizarUltimaInteracao } from "../OportunidadeCard";
import { REGRA_ROTULO, STATUS_ATENDIMENTO_ROTULO, fmtDataBR, fmtMoeda, haQuanto } from "@/lib/feedbacks/atendimento/rotulos";
import type { ContextoAtendimento } from "@/lib/feedbacks/atendimento/contexto";
import type { RoteiroMontado } from "@/lib/feedbacks/atendimento/roteiro";
import type { AtendimentoResumo, Maquina } from "@/lib/feedbacks/atendimento/puro";
import type { TipoFeedback } from "@/lib/feedbacks/types";

export const COR_ATENDIMENTO = "#d97706";

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
}

export default function Cockpit({ ctx, carregando, onRecarregar, onRegistrar, onEditarPerfil, painelDireito, assuntoId, onEscolherAssunto, roteiro, onCorrigirCadastro, onNaoContatar }: Props) {
  const id = ctx?.identidade ?? null;
  const emLigacao = assuntoId !== undefined && !!onEscolherAssunto;

  const abertos = ctx?.motivos?.registros_abertos ?? [];
  const oportunidades = ctx?.motivos?.oportunidades ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr) 380px", gap: 14, alignItems: "start" }}>
      {/* ───────── ESQUERDA: quem é ───────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <section className={styles.card} style={{ ["--fb-accent" as string]: COR_ATENDIMENTO }}>
          {carregando && !ctx ? (
            <Esqueleto linhas={5} />
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.8 }}>Cliente</div>
              <h1 style={{ margin: "2px 0 6px", fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                {id?.nao_contatar && <span title="Cliente marcado como NÃO CONTATAR">💀 </span>}
                {id?.nome || ctx?.nome || ctx?.cliente_key}
              </h1>
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

        <CardContatosWhatsapp secao={ctx?.whatsapp} carregando={carregando && !ctx} onRecarregar={onRecarregar} />
      </div>

      {/* ───────── CENTRO: contexto ───────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roteiro && roteiro.length > 0 && (
          <Card titulo="Roteiro" emoji="🗣️" cor="#d97706" contagem={null} carregando={carregando && !ctx}>
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
        <Card titulo="Por que ligar" emoji="🎯" cor="#dc2626" contagem={oportunidades.length + abertos.length} carregando={carregando && !ctx} erro={ctx?.erros.motivos}>
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

        <Card titulo="Máquinas" emoji="🚜" cor="#0369a1" contagem={ctx?.maquinas?.length} carregando={carregando && !ctx} erro={ctx?.erros.maquinas}>
          {!ctx?.maquinas?.length ? (
            <Vazio>Nenhum trator no controle de revisões nem equipamento na pasta.</Vazio>
          ) : (
            <table style={tabela}>
              <thead>
                <tr><th>Máquina</th><th>Chassi</th><th>Entrega</th><th>Última revisão</th><th>Próxima revisão</th></tr>
              </thead>
              <tbody>
                {ctx.maquinas.map((m, i) => <LinhaMaquina key={i} m={m} />)}
              </tbody>
            </table>
          )}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card titulo="Últimos serviços" emoji="🔧" cor="#7c3aed" contagem={ctx?.servicos?.length} carregando={carregando && !ctx} erro={ctx?.erros.historico ?? ctx?.erros.os_portal}>
            {!ctx?.servicos?.length ? (
              <Vazio>Nenhuma ordem de serviço encontrada.</Vazio>
            ) : (
              <ul style={lista}>
                {ctx.servicos.map((s, i) => (
                  <li key={i} style={itemCompacto}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>{fmtDataBR(s.data)} · OS {s.numero ?? "—"}</strong>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{s.origem === "omie" ? (s.empresa || "Omie") : "Oficina"}</span>
                    </div>
                    <div style={clamp3} title={s.descricao ?? undefined}>{s.descricao ?? "—"}</div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                      {[s.tecnico && `👤 ${s.tecnico}`, s.status, s.valor != null && fmtMoeda(s.valor), s.projeto].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Últimas compras" emoji="🧾" cor="#0f766e" contagem={ctx?.pedidos?.length} carregando={carregando && !ctx} erro={ctx?.erros.historico}>
            {!ctx?.pedidos?.length ? (
              <Vazio>Nenhum pedido de venda encontrado.</Vazio>
            ) : (
              <ul style={lista}>
                {ctx.pedidos.map((p, i) => (
                  <li key={i} style={itemCompacto}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>{fmtDataBR(p.data)} · PV {p.numero ?? "—"}</strong>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoeda(p.valor)}</span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                      {[p.empresa, p.faturado ? `Faturado${p.nf ? ` · NF ${p.nf}` : ""}` : p.etapa && `Etapa ${p.etapa}`].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card titulo="Funcionários e fazendas" emoji="🌾" cor="#65a30d" contagem={(ctx?.pasta?.funcionarios.length ?? 0) + (ctx?.pasta?.fazendas.length ?? 0)} carregando={carregando && !ctx} erro={ctx?.erros.pasta}>
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

        <Card titulo="Atendimentos anteriores" emoji="📞" cor="#475569" contagem={ctx?.atendimentos?.length} carregando={carregando && !ctx} erro={ctx?.erros.atendimentos}>
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
  );
}

// ───────── sub-componentes ─────────

function LinhaMaquina({ m }: { m: Maquina }) {
  const p = m.proxima_revisao;
  return (
    <tr>
      <td><strong>{m.modelo ?? "—"}</strong>{m.fonte === "pasta" && <span style={{ fontSize: 10, opacity: 0.6 }}> (anotado)</span>}</td>
      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{m.chassi ?? "—"}</td>
      <td>{fmtDataBR(m.entrega)}</td>
      <td>{m.ultima_revisao ? `${m.ultima_revisao.rotulo} · ${fmtDataBR(m.ultima_revisao.data)}${m.ultima_revisao.horimetro != null ? ` · ${m.ultima_revisao.horimetro} h` : ""}` : "nenhuma registrada"}</td>
      <td>
        {p ? (
          <span style={{ color: p.atrasada ? "#b91c1c" : "inherit", fontWeight: p.atrasada ? 800 : 500 }}>
            {p.horas} h · {p.data_estimada ? `${fmtDataBR(p.data_estimada)}${p.atrasada ? " · ATRASADA" : ` (${haQuanto(p.data_estimada)})`}` : "sem estimativa"}
          </span>
        ) : "—"}
      </td>
    </tr>
  );
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

function Card({ titulo, emoji, cor, contagem, carregando, erro, children }: { titulo: string; emoji: string; cor: string; contagem?: number | null; carregando: boolean; erro?: string; children: React.ReactNode }) {
  return (
    <section className={styles.card} style={{ ["--fb-accent" as string]: cor }}>
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
