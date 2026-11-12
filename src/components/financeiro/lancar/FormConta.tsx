'use client'
// Dados da conta a pagar (Caixa › Lançar conta). Cria um registro novo em `finan_pagar` ou corrige um
// rascunho que já existe (ex.: o que veio de uma Requisição). Grava como rascunho; quem lança no Omie é o
// passo seguinte da mesma janela (EnviarParaOmieBox → POST /api/financeiro/contas-pagar/omie).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuditLog } from '@/hooks/useAuditLog'
import FornecedorPicker, { type FornecedorEscolhido } from './FornecedorPicker'
import { METODOS_PAGAMENTO, gerarParcelas, lerValor, parcelasParaTexto, validarNovaConta, type Parcela } from '@/lib/financeiro/lancar-conta'

// linha de `finan_pagar` (só os campos que esta tela usa; o resto passa adiante para o EnviarParaOmieBox)
export type RegistroPagar = {
  id: number
  fornecedor?: string | null
  valor?: number | string | null
  data_vencimento?: string | null
  motivo?: string | null
  numero_NF?: string | null
  metodo?: string | null
  status?: string | null
  status_envio?: string | null
  criado_por?: string | null
  requisicao_ids?: number[] | null
  is_requisicao?: boolean
  omie_cod_lancamento?: string | null
  omie_empresa?: string | null
  omie_ultimo_erro?: string | null
  qtd_parcelas?: number | null
  parcelas_vencimentos?: string | null
  autonomo_sem_nota?: boolean | null
  anexo_nf?: string | null
  anexo_boleto?: string | null
  anexo_requisicao?: string | null
  nfe_cnpj_emitente?: string | null
  [coluna: string]: unknown
}
type FornLinha = { id: number | string; nome: string; 'cpf/cnpj': string | null; cidade: string | null; estado: string | null }

const inp: React.CSSProperties = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-surface, #fff)', color: 'var(--portal-text)', fontSize: 15, boxSizing: 'border-box' }
const rot: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 5 }
const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }

const soDig = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const lista = (s: unknown) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
const nomeArquivo = (url: string) => decodeURIComponent(url.split('/').pop() || url).replace(/^\d+-/, '')

async function subir(arquivo: File): Promise<string> {
  const caminho = `pagar/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supabase.storage.from('anexos').upload(caminho, arquivo)
  if (error) throw new Error(`Não consegui enviar "${arquivo.name}": ${error.message}`)
  return supabase.storage.from('anexos').getPublicUrl(caminho).data.publicUrl
}

function Arquivos({ titulo, existentes, novos, onNovos, multiplo = true, dica }: { titulo: string; existentes: string[]; novos: File[]; onNovos: (f: File[]) => void; multiplo?: boolean; dica?: string }) {
  return (
    <div>
      <label style={rot}>{titulo}</label>
      {existentes.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 13, color: '#2563eb', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {nomeArquivo(u)}</a>
      ))}
      {novos.map((f, i) => (
        <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4, color: 'var(--portal-text)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🆕 {f.name}</span>
          <button type="button" onClick={() => onNovos(novos.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', minWidth: 32, minHeight: 32 }} title="Tirar">✕</button>
        </div>
      ))}
      <label style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', border: '1px dashed var(--portal-border)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--portal-text)' }}>
        {existentes.length || novos.length ? '+ Outro arquivo' : '+ Escolher arquivo'}
        <input type="file" hidden multiple={multiplo} accept="application/pdf,image/*,.xml" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; onNovos(multiplo ? [...novos, ...fs] : fs.slice(0, 1)) }} />
      </label>
      {dica && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>{dica}</div>}
    </div>
  )
}

export default function FormConta({ empresa, registro, onSalvo, onCancelar }: {
  empresa: string
  registro?: RegistroPagar | null
  onSalvo: (r: RegistroPagar) => void
  onCancelar: () => void
}) {
  const { userProfile } = useAuth()
  const { log: auditLog } = useAuditLog()
  const r = registro || null
  const parcelasSalvas: Parcela[] = useMemo(() => lista(r?.parcelas_vencimentos).map((p) => {
    const [vencimento, valor] = p.split('|')
    return { vencimento: vencimento || '', valor: valor || '' }
  }), [r])

  const [forn, setForn] = useState<FornecedorEscolhido | null>(null)
  const [metodo, setMetodo] = useState<string>(r?.metodo || '')
  const [valor, setValor] = useState<string>(r?.valor != null ? String(r.valor).replace('.', ',') : '')
  const [vencimento, setVencimento] = useState<string>(r?.data_vencimento || '')
  const [qtd, setQtd] = useState<number>(parcelasSalvas.length || 2)
  const [parcelas, setParcelas] = useState<Parcela[]>(parcelasSalvas)
  const [numeroNF, setNumeroNF] = useState<string>(r?.numero_NF || '')
  const [motivo, setMotivo] = useState<string>(r?.motivo || '')
  const [autonomo, setAutonomo] = useState<boolean>(!!r?.autonomo_sem_nota)
  const [novosNF, setNovosNF] = useState<File[]>([])
  const [novosBoleto, setNovosBoleto] = useState<File[]>([])
  const [novosOutros, setNovosOutros] = useState<File[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  // Rascunho que já existe: o fornecedor é só um nome em finan_pagar — acha o cadastro (CNPJ da NF primeiro, depois o nome).
  useEffect(() => {
    if (!r?.fornecedor) return
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('Fornecedores').select('id, nome, "cpf/cnpj", cidade, estado').ilike('nome', String(r.fornecedor).trim()).limit(5)
      const doc = soDig(r.nfe_cnpj_emitente)
      const linhas = (data || []) as unknown as FornLinha[]
      let achado: FornLinha | undefined = linhas.find((f) => doc && soDig(f['cpf/cnpj']) === doc) || linhas[0]
      if (!achado && doc) {
        const { data: porDoc } = await supabase.from('Fornecedores').select('id, nome, "cpf/cnpj", cidade, estado')
        achado = ((porDoc || []) as unknown as FornLinha[]).find((f) => soDig(f['cpf/cnpj']) === doc)
      }
      if (!vivo) return
      setForn(achado
        ? { id: achado.id, nome: String(achado.nome).trim(), documento: soDig(achado['cpf/cnpj']), cidade: achado.cidade, estado: achado.estado }
        : { id: '', nome: String(r.fornecedor).trim(), documento: '' })
    })()
    return () => { vivo = false }
  }, [r])

  const anexosNF = lista(r?.anexo_nf)
  const anexosBoleto = lista(r?.anexo_boleto)
  const anexosOutros = lista(r?.anexo_requisicao)
  const parcelado = metodo === 'Boleto Parcelado'
  const dispensaNota = autonomo || metodo === 'Carnê ISS'

  const salvar = async () => {
    const problemas = validarNovaConta({
      fornecedor: forn?.nome || '', fornecedorTemDocumento: !!forn?.documento, valor, metodo, vencimento, parcelas,
      numeroNF, motivo, autonomoSemNota: autonomo,
      temAnexoNF: anexosNF.length + novosNF.length > 0, temBoleto: anexosBoleto.length + novosBoleto.length > 0,
    })
    setErros(problemas)
    if (problemas.length) return
    setSalvando(true)
    try {
      const urlsNF = [...anexosNF, ...(await Promise.all(novosNF.map(subir)))]
      const urlsBoleto = [...anexosBoleto, ...(await Promise.all(novosBoleto.map(subir)))]
      const urlsOutros = [...anexosOutros, ...(await Promise.all(novosOutros.map(subir)))]
      const total = lerValor(valor)
      const dados: Record<string, unknown> = {
        fornecedor: forn!.nome,
        valor: total,
        metodo,
        data_vencimento: parcelado ? parcelas[0].vencimento : vencimento,
        qtd_parcelas: parcelado ? parcelas.length : null,
        parcelas_vencimentos: parcelado ? parcelasParaTexto(parcelas) : null,
        numero_NF: dispensaNota ? (numeroNF.trim() || null) : numeroNF.trim(),
        motivo: motivo.trim(),
        autonomo_sem_nota: autonomo,
        anexo_nf: urlsNF.join(', ') || null,
        anexo_boleto: urlsBoleto.join(', ') || null,
        anexo_requisicao: urlsOutros.join(', ') || null,
        // o envio ao Omie acha o fornecedor pelo CNPJ antes do nome — evita pegar um homônimo
        nfe_cnpj_emitente: forn!.documento || r?.nfe_cnpj_emitente || null,
        omie_empresa: empresa,
      }
      let salvo: RegistroPagar
      if (r) {
        const { data, error } = await supabase.from('finan_pagar').update(dados).eq('id', r.id).select().single()
        if (error) throw error
        salvo = data as RegistroPagar
        auditLog({ sistema: 'financeiro', acao: 'editar', entidade: 'finan_pagar', entidade_id: String(r.id), entidade_label: `Pagar #${r.id} - ${forn!.nome}`, detalhes: { origem: 'lancar-conta' } })
      } else {
        const novo = { ...dados, status: 'financeiro', status_envio: 'rascunho', is_requisicao: false, criado_por: userProfile?.nome || null }
        const { data, error } = await supabase.from('finan_pagar').insert([novo]).select().single()
        if (error) throw error
        salvo = data as RegistroPagar
        auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'finan_pagar', entidade_id: String(salvo.id), entidade_label: `Pagar #${salvo.id} - ${forn!.nome}`, detalhes: { origem: 'lancar-conta', valor: total, metodo, nf: numeroNF } })
      }
      onSalvo(salvo)
    } catch (e) {
      setErros([e instanceof Error ? e.message : String(e)])
    } finally { setSalvando(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={rot}>Fornecedor *</label>
        <FornecedorPicker valor={forn} onChange={setForn} />
      </div>

      <div style={grade}>
        <div>
          <label style={rot}>Forma de pagamento *</label>
          <select style={inp} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="">Escolha…</option>
            {METODOS_PAGAMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={rot}>Valor total (R$) *</label>
          <input style={inp} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        {!parcelado && (
          <div>
            <label style={rot}>Vencimento *</label>
            <input style={inp} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
        )}
      </div>

      {parcelado && (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: 110 }}>
              <label style={rot}>Parcelas</label>
              <input style={inp} type="number" min={2} max={48} value={qtd} onChange={(e) => setQtd(Number(e.target.value) || 2)} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={rot}>1º vencimento</label>
              <input style={inp} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <button type="button" onClick={() => setParcelas(gerarParcelas(lerValor(valor), Math.max(2, qtd), vencimento))}
              style={{ minHeight: 42, padding: '0 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fefefe', fontWeight: 600, cursor: 'pointer' }}>
              Gerar parcelas
            </button>
          </div>
          {parcelas.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>{i + 1}ª</span>
              <input style={inp} type="date" value={p.vencimento} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))} />
              <input style={inp} inputMode="decimal" value={p.valor} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            </div>
          ))}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--portal-text)', minHeight: 40, cursor: 'pointer' }}>
        <input type="checkbox" checked={autonomo} onChange={(e) => setAutonomo(e.target.checked)} style={{ width: 20, height: 20 }} />
        Prestador autônomo (sem nota e sem boleto)
      </label>

      <div style={grade}>
        <div>
          <label style={rot}>Nº da nota fiscal {dispensaNota ? '' : '*'}</label>
          <input style={inp} value={numeroNF} onChange={(e) => setNumeroNF(e.target.value)} placeholder={dispensaNota ? 'opcional' : 'ex.: 14052'} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={rot}>Motivo * <span style={{ color: 'var(--portal-text-muted)' }}>— vai na observação do Omie</span></label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: parafusos para a oficina" />
        </div>
      </div>

      <div style={grade}>
        {!dispensaNota && <Arquivos titulo="Nota fiscal *" existentes={anexosNF} novos={novosNF} onNovos={setNovosNF} dica="PDF, XML ou foto" />}
        {metodo.startsWith('Boleto') && !autonomo && <Arquivos titulo="Boleto(s) *" existentes={anexosBoleto} novos={novosBoleto} onNovos={setNovosBoleto} />}
        <Arquivos titulo="Outros anexos" existentes={anexosOutros} novos={novosOutros} onNovos={setNovosOutros} dica="recibo, orçamento, requisição…" />
      </div>

      {erros.length > 0 && (
        <div style={{ border: '1px solid #fca5a5', background: 'rgba(220,38,38,.07)', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 14 }}>
          {erros.map((e) => <div key={e}>• {e}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancelar} style={{ minHeight: 44, padding: '0 18px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando}
          style={{ minHeight: 44, padding: '0 20px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fefefe', fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
          {salvando ? 'Salvando…' : r ? 'Salvar e continuar →' : 'Continuar para o Omie →'}
        </button>
      </div>
    </div>
  )
}
