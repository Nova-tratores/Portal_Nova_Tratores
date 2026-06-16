"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

const TABS: Tab[] = [
  { href: "/feedbacks/crm",            label: "CRM" },
  { href: "/feedbacks/rfm",            label: "RFM" },
  { href: "/feedbacks/clientes",       label: "Histórico de atendimentos" },
  { href: "/feedbacks/relatorios",     label: "Relatórios" },
  { href: "/feedbacks/agenda",         label: "Agenda" },
  { href: "/feedbacks/oportunidades",  label: "Oportunidades" },
];

export default function FeedbackTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        padding: "16px 24px 0",
        borderBottom: "1px solid var(--portal-border)",
        background: "var(--portal-bg-card)",
        overflowX: "auto",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {TABS.map((tab) => {
        const ativo = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "12px 18px",
              borderRadius: "10px 10px 0 0",
              fontSize: 14,
              fontWeight: ativo ? 700 : 500,
              color: ativo ? "#dc2626" : "var(--portal-text-secondary)",
              background: ativo ? "var(--portal-bg-card)" : "transparent",
              borderBottom: ativo ? "3px solid #dc2626" : "3px solid transparent",
              textDecoration: "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
