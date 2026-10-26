'use client'
// Estação de impressão da térmica (ROGERIA) — a página que fica SEMPRE aberta no
// Chrome do PC da impressora (perfil próprio, --kiosk-printing: imprime sem
// diálogo). A cada 20 s dá sinal de vida e pega os pedidos da fila; o aviso ao
// vivo (canal "estacao-impressao") acorda na hora quando alguém manda. Imprime
// um pedido por vez com o MESMO desenho da térmica e devolve impressa/erro.
// Tamanho e ajuste fino da etiqueta: os desta página (salvos neste navegador).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Printer, RotateCcw, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { guardarAjusteTermica, lerAjusteTermica, type AjusteTermica } from '@/lib/opa-pecas/etiqueta-termica'
import {
  CANAL_ESTACAO, comEnderecoCompleto, ESTACAO_SINAL_MS, haQuanto, ROTULO_ORIGEM, ROTULO_STATUS,
  type StatusTrabalho, type Trabalho,
} from '@/lib/etiquetas/estacao'
import { imprimirTermicaEspera } from '@/lib/etiquetas/estacao-client'
import AjustesTermica from '@/components/opa/pecas/AjustesTermica'

type Estado = 'iniciando' | 'ok' | 'semLogin' | 'semPermissao' | 'semMigracao' | 'semRede'

const COR_STATUS: Record<StatusTrabalho, string> = {
  pendente: '#b45309', imprimindo: '#1d4ed8', impressa: '#15803d', erro: '#b91c1c', cancelada: '#6b7280',
}

export default function EstacaoImpressao() {
  const [estado, setEstado] = useState<Estado>('iniciando')
  const [erroTexto, setErroTexto] = useState('')
  const [ultimoSinal, setUltimoSinal] = useState<string | null>(null)
  const [imprimindo, setImprimindo] = useState<Trabalho | null>(null)
  const [recentes, setRecentes] = useState<Trabalho[]>([])
  const [term, setTerm] = useState<AjusteTermica>(lerAjusteTermica)
  const [, setRelogio] = useState(0)
  useEffect(() => { guardarAjusteTermica(term) }, [term])

  const ocupado = useRef(false)
  const deNovo = useRef(false)
  const inicio = useRef(Date.now())

  const lerRecentes = useCallback(async () => {
    try {
      const res = await fetch('/api/etiquetas/estacao?recentes=1', { headers: await authHeaders() })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.recentes) setRecentes(j.recentes)
    } catch { /* o ciclo mostra a falta de rede */ }
  }, [])

  const ciclo = useCallback(async () => {
    if (ocupado.current) { deNovo.current = true; return }
    ocupado.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setEstado('semLogin'); return }
      const q = new URLSearchParams({ ua: navigator.userAgent, ajuste: JSON.stringify(lerAjusteTermica()) })
      let res: Response
      try { res = await fetch(`/api/etiquetas/estacao/trabalho?${q}`, { headers: await authHeaders() }) }
      catch { setEstado('semRede'); return }
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) { setEstado('semLogin'); return }
      if (res.status === 403) { setEstado('semPermissao'); return }
      if (j.migracaoFaltando) { setEstado('semMigracao'); return }
      if (!res.ok || !j.ok) { setEstado('semRede'); setErroTexto(j.erro || `erro ${res.status}`); return }
      setEstado('ok'); setErroTexto(''); setUltimoSinal(new Date().toISOString())
      const trabalhos = (j.trabalhos || []) as Trabalho[]
      void lerRecentes()
      for (const t of trabalhos) {
        setImprimindo(t)
        let ok = false
        let erro = ''
        try { ok = await imprimirTermicaEspera(comEnderecoCompleto(t.itens, window.location.origin), lerAjusteTermica()) }
        catch (e) { erro = e instanceof Error ? e.message : String(e) }
        try {
          await fetch('/api/etiquetas/estacao/trabalho', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ id: t.id, ok, erro: ok ? undefined : (erro || 'O navegador não conseguiu montar a impressão.') }),
          })
        } catch { /* fica "imprimindo"; vira erro sozinho depois de 5 min */ }
        // folga para o spooler do Windows entre um pedido e outro
        await new Promise((r) => setTimeout(r, 800))
      }
      setImprimindo(null)
      if (trabalhos.length) void lerRecentes()
    } finally {
      ocupado.current = false
      if (deNovo.current) { deNovo.current = false; void ciclo() }
    }
  }, [lerRecentes])

  useEffect(() => {
    void ciclo()
    const t = setInterval(() => {
      void ciclo()
      // recarrega de madrugada (pega a versão nova do portal) se estiver parada há 12 h+
      const h = new Date().getHours()
      if (h === 3 && !ocupado.current && Date.now() - inicio.current > 12 * 3600_000) window.location.reload()
    }, ESTACAO_SINAL_MS)
    const r = setInterval(() => setRelogio((x) => x + 1), 60_000)
    const canal = supabase.channel(CANAL_ESTACAO).on('broadcast', { event: 'nova' }, () => { void ciclo() }).subscribe()
    return () => { clearInterval(t); clearInterval(r); void supabase.removeChannel(canal) }
  }, [ciclo])

  const acao = async (acao: 'reenviar' | 'cancelar', id: number) => {
    await fetch('/api/etiquetas/estacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ acao, id }),
    }).catch(() => null)
    void lerRecentes()
  }

  const teste = async () => {
    const agora = new Date().toLocaleString('pt-BR')
    await fetch('/api/etiquetas/estacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ origem: 'teste', itens: [{ codigo: 'TESTE', descricao: 'Etiqueta de teste da estação de impressão', local: agora, semQr: true }] }),
    }).catch(() => null)
    void ciclo()
  }

  const ligada = estado === 'ok'
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', padding: 16 }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ background: ligada ? '#065f46' : '#7f1d1d', color: '#fefefe', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Printer size={30} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Estação de impressão · ROGERIA</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>
              {estado === 'iniciando' && 'Ligando…'}
              {estado === 'ok' && <>Ligada · último sinal {haQuanto(ultimoSinal)}{imprimindo ? ` · imprimindo ${imprimindo.total} etiqueta${imprimindo.total === 1 ? '' : 's'} (pedido #${imprimindo.id})` : ' · esperando etiquetas'}</>}
              {estado === 'semLogin' && <>Sem login neste navegador. <a href="/login?redirect_to=/estacao-impressao" style={{ color: '#fefefe', fontWeight: 900 }}>Entrar no portal</a></>}
              {estado === 'semPermissao' && 'Este usuário não tem acesso às etiquetas (PPV, Peças S/Estoque ou Patrimônio). Entre com outro usuário.'}
              {estado === 'semMigracao' && 'Falta rodar o sql/etiquetas-estacao.sql no Supabase.'}
              {estado === 'semRede' && <>Sem conexão com o portal — tentando de novo a cada 20 s.{erroTexto ? ` (${erroTexto})` : ''}</>}
            </div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 800, background: 'rgba(0,0,0,.25)', padding: '6px 10px', borderRadius: 8 }}>NÃO FECHE ESTA JANELA</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
          <section style={CAIXA}>
            <h2 style={TITULO}>Etiqueta desta impressora</h2>
            <AjustesTermica term={term} setTerm={setTerm} n={1} exemplo={{ codigo: '0734309419', descricao: 'Descrição da peça' }} semDestino />
            <button type="button" onClick={teste} disabled={!ligada} style={{ ...BOTAO, width: '100%', opacity: ligada ? 1 : 0.5 }}>
              <Printer size={16} /> Imprimir etiqueta de teste
            </button>
          </section>

          <section style={CAIXA}>
            <h2 style={TITULO}>Últimos pedidos</h2>
            {!recentes.length && <div style={{ fontSize: 13.5, color: '#6b7280' }}>Nenhum pedido ainda.</div>}
            <div style={{ display: 'grid', gap: 6 }}>
              {recentes.map((t) => (
                <div key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'center', background: '#fefefe' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>
                      #{t.id} · {ROTULO_ORIGEM[t.origem] || t.origem} · {t.total} etiqueta{t.total === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.criado_nome || '—'} · {new Date(t.criado_em).toLocaleString('pt-BR')} · {t.itens.slice(0, 3).map((i) => i.codigo).join(', ')}{t.itens.length > 3 ? '…' : ''}
                    </div>
                    {t.erro && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>{t.erro}</div>}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: COR_STATUS[t.status], whiteSpace: 'nowrap' }}>{ROTULO_STATUS[t.status]}</span>
                  {t.status === 'pendente'
                    ? <button type="button" title="Cancelar" onClick={() => acao('cancelar', t.id)} style={ICONE}><X size={15} /></button>
                    : <button type="button" title="Imprimir de novo" onClick={() => acao('reenviar', t.id)} style={ICONE}><RotateCcw size={15} /></button>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <details style={{ ...CAIXA, fontSize: 13, lineHeight: 1.55 }}>
          <summary style={{ fontWeight: 800, cursor: 'pointer' }}>Como esta estação funciona</summary>
          <p style={{ margin: '8px 0 0' }}>
            Qualquer pessoa com acesso às etiquetas escolhe <b>“Na ROGERIA (pela rede)”</b> na janela de impressão da térmica
            (Peças, Peças S/Estoque ou Patrimônio) e as etiquetas chegam aqui na hora. Este Chrome deve ser o da estação
            (aberto pelo atalho com <b>--kiosk-printing</b>): ele imprime direto na ROGERIA, sem perguntar. Se o computador
            ficar desligado, os pedidos esperam na fila e saem quando ele voltar. Pedido que parou no meio vira “Erro” —
            confira se saiu antes de imprimir de novo.
          </p>
        </details>
      </div>
    </div>
  )
}

const CAIXA: React.CSSProperties = { background: '#fefefe', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14 }
const TITULO: React.CSSProperties = { fontSize: 15, fontWeight: 900, margin: '0 0 12px' }
const BOTAO: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 14px', borderRadius: 10,
  border: 'none', background: '#111827', color: '#fefefe', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
}
const ICONE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #d1d5db', background: '#fefefe', color: '#111827', cursor: 'pointer', flexShrink: 0,
}
