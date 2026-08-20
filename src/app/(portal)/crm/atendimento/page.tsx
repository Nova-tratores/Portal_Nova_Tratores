'use client';
// Cockpit de Atendimento — triagem guiada do WhatsApp em 3 colunas:
// FILA (por SLA) | CONVERSA | JORNADA (script + botões + score ao vivo).
// A qualificação nasce da conversa: cada toque preenche o cadastro e
// recalcula o score. Demo interativa: responda o passo 6 e veja o score mudar.
import { useState } from 'react';
import Ideia from '@/components/crm/Ideia';
import { CONVERSAS, JORNADA_L8, CRITERIOS_L8, ARGUMENTOS, lead } from '@/lib/crm/demo';

export default function AtendimentoPage() {
  const [ativa, setAtiva] = useState('l8');
  const [respostaJanela, setRespostaJanela] = useState<{ rotulo: string; peso: number } | null>(null);
  const [enviado5, setEnviado5] = useState(false);
  const [mostraArgs, setMostraArgs] = useState(false);

  const conversa = CONVERSAS.find((c) => c.leadId === ativa)!;
  const l = lead(ativa);
  const scoreBase = CRITERIOS_L8.filter((c) => c.bateu).reduce((s, c) => s + c.peso, 0);
  const score = Math.min(100, scoreBase + (respostaJanela?.peso ?? 0));
  const veredito = score >= 70 ? 'AGENDAR VISITA' : score >= 40 ? 'NUTRIR' : 'DESCARTAR';
  const corVeredito = score >= 70 ? '#1B7A5F' : score >= 40 ? '#d97706' : '#dc2626';

  return (
    <div style={{ padding: '20px 16px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Cockpit de Atendimento</h1>

      <div style={{ maxWidth: 1100 }}>
        <Ideia titulo="A ideia desta tela">
          Desktop do <b>atendente</b> (o vendedor segue no celular). Fila ordenada por <b>SLA estourado → score →
          mais antigo</b> — a primeira resposta em 1 hora é a métrica mais barata de corrigir e a que mais move
          conversão. Na direita, a <b>jornada</b>: o script já vem interpolado com o nome do cliente, o botão Enviar
          despacha e marca o passo, e as respostas viram botões — <b>um toque grava o dado, preenche o cadastro e
          recalcula o score</b>. Teste: envie o passo 5 e responda o passo 6 pra ver o veredito mudar.
        </Ideia>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 280px) minmax(280px, 1fr) minmax(280px, 360px)', gap: 12, alignItems: 'start' }}>
        {/* ── FILA ── */}
        <div style={col}>
          <div style={colTitulo}>Fila (por urgência de SLA)</div>
          {[...CONVERSAS]
            .sort((a, b) => {
              const ea = a.slaHoras !== null && a.aguardandoMin > a.slaHoras * 60 ? 1 : 0;
              const eb = b.slaHoras !== null && b.aguardandoMin > b.slaHoras * 60 ? 1 : 0;
              return eb - ea || b.aguardandoMin - a.aguardandoMin;
            })
            .map((c) => {
              const cl = lead(c.leadId);
              const estourou = c.slaHoras !== null && c.aguardandoMin > c.slaHoras * 60;
              return (
                <button
                  key={c.leadId}
                  onClick={() => setAtiva(c.leadId)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '10px 12px', border: 'none', borderTop: '1px solid var(--portal-border)',
                    background: ativa === c.leadId ? 'var(--portal-bg-secondary)' : 'transparent',
                    color: 'var(--portal-text)', fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700, color: estourou ? '#dc2626' : 'var(--portal-text)' }}>
                    {estourou ? '⚠ ' : ''}{Math.floor(c.aguardandoMin / 60) > 0 ? `${Math.floor(c.aguardandoMin / 60)}h${c.aguardandoMin % 60 ? String(c.aguardandoMin % 60).padStart(2, '0') : ''}` : `${c.aguardandoMin}min`} sem resposta
                  </div>
                  <div>{cl.nome}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                    {cl.municipio} · SLA {c.slaHoras ?? '—'}h
                  </div>
                </button>
              );
            })}
        </div>

        {/* ── CONVERSA ── */}
        <div style={col}>
          <div style={colTitulo}>{l.nome} · {l.telefone.replace(/^55/, '+55 ')}</div>
          <div style={{ padding: 14, display: 'grid', gap: 8, minHeight: 260 }}>
            {conversa.mensagens.map((m, i) => (
              <div
                key={i}
                style={{
                  justifySelf: m.de === 'cliente' ? 'start' : 'end',
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: m.de === 'cliente' ? '2px 10px 10px 10px' : '10px 2px 10px 10px',
                  background: m.de === 'cliente' ? 'var(--portal-bg-secondary)' : '#1B7A5F',
                  color: m.de === 'cliente' ? 'var(--portal-text)' : '#fefefe',
                  fontSize: 13.5, lineHeight: 1.45,
                }}
              >
                {m.texto}
                <div style={{ fontSize: 10.5, opacity: 0.7, textAlign: 'right', marginTop: 2 }}>{m.hora}</div>
              </div>
            ))}
            {enviado5 && ativa === 'l8' && (
              <div style={{ justifySelf: 'end', maxWidth: '85%', padding: '8px 12px', borderRadius: '10px 2px 10px 10px', background: '#1B7A5F', color: '#fefefe', fontSize: 13.5 }}>
                Quantos alqueires você trabalha hoje? E é com o quê — pasto, café, grão?
                <div style={{ fontSize: 10.5, opacity: 0.7, textAlign: 'right', marginTop: 2 }}>agora</div>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--portal-border)', padding: 10, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
            ✍️ composer — no real, envia direto pela central (Evolution/n8n). Com número único, a mensagem do
            vendedor sai assinada (&quot;*Nome:*&quot;) e a do atendente sai como a marca.
          </div>
        </div>

        {/* ── JORNADA ── */}
        <div style={col}>
          <div style={colTitulo}>Jornada — passo a passo</div>
          <div style={{ padding: '12px 14px' }}>
            {ativa !== 'l8' ? (
              <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>
                (Na demo, a jornada completa está montada na conversa da <b>Chácara Recanto</b> — clique nela na fila.)
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 8 }}>
                  Passo {enviado5 ? 6 : 5} de {JORNADA_L8.length} · {JORNADA_L8.filter((p) => p.feito).length + (respostaJanela ? 2 : enviado5 ? 1 : 0)} concluídos
                </div>

                {JORNADA_L8.map((p) => {
                  const feito = p.feito || (p.ordem === 5 && enviado5) || (p.ordem === 6 && !!respostaJanela);
                  const atual = !feito && ((p.ordem === 5 && !enviado5) || (p.ordem === 6 && enviado5 && !respostaJanela));
                  return (
                    <div
                      key={p.ordem}
                      style={{
                        padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                        border: atual ? '1.5px solid #1B7A5F' : '1px solid var(--portal-border)',
                        background: atual ? 'var(--portal-bg-secondary)' : 'transparent',
                        opacity: feito ? 0.75 : 1, fontSize: 12.5,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {feito ? '✓' : atual ? '▸' : '·'} {p.ordem}. {p.titulo}
                        {feito && p.resposta && (
                          <span style={{ fontWeight: 400, color: '#1B7A5F' }}> — {p.ordem === 6 ? respostaJanela?.rotulo : p.resposta}</span>
                        )}
                        {p.ordem === 5 && enviado5 && <span style={{ fontWeight: 400, color: '#1B7A5F' }}> — enviado, aguardando</span>}
                      </div>
                      {atual && (
                        <div style={{ marginTop: 6 }}>
                          {p.script && (
                            <div style={{ background: 'var(--portal-bg-card)', border: '1px dashed var(--portal-border)', borderRadius: 7, padding: '8px 10px', fontStyle: 'italic' }}>
                              “{p.script}”
                            </div>
                          )}
                          <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginTop: 5 }}>
                            ⓘ {p.ajuda}
                          </div>
                          {p.ordem === 5 && (
                            <button
                              onClick={() => setEnviado5(true)}
                              style={{ marginTop: 7, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#1B7A5F', color: '#fefefe', fontWeight: 700, fontSize: 12.5 }}
                            >
                              Enviar no WhatsApp
                            </button>
                          )}
                          {p.opcoes && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
                              {p.opcoes.map((o) => (
                                <button
                                  key={o.rotulo}
                                  onClick={() => setRespostaJanela(o)}
                                  style={{ padding: '6px 11px', borderRadius: 99, cursor: 'pointer', border: '1px solid #1B7A5F', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 12, fontWeight: 600 }}
                                >
                                  {o.rotulo} <span style={{ color: '#1B7A5F', fontWeight: 800 }}>+{o.peso}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Score ao vivo */}
                <div style={{ marginTop: 12, borderTop: '2px solid var(--portal-border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: 14 }}>Score {score}</b>
                    <span style={{ padding: '3px 12px', borderRadius: 99, background: corVeredito, color: '#fefefe', fontSize: 11.5, fontWeight: 800 }}>
                      {veredito}
                    </span>
                  </div>
                  <div style={{ marginTop: 7, display: 'grid', gap: 3, fontSize: 12 }}>
                    {CRITERIOS_L8.map((c) => (
                      <div key={c.nome} style={{ display: 'flex', justifyContent: 'space-between', color: c.bateu ? 'var(--portal-text)' : 'var(--portal-text-secondary)' }}>
                        <span>{c.bateu ? '✓' : '✗'} {c.nome}</span>
                        <b>{c.bateu ? `+${c.peso}` : '0'}</b>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: respostaJanela ? 'var(--portal-text)' : 'var(--portal-text-secondary)' }}>
                      <span>{respostaJanela ? '✓' : '✗'} Janela de compra {respostaJanela ? `(${respostaJanela.rotulo})` : '(responda o passo 6)'}</span>
                      <b>{respostaJanela ? `+${respostaJanela.peso}` : '0'}</b>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginTop: 6 }}>
                    Corte: ≥70 agenda visita · 40–69 nutrição · &lt;40 descarta. Os pesos vivem em tabela — depois
                    de ~30 leads, cruza-se o score com o desfecho real e ajusta sem deploy.
                  </div>
                </div>

                {/* Argumentos */}
                <button
                  onClick={() => setMostraArgs((v) => !v)}
                  style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontWeight: 700, fontSize: 13 }}
                >
                  ▸ Argumentos contra objeções ({ARGUMENTOS.length})
                </button>
                {mostraArgs && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    {ARGUMENTOS.map((a) => (
                      <div key={a.objecao} style={{ border: '1px solid var(--portal-border)', borderRadius: 8, padding: '9px 11px', fontSize: 12 }}>
                        <b>“{a.objecao}”</b>
                        <span style={{ marginLeft: 6, fontSize: 10.5, padding: '1px 8px', borderRadius: 99, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>{a.categoria}</span>
                        <div style={{ marginTop: 4, color: 'var(--portal-text-secondary)' }}>{a.resposta}</div>
                        <div style={{ marginTop: 4, color: '#1B7A5F', fontWeight: 600 }}>↩ {a.volta}</div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                      Cada argumento tem a <b>pergunta de volta</b> — devolver a palavra é o que impede a conversa de
                      morrer no argumento. O sistema registra se funcionou: a biblioteca melhora com o uso.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const col: React.CSSProperties = {
  background: 'var(--portal-bg-card)',
  border: '1px solid var(--portal-border)',
  borderRadius: 10,
  overflow: 'hidden',
};

const colTitulo: React.CSSProperties = {
  padding: '10px 14px',
  fontWeight: 800,
  fontSize: 13,
  background: 'var(--portal-bg-secondary)',
  borderBottom: '1px solid var(--portal-border)',
};
