'use client'

export default function MapaGeralPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="/mapa-geral/index.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="geolocation"
        title="Mapeamento Técnico"
      />
    </div>
  )
}
