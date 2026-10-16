"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
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
  { href: "/feedbacks/atendimento",    label: "Atendimento",              cor: "#d97706" },
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
  // celular: a faixa rola de lado — leva a aba ativa para o meio (ex.: Agenda ficava escondida à direita)
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = navRef.current;
    const a = n?.querySelector<HTMLElement>("[data-ativo='1']");
    if (n && a && n.scrollWidth > n.clientWidth) n.scrollLeft = a.offsetLeft - n.offsetLeft - (n.clientWidth - a.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav ref={navRef} className={styles.tabBar}>
      {TABS.filter((tab) => pode("feedbacks", tab.href.slice("/feedbacks/".length))).map((tab) => {
        const ativo = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-ativo={ativo ? "1" : undefined}
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
