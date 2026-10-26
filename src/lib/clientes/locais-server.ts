// Onde fica o trator / o cliente — SÓ NO SERVIDOR (service role). Junta, do mais confiável
// para o menos: o vendedor viu o trator lá na visita (`trator_localizacao`, resposta "aqui"),
// a fazenda confirmada pelo GPS do carro do técnico (`clientes_localizacoes`, por CPF/CNPJ),
// o ponto anotado no CRM (`portal_nt_clientes_PRINCIPAL`) e o do cadastro. Sem nenhum ponto,
// devolve o endereço do cadastro para buscar no mapa. Usado pela fila Hoje (Feedbacks).

import { supabaseAdmin as db } from '@/lib/server/supabase-admin';

export interface LocalMapa {
  nome: string;
  lat: number;
  lng: number;
  origem: 'visita' | 'gps' | 'crm' | 'cadastro';
  quando: string | null;
  quem: string | null;
}

const num = (v: unknown) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s || null; };
const final7 = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-7);

export async function locaisDoTrator(p: { chassi?: string | null; codOmie?: string | number | null }): Promise<{ locais: LocalMapa[]; endereco: string | null }> {
  const chassi = String(p.chassi || '').trim();
  const cod = num(p.codOmie);
  const [visitas, cadastro, principal] = await Promise.all([
    chassi.length >= 7
      ? db.from('trator_localizacao').select('chassis, resposta, lat, lng, vendedor_nome, confirmado_em')
        .ilike('chassis', `%${final7(chassi).slice(-6)}`).order('confirmado_em', { ascending: false }).limit(10)
        .then((r) => (r.error ? [] : (r.data || [])))
      : Promise.resolve([]),
    cod != null
      ? db.from('portal_nt_clientes_cadastro_omie').select('cnpj_cpf, endereco, bairro, cidade, lat, lng').eq('cod_cli', cod).limit(1)
        .then((r) => r.data?.[0] || null)
      : Promise.resolve(null),
    cod != null
      ? db.from('portal_nt_clientes_PRINCIPAL').select('lat, lng, latitude, longitude, endereco, cidade').eq('id_omie', cod).limit(1)
        .then((r) => r.data?.[0] || null)
      : Promise.resolve(null),
  ]);
  const doc = String(cadastro?.cnpj_cpf || '').replace(/\D/g, '');
  const fazendas = doc.length >= 11
    ? await db.from('clientes_localizacoes').select('nome, lat, lng, tecnico, confirmado_por, confirmado_em').eq('documento', doc)
      .then((r) => (r.error ? [] : (r.data || [])))
    : [];

  const locais: LocalMapa[] = [];
  // o mesmo lugar confirmado mais de uma vez (duas visitas) vira um ponto só (~50 m)
  const perto = (lat: number, lng: number) => locais.some((l) => Math.abs(l.lat - lat) < 0.0005 && Math.abs(l.lng - lng) < 0.0005);
  const incluir = (l: LocalMapa) => { if (!perto(l.lat, l.lng)) locais.push(l); };
  for (const v of visitas as { chassis: string; resposta: string; lat: number | null; lng: number | null; vendedor_nome: string | null; confirmado_em: string | null }[]) {
    // o final do chassi confere (a busca acima é mais larga: chassi já foi gravado sem um zero)
    if (v.resposta !== 'aqui' || v.lat == null || v.lng == null) continue;
    if (chassi && final7(v.chassis).slice(-5) !== final7(chassi).slice(-5)) continue;
    incluir({ nome: 'Onde o trator foi visto', lat: v.lat, lng: v.lng, origem: 'visita', quando: v.confirmado_em, quem: v.vendedor_nome });
  }
  for (const f of fazendas as { nome: string; lat: number; lng: number; tecnico: string | null; confirmado_por: string | null; confirmado_em: string | null }[]) {
    incluir({ nome: f.nome, lat: f.lat, lng: f.lng, origem: 'gps', quando: f.confirmado_em, quem: f.tecnico || f.confirmado_por });
  }
  const latC = num(principal?.lat) ?? num(principal?.latitude), lngC = num(principal?.lng) ?? num(principal?.longitude);
  if (latC != null && lngC != null) incluir({ nome: 'Ponto anotado no CRM', lat: latC, lng: lngC, origem: 'crm', quando: null, quem: null });
  const latK = num(cadastro?.lat), lngK = num(cadastro?.lng);
  if (!locais.length && latK != null && lngK != null) locais.push({ nome: 'Ponto do cadastro', lat: latK, lng: lngK, origem: 'cadastro', quando: null, quem: null });

  const endereco = cadastro
    ? [txt(cadastro.endereco), txt(cadastro.bairro), txt(cadastro.cidade)].filter(Boolean).join(', ') || null
    : principal ? [txt(principal.endereco), txt(principal.cidade)].filter(Boolean).join(', ') || null : null;
  return { locais, endereco };
}
