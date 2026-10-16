'use client'
// POPs — biblioteca de modelos: do SISTEMA (seed; só admin edita) e da EMPRESA
// (POP promovido). "Visualizar" mostra a versão publicada; "Duplicar para minha
// área" cria um POP independente em rascunho.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Eye, Library, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import ModalDuplicar from '@/components/pops/ModalDuplicar'
import ModalNovoPop from '@/components/pops/ModalNovoPop'
import { VersaoConteudo, type PassoVisivel } from '@/components/pops/PassoPreview'
import {
  COR_POPS, EstadoChip, Modal, areasQuePossoCriar, botao, botaoClaro, cartao, chamar, chip, pagina, vazio,
  type AreasResp, type PopLista,
} from '@/components/pops/comum'

interface Previa { versao: { numero: number; objetivo: string; escopo: string; materiais: string }; passos: PassoVisivel[] }

export default function Modelos() {
  const { userProfile } = useAuth()
  const [areas, setAreas] = useState<AreasResp | null>(null)
  const [lista, setLista] = useState<PopLista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ver, setVer] = useState<{ pop: PopLista; previa: Previa | null } | null>(null)
  const [duplicar, setDuplicar] = useState<PopLista | null>(null)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [a, l] = await Promise.all([chamar<AreasResp>('/api/pops/areas'), chamar<{ pops: PopLista[] }>('/api/pops?templates=1')])
      setAreas(a); setLista(l.pops)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const abrir = async (p: PopLista) => {
    setVer({ pop: p, previa: null })
    try { setVer({ pop: p, previa: await chamar<Previa>(`/api/pops/${p.id}`) }) } catch (e) { setErro((e as Error).message) }
  }
  const sigla = (id: string) => areas?.areas.find((a) => a.id === id)?.sigla || ''
  const possoDuplicar = areasQuePossoCriar(areas).length > 0
  const grupos: [string, PopLista[]][] = [
    ['Modelos do sistema', lista.filter((p) => p.template_tipo === 'sistema')],
    ['Modelos da empresa', lista.filter((p) => p.template_tipo === 'empresa')],
  ]

  return (
    <div style={pagina}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--portal-text-secondary,#555)', flex: '1 1 260px' }}>
          Pontos de partida prontos. Duplicar cria um POP seu, em rascunho, para ajustar à realidade da loja — o modelo não muda.
        </p>
        {areas?.eu.admin && <button onClick={() => setNovo(true)} style={botao(COR_POPS)}><Plus size={15} /> Novo modelo do sistema</button>}
      </div>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      {carregando ? <div style={vazio}>Carregando…</div> : !lista.length ? (
        <div style={vazio}>Ainda não há modelos publicados.</div>
      ) : grupos.filter(([, l]) => l.length).map(([titulo, l]) => (
        <section key={titulo} style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--portal-text-secondary,#555)', margin: '0 0 8px' }}>{titulo}</h2>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
            {l.map((p) => (
              <div key={p.id} style={{ ...cartao, display: 'grid', gap: 8, borderTop: `4px solid ${COR_POPS}` }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Library size={15} style={{ color: COR_POPS }} />
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 800, color: COR_POPS, fontSize: 12.5 }}>{p.codigo}</span>
                  <span style={chip('#4b5563', 'rgba(107,114,128,.12)')}>{sigla(p.area_id)}</span>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--portal-text,#111)' }}>{p.titulo}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {p.publicada ? <EstadoChip estado="publicado" numero={p.publicada.numero} /> : <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>ainda não publicado</span>}
                  {p.edicao && <EstadoChip estado={p.edicao.estado} numero={p.edicao.numero} />}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {p.publicada && <button onClick={() => abrir(p)} style={botaoClaro()}><Eye size={14} /> Visualizar</button>}
                  {p.publicada && possoDuplicar && <button onClick={() => setDuplicar(p)} style={botao(COR_POPS)}><Copy size={14} /> Duplicar para minha área</button>}
                  {!p.publicada && <Link href={`/pops/${p.id}`} style={{ ...botaoClaro(), textDecoration: 'none' }}>Abrir</Link>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {ver && (
        <Modal titulo={`${ver.pop.codigo} · ${ver.pop.titulo}`} onFechar={() => setVer(null)} largura={760}>
          {!ver.previa ? <div style={vazio}>Carregando…</div> : (
            <>
              <VersaoConteudo {...ver.previa.versao} passos={ver.previa.passos} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <Link href={`/pops/${ver.pop.id}`} style={{ ...botaoClaro(), textDecoration: 'none' }}>Abrir página do modelo</Link>
                {possoDuplicar && <button onClick={() => { setDuplicar(ver.pop); setVer(null) }} style={botao(COR_POPS)}><Copy size={14} /> Duplicar para minha área</button>}
              </div>
            </>
          )}
        </Modal>
      )}
      {duplicar && <ModalDuplicar popId={duplicar.id} codigo={duplicar.codigo} titulo={duplicar.titulo} onFechar={() => setDuplicar(null)} />}
      {novo && areas && <ModalNovoPop areas={areas.areas.filter((a) => a.ativo)} admin modeloInicial onFechar={() => setNovo(false)} />}
    </div>
  )
}
