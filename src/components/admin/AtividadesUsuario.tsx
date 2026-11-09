'use client'
// Atividades do usuário (audit_log) — antes era uma janela lateral que abria ao clicar
// no nome no /admin; virou aba do modal de acessos (José, 09/11/2026).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Activity, ChevronDown, ChevronUp, ClipboardList, DollarSign, FileText, Settings, Shield, Wrench } from 'lucide-react'

interface AuditEntry {
  id: number
  sistema: string
  acao: string
  entidade_id: string | null
  entidade_label: string | null
  detalhes: Record<string, unknown>
  created_at: string
}

const SISTEMAS_MAP: Record<string, { label: string; icon: string }> = {
  revisoes: { label: 'Controle de Revisões', icon: 'wrench' },
  requisicoes: { label: 'Requisições', icon: 'clipboard' },
  pos: { label: 'Pós-Vendas (OS)', icon: 'settings' },
  ppv: { label: 'Peças (PPV)', icon: 'shield' },
  financeiro: { label: 'Financeiro', icon: 'dollar' },
  propostas: { label: 'Proposta Comercial', icon: 'file' },
  garantias: { label: 'Garantias', icon: 'shield' },
  mecanicos: { label: 'Gestão Pós Vendas', icon: 'wrench' },
  orcamentos: { label: 'Orçamentos', icon: 'file' },
  tarefas: { label: 'Tarefas', icon: 'clipboard' },
  admin: { label: 'Administração', icon: 'shield' },
  frota: { label: 'Frota', icon: 'settings' },
}

const ICONES: Record<string, React.ReactNode> = {
  wrench: <Wrench size={16} />, clipboard: <ClipboardList size={16} />, settings: <Settings size={16} />,
  shield: <Shield size={16} />, dollar: <DollarSign size={16} />, file: <FileText size={16} />,
}

const ACAO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  criar: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  editar: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  deletar: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  visualizar: { bg: '#f5f5f5', text: '#737373', border: '#e5e5e5' },
  enviar_email: { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
  mover_status: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  upload: { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
  acesso: { bg: '#f5f5f5', text: '#a3a3a3', border: '#e5e5e5' },
  enviar_omie: { bg: '#eef2ff', text: '#4f46e5', border: '#c7d2fe' },
  adicionar_item: { bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' },
  devolver: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
}

const ACAO_LABELS: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', deletar: 'Deletou', visualizar: 'Visualizou',
  enviar_email: 'Enviou email', mover_status: 'Moveu status', upload: 'Fez upload',
  acesso: 'Acessou', enviar_omie: 'Enviou p/ Omie', adicionar_item: 'Adicionou item',
  devolver: 'Devolveu',
}

const dataHora = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
function relativo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  if (h < 24) return `${h}h atrás`
  if (d < 7) return `${d}d atrás`
  return dataHora(iso)
}

export default function AtividadesUsuario({ userId, qtdModulos }: { userId: string; qtdModulos: number }) {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    supabase.from('audit_log').select('id, sistema, acao, entidade_id, entidade_label, detalhes, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => { if (vivo) { setLogs((data as AuditEntry[]) || []); setCarregando(false) } })
    return () => { vivo = false }
  }, [userId])

  const porSistema: Record<string, AuditEntry[]> = {}
  for (const l of logs) (porSistema[l.sistema || 'outros'] ||= []).push(l)
  const sistemas = Object.entries(porSistema).sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="au">
      <style>{ESTILO}</style>
      <div className="au-numeros">
        <div><small>Total de ações</small><b>{carregando ? '…' : logs.length}{logs.length === 500 ? '+' : ''}</b></div>
        <div><small>Módulos liberados</small><b>{qtdModulos}</b></div>
        <div><small>Última ação</small><b className="pq">{carregando ? '…' : logs[0] ? relativo(logs[0].created_at) : '—'}</b></div>
      </div>

      {carregando ? <p className="au-vazio">Carregando…</p> : !logs.length ? (
        <p className="au-vazio"><Activity size={30} />Nenhuma atividade registrada</p>
      ) : (
        <div className="au-lista">
          {sistemas.map(([k, ls]) => {
            const info = SISTEMAS_MAP[k] || { label: k, icon: 'settings' }
            const ab = aberto === k
            return (
              <div key={k} className="au-sis">
                <button type="button" className={`au-cab ${ab ? 'on' : ''}`} onClick={() => setAberto(ab ? null : k)}>
                  <span className="au-ic">{ICONES[info.icon] || <Activity size={16} />}</span>
                  <span className="au-nome">{info.label}</span>
                  <span className="au-qtd">{ls.length}</span>
                  {ab ? <ChevronUp size={16} color="#a3a3a3" /> : <ChevronDown size={16} color="#a3a3a3" />}
                </button>
                {ab && (
                  <div className="au-itens">
                    {ls.slice(0, 50).map((e) => {
                      const cor = ACAO_COLORS[e.acao] || ACAO_COLORS.acesso
                      const det = e.detalhes && Object.keys(e.detalhes).length
                        ? Object.entries(e.detalhes).map(([dk, v]) => `${({ campo: 'Campo', de: 'De', para: 'Para', status: 'Status' } as Record<string, string>)[dk] || dk}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
                        : null
                      return (
                        <div key={e.id} className="au-item">
                          <span className="au-hora">{dataHora(e.created_at)}</span>
                          <span className="au-acao" style={{ background: cor.bg, color: cor.text, borderColor: cor.border }}>{ACAO_LABELS[e.acao] || e.acao}</span>
                          <span className="au-tx">
                            {e.entidade_label ? <b>{e.entidade_label}{e.entidade_id && <em> #{e.entidade_id}</em>}</b> : e.entidade_id ? <em>ID: {e.entidade_id}</em> : null}
                            {det && <small>{det}</small>}
                          </span>
                        </div>
                      )
                    })}
                    {ls.length > 50 && <p className="au-mais">Mostrando 50 de {ls.length} atividades</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ESTILO = `
.au { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 980px; min-width: 0 }
.au-numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 10px }
.au-numeros > div { border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px 14px; display: grid; gap: 2px; background: #fefefe }
.au-numeros small { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8 }
.au-numeros b { font-size: 20px; font-weight: 600; color: #0f172a } .au-numeros b.pq { font-size: 15px }
.au-vazio { display: grid; justify-items: center; gap: 8px; padding: 50px 0; color: #a3a3a3; font-size: 14px; margin: 0 }
.au-lista { display: grid; gap: 10px }
.au-sis { border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #fefefe }
.au-cab { width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 16px; border: none; background: none; cursor: pointer; font-family: inherit; min-height: 44px }
.au-cab.on { background: #f8fafc } .au-ic { color: #dc2626; display: flex }
.au-nome { flex: 1; text-align: left; font-size: 14px; font-weight: 600; color: #0f172a }
.au-qtd { padding: 2px 10px; border-radius: 8px; background: #fef2f2; color: #dc2626; font-size: 12px; font-weight: 600 }
.au-itens { border-top: 1px solid #eef2f7 }
.au-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 16px; border-bottom: 1px solid #f5f5f5; flex-wrap: wrap }
.au-hora { width: 92px; flex-shrink: 0; font-size: 11.5px; color: #94a3b8; padding-top: 2px }
.au-acao { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 6px; border: 1px solid; white-space: nowrap; flex-shrink: 0 }
.au-tx { flex: 1; min-width: 160px; display: grid; gap: 2px } .au-tx b { font-size: 13px; font-weight: 500; color: #0f172a; overflow-wrap: anywhere }
.au-tx em { font-style: normal; color: #a3a3a3; font-weight: 400 } .au-tx small { font-size: 11.5px; color: #94a3b8; overflow-wrap: anywhere }
.au-mais { margin: 0; padding: 10px; text-align: center; font-size: 12px; color: #a3a3a3; background: #fafafa }
`
