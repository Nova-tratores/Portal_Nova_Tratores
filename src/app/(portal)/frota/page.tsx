'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Fuel, Droplets, Car, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ehAvulsa, resolverPlaca } from '@/lib/frota/placa';

// Visão geral do Frota. Nesta fase os KPIs vêm do `abastecimentos` (a única
// fonte que já existe). Multas/manutenções/paradas entram nas próximas fases.

const fmtRS = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface Kpis {
  veiculos: number;
  gasto30: number;
  litros30: number;
  abast30: number;
}

export default function FrotaHome() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    (async () => {
      const de = new Date();
      de.setDate(de.getDate() - 30);
      const { data } = await supabase
        .from('abastecimentos')
        .select('placa, litros, valor_total, data_transacao')
        .gte('data_transacao', de.toISOString());

      const linhas = data || [];
      // Veículos de verdade: os baldes de abastecimento avulso (clientes,
      // tratores, quadriciclos) não são carros. E a placa é resolvida para a
      // canônica — senão o mesmo carro conta duas vezes.
      const placas = new Set(
        linhas
          .map((l) => resolverPlaca(l.placa))
          .filter((p) => p && !ehAvulsa(p)),
      );

      setKpis({
        veiculos: placas.size,
        gasto30: linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0),
        litros30: linhas.reduce((s, l) => s + (Number(l.litros) || 0), 0),
        abast30: linhas.length,
      });
    })();
  }, []);

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #0D9488, #0F766E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Truck size={26} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>
            Frota
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary)' }}>
            Veículos, abastecimento, custos e rastreamento
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <Kpi icone={<Car size={18} />} rotulo="Veículos com abastecimento (30d)" valor={kpis ? String(kpis.veiculos) : '—'} />
        <Kpi icone={<Fuel size={18} />} rotulo="Gasto em combustível (30d)" valor={kpis ? fmtRS(kpis.gasto30) : '—'} />
        <Kpi icone={<Droplets size={18} />} rotulo="Litros (30d)" valor={kpis ? kpis.litros30.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'} />
        <Kpi icone={<Fuel size={18} />} rotulo="Abastecimentos (30d)" valor={kpis ? String(kpis.abast30) : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Atalho
          href="/frota/abastecimento"
          titulo="Abastecimento"
          desc="Dashboard de consumo, eficiência (km/L), auditoria e importação do CSV do cartão-frota."
        />
        <Atalho
          href="/frota/abastecimento/flex"
          titulo="Álcool × Gasolina"
          desc="Qual combustível compensa em cada veículo flex, por R$/km."
        />
      </div>
    </div>
  );
}

function Kpi({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 12,
        padding: 16,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0d9488' }}>
        {icone}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {rotulo}
        </span>
      </div>
      <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--portal-text)' }}>{valor}</strong>
    </div>
  );
}

function Atalho({ href, titulo, desc }: { href: string; titulo: string; desc: string }) {
  return (
    <Link
      href={href}
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 12,
        padding: 18,
        textDecoration: 'none',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{titulo}</strong>
        <ArrowRight size={16} color="#0d9488" />
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>{desc}</span>
    </Link>
  );
}
