// PÁGINA DE TESTE (23/11/2026) — Mapa da empresa: fluxos com todas as decisões,
// retrabalhos e furos, levantado do código do portal. Abrir em /empresa/mapa.
// O conteúdo mora em docs/mapa-da-empresa/mapa.html (edite lá); esta página só mostra.
// Lê o arquivo do disco: funciona no `npm run dev`. Antes de ir para produção,
// trocar por um componente de verdade (o docs/ não vai junto no deploy).
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export default async function MapaDaEmpresaPage() {
  const html = await readFile(path.join(process.cwd(), 'docs', 'mapa-da-empresa', 'mapa.html'), 'utf8')
  return (
    <iframe
      title="Mapa da Nova Tratores"
      srcDoc={html}
      style={{ width: '100%', height: 'calc(100vh - 80px)', border: 0, display: 'block' }}
    />
  )
}
