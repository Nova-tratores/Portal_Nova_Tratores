"""
Sugestões de vínculo CAR↔cliente a partir das visitas do CRM (Fase 3 do plano).

Abre uma execução (fonte 'crm'), chama a RPC agro_sugerir_vinculos_por_visita
(cruzamento no PostGIS: visita presencial com GPS dentro do polígono do CAR
ativo) e imprime o resumo. NÃO confirma nada: as sugestões ficam 'pendente'
até alguém aceitar/rejeitar na guia "Vínculos" de /dashboard-agro.

Rodar quando quiser (mensal, junto com o SICOR): é idempotente e não reabre
o que já foi decidido.

Uso:
  python scripts/agro/sugerir_vinculos_visitas.py [--accuracy-max 150] [--so-relatorio]
"""
import argparse
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carregar_sicar import Rest, carregar_env  # noqa: E402
from calcular_perfil import paginar  # noqa: E402


def main():
    try:  # console do Windows em cp1252 não imprime "↔" e derruba o relatório
        sys.stdout.reconfigure(encoding="utf-8", errors="replace"); sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--accuracy-max", type=float, default=150, help="ignora visitas com gps_accuracy acima disto (m)")
    ap.add_argument("--so-relatorio", action="store_true", help="não gera: só lê e resume o que já existe")
    ap.add_argument("--executado-por", default=os.environ.get("USERNAME") or os.environ.get("USER") or "pipeline")
    a = ap.parse_args()
    env = carregar_env()
    rest = Rest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    if not a.so_relatorio:
        execucao_id = rest.insert("agro_pipeline_execucao", [{
            "fonte": "crm", "versao": "visitas→CAR " + time.strftime("%Y-%m-%d"),
            "parametros": {"accuracy_max_m": a.accuracy_max, "regra": "presencial, GPS dentro do CAR ativo, não retroativa"},
            "executado_por": a.executado_por}])[0]["id"]
        n = rest.rpc("agro_sugerir_vinculos_por_visita", {"p_execucao_id": execucao_id, "p_accuracy_max": a.accuracy_max})
        print(f"execução #{execucao_id}: {n} sugestões criadas/atualizadas", file=sys.stderr)

    sug = paginar(rest, "/agro_v_vinculo_sugestao?select=cod_car,cliente_ref,cliente_nome,propriedade_nome,municipio,n_presenciais,ultima_visita,vendedores,gps_accuracy_media,score,motivo,status,cultura_nome,confianca&order=score.desc")
    st = Counter(s["status"] for s in sug)
    pend = [s for s in sug if s["status"] == "pendente"]
    print(f"\n=== SUGESTÕES DE VÍNCULO CAR↔CLIENTE (visitas do CRM) ===")
    print(f"total {len(sug)} | por status {dict(st)}")
    print(f"pendentes: {len(pend)} | CARs {len({s['cod_car'] for s in pend})} | clientes {len({s['cliente_ref'] for s in pend})}"
          f" | CARs com >1 cliente {sum(1 for _, c in Counter(s['cod_car'] for s in pend).items() if c > 1)}")
    print("por município:", dict(Counter(s["municipio"] for s in pend).most_common(12)))
    print("por vendedor:", dict(Counter(v for s in pend for v in (s["vendedores"] or [])).most_common(8)))
    print("\ntop 10 por score:")
    for s in pend[:10]:
        print(f"  {s['score']:>5} {s['municipio']:<14} {s['cod_car'][:22]}… {str(s['cliente_nome'])[:28]:<28} {s['cultura_nome'] or '-':<12} {s['confianca'] or '-':<5} {s['motivo'][:70]}")

    if not a.so_relatorio:
        rest.patch("agro_pipeline_execucao", f"id=eq.{execucao_id}", {
            "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "linhas": n,
            "observacao": f"{len(pend)} pendentes, {st.get('aceita', 0)} aceitas, {st.get('rejeitada', 0)} rejeitadas"})


if __name__ == "__main__":
    main()
