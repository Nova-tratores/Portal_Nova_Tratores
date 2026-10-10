"use client";

// Tela PÚBLICA de assinatura do cliente (celular), pra QUALQUER OS. Mostra o
// resumo do serviço, quadro pra assinar com o dedo, nome, e captura GPS +
// modelo do aparelho como prova. Usada em /assinar/<token>.
import { useCallback, useEffect, useRef, useState } from "react";
import CanvasAssinatura, { type CanvasAssinaturaRef } from "./CanvasAssinatura";

interface Resumo {
  osId: string; numero: string; cliente: string; tipoServico: string; servico: string; data: string; tecnico: string;
  trator: string; chassi: string; horimetro: string; revisaoHoras: number | null;
  assinado: boolean; assinadoEm: string | null; assinadoNome: string | null;
}
type Geo = { lat: number; lng: number; precisao_m: number | null; obtido_em: string };

export default function AssinarOS({ token }: { token: string }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [temTraco, setTemTraco] = useState(false);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pedindo" | "ok" | "negada" | "erro">("pedindo");
  const quadro = useRef<CanvasAssinaturaRef | null>(null);

  useEffect(() => {
    fetch(`/api/assinar/${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "erro"); setResumo(j); setNome(j.cliente || ""); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Link inválido"));
  }, [token]);

  const pedirLocalizacao = useCallback((): Promise<Geo | null> => new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoStatus("erro"); resolve(null); return; }
    setGeoStatus("pedindo");
    navigator.geolocation.getCurrentPosition(
      (p) => { const g = { lat: p.coords.latitude, lng: p.coords.longitude, precisao_m: p.coords.accuracy ?? null, obtido_em: new Date().toISOString() }; setGeo(g); setGeoStatus("ok"); resolve(g); },
      (err) => { setGeoStatus(err.code === 1 ? "negada" : "erro"); resolve(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }), []);
  useEffect(() => { if (resumo && !resumo.assinado) pedirLocalizacao(); }, [resumo, pedirLocalizacao]);

  // Modelo do aparelho: Chrome/Android expõe pelo userAgentData; iPhone só diz "iPhone" no UA.
  const dispositivo = useCallback(async () => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<Record<string, string>> } };
    let modelo: string | null = null, plataforma: string | null = nav.userAgentData?.platform || null, versao: string | null = null;
    try {
      const hv = await nav.userAgentData?.getHighEntropyValues?.(["model", "platform", "platformVersion"]);
      if (hv) { modelo = hv.model || null; plataforma = hv.platform || plataforma; versao = hv.platformVersion || null; }
    } catch { /* sem userAgentData */ }
    const ua = navigator.userAgent || "";
    if (!modelo) {
      const m = ua.match(/\((iPhone|iPad|iPod)[^)]*\)/) || ua.match(/Android[^;]*;\s*([^)]+?)\s*(?:Build|\))/);
      modelo = m ? m[1].trim() : null;
    }
    if (!plataforma) plataforma = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : null;
    return { modelo, plataforma, versao, ua: ua.slice(0, 300), tela: `${window.screen?.width || 0}x${window.screen?.height || 0}` };
  }, []);

  const limpar = () => quadro.current?.limpar();

  const confirmar = async () => {
    const png = quadro.current?.png(); if (!png || !temTraco) return;
    if (!nome.trim()) { setErro("Escreva seu nome."); return; }
    setEnviando(true); setErro("");
    try {
      const g = geo || (await pedirLocalizacao());
      if (!g && !confirm("Não conseguimos pegar a localização do aparelho. Deseja assinar mesmo assim?")) { setEnviando(false); return; }
      const r = await fetch(`/api/assinar/${encodeURIComponent(token)}/confirmar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ png, nome: nome.trim(), geo: g, dispositivo: await dispositivo() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "não foi possível salvar");
      setPronto(true);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setEnviando(false); }
  };

  const S: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "Arial, Helvetica, sans-serif", color: "#1f2937", padding: "16px 14px 40px", overflowX: "hidden", boxSizing: "border-box" },
    card: { background: "#fff", borderRadius: 12, padding: 16, maxWidth: 520, margin: "0 auto 14px", boxShadow: "0 2px 10px rgba(0,0,0,.06)", minWidth: 0, overflowWrap: "anywhere" },
    topo: { background: "#E8462B", color: "#fff", borderRadius: 12, padding: "14px 16px", maxWidth: 520, margin: "0 auto 14px", overflowWrap: "anywhere" },
    lbl: { fontSize: 12, color: "#6b7280", marginTop: 8 },
    val: { fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" },
    btn: { width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, border: 0, borderRadius: 10, background: "#E8462B", color: "#fff", marginTop: 12 },
    btn2: { width: "100%", padding: "12px", fontSize: 14, fontWeight: 600, border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", color: "#374151", marginTop: 8 },
  };

  if (erro && !resumo) return <div style={S.page}><div style={S.card}><h2 style={{ marginTop: 0 }}>Link inválido</h2><p>{erro}</p></div></div>;
  if (!resumo) return <div style={S.page}><div style={S.card}>Carregando…</div></div>;

  const titulo = resumo.revisaoHoras ? `Cheque de revisão das ${resumo.revisaoHoras} horas` : `Ordem de serviço nº ${resumo.numero}`;
  const primeiroNome = resumo.cliente ? resumo.cliente.split(" ")[0] : "";

  if (pronto || resumo.assinado) {
    return (
      <div style={S.page}>
        <div style={S.topo}><div style={{ fontSize: 13, opacity: .9 }}>Nova Tratores</div><div style={{ fontSize: 20, fontWeight: 800 }}>{titulo}</div></div>
        <div style={S.card}>
          <div style={{ fontSize: 40, textAlign: "center" }}>✅</div>
          <h2 style={{ textAlign: "center", margin: "6px 0" }}>Assinatura registrada</h2>
          <p style={{ textAlign: "center", color: "#4b5563" }}>
            Obrigado{primeiroNome ? `, ${primeiroNome}` : ""}! {resumo.revisaoHoras ? `A revisão de ${resumo.revisaoHoras} horas do seu trator ficou registrada com a Mahindra.` : "O serviço ficou registrado na sua ordem de serviço."} Pode fechar esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.topo}><div style={{ fontSize: 13, opacity: .9 }}>Nova Tratores{resumo.revisaoHoras ? " · Mahindra" : ""}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{titulo}</div></div>
      <div style={S.card}>
        <div style={{ fontSize: 14, color: "#374151" }}>
          {resumo.revisaoHoras ? "Confira os dados e assine abaixo. A assinatura vai para o cheque de revisão enviado à Mahindra." : "Confira os dados do serviço e assine abaixo. A assinatura fica registrada na ordem de serviço."}
        </div>
        <div style={S.lbl}>Cliente</div><div style={S.val}>{resumo.cliente || "—"}</div>
        {resumo.servico && !resumo.revisaoHoras && (<><div style={S.lbl}>Serviço</div><div style={{ ...S.val, fontWeight: 600, fontSize: 14 }}>{resumo.servico}</div></>)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 12px" }}>
          {resumo.trator && <div><div style={S.lbl}>Máquina</div><div style={S.val}>{resumo.trator}</div></div>}
          {resumo.chassi && <div><div style={S.lbl}>Chassi</div><div style={S.val}>{resumo.chassi}</div></div>}
          <div><div style={S.lbl}>Data do serviço</div><div style={S.val}>{resumo.data || "—"}</div></div>
          {resumo.horimetro && <div><div style={S.lbl}>Horímetro</div><div style={S.val}>{resumo.horimetro}</div></div>}
          <div><div style={S.lbl}>Ordem de serviço</div><div style={S.val}>{resumo.numero || "—"}</div></div>
          {resumo.tecnico && <div><div style={S.lbl}>Técnico</div><div style={S.val}>{resumo.tecnico}</div></div>}
        </div>
      </div>
      <div style={S.card}>
        <div style={S.lbl}>Seu nome</div>
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: "100%", padding: 10, fontSize: 15, border: "1px solid #d1d5db", borderRadius: 8, marginTop: 4, boxSizing: "border-box" }} />
        <div style={{ ...S.lbl, marginTop: 14 }}>Assine com o dedo no quadro</div>
        <CanvasAssinatura ref={quadro} temTraco={temTraco} onTraco={setTemTraco} />
        <div style={{ marginTop: 10, fontSize: 12, display: "flex", alignItems: "center", gap: 8, color: geoStatus === "ok" ? "#047857" : geoStatus === "pedindo" ? "#6b7280" : "#b45309" }}>
          <span>{geoStatus === "ok" ? "📍" : geoStatus === "pedindo" ? "⏳" : "⚠️"}</span>
          <span>
            {geoStatus === "ok" && geo ? `Localização obtida (precisão ${Math.round(geo.precisao_m || 0)} m)` :
              geoStatus === "pedindo" ? "Obtendo a localização do aparelho…" :
              geoStatus === "negada" ? "Localização não permitida. Permita o acesso à localização no navegador e toque em tentar de novo." :
              "Não foi possível obter a localização."}
          </span>
          {geoStatus !== "ok" && geoStatus !== "pedindo" && <button type="button" onClick={pedirLocalizacao} style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}>tentar de novo</button>}
        </div>
        {erro && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{erro}</div>}
        <button type="button" style={{ ...S.btn, opacity: temTraco && !enviando ? 1 : .5 }} disabled={!temTraco || enviando} onClick={confirmar}>{enviando ? "Enviando…" : "Confirmar assinatura"}</button>
        <button type="button" style={S.btn2} onClick={limpar}>Limpar e assinar de novo</button>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 12 }}>Ao confirmar, você declara que o serviço foi realizado conforme descrito. Ficam registrados junto com a assinatura: seu nome, data e hora, localização do aparelho, modelo do celular e origem do acesso.</div>
      </div>
    </div>
  );
}
