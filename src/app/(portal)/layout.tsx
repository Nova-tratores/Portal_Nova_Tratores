import PortalLayout from '@/components/PortalLayout'
import BugReporterChat from '@/components/BugReporterChat'
import Script from 'next/script'

export default function PortalGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PortalLayout>{children}</PortalLayout>
      {/* Apontador de Falhas */}
      <Script
        src="/bug-reporter.js"
        strategy="afterInteractive"
        data-system-name="Portal Nova Tratores"
        data-trigger="contextmenu"
        data-supabase-url={process.env.NEXT_PUBLIC_SUPABASE_URL}
        data-supabase-key={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
      />
      {/* liga o report ao chat interno do Portal */}
      <BugReporterChat />
    </>
  )
}
