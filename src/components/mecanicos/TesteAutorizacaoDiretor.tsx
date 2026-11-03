'use client'
// Página de teste da autorização de comissão (José, 02/11/2026): mostra para o diretor o aviso e a janela REAIS com
// dados de EXEMPLO. Enquanto a tela está aberta, só as chamadas desse pedido de exemplo são respondidas aqui: nada é
// gravado, ninguém é avisado e o RH não é chamado. O aviso é o do PortalLayout (recarrega pelo evento comissao-decidida).
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { htmlAutorizacaoComissao } from '@/lib/mecanicos/autorizacao-comissao-doc'
import type { EventoComissao, LinhaPedido, PedidoComissao } from '@/lib/mecanicos/lancamento-comissao-server'

const API = '/api/mecanicos/lancamento-comissao'
const PCT = 1.5
const r2 = (n: number) => Math.round(n * 100) / 100
const BASES: [string, string, number, boolean][] = [
  ['9001', 'Cliente de exemplo 1', 4200, false], ['9002', 'Cliente de exemplo 2', 3150, false], ['9003', 'Cliente de exemplo 3', 2780, false],
  ['9004', 'Cliente de exemplo 4', 1960, false], ['9005', 'Cliente de exemplo 5', 1240, false], ['9006', 'Cliente de exemplo 6', 860, false],
  ['9007', 'Montadora de exemplo', 3500, true], ['9008', 'Cliente de exemplo 7 (garantia)', 900, true],
]
const ASS_EXEMPLO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="70"><text x="10" y="48" font-family="cursive" font-size="30" fill="#1e3a8a">Assinatura de exemplo</text></svg>')}`

function novoPedido(): PedidoComissao {
  const linhas: LinhaPedido[] = BASES.map(([numero, cliente, base, garantia]) => {
    const v = r2(base * PCT / 100)
    return { os: `EX-${numero}`, numero, cliente, data: '2026-10-15', grupo: garantia ? 'garantia' : 'cliente', regra: `${String(PCT).replace('.', ',')}% da OS (OS + peças)`, calculado: v, valor: v, acao: 'pagar', motivo: '' }
  })
  const total = r2(linhas.reduce((a, l) => a + l.valor, 0))
  return {
    id: `exemplo-${Date.now()}`, tecnico: 'Larissa Garcia', mes: '2026-10', valor: total, calculado: total, linhas, status: 'aguardando', pedido_por: 'Larissa Garcia', pedido_em: new Date().toISOString(),
    decidido_por: null, decidido_em: null, observacao: null, rh_comissao_id: null, rh_erro: null, espelhado_em: null, apontamentos: [], descontos: [],
    info: { nomeRh: null, cargo: null, pct: PCT, pagamento: null, semCaixinha: true }, assinatura_pedido: ASS_EXEMPLO,
  }
}
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
const recarregar = () => window.dispatchEvent(new Event('comissao-decidida'))

export default function TesteAutorizacaoDiretor() {
  const [comRh, setComRh] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; txt: string } | null>(null)
  const [noCliente, setNoCliente] = useState(false)
  const pedidoRef = useRef<PedidoComissao | null>(null)
  const eventosRef = useRef<EventoComissao[]>([])
  const comRhRef = useRef(false)

  const recomecar = useCallback((rh: boolean) => {
    const p = novoPedido()
    pedidoRef.current = p
    eventosRef.current = [{ id: `${p.id}-1`, pedido_id: p.id, tecnico: p.tecnico, mes: p.mes, tipo: 'pedido', autor: p.pedido_por, em: p.pedido_em, valor: p.valor, detalhes: { calculado: p.valor, os: p.linhas.length, mexidas: [] } }]
    comRhRef.current = rh
    setComRh(rh); setResultado(null)
    recarregar()
  }, [])

  useEffect(() => {
    const real = window.fetch
    const decidir = async (b: { acao: 'autorizar' | 'devolver'; observacao?: string; assinatura?: string; apontamentos?: unknown[] }, init?: RequestInit) => {
      const p = pedidoRef.current!
      const agora = new Date().toISOString()
      const ev = (tipo: EventoComissao['tipo'], detalhes: Record<string, unknown>) => eventosRef.current.unshift({ id: `${p.id}-${eventosRef.current.length + 1}`, pedido_id: p.id, tecnico: p.tecnico, mes: p.mes, tipo, autor: tipo === 'espelhada' || tipo === 'erro_rh' ? null : 'Diretor', em: agora, valor: p.valor, detalhes })
      p.decidido_por = 'Diretor'; p.decidido_em = agora; p.observacao = b.observacao || null
      if (b.acao === 'devolver') {
        p.status = 'devolvida'; ev('devolvida', { observacao: b.observacao, apontamentos: b.apontamentos })
        setResultado({ ok: true, txt: 'Devolvida para ajuste. No portal de verdade, nada muda e o pós-vendas recebe o aviso no sino com o que alterar.' })
        return { status: 'devolvida' }
      }
      // só lê a assinatura de quem está logado, para o documento de exemplo sair igual
      if (b.assinatura === 'salva') { try { const r = await real('/api/assinatura/minha', { headers: init?.headers, cache: 'no-store' }); p.assinatura_diretor = (await r.json()).assinatura?.imagem || null } catch { p.assinatura_diretor = null } } else p.assinatura_diretor = b.assinatura
      ev('autorizada', { observacao: b.observacao })
      if (comRhRef.current) {
        p.status = 'espelhada'; ev('espelhada', {})
        setResultado({ ok: true, txt: 'Autorizada e lançada no RH. No portal de verdade, o RH segue para o Omie e para o pagamento.' })
        return { status: 'espelhada' }
      }
      const erro = 'Não achei Larissa Garcia no RH'
      p.status = 'erro_rh'; p.rh_erro = erro; ev('erro_rh', { erro })
      setResultado({ ok: false, txt: `Assinada, mas NÃO lançada: "${erro}". O documento sai com as duas assinaturas, porém a comissão não entra no RH nem no Omie.` })
      return { status: 'erro_rh', erro }
    }
    const documento = () => {
      const p = pedidoRef.current!
      return htmlAutorizacaoComissao({
        codigo: 'EXEMPLO', tecnico: p.tecnico, mes: p.mes, pct: PCT, pagamentoPrevisto: null,
        linhas: p.linhas.map((l) => ({ os: l.os, numero: l.numero, data: l.data || null, cliente: l.cliente, grupo: l.grupo || 'cliente', regra: l.regra || '', calculado: l.calculado, valor: l.valor, acao: l.acao, motivo: l.motivo })),
        solicitante: { nome: 'Larissa Garcia', papel: 'Pós-Vendas · pediu a autorização', em: p.pedido_em, imagem: ASS_EXEMPLO },
        diretor: p.assinatura_diretor ? { nome: p.decidido_por || 'Diretor', papel: 'Diretor · autorizou', em: p.decidido_em || p.pedido_em, imagem: p.assinatura_diretor, observacao: p.observacao } : null,
        descontos: [], logo: `${window.location.origin}/Logo_Nova.png`, emitidoEm: new Date().toISOString(),
      })
    }
    window.fetch = async (input, init) => {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
      const p = pedidoRef.current
      if (u.origin === window.location.origin && p) {
        if (u.pathname === `${API}/pendentes-diretor`) return json({ diretor: true, pedidos: p.status === 'aguardando' ? [p] : [] })
        if (u.pathname === `${API}/documento` && u.searchParams.get('id') === p.id) return new Response(documento(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        if (u.pathname === API) {
          if (init?.method === 'PATCH') {
            const b = JSON.parse(String(init.body))
            if (b.id === p.id) return json(await decidir(b, init))
          } else if (!init?.method || init.method === 'GET') {
            if (u.searchParams.get('eventos')) return json({ eventos: eventosRef.current })
            if (![...u.searchParams.keys()].length) return json({ diretor: true, pedidos: [p] })
          }
        }
      }
      return real(input, init)
    }
    const t = setTimeout(() => { setNoCliente(true); recomecar(false) }, 0)
    return () => { clearTimeout(t); window.fetch = real; pedidoRef.current = null; recarregar() }
  }, [recomecar])

  const bt = (on: boolean): React.CSSProperties => ({ padding: '9px 16px', borderRadius: 99, border: on ? '1px solid #0f172a' : '1px solid #cbd5e1', background: on ? '#0f172a' : '#fefefe', color: on ? '#fefefe' : '#0f172a', font: 'inherit', fontSize: 14, cursor: 'pointer' })
  return (
    <div style={{ padding: 24, display: 'grid', gap: 16, color: 'var(--portal-text, #0f172a)' }}>
      <div style={{ background: '#fff7ed', border: '2px dashed #ea580c', borderRadius: 14, padding: '14px 18px', display: 'grid', gap: 10, fontSize: 14.5, lineHeight: 1.5 }}>
        <b style={{ fontSize: 16 }}>Tela de teste: autorização de comissão pelo diretor</b>
        <span>Os valores e clientes são de <b>exemplo</b>. Pode clicar em tudo: nada é gravado, ninguém é avisado e o RH não é chamado.</span>
        <span>A assinatura salva que aparecer é a <b>sua</b>. Quem não tiver uma desenha na hora.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Simular a pessoa:</span>
          <button type="button" style={bt(!comRh)} onClick={() => recomecar(false)}>Sem cadastro no RH (Larissa hoje)</button>
          <button type="button" style={bt(comRh)} onClick={() => recomecar(true)}>Com cadastro no RH</button>
        </div>
        <small>Cada botão recomeça do aviso. Se tiver um pedido de verdade esperando, ele continua lá: feche esta tela para vê-lo.</small>
      </div>
      {noCliente && resultado && createPortal(
        <div id="teste-resultado" role="status" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 9600, width: 'min(720px, calc(100vw - 32px))', background: resultado.ok ? '#dcfce7' : '#fee2e2', color: resultado.ok ? '#14532d' : '#7f1d1d', border: `1px solid ${resultado.ok ? '#86efac' : '#fca5a5'}`, borderRadius: 12, padding: '12px 16px', fontSize: 14.5, fontWeight: 600, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>
          Só no teste, este quadro não existe no portal: {resultado.txt}
        </div>, document.body)}
    </div>
  )
}
