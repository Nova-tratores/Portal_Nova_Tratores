import PortalLayout from '@/components/PortalLayout'

export default function PortalGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PortalLayout>{children}</PortalLayout>
}
