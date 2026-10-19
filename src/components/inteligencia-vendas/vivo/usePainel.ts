'use client';
// Dados e filtros cruzados do Painel — os mesmos para as 3 opções de visual.
import { useEffect, useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { ItemRetorno } from '@/lib/inteligencia-vendas/retorno';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { mesmoVendedor } from '@/lib/inteligencia-vendas/equipe';
import { periodo, somar } from '@/lib/inteligencia-vendas/painel-vendedores';
import { chaveCidade, hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { apiGet } from '../ui';
import type { DadosEquipe } from './ModoEquipe';
import { quadranteDe, type Quadrante } from './kit';

export const chaveMun = (m: MunicipioIV) => `${textoNorm(m.nome)}|${m.uf}`;

export function usePainel() {
  const [clientes, setClientes] = useState<ClienteIV[] | null>(null);
  const [retorno, setRetorno] = useState<ItemRetorno[] | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioIV[] | null>(null);
  const [equipe, setEquipe] = useState<DadosEquipe | null>(null);
  const [erro, setErro] = useState('');
  const [quad, setQuad] = useState<Quadrante | ''>('');
  const [mun, setMun] = useState<MunicipioIV | null>(null);
  const [vend, setVend] = useState('');
  const [ficha, setFicha] = useState<ClienteIV | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      apiGet('/api/inteligencia-vendas/base').then((j) => setClientes(j.clientes)).catch((e) => setErro(e.message));
      apiGet('/api/inteligencia-vendas/retorno').then((j) => setRetorno(j.itens)).catch(() => setRetorno([]));
      apiGet('/api/inteligencia-vendas/municipios').then((j) => setMunicipios(j.municipios)).catch(() => setMunicipios([]));
      apiGet('/api/inteligencia-vendas/equipe').then(setEquipe).catch(() => setEquipe({ linhas: [], eventos: [], vendedores: [] }));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const base = useMemo(() => (clientes ?? []).filter((c) => c.oportunidades.length > 0), [clientes]);
  const passa = (c: ClienteIV) => (!mun || c.chaveCidade === chaveMun(mun)) && (!vend || mesmoVendedor(c.vendedor, vend));
  const noFiltro = base.filter(passa);
  const lista = noFiltro.filter((c) => !quad || quadranteDe(c) === quad).sort((a, b) => b.score - a.score);
  const fila = (retorno ?? []).filter((r) => (!mun || chaveCidade(r.cidade) === chaveMun(mun)) && (!vend || mesmoVendedor(r.vendedor, vend)));
  const urgentes = fila.filter((r) => r.gravidade === 3);
  const contaMun = (m: MunicipioIV) => base.filter((c) => c.chaveCidade === chaveMun(m) && (!quad || quadranteDe(c) === quad) && (!vend || mesmoVendedor(c.vendedor, vend))).length;

  const mes = periodo('mes', hojeBR());
  const vendedores = (equipe?.vendedores ?? []).map((v) => ({
    v, s: somar(equipe!.eventos, mes.de, mes.ate, v.id), linha: equipe!.linhas.find((l) => l.id === v.id),
    carteira: base.filter((c) => mesmoVendedor(c.vendedor, v.nome)).length,
  })).filter((x) => x.s.valorMaquinas + x.s.propostas + x.s.visitas + x.carteira > 0)
    .sort((a, b) => b.s.valorMaquinas - a.s.valorMaquinas || b.carteira - a.carteira);
  const totalMes = equipe ? somar(equipe.eventos, mes.de, mes.ate) : null;

  const filtros = [
    quad && { k: 'q', t: quad, limpa: () => setQuad('') },
    mun && { k: 'm', t: mun.nome, limpa: () => setMun(null) },
    vend && { k: 'v', t: vend, limpa: () => setVend('') },
  ].filter(Boolean) as { k: string; t: string; limpa: () => void }[];

  return {
    clientes, retorno, municipios, equipe, erro, base, noFiltro, lista, fila, urgentes, contaMun, mes, vendedores, totalMes,
    quad, setQuad, mun, setMun, vend, setVend, ficha, setFicha, filtros,
    limpar: () => { setQuad(''); setMun(null); setVend(''); },
  };
}
export type Painel = ReturnType<typeof usePainel>;
