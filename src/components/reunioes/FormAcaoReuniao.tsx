'use client'
// R8: ação nascida na reunião — responsável + prazo obrigatórios; passa pelo
// aceite normal (quem recebe confirma, propõe outra data ou recusa).
import { useState } from 'react'
import UserSelect from '@/components/tickets/UserSelect'
import SeletorDataAgenda from '@/components/trabalho/SeletorDataAgenda'
import { CATEGORIAS_SUGERIDAS } from '@/lib/tickets/constantes'
import { dataMinima } from '@/lib/trabalho/agenda'
import { Modal, campo, rotulo, botao, botaoClaro, hojeISO } from './comum'

export default function FormAcaoReuniao({ tituloInicial, descricaoInicial, categoriaInicial, onFechar, onCriar }: {
  tituloInicial?: string
  descricaoInicial?: string
  categoriaInicial?: string
  onFechar: () => void
  onCriar: (a: { titulo: string; descricao: string; responsavel_id: string; prazo: string; categoria: string }) => Promise<void>
}) {
  const [titulo, setTitulo] = useState(tituloInicial || '')
  const [descricao, setDescricao] = useState(descricaoInicial || '')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState('')
  const [categoria, setCategoria] = useState(categoriaInicial || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const minimo = dataMinima(hojeISO(), true)

  const salvar = async () => {
    setSalvando(true); setErro('')
    try { await onCriar({ titulo: titulo.trim(), descricao: descricao.trim(), responsavel_id: responsavel, prazo, categoria }); onFechar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setSalvando(false) }
  }
  const pronto = titulo.trim() && responsavel && prazo

  return (
    <Modal titulo="Criar ação" onFechar={onFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={rotulo}>O que fazer *</label><input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} style={campo} maxLength={200} placeholder="Ex.: Trocar o cron das 03h para 03h30" /></div>
        <div><label style={rotulo}>Detalhe (fica como descrição imutável do ticket)</label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} style={{ ...campo, resize: 'vertical' }} /></div>
        <div><label style={rotulo}>Responsável *</label><UserSelect value={responsavel} onChange={setResponsavel} autoFocus={false} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={rotulo}>Prazo * (agenda da pessoa)</label>
            <SeletorDataAgenda diasUteis value={prazo} min={minimo} userId={responsavel} textoVazio="Escolha" onChange={setPrazo} />
          </div>
          <div>
            <label style={rotulo}>Categoria</label>
            <input list="cat-reuniao" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={campo} placeholder="Outros" />
            <datalist id="cat-reuniao">{CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={!pronto || salvando} style={{ ...botao(), opacity: !pronto || salvando ? .5 : 1 }}>{salvando ? 'Criando…' : 'Criar ação'}</button>
        </div>
      </div>
    </Modal>
  )
}
