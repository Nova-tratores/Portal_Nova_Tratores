'use client'
import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useAuditLog } from '@/hooks/useAuditLog'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, RefreshCw, Factory, Users, FileDown } from 'lucide-react'
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

  const convertToCli = (data) => {
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
  ]

  return (
    <div className="w-full bg-zinc-50 min-h-screen pb-20">
      {/* HEADER */}
      <div className="w-full px-6 pt-6 pb-2">
        <div className="max-w-7xl mx-auto">
          {/* TABS */}
          <div className="flex items-center gap-1 mb-4">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border-none cursor-pointer ${view === tab.id ? 'bg-red-600 text-white' : 'bg-white text-zinc-500 hover:bg-zinc-100 border border-zinc-200'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* BARRA DE ACOES */}
          <div className="bg-white border border-zinc-200 p-3 rounded-xl">
            <div className="flex items-center gap-2 flex-wrap">
              {/* CADASTROS */}
              <div className="flex items-center gap-1.5 border-r border-zinc-200 pr-3 mr-1">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mr-1">Cadastrar:</span>
                <button onClick={() => setModals({ ...modals, client: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-50 text-zinc-600 text-xs font-semibold border border-zinc-200 hover:bg-zinc-100 cursor-pointer transition-all"><Plus size={12} /> Cliente</button>
                <button onClick={() => setModals({ ...modals, trator: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-50 text-zinc-600 text-xs font-semibold border border-zinc-200 hover:bg-zinc-100 cursor-pointer transition-all"><Plus size={12} /> Trator</button>
                <button onClick={() => setModals({ ...modals, equip: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-50 text-zinc-600 text-xs font-semibold border border-zinc-200 hover:bg-zinc-100 cursor-pointer transition-all"><Plus size={12} /> Implemento</button>
              </div>

              {/* EDITAR */}
              <div className="flex items-center gap-1.5 border-r border-zinc-200 pr-3 mr-1">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mr-1">Editar:</span>
                <button onClick={() => setModals({ ...modals, searchEditClient: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 text-white text-xs font-semibold border-none hover:bg-zinc-700 cursor-pointer transition-all"><Pencil size={11} /> Cliente</button>
                <button onClick={() => setModals({ ...modals, searchEditTrator: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 text-white text-xs font-semibold border-none hover:bg-zinc-700 cursor-pointer transition-all"><Pencil size={11} /> Trator</button>
                <button onClick={() => setModals({ ...modals, searchEditEquip: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 text-white text-xs font-semibold border-none hover:bg-zinc-700 cursor-pointer transition-all"><Pencil size={11} /> Implemento</button>
              </div>

              {/* UTILITARIOS */}
              <button onClick={() => setModals({ ...modals, trash: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-50 text-zinc-500 text-xs font-semibold border border-zinc-200 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-all"><Trash2 size={12} /> Lixeira</button>
              <button onClick={handleSyncOmie} disabled={syncing} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 hover:bg-amber-100 cursor-pointer transition-all disabled:opacity-50"><RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sync Omie'}</button>

              {/* RELATORIO */}
              <button onClick={handleRelatorio} disabled={gerando} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100 cursor-pointer transition-all disabled:opacity-50">
                <FileDown size={12} className={gerando ? 'animate-bounce' : ''} /> {gerando ? 'Gerando...' : 'Relatorio Abertos'}
              </button>

              {/* BOTAO PRINCIPAL */}
              <button onClick={() => view === 'fabrica' ? setModals({ ...modals, newFab: true }) : setModals({ ...modals, newCli: true })}
                className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold border-none hover:bg-red-700 cursor-pointer transition-all">
                <Plus size={14} /> {view === 'fabrica' ? 'Novo Pedido' : 'Nova Proposta'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTEUDO */}
      <div className="px-6 mt-4 max-w-7xl mx-auto">
        {view === 'fabrica' ? (
          <FactoryKanban onCardClick={(p) => handleCardClick(p, 'fab')} />
        ) : (
          <Kanban onCardClick={(p) => handleCardClick(p, 'cli')} />
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
      {modals.trash && <Lixeira onClose={() => setModals({ ...modals, trash: false })} />}
    </div>
  )
}

export default function PropostaComercialPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('propostas')) return <SemPermissao />;
  return <PropostaComercialPageInner />;
}
