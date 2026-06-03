'use client'

export default function VisualEstoquePage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://estoque.novatratores.com"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Visual Estoque"
      />
    </div>
  )
}
