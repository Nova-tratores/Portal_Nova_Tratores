'use client'
// Rota /ppv/etiquetas — mantida por compatibilidade (links/favoritos). A UI vive
// no componente EtiquetasPanel, que também é usado como ABA dentro do PPV.
import EtiquetasPanel from '@/components/ppv/EtiquetasPanel'

export default function EtiquetasPecasPage() {
  return <EtiquetasPanel />
}
