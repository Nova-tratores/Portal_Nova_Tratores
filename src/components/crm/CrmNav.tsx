'use client';
// Faixa do módulo CRM (DEMONSTRAÇÃO) — verde-escuro, guias estilo Chrome,
// mesmo esquema das faixas Peças/Serviços/Frota/Financeiro.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { label: 'A Ideia', href: '/crm' },
  { label: 'Roteiro do Dia', href: '/crm/roteiro' },
  { label: 'Funil', href: '/crm/funil' },
  { label: 'Estoque (Desova)', href: '/crm/estoque' },
  { label: 'Atendimento', href: '/crm/atendimento' },
  { label: 'Painel do Gestor', href: '/crm/painel' },
];

export default function CrmNav() {
  const pathname = usePathname() ?? '';
  return (
    <div
      className="print:hidden"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        padding: '12px 16px 0',
        background: 'linear-gradient(135deg, #2FA37C, #12463C)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {ABAS.map((a) => {
        const ativo = a.href === '/crm' ? pathname === '/crm' : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 18px',
              fontSize: 14.5,
              fontWeight: ativo ? 700 : 600,
              color: '#111111',
              background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)',
              borderRadius: '11px 11px 0 0',
              boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
              textDecoration: 'none',
              transition: '0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {a.label}
          </Link>
        );
      })}
      <span
        style={{
          marginLeft: 'auto',
          alignSelf: 'center',
          flexShrink: 0,
          padding: '4px 12px',
          marginBottom: 10,
          borderRadius: 99,
          background: '#FDE047',
          color: '#111111',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.5,
        }}
      >
        DEMONSTRAÇÃO — dados de exemplo
      </span>
    </div>
  );
}
