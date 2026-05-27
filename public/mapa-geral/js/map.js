// =========================================================
// MAP - Leaflet core initialization and layer management
// =========================================================

const MapCore = {
    map: null,
    clientesLayer: null,
    veiculosLayer: null,
    veiculosOficinaLayer: null,
    veiculosComercialLayer: null,
    rotasLayer: null,
    heatLayer: null,
    clusterGroup: null,
    oportunidadesLayer: null,
    paradasLayer: null,
    regioesLayer: null,
    tecnicoNoClienteLayer: null,

    init() {
        this.map = L.map('map', {
            center: [-23.195, -49.380],
            zoom: 8,
            zoomControl: false,
            preferCanvas: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        }).addTo(this.map);

        // Zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        // Layer groups
        this.clientesLayer = L.layerGroup().addTo(this.map);
        this.veiculosLayer = L.layerGroup().addTo(this.map);
        this.veiculosOficinaLayer = L.layerGroup().addTo(this.map);
        this.veiculosComercialLayer = L.layerGroup();
        this.rotasLayer = L.layerGroup().addTo(this.map);
        this.oportunidadesLayer = L.layerGroup();
        this.paradasLayer = L.layerGroup();
        this.regioesLayer = L.layerGroup();
        this.tecnicoNoClienteLayer = L.layerGroup().addTo(this.map);
        this.clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            chunkedLoading: true,
            chunkInterval: 100,
            chunkDelay: 10,
            disableClusteringAtZoom: 16,
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                let size = 'small';
                if (count > 20) size = 'large';
                else if (count > 10) size = 'medium';

                return L.divIcon({
                    html: `<div style="
                        background: rgba(59, 130, 246, 0.85);
                        backdrop-filter: blur(6px);
                        border: 2px solid rgba(255,255,255,0.5);
                        border-radius: 50%;
                        width: ${size === 'large' ? 50 : size === 'medium' ? 42 : 34}px;
                        height: ${size === 'large' ? 50 : size === 'medium' ? 42 : 34}px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 700;
                        font-size: ${size === 'large' ? 15 : 13}px;
                        font-family: Inter, sans-serif;
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                    ">${count}</div>`,
                    className: '',
                    iconSize: L.point(size === 'large' ? 50 : size === 'medium' ? 42 : 34, size === 'large' ? 50 : size === 'medium' ? 42 : 34)
                });
            }
        });

        // Right-click context menu
        this.setupContextMenu();

        // Layer toggle listeners
        this.setupLayerToggles();
    },

    // =========================================================
    // CONTEXT MENU - Right-click to add client
    // =========================================================
    _ctxLatLng: null,

    setupContextMenu() {
        const menu = document.getElementById('map-context-menu');

        // Right-click on map
        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            this._showContextMenu(e.originalEvent, e.latlng);
        });

        // Click anywhere to close
        document.addEventListener('click', () => this._hideContextMenu());
        this.map.on('movestart', () => this._hideContextMenu());

        // Add client button
        document.getElementById('ctx-add-client').addEventListener('click', () => {
            this._hideContextMenu();
            if (this._ctxLatLng) {
                CrudModal.openClient(null, { lat: this._ctxLatLng.lat, lng: this._ctxLatLng.lng });
            }
        });
    },

    _showContextMenu(e, latlng) {
        this._ctxLatLng = latlng;
        const menu = document.getElementById('map-context-menu');
        document.getElementById('ctx-coords').textContent =
            `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

        // Position menu at cursor
        let x = e.clientX;
        let y = e.clientY;
        menu.classList.add('open');
        // Adjust if menu goes off-screen
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    },

    _hideContextMenu() {
        document.getElementById('map-context-menu').classList.remove('open');
    },

    _bindToggle(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', fn);
    },

    setupLayerToggles() {
        this._bindToggle('layer-clientes', (e) => {
            if (e.target.checked) {
                this.map.addLayer(this.clientesLayer);
                const cl = document.getElementById('layer-clusters');
                if (cl && cl.checked) this.map.addLayer(this.clusterGroup);
            } else {
                this.map.removeLayer(this.clientesLayer);
                this.map.removeLayer(this.clusterGroup);
            }
        });

        this._bindToggle('layer-clientes-todos', () => {
            const filtered = Markers.filterClients(App.state.clientes);
            Markers.renderClients(filtered);
        });

        this._bindToggle('layer-veiculos', (e) => {
            if (e.target.checked) {
                this.map.addLayer(this.veiculosLayer);
                const ofEl = document.getElementById('layer-veiculos-oficina');
                const coEl = document.getElementById('layer-veiculos-comercial');
                if (ofEl && ofEl.checked) this.map.addLayer(this.veiculosOficinaLayer);
                if (coEl && coEl.checked) this.map.addLayer(this.veiculosComercialLayer);
            } else {
                this.map.removeLayer(this.veiculosLayer);
                this.map.removeLayer(this.veiculosOficinaLayer);
                this.map.removeLayer(this.veiculosComercialLayer);
            }
        });

        this._bindToggle('layer-veiculos-oficina', (e) => {
            if (!document.getElementById('layer-veiculos').checked) return;
            e.target.checked ? this.map.addLayer(this.veiculosOficinaLayer) : this.map.removeLayer(this.veiculosOficinaLayer);
        });

        this._bindToggle('layer-veiculos-comercial', (e) => {
            if (!document.getElementById('layer-veiculos').checked) return;
            e.target.checked ? this.map.addLayer(this.veiculosComercialLayer) : this.map.removeLayer(this.veiculosComercialLayer);
        });

        // Camadas extras (desativadas no HTML, mas prontas se reativar)
        this._bindToggle('layer-rotas', (e) => {
            e.target.checked ? this.map.addLayer(this.rotasLayer) : this.map.removeLayer(this.rotasLayer);
        });

        this._bindToggle('layer-heatmap', (e) => {
            if (e.target.checked && this.heatLayer) {
                this.map.addLayer(this.heatLayer);
            } else if (this.heatLayer) {
                this.map.removeLayer(this.heatLayer);
            }
        });

        this._bindToggle('layer-clusters', () => {
            const filtered = Markers.filterClients(App.state.clientes);
            Markers.renderClients(filtered);
        });

        this._bindToggle('layer-paradas', (e) => {
            e.target.checked ? this.map.addLayer(this.paradasLayer) : this.map.removeLayer(this.paradasLayer);
        });

        this._bindToggle('layer-oportunidades', (e) => {
            e.target.checked ? this.map.addLayer(this.oportunidadesLayer) : this.map.removeLayer(this.oportunidadesLayer);
        });

        this._bindToggle('layer-regioes', (e) => {
            e.target.checked ? this.map.addLayer(this.regioesLayer) : this.map.removeLayer(this.regioesLayer);
            if (typeof RegionEditor !== 'undefined') RegionEditor.onLayerToggle(e.target.checked);
        });
    },

    setHeatData(points) {
        if (this.heatLayer) this.map.removeLayer(this.heatLayer);
        this.heatLayer = L.heatLayer(points, {
            radius: 30,
            blur: 20,
            maxZoom: 13,
            gradient: { 0.2: '#3b82f6', 0.4: '#8b5cf6', 0.6: '#f59e0b', 0.8: '#ef4444', 1: '#dc2626' }
        });
        const hm = document.getElementById('layer-heatmap');
        if (hm && hm.checked) {
            this.map.addLayer(this.heatLayer);
        }
    },

    fitBounds(markers) {
        if (markers.length === 0) return;
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
};
