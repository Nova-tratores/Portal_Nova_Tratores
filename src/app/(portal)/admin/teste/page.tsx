'use client'
// Página de teste do editor de permissões (docs/padrao-telas.md §5): Opção 1 = editor
// atual (pílulas), Opção 2 = cartões com caixinhas. Os dois editam um RASCUNHO do
// modulos_permitidos da pessoa escolhida; só grava no "Salvar" (mesma rota do Admin,
// /api/admin/permissoes). Só admin/dev.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RotateCcw, Save, HelpCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { MODULOS_ADMIN } from '@/lib/permissoes/modulos-admin'
import PermissoesModulos from '@/components/admin/PermissoesModulos'
import PermissoesCartoes from '@/components/admin/PermissoesCartoes'
import PermissoesLista from '@/components/admin/PermissoesLista'
import { acoesDoModulo } from '@/lib/permissoes/catalogo'

interface Usuario { id: string; nome: string; funcao: string | null; ativo?: boolean }
// 3, 4 e 5 = lista em linhas (José, 10/11/2026: "essa distribuição está horrível, melhora")
type Opcao = 1 | 2 | 3 | 4 | 5

const VERMELHO = '#dc2626'
// 'pos:editar' -> 'Pós-Vendas (OS) · Editar OS'; 'pos' -> 'Pós-Vendas (OS) (inteiro)'
function rotulo(chave: string): string {
  const [mod, ...resto] = chave.split(':')
  const acao = resto.join(':')
  const nomeMod = MODULOS_ADMIN.find((m) => m.id === mod)?.label || mod
  if (!acao) return `${nomeMod} (inteiro)`
  return `${nomeMod} · ${acoesDoModulo(mod).find((a) => a.id === acao)?.label || acao}`
}
const igual = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

export default function TestePermissoesPage() {
  const { userProfile } = useAuth()
  const { isAdmin, isDev, loading } = usePermissoes(userProfile?.id)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [salvo, setSalvo] = useState<Record<string, string[]>>({})
  const [userId, setUserId] = useState('')
  const [rascunho, setRascunho] = useState<string[]>([])
  const [opcao, setOpcao] = useState<Opcao>(3)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ajuda, setAjuda] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      const [{ data: us }, { data: perms }] = await Promise.all([
        supabase.from('financeiro_usu').select('id, nome, funcao, ativo').order('nome'),
        supabase.from('portal_permissoes').select('user_id, modulos_permitidos'),
      ])
      setUsuarios(((us || []) as Usuario[]).filter((u) => u.ativo !== false))
      const m: Record<string, string[]> = {}
      for (const p of (perms || []) as { user_id: string; modulos_permitidos: string[] | null }[]) m[p.user_id] = p.modulos_permitidos || []
      setSalvo(m)
    })()
  }, [isAdmin])

  const original = useMemo(() => salvo[userId] || [], [salvo, userId])
  const mudou = !!userId && !igual(original, rascunho)
  const diferencas = useMemo(() => {
    const a = new Set(original), b = new Set(rascunho)
    return { ganha: rascunho.filter((x) => !a.has(x)), perde: original.filter((x) => !b.has(x)) }
  }, [original, rascunho])

  const escolher = (id: string) => {
    if (mudou && !confirm('Há mudanças não salvas para esta pessoa. Trocar mesmo assim?')) return
    setUserId(id)
    setRascunho(salvo[id] || [])
    setAviso(null)
  }

  const salvar = async () => {
    setSalvando(true); setAviso(null)
    try {
      const r = await fetch('/api/admin/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ user_id: userId, updates: { modulos_permitidos: rascunho } }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setSalvo((s) => ({ ...s, [userId]: rascunho }))
      setAviso({ tipo: 'ok', texto: 'Salvo. Vale na hora para a pessoa (o portal relê sozinho).' })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally { setSalvando(false) }
  }

  if (loading) return null
  if (!isAdmin) return <SemPermissao />

  const pessoa = usuarios.find((u) => u.id === userId)
  const botaoOpcao = (n: Opcao, rotulo: string) => (
    <button type="button" onClick={() => setOpcao(n)} style={{
      padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      border: `1px solid ${opcao === n ? VERMELHO : 'var(--portal-border)'}`,
      background: opcao === n ? VERMELHO : 'var(--portal-bg-card)', color: opcao === n ? '#fefefe' : 'var(--portal-text)',
    }}>{rotulo}</button>
  )

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Administração
        </Link>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>PÁGINA DE TESTE</span>
        <div style={{ flex: 1 }} />
        {botaoOpcao(3, 'A · lista com pílulas')}
        {botaoOpcao(4, 'B · lista sanfona')}
        {botaoOpcao(5, 'C · lista + painel')}
        {botaoOpcao(2, 'Atual · cartões')}
        {botaoOpcao(1, 'Antigo')}
        <button type="button" onClick={() => setAjuda((v) => !v)} title="Como ler esta tela"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, fontSize: 13, cursor: 'pointer', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
          <HelpCircle size={15} /> Como ler esta tela
        </button>
      </div>

      {ajuda && (
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--portal-text)' }}>
          <b>Novas (10/11):</b> <b>A</b> = cada módulo numa linha, com as ações em pílulas ao lado (clicou, liga/desliga). <b>B</b> = a linha mostra só o módulo; a seta abre as ações embaixo. <b>C</b> = lista à esquerda e as ações do módulo escolhido num painel à direita (no celular vira a B). Em todas, a caixinha da esquerda dá ou tira o módulo inteiro e cada grupo tem "Dar todos / Tirar todos".<br />
          <b>Para que serve:</b> comparar jeitos de marcar o que cada pessoa pode fazer no portal. Escolha a pessoa, alterne entre a Opção 1 e a Opção 2 e veja qual é mais prático.<br />
          <b>Opção 2 (cartões):</b> cada cartão é um módulo. A caixinha do título dá o <b>módulo inteiro</b>; as caixinhas de baixo dão só aquela ação. Caixinha com traço (–) = a pessoa tem só parte do módulo. O número no canto (ex.: 3/7) mostra quantas ações ela tem.<br />
          <b>“À parte”</b> = ação que o módulo inteiro não dá (precisa marcar sozinha, ex.: Faturar OS). <b>Cadeado</b> = só um Dev pode mexer.<br />
          <b>Nada grava sozinho:</b> as duas opções mexem num rascunho. O quadro de baixo mostra o que a pessoa ganha e perde; só vale depois de <b>Salvar</b>. <b>Desfazer</b> volta ao que está gravado.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <select value={userId} onChange={(e) => escolher(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, minWidth: 260 }}>
          <option value="">Escolha a pessoa…</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.funcao ? ` — ${u.funcao}` : ''}</option>)}
        </select>
        {pessoa && (
          <>
            <button type="button" disabled={!mudou || salvando} onClick={salvar} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
              border: 'none', background: mudou ? VERMELHO : 'var(--portal-border)', color: '#fefefe', cursor: mudou && !salvando ? 'pointer' : 'default',
            }}><Save size={15} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" disabled={!mudou || salvando} onClick={() => { setRascunho(original); setAviso(null) }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, fontSize: 13.5,
              border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: mudou ? 'pointer' : 'default', opacity: mudou ? 1 : 0.5,
            }}><RotateCcw size={15} /> Desfazer</button>
            <span style={{ fontSize: 12.5, color: mudou ? '#c2410c' : 'var(--portal-text-muted)' }}>
              {mudou ? `${diferencas.ganha.length + diferencas.perde.length} mudança(s) não salva(s)` : 'Igual ao que está gravado'}
            </span>
          </>
        )}
      </div>

      {aviso && (
        <div style={{ padding: '9px 12px', borderRadius: 10, fontSize: 13, border: `1px solid ${aviso.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, background: aviso.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', color: aviso.tipo === 'ok' ? '#166534' : '#b91c1c' }}>{aviso.texto}</div>
      )}

      {mudou && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
          {diferencas.ganha.map((x) => <span key={'g' + x} style={{ padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>+ {rotulo(x)}</span>)}
          {diferencas.perde.map((x) => <span key={'p' + x} style={{ padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>− {rotulo(x)}</span>)}
        </div>
      )}

      {!pessoa ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14, borderRadius: 12, border: '1px dashed var(--portal-border)' }}>
          Escolha uma pessoa para ver e mexer nas permissões dela.
        </div>
      ) : opcao >= 3 ? (
        <PermissoesLista modo={opcao === 3 ? 'pilulas' : opcao === 4 ? 'sanfona' : 'painel'} modulos={rascunho} catalogo={MODULOS_ADMIN} onChange={setRascunho} disabled={salvando} souDev={isDev} />
      ) : opcao === 1 ? (
        <PermissoesModulos modulos={rascunho} catalogo={MODULOS_ADMIN} onChange={setRascunho} disabled={salvando} souDev={isDev} />
      ) : (
        <PermissoesCartoes modulos={rascunho} catalogo={MODULOS_ADMIN} onChange={setRascunho} disabled={salvando} souDev={isDev} />
      )}
    </div>
  )
}
