#!/usr/bin/env python3
"""Score v2 · Gate 1 — recálculo em SQL, um município por chamada.

Pré-requisito: sql/agro-score-v2-gate1.sql aplicada no SQL Editor.

Etapas (cada uma idempotente):
  1. sobreposição entre municípios vizinhos  (agro_calcular_sobreposicoes_vizinhos, por município)
  2. abre a execução: snapshot dos parâmetros + grupos de duplicatas em escopo GLOBAL
  3. perfil por município                    (agro_recalcular_perfil_municipio)
  4. publica — só se TODOS os municípios estiverem 'ok'
  5. relatório do Gate 1 (antes × depois, 10 grupos de exemplo)

Uso:
  python scripts/agro/recalcular_v2.py                    # tudo
  python scripts/agro/recalcular_v2.py --pular-vizinhos   # divisa já calculada
  python scripts/agro/recalcular_v2.py --retomar 15       # refaz só os municípios pendentes/erro da execução 15
  python scripts/agro/recalcular_v2.py --so-relatorio 15  # não calcula nada
  python scripts/agro/recalcular_v2.py --nao-publicar
"""
import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from carregar_sicar import Rest, carregar_env  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

USUARIO = 'pipeline recalcular_v2.py'


def rpc(rest, nome, args, tentativas=3):
    ultimo = None
    for i in range(tentativas):
        try:
            return rest.rpc(nome, args)
        except Exception as e:  # rede instável / timeout: tenta de novo (as RPCs são idempotentes)
            ultimo = e
            time.sleep(3 * (i + 1))
    raise ultimo


def get(rest, caminho):
    return rest._req('GET', '/' + caminho) or []


def ler_tudo(rest, caminho, passo=1000):
    out, ini = [], 0
    sep = '&' if '?' in caminho else '?'
    while True:
        lote = get(rest, f'{caminho}{sep}limit={passo}&offset={ini}')
        out.extend(lote)
        if len(lote) < passo:
            return out
        ini += passo


def municipios(rest):
    vistos = {}
    for m in rest.rpc('agro_mapa_municipios', {}):
        vistos[int(m['ibge'])] = m['nome']
    return vistos


def etapa_vizinhos(rest, muns):
    ex = rest.insert('agro_pipeline_execucao', [{
        'fonte': 'sobreposicao', 'versao': 'divisa entre municipios', 'executado_por': USUARIO,
        'observacao': 'Score v2 Gate 1: pares de CAR em municípios diferentes'}])[0]['id']
    total, falhas = 0, []
    for k, (ibge, nome) in enumerate(sorted(muns.items(), key=lambda x: x[1]), 1):
        try:
            n = rpc(rest, 'agro_calcular_sobreposicoes_vizinhos', {'p_execucao_id': ex, 'p_municipio_ibge': ibge})
            total += int(n or 0)
            print(f'  [{k:2}/{len(muns)}] {nome:28} {n} par(es) de divisa')
        except Exception as e:
            falhas.append(nome)
            print(f'  [{k:2}/{len(muns)}] {nome:28} ERRO {str(e)[:120]}')
    rest.patch('agro_pipeline_execucao', f'id=eq.{ex}', {'concluido_em': 'now', 'linhas': total,
                'observacao': 'Score v2 Gate 1: divisa entre municípios' + ((' — FALHOU em: ' + ', '.join(falhas)) if falhas else '')})
    if falhas:
        sys.exit(f'Sobreposição de divisa falhou em {len(falhas)} município(s): {", ".join(falhas)}. '
                 'Rode de novo (é idempotente) antes de agrupar duplicatas.')
    return total


def etapa_perfil(rest, ex, muns, so_pendentes):
    estados = {int(r['municipio_ibge']): r['estado']
               for r in get(rest, f'agro_execucao_municipio?execucao_id=eq.{ex}&select=municipio_ibge,estado')}
    fila = [i for i in sorted(estados, key=lambda i: muns.get(i, str(i))) if not so_pendentes or estados[i] != 'ok']
    for k, ibge in enumerate(fila, 1):
        t = time.time()
        try:
            n = rpc(rest, 'agro_recalcular_perfil_municipio', {'p_execucao_id': ex, 'p_municipio_ibge': ibge})
        except Exception as e:
            n = -1
            rest.patch('agro_execucao_municipio', f'execucao_id=eq.{ex}&municipio_ibge=eq.{ibge}',
                       {'estado': 'erro', 'erro': str(e)[:500]})
        print(f'  [{k:2}/{len(fila)}] {muns.get(ibge, ibge)!s:28} {"ERRO" if n == -1 else str(n) + " itens"}  ({time.time() - t:.1f}s)')
    return get(rest, f'agro_execucao_municipio?execucao_id=eq.{ex}&select=municipio_ibge,estado,erro,linhas')


def relatorio(rest, ex):
    print('\n' + '=' * 78 + f'\nRELATÓRIO DO GATE 1 — execução #{ex}\n' + '=' * 78)
    exe = get(rest, f'agro_pipeline_execucao?id=eq.{ex}&select=*')[0]
    g = (exe.get('parametros') or {}).get('grupos') or {}
    print(f"\n1) DUPLICATAS (sobreposição mútua >= {g.get('limite_pct')}%, escopo global)")
    print(f"   pares duplicados ............ {g.get('pares_duplicados')}")
    print(f"   grupos formados ............. {g.get('grupos')}")
    print(f"   CARs agrupados .............. {g.get('cars_agrupados')}")
    print(f"   componentes rejeitados ...... {g.get('componentes_rejeitados')}  (cadeia com par abaixo do limite)")

    itens = ler_tudo(rest, f'agro_perfil_item?execucao_id=eq.{ex}&select=item,grupo_id,n_cars,municipio,area_util_ha,'
                           'cultura_principal,confianca,motivo_codigo,rebaixadores,sobreposicao_pct,contido_em,tem_credito,tem_vinculo&order=item')
    v1 = {r['cod_car']: r for r in ler_tudo(rest, 'agro_car_perfil?select=cod_car,confianca,cultura_principal,motivo_confianca&order=cod_car')}
    print(f'\n2) ITENS: {len(itens)} (v1 tinha {len(v1)} CARs; diferença = CARs absorvidos por grupos)')
    grupos_div = sum(1 for i in itens if i['grupo_id'])
    print(f'   itens que são grupo ......... {grupos_div}')
    print(f"   contidos em outro CAR ....... {sum(1 for i in itens if i['contido_em'])}")
    print(f"   sem crédito localizável ..... {sum(1 for i in itens if not i['tem_credito'])}")

    print('\n3) CONFIANÇA — antes (v1, por CAR) × depois (v2, por item)')
    a, d = Counter(r['confianca'] for r in v1.values()), Counter(i['confianca'] for i in itens)
    for c in ('alta', 'media', 'baixa'):
        print(f'   {c:6} {a.get(c, 0):>7} → {d.get(c, 0):>7}')

    print('\n4) MOTIVO PRINCIPAL × confiança (v2)')
    mc = Counter((i['motivo_codigo'], i['confianca'], 'sobreposicao_alta' in (i['rebaixadores'] or [])) for i in itens)
    for (m, c, r), n in sorted(mc.items(), key=lambda x: -x[1]):
        print(f"   {m:24} {c:6} {'+ sobreposição alta' if r else '':20} {n:>7}")

    print('\n5) QUEM MUDOU DE CONFIANÇA (representante/CAR avulso, v1 → v2) e por quê')
    mud = Counter()
    for i in itens:
        o = v1.get(i['item'])
        if o and o['confianca'] != i['confianca']:
            tinha = 'de sobreposição' in (o.get('motivo_confianca') or '')   # v1 não guarda a %, só o texto
            tem = 'sobreposicao_alta' in (i['rebaixadores'] or [])
            causa = ('saiu sobreposição com duplicata' if tinha and not tem
                     else 'entrou sobreposição de divisa' if tem and not tinha
                     else 'crédito/uso consolidado no grupo' if i['grupo_id'] else 'outro')
            mud[(o['confianca'], i['confianca'], causa)] += 1
    for (de, para, causa), n in sorted(mud.items(), key=lambda x: -x[1]):
        print(f'   {de:6} → {para:6} {n:>6}  {causa}')
    print(f'   total: {sum(mud.values())}')

    print('\n6) FILTRO PADRÃO NOVO da Prospecção (alta + média + baixa por diversificado/fonte_unica_abaixo_60 sem rebaixador)')
    novo = sum(1 for i in itens if i['confianca'] in ('alta', 'media')
               or (i['motivo_codigo'] in ('diversificado', 'fonte_unica_abaixo_60') and not i['rebaixadores']))
    print(f"   v1 (alta+média) {a.get('alta', 0) + a.get('media', 0)} CARs → v2 {novo} itens")

    print('\n7) DEZ GRUPOS DE EXEMPLO (os maiores)')
    gs = get(rest, f'agro_car_grupo?execucao_id=eq.{ex}&select=id,representante,municipio_ibge,n_membros&order=n_membros.desc,id&limit=10')
    for gr in gs:
        mem = get(rest, f"agro_car_grupo_membro?grupo_id=eq.{gr['id']}&select=cod_car,agro_car_imovel(municipio,area_ha,status_car,criado_sicar_em)")
        print(f"   grupo {gr['id']} · {gr['n_membros']} CARs · representante {gr['representante']}")
        for m in mem:
            im = m.get('agro_car_imovel') or {}
            print(f"      {'*' if m['cod_car'] == gr['representante'] else ' '} {m['cod_car']}  {im.get('municipio')}  "
                  f"{im.get('area_ha')} ha  {im.get('status_car')}  {str(im.get('criado_sicar_em'))[:10]}")
    rej = get(rest, f'agro_car_grupo_rejeitado?execucao_id=eq.{ex}&select=membros,n_pares_ok,n_pares_esperados&limit=5')
    if rej:
        print('\n8) COMPONENTES REJEITADOS (até 5)')
        for r in rej:
            print(f"   {len(r['membros'])} CARs, {r['n_pares_ok']}/{r['n_pares_esperados']} pares ok: {', '.join(r['membros'][:4])}{'…' if len(r['membros']) > 4 else ''}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pular-vizinhos', action='store_true')
    ap.add_argument('--retomar', type=int)
    ap.add_argument('--so-relatorio', type=int)
    ap.add_argument('--nao-publicar', action='store_true')
    a = ap.parse_args()

    env = carregar_env()
    rest = Rest(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])

    if a.so_relatorio:
        return relatorio(rest, a.so_relatorio)

    muns = municipios(rest)
    print(f'{len(muns)} municípios com CAR ativo')

    if a.retomar:
        ex = a.retomar
    else:
        if not a.pular_vizinhos:
            print('\n[1/4] sobreposição entre municípios vizinhos')
            print(f'  total: {etapa_vizinhos(rest, muns)} par(es) gravados/atualizados')
        print('\n[2/4] abrindo execução + grupos de duplicatas (global)')
        r = rpc(rest, 'agro_iniciar_recalculo', {'p_usuario': USUARIO, 'p_motivo': 'Score v2 Gate 1'}, tentativas=1)
        ex = r['execucao_id']
        print('  ' + json.dumps(r, ensure_ascii=False))

    print(f'\n[3/4] perfil por município (execução #{ex})')
    est = etapa_perfil(rest, ex, muns, so_pendentes=bool(a.retomar))
    ruins = [e for e in est if e['estado'] != 'ok']
    if ruins:
        for e in ruins:
            print(f"  ✗ {muns.get(int(e['municipio_ibge']), e['municipio_ibge'])}: {e['estado']} {e.get('erro') or ''}")
        sys.exit(f'\n{len(ruins)} município(s) não concluíram. NADA foi publicado. '
                 f'Rode: python scripts/agro/recalcular_v2.py --retomar {ex}')

    if a.nao_publicar:
        print('\n[4/4] publicação pulada (--nao-publicar)')
    else:
        print('\n[4/4] publicando')
        print('  ' + json.dumps(rpc(rest, 'agro_publicar_execucao', {'p_execucao_id': ex, 'p_usuario': USUARIO}, tentativas=1), ensure_ascii=False))
    relatorio(rest, ex)


if __name__ == '__main__':
    main()
