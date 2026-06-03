'use client'

export default function DashboardAgroPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://dashboard-agro-sp-production.up.railway.app/"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Dashboard Agro"
      />
    </div>
  )
}
