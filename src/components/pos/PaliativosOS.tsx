"use client";

// Relatórios paliativos na janela da OS (José, 05/11/2026): visitas que ajudaram o cliente mas não
// concluíram o serviço. Um cartão por paliativo + o total da OS (paliativos + relatório final),
// que é o que vai para a cobrança (lib/pos/atualizar-relatorio.ts soma os dois).
import { parseHoras } from "@/lib/pos/horas-tecnico";
import { somaPaliativos, type PaliativoOS } from "@/lib/pos/paliativos";

const COR = "#EA580C";

/** 'AAAA-MM-DD…' → 'DD/MM/AAAA'; o resto volta como veio. */
function dataBR(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || "");
}

/** horas decimais → "2h40m" (mesmo formato do relatório do técnico) */
function horasTexto(h: number): string {
  const min = Math.round(h * 60);
  if (min <= 0) return "0h";
  const hh = Math.floor(min / 60), mm = min % 60;
  return `${hh}h${mm ? `${String(mm).padStart(2, "0")}m` : ""}`;
}

const kmTexto = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const parseNum = (v: unknown) => parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

const ESTILO = `
  .pl-cab { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .pl-ico { width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center; font-size: 16px; color: ${COR}; background: color-mix(in srgb, ${COR} 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, ${COR} 18%, transparent); }
  .pl-cab b { font-size: 16px; font-weight: 500; color: var(--portal-text, #0f172a); }
  .pl-cab span { display: block; font-size: 12.5px; color: #64748b; }
  .pl-item { border: 1px solid var(--border, #e2e8f0); border-radius: 14px; background: var(--surface, #fefefe); padding: 12px 14px; margin-top: 10px; }
  .pl-topo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pl-tit { flex: 1; min-width: 180px; font-size: 14px; font-weight: 500; color: var(--portal-text, #0f172a); }
  .pl-motivo { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border-radius: 999px; font-size: 12.5px; font-weight: 500; color: #9a3412; background: #ffedd5; border: 1px solid #fed7aa; }
  .pl-pdf { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; font-weight: 500; text-decoration: none; color: #b91c1c; border: 1px solid #fecaca; background: #fff5f5; }
  .pl-pdf:hover { background: #fee2e2; }
  .pl-dias { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .pl-dia { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: #475569; font-variant-numeric: tabular-nums; }
  .pl-dia > span:first-child { min-width: 84px; color: var(--portal-text, #0f172a); }
  .pl-tot { margin-top: 8px; font-size: 13px; color: #475569; font-variant-numeric: tabular-nums; }
  .pl-tot b { font-weight: 500; color: var(--portal-text, #0f172a); }
  .pl-bloco { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--portal-bg-secondary, #f6f8f9); }
  .pl-bloco > span { display: block; font-size: 12px; color: #64748b; margin-bottom: 3px; }
  .pl-bloco > p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--portal-text, #334155); white-space: pre-wrap; }
  .pl-geral { margin-top: 12px; padding: 10px 14px; border-radius: 10px; font-size: 13px; color: #9a3412; background: color-mix(in srgb, ${COR} 7%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, ${COR} 22%, transparent); font-variant-numeric: tabular-nums; }
  .pl-geral b { font-weight: 500; }
`;

export default function PaliativosOS({ paliativos, finalHora, finalKm, temFinal, cartao }: {
  paliativos: PaliativoOS[];
  /** TotalHora / TotalKm do relatório final (Ordem_Servico_Tecnicos) */
  finalHora?: string | null;
  finalKm?: string | null;
  temFinal: boolean;
  cartao: string;
}) {
  if (!paliativos.length) return null;
  const soma = somaPaliativos(paliativos);
  const hFinal = parseHoras(finalHora), kFinal = parseNum(finalKm);
  return (
    <div className={cartao}>
      <style>{ESTILO}</style>
      <div className="pl-cab">
        <span className="pl-ico"><i className="fas fa-bandage" /></span>
        <div>
          <b>Relatórios paliativos</b>
          <span>Visitas que ajudaram o cliente mas não concluíram o serviço</span>
        </div>
      </div>
      {paliativos.map((p, i) => {
        const quando = dataBR(p.dataInicio || p.createdAt);
        const tecs = [p.tecResp1, p.tecResp2].filter(Boolean).join(" e ");
        return (
          <div key={p.id || i} className="pl-item">
            <div className="pl-topo">
              <span className="pl-tit">{[`Paliativo ${i + 1}`, quando, tecs].filter(Boolean).join(" · ")}</span>
              {p.motivo && <span className="pl-motivo"><i className="fas fa-triangle-exclamation" /> {p.motivo}</span>}
              {p.pdfUrl && <a className="pl-pdf" href={p.pdfUrl} target="_blank" rel="noopener noreferrer"><i className="fas fa-file-pdf" /> Abrir PDF</a>}
            </div>
            {p.dias.length > 0 && (
              <div className="pl-dias">
                {p.dias.map((d, k) => (
                  <div key={k} className="pl-dia">
                    <span>{dataBR(d.data)}</span>
                    {(d.horaInicio || d.horaFim) && <span>{d.horaInicio || "--:--"} – {d.horaFim || "--:--"}</span>}
                    {d.kmTotal && <span>{d.kmTotal} km</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="pl-tot">
              Total: <b>{p.totalHora || "0h"}</b> · <b>{kmTexto(parseNum(p.totalKm))}</b>
              {p.numPlaca && <> · placa {p.numPlaca}</>}
            </div>
            {p.diagnostico && <div className="pl-bloco"><span>Diagnóstico</span><p>{p.diagnostico}</p></div>}
            {p.servicoRealizado && <div className="pl-bloco"><span>Serviço realizado</span><p>{p.servicoRealizado}</p></div>}
          </div>
        );
      })}
      <div className="pl-geral">
        <i className="fas fa-calculator" /> Total da OS (paliativos{temFinal ? " + final" : ""}):{" "}
        <b>{horasTexto(soma.horas + hFinal)}</b> · <b>{kmTexto(soma.km + kFinal)}</b>
        {!temFinal && <> — o relatório final ainda não chegou</>}
      </div>
    </div>
  );
}
