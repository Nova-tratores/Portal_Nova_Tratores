'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aba "Relatório" — prévia, PDF e envio do relatório de contrapartida.
//
// Duas travas de propósito:
//  1. A prévia mostra TUDO que está como "Não registrado" ANTES de deixar
//     enviar. O documento sai do mesmo jeito se a pessoa quiser, mas ninguém
//     manda um relatório furado pra fábrica sem ver.
//  2. Enviar exige a permissão 'marketing:relatorio:enviar' — é a única ação do
//     módulo que manda mensagem pra fora da empresa. O botão desabilitado é
//     cortesia; quem barra de verdade é a rota.
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Mail, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { STATUS_RELATORIO, rotulo, cor } from '@/lib/marketing/tipos';
import Modal from '../Modal';
import {
  apiGet, apiEnviar, dataBR, Painel, Titulo, Selo, Campo, estiloInput,
  BotaoRosa, Vazio, Erro, ROSA,
} from '../ui';

export default function RelatorioAba({ apoios, onMudou }: { apoios: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEnviar = pode('marketing', 'relatorio:enviar');

  const [apoioId, setApoioId] = useState<string>(apoios[0]?.id ?? '');
  const [previa, setPrevia] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [envioAberto, setEnvio] = useState(false);
  const [para, setPara] = useState('');
  const [copia, setCopia] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!apoioId) { setPrevia(null); return; }
    setCarregando(true);
    setErro(null);
    try {
      const r = await apiGet<any>(`/api/marketing/contrapartida/${apoioId}/previa`);
      setPrevia(r.relatorio);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível montar a prévia.');
    } finally {
      setCarregando(false);
    }
  }, [apoioId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (teste: boolean) => {
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await apiEnviar<any>(`/api/marketing/contrapartida/${apoioId}/enviar`, 'POST', {
        to: para.trim() || undefined,
        cc: copia.trim() || undefined,
        mensagem: mensagem.trim() || undefined,
        teste,
      });
      setResultado(
        teste
          ? `Teste enviado para ${r.destinatarios.join(', ')}. O apoio continua marcado como pendente.`
          : `Relatório enviado para ${r.destinatarios.join(', ')}.`,
      );
      if (!teste) { setEnvio(false); onMudou(); }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  };

  if (apoios.length === 0) {
    return (
      <Vazio>
        O relatório de contrapartida é prestação de contas de um apoio de fábrica.
        Cadastre o apoio na aba &quot;Apoio de fábrica&quot; primeiro.
      </Vazio>
    );
  }

  const apoio = apoios.find((a) => a.id === apoioId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={{ ...estiloInput, flex: '1 1 260px' }} value={apoioId} onChange={(e) => setApoioId(e.target.value)}>
          {apoios.map((a) => <option key={a.id} value={a.id}>{a.apoiador}</option>)}
        </select>
        {apoio && <Selo texto={rotulo(STATUS_RELATORIO, apoio.relatorio_status)} cor={cor(STATUS_RELATORIO, apoio.relatorio_status)} />}
        <a
          href={`/api/marketing/contrapartida/${apoioId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, borderRadius: 3, border: '1px solid var(--portal-border)', color: 'var(--portal-text)', textDecoration: 'none' }}
        >
          <FileText size={15} /> Abrir PDF
        </a>
        <BotaoRosa
          onClick={() => { setResultado(null); setErro(null); setEnvio(true); }}
          {...gateBtn(podeEnviar)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeEnviar) }}
        >
          <Mail size={16} /> Enviar à fábrica
        </BotaoRosa>
      </div>

      {apoio?.relatorio_enviado_em && (
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
          Último envio em {dataBR(apoio.relatorio_enviado_em)}
          {apoio.relatorio_enviado_para?.length ? ` para ${apoio.relatorio_enviado_para.join(', ')}` : ''}.
        </div>
      )}

      {erro && <Erro>{erro}</Erro>}
      {resultado && (
        <div style={{ padding: 12, borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#111111', fontSize: 13 }}>
          {resultado}
        </div>
      )}

      {carregando ? (
        <Vazio>Montando a prévia…</Vazio>
      ) : !previa ? (
        <Vazio>Escolha um apoio.</Vazio>
      ) : (
        <>
          {previa.pendencias.length > 0 && (
            <Painel style={{ borderLeft: '3px solid #dc2626' }}>
              <Titulo>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <AlertTriangle size={16} color="#dc2626" />
                  {previa.pendencias.length} item(ns) sairão como &quot;Não registrado&quot;
                </span>
              </Titulo>
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', marginBottom: 8 }}>
                O relatório não esconde o que falta. Preencha antes de mandar, ou envie assim mesmo
                sabendo o que a fábrica vai ver.
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
                {previa.pendencias.map((p: string, i: number) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
              </ul>
            </Painel>
          )}

          {previa.secoes.map((s: any, i: number) => (
            <Painel key={i}>
              <Titulo>{s.titulo}</Titulo>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.linhas.map((l: any, j: number) => (
                  <div key={j} style={{ display: 'flex', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 200, fontWeight: 600, color: 'var(--portal-text)' }}>{l.rotulo}</span>
                    <span style={{ flex: 1, color: l.valor === 'Não registrado' ? '#dc2626' : 'var(--portal-text)' }}>{l.valor}</span>
                  </div>
                ))}
              </div>
              {s.tabela && (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--portal-bg)' }}>
                        {s.tabela.cabecalho.map((c: string) => (
                          <th key={c} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--portal-text)', borderBottom: '1px solid var(--portal-border)' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.tabela.linhas.map((l: string[], j: number) => (
                        <tr key={j} style={{ borderBottom: '1px solid var(--portal-border)' }}>
                          {l.map((c, k) => (
                            <td key={k} style={{ padding: '6px 8px', color: c === 'Não registrado' ? '#dc2626' : 'var(--portal-text)' }}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.texto && (
                <div style={{ marginTop: 8, fontSize: 13, fontStyle: 'italic', color: 'var(--portal-text)' }}>{s.texto}</div>
              )}
            </Painel>
          ))}

          <Painel>
            <Titulo>Registro fotográfico ({previa.fotos.length})</Titulo>
            {previa.fotos.length === 0 ? (
              <Vazio>
                Nenhuma foto marcada como evidência. Na aba Mídia, marque &quot;Usar no relatório à fábrica&quot;.
              </Vazio>
            ) : (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {previa.fotos.slice(0, 6).map((f: any, i: number) => (
                  <div key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.legenda} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 3 }} />
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted, #64748b)', marginTop: 3 }}>{f.legenda}</div>
                  </div>
                ))}
              </div>
            )}
            {previa.fotos.length > 6 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                O PDF leva as 6 primeiras, na ordem definida na aba Mídia.
              </div>
            )}

            {previa.videos?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 5 }}>
                  Vídeos ({previa.videos.length})
                </div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', marginBottom: 6 }}>
                  Vídeo não cabe num PDF. No relatório eles saem como link, para a fábrica abrir.
                </div>
                {previa.videos.map((v: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                      {v.legenda !== 'Não registrado' ? v.legenda : v.url}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Painel>
        </>
      )}

      <Modal titulo="Enviar relatório de contrapartida" aberto={envioAberto} onFechar={() => setEnvio(false)} largura={640}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
            Isto manda um e-mail <b>para fora da empresa</b>, com o PDF em anexo.
          </div>
          {previa?.pendencias?.length > 0 && (
            <div style={{ padding: 12, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111', fontSize: 13 }}>
              {previa.pendencias.length} item(ns) ainda sem registro vão aparecer como &quot;Não registrado&quot; no documento.
            </div>
          )}

          <Campo label="Para" ajuda="Em branco usa os destinatários configurados em Dev → Envios de e-mail." largura="1 1 100%">
            <input style={estiloInput} value={para} onChange={(e) => setPara(e.target.value)} placeholder="marketing@fabrica.com; outro@fabrica.com" />
          </Campo>
          <Campo label="Cópia" largura="1 1 100%">
            <input style={estiloInput} value={copia} onChange={(e) => setCopia(e.target.value)} />
          </Campo>
          <Campo label="Mensagem" largura="1 1 100%">
            <textarea rows={3} style={{ ...estiloInput, resize: 'vertical' }} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </Campo>

          {erro && <Erro>{erro}</Erro>}
          {resultado && (
            <div style={{ padding: 12, borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#111111', fontSize: 13 }}>
              {resultado}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: `2px solid ${ROSA}`, paddingTop: 12 }}>
            <button
              type="button"
              onClick={() => enviar(true)}
              disabled={enviando || !para.trim()}
              title={para.trim() ? 'Manda só pro endereço em "Para" e não marca o apoio como entregue' : 'Informe um endereço em "Para" para testar'}
              style={{ padding: '9px 16px', fontSize: 14, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer', opacity: enviando || !para.trim() ? 0.5 : 1 }}
            >
              Enviar teste
            </button>
            <BotaoRosa onClick={() => enviar(false)} disabled={enviando} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={15} /> {enviando ? 'Enviando…' : 'Enviar à fábrica'}
            </BotaoRosa>
          </div>
        </div>
      </Modal>
    </div>
  );
}
