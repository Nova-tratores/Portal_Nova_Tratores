'use client'

function Pulse({ style }) {
  return <div style={{ background: '#e2e8f0', borderRadius: '8px', animation: 'skeletonPulse 1.5s ease-in-out infinite', ...style }} />
}

function PulseDark({ style }) {
  return <div style={{ background: '#3f3f44', borderRadius: '8px', animation: 'skeletonPulse 1.5s ease-in-out infinite', ...style }} />
}

export function CardSkeleton({ dark = false }) {
  const P = dark ? PulseDark : Pulse
  return (
    <div style={{ background: dark ? '#313134' : '#fff', border: `1px solid ${dark ? '#55555a' : '#e2e8f0'}`, borderRadius: '20px', overflow: 'hidden' }}>
      <div style={{ padding: '24px' }}>
        <P style={{ height: '20px', width: '70%', marginBottom: '12px' }} />
        <P style={{ height: '14px', width: '40%' }} />
      </div>
      <div style={{ padding: '24px', background: dark ? '#4e4e52' : '#f8fafc' }}>
        <P style={{ height: '14px', width: '50%', marginBottom: '12px' }} />
        <P style={{ height: '32px', width: '60%', marginBottom: '8px' }} />
        <P style={{ height: '14px', width: '45%' }} />
      </div>
    </div>
  )
}

export function KanbanColumnSkeleton({ dark = true }) {
  const P = dark ? PulseDark : Pulse
  return (
    <div style={{ minWidth: '420px', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <P style={{ height: '56px', borderRadius: '16px', marginBottom: '25px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {[1, 2, 3].map(i => <CardSkeleton key={i} dark={dark} />)}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, dark = false }) {
  const P = dark ? PulseDark : Pulse
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <P style={{ height: '48px', borderRadius: '12px' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0' }}>
          <P style={{ height: '18px', flex: 2 }} />
          <P style={{ height: '18px', flex: 1 }} />
          <P style={{ height: '18px', flex: 1 }} />
          <P style={{ height: '18px', flex: 1 }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStyles() {
  return (
    <style jsx global>{`
      @keyframes skeletonPulse {
        0% { opacity: 1; }
        50% { opacity: 0.4; }
        100% { opacity: 1; }
      }
    `}</style>
  )
}
