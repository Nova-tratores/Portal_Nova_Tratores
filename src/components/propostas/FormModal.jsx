'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Search, X } from 'lucide-react'

export default function FormModal({ onClose, initialData }) {
  const { log } = useAuditLog()
  const [loading, setLoading] = useState(false)
  const [tipoMaq, setTipoMaq] = useState('implemento')
  const [temValidade, setTemValidade] = useState(true)
  const [listaClientes, setListaClientes] = useState([])
  const [listaEquipamentos, setListaEquipamentos] = useState([])
  const [listaTratores, setListaTratores] = useState([])
  const [listaAutopropelidos, setListaAutopropelidos] = useState([])
  const [listaVendedores, setListaVendedores] = useState([])
  const [listaTags, setListaTags] = useState([])
  const [buscaCli, setBuscaCli] = useState(initialData?.cliente || '')
  const [buscaEq, setBuscaEq] = useState(initialData?.modelo || '')
  const [showCli, setShowCli] = useState(false)
  const [showEq, setShowEq] = useState(false)
  // Valor por unidade (derivado) — a QUANTIDADE multiplica o VALOR TOTAL a partir dele.
  const [valorUnit, setValorUnit] = useState(0)
  const cliRef = useRef(null)
  const eqRef = useRef(null)

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
    vendedor_id: initialData?.vendedor_id || '',
    tag_id: '',
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
    tras_min_max_trator: '',
    // Autopropelido (pulverizador)
    motor_auto: '',
    transmissao_auto: '',
    tanque_pulv_auto: '',
    tecnologia_auto: '',
    telemetria_auto: '',
    barra_pulv_auto: '',
    num_secoes_auto: '',
    espac_bicos_auto: '',
    vao_livre_auto: '',
    bitola_auto: '',
    tanque_comb_auto: ''
  })

  // QUANTIDADE muda -> VALOR TOTAL = valor por unidade x quantidade.
  const onChangeQtd = (v) => {
    const prevQ = parseInt(formData.Qtd_Eqp) || 1
    const unit = valorUnit || ((parseFloat(formData.Valor_Total) || 0) / prevQ)
    const nQ = parseInt(v)
    setValorUnit(unit)
    setFormData({ ...formData, Qtd_Eqp: v, Valor_Total: (nQ && unit) ? (unit * nQ).toFixed(2) : formData.Valor_Total })
  }
  // Usuário edita o VALOR TOTAL -> recalcula o valor por unidade (total / quantidade).
  const onChangeTotal = (v) => {
    const q = parseInt(formData.Qtd_Eqp) || 1
    setValorUnit((parseFloat(v) || 0) / q)
    setFormData({ ...formData, Valor_Total: v })
  }

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

        const [dataOmie, dataManual, dataEquip, dataTrator, dataAuto, dataVend, dataTags] = await Promise.all([
          fetchAll('Clientes_Omie'),
          fetchAll('Cliente_Manual'),
          supabase.from('Equipamentos').select('*'),
          supabase.from('cad_trator').select('*'),
          supabase.from('cad_autopropelido').select('*'),
          supabase.from('vendedores').select('id,nome').eq('ativo', true).order('nome'),
          supabase.from('proposta_tags').select('*').order('nome')
        ])

        const unidos = [
          ...(dataOmie || []).map(c => ({ ...c, origem: 'OMIE' })),
          ...(dataManual || []).map(c => ({ ...c, origem: 'MANUAL' }))
        ]

        setListaClientes(unidos)
        if (dataEquip.data) setListaEquipamentos(dataEquip.data)
        if (dataTrator.data) setListaTratores(dataTrator.data)
        if (dataAuto.data) setListaAutopropelidos(dataAuto.data)
        if (dataVend.data) setListaVendedores(dataVend.data)
        if (dataTags.data) setListaTags(dataTags.data)
      } catch (err) { console.error("Erro ao carregar dados:", err) }
    }
    carregarDados()
  }, [])

  // Fecha os dropdowns de busca ao clicar fora (sem precisar selecionar).
  useEffect(() => {
    const onDoc = (e) => {
      if (cliRef.current && !cliRef.current.contains(e.target)) setShowCli(false)
      if (eqRef.current && !eqRef.current.contains(e.target)) setShowEq(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
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
    } else if (tipoMaq === 'autopropelido') {
      setFormData(prev => ({
        ...prev,
        Marca: item.marca, Modelo: item.modelo, Ano: item.ano || '',
        'Niname/NCM': item['finame/ncm'] || '', Imagem_Equipamento: item.imagem,
        motor_auto: item.motor || '',
        transmissao_auto: item.transmissao || '',
        tanque_pulv_auto: item.tanque_pulv || '',
        tecnologia_auto: item.tecnologia || '',
        telemetria_auto: item.telemetria || '',
        barra_pulv_auto: item.barra_pulv || '',
        num_secoes_auto: item.num_secoes || '',
        espac_bicos_auto: item.espac_bicos || '',
        vao_livre_auto: item.vao_livre || '',
        bitola_auto: item.bitola || '',
        tanque_comb_auto: item.tanque_comb || '',
        Qtd_Eqp: '1'
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
    payload.tipo = tipoMaq
    payload.vendedor_id = formData.vendedor_id ? Number(formData.vendedor_id) : null  // FK vendedores(id) é inteiro
    delete payload.cep
    delete payload.Tipo_Entrega
    delete payload.Valor_A_Vista
    if (!temValidade) payload.validade = 'Sem validade'

    // Colunas numericas (bigint) nao aceitam string vazia -> converte "" para null
    payload.tag_id = formData.tag_id ? Number(formData.tag_id) : null  // FK proposta_tags(id)
    const camposNumericos = ['Ano', 'Qtd_Eqp', 'Prazo_Entrega', 'Valor_Total', 'Niname/NCM', 'id_fabrica_ref', 'num_secoes_auto']
    camposNumericos.forEach(campo => {
      const v = payload[campo]
      if (v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
        payload[campo] = null
      }
    })

    const { data, error } = await supabase.from('Formulario').insert([payload]).select('id').single()
    if (!error) {
      if (data?.id) await log({ sistema: 'Proposta Comercial', acao: 'criar', entidade: 'proposta', entidade_id: String(data.id), entidade_label: payload.Cliente })
      alert("PROPOSTA GERADA COM SUCESSO!"); onClose(); window.location.reload()
    }
    else { alert("Erro ao salvar: " + error.message); setLoading(false) }
  }

  const inputStyle = "w-full bg-zinc-50 border border-zinc-200 rounded-[10px] px-3 py-2.5 text-sm font-medium text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/20"
  const labelStyle = "text-[10px] font-bold tracking-wider text-zinc-400 uppercase"
  const fieldCls = "flex flex-col gap-1.5"
  const tipos = [{ v: 'implemento', l: 'Implemento' }, { v: 'trator', l: 'Trator' }, { v: 'autopropelido', l: 'Autopropelido' }]
  // Função (não componente) para não remontar o input e perder o foco ao digitar.
  const campo = (label, chave, extra = '') => (
    <div className={fieldCls} key={chave}>
      <span className={labelStyle}>{label}</span>
      <input value={formData[chave] || ''} onChange={e => setFormData({ ...formData, [chave]: e.target.value })} className={`${inputStyle} ${extra}`} />
    </div>
  )
  const Sec = ({ n, children }) => (
    <div className="flex items-center gap-2.5 mt-7 mb-3.5">
      <span className="w-[22px] h-[22px] flex items-center justify-center rounded-[7px] bg-red-50 text-red-600 border border-red-200 text-[11px] font-extrabold shrink-0">{n}</span>
      <span className="text-[12.5px] font-bold tracking-wide uppercase text-zinc-800">{children}</span>
      <span className="flex-1 h-px bg-zinc-100" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[3000] p-4">
      <div className="bg-white w-full max-w-[1000px] h-[92vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="px-7 py-4 bg-white border-b border-zinc-200 flex justify-between items-center gap-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-zinc-900 tracking-tight">Nova proposta comercial</h2>
            <p className="text-[12.5px] text-zinc-500 mt-0.5">Preencha os dados do cliente e do produto</p>
          </div>
          <button onClick={onClose} title="Fechar" className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-red-600 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-7 py-5 overflow-y-auto flex-1">
          <form onSubmit={handleSalvar} className="flex flex-col">
            {/* BUSCA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-600 mb-1.5">Buscar cliente <span className="text-zinc-400 font-medium">(Omie + manual)</span></label>
                <div className="relative" ref={cliRef}>
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input className={`${inputStyle} pl-9`} value={buscaCli} onFocus={() => setShowCli(true)} onChange={e => { setBuscaCli(e.target.value); setShowCli(true) }} placeholder="Pesquisar entre todos os clientes..." />
                  {showCli && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-zinc-200 z-[100] max-h-[300px] overflow-y-auto rounded-xl shadow-xl">
                      {listaClientes.filter(c => {
                        const termo = buscaCli.toLowerCase()
                        return !buscaCli || (c.nome || "").toLowerCase().includes(termo) || (c['cpf/cnpj'] || "").toLowerCase().includes(termo) || (c.cppf_cnpj || "").toLowerCase().includes(termo)
                      }).slice(0, 100).map((c, idx) => (
                        <div key={`${c.id}-${idx}`} className="px-3 py-2.5 cursor-pointer border-b border-zinc-100 text-zinc-800 font-semibold text-[13px] hover:bg-red-50" onClick={() => handleSelecionarCliente(c)}>
                          <div className="font-semibold">{c.nome}</div>
                          <div className="text-[10.5px] text-zinc-500 font-medium">{c['cpf/cnpj'] || c.cppf_cnpj} · <span className={`font-bold ${c.origem === 'OMIE' ? 'text-red-600' : 'text-emerald-600'}`}>{c.origem}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-600 mb-1.5">Selecionar produto</label>
                <div className="inline-flex bg-zinc-100 border border-zinc-200 rounded-[10px] p-0.5 gap-0.5 mb-2">
                  {tipos.map(t => (
                    <button key={t.v} type="button" onClick={() => { setTipoMaq(t.v); setBuscaEq('') }}
                      className={`px-3 py-1.5 rounded-[7px] text-[11.5px] font-bold tracking-wide transition-colors cursor-pointer ${tipoMaq === t.v ? 'bg-red-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}>{t.l}</button>
                  ))}
                </div>
                <div className="relative" ref={eqRef}>
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input className={`${inputStyle} pl-9`} value={buscaEq} onFocus={() => setShowEq(true)} onChange={e => { setBuscaEq(e.target.value); setShowEq(true) }}
                    placeholder={tipoMaq === 'trator' ? "Pesquisar trator..." : tipoMaq === 'autopropelido' ? "Pesquisar autopropelido..." : "Pesquisar implemento..."} />
                  {showEq && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-zinc-200 z-[100] max-h-[300px] overflow-y-auto rounded-xl shadow-xl">
                      {(tipoMaq === 'implemento' ? listaEquipamentos : tipoMaq === 'autopropelido' ? listaAutopropelidos : listaTratores)
                        .filter(e => {
                          const termo = buscaEq.toLowerCase()
                          return !buscaEq || (e.marca || "").toLowerCase().includes(termo) || (e.modelo || "").toLowerCase().includes(termo)
                        }).slice(0, 30).map(e => (
                          <div key={e.id} className="px-3 py-2.5 cursor-pointer border-b border-zinc-100 text-zinc-800 font-semibold text-[13px] hover:bg-red-50" onClick={() => handleSelecionarEquipamento(e)}>{e.marca} {e.modelo}</div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {formData.Imagem_Equipamento && (
              <div className="mt-5 flex justify-center">
                <div className="inline-flex flex-col items-center gap-2 bg-zinc-50 p-3 border border-zinc-200 rounded-xl">
                  <span className={labelStyle}>Foto selecionada</span>
                  <img src={formData.Imagem_Equipamento} className="h-[130px] rounded-lg border border-zinc-200" alt="Equipamento" />
                </div>
              </div>
            )}

            {/* I. CLIENTE */}
            <Sec n="I">Dados do cliente</Sec>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {campo('Cliente', 'Cliente')}
              {campo('CPF / CNPJ', 'Cpf/Cpnj')}
              {campo('I.E. / Mun.', 'inscricao_esta/mun')}
              {campo('Cidade', 'Cidade')}
              {campo('Bairro', 'Bairro')}
              {campo('CEP', 'cep', '!text-zinc-400')}
              <div className={`${fieldCls} md:col-span-2`}>
                <span className={labelStyle}>Endereço completo</span>
                <input value={formData.End_Entrega} onChange={e => setFormData({ ...formData, End_Entrega: e.target.value })} className={inputStyle} />
              </div>
              <div className={fieldCls}>
                <span className={labelStyle}>Vendedor</span>
                <select value={formData.vendedor_id} onChange={e => setFormData({ ...formData, vendedor_id: e.target.value })} className={`${inputStyle} cursor-pointer`}>
                  <option value="">— sem vendedor —</option>
                  {listaVendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
              <div className={fieldCls}>
                <span className={labelStyle}>Tag / Grupo</span>
                <select value={formData.tag_id} onChange={e => setFormData({ ...formData, tag_id: e.target.value })} className={`${inputStyle} cursor-pointer`}>
                  <option value="">— sem tag —</option>
                  {listaTags.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            </div>

            {/* II. PRODUTO */}
            <Sec n="II">Dados do {tipoMaq}</Sec>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {campo('Marca', 'Marca')}
              {campo('Modelo', 'Modelo')}
              {campo('Ano', 'Ano')}

              {tipoMaq === 'trator' ? (
                <>
                  {campo('Motor', 'motor_trator')}
                  {campo('Bomba injetora', 'bomb_inje_trator')}
                  {campo('Bomba hidráulica', 'bomb_hidra_trator')}
                  {campo('Câmbio', 'cambio_trator')}
                  {campo('Reversor', 'reversor_trator')}
                  {campo('Embreagem', 'embreagem_trator')}
                  {campo('Trans. diant.', 'transmissao_diant_trator')}
                  {campo('Trans. tras.', 'trasmissao_tras_trator')}
                  {campo('Cap. comb.', 'capacit_comb_trator')}
                  {campo('Óleo motor', 'oleo_motor_trator')}
                  {campo('Óleo trans.', 'oleo_trasmissao_trator')}
                  {campo('FINAME / NCM', 'Niname/NCM')}
                  {campo('Dianteira min/max', 'diant_min_max_trator')}
                  {campo('Traseira min/max', 'tras_min_max_trator')}
                  <div className={fieldCls}><span className={labelStyle}>Quantidade</span><input type="number" min="1" value={formData.Qtd_Eqp} onChange={e => onChangeQtd(e.target.value)} className={inputStyle} /></div>
                </>
              ) : tipoMaq === 'autopropelido' ? (
                <>
                  {campo('Motor', 'motor_auto')}
                  {campo('Transmissão', 'transmissao_auto')}
                  {campo('Tanque comb. (L)', 'tanque_comb_auto')}
                  {campo('Tanque pulv. (L)', 'tanque_pulv_auto')}
                  {campo('Barra pulv. (m)', 'barra_pulv_auto')}
                  {campo('Nº seções', 'num_secoes_auto')}
                  {campo('Espaç. bicos (cm)', 'espac_bicos_auto')}
                  {campo('Vão livre (m)', 'vao_livre_auto')}
                  {campo('Bitola (m)', 'bitola_auto')}
                  {campo('Tecnologia', 'tecnologia_auto')}
                  {campo('Telemetria', 'telemetria_auto')}
                  {campo('FINAME / NCM', 'Niname/NCM')}
                  <div className={fieldCls}><span className={labelStyle}>Quantidade</span><input type="number" min="1" value={formData.Qtd_Eqp} onChange={e => onChangeQtd(e.target.value)} className={inputStyle} /></div>
                </>
              ) : (
                <>
                  {campo('FINAME / NCM', 'Niname/NCM')}
                  <div className={fieldCls}><span className={labelStyle}>Quantidade</span><input type="number" min="1" value={formData.Qtd_Eqp} onChange={e => onChangeQtd(e.target.value)} className={inputStyle} /></div>
                </>
              )}
            </div>

            {/* III. FINANCEIRO */}
            <Sec n="III">Condições financeiras</Sec>
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className={fieldCls}><span className={labelStyle}>Valor total (R$)</span><input type="number" step="0.01" value={formData.Valor_Total} onChange={e => onChangeTotal(e.target.value)} className={`${inputStyle} !text-red-600 font-bold`} /></div>
                <div className={fieldCls}><span className={labelStyle}>Prazo de entrega</span><input type="text" value={formData.Prazo_Entrega} onChange={e => setFormData({ ...formData, Prazo_Entrega: e.target.value })} placeholder="Ex: 30 dias, a combinar..." className={inputStyle} /></div>
                <div className={fieldCls}><span className={labelStyle}>Tipo de entrega</span><select value={formData.Tipo_Entrega} onChange={e => setFormData({ ...formData, Tipo_Entrega: e.target.value })} className={`${inputStyle} cursor-pointer`}><option value="FOB">FOB (cliente retira)</option><option value="CIF">CIF (entrega na propriedade)</option></select></div>

                {(parseInt(formData.Qtd_Eqp) || 1) > 1 && (
                  <div className="md:col-span-3 flex items-start gap-2 text-[11.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span>ℹ️</span>
                    <span>A quantidade multiplica o valor total: <b>{parseInt(formData.Qtd_Eqp)}</b> × R$ {(valorUnit || ((parseFloat(formData.Valor_Total) || 0) / (parseInt(formData.Qtd_Eqp) || 1))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = <b>R$ {(parseFloat(formData.Valor_Total) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
                  </div>
                )}

                <div className={fieldCls}><span className={labelStyle}>Tem validade?</span><select value={temValidade} onChange={e => setTemValidade(e.target.value === 'true')} className={`${inputStyle} cursor-pointer font-semibold ${temValidade ? 'text-amber-700' : 'text-zinc-500'}`}><option value="true">Sim</option><option value="false">Não</option></select></div>
                <div className={fieldCls}>
                  <span className={labelStyle}>Validade</span>
                  {temValidade
                    ? <input type="number" value={formData.validade} onChange={e => setFormData({ ...formData, validade: e.target.value })} placeholder="Dias" className={`${inputStyle} !text-amber-700`} />
                    : <div className="text-zinc-400 text-[13px] font-semibold py-2.5">Sem validade</div>}
                </div>
                <div className="hidden md:block" />
                <div className={`${fieldCls} md:col-span-3`}>
                  <span className={labelStyle}>Condições de pagamento / observações</span>
                  <input value={formData.Condicoes} onChange={e => setFormData({ ...formData, Condicoes: e.target.value })} className={inputStyle} />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="px-7 py-4 bg-white border-t border-zinc-200">
          <button onClick={handleSalvar} disabled={loading} className="w-full py-3.5 bg-red-600 text-white border-none rounded-xl font-bold text-[15px] cursor-pointer hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'Gerando...' : 'Confirmar e gerar proposta'}</button>
        </div>
      </div>
    </div>
  )
}
