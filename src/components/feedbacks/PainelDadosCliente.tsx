"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import MapaPropriedade from "./MapaPropriedade";
import {
  buscarCadastroOmie, salvarCadastroOmie, sincronizarTagsOmie,
  buscarLocalizacaoCliente, salvarLocalizacaoCliente,
  buscarClienteInfo, upsertClienteInfo, type CadastroOmieDados,
} from "@/lib/feedbacks/api";
import { clienteKey, TAGS_CLIENTE, TAGS_ESTRUTURAIS, TAG_NAO_CONTATAR } from "@/lib/feedbacks/types";
import { useAuditLog } from "@/hooks/useAuditLog";
import { round6 } from "./leaflet";

// Permite que o modal de atendimento dispare o save dos dados pelo seu botão único.
export interface PainelDadosClienteHandle {
  salvar: () => Promise<{ ok: boolean; erros: string[] }>;
}

interface Props {
  codigoOmie: string | null;
  nome: string;
  cor?: string;
  mostrarBotaoSalvar?: boolean;   // false quando o save é disparado pelo modal pai
  onSalvo?: () => void;
}

const CADASTRO_VAZIO: CadastroOmieDados = {
  telefone1: "", telefone2: "", fax: "", email: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
};
const sorted = (a: string[]) => JSON.stringify([...a].sort());
const vazio = (s: string) => !s.trim();

// Painel de confirmação dos dados do cliente: dados do Omie (endereço +
// contatos), localização no mapa e tags. Usado como coluna direita do modal
// de atendimento e também no modal standalone. Carrega/salva por conta própria.
const PainelDadosCliente = forwardRef<PainelDadosClienteHandle, Props>(function PainelDadosCliente(
  { codigoOmie, nome, cor = "#dc2626", mostrarBotaoSalvar = true, onSalvo }, ref
) {
  const { log } = useAuditLog();

  const [carregando, setCarregando] = useState(true);
  const [erroLoad, setErroLoad] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);

  const [cad, setCad] = useState<CadastroOmieDados>(CADASTRO_VAZIO);
  const [baseCad, setBaseCad] = useState<CadastroOmieDados>(CADASTRO_VAZIO);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");
  const [baseLoc, setBaseLoc] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  const [tags, setTags] = useState<string[]>([]);
  const [baseTags, setBaseTags] = useState<string[]>([]);
  // Tags fora da lista padrão (criadas à mão ou que já existiam no Omie) — ficam
  // visíveis como checkbox além das predefinidas.
  const [extrasTags, setExtrasTags] = useState<string[]>([]);
  const [novaTag, setNovaTag] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Evita recarregar quando só o nome digitado muda mas a chave do cliente é a mesma.
  const ultimaChave = useRef<string>("");

  useEffect(() => {
    const chave = clienteKey(codigoOmie, nome);
    if (chave === ultimaChave.current) return;
    ultimaChave.current = chave;

    let vivo = true;
    setCarregando(true); setErroLoad(null); setMsg(null);
    setEmpresa(null); setRowId(null);
    setCad(CADASTRO_VAZIO); setBaseCad(CADASTRO_VAZIO);
    setLat(null); setLng(null); setLatStr(""); setLngStr(""); setBaseLoc({ lat: null, lng: null });
    setTags([]); setBaseTags([]); setExtrasTags([]); setNovaTag("");

    let portalTags: string[] = [];
    let omieTags: string[] = [];
    const tarefas: Promise<void>[] = [];
    tarefas.push(
      buscarClienteInfo(chave)
        .then((info) => { portalTags = (info?.tags as string[] | undefined) || []; })
        .catch(() => { /* sem info ainda */ })
    );
    if (codigoOmie) {
      tarefas.push(
        buscarCadastroOmie(codigoOmie)
          .then((c) => { if (vivo) { setEmpresa(c.empresa); setCad(c.cadastro); setBaseCad(c.cadastro); } omieTags = c.tags || []; })
          .catch((e) => { if (vivo) setErroLoad(e instanceof Error ? e.message : String(e)); })
      );
      tarefas.push(
        buscarLocalizacaoCliente(codigoOmie)
          .then((loc) => {
            if (!vivo || !loc) return;
            setRowId(loc.id);
            setLat(loc.lat); setLng(loc.lng);
            setLatStr(loc.lat != null ? String(loc.lat) : "");
            setLngStr(loc.lng != null ? String(loc.lng) : "");
            setBaseLoc({ lat: loc.lat, lng: loc.lng });
          })
          .catch(() => { /* sem registro no mapa */ })
      );
    }
    Promise.all(tarefas).finally(() => {
      if (!vivo) return;
      // Tags atuais = Portal ∪ Omie (sem as estruturais). Inclui "Não contatar"
      // (preservada) e qualquer tag criada direto no Omie.
      const atuais = Array.from(new Set([
        ...portalTags,
        ...omieTags.filter((t) => !TAGS_ESTRUTURAIS.includes(t)),
      ]));
      setTags(atuais); setBaseTags(atuais);
      const predef = TAGS_CLIENTE.map((t) => t.tag);
      setExtrasTags(atuais.filter((t) => !predef.includes(t) && !TAGS_ESTRUTURAIS.includes(t) && t !== TAG_NAO_CONTATAR));
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [codigoOmie, nome]);

  const updCad = (k: keyof CadastroOmieDados, v: string) => { setCad((c) => ({ ...c, [k]: v })); setMsg(null); };
  const setCoords = (la: number, ln: number) => {
    const rla = round6(la), rln = round6(ln);
    setLat(rla); setLng(rln); setLatStr(String(rla)); setLngStr(String(rln)); setMsg(null);
  };
  const onCoordInput = (eixo: "lat" | "lng", valor: string) => {
    if (eixo === "lat") setLatStr(valor); else setLngStr(valor);
    const v = parseFloat(valor.replace(",", "."));
    if (Number.isFinite(v)) { if (eixo === "lat") setLat(round6(v)); else setLng(round6(v)); setMsg(null); }
  };
  const toggleTag = (t: string) => { setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]); setMsg(null); };
  const adicionarTag = () => {
    const t = novaTag.trim();
    if (!t || TAGS_ESTRUTURAIS.includes(t)) { setNovaTag(""); return; }
    if (!tags.includes(t)) setTags((p) => [...p, t]);
    const predef = TAGS_CLIENTE.map((x) => x.tag);
    if (!predef.includes(t) && !extrasTags.includes(t)) setExtrasTags((p) => [...p, t]);
    setNovaTag(""); setMsg(null);
  };
  // Exclui de vez uma tag criada/extra: tira o chip e remove do cliente (sai do Omie ao salvar).
  const removerExtra = (t: string) => {
    setExtrasTags((p) => p.filter((x) => x !== t));
    setTags((p) => p.filter((x) => x !== t));
    setMsg(null);
  };
  const renderTagPill = (tag: string, label: string, corTag: string, onRemover?: () => void) => {
    const marcada = tags.includes(tag);
    return (
      <label key={tag} title={tag} style={{
        display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
        fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 999,
        border: `2px solid ${marcada ? corTag : "var(--portal-border)"}`,
        background: marcada ? `${corTag}1f` : "var(--portal-bg-card)",
        color: marcada ? corTag : "var(--portal-text-secondary)",
        boxShadow: marcada ? `0 2px 8px -2px ${corTag}66` : "none", transition: "all .15s",
      }}>
        <input type="checkbox" checked={marcada} onChange={() => toggleTag(tag)} style={{ accentColor: corTag, width: 15, height: 15 }} />
        {label}
        {onRemover && (
          <span
            role="button"
            title="Excluir esta tag"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemover(); }}
            style={{ marginLeft: 2, fontSize: 15, lineHeight: 1, fontWeight: 800, color: "#991b1b", opacity: 0.65, cursor: "pointer" }}
          >
            ×
          </span>
        )}
      </label>
    );
  };

  const cadMudou = codigoOmie != null && JSON.stringify(cad) !== JSON.stringify(baseCad);
  const locMudou = (lat ?? null) !== baseLoc.lat || (lng ?? null) !== baseLoc.lng;
  const tagsMudou = sorted(tags) !== sorted(baseTags);
  const algoMudou = cadMudou || locMudou || tagsMudou;

  const temTelefone = !vazio(cad.telefone1) || !vazio(cad.telefone2);
  const temLocal = lat != null && lng != null;

  const checklist = codigoOmie ? [
    { label: "Endereço", ok: !vazio(cad.endereco) },
    { label: "Cidade", ok: !vazio(cad.cidade) },
    { label: "Telefone", ok: temTelefone },
    { label: "E-mail", ok: !vazio(cad.email) },
    { label: "Localização", ok: temLocal },
  ] : [];
  const faltam = checklist.filter((c) => !c.ok).length;

  async function salvar(): Promise<{ ok: boolean; erros: string[] }> {
    setSalvando(true); setMsg(null);
    const falhas: string[] = [];
    const chave = clienteKey(codigoOmie, nome);

    if (cadMudou && codigoOmie) {
      try {
        await salvarCadastroOmie(codigoOmie, cad);
        const campos = (Object.keys(cad) as (keyof CadastroOmieDados)[]).filter((k) => cad[k] !== baseCad[k]);
        void log({ sistema: "feedbacks", acao: "cadastro_omie", entidade: "cliente", entidade_id: chave, entidade_label: nome, detalhes: { campos } });
        setBaseCad(cad);
      } catch (e) { falhas.push("cadastro: " + (e instanceof Error ? e.message : String(e))); }
    }

    if (locMudou) {
      if (rowId == null) {
        falhas.push("localização: cliente sem registro no mapa do Portal");
      } else if (lat == null || lng == null) {
        falhas.push("localização: informe latitude e longitude");
      } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        falhas.push("localização: coordenadas fora do intervalo");
      } else {
        try {
          await salvarLocalizacaoCliente(rowId, lat, lng);
          void log({ sistema: "feedbacks", acao: "localizacao_cliente", entidade: "cliente", entidade_id: chave, entidade_label: nome, detalhes: { de: baseLoc, para: { lat, lng } } });
          setBaseLoc({ lat, lng });
        } catch (e) { falhas.push("localização: " + (e instanceof Error ? e.message : String(e))); }
      }
    }

    if (tagsMudou) {
      try {
        await upsertClienteInfo({ cliente_key: chave, codigo_omie: codigoOmie, nome, tags });
        void log({ sistema: "feedbacks", acao: "tags_cliente", entidade: "cliente", entidade_id: chave, entidade_label: nome, detalhes: { de: baseTags, para: tags } });
        if (codigoOmie) sincronizarTagsOmie(codigoOmie, tags).catch(() => { /* Omie best-effort */ });
        setBaseTags(tags);
      } catch (e) { falhas.push("tags: " + (e instanceof Error ? e.message : String(e))); }
    }

    setSalvando(false);
    if (falhas.length) setMsg({ tipo: "erro", texto: falhas.join(" · ") });
    else { setMsg({ tipo: "ok", texto: "Dados salvos." }); onSalvo?.(); }
    return { ok: falhas.length === 0, erros: falhas };
  }

  useImperativeHandle(ref, () => ({ salvar }));

  if (!nome) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--portal-text-muted)", fontStyle: "italic", fontSize: 13 }}>Selecione um cliente para ver e atualizar os dados.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)" }}>📇 Dados do cliente</div>
        <div style={{ display: "flex", gap: 6 }}>
          {codigoOmie && <span style={chipOmie}>Omie #{codigoOmie}</span>}
          {empresa && <span style={chipOmie}>{empresa}</span>}
        </div>
      </div>

      {carregando ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--portal-text-secondary)", fontWeight: 600 }}>Carregando dados…</div>
      ) : (
        <>
          {erroLoad && <div style={erroBox}>Não consegui ler o cadastro do Omie: {erroLoad}</div>}
          {!codigoOmie && <div style={avisoBox}>Cliente sem código Omie — só dá pra editar as tags.</div>}

          {codigoOmie && (
            <div style={{ ...checklistWrap, borderColor: faltam ? "#fed7aa" : "#bbf7d0", background: faltam ? "#fff7ed" : "#f0fdf4" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: faltam ? "#9a3412" : "#065f46", marginBottom: 8 }}>
                {faltam ? `⚠ Faltam ${faltam} ${faltam === 1 ? "dado" : "dados"} pra completar o cadastro` : "✓ Cadastro completo"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {checklist.map((c) => (
                  <span key={c.label} style={{
                    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
                    padding: "4px 10px", borderRadius: 999,
                    background: c.ok ? "#dcfce7" : "#ffedd5", color: c.ok ? "#166534" : "#9a3412",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                  }}>
                    {c.ok ? "✓" : "⚠"} {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {codigoOmie && (
            <>
              <SecaoCard titulo="📍 Onde fica a propriedade" badge="grava no Omie" cor={cor}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <Campo label="Endereço" alerta={vazio(cad.endereco)}><input value={cad.endereco} onChange={(e) => updCad("endereco", e.target.value)} style={vazio(cad.endereco) ? inpAlerta : inp} placeholder="Fazenda / logradouro" /></Campo>
                  <Campo label="Número"><input value={cad.numero} onChange={(e) => updCad("numero", e.target.value)} style={inp} placeholder="S/N" /></Campo>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Campo label="Bairro / referência"><input value={cad.bairro} onChange={(e) => updCad("bairro", e.target.value)} style={inp} /></Campo>
                  <Campo label="Complemento"><input value={cad.complemento} onChange={(e) => updCad("complemento", e.target.value)} style={inp} /></Campo>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <Campo label="Cidade" alerta={vazio(cad.cidade)}><input value={cad.cidade} onChange={(e) => updCad("cidade", e.target.value)} style={vazio(cad.cidade) ? inpAlerta : inp} /></Campo>
                  <Campo label="UF"><input value={cad.estado} maxLength={2} onChange={(e) => updCad("estado", e.target.value.toUpperCase())} style={inp} /></Campo>
                  <Campo label="CEP"><input value={cad.cep} onChange={(e) => updCad("cep", e.target.value)} style={inp} /></Campo>
                </div>

                {temLocal ? (
                  <div style={mapaOkPill}>✓ Localização marcada — arraste o pino ou ajuste lat/long se precisar.</div>
                ) : (
                  <div style={mapaCta}>📍 Marque onde fica a propriedade: <strong>clique no mapa</strong> ou preencha lat/long abaixo.</div>
                )}
                <div style={{ marginTop: 8 }}>
                  <MapaPropriedade lat={lat} lng={lng} onChange={setCoords} cor={cor} height={220} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  <Campo label="Latitude" alerta={lat == null}><input value={latStr} onChange={(e) => onCoordInput("lat", e.target.value)} inputMode="decimal" placeholder="-23.200000" style={lat == null ? inpAlerta : inp} /></Campo>
                  <Campo label="Longitude" alerta={lng == null}><input value={lngStr} onChange={(e) => onCoordInput("lng", e.target.value)} inputMode="decimal" placeholder="-49.370000" style={lng == null ? inpAlerta : inp} /></Campo>
                </div>
                {rowId == null && temLocal && (
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 4, fontStyle: "italic" }}>
                    Este cliente não tem registro no mapa do Portal — a localização não poderá ser salva.
                  </div>
                )}
              </SecaoCard>

              <SecaoCard titulo="📞 Contatos" badge="grava no Omie" cor={cor}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Campo label="Telefone 1" alerta={!temTelefone}><input value={cad.telefone1} onChange={(e) => updCad("telefone1", e.target.value)} style={!temTelefone ? inpAlerta : inp} placeholder="(14) 99999-9999" /></Campo>
                  <Campo label="Telefone 2"><input value={cad.telefone2} onChange={(e) => updCad("telefone2", e.target.value)} style={inp} /></Campo>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Campo label="Fax"><input value={cad.fax} onChange={(e) => updCad("fax", e.target.value)} style={inp} /></Campo>
                  <Campo label="E-mail" alerta={vazio(cad.email)}><input value={cad.email} onChange={(e) => updCad("email", e.target.value)} style={vazio(cad.email) ? inpAlerta : inp} placeholder="cliente@email.com" /></Campo>
                </div>
              </SecaoCard>
            </>
          )}

          <SecaoCard titulo="🏷️ Tags do cliente" badge={codigoOmie ? "Omie + Portal" : "Portal"} cor={cor}>
            <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginBottom: 10 }}>Marque o perfil/segmento, crie uma tag nova, ou clique no × pra excluir uma tag criada.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TAGS_CLIENTE.map((t) => renderTagPill(t.tag, t.label, t.cor))}
              {extrasTags.map((t) => renderTagPill(t, t, "#475569", () => removerExtra(t)))}
            </div>

            {/* Criar nova tag */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarTag(); } }}
                placeholder="Criar tag (ex: Soja, Construtora, Revenda…)"
                style={inp}
              />
              <button type="button" onClick={adicionarTag} disabled={!novaTag.trim()}
                style={{ ...btnAddTag, background: cor, opacity: novaTag.trim() ? 1 : 0.5, cursor: novaTag.trim() ? "pointer" : "default" }}>
                Adicionar
              </button>
            </div>

            {tags.includes(TAG_NAO_CONTATAR) && (
              <div style={{ fontSize: 12, color: "#991b1b", marginTop: 10, fontWeight: 700 }}>💀 Cliente marcado como “não contatar”.</div>
            )}
          </SecaoCard>

          {/* Status / ação de salvar os dados do cliente */}
          <div style={salvarBar}>
            <span style={{ fontSize: 12, fontWeight: 600, color: msg ? (msg.tipo === "ok" ? "#065f46" : "#991b1b") : "var(--portal-text-muted)" }}>
              {msg ? `${msg.tipo === "ok" ? "✓" : "⚠"} ${msg.texto}` : (algoMudou ? "Alterações não salvas." : "Tudo salvo.")}
            </span>
            {mostrarBotaoSalvar && (
              <button onClick={() => void salvar()} disabled={salvando || !algoMudou}
                style={{ ...btnSalvar, background: cor, opacity: salvando || !algoMudou ? 0.5 : 1, cursor: salvando || !algoMudou ? "default" : "pointer" }}>
                {salvando ? "Salvando…" : "Salvar dados"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default PainelDadosCliente;

function SecaoCard({ titulo, badge, cor, children }: { titulo: string; badge?: string; cor: string; children: React.ReactNode }) {
  return (
    <section style={{ ...secaoCard, borderLeft: `4px solid ${cor}` }}>
      <div style={secaoHeader}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)" }}>{titulo}</div>
        {badge && <span style={{ ...badgeOmie, background: `${cor}1a`, color: cor }}>● {badge}</span>}
      </div>
      {children}
    </section>
  );
}
function Campo({ label, alerta, children }: { label: string; alerta?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: alerta ? "#9a3412" : "var(--portal-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        {alerta && <span style={{ fontSize: 9, fontWeight: 800, color: "#c2410c" }}>⚠ preencher</span>}
      </div>
      {children}
    </div>
  );
}

const chipOmie: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "var(--portal-bg-secondary)", color: "var(--portal-text-secondary)" };
const secaoCard: React.CSSProperties = {
  background: "#fff", border: "1px solid var(--portal-border)", borderRadius: 14,
  padding: "14px 16px", marginBottom: 14,
  boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 6px 16px -10px rgba(16,24,40,0.12)",
};
const secaoHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 };
const badgeOmie: React.CSSProperties = { fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap" };
const checklistWrap: React.CSSProperties = { border: "1.5px solid", borderRadius: 12, padding: "12px 14px", marginBottom: 14 };
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)", fontFamily: "Inter, sans-serif", outline: "none",
};
const inpAlerta: React.CSSProperties = { ...inp, border: "1.5px solid #fb923c", background: "#fff7ed" };
const mapaCta: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#9a3412", background: "#fff7ed", border: "1.5px dashed #fb923c", borderRadius: 10, padding: "10px 12px", marginTop: 6 };
const mapaOkPill: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#065f46", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 12px", marginTop: 6 };
const salvarBar: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 0 4px", flexWrap: "wrap" };
const btnSalvar: React.CSSProperties = { padding: "10px 20px", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontFamily: "Inter, sans-serif" };
const btnAddTag: React.CSSProperties = { padding: "9px 16px", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "Inter, sans-serif" };
const erroBox: React.CSSProperties = { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14 };
const avisoBox: React.CSSProperties = { background: "#fef3c7", color: "#92400e", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14 };
