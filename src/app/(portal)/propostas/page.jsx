'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useAuditLog } from '@/hooks/useAuditLog'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, RefreshCw, Factory, Users, FileDown, Menu, ChevronDown, List, LayoutGrid, Check } from 'lucide-react'
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui'
import dynamic from 'next/dynamic'

const Kanban = dynamic(() => import('@/components/propostas/Kanban'), { ssr: false })
const FactoryKanban = dynamic(() => import('@/components/propostas/FactoryKanban'), { ssr: false })
const FormModal = dynamic(() => import('@/components/propostas/FormModal'), { ssr: false })
const EditModal = dynamic(() => import('@/components/propostas/EditModal'), { ssr: false })
const FactoryFormModal = dynamic(() => import('@/components/propostas/FactoryFormModal'), { ssr: false })
const FactoryEditModal = dynamic(() => import('@/components/propostas/FactoryEditModal'), { ssr: false })
const ClientModal = dynamic(() => import('@/components/propostas/ClientModal'), { ssr: false })
const ClientEditModal = dynamic(() => import('@/components/propostas/ClientEditModal'), { ssr: false })
const EquipamentoModal = dynamic(() => import('@/components/propostas/EquipamentoModal'), { ssr: false })
const EquipamentoEditModal = dynamic(() => import('@/components/propostas/EquipamentoEditModal'), { ssr: false })
const TratorModal = dynamic(() => import('@/components/propostas/TratorModal'), { ssr: false })
const TratorEditModal = dynamic(() => import('@/components/propostas/TratorEditModal'), { ssr: false })
const Lixeira = dynamic(() => import('@/components/propostas/Lixeira'), { ssr: false })

// Parse seguro de valor monetário
function parseValor(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return val
  let str = String(val).replace(/[R$\s]/g, '').trim()
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.')
  else if (str.includes(',')) str = str.replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function formatBRL(val) {
  return parseValor(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_ABERTO_CLI = ['Enviar Proposta', 'AGUARDANDO RESPOSTA CLIENTE', 'AGUARDANDO RESPOSTA BANCO']
const STATUS_ABERTO_FAB = ['Proposta solicitada', 'Proposta Recebida', 'Pedido Feito / Aguardando Maq']

function PropostaComercialPageInner() {
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  const podeCriar = pode('propostas', 'criar')
  const podeEditar = pode('propostas', 'editar')
  const podeExcluir = pode('propostas', 'excluir')
  const podeSincronizar = pode('propostas', 'sincronizar')
  const { log } = useAuditLog()
  const [view, setView] = useState('clientes')
  const [modals, setModals] = useState({
    newFab: false, editFab: false, newCli: false, editCli: false,
    client: false, equip: false, trator: false,
    searchEditClient: false, searchEditEquip: false, searchEditTrator: false,
    trash: false
  })
  const [selected, setSelected] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuEnt, setMenuEnt] = useState(null) // entidade expandida no menu (cliente/trator/implemento)
  const [modoVisao, setModoVisao] = useState('tabela') // 'tabela' | 'kanban' (só na aba de propostas cliente)
  const menuRef = useRef(null)
  const fecharMenu = () => { setMenuOpen(false); setMenuEnt(null) }
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) fecharMenu() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const convertToCli = (data) => {
    if (!podeEditar) return
    setSelected(data)
    setModals({ ...modals, editFab: false, newCli: true })
    log({ sistema: 'Proposta Comercial', acao: 'converter', entidade: 'proposta_fabrica', entidade_id: String(data.id), entidade_label: data.cliente, detalhes: { acao: 'converter_para_cliente' } })
  }

  const handleCardClick = (p, type) => {
    setSelected(p)
    if (type === 'fab') setModals({ ...modals, editFab: true })
    else setModals({ ...modals, editCli: true })
    log({ sistema: 'Proposta Comercial', acao: 'visualizar', entidade: type === 'fab' ? 'proposta_fabrica' : 'proposta', entidade_id: String(p.id), entidade_label: p.Cliente || p.cliente })
  }

  const handleSyncOmie = async () => {
    if (!podeSincronizar) return
    setSyncing(true)
    try {
      const res = await fetch('/api/omie/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert(`Sincronizacao concluida! ${data.count} clientes atualizados.`)
        log({ sistema: 'Proposta Comercial', acao: 'sincronizar', entidade: 'clientes_omie', detalhes: { count: data.count } })
      } else { alert("Erro: " + data.error) }
    } catch (err) { alert("Erro na sincronizacao: " + err.message) }
    finally { setSyncing(false) }
  }

  // ====== RELATÓRIO PDF - PEDIDOS EM ABERTO ======
  const handleRelatorio = useCallback(async () => {
    setGerando(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const { applyPlugin } = await import('jspdf-autotable')
      applyPlugin(jsPDF)

      let dados = []
      let titulo = ''

      if (view === 'clientes') {
        const { data } = await supabase.from('Formulario').select('*').in('status', STATUS_ABERTO_CLI).order('id', { ascending: false })
        dados = (data || []).map(d => [
          `#${d.id}`,
          d.Cliente || '---',
          `${d.Marca || ''} ${d.Modelo || ''}`.trim() || '---',
          d.Cidade || '---',
          `R$ ${formatBRL(d.Valor_Total)}`,
          d.status || '---'
        ])
        titulo = 'PROPOSTAS COMERCIAIS EM ABERTO'
      } else {
        const { data } = await supabase.from('Proposta_Fabrica').select('*').in('status', STATUS_ABERTO_FAB).order('id', { ascending: false })
        dados = (data || []).map(d => [
          `#${d.id}`,
          d.cliente || '---',
          d.vendedor_fab || '---',
          `${d.marca || ''} ${d.modelo || ''}`.trim() || '---',
          d.status || '---'
        ])
        titulo = 'PEDIDOS FABRICA EM ABERTO'
      }

      if (dados.length === 0) {
        alert('Nenhum pedido em aberto encontrado.')
        setGerando(false)
        return
      }

      const doc = new jsPDF({ orientation: 'landscape' })
      const pageWidth = doc.internal.pageSize.getWidth()

      // Cabeçalho
      doc.setFillColor(220, 38, 38)
      doc.rect(0, 0, pageWidth, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('NOVA TRATORES MAQUINAS AGRICOLAS LTDA.', 14, 12)
      doc.setFontSize(8)
      doc.text(titulo, pageWidth - 14, 12, { align: 'right' })

      // Sub-header
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR')}`, 14, 26)
      doc.text(`Total: ${dados.length} registro${dados.length !== 1 ? 's' : ''}`, pageWidth - 14, 26, { align: 'right' })

      // Tabela
      const columns = view === 'clientes'
        ? ['ID', 'Cliente', 'Marca / Modelo', 'Cidade', 'Valor', 'Status']
        : ['ID', 'Cliente', 'Vendedor', 'Marca / Modelo', 'Status']

      doc.autoTable({
        startY: 32,
        head: [columns],
        body: dados,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, font: 'helvetica' },
        headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: view === 'clientes' ? {
          0: { cellWidth: 22 },
          4: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
          5: { cellWidth: 55 }
        } : {
          0: { cellWidth: 22 },
          4: { cellWidth: 60 }
        }
      })

      // Se for propostas cliente, adiciona totalização
      if (view === 'clientes') {
        const { data: raw } = await supabase.from('Formulario').select('Valor_Total').in('status', STATUS_ABERTO_CLI)
        const somaTotal = (raw || []).reduce((acc, r) => acc + parseValor(r.Valor_Total), 0)
        const finalY = doc.lastAutoTable.finalY + 8
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(220, 38, 38)
        doc.text(`VALOR TOTAL EM ABERTO: R$ ${formatBRL(somaTotal)}`, pageWidth - 14, finalY, { align: 'right' })
      }

      doc.save(`${titulo.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`)

      log({ sistema: 'Proposta Comercial', acao: 'relatorio', entidade: view === 'clientes' ? 'propostas_abertas' : 'pedidos_fabrica_abertos', detalhes: { total: dados.length } })
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar relatorio: ' + err.message)
    } finally { setGerando(false) }
  }, [view, log])

  const tabs = [
    { id: 'clientes', label: 'Propostas Cliente', icon: <Users size={14} /> },
    { id: 'fabrica', label: 'Pedidos Fabrica', icon: <Factory size={14} /> },
    ...(podeExcluir ? [{ id: 'lixeira', label: 'Lixeira', icon: <Trash2 size={14} /> }] : []),
  ]

  return (
    <div className="w-full bg-zinc-50 min-h-screen pb-20">
      <style jsx>{`
        .chrome-tabs { display: flex; align-items: flex-end; gap: 4px; padding: 0 10px; }
        .chrome-tab {
          position: relative; padding: 11px 24px 12px; border: none; cursor: pointer;
          background: #e9ecef; color: #5f6368; font-family: inherit; font-size: 14.5px; font-weight: 600;
          border-radius: 12px 12px 0 0; display: flex; align-items: center; gap: 8px; line-height: 1;
          transition: background .15s, color .15s;
        }
        .chrome-tab:hover:not(.chrome-tab-active) { background: #dfe3e8; color: #202124; }
        .chrome-tab-active { background: #ffffff; color: #dc2626; z-index: 3; }
        .chrome-tab-active::before, .chrome-tab-active::after {
          content: ""; position: absolute; bottom: 0; width: 12px; height: 12px; background: transparent; pointer-events: none;
        }
        .chrome-tab-active::before { left: -12px; border-bottom-right-radius: 12px; box-shadow: 6px 6px 0 6px #ffffff; }
        .chrome-tab-active::after  { right: -12px; border-bottom-left-radius: 12px; box-shadow: -6px 6px 0 6px #ffffff; }
        .chrome-tabs-base { height: 10px; background: #ffffff; border-radius: 10px 10px 0 0; position: relative; z-index: 2; }
      `}</style>
      {/* HEADER */}
      <div className="w-full px-6 pt-6 pb-2">
        <div className="w-full">
          {/* TABS — estilo Chrome (folder tabs) */}
          <div className="mb-4">
            <div className="chrome-tabs">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setView(tab.id)}
                  className={`chrome-tab ${view === tab.id ? 'chrome-tab-active' : ''}`}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
            <div className="chrome-tabs-base" />
          </div>

          {/* BARRA DE ACOES */}
          {view !== 'lixeira' && (
          <div className="bg-white border border-zinc-200 p-3 rounded-xl">
            <div className="flex items-center gap-2 flex-wrap">
              {/* MENU (Cadastrar/Editar + utilitários) */}
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-50 text-zinc-700 text-sm font-semibold border border-zinc-200 hover:bg-zinc-100 cursor-pointer transition-all">
                  <Menu size={18} /> Menu
                </button>
                {menuOpen && (
                  <div className="absolute left-0 top-full mt-2 z-50 w-[300px] bg-white border border-zinc-200 rounded-xl shadow-xl p-2">
                    {[
                      { key: 'cliente', label: 'Cadastrar / editar Cliente', novo: 'client', editar: 'searchEditClient' },
                      { key: 'trator', label: 'Cadastrar / editar Trator', novo: 'trator', editar: 'searchEditTrator' },
                      { key: 'implemento', label: 'Cadastrar / editar Implemento', novo: 'equip', editar: 'searchEditEquip' },
                    ].map((ent) => (
                      <div key={ent.key}>
                        <button onClick={() => setMenuEnt(menuEnt === ent.key ? null : ent.key)}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-lg text-[15px] font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer transition-all whitespace-nowrap">
                          {ent.label}
                          <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${menuEnt === ent.key ? 'rotate-180' : ''}`} />
                        </button>
                        {menuEnt === ent.key && (
                          <div className="ml-3 pl-2 border-l border-zinc-200 flex flex-col mb-1">
                            <button onClick={() => { setModals({ ...modals, [ent.novo]: true }); fecharMenu() }} disabled={!podeCriar} title={!podeCriar ? MSG_SEM_PERMISSAO : undefined}
                              className="w-full text-left px-3 py-2 rounded-lg text-[14px] text-zinc-600 hover:bg-zinc-100 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed">Cadastrar</button>
                            <button onClick={() => { setModals({ ...modals, [ent.editar]: true }); fecharMenu() }} disabled={!podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : undefined}
                              className="w-full text-left px-3 py-2 rounded-lg text-[14px] text-zinc-600 hover:bg-zinc-100 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed">Editar</button>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="my-1.5 border-t border-zinc-100" />
                    <button onClick={() => { handleSyncOmie(); fecharMenu() }} disabled={syncing || !podeSincronizar} title={!podeSincronizar ? MSG_SEM_PERMISSAO : undefined}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sync Omie'}
                    </button>
                    <button onClick={() => { handleRelatorio(); fecharMenu() }} disabled={gerando}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer transition-all disabled:opacity-50">
                      <FileDown size={15} className={gerando ? 'animate-bounce' : ''} /> {gerando ? 'Gerando...' : 'Imprimir relatório'}
                    </button>
                    {view === 'clientes' && (
                      <>
                        <div className="my-1.5 border-t border-zinc-100" />
                        <div className="px-3 py-1 text-[11px] font-bold text-zinc-400 tracking-wider">Visualização</div>
                        <button onClick={() => { setModoVisao('tabela'); fecharMenu() }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] font-medium hover:bg-zinc-100 cursor-pointer transition-all ${modoVisao === 'tabela' ? 'text-red-600' : 'text-zinc-700'}`}>
                          <List size={15} /> Em lista {modoVisao === 'tabela' && <Check size={15} className="ml-auto text-red-600" />}
                        </button>
                        <button onClick={() => { setModoVisao('kanban'); fecharMenu() }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] font-medium hover:bg-zinc-100 cursor-pointer transition-all ${modoVisao === 'kanban' ? 'text-red-600' : 'text-zinc-700'}`}>
                          <LayoutGrid size={15} /> Em kanban {modoVisao === 'kanban' && <Check size={15} className="ml-auto text-red-600" />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* BOTAO PRINCIPAL */}
              <button onClick={() => view === 'fabrica' ? setModals({ ...modals, newFab: true }) : setModals({ ...modals, newCli: true })}
                disabled={!podeCriar} title={!podeCriar ? MSG_SEM_PERMISSAO : undefined}
                className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold border-none hover:bg-red-700 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus size={14} /> {view === 'fabrica' ? 'Novo Pedido' : 'Nova Proposta'}
              </button>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* CONTEUDO */}
      <div className="px-6 mt-4 w-full">
        {view === 'lixeira' ? (
          <Lixeira embed />
        ) : view === 'fabrica' ? (
          <FactoryKanban onCardClick={(p) => handleCardClick(p, 'fab')} />
        ) : (
          <Kanban onCardClick={(p) => handleCardClick(p, 'cli')} modo={modoVisao} />
        )}
      </div>

      {/* MODAIS */}
      {modals.newFab && <FactoryFormModal onClose={() => setModals({ ...modals, newFab: false })} />}
      {modals.editFab && <FactoryEditModal order={selected} onClose={() => setModals({ ...modals, editFab: false })} onConvert={convertToCli} />}
      {modals.newCli && <FormModal initialData={selected} onClose={() => { setModals({ ...modals, newCli: false }); setSelected(null) }} />}
      {modals.editCli && <EditModal proposal={selected} onClose={() => setModals({ ...modals, editCli: false })} />}
      {modals.client && <ClientModal onClose={() => setModals({ ...modals, client: false })} />}
      {modals.trator && <TratorModal onClose={() => setModals({ ...modals, trator: false })} />}
      {modals.equip && <EquipamentoModal onClose={() => setModals({ ...modals, equip: false })} />}
      {modals.searchEditClient && <ClientEditModal onClose={() => setModals({ ...modals, searchEditClient: false })} />}
      {modals.searchEditEquip && <EquipamentoEditModal onClose={() => setModals({ ...modals, searchEditEquip: false })} />}
      {modals.searchEditTrator && <TratorEditModal onClose={() => setModals({ ...modals, searchEditTrator: false })} />}
    </div>
  )
}

export default function PropostaComercialPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('propostas')) return <SemPermissao />;
  return <PropostaComercialPageInner />;
}
