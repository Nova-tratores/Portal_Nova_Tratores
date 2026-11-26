'use client'
// Ctrl+K NA CENTRAL DE TRABALHO (melhorias 5.4, 25/11/2026). Uma caixa só para:
//  · pedir em linguagem natural — "pedir pro Mariano atualizar custo das máquinas até sexta" abre o
//    formulário de pedido JÁ PREENCHIDO (pessoa, título, prazo) para revisar e enviar. Nunca cria direto.
//  · ir para uma tela ("minha fila", "faxina", "agenda") ou um pedido ("#305").
// Quem é quem vem da leitura do navegador (financeiro_usu, igual ao seletor de pessoas). Sem IA:
// as regras estão em lib/trabalho/comando.ts, com as frases de teste.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Search, Send, ArrowRight, Hash, CornerDownLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ehContaTeste } from '@/lib/texto'
import { interpretarComando, DESTINOS, type PessoaCmd } from '@/lib/trabalho/comando'

const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })

const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const EXEMPLOS = ['pedir pro Mariano atualizar custo das máquinas até sexta', 'minha fila', 'faxina', '#305']

export default function PaletaComandos() {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [texto, setTexto] = useState('')
  const [pessoas, setPessoas] = useState<PessoaCmd[] | null>(null)
  const [pedido, setPedido] = useState<{ responsavel?: string; titulo: string; prazo?: string } | null>(null)
  const [erro, setErro] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Ctrl+K / ⌘K em qualquer tela da Central
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAberta((a) => !a) }
      else if (e.key === 'Escape') setAberta(false)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  useEffect(() => {
    if (!aberta) return
    setTimeout(() => input.current?.focus(), 0)
    if (pessoas) return
    ;(async () => {
      const { data } = await supabase.from('financeiro_usu').select('id, nome, ativo').order('nome')
      setPessoas(((data || []) as { id: string; nome: string | null; ativo: boolean | null }[])
        .filter((u) => u.nome && u.ativo !== false && !ehContaTeste(u as { nome: string })).map((u) => ({ id: u.id, nome: u.nome!.trim() })))
    })()
  }, [aberta, pessoas])

  const cmd = useMemo(() => interpretarComando(texto, pessoas || [], hojeISO()), [texto, pessoas])
  const telas = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return t && !cmd ? DESTINOS.filter((d) => d.rotulo.toLowerCase().includes(t) || d.chaves.some((c) => c.startsWith(t))).slice(0, 5) : []
  }, [texto, cmd])

  const fechar = () => { setAberta(false); setTexto(''); setErro('') }
  const executar = async () => {
    setErro('')
    if (!cmd) { if (telas[0]) { router.push(telas[0].destino); fechar() } return }
    if (cmd.tipo === 'ir') { router.push(cmd.destino); fechar(); return }
    if (cmd.tipo === 'ticket') {
      // RLS: só acha o pedido que a pessoa pode ver.
      const { data } = await supabase.from('tickets').select('id').eq('numero', cmd.numero).maybeSingle()
      if (!data) { setErro(`Não achei o #${cmd.numero} (ou você não tem acesso a ele).`); return }
      router.push(`/tickets/${(data as { id: string }).id}`); fechar(); return
    }
    // pedir: abre o formulário preenchido para revisar
    setPedido({ responsavel: cmd.pessoa?.id, titulo: cmd.titulo, prazo: cmd.prazo || undefined })
    fechar()
  }

  const linhaPedido = cmd?.tipo === 'pedir' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb' }}><Send size={14} /> Pedir para alguém (você revisa antes de enviar)</span>
      <span>Para: {cmd.pessoa ? <b style={{ fontWeight: 500 }}>{cmd.pessoa.nome}</b>
        : cmd.candidatos.length > 1 ? <span style={{ color: '#b45309' }}>{cmd.candidatos.length} pessoas chamadas “{cmd.mencao}” — escolha no formulário (ou diga o sobrenome)</span>
        : <span style={{ color: '#b45309' }}>não achei “{cmd.mencao}” — escolha no formulário</span>}</span>
      <span>O quê: {cmd.titulo ? <b style={{ fontWeight: 500 }}>{cmd.titulo}</b> : <span style={{ color: 'var(--portal-text-muted,#64748b)' }}>(escreva depois do nome)</span>}</span>
      <span>Prazo: {cmd.prazo ? <b style={{ fontWeight: 500 }}>{br(cmd.prazo)}</b> : <span style={{ color: 'var(--portal-text-muted,#64748b)' }}>sem prazo na frase (escolha no formulário)</span>}</span>
    </div>
  )

  return (
    <>
      <button onClick={() => setAberta(true)} title="Pedir ou ir para uma tela escrevendo (Ctrl+K)" aria-label="Abrir comandos (Ctrl+K)"
        style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 9, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#475569)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Search size={14} /> <span className="ct-k-txt">Pedir ou ir…</span> <kbd style={{ fontSize: 11, padding: '1px 5px', borderRadius: 5, border: '1px solid var(--portal-border,#e5e7eb)' }}>Ctrl K</kbd>
      </button>
      {aberta && (
        <div onClick={fechar} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 16px' }}>
          <div role="dialog" aria-modal="true" aria-label="Comandos" onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(620px,100%)', borderRadius: 16, background: 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)', boxShadow: '0 30px 70px -30px rgba(15,23,42,.7)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--portal-border,#e2e8f0)' }}>
              <Search size={18} color="#64748b" />
              <input ref={input} value={texto} onChange={(e) => { setTexto(e.target.value); setErro('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); executar() } }}
                placeholder="pedir pro Mariano atualizar o custo até sexta · minha fila · #305" aria-label="O que você quer fazer?"
                style={{ flex: 1, minWidth: 0, height: 34, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: 16, fontFamily: 'inherit' }} />
              <kbd style={{ fontSize: 11, padding: '1px 6px', borderRadius: 5, border: '1px solid var(--portal-border,#e5e7eb)', color: '#64748b' }}>Esc</kbd>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
              {!texto.trim() && (
                <>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Escreva do jeito que você fala. Exemplos:</span>
                  {EXEMPLOS.map((x) => (
                    <button key={x} onClick={() => setTexto(x)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#2563eb', fontSize: 13.5, fontFamily: 'inherit', textAlign: 'left' }}>{x}</button>
                  ))}
                </>
              )}
              {linhaPedido}
              {cmd?.tipo === 'ir' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}><ArrowRight size={14} color="#2563eb" /> Ir para <b style={{ fontWeight: 500 }}>{cmd.rotulo}</b></span>}
              {cmd?.tipo === 'ticket' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}><Hash size={14} color="#2563eb" /> Abrir o pedido <b style={{ fontWeight: 500 }}>#{cmd.numero}</b></span>}
              {texto.trim() && !cmd && (telas.length
                ? telas.map((t, k) => (
                  <button key={t.destino} onClick={() => { router.push(t.destino); fechar() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: k === 0 ? 'var(--portal-bg-secondary,#f1f5f9)' : 'transparent', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', textAlign: 'left' }}>
                    <ArrowRight size={14} color="#2563eb" /> {t.rotulo}
                  </button>
                ))
                : <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Não entendi. Comece com “pedir pro …”, o nome de uma tela, ou #número.</span>)}
              {erro && <span style={{ fontSize: 13, color: '#dc2626' }}>{erro}</span>}
              {(cmd || telas.length > 0) && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}><CornerDownLeft size={12} /> Enter para {cmd?.tipo === 'pedir' ? 'abrir o pedido preenchido' : 'ir'}</span>}
            </div>
          </div>
        </div>
      )}
      {pedido && (
        <FormTicket responsavelInicial={pedido.responsavel} tituloInicial={pedido.titulo} prazoInicial={pedido.prazo}
          onFechar={() => setPedido(null)} onCriado={() => { setPedido(null); window.dispatchEvent(new Event('central-trabalho-mudou')) }} />
      )}
    </>
  )
}
