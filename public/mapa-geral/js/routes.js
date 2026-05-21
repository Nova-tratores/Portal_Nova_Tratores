// =========================================================
// ROUTES - Route polylines and replay animation
// =========================================================

const Routes = {
    currentPolyline: null,
    stopMarkers: [],
    replayMarker: null,
    replayPoints: [],
    replayIndex: 0,
    replayInterval: null,
    replaySpeed: 1,
    isPlaying: false,
    historicoPolylines: [],

    // Nova Tratores base location (Ourinhos - SP)
    BASE_LATLNG: [-23.208410, -49.370770],
    BASE_NAME: 'Nova Tratores',

    _formatDuracao(min) {
        if (min >= 60) return Math.floor(min / 60) + 'h ' + (min % 60) + 'min';
        return min + ' min';
    },

    async loadRouteWithClients(placa, data = null, clientes = []) {
        if (!data) data = new Date().toISOString().split('T')[0];
        Utils.toast(`Carregando rota ${placa}...`, 'info');

        try {
            const resp = await Utils.fetchJson(`/api/rota-dia?placa=${placa}&data=${data}`);

            this.clearRoute();
            MapCore.rotasLayer.clearLayers();

            // Always add Nova Tratores base marker
            const baseIcon = L.divIcon({
                className: '',
                html: `<div class="base-marker">
                    <div class="base-marker-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div class="base-marker-label">${this.BASE_NAME}</div>
                </div>`,
                iconSize: [120, 56],
                iconAnchor: [60, 22]
            });
            L.marker(this.BASE_LATLNG, { icon: baseIcon, interactive: false }).addTo(MapCore.rotasLayer);

            if (!resp.pontos || resp.pontos.length === 0) {
                Utils.toast('Nenhum ponto de rota para hoje', 'info');
                const rotasChk = document.getElementById('layer-rotas');
                if (rotasChk) rotasChk.checked = true;
                if (!MapCore.map.hasLayer(MapCore.rotasLayer)) MapCore.map.addLayer(MapCore.rotasLayer);
                return;
            }

            // Draw route outline (thick shadow) + main line
            const coords = resp.pontos
                .filter(p => p.latitude && p.longitude)
                .map(p => [p.latitude, p.longitude]);

            if (coords.length === 0) return;

            // Shadow polyline for visibility
            L.polyline(coords, {
                color: '#1e3a5f',
                weight: 8,
                opacity: 0.5,
                smoothFactor: 1,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(MapCore.rotasLayer);

            // Main route line
            this.currentPolyline = L.polyline(coords, {
                color: '#60a5fa',
                weight: 4,
                opacity: 0.95,
                smoothFactor: 1,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(MapCore.rotasLayer);

            // Direction arrows on route
            const arrowInterval = Math.max(1, Math.floor(coords.length / 15));
            for (let i = arrowInterval; i < coords.length - 1; i += arrowInterval) {
                const p1 = coords[i - 1];
                const p2 = coords[i];
                const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
                L.marker(coords[i], {
                    icon: L.divIcon({
                        className: '',
                        html: `<div style="transform:rotate(${90 - angle}deg);color:#60a5fa;font-size:14px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.6);">&#9650;</div>`,
                        iconSize: [14, 14],
                        iconAnchor: [7, 7]
                    }),
                    interactive: false
                }).addTo(MapCore.rotasLayer);
            }

            // Start marker (large, green, with label)
            L.marker(coords[0], {
                icon: L.divIcon({
                    html: `<div style="display:flex;flex-direction:column;align-items:center;">
                        <div style="background:#22c55e;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(34,197,94,0.3), 0 3px 10px rgba(0,0,0,0.4);"></div>
                        <div style="background:rgba(34,197,94,0.9);color:white;font-family:Inter,sans-serif;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-top:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">INICIO ${Utils.formatTime(resp.pontos[0].dt_posicao)}</div>
                    </div>`,
                    className: '', iconSize: [100, 42], iconAnchor: [50, 10]
                })
            }).addTo(MapCore.rotasLayer);

            // End marker (large, red, with label)
            const lastPt = resp.pontos[resp.pontos.length - 1];
            L.marker(coords[coords.length - 1], {
                icon: L.divIcon({
                    html: `<div style="display:flex;flex-direction:column;align-items:center;">
                        <div style="background:#ef4444;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(239,68,68,0.3), 0 3px 10px rgba(0,0,0,0.4);"></div>
                        <div style="background:rgba(239,68,68,0.9);color:white;font-family:Inter,sans-serif;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-top:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">FIM ${Utils.formatTime(lastPt.dt_posicao)}</div>
                    </div>`,
                    className: '', iconSize: [100, 42], iconAnchor: [50, 10]
                })
            }).addTo(MapCore.rotasLayer);

            // Stop markers - detect client proximity
            const clientesGeo = (clientes || []).filter(c => c.lat && c.lng);

            for (const parada of (resp.paradas || [])) {
                if (!parada.lat || !parada.lng) continue;

                // Check if stop is near a client (within 7km)
                let nearClient = null;
                let minDist = Infinity;
                for (const c of clientesGeo) {
                    const dist = Utils.calcularDistancia(parada.lat, parada.lng, c.lat, c.lng);
                    if (dist < 7 && dist < minDist) {
                        minDist = dist;
                        nearClient = c;
                    }
                }

                const isClient = !!nearClient;
                const duracao = parada.duracao_min;
                const duracaoStr = this._formatDuracao(duracao);

                if (isClient) {
                    // Client stop - big green circle with pulsing ring
                    const stopM = L.circleMarker([parada.lat, parada.lng], {
                        radius: 14, fillColor: '#22c55e', color: 'white', weight: 3,
                        fillOpacity: 0.9
                    }).addTo(MapCore.rotasLayer);

                    // Pulsing outer ring
                    L.circleMarker([parada.lat, parada.lng], {
                        radius: 22, fillColor: '#22c55e', color: '#22c55e', weight: 1.5,
                        fillOpacity: 0.08, opacity: 0.3, interactive: false
                    }).addTo(MapCore.rotasLayer);

                    const distKm = minDist.toFixed(1);
                    let popupHtml = `
                        <div class="popup-title" style="color:#22c55e;">Parada em Cliente - ${duracaoStr}</div>
                        <div class="popup-detail">Chegada: ${Utils.formatTime(parada.inicio)}</div>
                        <div class="popup-detail">Saida: ${Utils.formatTime(parada.fim)}</div>
                        <div class="popup-detail" style="color:#22c55e;font-weight:700;margin-top:6px;font-size:13px;">${Utils.truncate(nearClient.nome, 35)}</div>
                        <div class="popup-detail">${nearClient.cidade || ''} - ${nearClient.estado || ''}</div>
                        <div class="popup-detail" style="font-size:11px;color:var(--text-muted);">Distancia: ${distKm} km do cliente</div>
                        <button class="popup-btn" onclick="Panels.open('${nearClient.id}')">Ver cliente</button>
                    `;
                    if (parada.endereco) {
                        popupHtml += `<div class="popup-detail" style="color:var(--text-muted);margin-top:4px">${parada.endereco}</div>`;
                    }
                    stopM.bindPopup(popupHtml, { maxWidth: 300 });

                    // Label above
                    const label = L.marker([parada.lat, parada.lng], {
                        icon: L.divIcon({
                            className: '',
                            html: `<div class="stop-client-label">${Utils.truncate(nearClient.nome, 22)}<br><span>${duracaoStr}</span></div>`,
                            iconSize: [160, 36],
                            iconAnchor: [80, -16]
                        })
                    }).addTo(MapCore.rotasLayer);
                    this.stopMarkers.push(label);
                    this.stopMarkers.push(stopM);
                } else {
                    // Normal stop - orange circle with label
                    const stopM = L.circleMarker([parada.lat, parada.lng], {
                        radius: 10, fillColor: '#f59e0b', color: 'white', weight: 2.5,
                        fillOpacity: 0.9
                    }).addTo(MapCore.rotasLayer);

                    let popupHtml = `
                        <div class="popup-title">Parada - ${duracaoStr}</div>
                        <div class="popup-detail">Chegada: ${Utils.formatTime(parada.inicio)}</div>
                        <div class="popup-detail">Saida: ${Utils.formatTime(parada.fim)}</div>
                    `;
                    if (parada.endereco) {
                        popupHtml += `<div class="popup-detail" style="color:var(--text-muted);margin-top:4px">${parada.endereco}</div>`;
                    }
                    stopM.bindPopup(popupHtml, { maxWidth: 280 });

                    // Label for normal stops too
                    const label = L.marker([parada.lat, parada.lng], {
                        icon: L.divIcon({
                            className: '',
                            html: `<div class="stop-normal-label">${duracaoStr}</div>`,
                            iconSize: [80, 20],
                            iconAnchor: [40, -10]
                        })
                    }).addTo(MapCore.rotasLayer);
                    this.stopMarkers.push(label);
                    this.stopMarkers.push(stopM);
                }
            }

            // Enable route layer
            const rotasChk = document.getElementById('layer-rotas');
            if (rotasChk) rotasChk.checked = true;
            if (!MapCore.map.hasLayer(MapCore.rotasLayer)) MapCore.map.addLayer(MapCore.rotasLayer);

            // Fit map to include base + route
            const allBounds = [...coords, this.BASE_LATLNG];
            MapCore.map.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80] });

            // Setup replay
            this.replayPoints = resp.pontos.filter(p => p.latitude && p.longitude);
            document.getElementById('route-replay').classList.add('show');
            document.getElementById('replay-slider').max = this.replayPoints.length - 1;
            document.getElementById('replay-slider').value = 0;
            this.updateReplayTime(0);

            const paradasCount = (resp.paradas || []).length;
            const clientStops = (resp.paradas || []).filter(p => {
                if (!p.lat || !p.lng) return false;
                return clientesGeo.some(c => Utils.calcularDistancia(p.lat, p.lng, c.lat, c.lng) < 7);
            }).length;
            Utils.toast(`Rota: ${coords.length} pontos, ${paradasCount} paradas (${clientStops} em clientes)`, 'success');
        } catch (e) {
            console.error('Erro ao carregar rota:', e);
            Utils.toast('Erro ao carregar rota', 'error');
        }
    },

    async loadRoute(placa, data = null) {
        if (!data) data = new Date().toISOString().split('T')[0];
        Utils.toast(`Carregando rota ${placa}...`, 'info');

        try {
            const resp = await Utils.fetchJson(`/api/rota-dia?placa=${placa}&data=${data}`);

            this.clearRoute();
            MapCore.rotasLayer.clearLayers();

            if (!resp.pontos || resp.pontos.length === 0) {
                Utils.toast('Nenhum ponto encontrado para esta data', 'error');
                return;
            }

            // Draw polyline
            const coords = resp.pontos
                .filter(p => p.latitude && p.longitude)
                .map(p => [p.latitude, p.longitude]);

            if (coords.length === 0) return;

            this.currentPolyline = L.polyline(coords, {
                color: '#3b82f6',
                weight: 3,
                opacity: 0.8,
                smoothFactor: 1
            }).addTo(MapCore.rotasLayer);

            // Start marker
            L.marker(coords[0], {
                icon: L.divIcon({
                    html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
                    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
                })
            }).addTo(MapCore.rotasLayer).bindPopup(`<b>Inicio</b><br>${Utils.formatTime(resp.pontos[0].dt_posicao)}`);

            // End marker
            L.marker(coords[coords.length - 1], {
                icon: L.divIcon({
                    html: '<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
                    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
                })
            }).addTo(MapCore.rotasLayer).bindPopup(`<b>Fim</b><br>${Utils.formatTime(resp.pontos[resp.pontos.length - 1].dt_posicao)}`);

            // Stop markers
            for (const parada of (resp.paradas || [])) {
                if (!parada.lat || !parada.lng) continue;
                const stopM = L.circleMarker([parada.lat, parada.lng], {
                    radius: 8, fillColor: '#f59e0b', color: 'white', weight: 2,
                    fillOpacity: 0.9
                }).addTo(MapCore.rotasLayer);
                stopM.bindPopup(`
                    <div class="popup-title">⏸️ Parada ${parada.duracao_min} min</div>
                    <div class="popup-detail">Chegada: ${Utils.formatTime(parada.inicio)}</div>
                    <div class="popup-detail">Saida: ${Utils.formatTime(parada.fim)}</div>
                    ${parada.endereco ? `<div class="popup-detail">📍 ${parada.endereco}</div>` : ''}
                `);
                stopM.on('contextmenu', (e) => {
                    e.originalEvent.preventDefault();
                    e.originalEvent.stopPropagation();
                    MapCore._showContextMenu(e.originalEvent, e.latlng);
                });
                this.stopMarkers.push(stopM);
            }

            // Enable route layer
            const rotasChk = document.getElementById('layer-rotas');
            if (rotasChk) rotasChk.checked = true;
            if (!MapCore.map.hasLayer(MapCore.rotasLayer)) MapCore.map.addLayer(MapCore.rotasLayer);

            // Fit map
            MapCore.map.fitBounds(this.currentPolyline.getBounds(), { padding: [60, 60] });

            // Setup replay
            this.replayPoints = resp.pontos.filter(p => p.latitude && p.longitude);
            document.getElementById('route-replay').classList.add('show');
            document.getElementById('replay-slider').max = this.replayPoints.length - 1;
            document.getElementById('replay-slider').value = 0;
            this.updateReplayTime(0);

            Utils.toast(`Rota carregada: ${coords.length} pontos, ${(resp.paradas || []).length} paradas`, 'success');
        } catch (e) {
            console.error('Erro ao carregar rota:', e);
            Utils.toast('Erro ao carregar rota', 'error');
        }
    },

    async loadHistorico(placa) {
        const dataI = document.getElementById('data-inicio').value;
        const dataF = document.getElementById('data-fim').value;

        if (!dataI || !dataF) {
            Utils.toast('Selecione um periodo no sidebar para ver o historico', 'error');
            return;
        }

        Utils.toast(`Carregando historico ${placa}...`, 'info');

        try {
            const resp = await Utils.fetchJson(`/api/historico-rotas?placa=${placa}&dataI=${dataI}&dataF=${dataF}`);
            this.clearRoute();
            MapCore.rotasLayer.clearLayers();

            const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1'];
            let allBounds = [];

            for (let i = 0; i < resp.rotas.length; i++) {
                const rota = resp.rotas[i];
                const coords = rota.pontos.filter(p => p.latitude && p.longitude).map(p => [p.latitude, p.longitude]);
                if (coords.length === 0) continue;

                const color = colors[i % colors.length];
                const poly = L.polyline(coords, { color, weight: 2.5, opacity: 0.7 }).addTo(MapCore.rotasLayer);
                poly.bindPopup(`<b>${rota.data}</b><br>${coords.length} pontos`);
                this.historicoPolylines.push(poly);
                allBounds = allBounds.concat(coords);
            }

            if (allBounds.length > 0) {
                document.getElementById('layer-rotas').checked = true;
                MapCore.map.addLayer(MapCore.rotasLayer);
                MapCore.map.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60] });
            }

            Utils.toast(`Historico: ${resp.rotas.length} dias carregados`, 'success');
        } catch (e) {
            Utils.toast('Erro ao carregar historico', 'error');
        }
    },

    clearRoute() {
        if (this.currentPolyline) { MapCore.rotasLayer.removeLayer(this.currentPolyline); this.currentPolyline = null; }
        this.stopMarkers.forEach(m => MapCore.rotasLayer.removeLayer(m));
        this.stopMarkers = [];
        this.historicoPolylines.forEach(p => MapCore.rotasLayer.removeLayer(p));
        this.historicoPolylines = [];
        if (this.replayMarker) { MapCore.map.removeLayer(this.replayMarker); this.replayMarker = null; }
        this.stopReplay();
    },

    // Replay
    toggleReplay() {
        if (this.isPlaying) {
            this.pauseReplay();
        } else {
            this.startReplay();
        }
    },

    startReplay() {
        if (this.replayPoints.length === 0) return;
        this.isPlaying = true;
        document.getElementById('btn-replay').textContent = '⏸';

        if (!this.replayMarker) {
            this.replayMarker = L.marker(
                [this.replayPoints[this.replayIndex].latitude, this.replayPoints[this.replayIndex].longitude],
                {
                    icon: L.divIcon({
                        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,0.6);"></div>',
                        className: '', iconSize: [16, 16], iconAnchor: [8, 8]
                    })
                }
            ).addTo(MapCore.map);
        }

        this.replayInterval = setInterval(() => {
            this.replayIndex++;
            if (this.replayIndex >= this.replayPoints.length) {
                this.pauseReplay();
                this.replayIndex = this.replayPoints.length - 1;
                return;
            }
            const p = this.replayPoints[this.replayIndex];
            this.replayMarker.setLatLng([p.latitude, p.longitude]);
            document.getElementById('replay-slider').value = this.replayIndex;
            this.updateReplayTime(this.replayIndex);
        }, 100 / this.replaySpeed);
    },

    pauseReplay() {
        this.isPlaying = false;
        document.getElementById('btn-replay').textContent = '▶';
        clearInterval(this.replayInterval);
    },

    stopReplay() {
        this.pauseReplay();
        this.replayIndex = 0;
        this.replayPoints = [];
        document.getElementById('route-replay').classList.remove('show');
    },

    closeReplay() {
        this.clearRoute();
        document.getElementById('route-replay').classList.remove('show');
    },

    changeSpeed() {
        const speeds = [1, 2, 4, 8];
        const idx = speeds.indexOf(this.replaySpeed);
        this.replaySpeed = speeds[(idx + 1) % speeds.length];
        document.getElementById('replay-speed').textContent = this.replaySpeed + 'x';
        if (this.isPlaying) {
            this.pauseReplay();
            this.startReplay();
        }
    },

    updateReplayTime(index) {
        if (this.replayPoints[index]) {
            document.getElementById('replay-time').textContent = Utils.formatTime(this.replayPoints[index].dt_posicao);
        }
    }
};

// Slider input
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('replay-slider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            Routes.replayIndex = parseInt(e.target.value);
            if (Routes.replayMarker && Routes.replayPoints[Routes.replayIndex]) {
                const p = Routes.replayPoints[Routes.replayIndex];
                Routes.replayMarker.setLatLng([p.latitude, p.longitude]);
                Routes.updateReplayTime(Routes.replayIndex);
            }
        });
    }
});
