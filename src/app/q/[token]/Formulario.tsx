'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Formulário público do questionário pós-evento.
//
// Regras que vieram do uso real, não do desenho:
//  * A fonte da verdade é o BANCO. Nada de localStorage: a pessoa pode abrir o
//    link no computador depois de começar no celular, e tem que achar o que
//    escreveu.
//  * Autosave 1,5 s depois da última tecla, mandando SÓ os campos mexidos.
//  * Falha de rede não perde o que foi digitado: o campo continua marcado como
//    pendente e vai na próxima tentativa.
//  * fontSize 16 nos campos, senão o iPhone dá zoom ao focar.
//  * Sem rastreamento e sem dependência nova.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PERGUNTAS, SECOES, perguntasDaSecao, IDS_PERGUNTAS,
} from '@/lib/marketing/questionario';

type Situacao = 'ocioso' | 'salvando' | 'salvo' | 'erro';

interface Dados {
  evento: { nome: string; edicao: string | null; data_inicio: string | null; data_fim: string | null; local: string | null };
  destinatario_nome: string | null;
  editavel: boolean;
  enviado_em: string | null;
  respostas: Record<string, string>;
  respondidas: number;
}

const ROSA = '#DB2777';

function dataBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

function horaBR(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Formulario({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [situacao, setSituacao] = useState<Situacao>('ocioso');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoEm, setEnviadoEm] = useState<string | null>(null);

  // Campos alterados e ainda não confirmados pelo servidor. Fica em ref porque
  // o temporizador do autosave lê isto fora do ciclo de render.
  const pendentes = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvandoAgora = useRef(false);
  // Espelho do que está digitado. O temporizador dispara fora do render e
  // precisa do texto ATUAL, não do que existia quando ele foi agendado.
  const valoresRef = useRef<Record<string, string>>({});

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/q/${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setErroFatal(j?.error || 'Não foi possível abrir este link.'); return; }
        setDados(j);
        setValores(j.respostas ?? {});
        valoresRef.current = { ...(j.respostas ?? {}) };
        setEnviadoEm(j.enviado_em ?? null);
      } catch {
        if (vivo) setErroFatal('Não foi possível abrir este link. Verifique a conexão.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  // ── Autosave ───────────────────────────────────────────────────────────────
  const gravar = useCallback(async () => {
    if (salvandoAgora.current) return;
    const ids = [...pendentes.current];
    if (ids.length === 0) return;

    salvandoAgora.current = true;
    setSituacao('salvando');
    // Some da fila ANTES do envio: o que a pessoa digitar durante a requisição
    // entra de novo e vai na próxima rodada, em vez de se perder.
    pendentes.current.clear();

    // Manda SÓ os campos mexidos, com o texto mais recente.
    const corpo: Record<string, string> = {};
    for (const id of ids) corpo[id] = valoresRef.current[id] ?? '';

    try {
      const r = await fetch(`/api/q/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas: corpo }),
      });
      const j = await r.json().catch(() => ({}));

      if (r.status === 429) {
        // Piso entre gravações: devolve os campos pra fila e tenta de novo.
        for (const id of ids) pendentes.current.add(id);
        setSituacao('salvando');
        setTimeout(() => { salvandoAgora.current = false; gravar(); }, 1200);
        return;
      }
      if (!r.ok) throw new Error(j?.error || 'falha ao salvar');

      setSalvoEm(j?.salvo_em ?? new Date().toISOString());
      setSituacao(pendentes.current.size > 0 ? 'salvando' : 'salvo');
    } catch {
      for (const id of ids) pendentes.current.add(id);
      setSituacao('erro');
      setTimeout(() => { salvandoAgora.current = false; gravar(); }, 4000);
      return;
    }

    salvandoAgora.current = false;
    // Chegou coisa nova enquanto gravava.
    if (pendentes.current.size > 0) gravar();
  }, [token]);

  const mudar = (id: string, texto: string) => {
    valoresRef.current[id] = texto;
    setValores((v) => ({ ...v, [id]: texto }));
    pendentes.current.add(id);
    setSituacao('salvando');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { gravar(); }, 1500);
  };

  // Sai da página com coisa pendente: tenta uma última gravação.
  useEffect(() => {
    const aoSair = () => { if (pendentes.current.size > 0) gravar(); };
    window.addEventListener('pagehide', aoSair);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gravar]);

  const enviarRespostas = async () => {
    setEnviando(true);
    try {
      if (pendentes.current.size > 0) await gravar();
      const r = await fetch(`/api/q/${encodeURIComponent(token)}/enviar`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'falha ao enviar');
      setEnviadoEm(j?.enviado_em ?? new Date().toISOString());
    } catch {
      setSituacao('erro');
    } finally {
      setEnviando(false);
    }
  };

  // ── Telas de contorno ──────────────────────────────────────────────────────
  if (carregando) {
    return <Moldura><p style={{ color: '#555' }}>Carregando…</p></Moldura>;
  }

  if (erroFatal || !dados) {
    return (
      <Moldura>
        <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>Link inválido ou expirado</h1>
        <p style={{ color: '#555', lineHeight: 1.6, margin: 0 }}>
          {erroFatal || 'Este link não é mais válido.'} Se você recebeu este endereço da Nova
          Tratores, peça um link novo para quem enviou.
        </p>
      </Moldura>
    );
  }

  const total = IDS_PERGUNTAS.length;
  const feitas = IDS_PERGUNTAS.filter((id) => String(valores[id] ?? '').trim() !== '').length;
  const somenteLeitura = !dados.editavel;

  return (
    <Moldura>
      <header style={{ borderBottom: `3px solid ${ROSA}`, paddingBottom: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: ROSA, textTransform: 'uppercase' }}>
          Questionário pós-evento
        </div>
        <h1 style={{ fontSize: 22, margin: '4px 0 6px', lineHeight: 1.25 }}>
          {dados.evento.nome}{dados.evento.edicao ? ` · ${dados.evento.edicao}` : ''}
        </h1>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.5 }}>
          {dados.evento.data_inicio && (
            <div>
              {dataBR(dados.evento.data_inicio)}
              {dados.evento.data_fim && dados.evento.data_fim !== dados.evento.data_inicio
                ? ` a ${dataBR(dados.evento.data_fim)}` : ''}
              {dados.evento.local ? ` · ${dados.evento.local}` : ''}
            </div>
          )}
          {dados.destinatario_nome && <div>Respondido por: <b>{dados.destinatario_nome}</b></div>}
        </div>
      </header>

      {somenteLeitura && (
        <Aviso cor="#6b7280">
          Este questionário foi fechado. As respostas ficaram registradas e não podem mais ser
          alteradas.
        </Aviso>
      )}

      {enviadoEm && !somenteLeitura && (
        <Aviso cor="#16a34a">
          Enviado em {horaBR(enviadoEm)}. Obrigado. Você ainda pode corrigir ou completar
          qualquer resposta — é só editar que salva sozinho.
        </Aviso>
      )}

      {!somenteLeitura && (
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: '0 0 18px' }}>
          Não precisa responder tudo de uma vez. O que você escrever é salvo automaticamente, e
          dá para fechar e voltar neste mesmo link depois. Pode responder do jeito que lembrar,
          sem se preocupar com formato.
        </p>
      )}

      {SECOES.map((secao) => {
        const perguntas = perguntasDaSecao(secao);
        if (perguntas.length === 0) return null;
        return (
          <section key={secao} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: ROSA, margin: '0 0 12px' }}>
              {secao}
            </h2>
            {perguntas.map((p) => (
              <div key={p.id} style={{ marginBottom: 18 }}>
                <label htmlFor={p.id} style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.45, marginBottom: 2 }}>
                  {p.texto}
                </label>
                {p.ajuda && (
                  <div style={{ fontSize: 13, color: '#777', marginBottom: 6 }}>{p.ajuda}</div>
                )}
                <AutoTextarea
                  id={p.id}
                  valor={valores[p.id] ?? ''}
                  onMuda={(t) => mudar(p.id, t)}
                  somenteLeitura={somenteLeitura}
                />
              </div>
            ))}
          </section>
        );
      })}

      {!somenteLeitura && (
        <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 16, marginBottom: 90 }}>
          <button
            onClick={enviarRespostas}
            disabled={enviando}
            style={{
              width: '100%', padding: '15px', fontSize: 16, fontWeight: 700,
              color: '#111111', background: '#F472B6', border: 'none', borderRadius: 4,
              cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.6 : 1,
            }}
          >
            {enviando ? 'Enviando…' : enviadoEm ? 'Enviar de novo' : 'Enviar respostas'}
          </button>
          <p style={{ fontSize: 13, color: '#777', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
            Enviar só avisa a equipe que você terminou. Suas respostas já estão salvas.
          </p>
        </div>
      )}

      {/* Barra fixa de situação: sempre visível enquanto a pessoa digita. */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          background: '#fefefe', borderTop: '1px solid #e5e5e5',
          padding: '10px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 10, fontSize: 13,
        }}
      >
        <span style={{ color: '#555' }}>
          <b>{feitas}</b> de {total} respondidas
        </span>
        <Indicador situacao={situacao} salvoEm={salvoEm} somenteLeitura={somenteLeitura} />
      </div>
    </Moldura>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8', color: '#111111' }}>
      <div
        style={{
          maxWidth: 720, margin: '0 auto', padding: '22px 16px 0',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Aviso({ children, cor }: { children: React.ReactNode; cor: string }) {
  return (
    <div
      style={{
        border: `1px solid ${cor}`, borderLeft: `4px solid ${cor}`,
        background: '#fefefe', borderRadius: 4, padding: 12,
        fontSize: 14, lineHeight: 1.55, marginBottom: 18,
      }}
    >
      {children}
    </div>
  );
}

function Indicador({
  situacao, salvoEm, somenteLeitura,
}: { situacao: Situacao; salvoEm: string | null; somenteLeitura: boolean }) {
  if (somenteLeitura) return <span style={{ color: '#777' }}>Somente leitura</span>;
  if (situacao === 'salvando') return <span style={{ color: '#777' }}>Salvando…</span>;
  if (situacao === 'erro') {
    return <span style={{ color: '#b91c1c', fontWeight: 600 }}>Sem conexão — tentando de novo</span>;
  }
  if (salvoEm) {
    const h = new Date(salvoEm).toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    });
    return <span style={{ color: '#16a34a' }}>Salvo às {h}</span>;
  }
  return <span style={{ color: '#999' }}>Salva sozinho</span>;
}

/** Cresce com o texto: numa feira ninguém quer rolar dentro de um campinho. */
function AutoTextarea({
  id, valor, onMuda, somenteLeitura,
}: { id: string; valor: string; onMuda: (t: string) => void; somenteLeitura: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 68)}px`;
  }, []);

  useEffect(() => { ajustar(); }, [valor, ajustar]);

  return (
    <textarea
      id={id}
      ref={ref}
      value={valor}
      readOnly={somenteLeitura}
      onChange={(e) => { onMuda(e.target.value); ajustar(); }}
      rows={2}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
        // 16px é obrigatório: abaixo disso o iPhone dá zoom ao focar o campo.
        fontSize: 16, lineHeight: 1.5,
        fontFamily: 'inherit', color: '#111111',
        background: somenteLeitura ? '#f0f0f0' : '#fefefe',
        border: '1px solid #d4d4d4', borderRadius: 4,
        resize: 'none', overflow: 'hidden', minHeight: 68,
      }}
    />
  );
}
