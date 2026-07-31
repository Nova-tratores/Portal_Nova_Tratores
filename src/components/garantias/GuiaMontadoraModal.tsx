'use client';
import { useEffect } from 'react';
import { X, HelpCircle, FileText, Lightbulb, Info, KeyRound, BookOpen, ExternalLink } from 'lucide-react';
import { guiaDaMontadora, GUIA_GENERICO, type PassoGuia } from '@/lib/garantias/guias';

interface Props {
  montadoraNome: string;
  onClose: () => void;
}

// Lista numerada de passos (reusada nas seções extras do guia).
function ListaPassos({ passos }: { passos: PassoGuia[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {passos.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span
              style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: '#fff',
                background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
              }}
            >
              {i + 1}
            </span>
            {i < passos.length - 1 && (
              <div style={{ width: 2, flex: 1, background: 'var(--portal-border)', minHeight: 12 }} />
            )}
          </div>
          <div style={{ paddingBottom: 14, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{p.titulo}</div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.55, marginTop: 2 }}>
              {p.descricao}
            </div>
            {p.dica && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#b45309', fontStyle: 'italic', marginTop: 4 }}>
                <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                {p.dica}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaObservacoes({ observacoes }: { observacoes: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {observacoes.map((o, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
            color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)',
            border: '1px solid var(--portal-border)', padding: '8px 10px', borderRadius: 8,
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: '#0ea5e9' }} />
          {o}
        </div>
      ))}
    </div>
  );
}

// Modal "Como solicitar garantia — {montadora}" (botão "?" da aba Montadoras
// e link "Como funciona?" do drawer). Conteúdo fixo em lib/garantias/guias.ts.
export default function GuiaMontadoraModal({ montadoraNome, onClose }: Props) {
  const guia = guiaDaMontadora(montadoraNome);
  const passos = guia?.passos || GUIA_GENERICO;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      // Fecha pelo MOUSEDOWN no próprio overlay (não onClick): selecionar as
      // credenciais e soltar sobre o fundo dispararia o click no overlay e
      // fecharia o guia no meio da cópia.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--portal-bg-card)', borderRadius: 16, width: '100%',
          maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: '1px solid var(--portal-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={18} color="#dc2626" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>
              Como solicitar garantia — {guia?.titulo || montadoraNome}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {guia ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.6 }}>
              {guia.resumo}
            </p>
          ) : (
            <div
              style={{
                fontSize: 12, color: '#b45309', background: '#f59e0b15',
                border: '1px solid #f59e0b55', padding: '8px 10px', borderRadius: 8,
              }}
            >
              O guia desta montadora ainda não foi escrito — abaixo o fluxo genérico do módulo.
            </div>
          )}

          {guia?.acesso && (
            <div
              style={{
                border: '1px solid #dc262655', background: '#dc262608',
                borderRadius: 10, padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <KeyRound size={14} color="#dc2626" />
                Acesso ao portal da montadora
              </div>
              <a
                href={guia.acesso.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#0ea5e9', fontWeight: 600, wordBreak: 'break-all' }}
              >
                {guia.acesso.url} <ExternalLink size={13} style={{ flexShrink: 0 }} />
              </a>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text)' }}>
                <span>Usuário: <strong style={{ fontFamily: 'monospace' }}>{guia.acesso.usuario}</strong></span>
                <span>Senha: <strong style={{ fontFamily: 'monospace' }}>{guia.acesso.senha}</strong></span>
              </div>
              {guia.acesso.observacao && (
                <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>{guia.acesso.observacao}</div>
              )}
            </div>
          )}

          {guia && guia.documentos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Documentos necessários
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {guia.documentos.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--portal-text)' }}>
                    <FileText size={14} style={{ flexShrink: 0, marginTop: 2, color: '#0d9488' }} />
                    {d}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Passo a passo
            </div>
            <ListaPassos passos={passos} />
          </div>

          {guia?.secoes?.map((secao, i) => (
            <div
              key={i}
              style={{
                borderTop: '2px solid var(--portal-border)', paddingTop: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)' }}>{secao.titulo}</div>
              {secao.intro && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.6 }}>
                  {secao.intro}
                </p>
              )}
              <ListaPassos passos={secao.passos} />
              {secao.observacoes && secao.observacoes.length > 0 && (
                <ListaObservacoes observacoes={secao.observacoes} />
              )}
            </div>
          ))}

          {guia?.observacoes && guia.observacoes.length > 0 && (
            <ListaObservacoes observacoes={guia.observacoes} />
          )}

          {guia?.manualUrl && (
            <a
              href={guia.manualUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
                background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', color: '#fff',
                fontSize: 13, fontWeight: 700,
              }}
            >
              <BookOpen size={16} />
              {guia.manualRotulo || 'Abrir o manual da montadora (PDF)'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
