'use client';
// Conteúdo e publicar → Contas das redes (12/11/2026). Mostra o que já está ligado e o que falta para cada rede postar
// sozinha. Etapa 1 (agora): tudo sai pelo celular em 1 toque. Etapa 2: Instagram e Facebook pela conta da Meta.
// Etapa 3: TikTok e YouTube depois da aprovação deles (algumas semanas).
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/marketing/redes/ui';
import SubAbas from '@/components/marketing/redes/SubAbas';
import { ABAS_CONTEUDO } from '@/components/marketing/redes/abasConteudo';
import { IconeRede } from '@/components/marketing/redes/Artes';
import { REDE, type RedeId } from '@/lib/marketing/redes/redes';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from '@/components/marketing/redes/np';

type Conta = { rede: RedeId; nome: string | null; conta_id: string | null; ligado_por: string | null; atualizado_em: string; expira_em: string | null };

const PASSOS: Record<Exclude<RedeId, 'site'>, { etapa: string; hoje: string; falta: string[] }> = {
  // 25/11/2026: app da Meta criado ("Portal Nova Tratores", login unificado, compatível com o Login do Instagram).
  instagram: {
    etapa: 'Etapa 2: números e post automático',
    hoje: 'Hoje: pelo celular, em 1 toque, no calendário.',
    falta: ['META_APP_ID, META_APP_SECRET e META_CONFIG_ID no Railway', 'Toque em “Ligar” e entre com o Instagram da Nova Tratores', 'Marque o Instagram na tela da Meta e confirme'],
  },
  // 25/11/2026: configuração "Portal - Página" criada (2686053825156996).
  facebook: {
    etapa: 'Etapa 2: ligar a Página',
    hoje: 'Hoje: pelo celular, em 1 toque, no calendário.',
    falta: ['META_CONFIG_ID_FACEBOOK no Railway', 'Toque em “Ligar”, escolha o portfólio Nova Tratores - Gerenciador de Negócios', 'Marque a Página da Nova Tratores e confirme'],
  },
  tiktok: {
    etapa: 'Etapa 3: depois da aprovação do TikTok',
    hoje: 'Hoje: pelo celular. O portal entrega o vídeo e o texto já copiado.',
    falta: ['T.I. cria o app em developers.tiktok.com', 'Pede a aprovação para postar (algumas semanas)', 'Até aprovar, o que vai pela API fica só visível para a conta'],
  },
  youtube: {
    etapa: 'Etapa 3: depois da aprovação do Google',
    hoje: 'Hoje: pelo celular. O portal entrega o vídeo e o título (primeiras 100 letras do texto).',
    falta: ['T.I. cria o projeto no Google Cloud e liga a YouTube Data API', 'Pede a verificação do app (algumas semanas)', 'Até verificar, o vídeo sobe como privado'],
  },
};

export default function ContasRedes() {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [meta, setMeta] = useState(false);
  const [metaFace, setMetaFace] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [indo, setIndo] = useState<RedeId | null>(null);
  const carregar = () => fetchAuth('/api/marketing/posts?de=2000-01-01&ate=2000-01-01').then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler as contas.'); setContas([]); return; }
    setContas(j.contas || []); setMeta(!!j.metaConfigurada); setMetaFace(!!j.metaFacebook);
  });
  useEffect(() => {
    // Volta do login da Meta: ?ligado=instagram|facebook&nome=… ou ?erro=…
    const q = new URLSearchParams(location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.get('erro')) setErro(`Não ligou: ${q.get('erro')}`);
    const lig = q.get('ligado');
    if (lig) setOk(`${lig === 'facebook' ? 'Facebook' : 'Instagram'} ligado${q.get('nome') ? `: ${q.get('nome')}` : ''}.${lig === 'instagram' ? ' Os números dos últimos 30 dias chegam em alguns minutos na aba Acessos.' : ''}`);
    if (q.toString()) history.replaceState(null, '', location.pathname);
    carregar();
  }, []);

  async function ligar(rede: RedeId) {
    setIndo(rede); setErro('');
    const r = await fetchAuth(`/api/marketing/redes/meta/ligar?rede=${rede}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { setErro(j.erro || 'Não consegui abrir o login da Meta.'); setIndo(null); return; }
    location.href = j.url;   // a página inteira vai para a Meta e volta sozinha
  }
  async function desligar(rede: RedeId) {
    if (!confirm(`Desligar o ${REDE[rede].nome}? O portal para de buscar os números até ligar de novo.`)) return;
    const r = await fetchAuth(`/api/marketing/redes/meta/ligar?rede=${rede}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui desligar.'); return; }
    setOk(''); carregar();
  }

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}
      <div style={grade(280)}>
        {(['instagram', 'facebook', 'tiktok', 'youtube'] as const).map((id) => {
          // sem conta_id = o acesso chegou mas o Instagram não foi achado: ainda não está ligada
          const c = (contas || []).find((x) => x.rede === id && x.conta_id);
          const p = PASSOS[id];
          const r = REDE[id];
          const daMeta = id === 'instagram' || id === 'facebook';
          const podeLigar = !indo && ((id === 'instagram' && meta) || (id === 'facebook' && metaFace));
          return (
            <section key={id} style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${r.cor} 10%, var(--surface))`, border: `1px solid color-mix(in srgb, ${r.cor} 20%, transparent)` }}><IconeRede id={id} tam={20} /></span>
                <span style={{ display: 'grid' }}>
                  <span style={{ fontSize: 16 }}>{r.nome}</span>
                  <span style={{ fontSize: 12.5, color: c ? '#16a34a' : T3 }}>{c ? `Ligada: ${c.nome || 'conta da empresa'}` : 'Não ligada'}</span>
                </span>
              </div>
              <span style={{ fontSize: 13, color: T2 }}>{c ? 'Números chegando todo dia na aba Acessos. Post automático: próxima etapa (por enquanto, pelo celular).' : p.hoje}</span>
              {!c && (
                <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'var(--portal-bg)' }}>
                  <span style={{ fontSize: 12.5, color: T1 }}>{p.etapa}</span>
                  {p.falta.map((f, i) => <span key={i} style={{ fontSize: 12.5, color: T3, display: 'flex', gap: 8 }}><span>{i + 1}.</span><span>{f}</span></span>)}
                </div>
              )}
              {c && daMeta ? (
                <button type="button" style={{ ...bt('#64748b', false), width: 'fit-content' }} onClick={() => desligar(id)}>
                  {ic('fa-link-slash')}Desligar
                </button>
              ) : (
                <button type="button" style={{ ...bt(r.cor, podeLigar), width: 'fit-content' }} disabled={!podeLigar || !!c} onClick={() => ligar(id)}
                  title={podeLigar ? 'Abre a Meta para escolher a conta da Nova Tratores' : 'Falta o passo acima'}>
                  {ic(c ? 'fa-circle-check' : 'fa-link')}{c ? 'Ligada' : indo === id ? 'Abrindo a Meta…' : podeLigar ? 'Ligar' : 'Ligar (falta o passo acima)'}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
