'use client';
import { useState, useEffect } from 'react';
import { Mail, ChevronDown, ChevronUp, Loader2, Send, Inbox, FileText, Download } from 'lucide-react';
import type { GarantiaEmail } from '@/lib/garantias/types';
import { fmtDataHora } from '@/lib/garantias/format';

interface Props {
  garantiaId: string;
  naoLidos?: number;
}

// Seção colapsável "Conversa com a fábrica": thread de e-mails ENVIADOS
// (SG/solicitação/ressarcimento) e RECEBIDOS (casados pelo cron IMAP) da
// garantia. Abrir a seção marca os recebidos como lidos (padrão chat).
// Convive com "Emails do Trator" (acervo antigo por chassi) — esta é por
// garantia.
export default function ConversaFabrica({ garantiaId, naoLidos = 0 }: Props) {
  const [aberto, setAberto] = useState(false);
  const [emails, setEmails] = useState<GarantiaEmail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [badge, setBadge] = useState(naoLidos);

  // O drawer recarrega a garantia (cron pode ter casado resposta nova) —
  // o badge acompanha a prop
  useEffect(() => {
    setBadge(naoLidos);
  }, [naoLidos]);

  async function abrir() {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (abrindo) {
      // Rebusca a CADA abertura: um e-mail recém-enviado pela seção de
      // solicitação (ou resposta casada pelo cron) precisa aparecer sem
      // fechar o drawer inteiro.
      setLoading(true);
      try {
        const res = await fetch(`/api/garantias/${garantiaId}/emails`);
        if (!res.ok) throw new Error('Falha ao listar a conversa');
        const data = await res.json();
        setEmails(data.emails || []);
        // Só marca como lidas quando a lista realmente carregou —
        // senão zeraríamos o badge de mensagens que ninguém viu.
        fetch(`/api/garantias/${garantiaId}/emails`, { method: 'POST' }).catch(() => {});
        setBadge(0);
      } catch {
        // mantém emails como estava (null = permite nova tentativa)
      }
      setLoading(false);
    }
  }

  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={abrir}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: 14, border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}
      >
        <Mail size={14} />
        Conversa com a fábrica
        {badge > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626', borderRadius: 10, padding: '1px 7px' }}>
            {badge} nova(s)
          </span>
        )}
        {emails !== null && badge === 0 && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)', fontWeight: 700 }}>
            {emails.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>

      {aberto && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--portal-text-muted)' }}>
              <Loader2 size={16} className="spin" />
            </div>
          ) : !emails || emails.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--portal-text-muted)' }}>
              Nenhum e-mail registrado ainda. Os envios entram aqui automaticamente e as respostas da
              fábrica chegam às 07:30 e 12:00.
            </div>
          ) : (
            emails.map((e) => {
              const enviado = e.direcao === 'enviado';
              const exp = expandido === e.id;
              return (
                <div
                  key={e.id}
                  style={{
                    borderRadius: 8, border: '1px solid var(--portal-border)',
                    borderLeft: `3px solid ${enviado ? '#8b5cf6' : '#0d9488'}`,
                    background: 'var(--portal-bg-secondary)',
                  }}
                >
                  <div
                    onClick={() => setExpandido(exp ? null : e.id)}
                    style={{ padding: '8px 10px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                          background: enviado ? '#F5F3FF' : '#CCFBF1',
                          color: enviado ? '#7C3AED' : '#0F766E',
                        }}
                      >
                        {enviado ? <Send size={9} /> : <Inbox size={9} />}
                        {enviado ? 'ENVIADO' : 'RECEBIDO'}
                      </span>
                      {!e.lida && !enviado && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {e.assunto || '(sem assunto)'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--portal-text-muted)', flexShrink: 0 }}>
                        {e.data ? fmtDataHora(e.data) : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                      {enviado ? `Para: ${(e.para || []).join(', ')}` : `De: ${e.de || '—'}`}
                      {(e.anexos?.length || 0) > 0 && ` · ${e.anexos.length} anexo(s)`}
                    </div>
                  </div>
                  {exp && (
                    <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(e.corpo_texto || e.corpo_html) && (
                        <div
                          style={{
                            padding: 10, background: 'var(--portal-bg-card)', borderRadius: 8,
                            border: '1px solid var(--portal-border)', fontSize: 12,
                            color: 'var(--portal-text-secondary)', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto',
                          }}
                        >
                          {e.corpo_texto || String(e.corpo_html || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()}
                        </div>
                      )}
                      {(e.anexos?.length || 0) > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {e.anexos.map((a, ai) =>
                            a.url ? (
                              <a
                                key={ai}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                                  borderRadius: 8, border: '1px solid rgba(13,148,136,0.25)',
                                  background: 'rgba(13,148,136,0.06)', textDecoration: 'none',
                                  fontSize: 12, color: '#0f766e', fontWeight: 600,
                                }}
                              >
                                <FileText size={13} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                                <Download size={12} style={{ opacity: 0.6 }} />
                              </a>
                            ) : (
                              <span key={ai} style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{a.nome}</span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
