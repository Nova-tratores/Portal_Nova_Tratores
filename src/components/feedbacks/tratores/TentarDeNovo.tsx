"use client";
// "Não atendeu" → quando tentar de novo (José, 19/11/2026: "deixa o usuário escolher lá na hora").
// Usado no Radar (RegistroAtendimento) e no Controle de Revisões. Classes rl-quando-* (ESTILO_RL).
//   null  = "Ainda hoje": o trator continua na fila, no fim da lista (como era antes).
//   data  = o trator sai da fila (vai para "Esperando") e volta nesse dia.

const dataBR = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");

export default function TentarDeNovo({ hoje, valor, onMudar }: { hoje: string; valor: string | null; onMudar: (d: string | null) => void }) {
  const em = (d: number) => new Date(Date.parse(hoje) + d * 86_400_000).toISOString().slice(0, 10);
  const atalhos: { rot: string; data: string | null }[] = [
    { rot: "Ainda hoje", data: null },
    { rot: "Amanhã", data: em(1) },
    { rot: "2 dias", data: em(2) },
    { rot: "3 dias", data: em(3) },
    { rot: "1 semana", data: em(7) },
    { rot: "15 dias", data: em(15) },
  ];
  return (
    <div className="rl-quando-f">
      <span><i className="fa-solid fa-calendar-day" /> Quando tentar de novo?</span>
      <div className="rl-quando-op">
        {atalhos.map((a) => (
          <button key={a.rot} type="button" className={valor === a.data ? "on" : ""} onClick={() => onMudar(a.data)}>{a.rot}</button>
        ))}
        <input type="date" min={em(1)} value={valor ?? ""} onChange={(e) => onMudar(e.target.value || null)} aria-label="Escolher a data" />
      </div>
      <small>{valor ? <>Sai da fila agora e volta em <b>{dataBR(valor)}</b>.</> : <>Continua na fila, no fim da lista.</>}</small>
    </div>
  );
}
