// =========================================================
// DASHBOARD - Analytics overlay with Chart.js
// =========================================================

const Dashboard = {
    charts: {},

    async load() {
        const grid = document.getElementById('dashboard-grid');
        grid.innerHTML = '<div style="color:var(--text-muted);padding:40px;text-align:center"><div class="spinner" style="margin:0 auto 12px"></div>Carregando analytics...</div>';

        try {
            const [regional, resumo, ranking, inativos, oportunidades] = await Promise.all([
                Utils.fetchJson('/api/stats/regional'),
                Utils.fetchJson('/api/stats/resumo'),
                Utils.fetchJson('/api/ranking-vendedores'),
                Utils.fetchJson('/api/alertas-inativos?dias=90'),
                Utils.fetchJson('/api/oportunidades')
            ]);

            this.render(regional, resumo, ranking, inativos, oportunidades);
        } catch (e) {
            grid.innerHTML = '<div style="color:var(--accent-red);padding:40px">Erro ao carregar analytics</div>';
        }
    },

    render(regional, resumo, ranking, inativos, oportunidades) {
        const grid = document.getElementById('dashboard-grid');

        // Sort regions by equipment count
        const regions = Object.values(regional).sort((a, b) => b.equipamentos - a.equipamentos);
        const topRegions = regions.slice(0, 15);

        grid.innerHTML = `
            <!-- KPI Cards -->
            <div class="dash-card" style="grid-column: 1 / -1;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:16px">
                    <div class="stat-card blue" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.2)">
                        <span class="stat-value">${resumo.total_clientes}</span>
                        <span class="stat-label">Clientes no Mapa</span>
                    </div>
                    <div class="stat-card purple" style="background:rgba(139,92,246,0.1);border-color:rgba(139,92,246,0.2)">
                        <span class="stat-value">${resumo.total_equipamentos}</span>
                        <span class="stat-label">Equipamentos</span>
                    </div>
                    <div class="stat-card green" style="background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.2)">
                        <span class="stat-value">${resumo.visitas_mes}</span>
                        <span class="stat-label">Visitas este Mes</span>
                    </div>
                    <div class="stat-card yellow" style="background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.2)">
                        <span class="stat-value">${resumo.cobertura_pct}%</span>
                        <span class="stat-label">Cobertura</span>
                    </div>
                    <div class="stat-card" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2)">
                        <span class="stat-value" style="color:var(--accent-red)">${resumo.clientes_sem_visita}</span>
                        <span class="stat-label">Sem Visita</span>
                    </div>
                    <div class="stat-card" style="background:rgba(6,182,212,0.1);border-color:rgba(6,182,212,0.2)">
                        <span class="stat-value" style="color:var(--accent-cyan)">${resumo.total_feedbacks}</span>
                        <span class="stat-label">Feedbacks</span>
                    </div>
                </div>
            </div>

            <!-- Equipamentos por Regiao -->
            <div class="dash-card">
                <div class="dash-card-title">🔧 Equipamentos por Regiao</div>
                <canvas id="chart-equip-regiao"></canvas>
            </div>

            <!-- Clientes por Regiao -->
            <div class="dash-card">
                <div class="dash-card-title">👥 Clientes por Regiao</div>
                <canvas id="chart-clientes-regiao"></canvas>
            </div>

            <!-- Ranking Vendedores -->
            <div class="dash-card">
                <div class="dash-card-title">🏆 Ranking Vendedores</div>
                ${ranking.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">Sem dados de visitas ainda</div>' : `
                <table class="ranking-table">
                    <thead><tr><th>#</th><th>Vendedor</th><th>Visitas</th><th>Clientes</th><th>Cobertura</th></tr></thead>
                    <tbody>
                        ${ranking.slice(0, 10).map((r, i) => `
                            <tr>
                                <td><span class="rank-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
                                <td style="font-weight:500;color:var(--text-primary)">${r.nome}</td>
                                <td>${r.visitas}</td>
                                <td>${r.clientes_atendidos}</td>
                                <td>${r.cobertura_pct}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`}
            </div>

            <!-- Top Oportunidades -->
            <div class="dash-card">
                <div class="dash-card-title">⭐ Top Oportunidades de Servico</div>
                ${oportunidades.slice(0, 10).map((c, i) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--glass-border-light);cursor:pointer" onclick="App.switchView('map');setTimeout(()=>Panels.open('${c.id}'),300)">
                        <div>
                            <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${i + 1}. ${Utils.truncate(c.nome, 30)}</div>
                            <div style="font-size:11px;color:var(--text-secondary)">${c.cidade} - ${c.estado} | 🔧 ${c.equipamentos_count} equip.</div>
                        </div>
                        <div style="font-size:14px;font-weight:700;color:var(--accent-purple)">${c.score_oportunidade}pts</div>
                    </div>
                `).join('')}
            </div>

            <!-- Alertas Inativos -->
            <div class="dash-card">
                <div class="dash-card-title">🚨 Alertas - Clientes Inativos (${inativos.total})</div>
                <div style="max-height:300px;overflow-y:auto">
                    ${(inativos.clientes || []).slice(0, 15).map(c => {
                        const dias = Utils.diasDesde(c.ultima_visita);
                        return `
                            <div class="alert-card" style="cursor:pointer" onclick="App.switchView('map');setTimeout(()=>Panels.open('${c.id}'),300)">
                                <div>
                                    <div class="alert-card-name">${Utils.truncate(c.nome, 28)}</div>
                                    <div class="alert-card-detail">${c.cidade} - ${c.estado} | 🔧 ${c.equipamentos_count}</div>
                                </div>
                                <div class="alert-card-days">${c.ultima_visita ? dias + ' dias' : 'Nunca'}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Render charts
        this.renderCharts(topRegions);
    },

    renderCharts(regions) {
        // Destroy old charts
        Object.values(this.charts).forEach(c => c.destroy());
        this.charts = {};

        const labels = regions.map(r => r.cidade);

        // Equipamentos
        const ctx1 = document.getElementById('chart-equip-regiao');
        if (ctx1) {
            this.charts.equip = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Equipamentos',
                        data: regions.map(r => r.equipamentos),
                        backgroundColor: 'rgba(139, 92, 246, 0.7)',
                        borderColor: '#8b5cf6',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8899aa' } },
                        x: { grid: { display: false }, ticks: { color: '#8899aa', font: { size: 10 }, maxRotation: 45 } }
                    }
                }
            });
        }

        // Clientes
        const ctx2 = document.getElementById('chart-clientes-regiao');
        if (ctx2) {
            this.charts.clientes = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Clientes',
                        data: regions.map(r => r.clientes),
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8899aa' } },
                        x: { grid: { display: false }, ticks: { color: '#8899aa', font: { size: 10 }, maxRotation: 45 } }
                    }
                }
            });
        }
    }
};
