"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  emoji: string;
}

const TABS: Tab[] = [
  { href: "/feedbacks/crm",            label: "CRM",            emoji: "🔴" },
  { href: "/feedbacks/rfm",            label: "RFM",            emoji: "🟡" },
  { href: "/feedbacks/clientes",       label: "Clientes",       emoji: "👥" },
  { href: "/feedbacks/relatorios",     label: "Relatórios",     emoji: "📊" },
  { href: "/feedbacks/agenda",         label: "Agenda",         emoji: "📞" },
  { href: "/feedbacks/oportunidades",  label: "Oportunidades",  emoji: "🎯" },
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
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
