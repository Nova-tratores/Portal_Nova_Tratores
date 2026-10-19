'use client'
// Bloquear um horário (ou dias inteiros) na agenda pessoal. O motivo só você vê;
// para os outros aparece "indisponível", e ninguém consegue te pôr numa reunião nesse horário.
import { useState } from 'react'
import { Modal, campo, rotulo, botao, botaoClaro, chamar } from '@/components/reunioes/comum'
import { ABRE, FECHA, PASSO_MIN, hhmm, minutos } from '@/lib/salas/regras'

const HORARIOS = Array.from({ length: (minutos(FECHA) - minutos(ABRE)) / PASSO_MIN + 1 }, (_, i) => hhmm(minutos(ABRE) + i * PASSO_MIN))

export default function FormBloqueio({ inicial, minDia, onFechar, onSalvo }: {
  inicial: { dia: string; inicio: string; fim: string }
  minDia: string
  onFechar: () => void
  onSalvo: () => void
}) {
  const [diaInteiro, setDiaInteiro] = useState(false)
  const [dia, setDia] = useState(inicial.dia)
  const [ate, setAte] = useState(inicial.dia)
  const [ini, setIni] = useState(inicial.inicio)
  const [fim, setFim] = useState(inicial.fim)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      await chamar('/api/agenda/bloqueios', { json: diaInteiro ? { dia_inteiro: true, de: dia, ate, motivo } : { dia, inicio: ini, fim, motivo } })
      onSalvo()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao bloquear') } finally { setSalvando(false) }
  }
  const pronto = diaInteiro ? !!dia && ate >= dia : fim > ini

  return (
    <Modal titulo="Bloquear minha agenda" onFechar={onFechar} largura={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', lineHeight: 1.5 }}>
          Nesse horário ninguém consegue te colocar numa reunião. Os outros veem só <b>&quot;indisponível&quot;</b> — o motivo fica só para você.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} /> Dia inteiro (férias, viagem…)
        </label>
        {diaInteiro ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={rotulo}>De</label><input type="date" min={minDia} value={dia} onChange={(e) => { setDia(e.target.value); if (ate < e.target.value) setAte(e.target.value) }} style={campo} /></div>
            <div><label style={rotulo}>Até</label><input type="date" min={dia} value={ate} onChange={(e) => setAte(e.target.value)} style={campo} /></div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
            <div><label style={rotulo}>Dia</label><input type="date" min={minDia} value={dia} onChange={(e) => setDia(e.target.value)} style={campo} /></div>
            <div><label style={rotulo}>Início</label>
              <select value={ini} onChange={(e) => { const v = e.target.value; setIni(v); if (fim <= v) setFim(hhmm(Math.min(minutos(v) + 60, minutos(FECHA)))) }} style={campo}>
                {HORARIOS.slice(0, -1).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div><label style={rotulo}>Fim</label>
              <select value={fim} onChange={(e) => setFim(e.target.value)} style={campo}>
                {HORARIOS.filter((h) => h > ini).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label style={rotulo}>Motivo (só você vê — opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: visita cliente, médico, férias" style={campo} maxLength={200} />
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Voltar</button>
          <button onClick={salvar} disabled={salvando || !pronto} style={{ ...botao('#475569'), opacity: salvando || !pronto ? .5 : 1 }}>{salvando ? 'Bloqueando…' : 'Bloquear'}</button>
        </div>
      </div>
    </Modal>
  )
}
