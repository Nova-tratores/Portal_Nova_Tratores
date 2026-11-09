"use client";
// Controlador de fases do POS e do PPV (José, 09/11/2026): renomear, adicionar, remover e mudar a ordem.
// Ao salvar, pergunta se a mesma mudança vale no outro quadro. Regras em lib/fases/quadro.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FASES_FIXAS, aplicarDiferenca, diferenca, nomeDaFase, resumoDiferenca, temMudanca,
  validarLista, validarNomeNovo, validarRenomear, type FaseQuadro, type ModuloFases,
} from "@/lib/fases/quadro";
import { PHASES } from "@/lib/pos/constants";
import { salvarFasesQuadro, useFasesQuadro } from "@/hooks/useFasesQuadro";

const NOME: Record<ModuloFases, string> = { pos: "POS", ppv: "PPV" };
const COR = "#0369a1";

export default function ControladorFases({ aberto, onFechar, contagemPOS = {}, inicial = "pos" }: {
  aberto: boolean;
  onFechar: () => void;
  /** quantas OS (carregadas na tela) há em cada fase — trava o remover e mostra o número */
  contagemPOS?: Record<string, number>;
  inicial?: ModuloFases;
}) {
  const e = useFasesQuadro();
  const [aba, setAba] = useState<ModuloFases>(inicial);
  // null = sem mudança (mostra o salvo, e acompanha se o salvo mudar)
  const [rascunhoEd, setRascunho] = useState<FaseQuadro[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [nova, setNova] = useState("");
  const [erroNova, setErroNova] = useState<string | null>(null);
  const [perguntar, setPerguntar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const novaRef = useRef<HTMLInputElement>(null);

  const salvo = e[aba];
  const rascunho = rascunhoEd ?? salvo;
  const outro: ModuloFases = aba === "pos" ? "ppv" : "pos";
  const dif = useMemo(() => diferenca(salvo, rascunho), [salvo, rascunho]);
  const mudou = temMudanca(dif);
  const resumo = useMemo(() => resumoDiferenca(dif, salvo), [dif, salvo]);


  // Esc fecha (pergunta antes se tem mudança): a caixa pega o foco ao abrir e ouve o teclado
  const fundoRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberto) fundoRef.current?.focus(); }, [aberto]);

  if (!aberto || typeof document === "undefined") return null;

  const podeEditar = e.podeEditar;
  const conta = (k: string) => (aba === "pos" ? contagemPOS[k] || 0 : 0);

  function tentarFechar() {
    if (mudou && !confirm("Sair sem salvar as mudanças nas fases?")) return;
    onFechar();
  }
  function trocarAba(m: ModuloFases) {
    if (m === aba) return;
    if (mudou && !confirm(`Descartar as mudanças nas fases do ${NOME[aba]}?`)) return;
    setAba(m); setRascunho(null); setEditando(null); setErro(null); setOk(null); setNova(""); setErroNova(null);
  }
  function mover(de: number, para: number) {
    if (para < 0 || para >= rascunho.length || de === para) return;
    const l = [...rascunho];
    const [x] = l.splice(de, 1);
    l.splice(para, 0, x);
    setRascunho(l); setOk(null);
  }
  function abrirNome(f: FaseQuadro) { setEditando(f.chave); setTexto(nomeDaFase(f)); setErro(null); }
  function confirmarNome() {
    if (!editando) return;
    const msg = validarRenomear(editando, texto, rascunho);
    if (msg) { setErro(msg); return; }
    const r = texto.replace(/\s+/g, " ").trim();
    setRascunho(rascunho.map((f) => (f.chave !== editando ? f : r && r !== f.chave ? { chave: f.chave, rotulo: r } : { chave: f.chave })));
    setEditando(null); setErro(null); setOk(null);
  }
  function voltarNome(chave: string) { setRascunho(rascunho.map((f) => (f.chave === chave ? { chave } : f))); setOk(null); }
  function remover(chave: string) { setRascunho(rascunho.filter((f) => f.chave !== chave)); setOk(null); }
  function adicionar() {
    const msg = validarNomeNovo(nova, rascunho);
    if (msg) { setErroNova(msg); return; }
    const chave = nova.replace(/\s+/g, " ").trim();
    const l = [...rascunho];
    const conc = l.findIndex((f) => f.chave === "Concluída");
    l.splice(conc === -1 ? l.length : conc, 0, { chave });
    setRascunho(l); setNova(""); setErroNova(null); setOk(null);
    setTimeout(() => novaRef.current?.focus(), 0);
  }
  function pedirSalvar() {
    const msg = validarLista(rascunho);
    if (msg) { setErro(msg); return; }
    setErro(null);
    setPerguntar(true);
  }
  async function salvar(nosDois: boolean) {
    setSalvando(true); setErro(null);
    const listas = { [aba]: rascunho } as Record<ModuloFases, FaseQuadro[]>;
    if (nosDois) listas[outro] = aplicarDiferenca(e[outro], dif);
    const msg = await salvarFasesQuadro(listas);
    setSalvando(false); setPerguntar(false);
    if (msg) { setErro(msg); return; }
    setRascunho(null);
    setOk(nosDois ? `Salvo no ${NOME[aba]} e no ${NOME[outro]}.` : `Salvo só no ${NOME[aba]}.`);
  }

  // o que a mesma mudança faria no outro quadro (para mostrar na pergunta)
  const previaOutro = perguntar ? resumoDiferenca(diferenca(e[outro], aplicarDiferenca(e[outro], dif)), e[outro]) : [];

  return createPortal(
    <div ref={fundoRef} tabIndex={-1} className="cf-fundo" role="dialog" aria-modal="true" aria-label="Fases do POS e do PPV"
      onKeyDown={(ev) => { if (ev.key === "Escape" && !editando && !perguntar) { ev.stopPropagation(); tentarFechar(); } }}
      onMouseDown={(ev) => { if (ev.target === ev.currentTarget) tentarFechar(); }}>
      <style>{ESTILO_CF}</style>
      <div className="cf-caixa">
        <div className="cf-topo">
          <span className="cf-ic"><i className="fas fa-layer-group" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cf-titulo">Fases do POS e do PPV</div>
            <div className="cf-sub">Renomeie, crie, remova e arraste para mudar a ordem.</div>
          </div>
          <button type="button" className="cf-x" onClick={tentarFechar} aria-label="fechar"><i className="fas fa-xmark" /></button>
        </div>

        <div className="cf-abas" role="tablist">
          {(["pos", "ppv"] as ModuloFases[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={aba === m} className={`cf-aba ${aba === m ? "on" : ""}`} onClick={() => trocarAba(m)}>
              <i className={`fas ${m === "pos" ? "fa-screwdriver-wrench" : "fa-file-invoice-dollar"}`} />
              {NOME[m]} <span className="cf-n">{e[m].length}</span>
            </button>
          ))}
        </div>

        {e.migracaoFaltando && <div className="cf-aviso"><i className="fas fa-database" /> Falta rodar o SQL <code>sql/fases-quadro.sql</code>: dá para ver, mas não salva.</div>}
        {!podeEditar && <div className="cf-aviso"><i className="fas fa-lock" /> Só o pós-vendas pode mudar as fases. Aqui você só vê.</div>}

        <ol className="cf-lista">
          {rascunho.map((f, i) => {
            const fixa = FASES_FIXAS.has(f.chave);
            const n = conta(f.chave);
            const nome = nomeDaFase(f);
            const criada = !PHASES.includes(f.chave);
            const novaAqui = !salvo.some((x) => x.chave === f.chave);
            return (
              <li key={f.chave}
                className={`cf-item ${arrastando === i ? "arr" : ""} ${sobre === i && arrastando !== null && arrastando !== i ? "sobre" : ""}`}
                draggable={podeEditar && editando !== f.chave}
                onDragStart={(ev) => { setArrastando(i); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); }}
                onDragOver={(ev) => { if (arrastando === null) return; ev.preventDefault(); setSobre(i); }}
                onDrop={(ev) => { ev.preventDefault(); if (arrastando !== null) mover(arrastando, i); setArrastando(null); setSobre(null); }}
                onDragEnd={() => { setArrastando(null); setSobre(null); }}>
                {podeEditar && <span className="cf-pega" title="Arraste para mudar a ordem"><i className="fas fa-grip-vertical" /></span>}
                <span className="cf-num">{i + 1}</span>
                <div className="cf-nome">
                  {editando === f.chave ? (
                    <input autoFocus value={texto} maxLength={60} onChange={(ev) => setTexto(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") confirmarNome(); if (ev.key === "Escape") { setEditando(null); setErro(null); } }}
                      onBlur={confirmarNome} className="cf-input" placeholder={f.chave} />
                  ) : (
                    <>
                      <span className="cf-nome-t" onDoubleClick={() => podeEditar && abrirNome(f)}>{nome}</span>
                      {f.rotulo && <span className="cf-orig" title="Nome gravado nas OS">{f.chave}</span>}
                      {novaAqui ? <span className="cf-tag nova">nova</span> : criada && <span className="cf-tag">criada</span>}
                    </>
                  )}
                </div>
                {n > 0 && <span className="cf-conta" title={`${n} OS nesta fase`}>{n} OS</span>}
                {fixa && <span className="cf-tranca" title="Usada pelo sistema (robôs, app do técnico, faturamento): dá para renomear e mudar a ordem, mas não remover"><i className="fas fa-lock" /></span>}
                {podeEditar && (
                  <span className="cf-acoes">
                    <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(i, i - 1)}><i className="fas fa-chevron-up" /></button>
                    <button type="button" title="Descer" disabled={i === rascunho.length - 1} onClick={() => mover(i, i + 1)}><i className="fas fa-chevron-down" /></button>
                    <button type="button" title="Renomear" onClick={() => abrirNome(f)}><i className="fas fa-pen" /></button>
                    {f.rotulo && <button type="button" title={`Voltar ao nome original (${f.chave})`} onClick={() => voltarNome(f.chave)}><i className="fas fa-rotate-left" /></button>}
                    {!fixa && (
                      <button type="button" className="cf-lixo" disabled={n > 0}
                        title={n > 0 ? `Tem ${n} OS nesta fase: mude elas de fase antes` : "Remover esta fase"}
                        onClick={() => remover(f.chave)}><i className="fas fa-trash-can" /></button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {podeEditar && (
          <div className="cf-nova">
            <div className="cf-nova-linha">
              <i className="fas fa-plus" />
              <input ref={novaRef} value={nova} maxLength={60} placeholder={`Nome da fase nova no ${NOME[aba]}…`}
                onChange={(ev) => { setNova(ev.target.value); setErroNova(null); }}
                onKeyDown={(ev) => { if (ev.key === "Enter") adicionar(); }} />
              <button type="button" onClick={adicionar} disabled={!nova.trim()}>Adicionar</button>
            </div>
            {erroNova ? <div className="cf-erro-p">{erroNova}</div> : <div className="cf-dica">Entra antes de &ldquo;Concluída&rdquo;; depois é só arrastar para o lugar.</div>}
          </div>
        )}

        <div className="cf-rodape">
          <div className="cf-resumo">
            {erro ? <span className="cf-erro"><i className="fas fa-circle-exclamation" /> {erro}</span>
              : ok ? <span className="cf-ok"><i className="fas fa-circle-check" /> {ok}</span>
              : mudou ? <span>{resumo.length} {resumo.length === 1 ? "mudança" : "mudanças"} sem salvar</span>
              : <span className="cf-apagado">Nenhuma mudança.</span>}
          </div>
          {podeEditar && (
            <>
              <button type="button" className="cf-bt2" disabled={!mudou || salvando} onClick={() => { setRascunho(null); setErro(null); }}>Desfazer</button>
              <button type="button" className="cf-bt1" disabled={!mudou || salvando} onClick={pedirSalvar}>
                {salvando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />} Salvar
              </button>
            </>
          )}
        </div>

        {perguntar && (
          <div className="cf-perg-fundo" onMouseDown={(ev) => { if (ev.target === ev.currentTarget && !salvando) setPerguntar(false); }}>
            <div className="cf-perg">
              <span className="cf-ic" style={{ margin: "0 auto 10px" }}><i className="fas fa-code-branch" /></span>
              <div className="cf-titulo" style={{ textAlign: "center" }}>Aplicar no {NOME[outro]} também?</div>
              <ul className="cf-mud">{resumo.map((r) => <li key={r}>{r}</li>)}</ul>
              {previaOutro.length > 0
                ? <div className="cf-dica" style={{ textAlign: "center" }}>No {NOME[outro]} isso fica: {previaOutro.join(" · ")}</div>
                : <div className="cf-dica" style={{ textAlign: "center" }}>No {NOME[outro]} essas fases já estão assim (ou não existem lá).</div>}
              <div className="cf-perg-bts">
                <button type="button" className="cf-bt1" disabled={salvando || previaOutro.length === 0} onClick={() => void salvar(true)}>
                  {salvando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-clone" />} Sim, no {NOME[aba]} e no {NOME[outro]}
                </button>
                <button type="button" className="cf-bt2" disabled={salvando} onClick={() => void salvar(false)}>Só no {NOME[aba]}</button>
                <button type="button" className="cf-link" disabled={salvando} onClick={() => setPerguntar(false)}>Voltar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const ESTILO_CF = `
.cf-fundo { outline: none; position: fixed; inset: 0; z-index: 9900; display: grid; place-items: center; padding: 16px;
  background: rgba(15,23,42,.38); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); animation: cf-in .18s ease-out; }
.cf-caixa { position: relative; width: 640px; max-width: 100%; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); border: 1px solid var(--border, #e2e8f0); border-radius: 18px;
  box-shadow: 0 30px 70px -20px rgba(15,23,42,.45); overflow: hidden; animation: cf-sobe .22s cubic-bezier(.2,.9,.3,1.2); }
@keyframes cf-in { from { opacity: 0 } }
@keyframes cf-sobe { from { opacity: 0; transform: translateY(12px) scale(.98) } }
.cf-topo { display: flex; align-items: center; gap: 12px; padding: 16px 18px 10px; }
.cf-ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; flex-shrink: 0;
  color: ${COR}; background: color-mix(in srgb, ${COR} 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, ${COR} 18%, transparent); }
.cf-titulo { font-size: 17px; font-weight: 500; letter-spacing: -.01em; }
.cf-sub, .cf-dica { font-size: 12.5px; color: var(--portal-text-muted, #64748b); }
.cf-x { border: none; background: transparent; color: #94a3b8; font-size: 18px; cursor: pointer; width: 34px; height: 34px; border-radius: 9px; }
.cf-x:hover { background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #0f172a); }
.cf-abas { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--border, #e2e8f0); }
.cf-aba { display: inline-flex; align-items: center; gap: 8px; border: 1px solid transparent; border-bottom: none; background: transparent;
  padding: 9px 16px; border-radius: 10px 10px 0 0; font: inherit; font-size: 13.5px; color: var(--portal-text-muted, #64748b); cursor: pointer; margin-bottom: -1px; }
.cf-aba.on { background: var(--surface, #fefefe); border-color: var(--border, #e2e8f0); color: var(--portal-text, #0f172a); font-weight: 500; }
.cf-aba.on i { color: ${COR}; }
.cf-n { font-size: 11px; padding: 0 7px; border-radius: 999px; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text-secondary, #475569); font-variant-numeric: tabular-nums; }
.cf-aviso { margin: 10px 18px 0; padding: 8px 12px; border-radius: 10px; font-size: 12.5px; color: #92400e;
  background: color-mix(in srgb, #f59e0b 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent); display: flex; gap: 8px; align-items: center; }
.cf-lista { list-style: none; margin: 0; padding: 10px 12px; overflow-y: auto; flex: 1; min-height: 120px; }
.cf-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 11px; border: 1px solid transparent;
  transition: background .15s, border-color .15s, transform .15s; }
.cf-item:hover { background: var(--portal-bg-secondary, #f8fafc); }
.cf-item.arr { opacity: .45; }
.cf-item.sobre { border-color: ${COR}; background: color-mix(in srgb, ${COR} 6%, var(--surface, #fefefe)); }
.cf-pega { color: #cbd5e1; cursor: grab; font-size: 13px; width: 12px; }
.cf-item:hover .cf-pega { color: #94a3b8; }
.cf-num { width: 22px; text-align: right; font-size: 12px; color: #94a3b8; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cf-nome { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cf-nome-t { font-size: 14px; }
.cf-orig { font-size: 11.5px; color: #94a3b8; text-decoration: line-through; text-decoration-color: color-mix(in srgb, #94a3b8 50%, transparent); }
.cf-tag { font-size: 10.5px; padding: 1px 8px; border-radius: 999px; color: #047857; background: color-mix(in srgb, #047857 10%, var(--surface, #fefefe)); }
.cf-tag.nova { color: ${COR}; background: color-mix(in srgb, ${COR} 10%, var(--surface, #fefefe)); }
.cf-input { width: 100%; font: inherit; font-size: 14px; padding: 5px 9px; border-radius: 8px; border: 1px solid ${COR}; outline: none;
  background: var(--surface, #fefefe); color: inherit; box-shadow: 0 0 0 3px color-mix(in srgb, ${COR} 15%, transparent); margin: 0; }
.cf-conta { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text-secondary, #475569); white-space: nowrap; }
.cf-tranca { color: #94a3b8; font-size: 11px; }
.cf-acoes { display: flex; gap: 2px; opacity: .35; transition: opacity .15s; }
.cf-item:hover .cf-acoes, .cf-item:focus-within .cf-acoes { opacity: 1; }
.cf-acoes button { border: none; background: transparent; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #64748b; font-size: 12px; }
.cf-acoes button:hover:not(:disabled) { background: var(--surface, #fefefe); color: ${COR}; box-shadow: 0 1px 0 var(--border, #e2e8f0); }
.cf-acoes .cf-lixo:hover:not(:disabled) { color: #dc2626; }
.cf-acoes button:disabled { opacity: .3; cursor: default; }
.cf-nova { padding: 10px 18px 6px; border-top: 1px solid var(--border, #e2e8f0); }
.cf-nova-linha { display: flex; align-items: center; gap: 10px; padding: 4px 4px 4px 12px; border-radius: 11px; border: 1px dashed var(--border, #cbd5e1); }
.cf-nova-linha:focus-within { border-style: solid; border-color: ${COR}; }
.cf-nova-linha i { color: ${COR}; font-size: 12px; }
.cf-nova-linha input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font: inherit; font-size: 14px; color: inherit; padding: 6px 0; margin: 0; }
.cf-nova-linha button { border: none; border-radius: 8px; padding: 7px 14px; background: ${COR}; color: #fefefe; font: inherit; font-size: 13px; cursor: pointer; }
.cf-nova-linha button:disabled { opacity: .4; cursor: default; }
.cf-nova .cf-dica, .cf-erro-p { padding: 5px 4px 0; }
.cf-erro-p, .cf-erro { font-size: 12.5px; color: #dc2626; }
.cf-ok { font-size: 12.5px; color: #047857; }
.cf-apagado { color: #94a3b8; }
.cf-rodape { display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px; border-top: 1px solid var(--border, #e2e8f0); }
.cf-resumo { flex: 1; min-width: 0; font-size: 12.5px; color: var(--portal-text-secondary, #475569); }
.cf-bt1, .cf-bt2 { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 10px; padding: 9px 16px; font: inherit; font-size: 13.5px; cursor: pointer; }
.cf-bt1 { border: none; background: ${COR}; color: #fefefe; }
.cf-bt2 { border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: inherit; }
.cf-bt1:disabled, .cf-bt2:disabled { opacity: .45; cursor: default; }
.cf-link { border: none; background: transparent; color: var(--portal-text-muted, #64748b); font: inherit; font-size: 13px; cursor: pointer; padding: 6px; }
.cf-perg-fundo { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--surface, #fefefe) 70%, transparent);
  backdrop-filter: blur(3px); animation: cf-in .15s ease-out; }
.cf-perg { width: 420px; max-width: 100%; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 18px;
  box-shadow: 0 24px 50px -18px rgba(15,23,42,.45); animation: cf-sobe .2s cubic-bezier(.2,.9,.3,1.2); }
.cf-mud { margin: 10px 0 8px; padding: 10px 12px 10px 28px; border-radius: 10px; background: var(--portal-bg-secondary, #f8fafc); font-size: 13px; max-height: 160px; overflow: auto; }
.cf-perg-bts { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
@media (max-width: 640px) {
  .cf-fundo { padding: 0; place-items: end stretch; }
  .cf-caixa { width: 100%; max-height: 92vh; border-radius: 18px 18px 0 0; animation: cf-sobe-cel .25s ease-out; }
  @keyframes cf-sobe-cel { from { transform: translateY(40px); opacity: 0 } }
  .cf-topo { padding: 14px 16px 8px; }
  .cf-abas { padding: 0 12px; }
  .cf-aba { flex: 1; justify-content: center; }
  .cf-lista { padding: 8px; }
  .cf-pega, .cf-num { display: none; }
  .cf-acoes { opacity: 1; }
  .cf-acoes button { width: 34px; height: 34px; }
  .cf-nova, .cf-rodape { padding-left: 12px; padding-right: 12px; }
  .cf-rodape { flex-wrap: wrap; }
  .cf-resumo { flex-basis: 100%; }
  .cf-bt1, .cf-bt2 { flex: 1; min-height: 44px; }
}
`;
