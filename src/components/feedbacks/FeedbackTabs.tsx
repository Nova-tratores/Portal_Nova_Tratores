"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import styles from "./feedbacks.module.css";
import { COR_RFM } from "@/lib/feedbacks/cores";

interface Tab {
  href: string;
  label: string;
  cor: string;
}

const TABS: Tab[] = [
  { href: "/feedbacks/crm",            label: "CRM",                      cor: "#dc2626" },
  { href: "/feedbacks/rfm",            label: "RFM",                      cor: COR_RFM },
  { href: "/feedbacks/clientes",       label: "Histórico de atendimentos", cor: "#475569" },
  { href: "/feedbacks/relatorios",     label: "Relatórios",               cor: "#0369a1" },
  { href: "/feedbacks/agenda",         label: "Agenda",                   cor: "#8b5cf6" },
  { href: "/feedbacks/oportunidades",  label: "Oportunidades",            cor: "#10b981" },
];

export default function FeedbackTabs() {
  const pathname = usePathname() ?? "";
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);

  return (
    <nav className={styles.tabBar}>
      {TABS.filter((tab) => pode("feedbacks", tab.href.slice("/feedbacks/".length))).map((tab) => {
        const ativo = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${ativo ? styles.tabActive : ""}`}
            style={{ ["--fb-accent" as string]: tab.cor }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
