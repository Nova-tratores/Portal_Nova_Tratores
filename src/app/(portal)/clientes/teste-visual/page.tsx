'use client'
// PÁGINA DE TESTE (19/11/2026) — proposta de visual para a Pasta do Cliente.
// Dados FIXOS copiados de um cliente real (Associação Raízes Avaré) só para comparar
// com a tela atual. Não lê nem grava nada. Abrir em /clientes/teste-visual.
// Mesma linha da ficha da máquina: cinzas quentes, vermelho só de destaque, letra normal
// no lugar de MAIÚSCULO miúdo, linhas finas no lugar de cartões dentro de cartões.
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Check, Pencil, Plus, Search, ChevronDown, MessageCircle, MapPin, Paperclip } from 'lucide-react'

const INK = '#1C1917', MUTED = '#78716C', SOFT = '#A8A29E', LINE = '#EFEDEA', BG = '#FAFAF9', RED = '#DC2626'
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace'

const cliente = {
  nome: 'ASSOCIACAO RAIZES AVARE', empresa: 'Nova Tratores', cnpj: '57.074.025/0001-57', cidade: 'Itaí/SP',
  telefone: '(11) 94389-3060', emails: ['pagamento@graiche.com.br', 'chile@graiche.com.br'],
}
const numeros = { total: 'R$ 16.782,50', servicos: 'R$ 762,50', pecas: 'R$ 16.020,00', pedidos: 4, os: 2, faturadas: 2, abertas: 0, canceladas: 0 }
const abas = [
  { id: 'faturados', label: 'Faturados', n: 2 }, { id: 'cancelados', label: 'Cancelados', n: 0 },
  { id: 'abertos', label: 'Abertos', n: 0 }, { id: 'balcao', label: 'Balcão', n: 3 }, { id: 'notas', label: 'Notas fiscais', n: null },
]
const os = {
  numero: '4843', data: '14/04/2026', motorista: 'Luiz Fernando // Danilo Souza', servico: 'Troca do cabo do acelerador',
  maquina: 'TL · chassi não informado',
  docs: [{ t: 'PV 3883', sub: 'Castro' }, { t: 'NFS-e 1957', ok: true }, { t: 'NF-e 8927', ok: true }],
  pecas: [{ cod: '73402910P', desc: 'Cabo acelerador mão TL motor MWM', qtd: 1, valor: 'R$ 150,00' }],
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="tv-copiar" aria-label={`Copiar ${rotulo}`} title="Copiar"
      onClick={() => { navigator.clipboard?.writeText(texto).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1200) }}
      style={{ border: 'none', background: 'none', padding: 4, margin: -4, borderRadius: 6, cursor: 'pointer', color: ok ? '#16A34A' : SOFT, display: 'inline-flex' }}>
      {ok ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  )
}

export default function TesteVisualCliente() {
  const [aba, setAba] = useState('faturados')
  return (
    <div className="tv" style={{ minHeight: '100%', background: BG, color: INK, padding: '20px clamp(16px, 3vw, 36px) 48px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <Link href="/clientes" className="tv-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: MUTED, textDecoration: 'none' }}>
            <ArrowLeft size={15} aria-hidden="true" /> Voltar para a lista
          </Link>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '4px 10px', borderRadius: 999 }}>Página de teste · dados fixos</span>
        </div>

        {/* ── Cabeçalho do cliente: nome grande, dados numa linha, contatos copiáveis ── */}
        <header style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 420px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: SOFT }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, background: RED, borderRadius: 2 }} /> Cliente · {cliente.empresa}
              </div>
              <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, textWrap: 'balance', overflowWrap: 'anywhere' }}>{cliente.nome}</h1>
              <div className="tv-fatos tv-num" style={{ marginTop: 10, fontSize: 13.5, color: '#57534E', display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span translate="no" style={{ fontFamily: MONO, fontSize: 13 }}>{cliente.cnpj}</span><Copiar texto={cliente.cnpj} rotulo="CNPJ" /></span>
                <span>{cliente.cidade}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{cliente.telefone}<Copiar texto={cliente.telefone} rotulo="telefone" /></span>
              </div>
            </div>
            <button type="button" className="tv-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, border: `1px solid #E7E5E4`, background: '#fff', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <Pencil size={14} aria-hidden="true" /> Editar cadastro no Omie
            </button>
          </div>

          {/* e-mails: um por linha (antes vinham grudados e quebrados no meio) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {cliente.emails.map(e => (
              <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 12px', borderRadius: 9, background: BG, border: `1px solid ${LINE}`, fontSize: 13, color: '#44403C', maxWidth: '100%', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e}</span><Copiar texto={e} rotulo={`e-mail ${e}`} />
              </span>
            ))}
          </div>

          {/* números: faixa única, o total primeiro e maior */}
          <div className="tv-kpis" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', marginTop: 24, paddingTop: 22, borderTop: `1px solid ${LINE}` }}>
            <div className="tv-kpi">
              <div style={{ fontSize: 12.5, color: MUTED }}>Total com o cliente</div>
              <div className="tv-num" style={{ marginTop: 6, fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, color: INK }}>{numeros.total}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: SOFT }}>serviços + peças, sem cancelados</div>
            </div>
            {[
              { l: 'Serviços', v: numeros.servicos, s: 'mão de obra e deslocamento' },
              { l: 'Peças', v: numeros.pecas, s: `${numeros.pedidos} pedidos de venda` },
              { l: 'Ordens de serviço', v: String(numeros.os), s: `${numeros.faturadas} faturadas · ${numeros.abertas} abertas · ${numeros.canceladas} canceladas` },
            ].map(k => (
              <div key={k.l} className="tv-kpi">
                <div style={{ fontSize: 12.5, color: MUTED }}>{k.l}</div>
                <div className="tv-num" style={{ marginTop: 8, fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: INK }}>{k.v}</div>
                <div className="tv-num" style={{ marginTop: 6, fontSize: 12, color: SOFT }}>{k.s}</div>
              </div>
            ))}
          </div>
        </header>

        <div className="tv-corpo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, marginTop: 24, alignItems: 'start' }}>
          {/* ── Coluna principal ── */}
          <main style={{ minWidth: 0 }}>
            <div role="tablist" aria-label="Movimentação do cliente" style={{ display: 'flex', gap: 26, borderBottom: '1px solid #E7E5E4', overflowX: 'auto' }}>
              {abas.map(a => {
                const on = aba === a.id
                return (
                  <button key={a.id} role="tab" aria-selected={on} onClick={() => setAba(a.id)} className="tv-aba"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 11px', border: 'none', borderBottom: `2px solid ${on ? RED : 'transparent'}`, marginBottom: -1, background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: on ? 700 : 500, color: on ? INK : MUTED, whiteSpace: 'nowrap' }}>
                    {a.label}{a.n !== null && <span className="tv-num" style={{ fontSize: 12, fontWeight: 600, color: on ? RED : SOFT }}>{a.n}</span>}
                  </button>
                )
              })}
            </div>

            {/* barra de ferramentas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '18px 0 14px' }}>
              <label style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
                <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Buscar</span>
                <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 11, top: 11, color: SOFT }} />
                <input name="busca" autoComplete="off" placeholder="Buscar NF, OS, peça…" className="tv-inp" style={{ width: '100%', boxSizing: 'border-box', height: 37, padding: '0 12px 0 33px', borderRadius: 9, border: '1px solid #E7E5E4', background: '#fff', fontSize: 13, color: INK }} />
              </label>
              {['Tipo de serviço', 'Máquina'].map(f => (
                <button key={f} type="button" className="tv-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 37, padding: '0 12px', borderRadius: 9, border: '1px solid #E7E5E4', background: '#fff', fontSize: 13, color: '#44403C', cursor: 'pointer' }}>
                  {f} <ChevronDown size={14} aria-hidden="true" style={{ color: SOFT }} />
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" className="tv-btn tv-escuro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 37, padding: '0 14px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Paperclip size={14} aria-hidden="true" /> Anexar OS
              </button>
            </div>

            {/* ── OS como documento ── */}
            <article style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                    <h2 className="tv-num" style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>OS {os.numero}</h2>
                    <span className="tv-num" style={{ fontSize: 13, color: MUTED }}>{os.data}</span>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#15803D' }}>
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A' }} /> Faturada
                  </span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 600, color: INK }}>{os.servico}</p>
                <div className="tv-fatos" style={{ marginTop: 6, fontSize: 12.5, color: MUTED, display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
                  <span>{os.motorista}</span><span>{os.maquina}</span>
                </div>
                {/* documentos ligados: texto, não pílulas coloridas */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 14 }}>
                  {os.docs.map(d => (
                    <button key={d.t} type="button" className="tv-doc tv-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer' }}>
                      {d.t}{d.sub && <span style={{ fontWeight: 500, color: MUTED }}>· {d.sub}</span>}
                      {d.ok && <Check size={13} aria-label="anexada" style={{ color: '#16A34A' }} />}
                    </button>
                  ))}
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: BG, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 22px', fontWeight: 600, color: MUTED, fontSize: 12 }}>Peças ({os.pecas.length})</th>
                    <th style={{ padding: '8px 8px', fontWeight: 600, color: MUTED, fontSize: 12, textAlign: 'right' }}>Qtd</th>
                    <th style={{ padding: '8px 22px', fontWeight: 600, color: MUTED, fontSize: 12, textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {os.pecas.map(p => (
                    <tr key={p.cod}>
                      <td style={{ padding: '11px 22px' }}>
                        <span translate="no" style={{ fontFamily: MONO, fontSize: 12, color: MUTED, marginRight: 12 }}>{p.cod}</span>
                        <span style={{ color: INK }}>{p.desc}</span>
                      </td>
                      <td className="tv-num" style={{ padding: '11px 8px', textAlign: 'right', color: MUTED }}>{p.qtd}×</td>
                      <td className="tv-num" style={{ padding: '11px 22px', textAlign: 'right', fontWeight: 700 }}>{p.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </main>

          {/* ── Lateral: contatos e lugares, discretos ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {[
              { icone: MessageCircle, titulo: 'WhatsApp', vazio: 'Nenhum contato ligado a este cliente.', acao: 'Vincular contato' },
              { icone: MapPin, titulo: 'Localizações', vazio: 'Nenhuma ainda. O faturamento da OS pede uma.', acao: 'Adicionar local' },
            ].map(b => (
              <section key={b.titulo}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${LINE}` }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700 }}><b.icone size={15} aria-hidden="true" style={{ color: MUTED }} />{b.titulo}</h3>
                </div>
                <p style={{ margin: '10px 0 8px', fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{b.vazio}</p>
                <button type="button" className="tv-link-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 700, color: RED, cursor: 'pointer' }}>
                  <Plus size={14} aria-hidden="true" /> {b.acao}
                </button>
              </section>
            ))}
            <p style={{ margin: 0, fontSize: 12.5, color: SOFT }}>Sem lembretes do POS para este cliente.</p>
          </aside>
        </div>
      </div>

      <style>{`
        .tv-num { font-variant-numeric: tabular-nums }
        .tv-fatos > span + span::before { content: "·"; margin: 0 10px; color: #D6D3D1 }
        .tv-kpi { min-width: 0; padding: 0 22px; border-left: 1px solid ${LINE} }
        .tv-kpi:first-child { padding-left: 0; border-left: none }
        .tv-btn, .tv-copiar, .tv-aba, .tv-inp { transition: background-color .15s, border-color .15s, color .15s, box-shadow .15s }
        .tv-btn:hover { border-color: #D6D3D1 !important; background: #F5F5F4 !important }
        .tv-btn.tv-escuro:hover { background: #44403C !important }
        .tv-copiar:hover { color: ${INK} !important; background: #F5F5F4 !important }
        .tv-aba:hover:not([aria-selected="true"]) { color: ${INK} !important; border-bottom-color: #D6D3D1 !important }
        .tv-link:hover, .tv-link-btn:hover, .tv-doc:hover { text-decoration: underline; text-underline-offset: 3px }
        .tv-inp:focus { outline: none; border-color: ${INK} !important; box-shadow: 0 0 0 3px rgba(28,25,23,.08) }
        .tv-inp::placeholder { color: ${SOFT} }
        .tv button:focus-visible, .tv a:focus-visible { outline: 2px solid ${RED}; outline-offset: 2px }
        @media (max-width: 900px) {
          .tv-corpo { grid-template-columns: 1fr !important }
          .tv-kpis { grid-template-columns: 1fr 1fr !important; row-gap: 20px }
          .tv-kpi:nth-child(3) { padding-left: 0; border-left: none }
        }
      `}</style>
    </div>
  )
}
