'use client'
// Caixa › Lançar conta (12/11/2026, pedido: "criar e lançar contas novas no Omie pelo Financeiro", como as Requisições).
// Uma janela em dois passos: (1) dados da conta → grava em `finan_pagar` como rascunho; (2) categoria, conta
// corrente, projeto… + checklist → "Lançar no Omie" (a mesma rota e as mesmas travas do painel antigo).
// A lista "Para lançar" junta os rascunhos que vieram das Requisições e os que alguém começou aqui e não terminou.
// Empresa = o NOVA/CASTRO do topo do Financeiro (sem outro seletor na tela).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useEmpresaFinanceiro } from '@/components/financeiro/empresaFinanceiro'
import { EnviarParaOmieBox } from '@/components/financeiro/OmieContaPagar'
import FormConta, { type RegistroPagar } from './FormConta'
import { empresaDoRegistro, faltaLancar } from '@/lib/financeiro/lancar-conta'
import { requisicaoIdsDe } from '@/lib/financeiro/rastreio/agrupar'

const COLS = 'id, fornecedor, valor, data_vencimento, motivo, numero_NF, metodo, status, status_envio, criado_por, criado_em, requisicao_ids, is_requisicao, omie_cod_lancamento, omie_empresa, omie_sync_em, omie_ultimo_erro, qtd_parcelas'

const brl = (v: unknown) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('pt-BR') : '—')

type Janela = { passo: 'dados' | 'omie'; registro: RegistroPagar | null } | null

export default function LancarConta() {
  const { userProfile } = useAuth()
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id)
  const [empresaFin] = useEmpresaFinanceiro()
  const empresa = empresaFin === 'castro' ? 'Castro Peças' : 'Nova Tratores'

  const [aba, setAba] = useState<'pendentes' | 'lancadas'>('pendentes')
  const [pendentes, setPendentes] = useState<RegistroPagar[]>([])
  const [lancadas, setLancadas] = useState<RegistroPagar[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [janela, setJanela] = useState<Janela>(null)
  const [ajuda, setAjuda] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const [p, l] = await Promise.all([
      supabase.from('finan_pagar').select(COLS).is('omie_cod_lancamento', null).order('id', { ascending: false }).limit(300),
      supabase.from('finan_pagar').select(COLS).not('omie_cod_lancamento', 'is', null).order('id', { ascending: false }).limit(60),
    ])
    if (p.error || l.error) setErro((p.error || l.error)!.message)
    setPendentes(((p.data || []) as RegistroPagar[]).filter((r) => faltaLancar(r) && empresaDoRegistro(r) === empresa))
    setLancadas(((l.data || []) as RegistroPagar[]).filter((r) => empresaDoRegistro(r) === empresa))
    setCarregando(false)
  }, [empresa])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a lista ao abrir e ao trocar a empresa do topo
  useEffect(() => { carregar() }, [carregar])

  // abrir um registro pelo link (?id=)
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('id'))
    if (!id) return
    supabase.from('finan_pagar').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setJanela({ passo: 'omie', registro: data as RegistroPagar })
    })
  }, [])

  const abrir = async (id: number) => {
    const { data, error } = await supabase.from('finan_pagar').select('*').eq('id', id).single()
    if (error || !data) { alert('Não consegui abrir a conta: ' + (error?.message || 'não achada')); return }
    setJanela({ passo: 'omie', registro: data as RegistroPagar })
  }

  const fechar = () => { setJanela(null); carregar() }

  const filtrar = (rs: RegistroPagar[]) => {
    const t = busca.trim().toLowerCase()
    if (!t) return rs
    return rs.filter((r) => [r.id, r.fornecedor, r.numero_NF, r.motivo, r.criado_por, r.omie_cod_lancamento].some((x) => String(x ?? '').toLowerCase().includes(t)))
  }
  const linhas = filtrar(aba === 'pendentes' ? pendentes : lancadas)

  if (!permLoading && userProfile && !pode('financeiro', 'lancar-conta')) return <SemPermissao />

  const btn: React.CSSProperties = { minHeight: 44, padding: '0 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fefefe', fontWeight: 600, fontSize: 15, cursor: 'pointer' }
  const chip = (ativo: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 999, border: `1px solid ${ativo ? '#2563eb' : 'var(--portal-border)'}`, background: ativo ? '#2563eb' : 'transparent', color: ativo ? '#fefefe' : 'var(--portal-text)', cursor: 'pointer', fontSize: 14 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => setJanela({ passo: 'dados', registro: null })}>+ Nova conta a pagar</button>
        <button style={chip(aba === 'pendentes')} onClick={() => setAba('pendentes')}>Para lançar ({pendentes.length})</button>
        <button style={chip(aba === 'lancadas')} onClick={() => setAba('lancadas')}>Lançadas</button>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, NF, nº…"
          style={{ flex: '1 1 200px', minHeight: 42, padding: '0 12px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-surface, #fff)', color: 'var(--portal-text)', fontSize: 15 }} />
        <button onClick={() => setAjuda((v) => !v)} title="Como funciona" style={{ ...chip(ajuda), width: 40, padding: 0 }}>?</button>
      </div>

      {ajuda && (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: '12px 16px', background: 'var(--portal-surface, #fff)', fontSize: 14, lineHeight: 1.6, color: 'var(--portal-text)' }}>
          <b>Como funciona</b>
          <div>1. <b>Nova conta a pagar</b>: fornecedor, valor, vencimento (ou parcelas), nº da nota, motivo e os anexos (nota e boleto). Fornecedor que não existe se cadastra ali mesmo, pelo CNPJ.</div>
          <div>2. Depois vêm os dados do Omie (categoria, conta corrente, projeto, departamento) e o checklist. <b>Lançar no Omie</b> cria a conta lá na hora, com os anexos.</div>
          <div><b>Para lançar</b> = contas criadas aqui ou pelas Requisições que ainda não foram ao Omie. <b>Lançadas</b> = as últimas que já têm nº no Omie.</div>
          <div>A empresa é a escolhida no topo (<b>{empresa}</b>).</div>
        </div>
      )}

      {erro && <div style={{ color: '#dc2626' }}>Erro ao carregar: {erro}</div>}

      <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, background: 'var(--portal-surface, #fff)', overflow: 'hidden' }}>
        {carregando ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>
        ) : linhas.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)' }}>
            {aba === 'pendentes' ? `Nenhuma conta esperando para ir ao Omie (${empresa}).` : 'Nenhuma conta lançada ainda.'}
          </div>
        ) : linhas.map((r) => {
          const reqs = requisicaoIdsDe(r)
          return (
            <button key={r.id} onClick={() => abrir(r.id)}
              style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', minHeight: 56, textAlign: 'left', border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', width: 48, fontVariantNumeric: 'tabular-nums' }}>#{r.id}</span>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fornecedor || '(sem fornecedor)'}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[r.metodo, r.numero_NF ? `NF ${r.numero_NF}` : null, reqs.length ? `Req ${reqs.map((x) => `#${x}`).join(' ')}` : null, r.criado_por ? `por ${r.criado_por}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span style={{ fontSize: 13, color: 'var(--portal-text-muted)', minWidth: 90 }}>vence {dia(r.data_vencimento)}{r.qtd_parcelas ? ` · ${r.qtd_parcelas}x` : ''}</span>
              <span style={{ fontWeight: 600, minWidth: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{brl(r.valor)}</span>
              {aba === 'pendentes' ? (
                r.status_envio === 'erro'
                  ? <span title={r.omie_ultimo_erro || ''} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'rgba(220,38,38,.12)', color: '#dc2626' }}>deu erro no Omie</span>
                  : <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'rgba(217,119,6,.12)', color: '#b45309' }}>falta lançar</span>
              ) : (
                <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'rgba(22,163,74,.12)', color: '#15803d' }}>Omie nº {r.omie_cod_lancamento}</span>
              )}
            </button>
          )
        })}
      </div>

      {janela && <JanelaConta janela={janela} setJanela={setJanela} empresa={empresa} onFechar={fechar} />}
    </div>
  )
}

function JanelaConta({ janela, setJanela, empresa, onFechar }: { janela: NonNullable<Janela>; setJanela: (j: Janela) => void; empresa: string; onFechar: () => void }) {
  const r = janela.registro
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  const reqs = r ? requisicaoIdsDe(r) : []
  const lancada = !!r?.omie_cod_lancamento

  return (
    <div className="lc-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 'clamp(0px, 3vw, 32px)' }}>
      <style>{`@media (max-width: 640px){ .lc-caixa{ border-radius:0 !important; min-height:100vh; } }`}</style>
      <div className="lc-caixa" style={{ width: '100%', maxWidth: 860, background: 'var(--portal-bg-secondary, #f8fafc)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.3)', color: 'var(--portal-text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', position: 'sticky', top: 0, background: 'var(--portal-bg-secondary, #f8fafc)', borderRadius: '14px 14px 0 0', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{r ? `Conta a pagar #${r.id}` : 'Nova conta a pagar'} · {empresa}</div>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>
              {lancada ? 'Já está no Omie' : janela.passo === 'dados' ? 'Passo 1 de 2 — dados da conta' : 'Passo 2 de 2 — lançar no Omie'}
              {reqs.length ? ` · veio da Req ${reqs.map((x) => `#${x}`).join(' ')}` : ''}
            </div>
          </div>
          <button onClick={onFechar} title="Fechar (Esc)" style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: 'var(--portal-text)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 'clamp(14px, 3vw, 22px)' }}>
          {janela.passo === 'dados' ? (
            <FormConta
              empresa={empresa}
              registro={r}
              onCancelar={() => (r ? setJanela({ passo: 'omie', registro: r }) : onFechar())}
              onSalvo={(salvo) => setJanela({ passo: 'omie', registro: salvo })}
            />
          ) : r && (
            <>
              <Resumo r={r} />
              {!lancada && (
                <button onClick={() => setJanela({ passo: 'dados', registro: r })}
                  style={{ marginTop: 10, minHeight: 40, padding: '0 14px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>
                  ✎ Corrigir dados da conta
                </button>
              )}
              {r.omie_ultimo_erro && !lancada && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#dc2626' }}>Última tentativa no Omie deu erro: {r.omie_ultimo_erro}</div>
              )}
              <EnviarParaOmieBox
                key={`${r.id}-${r.omie_cod_lancamento || ''}`}
                finanPagar={r}
                empresaFixa={empresa}
                textoBotao="Lançar no Omie"
                onSynced={(patch: Record<string, unknown>) => setJanela({ passo: 'omie', registro: { ...r, ...patch } })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Resumo({ r }: { r: RegistroPagar }) {
  const anexos = (['anexo_nf', 'anexo_boleto', 'anexo_requisicao'] as const).flatMap((k) =>
    String(r[k] || '').split(',').map((u) => u.trim()).filter(Boolean).map((u) => ({ k, u })))
  const rotulo = { anexo_nf: 'Nota', anexo_boleto: 'Boleto', anexo_requisicao: 'Anexo' }
  const parcelas = String(r.parcelas_vencimentos || '').split(',').map((p) => p.trim()).filter(Boolean)
  const item = (t: string, v: React.ReactNode) => (
    <div><div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{t}</div><div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{v || '—'}</div></div>
  )
  return (
    <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: 14, background: 'var(--portal-surface, #fff)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
        {item('Fornecedor', r.fornecedor)}
        {item('Valor', brl(r.valor))}
        {item('Forma', r.metodo)}
        {item(parcelas.length ? 'Parcelas' : 'Vencimento', parcelas.length
          ? parcelas.map((p) => { const [d, v] = p.split('|'); return <div key={p}>{dia(d)} · {brl(v)}</div> })
          : dia(r.data_vencimento))}
        {item('Nota fiscal', r.autonomo_sem_nota ? 'autônomo (sem nota)' : r.numero_NF)}
        {item('Criada por', r.criado_por)}
      </div>
      {r.motivo && <div style={{ marginTop: 10, fontSize: 14 }}><span style={{ color: 'var(--portal-text-muted)' }}>Motivo: </span>{r.motivo}</div>}
      {anexos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {anexos.map(({ k, u }, i) => (
            <a key={`${u}-${i}`} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 13, padding: '6px 10px', minHeight: 32, borderRadius: 8, border: '1px solid var(--portal-border)', color: '#2563eb', textDecoration: 'none' }}>📎 {rotulo[k]}</a>
          ))}
        </div>
      )}
    </div>
  )
}
