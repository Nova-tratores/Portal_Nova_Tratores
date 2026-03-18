'use client'

export default function LoadingScreen({ variant = 'light', title = 'Carregando', subtitle = 'Nova Tratores' }) {
  const isDark = variant === 'dark'
  return (
    <div style={{ position: 'fixed', inset: 0, background: isDark ? '#212124' : '#f8fafc', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ color: isDark ? '#f8fafc' : '#0f172a', fontFamily: 'Montserrat, Poppins, sans-serif', fontWeight: '300', fontSize: '28px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center', lineHeight: '1.4' }}>
        {title} <br />
        <span style={{ fontWeight: '400', fontSize: '32px', color: isDark ? '#9e9e9e' : '#0ea5e9' }}>{subtitle}</span>
      </h1>
    </div>
  )
}
