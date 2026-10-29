"use client";
// Notícias do portal (José, 29/10/2026): o "O que mudou" saiu do sino e do aviso que abria em qualquer tela — agora fica
// SÓ no dashboard, "como se fosse uma notícia de jornal". Cada notícia sai com o X ou com "Visto" (registra a leitura,
// a mesma de antes: /api/conhecimento/novidades). Sem novidade pendente, não desenha nada.
import { useEffect, useState } from "react";
import Link from "next/link";
import ArtigoView from "./Artigo";
import { mdParaBlocos } from "@/lib/conhecimento/blocos";
import { marcarNovidadesLidas, novidadesPendentes, type NovidadeApi } from "@/lib/conhecimento/client";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";

const SERIFA = 'Georgia, "Times New Roman", Times, serif';
const hojeExtenso = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const quando = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso), hoje = new Date();
  const dias = Math.round((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export default function NoticiasPortal() {
  const [lista, setLista] = useState<NovidadeApi[]>([]);
  const [saindo, setSaindo] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    novidadesPendentes().then((r) => { if (vivo) setLista(r.pendentes); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const tirar = (ids: string[]) => {
    setSaindo((s) => new Set([...s, ...ids]));
    marcarNovidadesLidas(ids).catch(() => {});
    setTimeout(() => setLista((l) => l.filter((n) => !ids.includes(n.id))), 280);
  };

  if (!lista.length) return null;
  const [manchete, ...resto] = lista;

  return (
    <section className="np" aria-label="Notícias do portal">
      <style>{ESTILO_NP}</style>
      <header className="np-cab">
        <span className="np-nome"><i className="fa-solid fa-newspaper" /> Notícias do portal</span>
        <span className="np-data">{hojeExtenso()}</span>
        <span className="np-acoes">
          <Link href="/conhecimento/novidades" className="np-link">edições anteriores</Link>
          {lista.length > 1 && <button type="button" className="np-link" onClick={() => tirar(lista.map((n) => n.id))}>marcar tudo como visto</button>}
        </span>
      </header>
      <div className={`np-grade ${resto.length ? "" : "so"}`}>
        {[manchete, ...resto].map((n, i) => {
          const longa = n.texto.length > (i === 0 ? 520 : 260);
          const cheia = aberta === n.id;
          return (
            <article key={n.id} className={`np-n ${i === 0 ? "manchete" : ""} ${saindo.has(n.id) ? "sai" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
              <button type="button" className="np-x" aria-label="Tirar esta notícia" title="Tirar" onClick={() => tirar([n.id])}><i className="fa-solid fa-xmark" /></button>
              <span className="np-chapeu" style={{ color: corModulo(n.modulo) }}>{rotuloModulo(n.modulo)}<em> · {quando(n.publicado_em)}</em></span>
              <h3 style={{ fontFamily: SERIFA }}>{n.titulo}</h3>
              <div className={`np-texto ${longa && !cheia ? "corta" : ""}`}><ArtigoView corpo={mdParaBlocos(n.texto)} compacto /></div>
              <footer>
                {longa && <button type="button" className="np-link" onClick={() => setAberta(cheia ? null : n.id)}>{cheia ? "ler menos" : "ler a notícia toda"}</button>}
                <button type="button" className="np-visto" onClick={() => tirar([n.id])}><i className="fa-solid fa-check" /> Visto</button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const ESTILO_NP = `
.np { margin-bottom: 18px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px 20px 18px; color: var(--portal-text, #0f172a); animation: npEntra .4s both }
@keyframes npEntra { from { opacity: 0; transform: translateY(6px) } }
.np-cab { display: flex; gap: 6px 16px; align-items: baseline; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 3px double #cbd5e1; margin-bottom: 14px }
.np-nome { font-family: ${SERIFA}; font-size: 21px; letter-spacing: -.01em } .np-nome i { font-size: 16px; color: #64748b; margin-right: 6px }
.np-data { font-size: 13px; color: #64748b; text-transform: capitalize }
.np-acoes { margin-left: auto; display: inline-flex; gap: 14px }
.np-link { border: 0; background: none; padding: 0; font-family: inherit; font-size: 13px; color: #2563eb; cursor: pointer; text-decoration: none } .np-link:hover { text-decoration: underline }
.np-grade { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 0 }
.np-grade.so { grid-template-columns: minmax(0, 1fr) }
.np-grade > .np-n.manchete { grid-row: span 20; padding-right: 22px; border-right: 1px solid #e2e8f0 }
.np-grade.so > .np-n.manchete { border-right: 0; padding-right: 0 }
.np-grade > .np-n:not(.manchete) { padding-left: 22px } .np-grade > .np-n:not(.manchete) + .np-n { border-top: 1px solid #eef2f6; padding-top: 14px; margin-top: 14px }
@media (max-width: 900px) { .np-grade { grid-template-columns: 1fr } .np-grade > .np-n.manchete { border-right: 0; padding-right: 0; border-bottom: 1px solid #eef2f6; padding-bottom: 14px; margin-bottom: 14px } .np-grade > .np-n:not(.manchete) { padding-left: 0 } }
.np-n { position: relative; display: grid; gap: 6px; align-content: start; animation: npEntra .4s both; transition: opacity .25s, transform .25s }
.np-n.sai { opacity: 0; transform: scale(.97) }
.np-x { position: absolute; top: -2px; right: -4px; width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; color: #94a3b8; cursor: pointer } .np-x:hover { background: #f1f5f9; color: #0f172a }
.np-grade > .np-n.manchete .np-x { right: 14px } .np-grade.so > .np-n.manchete .np-x { right: -4px }
.np-chapeu { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; padding-right: 30px } .np-chapeu em { font-style: normal; font-weight: 400; letter-spacing: 0; text-transform: none; color: #94a3b8 }
.np-n h3 { margin: 0; font-weight: 400; font-size: 19px; line-height: 1.25; letter-spacing: -.01em; padding-right: 30px }
.np-n.manchete h3 { font-size: 27px; line-height: 1.18 }
.np-texto { font-size: 14px; color: #334155; line-height: 1.55 } .np-n.manchete .np-texto { font-size: 15px }
.np-texto.corta { max-height: 8.2em; overflow: hidden; -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent) }
.np-n.manchete .np-texto.corta { max-height: 13em }
.np-n footer { display: flex; gap: 14px; align-items: center; margin-top: 2px }
.np-visto { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; border: 1px solid #cbd5e1; background: #fefefe; color: #334155; border-radius: 99px; padding: 4px 12px; font-family: inherit; font-size: 13px; cursor: pointer } .np-visto:hover { background: #f0fdf4; border-color: #86efac; color: #166534 } .np-visto i { font-size: 11px }
`;
