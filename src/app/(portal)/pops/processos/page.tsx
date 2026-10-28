'use client'
// POPs — Mapa de processos (um POP para cada processo). Ler é de todo usuário logado,
// como os POPs publicados; quem edita é decidido na rota /api/pops/processos.
import MapaProcessos from '@/components/pops/MapaProcessos'

export default function MapaProcessosPage() {
  return <MapaProcessos />
}
