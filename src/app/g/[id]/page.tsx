// Página PÚBLICA da garantia (destino do QR code): mostra a fase atual, o
// histórico de fases e as fotos — sem login. A "chave" é o UUID da garantia
// (não enumerável); nada de valores ou dados sensíveis do cliente aqui.
// Server component: lê direto com o client service-role do servidor.
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_EVENTOS, STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { listarFotosOS } from '@/lib/garantias/fotos-os';
import type { GarantiaStatus } from '@/lib/garantias/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EH_IMAGEM = /\.(jpe?g|png|gif|webp|heic)(\?|$)/i;

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function GarantiaQRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, status, id_ordem, modelo, chassis, created_at, enviada_fabrica_em, montadora:garantia_montadoras(nome)')
    .eq('id', id)
    .maybeSingle();
  if (!g) notFound();

  const mont = Array.isArray(g.montadora) ? g.montadora[0] : g.montadora;
  const status = g.status as GarantiaStatus;
  const cor = STATUS_COR[status] || '#64748b';
  const label = STATUS_LABEL[status] || g.status;

  // histórico de fases (eventos com mudança de status)
  const { data: eventos } = await supabase
    .from(TBL_GAR_EVENTOS)
    .select('tipo, status_novo, created_at')
    .eq('garantia_id', id)
    .not('status_novo', 'is', null)
    .order('created_at', { ascending: true })
    .limit(30);

  // fotos: relatório do técnico (nomeadas + extras) + anexos de imagem da garantia
  const fotosOS = g.id_ordem ? await listarFotosOS(g.id_ordem) : [];
  const { data: anexos } = await supabase
    .from('garantia_anexos')
    .select('url, nome_arquivo, content_type, categoria')
    .eq('garantia_id', id)
    .order('created_at', { ascending: true });
  const anexosImg = (anexos || []).filter(
    (a) => (a.content_type || '').startsWith('image/') || EH_IMAGEM.test(a.nome_arquivo || a.url || ''),
  );

  const cel: React.CSSProperties = { borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '1', background: '#f8fafc', display: 'block' };
  const img: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
  const secao: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: '#334155', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Cabeçalho */}
      <div style={{ background: '#C41E2A', color: '#fff', padding: '14px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>NOVA TRATORES</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Acompanhamento de garantia</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* Identificação + fase atual */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{g.numero}</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                {g.id_ordem}{mont?.nome ? ` · ${mont.nome}` : ''}{g.numero_externo ? ` · SG ${g.numero_externo}` : ''}
              </div>
            </div>
            <span style={{ background: cor, color: '#fff', fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '6px 14px', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
          {(g.modelo || g.chassis) && (
            <div style={{ fontSize: 12.5, color: '#475569', marginTop: 10 }}>
              {g.modelo && <>Modelo <strong>{g.modelo}</strong></>}
              {g.modelo && g.chassis && ' · '}
              {g.chassis && <>Chassi <strong>{g.chassis}</strong></>}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>
            Solicitada em {fmtData(g.created_at)}{g.enviada_fabrica_em ? ` · enviada à fábrica em ${fmtData(g.enviada_fabrica_em)}` : ''}
          </div>
        </div>

        {/* Histórico de fases */}
        {(eventos || []).length > 0 && (
          <>
            <div style={secao}>Histórico</div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '6px 16px' }}>
              {(eventos || []).map((ev, i) => {
                const st = ev.status_novo as GarantiaStatus;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < (eventos || []).length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COR[st] || '#cbd5e1', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', flex: 1 }}>{STATUS_LABEL[st] || ev.status_novo}</span>
                    <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{fmtData(ev.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Fotos do relatório do técnico */}
        {fotosOS.length > 0 && (
          <>
            <div style={secao}>Fotos da OS ({fotosOS.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {fotosOS.map((f) => (
                <a key={f.chave} href={f.url} target="_blank" rel="noreferrer" style={cel} title={f.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.label} style={img} loading="lazy" />
                </a>
              ))}
            </div>
          </>
        )}

        {/* Anexos de imagem da garantia (técnico/garantista/pendências) */}
        {anexosImg.length > 0 && (
          <>
            <div style={secao}>Anexos da garantia ({anexosImg.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {anexosImg.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" style={cel} title={a.nome_arquivo || ''}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.nome_arquivo || 'anexo'} style={img} loading="lazy" />
                </a>
              ))}
            </div>
          </>
        )}

        {fotosOS.length === 0 && anexosImg.length === 0 && (
          <div style={{ marginTop: 18, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Sem fotos anexadas até o momento.</div>
        )}

        <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          Página de acompanhamento gerada pelo Portal Nova Tratores.
        </div>
      </div>
    </div>
  );
}
