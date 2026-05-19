'use client'

export default function MapaGeralPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://mapa-geral-production.up.railway.app/"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="geolocation"
        title="Mapa Geral"
      />
    </div>
  )
}
