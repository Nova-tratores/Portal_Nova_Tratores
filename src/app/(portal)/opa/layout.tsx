// Estilo POS NewPortal em todas as abas do Opa (ver components/opa/visualOpa.ts).
import { ESTILO_OPA_VN } from '@/components/opa/visualOpa'

export default function OpaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="opa-vn">
      <style>{ESTILO_OPA_VN}</style>
      {children}
    </div>
  )
}
