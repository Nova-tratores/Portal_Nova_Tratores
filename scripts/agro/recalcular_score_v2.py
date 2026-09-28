#!/usr/bin/env python3
"""Score v2 · Gate 2 — score das duas listas (Conquista × Base instalada).

Pré-requisito: sql/agro-score-v2-gate2.sql aplicada e perfil v2 publicado.

Etapas (idempotentes):
  1. abre a execução (snapshot dos parâmetros + máquinas dos clientes vinculados)
  2. score por município (agro_score_municipio)
  3. publica — só com todos os municípios 'ok' (é aqui que saem os percentis)
  4. relatório do Gate 2

Uso:
  python scripts/agro/recalcular_score_v2.py
  python scripts/agro/recalcular_score_v2.py --retomar 17
  python scripts/agro/recalcular_score_v2.py --so-relatorio 17
  python scripts/agro/recalcular_score_v2.py --nao-publicar
"""
import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from carregar_sicar import Rest, carregar_env  # noqa: E402
from recalcular_v2 import get, ler_tudo, municipios, rpc  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

USUARIO = 'pipeline recalcular_score_v2.py'


def percentis(valores, ps=(10, 25, 50, 75, 90, 99)):
    v = sorted(valores)
    if not v:
        return {}
    out = {}
    for p in ps:
        k = (len(v) - 1) * p / 100
        a, b = int(k), min(int(k) + 1, len(v) - 1)
        out[p] = round(v[a] + (v[b] - v[a]) * (k - a), 2)
    return out


def etapa_score(rest, ex, muns, so_pendentes):
    estados = {int(r['municipio_ibge']): r['estado']
               for r in get(rest, f'agro_execucao_municipio?execucao_id=eq.{ex}&select=municipio_ibge,estado')}
    fila = [i for i in sorted(estados, key=lambda i: muns.get(i, str(i))) if not so_pendentes or estados[i] != 'ok']
    for k, ibge in enumerate(fila, 1):
        t = time.time()
        try:
            n = rpc(rest, 'agro_score_municipio', {'p_execucao_id': ex, 'p_municipio_ibge': ibge})
        except Exception as e:
            n = -1
            rest.patch('agro_execucao_municipio', f'execucao_id=eq.{ex}&municipio_ibge=eq.{ibge}',
                       {'estado': 'erro', 'erro': str(e)[:500]})
        print(f'  [{k:2}/{len(fila)}] {muns.get(ibge, ibge)!s:28} {"ERRO" if n == -1 else str(n) + " itens"}  ({time.time() - t:.1f}s)')
    return get(rest, f'agro_execucao_municipio?execucao_id=eq.{ex}&select=municipio_ibge,estado,erro,linhas')


def tabela(titulo, cont_a, cont_b, rot_a='v1', rot_b='v2'):
    print(f'   {titulo:26} {rot_a:>6} {rot_b:>6}')
    for k in sorted(set(cont_a) | set(cont_b), key=lambda k: -(cont_a.get(k, 0) + cont_b.get(k, 0))):
        print(f'   {str(k):26} {cont_a.get(k, 0):>6} {cont_b.get(k, 0):>6}')


def relatorio(rest, ex):
    print('\n' + '=' * 78 + f'\nRELATÓRIO DO GATE 2 — execução #{ex}\n' + '=' * 78)
    exe = get(rest, f'agro_pipeline_execucao?id=eq.{ex}&select=*')[0]
    par = exe.get('parametros') or {}
    perfil = par.get('perfil_execucao_id')
    print(f"   perfil usado: execução #{perfil} · regras comerciais ativas: {par.get('regras_ativas')} · "
          f"clientes vinculados: {par.get('clientes_vinculados')}")

    sc = ler_tudo(rest, f'agro_score_item?execucao_id=eq.{ex}&select=item,lista,score_base,bonus_credito,score_com_bonus,'
                        'p_area,p_cultura,p_prioridade,soma,soma_max,fator_confianca,ausentes,detalhe&order=item')
    pf = {r['item']: r for r in ler_tudo(rest, f'agro_perfil_item?execucao_id=eq.{perfil}&select=item,municipio,area_util_ha,'
                                               'cultura_principal,confianca,motivo_codigo,n_cars&order=item')}

    print('\n1) DISTRIBUIÇÃO DO SCORE v2 (0 a 10, já com o fator de confiança)')
    for lista in ('conquista', 'base'):
        vs = [float(s['score_base']) for s in sc if s['lista'] == lista]
        if not vs:
            print(f'   {lista:10} 0 itens — lista vazia (sem vínculos decididos; esperado)')
            continue
        p = percentis(vs)
        print(f'   {lista:10} {len(vs)} itens · mín {min(vs):.2f} · ' + ' · '.join(f'p{k} {v:.2f}' for k, v in p.items()) + f' · máx {max(vs):.2f}')
        fx = Counter('0' if v == 0 else '0 a 2' if v < 2 else '2 a 4' if v < 4 else '4 a 6' if v < 6 else '6 a 8' if v < 8 else '8 a 10' for v in vs)
        print('              faixas: ' + ' · '.join(f'{k}: {fx.get(k, 0)}' for k in ('0', '0 a 2', '2 a 4', '4 a 6', '6 a 8', '8 a 10')))

    conq = [s for s in sc if s['lista'] == 'conquista']
    print('\n2) BÔNUS DE CRÉDITO (coluna separada, Conquista)')
    b = Counter('sem crédito localizável' if s['bonus_credito'] is None else f"+{float(s['bonus_credito']):.1f}" for s in conq)
    for k, n in sorted(b.items(), key=lambda x: -x[1]):
        print(f'   {k:26} {n:>6}')
    base_ord = [s['item'] for s in sorted(conq, key=lambda s: (-float(s['score_base']), s['item']))[:500]]
    bonus_ord = [s['item'] for s in sorted(conq, key=lambda s: (-float(s['score_com_bonus']), s['item']))[:500]]
    print(f'   com "priorizar quem usa crédito", {500 - len(set(base_ord) & set(bonus_ord))} dos 500 primeiros mudam')

    print('\n3) COMPARAÇÃO v1 × v2 — os 500 primeiros de cada (view agro_v_comparacao_v1_v2)')
    cmp_ = ler_tudo(rest, 'agro_v_comparacao_v1_v2?select=*&order=item')
    a = [c for c in cmp_ if c['em_v1']]
    d = [c for c in cmp_ if c['em_v2']]
    amb = [c for c in cmp_ if c['em_v1'] and c['em_v2']]
    print(f'   itens no top 500 do v1: {len(a)} (500 CARs, contados pelo representante do grupo)')
    print(f'   itens no top 500 do v2: {len(d)}')
    print(f'   nas duas listas: {len(amb)}')
    tabela('faixa de área útil', Counter(c['faixa_area'] for c in a), Counter(c['faixa_area'] for c in d))
    print()
    tabela('cultura', Counter(c['cultura'] for c in a), Counter(c['cultura'] for c in d))
    print()
    tabela('confiança', Counter(c['confianca'] for c in a), Counter(c['confianca'] for c in d))
    print()
    tabela('município (10 maiores)', Counter(dict(Counter(c['municipio'] for c in a).most_common(10))),
           Counter(dict(Counter(c['municipio'] for c in d).most_common(10))))

    print('\n4) OS 20 PRIMEIROS DA CONQUISTA v2')
    print(f"   {'#':>2} {'score':>5} {'bônus':>5} {'área útil':>10} {'cultura':14} {'conf.':6} {'área':>5} {'cult.':>5} {'prio.':>5}  município / item")
    for k, s in enumerate(sorted(conq, key=lambda s: (-float(s['score_base']), s['item']))[:20], 1):
        p = pf.get(s['item'], {})
        bonus = '—' if s['bonus_credito'] is None else f"+{float(s['bonus_credito']):.1f}"
        print(f"   {k:>2} {float(s['score_base']):>5.2f} {bonus:>5} {float(p.get('area_util_ha') or 0):>8.1f}ha "
              f"{(p.get('cultura_principal') or 'diversificado'):14} {p.get('confianca', ''):6} "
              f"{float(s['p_area'] or 0):>5.2f} {float(s['p_cultura'] or 0):>5.2f} {float(s['p_prioridade'] or 0):>5.2f}  "
              f"{p.get('municipio')} / {s['item']}")
    empat = Counter(float(s['score_base']) for s in conq)
    topo = max(empat) if empat else None
    if topo is not None:
        print(f'\n   empate no topo: {empat[topo]} itens com score {topo:.2f}')

    print('\n5) CALIBRAÇÃO DA CURVA (view agro_v_calibracao_area; preparada, não aplicada)')
    print('   ' + json.dumps(get(rest, 'agro_v_calibracao_area?select=*'), ensure_ascii=False))

    print('\n6) PARCELAS AUSENTES')
    au = Counter(x for s in sc for x in (s['ausentes'] or []))
    print('   ' + (', '.join(f'{k}: {v}' for k, v in au.items()) or 'nenhuma'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--retomar', type=int)
    ap.add_argument('--so-relatorio', type=int)
    ap.add_argument('--nao-publicar', action='store_true')
    a = ap.parse_args()

    env = carregar_env()
    rest = Rest(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
    if a.so_relatorio:
        return relatorio(rest, a.so_relatorio)

    muns = municipios(rest)
    if a.retomar:
        ex = a.retomar
    else:
        print('[1/3] abrindo execução do score')
        r = rpc(rest, 'agro_score_iniciar', {'p_usuario': USUARIO, 'p_motivo': 'Score v2 Gate 2'}, tentativas=1)
        ex = r['execucao_id']
        print('  ' + json.dumps(r, ensure_ascii=False))

    print(f'\n[2/3] score por município (execução #{ex})')
    est = etapa_score(rest, ex, muns, so_pendentes=bool(a.retomar))
    ruins = [e for e in est if e['estado'] != 'ok']
    if ruins:
        for e in ruins:
            print(f"  ✗ {muns.get(int(e['municipio_ibge']), e['municipio_ibge'])}: {e['estado']} {e.get('erro') or ''}")
        sys.exit(f'\n{len(ruins)} município(s) não concluíram. NADA foi publicado. '
                 f'Rode: python scripts/agro/recalcular_score_v2.py --retomar {ex}')

    if a.nao_publicar:
        print('\n[3/3] publicação pulada (--nao-publicar); percentis ficam vazios')
    else:
        print('\n[3/3] publicando')
        print('  ' + json.dumps(rpc(rest, 'agro_score_publicar', {'p_execucao_id': ex, 'p_usuario': USUARIO}, tentativas=1), ensure_ascii=False))
    relatorio(rest, ex)


if __name__ == '__main__':
    main()
