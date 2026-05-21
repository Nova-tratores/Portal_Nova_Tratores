// =========================================================
// RELATORIO - Monthly technician report (Omie + GPS)
// =========================================================

const _supabase = window.supabase.createClient(
    'https://citrhumdkfivdzbmayde.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdHJodW1ka2ZpdmR6Ym1heWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDgyNzUsImV4cCI6MjA4NDY4NDI3NX0.83x3-NrKoJgtIuSE7Jjsaj0zH-b-XJ3Z8i3XkBkwVoU'
);

const Relatorio = {
    _mes: null,
    _ordens: [],
    _gpsData: [],      // GPS_Viagens do mes
    _resumoData: [],   // resumo_diario_tecnico do mes
    _gpsMap: {},        // tecnico_nome_norm -> { kmTotal, horasDirigindo, tempoParado, horasServico, dias }
    _gpsByTecData: {},  // normNome|data -> { km, horasFora, horasDirigindo, horasParado, placa }
    _tecnicos: [],
    _tecnicoSel: null,
    _ordemAberta: null,
    _loaded: false,
    _syncing: false,
    _filtro: 'todas',

    // Coordenadas da Nova Tratores (base/loja)
    _BASE_LAT: -23.208410,
    _BASE_LNG: -49.370770,
    _BASE_RAIO: 0.008, // ~800m

    async load() {
        if (!this._mes) {
            const now = new Date();
            this._mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        this._tecnicoSel = null;
        this._ordemAberta = null;
        await this._carregar();
        this._syncBackground();
    },

    _toNum(v) {
        if (v == null || v === '') return 0;
        const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
        return isNaN(n) ? 0 : n;
    },

    _normNome(s) {
        return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    },

    _mesLabel() {
        const [y, m] = this._mes.split('-').map(Number);
        const meses = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return `${meses[m - 1]} ${y}`;
    },

    _mudarMes(dir) {
        const [y, m] = this._mes.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        this._mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        this._tecnicoSel = null;
        this._ordemAberta = null;
        this._carregar();
    },

    _setFiltro(f) {
        this._filtro = f;
        this._tecnicoSel = null;
        this._ordemAberta = null;
        this._extrairTecnicos();
        const container = document.getElementById('relatorio-content');
        if (this._tecnicoSel) this._renderDetalhe();
        else this._renderCards(container);
    },

    _ordensFiltradas() {
        if (this._filtro === 'internas') return this._ordens.filter(o => o.interno);
        if (this._filtro === 'cobradas') return this._ordens.filter(o => !o.interno);
        return this._ordens;
    },

    _extrairTecnicos() {
        const nomes = new Set();
        this._ordensFiltradas().forEach(o => {
            (o.tecnicos || []).forEach(t => { if (t) nomes.add(t); });
        });
        this._tecnicos = [...nomes].sort();
    },

    // Verifica se ponto esta perto da base
    _isNearBase(lat, lng) {
        return Math.abs(lat - this._BASE_LAT) < this._BASE_RAIO && Math.abs(lng - this._BASE_LNG) < this._BASE_RAIO;
    },

    // Calcula horas de servico GPS de um dia
    // Regra: se saiu da loja e ficou >30min fora, conta como servico
    _calcHorasServicoDia(eventos) {
        if (!eventos || eventos.length === 0) return 0;

        let horasServico = 0;
        let ultimaSaida = null;

        for (const ev of eventos) {
            if (ev.tipo === 'saida_loja') {
                ultimaSaida = new Date(ev.horario);
            } else if (ev.tipo === 'retorno_loja' && ultimaSaida) {
                const retorno = new Date(ev.horario);
                const diffMin = (retorno - ultimaSaida) / 60000;
                if (diffMin > 30) {
                    horasServico += diffMin / 60;
                }
                ultimaSaida = null;
            }
        }

        // Se saiu mas nao retornou (dia ainda em andamento ou sem retorno registrado)
        // Pega o ultimo evento como referencia
        if (ultimaSaida) {
            const ultimoEv = eventos[eventos.length - 1];
            const fim = new Date(ultimoEv.horario);
            const diffMin = (fim - ultimaSaida) / 60000;
            if (diffMin > 30) {
                horasServico += diffMin / 60;
            }
        }

        return horasServico;
    },

    // Processa dados GPS e constroi mapa por tecnico + mapa por tecnico|data
    _processarGPS() {
        this._gpsMap = {};
        this._gpsByTecData = {}; // normNome|data -> { km, horasFora, horasDirigindo, horasParado, placa }

        // Montar mapa de horas_dirigindo do resumo_diario_tecnico por tecnico+data
        const resumoMap = {};
        for (const r of this._resumoData) {
            const key = `${this._normNome(r.tecnico_nome)}|${r.data}`;
            resumoMap[key] = this._toNum(r.horas_dirigindo);
        }

        for (const g of this._gpsData) {
            const nk = this._normNome(g.tecnico_nome);
            if (!this._gpsMap[nk]) {
                this._gpsMap[nk] = { kmTotal: 0, horasDirigindo: 0, tempoParado: 0, horasServico: 0, dias: 0, nome: g.tecnico_nome };
            }
            this._gpsMap[nk].kmTotal += this._toNum(g.km_total);

            const horasForaDia = this._calcHorasServicoDia(g.eventos);
            this._gpsMap[nk].horasServico += horasForaDia;

            // horas_dirigindo do resumo diario
            const rKey = `${nk}|${g.data}`;
            const dirigindoDia = resumoMap[rKey] || 0;
            this._gpsMap[nk].horasDirigindo += dirigindoDia;

            // tempo parado fora = tempo fora da loja - tempo dirigindo
            const paradoDia = Math.max(0, horasForaDia - dirigindoDia);
            this._gpsMap[nk].tempoParado += paradoDia;

            this._gpsMap[nk].dias++;

            // Indexar por tecnico+data para lookup per-OS
            const tdKey = `${nk}|${g.data}`;
            this._gpsByTecData[tdKey] = {
                km: this._toNum(g.km_total),
                horasFora: horasForaDia,
                horasDirigindo: dirigindoDia,
                horasParado: paradoDia,
                placa: g.placa || ''
            };
        }
    },

    // Busca GPS de um dia especifico por tecnico+data
    _getGPSDia(nomeTecnico, data) {
        if (!nomeTecnico || !data) return null;
        const n = this._normNome(nomeTecnico);
        // Match exato
        if (this._gpsByTecData[`${n}|${data}`]) return this._gpsByTecData[`${n}|${data}`];
        // Match pelo primeiro nome
        const primeiro = n.split(/\s+/)[0];
        for (const [k, v] of Object.entries(this._gpsByTecData)) {
            if (k.endsWith(`|${data}`) && k.split('|')[0].split(/\s+/)[0] === primeiro) return v;
        }
        return null;
    },

    // Encontra dados GPS para um tecnico (match fuzzy pelo primeiro nome)
    _getGPSTecnico(nome) {
        const n = this._normNome(nome);
        // Match exato
        if (this._gpsMap[n]) return this._gpsMap[n];
        // Match pelo primeiro nome
        const primeiro = n.split(/\s+/)[0];
        for (const [k, v] of Object.entries(this._gpsMap)) {
            if (k.split(/\s+/)[0] === primeiro) return v;
        }
        return null;
    },

    async _carregar() {
        const container = document.getElementById('relatorio-content');
        container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:13px">Carregando...</div>`;

        try {
            const [y, m] = this._mes.split('-').map(Number);
            const primeiro = `${this._mes}-01`;
            const ultimo = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

            // Carregar ordens, GPS e resumo diario em paralelo
            const [ordensRes, gpsRes, resumoRes] = await Promise.all([
                _supabase
                    .from('Ordens_Omie')
                    .select('*')
                    .eq('faturada', true)
                    .gte('data', primeiro)
                    .lte('data', ultimo)
                    .order('data', { ascending: false }),
                _supabase
                    .from('GPS_Viagens')
                    .select('tecnico_nome, data, km_total, eventos, placa')
                    .gte('data', primeiro)
                    .lte('data', ultimo),
                _supabase
                    .from('resumo_diario_tecnico')
                    .select('tecnico_nome, data, horas_dirigindo, km_percorrido')
                    .gte('data', primeiro)
                    .lte('data', ultimo)
            ]);

            if (ordensRes.error) throw ordensRes.error;
            this._ordens = ordensRes.data || [];

            this._gpsData = gpsRes.data || [];
            this._resumoData = resumoRes.data || [];
            this._processarGPS();

            this._extrairTecnicos();
            this._loaded = true;
        } catch (e) {
            console.error('Erro ao carregar:', e);
            Utils.toast('Erro ao carregar: ' + e.message, 'error');
            this._ordens = [];
            this._gpsData = [];
            this._gpsMap = {};
            this._tecnicos = [];
            this._loaded = true;
        }

        this._renderCards(container);
    },

    async _syncBackground() {
        if (this._syncing) return;
        this._syncing = true;
        this._showSyncBar(true);
        try {
            const ano = this._mes.split('-')[0];
            const res = await _originalFetch(`/api/pos/ordens/omie-sync?ano=${ano}`, { method: 'POST' });
            if (res.ok) await this._carregar();
        } catch (e) {
            console.error('Erro sync background:', e);
        }
        this._syncing = false;
        this._showSyncBar(false);
    },

    _showSyncBar(show) {
        let bar = document.getElementById('relatorio-sync-bar');
        if (show) {
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'relatorio-sync-bar';
                bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;height:3px;background:linear-gradient(90deg,#3b82f6 0%,#8b5cf6 50%,#3b82f6 100%);background-size:200% 100%;animation:syncSlide 1.5s ease-in-out infinite';
                if (!document.getElementById('sync-slide-style')) {
                    const style = document.createElement('style');
                    style.id = 'sync-slide-style';
                    style.textContent = '@keyframes syncSlide{0%{background-position:200% 0}100%{background-position:-200% 0}}';
                    document.head.appendChild(style);
                }
                document.body.appendChild(bar);
            }
        } else {
            if (bar) bar.remove();
        }
    },

    _getOrdensTecnico(nome) {
        const nNome = this._normNome(nome);
        return this._ordensFiltradas().filter(o =>
            (o.tecnicos || []).some(t => this._normNome(t) === nNome)
        );
    },

    _getStatsTecnico(nome) {
        const ords = this._getOrdensTecnico(nome);
        return {
            total: ords.length,
            horas: ords.reduce((s, o) => s + this._toNum(o.horas), 0),
            km: ords.reduce((s, o) => s + this._toNum(o.km), 0),
            valor: ords.reduce((s, o) => s + this._toNum(o.valor), 0),
            internos: ords.filter(o => o.interno).length,
            cobradas: ords.filter(o => !o.interno).length,
        };
    },

    _renderFiltro() {
        const opts = [
            { key: 'todas', label: 'Todas' },
            { key: 'cobradas', label: 'Cobradas' },
            { key: 'internas', label: 'Internas' },
        ];
        return opts.map(o => {
            const active = this._filtro === o.key;
            return `<button onclick="Relatorio._setFiltro('${o.key}')" style="padding:5px 14px;border-radius:6px;border:1px solid ${active ? '#3b82f6' : 'var(--glass-border-light)'};background:${active ? '#3b82f622' : 'var(--bg-card)'};color:${active ? '#3b82f6' : 'var(--text-secondary)'};font-size:12px;font-weight:${active ? '700' : '500'};cursor:pointer">${o.label}</button>`;
        }).join('');
    },

    _renderGPSMini(gps) {
        if (!gps) return `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;padding-top:6px;border-top:1px dashed var(--glass-border-light)">GPS: sem dados</div>`;
        return `
            <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--glass-border-light)">
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">GPS do Veiculo:</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <div style="font-size:11px;font-weight:700;color:#06b6d4" title="Tempo dirigindo">${gps.horasDirigindo.toFixed(0)}h <span style="font-size:9px;font-weight:500;color:var(--text-muted)">dirig.</span></div>
                    <div style="font-size:11px;font-weight:700;color:#a855f7" title="Tempo parado fora da loja">${gps.tempoParado.toFixed(0)}h <span style="font-size:9px;font-weight:500;color:var(--text-muted)">parado</span></div>
                    <div style="font-size:11px;font-weight:700;color:#f97316" title="KM total">${gps.kmTotal.toFixed(0)}km</div>
                </div>
            </div>
        `;
    },

    _renderCards(container) {
        const filtradas = this._ordensFiltradas();
        const totalHoras = filtradas.reduce((s, o) => s + this._toNum(o.horas), 0);
        const totalKm = filtradas.reduce((s, o) => s + this._toNum(o.km), 0);
        const totalValor = filtradas.reduce((s, o) => s + this._toNum(o.valor), 0);

        let html = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
                <button onclick="Relatorio._mudarMes(-1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--glass-border-light);background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-secondary)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span style="font-size:15px;font-weight:700;color:var(--text-primary);min-width:160px;text-align:center">${this._mesLabel()}</span>
                <button onclick="Relatorio._mudarMes(1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--glass-border-light);background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-secondary)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <div style="margin-left:auto;display:flex;gap:6px">
                    ${this._renderFiltro()}
                </div>
            </div>
        `;

        if (this._loaded && filtradas.length > 0) {
            html += `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
                    <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--glass-border-light)">
                        <div style="font-size:9px;font-weight:600;color:var(--text-muted)">OS FATURADAS</div>
                        <div style="font-size:22px;font-weight:800;color:#3b82f6">${filtradas.length}</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--glass-border-light)">
                        <div style="font-size:9px;font-weight:600;color:var(--text-muted)">HORAS</div>
                        <div style="font-size:22px;font-weight:800;color:#10b981">${totalHoras.toFixed(0)}</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--glass-border-light)">
                        <div style="font-size:9px;font-weight:600;color:var(--text-muted)">KM</div>
                        <div style="font-size:22px;font-weight:800;color:#f59e0b">${totalKm.toFixed(0)}</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--glass-border-light)">
                        <div style="font-size:9px;font-weight:600;color:var(--text-muted)">VALOR</div>
                        <div style="font-size:22px;font-weight:800;color:#8b5cf6">R$${totalValor >= 1000 ? (totalValor / 1000).toFixed(1) + 'k' : totalValor.toFixed(0)}</div>
                    </div>
                </div>
            `;
        }

        if (!this._loaded) { container.innerHTML = html; return; }

        if (this._tecnicos.length === 0) {
            html += `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Nenhuma OS faturada neste mes${this._filtro !== 'todas' ? ` (filtro: ${this._filtro})` : ''}</div>`;
            container.innerHTML = html;
            return;
        }

        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">`;
        for (const nome of this._tecnicos) {
            const stats = this._getStatsTecnico(nome);
            const gps = this._getGPSTecnico(nome);
            html += `
                <div onclick="Relatorio._abrirTecnico('${nome.replace(/'/g, "\\'")}')" style="background:var(--bg-card);border:1px solid var(--glass-border-light);border-radius:10px;padding:16px;cursor:pointer;transition:all .15s" onmouseenter="this.style.borderColor='#3b82f6';this.style.transform='translateY(-1px)'" onmouseleave="this.style.borderColor='var(--glass-border-light)';this.style.transform='none'">
                    <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">${nome}</div>
                    <div style="font-size:9px;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Registrado pelo Tecnico</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px">
                        <div style="text-align:center">
                            <div style="font-size:20px;font-weight:800;color:${stats.total > 0 ? '#3b82f6' : 'var(--text-muted)'}">${stats.total}</div>
                            <div style="font-size:10px;color:var(--text-muted);font-weight:500">OS</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:20px;font-weight:800;color:${stats.horas > 0 ? '#10b981' : 'var(--text-muted)'}">${stats.horas.toFixed(0)}</div>
                            <div style="font-size:10px;color:var(--text-muted);font-weight:500">Horas</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:20px;font-weight:800;color:${stats.km > 0 ? '#f59e0b' : 'var(--text-muted)'}">${stats.km.toFixed(0)}</div>
                            <div style="font-size:10px;color:var(--text-muted);font-weight:500">KM</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:20px;font-weight:800;color:${stats.valor > 0 ? '#8b5cf6' : 'var(--text-muted)'}">R$${stats.valor >= 1000 ? (stats.valor / 1000).toFixed(1) + 'k' : stats.valor.toFixed(0)}</div>
                            <div style="font-size:10px;color:var(--text-muted);font-weight:500">Valor</div>
                        </div>
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${[
                        stats.internos > 0 ? `${stats.internos} interna${stats.internos > 1 ? 's' : ''}` : '',
                        stats.cobradas > 0 ? `${stats.cobradas} cobrada${stats.cobradas > 1 ? 's' : ''}` : '',
                    ].filter(Boolean).join(' | ')}</div>
                    ${this._renderGPSMini(gps)}
                </div>
            `;
        }
        html += `</div>`;
        container.innerHTML = html;
    },

    _abrirTecnico(nome) {
        this._tecnicoSel = nome;
        this._ordemAberta = null;
        this._renderDetalhe();
    },

    _renderDetalhe() {
        const container = document.getElementById('relatorio-content');
        const nome = this._tecnicoSel;
        const ords = this._getOrdensTecnico(nome);
        const stats = this._getStatsTecnico(nome);
        const gps = this._getGPSTecnico(nome);

        let html = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <button onclick="Relatorio._voltarCards()" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--glass-border-light);background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-secondary)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div style="flex:1">
                    <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${nome}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${this._mesLabel()}</div>
                </div>
                <div style="display:flex;gap:6px">
                    ${this._renderFiltro()}
                </div>
            </div>

            <!-- SECAO 1: Registrado pelo Tecnico -->
            <div style="margin-bottom:8px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Registrado pelo Tecnico (Omie)</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
                <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid var(--glass-border-light)">
                    <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">ORDENS</div>
                    <div style="font-size:28px;font-weight:800;color:#3b82f6">${stats.total}</div>
                </div>
                <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid var(--glass-border-light)">
                    <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">HORAS</div>
                    <div style="font-size:28px;font-weight:800;color:#10b981">${stats.horas.toFixed(1)}</div>
                </div>
                <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid var(--glass-border-light)">
                    <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">KM</div>
                    <div style="font-size:28px;font-weight:800;color:#f59e0b">${stats.km.toFixed(0)}</div>
                </div>
                <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid var(--glass-border-light)">
                    <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">VALOR</div>
                    <div style="font-size:28px;font-weight:800;color:#8b5cf6">R$${stats.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</div>
                </div>
            </div>

            <!-- SECAO 2: GPS do Veiculo -->
            <div style="margin-bottom:8px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">GPS do Veiculo</div>
        `;

        if (gps) {
            html += `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
                    <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid #06b6d433">
                        <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">TEMPO DIRIGINDO</div>
                        <div style="font-size:28px;font-weight:800;color:#06b6d4">${gps.horasDirigindo.toFixed(1)}</div>
                        <div style="font-size:9px;color:var(--text-muted);margin-top:2px">horas com veiculo em movimento</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid #a855f733">
                        <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">TEMPO PARADO</div>
                        <div style="font-size:28px;font-weight:800;color:#a855f7">${gps.tempoParado.toFixed(1)}</div>
                        <div style="font-size:9px;color:var(--text-muted);margin-top:2px">parado fora da Nova Tratores</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid #f9731633">
                        <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">KM TOTAL</div>
                        <div style="font-size:28px;font-weight:800;color:#f97316">${gps.kmTotal.toFixed(0)}</div>
                        <div style="font-size:9px;color:var(--text-muted);margin-top:2px">km percorridos no mes</div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:8px;padding:14px 16px;text-align:center;border:1px solid var(--glass-border-light)">
                        <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">DIAS COM GPS</div>
                        <div style="font-size:28px;font-weight:800;color:var(--text-secondary)">${gps.dias}</div>
                    </div>
                </div>
            `;
        } else {
            html += `<div style="background:var(--bg-card);border:1px solid var(--glass-border-light);border-radius:8px;padding:20px;text-align:center;color:var(--text-muted);font-size:12px;margin-bottom:20px">Sem dados GPS para este tecnico neste mes</div>`;
        }

        // Calcular GPS por OS (cruzando tecnico+data, de-duplicando por dia)
        const gpsDiasUsados = new Set();
        let gpsSomaKm = 0, gpsSomaDirigindo = 0, gpsSomaParado = 0, gpsSomaFora = 0;
        const ordsComGPS = ords.map(o => {
            // Pegar o primeiro tecnico da OS para buscar GPS
            const tecOS = (o.tecnicos || [])[0] || '';
            const gpsDia = this._getGPSDia(tecOS, o.data);
            const dayKey = tecOS && o.data ? `${this._normNome(tecOS)}|${o.data}` : null;
            // So soma se nao foi somado (evita duplicar mesmo dia)
            if (gpsDia && dayKey && !gpsDiasUsados.has(dayKey)) {
                gpsDiasUsados.add(dayKey);
                gpsSomaKm += gpsDia.km;
                gpsSomaDirigindo += gpsDia.horasDirigindo;
                gpsSomaParado += gpsDia.horasParado;
                gpsSomaFora += gpsDia.horasFora;
            }
            return { ...o, gpsDia };
        });
        const temGPSporOS = ordsComGPS.some(o => o.gpsDia);

        // Tabela de ordens
        if (ords.length === 0) {
            html += `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Nenhuma OS neste mes</div>`;
        } else {
            html += `
                <div style="margin-bottom:8px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Ordens do Mes</div>
                <div style="background:var(--bg-card);border:1px solid var(--glass-border-light);border-radius:10px;overflow:hidden">
                    <table style="width:100%;border-collapse:collapse">
                        <thead>
                            <tr style="background:rgba(255,255,255,0.03)">
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">OS</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Cidade</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Tipo</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Empresa</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:right;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Horas</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:right;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">KM</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:right;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Valor</th>
                                <th style="font-size:13px;font-weight:600;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--glass-border-light)">Data</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            for (const o of ordsComGPS) {
                const isOpen = this._ordemAberta === o.os_num;
                const tipoColor = o.interno ? '#6366f1' : '#10b981';
                const tipoLabel = o.interno ? 'Interna' : 'Cobrada';
                const gd = o.gpsDia;
                html += `
                    <tr onclick="Relatorio._toggleOrdem('${o.os_num}')" style="cursor:pointer;background:${isOpen ? 'rgba(59,130,246,0.08)' : 'transparent'};transition:background .1s">
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);font-weight:600;color:#3b82f6;white-space:nowrap">${o.os_num}${o.cod_int ? ` <span style="font-size:12px;color:var(--text-muted);font-weight:400">(${o.cod_int})</span>` : ''}${gd && gd.placa ? `<br><span style="font-size:11px;color:var(--text-muted);font-weight:400">${gd.placa}</span>` : ''}</td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);color:var(--text-secondary);white-space:nowrap">${o.cidade || '-'}</td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);white-space:nowrap">
                            <span style="font-size:13px;background:${tipoColor}22;color:${tipoColor};padding:3px 10px;border-radius:4px;font-weight:600">${tipoLabel}</span>
                        </td>
                        <td style="font-size:13px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);color:var(--text-secondary);white-space:nowrap">${o.empresa || '-'}${o.contrato ? `<br><span style="font-size:12px;color:var(--text-muted)">${o.contrato}</span>` : ''}</td>
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);text-align:right;font-weight:600;font-family:monospace">${this._toNum(o.horas).toFixed(1)}</td>
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);text-align:right;font-weight:600;font-family:monospace">${this._toNum(o.km).toFixed(0)}</td>
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);text-align:right;font-weight:600;font-family:monospace;color:#8b5cf6">${this._toNum(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid var(--glass-border-light);color:var(--text-secondary);white-space:nowrap">${o.data ? o.data.split('-').reverse().join('/') : '-'}</td>
                    </tr>
                `;

                // GPS do dia da OS (se tiver placa)
                if (gd) {
                    html += `
                    <tr>
                        <td colspan="8" style="padding:0;border-bottom:1px solid var(--glass-border-light)">
                            <div style="padding:8px 14px;background:rgba(6,182,212,0.06);display:flex;gap:18px;align-items:center;font-size:13px">
                                <span style="color:var(--text-muted);font-weight:600">GPS ${o.data ? o.data.split('-').reverse().join('/') : ''}:</span>
                                <span style="color:#06b6d4;font-weight:700">${gd.horasDirigindo.toFixed(1)}h dirigindo</span>
                                <span style="color:#a855f7;font-weight:700">${gd.horasParado.toFixed(1)}h parado</span>
                                <span style="color:#f97316;font-weight:700">${gd.km.toFixed(0)} km</span>
                                <span style="color:var(--text-muted)">${gd.horasFora.toFixed(1)}h fora da loja</span>
                            </div>
                        </td>
                    </tr>
                    `;
                }

                if (isOpen) {
                    html += `
                        <tr>
                            <td colspan="8" style="padding:0;border-bottom:1px solid var(--glass-border-light)">
                                <div style="padding:16px 20px;background:rgba(59,130,246,0.04)">
                                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">TECNICOS</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${(o.tecnicos || []).join(' // ') || o.vendedor_nome || '-'}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">EMPRESA</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.empresa || '-'}</div>
                                        </div>
                                        ${o.contrato ? `<div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">CONTRATO</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.contrato}</div>
                                        </div>` : ''}
                                        ${gd && gd.placa ? `<div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">VEICULO (GPS)</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${gd.placa}</div>
                                        </div>` : ''}
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">CIDADE</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.cidade || '-'}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">TIPO</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.interno ? 'Servico Interno' : 'Cobrada do Cliente'}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">HORAS</div>
                                            <div style="font-size:13px;color:#10b981;font-weight:700">${this._toNum(o.horas).toFixed(1)}h</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">KM</div>
                                            <div style="font-size:13px;color:#f59e0b;font-weight:700">${this._toNum(o.km).toFixed(0)} km</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">VALOR</div>
                                            <div style="font-size:13px;color:#8b5cf6;font-weight:700">R$ ${this._toNum(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">DATA</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.data ? o.data.split('-').reverse().join('/') : '-'}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">DATA FATURAMENTO</div>
                                            <div style="font-size:13px;color:var(--text-primary)">${o.data_fat ? o.data_fat.split('-').reverse().join('/') : '-'}</div>
                                        </div>
                                        ${o.dados_adic ? `<div style="grid-column:1/-1">
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:2px">DADOS ADICIONAIS</div>
                                            <div style="font-size:12px;color:var(--text-secondary)">${o.dados_adic}</div>
                                        </div>` : ''}
                                    </div>
                                    ${o.descricao ? `
                                        <div style="margin-top:12px">
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">DESCRICAO</div>
                                            <div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;line-height:1.5">${o.descricao.replace(/\|/g, '\n')}</div>
                                        </div>
                                    ` : ''}
                                    ${o.obs ? `
                                        <div style="margin-top:12px">
                                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">OBSERVACOES</div>
                                            <div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;line-height:1.5">${o.obs}</div>
                                        </div>
                                    ` : ''}
                                </div>
                            </td>
                        </tr>
                    `;
                }
            }

            html += `
                        <tr style="background:rgba(255,255,255,0.03)">
                            <td style="font-size:15px;padding:12px 14px;font-weight:700;color:var(--text-primary)" colspan="4">Total Tecnico (${ords.length} OS)</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#10b981">${stats.horas.toFixed(1)}</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#f59e0b">${stats.km.toFixed(0)}</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#8b5cf6">${stats.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td style="padding:12px 14px"></td>
                        </tr>
            `;

            // Linha de total GPS (somatorio dos dias unicos com GPS)
            if (temGPSporOS) {
                html += `
                        <tr style="background:rgba(6,182,212,0.06)">
                            <td style="font-size:15px;padding:12px 14px;font-weight:700;color:#06b6d4" colspan="4">Total GPS (${gpsDiasUsados.size} dia${gpsDiasUsados.size > 1 ? 's' : ''})</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#06b6d4">${gpsSomaDirigindo.toFixed(1)}h dir</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#f97316">${gpsSomaKm.toFixed(0)}</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:800;font-family:monospace;color:#a855f7">${gpsSomaParado.toFixed(1)}h par</td>
                            <td style="font-size:15px;padding:12px 14px;text-align:right;font-weight:700;font-family:monospace;color:var(--text-muted)">${gpsSomaFora.toFixed(1)}h fora</td>
                        </tr>
                `;
            }

            html += `
                    </tbody></table>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    _voltarCards() {
        this._tecnicoSel = null;
        this._ordemAberta = null;
        const container = document.getElementById('relatorio-content');
        this._renderCards(container);
    },

    _toggleOrdem(id) {
        this._ordemAberta = this._ordemAberta === id ? null : id;
        this._renderDetalhe();
    }
};
