"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import FeedbackTabs from "@/components/feedbacks/FeedbackTabs";

export default function FeedbacksLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname() ?? "";

  // Mesmo pattern do garantias/page.tsx: só bloqueia depois que tudo carregou.
  // Durante loading, renderiza o layout normal — evita mudar a árvore de
  // filhos entre renders, o que confunde o Router do Next.
  if (!loading && userProfile) {
    // Acesso ao módulo (Home é o landing): precisa de 'feedbacks' OU de alguma tela.
    if (!temAcesso("feedbacks")) return <SemPermissao />;
    // Acesso à SUB-TELA: precisa da permissão específica (granular por tela).
    if (pathname.startsWith("/feedbacks/")) {
      const slug = pathname.slice("/feedbacks/".length).split("/")[0];
      if (!pode("feedbacks", slug)) return <SemPermissao />;
    }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "var(--portal-bg)" }}>
      <FeedbackTabs />
      <div style={{ padding: "0 24px 32px" }}>{children}</div>
    </div>
  );
}
