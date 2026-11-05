'use client'
// Página de TESTE do cartão Requisições nos Resultados (José, 05/11/2026: "um card a mais do lado de peças, linkado
// com as requisições, onde a gente consegue ver quanto pagamos naqueles serviços e quanto cobramos"). Dados reais;
// nada aqui muda o Painel.
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useBasePosVendas } from '@/components/mecanicos/useBasePosVendas'
import { FaturamentoPeriodo, ESTILO_FP, type VarianteReq } from '@/components/mecanicos/FaturamentoPeriodo'
import { ESTILO_PA } from '@/components/mecanicos/ParadoOpcoes'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default function TesteRequisicoesPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const { base } = useBasePosVendas()
  const [v, setV] = useState<VarianteReq>('a')
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', background: 'var(--portal-bg, #f8fafc)', minHeight: '100vh', color: '#0f172a' }}>
      <style>{ESTILO_FP}</style>
      <style>{ESTILO_PA}</style>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <span style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: 99, padding: '3px 10px' }}>página de teste</span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Cartão Requisições — ao lado de Peças</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: '#334155', maxWidth: 1000 }}>As requisições das OS que estão na conta: quanto a loja pagou ao fornecedor e quanto cobrou do cliente. Clique no cartão para ver requisição por requisição. Nada aqui muda o Painel.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
          <span>Número grande do cartão:</span>
          {([['a', 'A · O que cobramos (pago embaixo)'], ['b', 'B · Saldo: cobrado − pago']] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setV(k)} style={{ border: '1px solid #cbd5e1', background: v === k ? '#0f172a' : '#fefefe', color: v === k ? '#fefefe' : '#0f172a', borderRadius: 99, padding: '6px 14px', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>{r}</button>
          ))}
        </div>
      </div>
      {!base ? <div style={{ padding: 40, textAlign: 'center', color: '#334155' }}>carregando…</div> : <FaturamentoPeriodo base={base} hoje={hojeSP()} forma="escada" cartaoReq={v} />}
    </div>
  )
}
