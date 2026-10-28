"use client";
// Registro do atendimento de um trator do Radar: atendeu? → como foi (ou por que não faz a 50 h, ou
// dispensar) → grava em radar_tratores_contatos. Saiu de dentro do RoteiroLigacao (28/10/2026) para ser
// usado também DENTRO da ficha (José: "quando a gente clicar aqui tem que formalizar o atendimento dentro
// do modal"). Com `atendimentoId`, gravar fecha o atendimento em andamento. Classes rl-* (ESTILO_RL).
import { useState } from "react";
import { fetchAuth } from "@/lib/auth/client";
import type { TratorVendido } from "@/lib/revisoes/vendidos-server";
import {
  MOTIVOS_SEM_50, ROTULO_MOTIVO, ROTULO_RESULTADO, RESULTADOS, previsaoPorHorimetro, retornoSugerido,
  type Contato, type MotivoSem50, type Resultado, type Situacao,
} from "@/lib/revisoes/contatos-radar";

const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => { const d = new Date(Date.now() - 3 * 3_600_000); return d.toISOString().slice(0, 10); };
const primeiroNome = (n: string | null | undefined) => { const p = (n || "").trim().split(/\s+/)[0] || ""; return p ? p[0] + p.slice(1).toLowerCase() : ""; };

type Modo = "atendeu" | "liguei" | "dispensar" | "sem50";

export default function RegistroAtendimento({ t, s, atendimentoId, onGravado, onVoltar, rotuloSalvar = "Salvar e ir para o próximo" }: {
  t: TratorVendido; s: Situacao; atendimentoId?: string | null;
  /** contato gravado + frase curta do que aconteceu (para o aviso) */
  onGravado: (c: Contato, aviso: string) => void;
  /** "Voltar" do 1º passo (null = não mostra) */
  onVoltar?: () => void;
  rotuloSalvar?: string;
}) {
  const [modo, setModo] = useState<Modo>("atendeu");
  const [motivo, setMotivo] = useState<MotivoSem50 | null>(null);
  const [horimetro, setHorimetro] = useState("");
  const [retornar, setRetornar] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const hoje = hojeISO();
  const nome = primeiroNome(t.cliente?.nome);
  const voltar = () => { setModo("atendeu"); setRes(null); setNota(""); setErro(""); setMotivo(null); setHorimetro(""); setRetornar(null); };
  const numHor = Number(horimetro.replace(",", "."));
  const proxMarco = t.marcos.find((m) => !m.passou)?.data ?? null;
  const sugerido = modo === "liguei" && res ? retornoSugerido(res, null, hoje, proxMarco) : modo === "sem50" && motivo ? retornoSugerido("sem_revisao", motivo, hoje) : null;
  const dataRet = retornar ?? sugerido;
  const prevLive = motivo === "sem_horas" && horimetro.trim() !== "" && Number.isFinite(numHor) ? previsaoPorHorimetro(t.entrega.data || t.dataVenda, hoje, numHor) : null;

  const gravar = async (resultado: Resultado, texto: string, extra: { motivo?: MotivoSem50; horimetro?: string; retornar_em?: string | null } = {}) => {
    if (!s.marco) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetchAuth("/api/revisoes/vendidos/contatos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: t.chave, marco: s.marco, resultado, nota: texto, atendimento_id: atendimentoId || undefined, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || "Não consegui gravar.");
      const quem = nome || "Cliente";
      const volta = extra.retornar_em ? ` Volta para a fila em ${dataBR(extra.retornar_em)}.` : "";
      onGravado(j.contato as Contato, resultado === "nao_atendeu" ? `${quem}: tentativa anotada, foi para o fim da fila.`
        : resultado === "sem_revisao" && extra.motivo ? `${quem}: ${ROTULO_MOTIVO[extra.motivo].toLowerCase()} — registrado.${volta}`
        : `${quem}: ${ROTULO_RESULTADO[resultado].toLowerCase()} — registrado.${volta}`);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  };

  if (modo === "atendeu") return (
    <div className="rl-passo">
      <span className="rl-passo-n">?</span>
      <div className="rl-passo-c">
        <b>{nome || "O cliente"} atendeu?</b>
        <div className="rl-acoes">
          <button type="button" className="rl-btn ok grande" onClick={() => setModo("liguei")}><i className="fa-solid fa-comments" /> Sim, conversamos</button>
          <button type="button" className="rl-btn grande" disabled={salvando} onClick={() => gravar("nao_atendeu", "")}>{salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-phone-slash" />} Não atendeu</button>
          {onVoltar && <button type="button" className="rl-link" onClick={onVoltar}>Voltar</button>}
          {!["orcar", "aguarda", "justificado", "orcado", "feita"].includes(s.estado) && <button type="button" className="rl-link" onClick={() => setModo("dispensar")}>Não precisa ligar (dispensar)</button>}
        </div>
        {erro && <div className="rl-erro">{erro}</div>}
      </div>
    </div>
  );

  if (modo === "liguei") return (
    <div className="rl-painel">
      <b>Como foi a conversa?</b>
      <div className="rl-res">
        {RESULTADOS.map((r) => (
          <button key={r.id} type="button" className={res === r.id ? "on" : ""} style={{ ["--k" as string]: r.cor }} onClick={() => { setRes(r.id); setRetornar(null); }}>
            <i className={`fa-solid ${r.ico}`} /> {r.rotulo}
          </button>
        ))}
        {!["orcado", "feita"].includes(s.estado) && (
          <button type="button" style={{ ["--k" as string]: "#0e7490" }} onClick={() => { setRes(null); setModo("sem50"); }}>
            <i className="fa-solid fa-comment-slash" /> Não vai fazer a 50 h agora
          </button>
        )}
      </div>
      {res && sugerido && <QuandoFalar hoje={hoje} sugerido={sugerido} valor={dataRet} onMudar={setRetornar} />}
      <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={res === "problema" ? "Qual é o problema? (obrigatório)" : "Anotação (opcional): horímetro, o que ele pediu…"} />
      {erro && <div className="rl-erro">{erro}</div>}
      <div className="rl-decide">
        <button type="button" className="rl-btn grande ok" disabled={!res || salvando} onClick={() => res && gravar(res, nota, { retornar_em: dataRet })}>
          {salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-floppy-disk" />} {rotuloSalvar}
        </button>
        <button type="button" className="rl-link" onClick={voltar}>Voltar</button>
      </div>
    </div>
  );

  if (modo === "sem50") return (
    <div className="rl-painel">
      <b>Por que ainda não fez a revisão de 50 h?</b>
      <div className="rl-res">
        {MOTIVOS_SEM_50.map((m) => (
          <button key={m.id} type="button" className={motivo === m.id ? "on" : ""} style={{ ["--k" as string]: m.id === "sem_horas" ? "#0e7490" : "#64748b" }} onClick={() => { setMotivo(m.id); setRetornar(null); }}>
            <i className={`fa-solid ${m.ico}`} /> {m.rotulo}
          </button>
        ))}
      </div>
      {motivo === "sem_horas" && (
        <div className="rl-horim">
          <label>
            <span>Quantas horas o trator está marcando?</span>
            <input autoFocus inputMode="decimal" value={horimetro} onChange={(e) => setHorimetro(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex.: 32" />
          </label>
          {prevLive && (
            <div className="rl-horim-prev">
              <span>≈ {String(prevLive.horasDia).replace(".", ",")} h por dia em {prevLive.dias} dias desde a entrega</span>
              <b>50 h em {dataBR(prevLive.data50)}</b>
              <small>300 h por volta de {dataBR(prevLive.data300)}</small>
            </div>
          )}
        </div>
      )}
      {motivo && sugerido && <QuandoFalar hoje={hoje} sugerido={sugerido} valor={dataRet} onMudar={setRetornar} />}
      <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={motivo === "outro" ? "Qual é o motivo? (obrigatório)" : "Anotação (opcional)"} />
      {erro && <div className="rl-erro">{erro}</div>}
      <div className="rl-decide">
        <button type="button" className="rl-btn grande ok" disabled={!motivo || salvando || (motivo === "sem_horas" && !horimetro.trim()) || (motivo === "outro" && nota.trim().length < 5)} onClick={() => motivo && gravar("sem_revisao", nota, { motivo, horimetro, retornar_em: motivo === "sem_horas" ? null : dataRet })}>
          {salvando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-floppy-disk" />} Salvar o motivo
        </button>
        <button type="button" className="rl-link" onClick={voltar}>Voltar</button>
      </div>
    </div>
  );

  return (
    <div className="rl-painel">
      <b>Por que não precisa ligar?</b>
      <textarea rows={2} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: o vendedor já conversou, cliente pediu para não ligar…" />
      {erro && <div className="rl-erro">{erro}</div>}
      <div className="rl-decide">
        <button type="button" className="rl-btn grande" disabled={nota.trim().length < 5 || salvando} onClick={() => gravar("dispensado", nota)}>Dispensar</button>
        <button type="button" className="rl-link" onClick={voltar}>Voltar</button>
      </div>
    </div>
  );
}

/** Quando falar de novo: sugestão pela resposta + atalhos de dias + data livre. */
function QuandoFalar({ hoje, sugerido, valor, onMudar }: { hoje: string; sugerido: string; valor: string | null; onMudar: (d: string | null) => void }) {
  const em = (d: number) => new Date(Date.parse(hoje) + d * 86_400_000).toISOString().slice(0, 10);
  const atalhos = [3, 7, 15, 30, 60].map((d) => ({ d, data: em(d) }));
  return (
    <div className="rl-quando-f">
      <span><i className="fa-solid fa-calendar-day" /> Quando falar de novo?</span>
      <div className="rl-quando-op">
        {atalhos.map((a) => (
          <button key={a.d} type="button" className={valor === a.data ? "on" : ""} onClick={() => onMudar(a.data)}>{a.d} dias{a.data === sugerido ? " · sugerido" : ""}</button>
        ))}
        <input type="date" min={em(1)} value={valor ?? ""} onChange={(e) => onMudar(e.target.value || null)} aria-label="Escolher a data" />
      </div>
      <small>Até {dataBR(valor)} o trator fica de molho; nesse dia volta para &quot;Precisa de ação&quot;.{valor !== sugerido ? <> <button type="button" className="rl-link" onClick={() => onMudar(null)}>usar a sugestão ({dataBR(sugerido)})</button></> : null}</small>
    </div>
  );
}
