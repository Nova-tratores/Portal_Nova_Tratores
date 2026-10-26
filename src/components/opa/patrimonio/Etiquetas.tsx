'use client'
// Etiquetas do Patrimônio Loja — mesma térmica e mesmos ajustes do Opa Peças
// (rolo 70 × 30, intervalo, girar; salvos neste navegador). QR = ficha do item
// no portal. "Uma por unidade": 5 cadeiras = 5 etiquetas. Ao imprimir, os itens
// ficam marcados como impressos (POST /api/patrimonio/etiquetas).

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { guardarAjusteTermica, lerAjusteTermica, type AjusteTermica, type ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'
import { imprimirOuEnviar } from '@/lib/etiquetas/estacao-client'
import { textoOnde, type ItemPat } from '@/lib/patrimonio/tipos'
import AjustesTermica from '../pecas/AjustesTermica'
import { Aviso, botao } from '../pecas/comum'
import { Janela } from '../pecas/Moldura'
import { api, COR_PAT } from './comum'

const MAX_ETIQUETAS = 500

export default function EtiquetasPat({ itens, nomeLocal, onFechar, onImpresso }: {
  itens: ItemPat[]
  nomeLocal: (id: string) => string
  onFechar: () => void
  onImpresso?: () => void
}) {
  const [term, setTerm] = useState<AjusteTermica>(lerAjusteTermica)
  useEffect(() => { guardarAjusteTermica(term) }, [term])
  const temVarias = itens.some((i) => (i.quantidade || 1) > 1)
  const [porUnidade, setPorUnidade] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const lista: ItemTermica[] = []
  for (const i of itens) {
    const copias = porUnidade ? Math.max(1, i.quantidade || 1) : 1
    const base: ItemTermica = {
      codigo: i.codigo, descricao: i.descricao,
      // só uma etiqueta para várias unidades: mostra a quantidade na etiqueta
      quantidade: porUnidade ? undefined : i.quantidade,
      local: textoOnde(i.local_id, i.local_tecnico, nomeLocal),
      url: typeof window !== 'undefined' ? `${window.location.origin}/opa/patrimonio/${i.id}` : '',
    }
    for (let k = 0; k < copias; k++) lista.push(base)
  }
  const n = lista.length
  const demais = n > MAX_ETIQUETAS

  const imprimir = async () => {
    if (demais) { setErro(`São ${n} etiquetas — o máximo por vez é ${MAX_ETIQUETAS}. Use "só uma por item" ou filtre a lista.`); return }
    const r = await imprimirOuEnviar(lista, term, 'patrimonio')
    if (!r.ok) { setErro(r.erro); return }
    api('/api/patrimonio/etiquetas', { method: 'POST', body: { ids: itens.map((i) => i.id) } }).then(() => onImpresso?.()).catch(() => null)
    onFechar()
  }

  return (
    <Janela titulo={`Etiquetas · ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`} onFechar={onFechar} largura={520}>
      {erro && <Aviso>{erro}</Aviso>}
      {temVarias && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {([[true, 'Uma por unidade'], [false, 'Só uma por item']] as const).map(([v, rot]) => (
            <button key={rot} type="button" aria-pressed={porUnidade === v} onClick={() => setPorUnidade(v)} style={{
              padding: '9px 8px', borderRadius: 10, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              border: '1.5px solid ' + (porUnidade === v ? COR_PAT : 'var(--portal-border)'),
              background: porUnidade === v ? COR_PAT : 'var(--portal-bg-card)', color: porUnidade === v ? '#fff' : 'var(--portal-text)',
            }}>{rot}</button>
          ))}
        </div>
      )}
      <AjustesTermica term={term} setTerm={setTerm} n={n} exemplo={{ codigo: itens[0]?.codigo || 'PAT-000000', descricao: itens[0]?.descricao || 'Descrição do item' }} />
      <button type="button" onClick={imprimir} disabled={!n} style={{ ...botao('#111827', { grande: true, desab: !n }), width: '100%' }}>
        <Printer size={18} /> Imprimir {n} etiqueta{n === 1 ? '' : 's'}
      </button>
    </Janela>
  )
}
