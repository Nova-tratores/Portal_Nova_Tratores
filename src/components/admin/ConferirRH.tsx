'use client'
// "Conferir com o RH" (José, 27/11/2026): mostra, pessoa por pessoa, o setor e o cargo da
// Administração (o certo) ao lado do que está no RH hoje. NADA muda até clicar em "Aplicar".
// Vazio na Administração não apaga o que o RH tem (só preenche ou troca).
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'

interface Linha {
  userId: string; nome: string; setor: string | null; cargo: string | null
  rh: { departamento: string | null; cargo: string | null } | null; muda: boolean
}

export default function ConferirRH({ onFechar, onAplicado }: { onFechar: () => void; onAplicado: () => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/admin/setor-cargo', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({})) as { linhas?: Linha[]; error?: string }
        if (!vivo) return
        if (!r.ok) setErro(j.error || 'Não deu para conferir'); else setLinhas(j.linhas || [])
      } catch { if (vivo) setErro('Sem conexão') }
    })()
    return () => { vivo = false }
  }, [])

  const aplicar = async () => {
    setAplicando(true); setErro('')
    try {
      const r = await fetch('/api/admin/setor-cargo', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ todos: true }) })
      const j = await r.json().catch(() => ({})) as { feitos?: number; falhas?: string[]; error?: string }
      if (!r.ok) { setErro(j.error || 'Não deu para aplicar'); return }
      setResultado(`${j.feitos || 0} ${j.feitos === 1 ? 'pessoa atualizada' : 'pessoas atualizadas'}.${j.falhas?.length ? ` Falharam: ${j.falhas.join('; ')}` : ''}`)
      onAplicado()
    } catch { setErro('Sem conexão') } finally { setAplicando(false) }
  }

  const muda = (linhas || []).filter((l) => l.muda)
  const fora = (linhas || []).filter((l) => !l.rh)
  const dif = (a: string | null, b: string | null) => !!a && a !== b

  return (
    <div className="crh-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <style>{CSS}</style>
      <div className="crh-caixa" role="dialog" aria-label="Conferir setor e cargo com o RH">
        <div className="crh-cab">
          <div>
            <h3>Conferir setor e cargo com o RH</h3>
            <p>A Administração é o lugar certo. Ao aplicar, o RH e o organograma ficam iguais a ela. Vazio aqui não apaga o que o RH já tem.</p>
          </div>
          <button className="crh-x" onClick={onFechar} aria-label="Fechar">Fechar</button>
        </div>

        {erro && <div className="crh-erro">{erro}</div>}
        {!linhas && !erro && <div className="crh-vazio">Conferindo…</div>}
        {resultado && <div className="crh-ok">{resultado}</div>}

        {linhas && (
          <>
            <div className="crh-resumo">
              <b>{muda.length}</b> vão mudar · {linhas.length - muda.length} já estão iguais · {fora.length} não estão no RH
            </div>
            <div className="crh-tab">
              <div className="crh-lin crh-tit"><span>Pessoa</span><span>Administração (fica)</span><span>RH hoje</span></div>
              {linhas.map((l) => (
                <div key={l.userId} className={`crh-lin${l.muda ? ' muda' : ''}`}>
                  <span className="crh-nome">{l.nome}</span>
                  <span>{l.setor || <i>sem setor</i>}<small>{l.cargo || <i>sem cargo</i>}</small></span>
                  {l.rh ? (
                    <span className="crh-rh">
                      <em className={dif(l.setor, l.rh.departamento) ? 'troca' : ''}>{l.rh.departamento || <i>vazio</i>}</em>
                      <small className={dif(l.cargo, l.rh.cargo) ? 'troca' : ''}>{l.rh.cargo || <i>vazio</i>}</small>
                    </span>
                  ) : <span className="crh-fora">não está no RH</span>}
                </div>
              ))}
            </div>
            <div className="crh-pe">
              <span>Riscado em vermelho = o que vai ser trocado no RH.</span>
              <button className="crh-aplicar" disabled={!muda.length || aplicando || !!resultado} onClick={aplicar}>
                {aplicando ? 'Aplicando…' : resultado ? 'Aplicado' : `Aplicar (${muda.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const CSS = `
.crh-fundo{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.5);display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto}
.crh-caixa{width:100%;max-width:900px;background:#fff;border-radius:16px;padding:20px 22px;color:#0f172a;box-shadow:0 30px 80px -20px rgba(15,23,42,.5)}
.crh-cab{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.crh-cab h3{margin:0;font-size:19px;font-weight:700}
.crh-cab p{margin:4px 0 0;font-size:14px;color:#475569}
.crh-x{height:36px;padding:0 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;color:#0f172a}
.crh-resumo{margin:14px 0 10px;font-size:14.5px;color:#334155}
.crh-resumo b{color:#1d4ed8}
.crh-tab{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;max-height:60vh;overflow-y:auto}
.crh-lin{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid #eef2f6;font-size:14px;align-items:center}
.crh-lin:first-child{border-top:none}
.crh-tit{position:sticky;top:0;background:#f8fafc;font-size:13px;font-weight:600;color:#475569}
.crh-lin.muda{background:#eff6ff}
.crh-lin span{display:flex;flex-direction:column;gap:2px}
.crh-lin small{font-size:13px;color:#475569}
.crh-lin i{color:#94a3b8}
.crh-nome{font-weight:600}
.crh-rh em{font-style:normal}
.crh-rh .troca{color:#b91c1c;text-decoration:line-through}
.crh-fora{color:#94a3b8;font-size:13px}
.crh-pe{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;font-size:13px;color:#475569}
.crh-aplicar{height:42px;padding:0 20px;border-radius:10px;border:none;background:#2563eb;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.crh-aplicar:disabled{opacity:.45;cursor:default}
.crh-erro{margin-top:12px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:14px}
.crh-ok{margin-top:12px;padding:10px 12px;border-radius:10px;background:#dcfce7;color:#166534;font-size:14px}
.crh-vazio{padding:18px;color:#475569}
`
