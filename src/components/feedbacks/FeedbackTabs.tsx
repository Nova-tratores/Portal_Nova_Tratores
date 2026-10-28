"use client";
// Faixa do módulo Feedbacks (redesenho "Caminho B", José 23/10/2026): guias estilo Chrome na
// faixa vermelha do módulo — Hoje · Clientes · Painel · Robô (docs/padrao-telas.md §2 e §3:
// sem título ao lado das guias). As telas antigas (CRM, RFM, Agenda, Atendimento, Relatórios,
// Oportunidades) redirecionam para estas; a guia acesa vem de abaDaRota (lib/feedbacks/telas).
// Mostra só o que a pessoa pode ver (mesma regra do layout).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { abaDaRota, abasVisiveis } from "@/lib/feedbacks/telas";

const ESTILO = `
.fbt-faixa { display: flex; align-items: flex-end; gap: 3px; padding: 10px clamp(10px, 2.5vw, 24px) 0; background: linear-gradient(135deg, #f87171, #991b1b);
  overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: 0 1px 4px var(--portal-shadow, rgba(0,0,0,.12)); flex-wrap: nowrap; font-family: Inter, system-ui, sans-serif }
.fbt-guia { display: inline-flex; align-items: center; gap: 8px; padding: 11px 22px; font-size: 14.5px; font-weight: 500; color: #111111; background: rgba(255,255,255,0.30);
  border-radius: 11px 11px 0 0; text-decoration: none; white-space: nowrap; flex-shrink: 0; transition: background .2s }
.fbt-guia:hover { background: rgba(255,255,255,0.45) }
.fbt-guia.on { background: #fefefe; box-shadow: 0 -2px 6px rgba(0,0,0,0.15) }
.fbt-guia i { font-size: 13px }
@media (max-width: 640px) { .fbt-faixa { padding: 8px 12px 0 } .fbt-guia { padding: 10px 14px; font-size: 13.5px } }
`;

export default function FeedbackTabs() {
  const pathname = usePathname() ?? "";
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const ativa = abaDaRota(pathname);
  const abas = loading ? [] : abasVisiveis(pode);

  return (
    <>
      <style>{ESTILO}</style>
      <nav className="fbt-faixa" aria-label="Telas do Feedbacks">
        {abas.map((a) => (
          <Link key={a.id} href={a.href} className={`fbt-guia ${ativa === a.id ? "on" : ""}`} aria-current={ativa === a.id ? "page" : undefined}>
            <i className={`fa-solid ${a.ico}`} /> {a.rotulo}
          </Link>
        ))}
        {/* altura da faixa enquanto as permissões carregam (não pula a tela) */}
        {abas.length === 0 && <span className="fbt-guia" style={{ visibility: "hidden" }}>Hoje</span>}
      </nav>
    </>
  );
}
