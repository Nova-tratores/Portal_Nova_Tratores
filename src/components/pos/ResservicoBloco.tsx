"use client";
// Bloco "Resserviço" da OS (José, 22/10/2026): informar que a OS gerou resserviço (o técnico teve de voltar para
// refazer). Cria a OS de resserviço — cópia que aparece no app dos técnicos — e a original fica vermelha em
// Concluída. Mostra o que o técnico fez de errado e como anda a OS de resserviço. Regras: lib/pos/resservico.ts.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { MOTIVOS_RESSERVICO, rotuloMotivo, type RegistroResservico } from "@/lib/pos/resservico";

interface Estado {
  registro: RegistroResservico | null;
  osNova: { id: string; status: string; tecnico: string; previsao: string | null; relatorio: boolean } | null;
  resservicoDe: string | null;
}
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataBR = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("pt-BR") : "—");

export default function ResservicoBloco({ osId, podeEditar, tecnicos, tecnicoAtual }: { osId: string; podeEditar: boolean; tecnicos: string[]; tecnicoAtual: string }) {
  const [est, setEst] = useState<Estado | null>(null);
  const [semSQL, setSemSQL] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [volta, setVolta] = useState(tecnicoAtual);
  const [previsao, setPrevisao] = useState(hojeSP());
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const url = `/api/pos/ordens/${encodeURIComponent(osId)}/resservico`;
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(url, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j.semSQL) { setSemSQL(true); return; }
      if (r.ok) setEst(j);
    } catch { /* fica sem o bloco */ }
  }, [url]);
  useEffect(() => { void carregar(); }, [carregar]);

  const registrar = async () => {
    setSalvando(true); setMsg("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ motivo, erro, tecnicoVolta: volta, previsao }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.erro || "Não foi possível registrar."); return; }
      setEst(j); setAbrindo(false); setErro(""); setMotivo("");
    } finally { setSalvando(false); }
  };
  const desfazer = async () => {
    if (!est?.registro || !confirm(`Desfazer o resserviço?\n\nA ${est.registro.os} será apagada e esta OS volta a ficar verde.`)) return;
    setSalvando(true); setMsg("");
    try {
      const r = await fetch(url, { method: "DELETE", headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.erro || "Não foi possível desfazer."); return; }
      setEst(j);
    } finally { setSalvando(false); }
  };

  if (semSQL) return <div className="rs rs-aviso"><i className="fas fa-database" /> Resserviço: falta rodar o SQL <code>sql/pos-resservico.sql</code> no banco do portal.<style>{ESTILO_RS}</style></div>;
  if (!est) return null;

  if (est.resservicoDe) {
    return (
      <div className="rs rs-filha">
        <style>{ESTILO_RS}</style>
        <span className="rs-ic"><i className="fas fa-rotate-left" /></span>
        <div><b>Esta OS é um resserviço</b><small>O técnico voltou para refazer o serviço da <a href={`/pos?id=${encodeURIComponent(est.resservicoDe)}`}>{est.resservicoDe}</a>.</small></div>
      </div>
    );
  }

  const reg = est.registro;
  if (reg) {
    const n = est.osNova;
    const podeDesfazer = podeEditar && (!n || (!n.relatorio && n.status === "Aguardando ordem Técnico"));
    return (
      <div className="rs rs-tem">
        <style>{ESTILO_RS}</style>
        <div className="rs-cab">
          <span className="rs-ic"><i className="fas fa-rotate-left" /></span>
          <div><b>Esta OS gerou resserviço</b><small>{rotuloMotivo(reg.motivo)} · registrado por {reg.por} em {dataBR(reg.em)}</small></div>
          {n && <a className="rs-os" href={`/pos?id=${encodeURIComponent(n.id)}`} title="Abrir a OS de resserviço">{n.id}<i className="fas fa-arrow-up-right-from-square" /></a>}
        </div>
        <div className="rs-erro"><small>O que o técnico fez de errado</small><p>{reg.erro}</p></div>
        <div className="rs-linhas">
          <span><small>Fez o serviço</small>{reg.tecnicos.join(" e ") || "—"}</span>
          <span><small>Volta no cliente</small>{reg.tecnicoVolta || "—"}</span>
          <span><small>OS de resserviço</small>{n ? <>{n.status}{n.relatorio ? " · relatório preenchido" : ""}</> : "apagada"}</span>
          {n?.previsao && <span><small>Previsão</small>{dataBR(n.previsao)}</span>}
        </div>
        {(podeDesfazer || msg) && (
          <div className="rs-acoes">
            {msg && <span className="rs-msg">{msg}</span>}
            {podeDesfazer && <button type="button" className="rs-bt sec" onClick={desfazer} disabled={salvando}><i className="fas fa-trash-can" /> Desfazer</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rs">
      <style>{ESTILO_RS}</style>
      <div className="rs-cab">
        <span className="rs-ic cinza"><i className="fas fa-rotate-left" /></span>
        <div><b>Resserviço</b><small>O técnico precisou voltar para refazer? Registre aqui: abre uma OS de resserviço no app dele e esta fica vermelha.</small></div>
        {podeEditar && !abrindo && <button type="button" className="rs-bt" onClick={() => { setAbrindo(true); setVolta(tecnicoAtual); }}><i className="fas fa-plus" /> Informar resserviço</button>}
      </div>
      {abrindo && (
        <div className="rs-form">
          <label>Motivo</label>
          <div className="rs-motivos">
            {MOTIVOS_RESSERVICO.map((m) => (
              <button key={m.id} type="button" className={motivo === m.id ? "on" : ""} onClick={() => setMotivo(m.id)}>{m.rotulo}</button>
            ))}
          </div>
          <label>O que o técnico fez de errado <span>(ele vai ler isso no app)</span></label>
          <textarea rows={3} value={erro} onChange={(e) => setErro(e.target.value)} placeholder="Ex.: não reapertou a mangueira do hidráulico depois da troca do filtro; voltou a vazar." />
          <div className="rs-duas">
            <div>
              <label>Quem volta no cliente</label>
              <select value={volta} onChange={(e) => setVolta(e.target.value)}>
                {[...new Set([tecnicoAtual, ...tecnicos].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label>Para quando</label>
              <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
            </div>
          </div>
          <div className="rs-acoes">
            {msg && <span className="rs-msg">{msg}</span>}
            <button type="button" className="rs-bt sec" onClick={() => { setAbrindo(false); setMsg(""); }} disabled={salvando}>Cancelar</button>
            <button type="button" className="rs-bt" onClick={registrar} disabled={salvando || !motivo || erro.trim().length < 5}>
              {salvando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-rotate-left" />} Registrar e abrir OS de resserviço
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ESTILO_RS = `
/* vermelho sempre (José, 22/10/2026: "deixa vermelho o resserviço") */
.rs { display: grid; gap: 12px; margin-top: 12px; padding: 14px 16px; border-radius: 14px; border: 1px solid #fca5a5 !important; background: color-mix(in srgb, #dc2626 6%, var(--surface, #fefefe)) !important; color: var(--portal-text, #0f172a) }
.rs > .rs-cab b { color: #991b1b }
.rs-aviso { display: block; font-size: 13px; color: #92400e; background: #fffbeb; border-color: #fde68a }
.rs-tem { border-color: #fca5a5; background: color-mix(in srgb, #dc2626 5%, var(--surface, #fefefe)) }
.rs-filha { grid-template-columns: auto minmax(0, 1fr); align-items: center; border-color: #fca5a5; background: color-mix(in srgb, #dc2626 5%, var(--surface, #fefefe)) }
.rs-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap }
.rs-cab > div, .rs-filha > div { display: grid; flex: 1; min-width: 220px; line-height: 1.3 }
.rs b { font-weight: 500; font-size: 15px } .rs small { font-size: 12.5px; color: var(--portal-text-secondary, #475569) }
.rs-ic { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; font-size: 14px; color: #dc2626; background: #fee2e2 }
.rs-ic.cinza { color: #fefefe; background: #dc2626 }
.rs-os { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 12px; border-radius: 999px; color: #b91c1c; background: #fee2e2; text-decoration: none }
.rs-os i { font-size: 10px }
.rs-erro { padding: 10px 12px; border-radius: 10px; background: var(--surface, #fefefe); border: 1px solid #fecaca }
.rs-erro p { margin: 3px 0 0; font-size: 14px; white-space: pre-wrap }
.rs-linhas { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 13.5px } .rs-linhas span { display: grid }
.rs-form { display: grid; gap: 8px }
.rs-form label { font-size: 13px; color: var(--portal-text-secondary, #475569); margin: 4px 0 0 } .rs-form label span { color: var(--portal-text-muted, #94a3b8) }
.rs-motivos { display: flex; flex-wrap: wrap; gap: 6px }
.rs-motivos button { border: 1px solid #fecaca; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 13px; cursor: pointer }
.rs-motivos button.on { border-color: #dc2626; background: #fee2e2; color: #991b1b }
.rs-form textarea, .rs-form select, .rs-form input { width: 100%; box-sizing: border-box; border: 1px solid #fecaca; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); margin: 0 }
.rs-duas { display: grid; grid-template-columns: 1fr 180px; gap: 10px }
.rs-acoes { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap }
.rs-msg { margin-right: auto; font-size: 13px; color: #b91c1c }
.rs-bt { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 10px; border: 0; background: #dc2626; color: #fefefe; font-family: inherit; font-size: 13.5px; cursor: pointer }
.rs-bt.sec { background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); border: 1px solid var(--border, #e2e8f0) }
.rs-bt:disabled { opacity: .55; cursor: not-allowed }
@media (max-width: 640px) { .rs-duas { grid-template-columns: 1fr } }
`;
