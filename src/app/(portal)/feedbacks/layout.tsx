"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import FeedbackTabs from "@/components/feedbacks/FeedbackTabs";
import { podeSegmento, segmentoDaRota } from "@/lib/feedbacks/telas";

export default function FeedbacksLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname() ?? "";

  // Mesmo pattern do garantias/page.tsx: só bloqueia depois que tudo carregou.
  // Durante loading, renderiza o layout normal — evita mudar a árvore de
  // filhos entre renders, o que confunde o Router do Next.
  if (!loading && userProfile) {
    // Acesso ao módulo: precisa de 'feedbacks' OU de alguma tela.
    if (!temAcesso("feedbacks")) return <SemPermissao />;
    // Acesso à TELA pelo 1º segmento (lib/feedbacks/telas): Hoje (/feedbacks) = crm|rfm|atendimento|agenda,
    // Clientes = clientes|atendimento, Painel = relatorios, Robô = oportunidades, cockpit = atendimento.
    // A raiz sem a permissão da Hoje não bloqueia aqui: a página manda para a 1ª aba que a pessoa vê.
    const seg = segmentoDaRota(pathname);
    if (seg !== "" && !podeSegmento(pode, seg)) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "var(--portal-bg)" }}>
      <FeedbackTabs />
      <div style={{ padding: "0 clamp(10px, 2.5vw, 24px) 32px" }}>{children}</div>
    </div>
  );
}
