'use client'
// Tutorial de primeira vez das Reuniões: abre sozinho na 1ª visita a /reunioes
// (marca em localStorage) e de novo pelo botão "Tutorial" da tela.
import { useEffect, useState } from 'react'
import { CalendarClock, Repeat, ListChecks, Play, FileCheck2, HelpCircle, ChevronLeft, ChevronRight, X, AlarmClock } from 'lucide-react'

const CHAVE = 'reunioes-tutorial-visto'

type Passo = { titulo: string; icone: React.ReactNode; cor: string; texto: string[]; dica?: string }

export const PASSOS_TUTORIAL: Passo[] = [
  {
    titulo: 'Bem-vindo às Reuniões',
    icone: <CalendarClock size={30} />, cor: '#dc2626',
    texto: [
      'Aqui a reunião tem três momentos: a pauta antes, a condução na hora e a ata depois.',
      'O que for decidido vira tarefa com responsável e prazo, e é cobrado na reunião seguinte. Nada se perde no "a gente vê depois".',
    ],
  },
  {
    titulo: '1. Reunião avulsa ou série',
    icone: <Repeat size={30} />, cor: '#4f46e5',
    texto: [
      '"Nova reunião" marca uma reunião que acontece uma vez só.',
      '"Nova série" é para o encontro fixo (ex.: toda segunda às 15h). O portal cria as próximas sozinho, com 14 dias de antecedência, e liga uma reunião à outra.',
    ],
    dica: 'Use série quando quiser cobrar na semana seguinte o que foi combinado.',
  },
  {
    titulo: '2. Antes: monte a pauta',
    icone: <ListChecks size={30} />, cor: '#2563eb',
    texto: [
      'Abra a reunião e inclua os itens. Cada item é uma pergunta que a reunião precisa responder, com quem traz o assunto e quantos minutos leva.',
      'Escolha o tipo: Decidir (precisa sair uma resposta), Informar (só dar um recado) ou Discutir (ouvir opiniões).',
      'A pauta fecha algumas horas antes (o "corte"). Depois disso só o condutor inclui, e o item entra como urgente.',
    ],
  },
  {
    titulo: '3. Na hora: conduza',
    icone: <Play size={30} />, cor: '#d97706',
    texto: [
      'O condutor clica em "Iniciar reunião", marca as presenças e, se precisar, inclui alguém de última hora.',
      'Primeiro vêm as pendências: tarefas de reuniões anteriores atrasadas ou vencendo.',
      'Em cada item, registre o resultado: Decidido (com decisão e motivo), Informado, Discutido, "Adiar p/ próxima" ou "Fora do tema". Os dois últimos são reagendados para a próxima reunião da série.',
      'Alguém precisa fazer algo? Depois de decidir, clique em "+ Criar ação desta decisão" (ou em "+ Ação", na barra de baixo). A ação vira um ticket com UM responsável e um prazo; a pessoa recebe o aviso e confirma.',
    ],
    dica: 'Tarefa para várias pessoas? Crie uma ação para cada uma, com a parte e o prazo de cada. Surgiu outro assunto no meio da conversa? Escreva no campo de baixo e clique em "Anotar p/ próxima".',
  },
  {
    titulo: '4. Pendências: cobre o combinado',
    icone: <AlarmClock size={30} />, cor: '#dc2626',
    texto: [
      'Toda reunião da série começa pelas pendências: as ações das reuniões anteriores que estão atrasadas ou vencem até a próxima. Não precisa vincular nada — toda ação criada numa reunião já entra aqui sozinha.',
      'Para cada atrasada, o condutor escolhe uma saída: Novo prazo, Reatribuir (passa para outra pessoa), Escalar (vira item da pauta da próxima reunião) ou Cancelar.',
      'Uma ação só ganha novo prazo duas vezes. Na terceira, o botão trava: ela precisa ser escalada, reatribuída ou cancelada.',
    ],
    dica: 'As concluídas aparecem só como contagem — o tempo da reunião fica para o que está parado.',
  },
  {
    titulo: '5. Depois: publique a ata',
    icone: <FileCheck2 size={30} />, cor: '#7c3aed',
    texto: [
      'Ao encerrar, confira e publique a ata. Ela gera um texto curto para mandar no WhatsApp.',
      'Depois de publicada, a ata não muda mais. Esqueceu algo ou precisa corrigir? Quem conduz escreve um adendo, embaixo da ata: ele fica registrado com data e autor, sem apagar o que já estava lá.',
      'As ações aparecem no "Seu dia" e no Cronograma de quem é responsável. Se atrasarem, voltam como pendência na próxima reunião da série.',
    ],
  },
  {
    titulo: 'Onde encontrar cada coisa',
    icone: <HelpCircle size={30} />, cor: '#059669',
    texto: [
      'Próximas: as reuniões que vão acontecer. Histórico: as que já aconteceram, com a ata. Séries: as reuniões que se repetem.',
      'O "?" ao lado de cada aba (e no topo de cada reunião) explica aquele momento.',
      'Vai estar fora (visita, médico, férias)? Em "Sala de reunião" → "Minha agenda", bloqueie o horário: ninguém consegue te pôr numa reunião nele, e os outros veem só "indisponível".',
      'Quer ver este passo a passo de novo? Clique em "Tutorial", no topo da tela.',
    ],
  },
]

/** Abre na primeira visita; `aberto`/`setAberto` ficam com a página para o botão "Tutorial". */
export function useTutorialPrimeiraVez(): [boolean, (v: boolean) => void] {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setAberto(true) } catch { /* sem storage: não abre sozinho */ }
  }, [])
  const set = (v: boolean) => {
    if (!v) { try { localStorage.setItem(CHAVE, new Date().toISOString()) } catch { /* ignora */ } }
    setAberto(v)
  }
  return [aberto, set]
}

export default function TutorialReunioes({ onFechar }: { onFechar: () => void }) {
  const [i, setI] = useState(0)
  const p = PASSOS_TUTORIAL[i]
  const ultimo = i === PASSOS_TUTORIAL.length - 1

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, PASSOS_TUTORIAL.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onFechar])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label={`Tutorial: ${p.titulo}`} style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.35)', position: 'relative' }}>
        <button onClick={onFechar} aria-label="Fechar tutorial" style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', display: 'flex', padding: 4 }}><X size={18} /></button>

        <div style={{ padding: '28px 24px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.cor + '1a', color: p.cor }}>{p.icone}</div>
          <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '.06em', color: 'var(--portal-text-muted,#999)' }}>PASSO {i + 1} DE {PASSOS_TUTORIAL.length}</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: 'var(--portal-text,#111)' }}>{p.titulo}</h2>
        </div>

        <div style={{ padding: '6px 26px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.texto.map((t, k) => (
            <p key={k} style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--portal-text-secondary,#444)' }}>{t}</p>
          ))}
          {p.dica && (
            <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: p.cor + '12', fontSize: 13, lineHeight: 1.5, color: 'var(--portal-text,#222)' }}>
              <b style={{ fontWeight: 500 }}>Dica:</b> {p.dica}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '18px 0 6px' }}>
          {PASSOS_TUTORIAL.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`Ir para o passo ${k + 1}`}
              style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: k === i ? p.cor : 'var(--portal-border,#d1d5db)', transition: 'width .2s' }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 20px' }}>
          {!ultimo
            ? <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--portal-text-muted,#888)', padding: '8px 4px' }}>Pular</button>
            : <span />}
          <span style={{ flex: 1 }} />
          {i > 0 && (
            <button onClick={() => setI(i - 1)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}><ChevronLeft size={15} /> Voltar</button>
          )}
          <button onClick={() => (ultimo ? onFechar() : setI(i + 1))} autoFocus
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 16px', borderRadius: 9, border: 'none', background: p.cor, color: '#fff', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
            {ultimo ? 'Começar' : <>Próximo <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
