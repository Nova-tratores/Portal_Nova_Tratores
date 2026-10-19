"use client";
// Máquinas do cliente EM DESTAQUE na criação da OS: assim que o cliente é
// escolhido, aparecem os tratores do CPF/CNPJ (mesma rota do ícone de trator,
// /api/clientes/maquinas — projetos da Pasta Clientes, Nova + Castro). Clicar
// num card já põe a máquina na OS (Projeto/Equipamento + Modelo/Chassis da
// descrição).
import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";

export interface MaquinaCliente {
  projeto: string;
  modelo: string;
  chassis: string;
  empresa: string;
  os_total?: number;
  ultima_revisao?: { horas: string; data: string } | null;
  ultimo_servico?: { num_os: string; data: string; resumo: string } | null;
}

const cache = new Map<string, MaquinaCliente[]>();

function dataBR(s?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

interface Props {
  doc?: string | null;
  selecionado: string;
  onEscolher: (m: MaquinaCliente) => void;
  onBuscarOutra: () => void;
  onNova?: () => void;
}

export default function MaquinasClienteDestaque({ doc, selecionado, onEscolher, onBuscarOutra, onNova }: Props) {
  const documento = String(doc || "").trim();
  // Resultado guardado junto com o documento: trocou de cliente, o antigo não vale
  const [res, setRes] = useState<{ doc: string; lista: MaquinaCliente[]; erro: boolean } | null>(null);
  const maquinas = cache.get(documento) ?? (res?.doc === documento ? res.lista : null);
  const erro = res?.doc === documento && res.erro;

  useEffect(() => {
    if (!documento || cache.has(documento)) return;
    let vivo = true;
    fetchAuth(`/api/clientes/maquinas?doc=${encodeURIComponent(documento)}`)
      .then((r) => r.json())
      .then((j) => {
        const lista: MaquinaCliente[] = Array.isArray(j.maquinas) ? j.maquinas : [];
        // Mais recentes primeiro (último serviço), sem data por último
        lista.sort((a, b) => String(b.ultimo_servico?.data || "").localeCompare(String(a.ultimo_servico?.data || "")));
        cache.set(documento, lista);
        if (vivo) setRes({ doc: documento, lista, erro: false });
      })
      .catch(() => { if (vivo) setRes({ doc: documento, lista: [], erro: true }); });
    return () => { vivo = false; };
  }, [documento]);

  const sel = selecionado.trim().toUpperCase();

  return (
    <div className="mcd">
      <style>{`
        .mcd { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(56,189,248,.10), rgba(3,105,161,.06));
          border: 1.5px solid rgba(3,105,161,.28); animation: mcd-entra .28s ease-out; }
        @keyframes mcd-entra { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        .mcd-topo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .mcd-titulo { font-size: 13px; font-weight: 800; color: #0369A1; text-transform: uppercase; letter-spacing: .5px; display: inline-flex; align-items: center; gap: 7px; }
        .mcd-conta { background: #0369A1; color: #fefefe; border-radius: 10px; padding: 1px 8px; font-size: 11.5px; font-weight: 800; }
        .mcd-dica { font-size: 12px; color: var(--portal-text-secondary); }
        .mcd-acoes { margin-left: auto; display: flex; gap: 6px; }
        .mcd-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); transition: border-color .15s, transform .15s; }
        .mcd-btn:hover { border-color: #0369A1; transform: translateY(-1px); }
        .mcd-btn.nova { border-style: dashed; border-color: #059669; color: #047857; }
        .mcd-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
        .mcd-card { position: relative; text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 12px 13px 11px;
          border-radius: 11px; border: 1.5px solid var(--portal-border); background: var(--portal-bg-card); cursor: pointer;
          font-family: inherit; color: var(--portal-text); transition: transform .15s, box-shadow .15s, border-color .15s; }
        .mcd-card:hover { transform: translateY(-2px); border-color: #38BDF8; box-shadow: 0 8px 22px rgba(3,105,161,.16); }
        .mcd-card.on { border-color: #0369A1; box-shadow: 0 0 0 3px rgba(56,189,248,.35), 0 8px 22px rgba(3,105,161,.18); }
        .mcd-linha1 { display: flex; align-items: center; gap: 9px; }
        .mcd-icone { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(3,105,161,.12); color: #0369A1; font-size: 15px; }
        .mcd-card.on .mcd-icone { background: #0369A1; color: #fefefe; }
        .mcd-modelo { font-size: 15px; font-weight: 800; line-height: 1.15; }
        .mcd-chassi { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--portal-text-secondary); letter-spacing: .3px; word-break: break-all; }
        .mcd-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .mcd-chip { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); border: 1px solid var(--portal-border); }
        .mcd-chip.rev { color: #0E7490; border-color: rgba(8,145,178,.35); background: rgba(8,145,178,.08); }
        .mcd-ok { position: absolute; top: 8px; right: 9px; font-size: 11px; font-weight: 800; color: #0369A1; display: inline-flex; align-items: center; gap: 4px; }
        .mcd-usar { position: absolute; top: 9px; right: 10px; font-size: 11px; font-weight: 700; color: #38BDF8; opacity: 0; transition: opacity .15s; }
        .mcd-card:hover .mcd-usar { opacity: 1; }
        .mcd-esqueleto { height: 92px; border-radius: 11px; background: linear-gradient(90deg, var(--portal-bg-secondary) 25%, var(--portal-border) 50%, var(--portal-bg-secondary) 75%); background-size: 200% 100%; animation: mcd-brilho 1.1s infinite linear; }
        @keyframes mcd-brilho { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .mcd-vazio { font-size: 13px; color: var(--portal-text-secondary); padding: 6px 2px; }
      `}</style>

      <div className="mcd-topo">
        <span className="mcd-titulo">
          <i className="fas fa-tractor" /> Máquinas deste cliente
          {maquinas && maquinas.length > 0 && <span className="mcd-conta">{maquinas.length}</span>}
        </span>
        {maquinas && maquinas.length > 0 && <span className="mcd-dica">Clique na máquina do serviço</span>}
        <div className="mcd-acoes">
          <button type="button" className="mcd-btn" onClick={onBuscarOutra}><i className="fas fa-search" /> Outra máquina</button>
          {onNova && <button type="button" className="mcd-btn nova" onClick={onNova}><i className="fas fa-plus" /> Nova</button>}
        </div>
      </div>

      {!documento ? (
        <div className="mcd-vazio">Cliente sem CPF/CNPJ no cadastro — use “Outra máquina” para pesquisar.</div>
      ) : maquinas === null ? (
        <div className="mcd-grade"><div className="mcd-esqueleto" /><div className="mcd-esqueleto" /></div>
      ) : maquinas.length === 0 ? (
        <div className="mcd-vazio">
          {erro ? "Não consegui buscar as máquinas agora." : "Nenhuma máquina registrada para este CPF/CNPJ."} Use “Outra máquina” ou cadastre uma nova.
        </div>
      ) : (
        <div className="mcd-grade">
          {maquinas.map((m, i) => {
            const on = !!sel && sel === String(m.projeto || "").trim().toUpperCase();
            const ultData = dataBR(m.ultimo_servico?.data);
            return (
              <button type="button" key={`${m.projeto}-${m.empresa}-${i}`} className={`mcd-card${on ? " on" : ""}`}
                onClick={() => onEscolher(m)} title={m.ultimo_servico?.resumo ? `Último serviço: ${m.ultimo_servico.resumo}` : m.projeto}>
                {on ? <span className="mcd-ok"><i className="fas fa-check-circle" /> Na OS</span> : <span className="mcd-usar">Usar →</span>}
                <div className="mcd-linha1">
                  <span className="mcd-icone"><i className="fas fa-tractor" /></span>
                  <span className="mcd-modelo">{m.modelo || "Máquina"}</span>
                </div>
                <span className="mcd-chassi">{m.chassis || "sem chassi"}</span>
                <div className="mcd-chips">
                  {m.ultima_revisao?.horas && <span className="mcd-chip rev">rev. {m.ultima_revisao.horas}h</span>}
                  {ultData && <span className="mcd-chip">último serviço {ultData}</span>}
                  {!!m.os_total && <span className="mcd-chip">{m.os_total} OS</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
