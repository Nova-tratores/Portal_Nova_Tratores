'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import QRCode from 'qrcode'

export default function EditModal({ proposal, onClose }) {
  const [formData, setFormData] = useState(proposal || {})
  const [imagePreview, setImagePreview] = useState(proposal?.Imagem_Equipamento || '')
  const [assinaturaDiretor, setAssinaturaDiretor] = useState(null)

  const isTrator = !!(formData.motor_trator || formData.cambio_trator || formData.trasmissao_tras_trator)

  useEffect(() => {
    if (proposal) {
      setFormData({ ...proposal })
      setImagePreview(proposal.Imagem_Equipamento)
      fetchConfig()
    }
  }, [proposal])

  const fetchConfig = async () => {
    const { data } = await supabase.from('Configuracoes').select('assinatura_url').single()
    if (data) setAssinaturaDiretor(data.assinatura_url)
  }

  const getImageDimensions = (url) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => resolve({ width: 100, height: 50 })
      img.src = url
    })
  }

  const handleTrash = async () => {
    if (confirm("DESEJA REALMENTE MOVER ESTA PROPOSTA PARA A LIXEIRA?")) {
      const { error } = await supabase.from('Formulario').update({ status: 'Lixeira' }).eq('id', proposal.id)
      if (!error) { alert("MOVIDO PARA A LIXEIRA COM SUCESSO!"); window.location.reload() }
      else { alert("Erro ao mover: " + error.message) }
    }
  }

  const handlePrint = async () => {
    const doc = new jsPDF()
    const margin = 15
    const pageWidth = doc.internal.pageSize.getWidth()
    const innerWidth = pageWidth - (margin * 2)
    let y = 0

    const qrText = `https://wa.me/5514998189779?text=Ola, sobre a proposta n${formData.id}`
    const qrCodeDataUrl = await QRCode.toDataURL(qrText)

    doc.setFillColor(239, 68, 68); doc.rect(0, 0, pageWidth, 20, 'F')
    doc.setTextColor(255); doc.setFontSize(14); doc.setFont("helvetica", "bold")
    doc.text("NOVA TRATORES MAQUINAS AGRICOLAS LTDA.", margin, 12)
    doc.setFontSize(8); doc.text("CONCESSIONARIA AUTORIZADA", margin, 17)

    y = 28; doc.setTextColor(0); doc.setFontSize(11)
    doc.text(`PROPOSTA COMERCIAL | N ${formData.id || ''}`, margin, y)
    doc.setFontSize(8); doc.text(`DATA: ${new Date().toLocaleDateString('pt-BR')}`, margin, y + 4)

    doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - margin - 15, 18, 15, 15)
    doc.setFontSize(5); doc.text("CONTATO", pageWidth - margin - 15, 34)

    doc.setDrawColor(0); doc.setLineWidth(0.4)

    y = 38
    doc.rect(margin, y, innerWidth, 32)
    doc.setFontSize(8.5)

    const col2X = pageWidth / 2 + 10

    doc.setFont("helvetica", "bold")
    doc.text("CLIENTE: ", margin + 5, y + 7)
    const labelClienteW = doc.getTextWidth("CLIENTE: ")
    doc.setFont("helvetica", "normal")

    const nomeCliente = (formData.Cliente || '').toUpperCase()
    const larguraDisponivelNome = col2X - (margin + 5) - labelClienteW - 2
    const splitNome = doc.splitTextToSize(nomeCliente, larguraDisponivelNome)

    doc.text(splitNome[0], margin + 5 + labelClienteW, y + 7)

    let offsetNome = 0
    if (splitNome.length > 1) {
      offsetNome = (splitNome.length - 1) * 4
      for (let i = 1; i < splitNome.length; i++) {
        doc.text(splitNome[i], margin + 5, y + 7 + (i * 4))
      }
    }

    doc.text(`CPF/CNPJ: ${formData['Cpf/Cpnj'] || ''}`, margin + 5, y + 13 + offsetNome)
    doc.text(`I.E./MUN.: ${formData['inscricao_esta/mun'] || ''}`, margin + 5, y + 19 + offsetNome)
    doc.text(`CEP: ${formData.cep || ''}`, margin + 5, y + 25 + offsetNome)

    doc.text(`CIDADE: ${formData.Cidade || ''}`, col2X, y + 7)
    doc.text(`BAIRRO: ${formData.Bairro || ''}`, col2X, y + 13)
    doc.text(`ENDERECO: ${formData.End_Entrega || ''}`, col2X, y + 19)

    y += 32
    const imgBoxHeight = isTrator ? 60 : 95
    doc.rect(margin, y, innerWidth, imgBoxHeight)
    if (formData.Imagem_Equipamento) {
      const dims = await getImageDimensions(formData.Imagem_Equipamento)
      const ratio = dims.width / dims.height
      let imgW = 170; let imgH = imgW / ratio
      const maxImgH = imgBoxHeight - 8
      if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * ratio }
      doc.addImage(formData.Imagem_Equipamento, 'JPEG', (pageWidth - imgW) / 2, y + 4, imgW, imgH)
    }

    y += imgBoxHeight
    const techBoxHeight = isTrator ? 80 : 45
    doc.rect(margin, y, innerWidth, techBoxHeight)
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold")
    doc.text(`MARCA: ${formData.Marca || ''}`, margin + 5, y + 7)
    doc.text(`MODELO: ${formData.Modelo || ''}`, margin + 5, y + 13)
    doc.text(`ANO: ${formData.Ano || ''}`, margin + 5, y + 19)
    doc.text(`FINAME/NCM: ${formData['Niname/NCM'] || ''}`, col2X, y + 7)
    doc.text(`QTD: ${formData.Qtd_Eqp || '1'}`, col2X, y + 13)

    doc.text("CONFIGURACAO TECNICA:", margin + 5, y + 27)

    if (isTrator) {
      doc.setFontSize(7.5)
      const startY = y + 33
      const colTech2 = pageWidth / 2 + 5
      const lineHeight = 5

      const renderField = (label, value, posX, posY) => {
        doc.setFont("helvetica", "bold")
        doc.text(`${label}:`, posX, posY)
        const lw = doc.getTextWidth(`${label}: `)
        doc.setFont("helvetica", "normal")
        doc.text(`${value || '---'}`, posX + lw, posY)
      }

      renderField("MOTOR", formData.motor_trator, margin + 5, startY)
      renderField("BOMBA INJE.", formData.bomb_inje_trator, margin + 5, startY + lineHeight)
      renderField("BOMBA HIDRA.", formData.bomb_hidra_trator, margin + 5, startY + (lineHeight * 2))
      renderField("EMBREAGEM", formData.embreagem_trator, margin + 5, startY + (lineHeight * 3))
      renderField("CAPACIDADE COMB.", formData.capacit_comb_trator, margin + 5, startY + (lineHeight * 4))
      renderField("DIANT. MIN/MAX", formData.diant_min_max_trator, margin + 5, startY + (lineHeight * 5))

      renderField("CAMBIO", formData.cambio_trator, colTech2, startY)
      renderField("REVERSOR", formData.reversor_trator, colTech2, startY + lineHeight)
      renderField("TRANS. DIANT.", formData.transmissao_diant_trator, colTech2, startY + (lineHeight * 2))
      renderField("TRANS. TRAS.", formData.trasmissao_tras_trator, colTech2, startY + (lineHeight * 3))
      renderField("OLEO MOTOR", formData.oleo_motor_trator, colTech2, startY + (lineHeight * 4))
      renderField("OLEO TRANS.", formData.oleo_trasmissao_trator, colTech2, startY + (lineHeight * 5))
      renderField("TRAS. MIN/MAX", formData.tras_min_max_trator, colTech2, startY + (lineHeight * 6))
    } else {
      doc.setFont("helvetica", "normal")
      const infoTecnica = formData.Configuracao || formData.Descricao || ''
      const splitConfig = doc.splitTextToSize(infoTecnica, innerWidth - 10)
      doc.text(splitConfig, margin + 5, y + 32)
    }

    y += techBoxHeight
    doc.setFillColor(250, 250, 210); doc.rect(margin, y, innerWidth, 8, 'F')
    doc.rect(margin, y, innerWidth, 38)
    doc.line(margin, y + 8, margin + innerWidth, y + 8)
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5)
    doc.text("CASO SEJA FINANCIADO TAXA FLAT POR CONTA DO CLIENTE", pageWidth / 2, y + 5.5, { align: "center" })

    doc.setFontSize(9); doc.setFont("helvetica", "normal")
    doc.text(`VALOR TOTAL: R$ ${formData.Valor_Total || '0,00'}`, margin + 5, y + 18)

    if (formData.Prazo_Entrega && Number(formData.Prazo_Entrega) !== 0) {
      doc.text(`PRAZO ENTREGA: ${formData.Prazo_Entrega} DIAS`, col2X, y + 18)
    }

    const labelCond = "CONDICOES: "
    doc.setFont("helvetica", "bold")
    doc.text(labelCond, col2X, y + 25)
    const condW = doc.getTextWidth(labelCond)
    doc.setFont("helvetica", "normal")
    const valorCond = formData.Condicoes || ''
    const splitCond = doc.splitTextToSize(valorCond, (pageWidth - margin) - (col2X + condW))
    doc.text(splitCond, col2X + condW, y + 25)

    if (formData.validade && formData.validade !== 'Sem validade') {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(180, 83, 9)
      doc.text(`ESTA PROPOSTA E VALIDA POR ${formData.validade} DIAS.`, margin + 5, y + 31)
    }

    y = 260
    const lineW = 75
    const midPointL = margin + (lineW / 2)
    const directorLineX = pageWidth - margin - lineW

    doc.setDrawColor(0); doc.line(margin, y, margin + lineW, y)
    doc.setFontSize(7); doc.setTextColor(0); doc.setFont("helvetica", "bold")
    doc.text(`${formData.Cliente || ''}`.toUpperCase(), midPointL, y + 5, { align: "center" })
    doc.setFont("helvetica", "normal")
    doc.text(`${formData['Cpf/Cpnj'] || ''}`, midPointL, y + 9, { align: "center" })
    doc.text(`${formData.End_Entrega || ''}`, midPointL, y + 13, { align: "center" })
    doc.text(`${formData.Bairro || ''}`, midPointL, y + 17, { align: "center" })

    doc.line(directorLineX, y, pageWidth - margin, y)
    if (assinaturaDiretor) {
      doc.addImage(assinaturaDiretor, 'PNG', directorLineX, y - 5, 85, 25)
    }

    doc.save(`Proposta_${formData.Cliente || 'NovaTratores'}.pdf`)
  }

  const handleUpdate = async () => {
    const { error } = await supabase.from('Formulario').update(formData).eq('id', proposal.id)
    if (!error) { alert("ATUALIZADO COM SUCESSO!"); window.location.reload() }
    else { alert("Erro: " + error.message) }
  }

  const inputStyle = "w-full bg-white border-none outline-none text-[13px] font-bold text-zinc-900"
  const labelStyle = "text-[8.5px] font-black text-zinc-800 uppercase"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[9999]">
      <div className="bg-white w-[95%] max-w-[1100px] h-[95vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-10 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-1 h-6 bg-red-600 rounded" />
            <h2 className="font-black text-zinc-900">EDICAO PROPOSTA #{formData.id}</h2>
          </div>
          <div className="flex gap-4">
            <button onClick={handleTrash} className="px-5 py-2.5 bg-red-600 text-white border-none rounded-lg font-black cursor-pointer text-xs hover:bg-red-700 transition-colors">LIXEIRA</button>
            <button onClick={handlePrint} className="px-5 py-2.5 bg-zinc-900 text-white border-none rounded-lg font-black cursor-pointer text-xs hover:bg-zinc-800 transition-colors">IMPRIMIR PDF</button>
            <button onClick={onClose} className="text-sm font-black text-zinc-500 hover:text-red-600 transition-colors">FECHAR [X]</button>
          </div>
        </div>

        <div className="px-10 py-8 overflow-y-auto flex-1">
          <div className="flex flex-col gap-4">
            <div className="text-[11px] font-black text-red-600 uppercase">I. DADOS DO CLIENTE</div>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <div className="flex border-b border-zinc-100">
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>NOME</label><input value={formData.Cliente || ''} onChange={e => setFormData({ ...formData, Cliente: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>CPF / CNPJ</label><input value={formData['Cpf/Cpnj'] || ''} onChange={e => setFormData({ ...formData, 'Cpf/Cpnj': e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>I.E. / MUN.</label><input value={formData['inscricao_esta/mun'] || ''} onChange={e => setFormData({ ...formData, 'inscricao_esta/mun': e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex border-b border-zinc-100">
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>CIDADE</label><input value={formData.Cidade || ''} onChange={e => setFormData({ ...formData, Cidade: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>BAIRRO</label><input value={formData.Bairro || ''} onChange={e => setFormData({ ...formData, Bairro: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>CEP</label><input value={formData.cep || ''} onChange={e => setFormData({ ...formData, cep: e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>ENDERECO COMPLETO</label><input value={formData.End_Entrega || ''} onChange={e => setFormData({ ...formData, End_Entrega: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>

            <div className="text-[11px] font-black text-red-600 uppercase">II. DADOS DO {isTrator ? 'TRATOR' : 'IMPLEMENTO'}</div>
            {imagePreview && <div className="text-center"><img src={imagePreview} className="w-[100px] h-[80px] object-contain border-2 border-zinc-300 rounded-lg" alt="Preview" /></div>}

            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <div className="flex border-b border-zinc-100">
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>MARCA</label><input value={formData.Marca || ''} onChange={e => setFormData({ ...formData, Marca: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>MODELO</label><input value={formData.Modelo || ''} onChange={e => setFormData({ ...formData, Modelo: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>ANO</label><input value={formData.Ano || ''} onChange={e => setFormData({ ...formData, Ano: e.target.value })} className={inputStyle} /></div>
              </div>

              {isTrator ? (
                <>
                  <div className="grid grid-cols-3 border-b border-zinc-100">
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>MOTOR</label><input value={formData.motor_trator || ''} onChange={e => setFormData({ ...formData, motor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>BOMBA INJE.</label><input value={formData.bomb_inje_trator || ''} onChange={e => setFormData({ ...formData, bomb_inje_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 flex flex-col gap-0.5"><label className={labelStyle}>BOMBA HIDRA.</label><input value={formData.bomb_hidra_trator || ''} onChange={e => setFormData({ ...formData, bomb_hidra_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="grid grid-cols-3 border-b border-zinc-100">
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>CAMBIO</label><input value={formData.cambio_trator || ''} onChange={e => setFormData({ ...formData, cambio_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>REVERSOR</label><input value={formData.reversor_trator || ''} onChange={e => setFormData({ ...formData, reversor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 flex flex-col gap-0.5"><label className={labelStyle}>EMBREAGEM</label><input value={formData.embreagem_trator || ''} onChange={e => setFormData({ ...formData, embreagem_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="grid grid-cols-3 border-b border-zinc-100">
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>TRANS. DIANT.</label><input value={formData.transmissao_diant_trator || ''} onChange={e => setFormData({ ...formData, transmissao_diant_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>TRANS. TRAS.</label><input value={formData.trasmissao_tras_trator || ''} onChange={e => setFormData({ ...formData, trasmissao_tras_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 flex flex-col gap-0.5"><label className={labelStyle}>CAP. COMB.</label><input value={formData.capacit_comb_trator || ''} onChange={e => setFormData({ ...formData, capacit_comb_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="grid grid-cols-3 border-b border-zinc-100">
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>OLEO MOTOR</label><input value={formData.oleo_motor_trator || ''} onChange={e => setFormData({ ...formData, oleo_motor_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>OLEO TRANS.</label><input value={formData.oleo_trasmissao_trator || ''} onChange={e => setFormData({ ...formData, oleo_trasmissao_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="p-2.5 flex flex-col gap-0.5"><label className={labelStyle}>FINAME/NCM</label><input value={formData['Niname/NCM'] || ''} onChange={e => setFormData({ ...formData, 'Niname/NCM': e.target.value })} className={inputStyle} /></div>
                  </div>
                  <div className="flex border-t border-zinc-100">
                    <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>DIANTEIRA MIN/MAX</label><input value={formData.diant_min_max_trator || ''} onChange={e => setFormData({ ...formData, diant_min_max_trator: e.target.value })} className={inputStyle} /></div>
                    <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>TRASEIRA MIN/MAX</label><input value={formData.tras_min_max_trator || ''} onChange={e => setFormData({ ...formData, tras_min_max_trator: e.target.value })} className={inputStyle} /></div>
                  </div>
                </>
              ) : (
                <div className="flex">
                  <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>DESCRICAO TECNICA</label><textarea value={formData.Configuracao || formData.Descricao || ''} onChange={e => setFormData({ ...formData, Configuracao: e.target.value })} className="w-full border-none outline-none text-[13px] min-h-[70px] resize-none font-semibold" /></div>
                </div>
              )}
            </div>

            <div className="text-[11px] font-black text-red-600 uppercase">III. FINANCEIRO</div>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <div className="flex border-b border-zinc-100">
                <div className="flex-1 p-3 border-r border-zinc-100 flex flex-col gap-0.5"><label className={labelStyle}>VALOR TOTAL</label><input value={formData.Valor_Total || ''} onChange={e => setFormData({ ...formData, Valor_Total: e.target.value })} className={`${inputStyle} !text-red-600`} /></div>
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>VALIDADE (DIAS)</label><input value={formData.validade || ''} onChange={e => setFormData({ ...formData, validade: e.target.value })} className={`${inputStyle} !text-amber-700`} /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 flex flex-col gap-0.5"><label className={labelStyle}>CONDICOES DE PAGAMENTO</label><input value={formData.Condicoes || ''} onChange={e => setFormData({ ...formData, Condicoes: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-10 py-5 bg-white border-t border-zinc-200">
          <button onClick={handleUpdate} className="w-full py-4 bg-red-600 text-white border-none rounded-xl font-black cursor-pointer hover:bg-red-700 transition-colors">SALVAR ALTERACOES</button>
        </div>
      </div>
    </div>
  )
}
