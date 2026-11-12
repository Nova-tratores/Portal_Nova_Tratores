'use client';
// Conteúdo e publicar → Contas das redes (12/11/2026). Mostra o que já está ligado e o que falta para cada rede postar
// sozinha. Etapa 1 (agora): tudo sai pelo celular em 1 toque. Etapa 2: Instagram e Facebook pela conta da Meta.
// Etapa 3: TikTok e YouTube depois da aprovação deles (algumas semanas).
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/site/ui';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_CONTEUDO } from '@/components/site/abasConteudo';
import { IconeRede } from '@/components/site/Artes';
import { REDE, type RedeId } from '@/lib/site/redes';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from '@/components/site/np';

type Conta = { rede: RedeId; nome: string | null; ligado_por: string | null; atualizado_em: string; expira_em: string | null };

const PASSOS: Record<Exclude<RedeId, 'site'>, { etapa: string; hoje: string; falta: string[] }> = {
  instagram: {
    etapa: 'Etapa 2: posta sozinho',
    hoje: 'Hoje: pelo celular, em 1 toque, no calendário.',
    falta: ['T.I. cria o app da Meta (developers.facebook.com) com a conta da empresa', 'Põe META_APP_ID e META_APP_SECRET no Railway', 'Você toca em “Ligar” e entra com o Facebook dono da página'],
  },
  facebook: {
    etapa: 'Etapa 2: posta sozinho',
    hoje: 'Hoje: pelo celular, em 1 toque, no calendário.',
    falta: ['Mesmo app da Meta do Instagram (liga os dois juntos)'],
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
  const [erro, setErro] = useState('');
  useEffect(() => {
    fetchAuth('/api/site/posts?de=2000-01-01&ate=2000-01-01').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler as contas.'); setContas([]); return; }
      setContas(j.contas || []); setMeta(!!j.metaConfigurada);
    });
  }, []);

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      <div style={grade(280)}>
        {(['instagram', 'facebook', 'tiktok', 'youtube'] as const).map((id) => {
          const c = (contas || []).find((x) => x.rede === id);
          const p = PASSOS[id];
          const r = REDE[id];
          const podeLigar = (id === 'instagram' || id === 'facebook') && meta;
          return (
            <section key={id} style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${r.cor} 10%, var(--surface))`, border: `1px solid color-mix(in srgb, ${r.cor} 20%, transparent)` }}><IconeRede id={id} tam={20} /></span>
                <span style={{ display: 'grid' }}>
                  <span style={{ fontSize: 16 }}>{r.nome}</span>
                  <span style={{ fontSize: 12.5, color: c ? '#16a34a' : T3 }}>{c ? `Ligada: ${c.nome || 'conta da empresa'}` : 'Não ligada'}</span>
                </span>
              </div>
              <span style={{ fontSize: 13, color: T2 }}>{c ? 'Posta sozinha no dia e hora marcados no calendário.' : p.hoje}</span>
              {!c && (
                <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'var(--portal-bg)' }}>
                  <span style={{ fontSize: 12.5, color: T1 }}>{p.etapa}</span>
                  {p.falta.map((f, i) => <span key={i} style={{ fontSize: 12.5, color: T3, display: 'flex', gap: 8 }}><span>{i + 1}.</span><span>{f}</span></span>)}
                </div>
              )}
              <button type="button" style={{ ...bt(r.cor, podeLigar), width: 'fit-content' }} disabled={!podeLigar || !!c}
                title={podeLigar ? 'Entra com o Facebook dono da página' : 'Falta o passo do T.I. acima'}>
                {ic(c ? 'fa-circle-check' : 'fa-link')}{c ? 'Ligada' : podeLigar ? 'Ligar' : 'Ligar (falta o T.I.)'}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
