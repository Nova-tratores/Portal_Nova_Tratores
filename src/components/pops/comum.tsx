'use client'
// POPs — peças compartilhadas pelas telas. Estilos e chamada autenticada são os
// mesmos das Reuniões (Central de Trabalho) — reaproveitados, não copiados.
import { ESTADO_INFO, type EstadoVersao } from '@/lib/pops/regras'
import { chip } from '@/components/reunioes/comum'

export { chamar, cartao, campo, rotulo, botao, botaoClaro, chip, Modal, br, primeiroNome } from '@/components/reunioes/comum'

export const COR_POPS = '#0f766e'
export const FUNDO_POPS = 'rgba(15,118,110,.10)'

export interface UsuarioMapa { [id: string]: { id: string; nome: string; avatar_url?: string | null } }

export interface PopLista {
  id: string
  codigo: string
  titulo: string
  area_id: string
  dono_id: string
  eh_template: boolean
  template_tipo: 'sistema' | 'empresa' | null
  arquivado: boolean
  proxima_revisao_em: string | null
  origem_template_id: string | null
  publicada: { id: string; numero: number } | null
  edicao: { id: string; numero: number; estado: EstadoVersao } | null
  revisao_vencida: boolean
  etiquetas?: string[]   // ausente sem a migration pops-04
}

export interface Area { id: string; sigla: string; nome: string; ativo: boolean }
export interface PapelArea { area_id: string; user_id: string; papel: 'dono' | 'aprovador' }
export interface AreasResp {
  areas: Area[]
  papeis: PapelArea[]
  usuarios: UsuarioMapa
  eu: { admin: boolean; papeis: { area_id: string; papel: 'dono' | 'aprovador' }[] }
}

export function EstadoChip({ estado, numero }: { estado: EstadoVersao; numero?: number }) {
  const i = ESTADO_INFO[estado]
  return (
    <span style={chip(i.cor, `${i.cor}1f`)}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: i.cor }} />
      {numero !== undefined ? `v${numero} · ` : ''}{i.label}
    </span>
  )
}

// Áreas em que posso CRIAR/duplicar (dono da área ou admin do módulo).
export const areasQuePossoCriar = (r: AreasResp | null) =>
  !r ? [] : r.areas.filter((a) => a.ativo && (r.eu.admin || r.eu.papeis.some((p) => p.area_id === a.id && p.papel === 'dono')))

export const vazio: React.CSSProperties = {
  padding: '36px 16px', textAlign: 'center', color: 'var(--portal-text-muted,#888)', fontSize: 14,
  border: '1px dashed var(--portal-border,#e5e7eb)', borderRadius: 14,
}
export const pagina: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '18px 16px 60px' }
