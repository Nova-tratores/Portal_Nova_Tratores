'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function FormModal({ onClose, initialData }) {
  const [loading, setLoading] = useState(false)
  const [tipoMaq, setTipoMaq] = useState('implemento')
  const [temValidade, setTemValidade] = useState(true)
  const [listaClientes, setListaClientes] = useState([])
  const [listaEquipamentos, setListaEquipamentos] = useState([])
  const [listaTratores, setListaTratores] = useState([])
  const [buscaCli, setBuscaCli] = useState(initialData?.cliente || '')
  const [buscaEq, setBuscaEq] = useState(initialData?.modelo || '')
  const [showCli, setShowCli] = useState(false)
  const [showEq, setShowEq] = useState(false)

  const [formData, setFormData] = useState({
    Cliente: initialData?.cliente || '',
    'Cpf/Cpnj': '',
    'inscricao_esta/mun': '',
    Cidade: '',
    Bairro: '',
    cep: '',
    End_Entrega: '',
    Qtd_Eqp: '1',
    Marca: initialData?.marca || '',
    Modelo: initialData?.modelo || '',
    'Niname/NCM': '',
    Ano: '',
    Prazo_Entrega: '',
    Valor_Total: '',
    Condicoes: '',
    validade: '',
    Imagem_Equipamento: '',
    status: 'Enviar Proposta',
    id_fabrica_ref: initialData?.id || '',
    motor_trator: '',
    transmissao_diant_trator: '',
    bomb_inje_trator: '',
    bomb_hidra_trator: '',
    embreagem_trator: '',
    capacit_comb_trator: '',
    cambio_trator: '',
    reversor_trator: '',
    trasmissao_tras_trator: '',
    oleo_motor_trator: '',
    oleo_trasmissao_trator: '',
    diant_min_max_trator: '',
    tras_min_max_trator: ''
  })

  useEffect(() => {
    async function carregarDados() {
      try {
        const fetchAll = async (tableName) => {
          let allData = []
          let from = 0
          const step = 1000
          while (true) {
            const { data, error } = await supabase.from(tableName).select('*').range(from, from + step - 1)
            if (error) throw error
            if (!data || data.length === 0) break
            allData = [...allData, ...data]
            if (data.length < step) break
            from += step
          }
          return allData
        }

        const [dataOmie, dataManual, dataEquip, dataTrator] = await Promise.all([
          fetchAll('Clientes_Omie'),
          fetchAll('Cliente_Manual'),
          supabase.from('Equipamentos').select('*'),
          supabase.from('cad_trator').select('*')
        ])

        const unidos = [
          ...(dataOmie || []).map(c => ({ ...c, origem: 'OMIE' })),
          ...(dataManual || []).map(c => ({ ...c, origem: 'MANUAL' }))
        ]

        setListaClientes(unidos)
        if (dataEquip.data) setListaEquipamentos(dataEquip.data)
        if (dataTrator.data) setListaTratores(dataTrator.data)
      } catch (err) { console.error("Erro ao carregar dados:", err) }
    }
    carregarDados()
  }, [])

  const handleSelecionarCliente = (c) => {
    const nome = c.nome || 'Sem Nome'
    const documento = c['cpf/cnpj'] || c.cppf_cnpj || ''
    const ie = c['inscricao_estadual/municipal'] || c.inscricao || ''
    const local = c.endereco || c.endereco_completo || ''

    setFormData(prev => ({
      ...prev,
      Cliente: nome,
      'Cpf/Cpnj': documento,
      'inscricao_esta/mun': ie,
      Cidade: c.cidade || '',
      Bairro: c.bairro || '',
      End_Entrega: local
    }))
    setBuscaCli(nome)
    setShowCli(false)
  }

  const handleSelecionarEquipamento = (item) => {
    if (tipoMaq === 'implemento') {
      setFormData(prev => ({
        ...prev,
        Marca: item.marca, Modelo: item.modelo, Ano: item.ano,
        'Niname/NCM': item.finame, Imagem_Equipamento: item.imagem, Qtd_Eqp: '1'
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        Marca: item.marca, Modelo: item.modelo, Ano: item.ano || '',
        'Niname/NCM': item['finame/ncm'] || '', Imagem_Equipamento: item.imagem,
        motor_trator: item.motor || '',
        transmissao_diant_trator: item.transmissao_diant || '',
        bomb_inje_trator: item.bomb_inje || '',
        bomb_hidra_trator: item.bomb_hidra || '',
        embreagem_trator: item.embreagem || '',
        capacit_comb_trator: item.capacit_comb || '',
        cambio_trator: item.cambio || '',
        reversor_trator: item.reversor || '',
        trasmissao_tras_trator: item.trasmissao_tras || '',
        oleo_motor_trator: item.oleo_motor || '',
        oleo_trasmissao_trator: item.oleo_trasmissao || '',
        diant_min_max_trator: item.diant_min_max || '',
        tras_min_max_trator: item.tras_min_max || '',
        Qtd_Eqp: '1'
      }))
    }
    setBuscaEq(`${item.marca} ${item.modelo}`)
    setShowEq(false)
  }

  const handleSalvar = async (e) => {
    e.preventDefault()
    setLoading(true)
    const payload = { ...formData }
    delete payload.cep
    delete payload.Tipo_Entrega
    delete payload.Valor_A_Vista
    if (!temValidade) payload.validade = 'Sem validade'

    const { error } = await supabase.from('Formulario').insert([payload])
    if (!error) { alert("PROPOSTA GERADA COM SUCESSO!"); onClose(); window.location.reload() }
    else { alert("Erro ao salvar: " + error.message); setLoading(false) }
  }

  const inputStyle = "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-red-500/40"
  const labelStyle = "text-[9px] font-black text-zinc-500 uppercase mb-1 block"

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[3000]">
      <div className="bg-white w-[95%] max-w-[1100px] h-[90vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <h2 className="text-lg font-black text-zinc-900">NOVA PROPOSTA COMERCIAL</h2>
          <button onClick={onClose} className="text-sm font-black text-zinc-500 hover:text-red-600 transition-colors">FECHAR [X]</button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1">
          <form onSubmit={handleSalvar} className="flex flex-col gap-5">
            <div className="flex gap-5">
              <div className="flex-1 relative">
                <label className="text-[11px] font-black text-zinc-700 mb-2 block">1. BUSCAR CLIENTE (OMIE + MANUAL)</label>
                <input className="w-full px-4 py-3 bg-zinc-900 text-white rounded-xl border-none text-sm font-bold" value={buscaCli} onFocus={() => setShowCli(true)} onChange={e => { setBuscaCli(e.target.value); setShowCli(true) }} placeholder="Pesquisar entre todos os clientes..." />
                {showCli && (
                  <div className="absolute top-[75px] left-0 right-0 bg-white border-2 border-zinc-300 z-[100] max-h-[300px] overflow-y-auto rounded-xl shadow-xl">
                    {listaClientes.filter(c => {
                      const termo = buscaCli.toLowerCase()
                      return !buscaCli || (c.nome || "").toLowerCase().includes(termo) || (c['cpf/cnpj'] || "").toLowerCase().includes(termo) || (c.cppf_cnpj || "").toLowerCase().includes(termo)
                    }).slice(0, 100).map((c, idx) => (
                      <div key={`${c.id}-${idx}`} className="p-3 cursor-pointer border-b border-zinc-100 text-zinc-800 font-bold text-[13px] hover:bg-red-50" onClick={() => handleSelecionarCliente(c)}>
                        <div className="font-bold">{c.nome}</div>
                        <div className="text-[10px] text-zinc-500">{c['cpf/cnpj'] || c.cppf_cnpj} | <span className={`font-black ${c.origem === 'OMIE' ? 'text-red-600' : 'text-emerald-600'}`}>{c.origem}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 relative">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-black text-zinc-700">2. SELECIONAR PRODUTO</label>
                  <select value={tipoMaq} onChange={(e) => { setTipoMaq(e.target.value); setBuscaEq('') }} className="text-[10px] font-black border border-zinc-300 rounded px-2 py-1 cursor-pointer">
                    <option value="implemento">IMPLEMENTO</option>
                    <option value="trator">TRATOR</option>
                  </select>
                </div>
                <input className={`w-full px-4 py-3 text-white rounded-xl border-none text-sm font-bold ${tipoMaq === 'trator' ? 'bg-zinc-800' : 'bg-zinc-900'}`}
                  value={buscaEq} onFocus={() => setShowEq(true)} onChange={e => { setBuscaEq(e.target.value); setShowEq(true) }}
                  placeholder={tipoMaq === 'trator' ? "Pesquisar Trator..." : "Pesquisar Implemento..."} />
                {showEq && (
                  <div className="absolute top-[75px] left-0 right-0 bg-white border-2 border-zinc-300 z-[100] max-h-[300px] overflow-y-auto rounded-xl shadow-xl">
                    {(tipoMaq === 'implemento' ? listaEquipamentos : listaTratores)
                      .filter(e => {
                        const termo = buscaEq.toLowerCase()
                        return !buscaEq || (e.marca || "").toLowerCase().includes(termo) || (e.modelo || "").toLowerCase().includes(termo)
                      }).slice(0, 30).map(e => (
                        <div key={e.id} className="p-3 cursor-pointer border-b border-zinc-100 text-zinc-800 font-bold text-[13px] hover:bg-red-50" onClick={() => handleSelecionarEquipamento(e)}>{e.marca} {e.modelo}</div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {formData.Imagem_Equipamento && (
              <div className="text-center">
                <div className="inline-block bg-zinc-50 p-3 border border-zinc-200 rounded-xl">
                  <label className={labelStyle}>FOTO SELECIONADA</label>
                  <img src={formData.Imagem_Equipamento} className="h-[140px] rounded-md border border-zinc-300" alt="Equipamento" />
                </div>
              </div>
            )}

            <div className="text-xs font-black text-red-600 uppercase">I. DADOS DO CLIENTE</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>CLIENTE</label><input value={formData.Cliente} onChange={e => setFormData({ ...formData, Cliente: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>CPF / CNPJ</label><input value={formData['Cpf/Cpnj']} onChange={e => setFormData({ ...formData, 'Cpf/Cpnj': e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>I.E. / MUN.</label><input value={formData['inscricao_esta/mun']} onChange={e => setFormData({ ...formData, 'inscricao_esta/mun': e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>CIDADE</label><input value={formData.Cidade} onChange={e => setFormData({ ...formData, Cidade: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BAIRRO</label><input value={formData.Bairro} onChange={e => setFormData({ ...formData, Bairro: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>CEP</label><input value={formData.cep} onChange={e => setFormData({ ...formData, cep: e.target.value })} className={`${inputStyle} text-zinc-400`} /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>ENDERECO COMPLETO</label><input value={formData.End_Entrega} onChange={e => setFormData({ ...formData, End_Entrega: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">II. DADOS DO {tipoMaq.toUpperCase()}</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MARCA</label><input value={formData.Marca} onChange={e => setFormData({ ...formData, Marca: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MODELO</label><input value={formData.Modelo} onChange={e => setFormData({ ...formData, Modelo: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>ANO</label><input value={formData.Ano} onChange={e => setFormData({ ...formData, Ano: e.target.value })} className={inputStyle} /></div>
              </div>

              {tipoMaq === 'trator' ? (
                <>
                  <div className="flex border-b border-zinc-200">
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MOTOR</label><input value={formData.motor_trator} onChange={e => setFormData({ ...formData, motor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BOMBA INJETORA</label><input value={formData.bomb_inje_trator} onChange={e => setFormData({ ...formData, bomb_inje_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>BOMBA HIDRAULICA</label><input value={formData.bomb_hidra_trator} onChange={e => setFormData({ ...formData, bomb_hidra_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="flex border-b border-zinc-200">
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>CAMBIO</label><input value={formData.cambio_trator} onChange={e => setFormData({ ...formData, cambio_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>REVERSOR</label><input value={formData.reversor_trator} onChange={e => setFormData({ ...formData, reversor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>EMBREAGEM</label><input value={formData.embreagem_trator} onChange={e => setFormData({ ...formData, embreagem_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="flex border-b border-zinc-200">
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANS. DIANT.</label><input value={formData.transmissao_diant_trator} onChange={e => setFormData({ ...formData, transmissao_diant_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANS. TRAS.</label><input value={formData.trasmissao_tras_trator} onChange={e => setFormData({ ...formData, trasmissao_tras_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>CAP. COMB.</label><input value={formData.capacit_comb_trator} onChange={e => setFormData({ ...formData, capacit_comb_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="flex border-b border-zinc-200">
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>OLEO MOTOR</label><input value={formData.oleo_motor_trator} onChange={e => setFormData({ ...formData, oleo_motor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>OLEO TRANS.</label><input value={formData.oleo_trasmissao_trator} onChange={e => setFormData({ ...formData, oleo_trasmissao_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>FINAME / NCM</label><input value={formData['Niname/NCM']} onChange={e => setFormData({ ...formData, 'Niname/NCM': e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="flex">
                    <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>DIANTEIRA MIN/MAX</label><input value={formData.diant_min_max_trator} onChange={e => setFormData({ ...formData, diant_min_max_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TRASEIRA MIN/MAX</label><input value={formData.tras_min_max_trator} onChange={e => setFormData({ ...formData, tras_min_max_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                </>
              ) : (
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>FINAME / NCM</label><input value={formData['Niname/NCM']} onChange={e => setFormData({ ...formData, 'Niname/NCM': e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>QUANTIDADE</label><input type="number" value={formData.Qtd_Eqp} onChange={e => setFormData({ ...formData, Qtd_Eqp: e.target.value })} className={inputStyle} /></div>
                </div>
              )}
            </div>

            <div className="text-xs font-black text-red-600 uppercase">III. CONDICOES FINANCEIRAS</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>VALOR TOTAL (R$)</label><input type="number" step="0.01" value={formData.Valor_Total} onChange={e => setFormData({ ...formData, Valor_Total: e.target.value })} className={`${inputStyle} text-red-600`} /></div>
              </div>
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>PRAZO ENTREGA (DIAS)</label><input type="number" value={formData.Prazo_Entrega} onChange={e => setFormData({ ...formData, Prazo_Entrega: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TIPO DE ENTREGA</label><select value={formData.Tipo_Entrega} onChange={e => setFormData({ ...formData, Tipo_Entrega: e.target.value })} className={`${inputStyle} cursor-pointer`}><option value="FOB">FOB (CLIENTE RETIRA)</option><option value="CIF">CIF (ENTREGA NA PROPRIEDADE)</option></select></div>
              </div>
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TEM VALIDADE?</label><select value={temValidade} onChange={e => setTemValidade(e.target.value === 'true')} className={`${inputStyle} cursor-pointer font-black ${temValidade ? 'text-amber-700' : 'text-zinc-500'}`}><option value="true">SIM</option><option value="false">NAO</option></select></div>
                <div className="flex-1 p-3 flex flex-col">{temValidade ? (<><label className={labelStyle}>DIAS DE VALIDADE</label><input type="number" value={formData.validade} onChange={e => setFormData({ ...formData, validade: e.target.value })} className={`${inputStyle} text-amber-700`} /></>) : (<div className="text-zinc-400 text-[11px] font-bold pt-2.5">SEM VALIDADE</div>)}</div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>CONDICOES DE PAGAMENTO / OBSERVACOES</label><input value={formData.Condicoes} onChange={e => setFormData({ ...formData, Condicoes: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>
          </form>
        </div>

        <div className="px-8 py-5 bg-white border-t border-zinc-200">
          <button onClick={handleSalvar} disabled={loading} className="w-full py-4 bg-red-600 text-white border-none rounded-xl font-black cursor-pointer text-base hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'GERANDO...' : 'CONFIRMAR E GERAR PROPOSTA'}</button>
        </div>
      </div>
    </div>
  )
}
