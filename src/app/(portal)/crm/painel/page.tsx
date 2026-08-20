'use client';
// Painel do Gestor — dashboard de urgência. Mede RITMO, não volume:
// o número que muda comportamento é o run-rate necessário por dia.
import Ideia from '@/components/crm/Ideia';
import {
  DEALS, ESTAGIOS, MAQUINAS, valorPonderado, sangriaDia,
  brl, brl2, META_VALOR, META_DIAS,
} from '@/lib/crm/demo';

const DIAS_CORRIDOS = 20; // demo: meta começou há 20 dias
const MOTIVOS: Record<string, string> = {
  credito_negado: 'Crédito negado',
  preco: 'Preço',
};

export default function PainelPage() {
  const abertos = DEALS.filter((d) => !d.ganho && !d.perdido);
  const realizado = DEALS.filter((d) => d.ganho).reduce((s, d) => s + (d.valorNegociado ?? 0), 0);
  const gap = META_VALOR - realizado;
  const restantes = META_DIAS - DIAS_CORRIDOS;
  const runRateAtual = realizado / DIAS_CORRIDOS;
  const runRateNecessario = gap / restantes;
  const projecao = runRateAtual * META_DIAS;
  const ponderado = abertos.reduce((s, d) => s + valorPonderado(d), 0);
  const cobertura = ponderado / gap;
  const travadoBanco = abertos.filter((d) => d.estagio === 'credito').reduce((s, d) => s + (d.valorNegociado ?? 0), 0);
  const aguardandoAlcada = abertos.filter((d) => d.aprovacao === 'pendente').reduce((s, d) => s + (d.valorNegociado ?? 0), 0);
  const sangria = MAQUINAS.filter((m) => m.status !== 'vendida').reduce((s, m) => s + sangriaDia(m), 0);
  const emRisco = abertos.filter((d) => {
    const e = ESTAGIOS.find((x) => x.codigo === d.estagio);
    return d.diasSemContato > (e?.sla ?? 5);
  });
  const perdas = DEALS.filter((d) => d.perdido);
  const maxFunil = Math.max(...ESTAGIOS.map((e) => abertos.filter((d) => d.estagio === e.codigo).reduce((s, d) => s + (d.valorNegociado ?? 0), 0)), 1);

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px 16px 60px', color: 'var(--portal-text)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Painel do Gestor</h1>

      <Ideia titulo="A ideia desta tela">
        Tudo aqui vem de UMA chamada agregada. O painel não pergunta &quot;quanto vendemos?&quot; e sim{' '}
        <b>&quot;nesse ritmo, batemos?&quot;</b> — e quando a resposta é não, aponta ONDE agir: gerar lead
        (cobertura &lt; 2), destravar banco, decidir alçada ou resgatar negócio esfriando. O realizado desta meta
        amarra na ponte de caixa do War Room por query, não por digitação.
      </Ideia>

      {/* Faixa superior — ritmo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Tile rotulo={`Realizado (dia ${DIAS_CORRIDOS} de ${META_DIAS})`} valor={brl(realizado)} sub={`meta ${brl(META_VALOR)} · ${((realizado / META_VALOR) * 100).toFixed(1).replace('.', ',')}%`} />
        <Tile
          rotulo="PRECISA FATURAR POR DIA"
          valor={brl(runRateNecessario)}
          sub={`nos ${restantes} dias restantes`}
          destaque
        />
        <Tile
          rotulo="Projeção no ritmo atual"
          valor={brl(projecao)}
          sub={projecao < META_VALOR ? `fica ${brl(META_VALOR - projecao)} abaixo da meta` : 'meta batida'}
          cor={projecao < META_VALOR ? '#dc2626' : '#1B7A5F'}
        />
        <Tile
          rotulo="Cobertura do gap"
          valor={`${cobertura.toFixed(2).replace('.', ',')}×`}
          sub={cobertura < 2 ? 'abaixo de 2× → o problema é GERAR lead, não fechar' : 'funil suficiente — foco em fechamento'}
          cor={cobertura < 2 ? '#dc2626' : '#1B7A5F'}
        />
      </div>

      {/* Onde está travado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Tile rotulo="Travado no banco" valor={brl(travadoBanco)} sub="ação: reunião com o gerente" />
        <Tile rotulo="Aguardando alçada" valor={brl(aguardandoAlcada)} sub="ação: o GESTOR decide hoje" cor="#d97706" />
        <Tile rotulo="Em risco (SLA estourado)" valor={brl(emRisco.reduce((s, d) => s + (d.valorNegociado ?? 0), 0))} sub={`${emRisco.length} negócio(s) esfriando`} cor="#dc2626" />
        <Tile rotulo="Sangria do pátio" valor={`${brl2(sangria)}/dia`} sub={`≈ ${brl(sangria * 30)}/mês parado no pátio`} cor="#dc2626" />
      </div>

      {/* Funil + perdas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div style={caixa}>
          <b style={{ fontSize: 14 }}>Funil aberto (valor por estágio)</b>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {ESTAGIOS.map((e) => {
              const cards = abertos.filter((d) => d.estagio === e.codigo);
              const total = cards.reduce((s, d) => s + (d.valorNegociado ?? 0), 0);
              return (
                <div key={e.codigo} style={{ fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{e.nome}</span>
                    <b>{cards.length} · {brl(total)}</b>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--portal-bg-secondary)', marginTop: 3 }}>
                    <div style={{ height: 8, borderRadius: 99, width: `${(total / maxFunil) * 100}%`, background: '#1B7A5F' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={caixa}>
          <b style={{ fontSize: 14 }}>Perdas por motivo</b>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {perdas.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{MOTIVOS[d.perdido!.motivo] ?? d.perdido!.motivo}</span>
                <b style={{ color: '#dc2626' }}>{brl(d.valorNegociado ?? 0)}</b>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--portal-text-secondary)', lineHeight: 1.55 }}>
            É por isso que perder exige motivo: na semana 6 este quadro diz se o problema da operação é{' '}
            <b>preço</b> (rever piso/desconto) ou <b>banco</b> (montar dossiê mais cedo, testar mais de uma
            instituição). Sem o motivo, cada perda vira opinião.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Ideia titulo="Por que ~60 dias, não 90">
          Financiamento agro leva 15–30 dias pra liberar. O que entrar no funil depois do dia 60 dificilmente
          fatura dentro da janela — na prática são <b>60 dias de originação</b>. Daí a priorização automática de
          quem tem <b>caixa mensal</b> (leite, suínos, aves compram o ano todo) e de quem está no <b>mês de pico</b>{' '}
          da atividade: são os que conseguem assinar dentro do prazo.
        </Ideia>
      </div>
    </div>
  );
}

function Tile({ rotulo, valor, sub, cor, destaque }: { rotulo: string; valor: string; sub: string; cor?: string; destaque?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: destaque ? '2px solid #1B7A5F' : '1px solid var(--portal-border)',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
        {rotulo}
      </div>
      <div style={{ fontSize: destaque ? 24 : 20, fontWeight: 800, marginTop: 4, color: cor ?? (destaque ? '#1B7A5F' : 'var(--portal-text)') }}>
        {valor}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const caixa: React.CSSProperties = {
  background: 'var(--portal-bg-card)',
  border: '1px solid var(--portal-border)',
  borderRadius: 10,
  padding: '14px 16px',
};
