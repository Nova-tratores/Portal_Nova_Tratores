'use client'
// Página de TESTE do "Faturamento por período" renovado (José, 21/10/2026). Dados reais; nada aqui muda o Painel.
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useBasePosVendas } from '@/components/mecanicos/useBasePosVendas'
import { FaturamentoPeriodo, ESTILO_FP } from '@/components/mecanicos/FaturamentoPeriodo'
import { ESTILO_PA } from '@/components/mecanicos/ParadoOpcoes'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default function TesteFaturamentoPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const { base } = useBasePosVendas()
  const [forma, setForma] = useState<'linha' | 'grade' | 'escada'>('escada')
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', background: 'var(--portal-bg, #f8fafc)', minHeight: '100vh', color: '#0f172a' }}>
      <style>{ESTILO_FP}</style>
      <style>{ESTILO_PA}</style>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <span style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: 99, padding: '3px 10px' }}>página de teste</span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Faturamento por período — versão nova</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: '#334155', maxWidth: 1000 }}>Escolha como trocar de período e ligue ou desligue garantia, internas e OS ainda não faturadas em &quot;O que entra na conta&quot;. Passe o mouse em qualquer número para ver o que ele significa. Nada aqui muda o Painel.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
          <span>Trocar de período:</span>
          {([['escada', '3 · Quatro cartões (dia, semana, mês, ano)'], ['linha', '1 · Linha do tempo'], ['grade', '2 · Grade (ano › mês › semana › dia)']] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setForma(k)} style={{ border: '1px solid #cbd5e1', background: forma === k ? '#0f172a' : '#fefefe', color: forma === k ? '#fefefe' : '#0f172a', borderRadius: 99, padding: '6px 14px', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>{r}</button>
          ))}
        </div>
      </div>
      {!base ? <div style={{ padding: 40, textAlign: 'center', color: '#334155' }}>carregando…</div> : <FaturamentoPeriodo key={forma} base={base} hoje={hojeSP()} forma={forma} />}
    </div>
  )
}
