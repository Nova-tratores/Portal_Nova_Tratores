// =========================================================
// UTILS - Funcoes auxiliares
// =========================================================

const API_BASE = 'https://mapa-geral-production.up.railway.app';
const _originalFetch = window.fetch;
window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.startsWith('/api')) url = API_BASE + url;
    return _originalFetch.call(this, url, opts);
};

const Utils = {
    brl(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
        if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            return `${d}/${m}/${y}`;
        }
        return dateStr;
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return dateStr; }
    },

    formatTime(dateStr) {
        if (!dateStr) return '--:--';
        try {
            const d = new Date(dateStr);
            return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch { return '--:--'; }
    },

    diasDesde(dateStr) {
        if (!dateStr) return Infinity;
        const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        const now = new Date();
        return Math.floor((now - date) / (1000 * 60 * 60 * 24));
    },

    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    },

    toast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `${type === 'info' ? '<div class="spinner"></div>' : ''}<span>${msg}</span>`;
        container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
    },

    async fetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },

    getVisitColor(ultimaVisita) {
        const dias = this.diasDesde(ultimaVisita);
        if (dias <= 30) return 'green';
        if (dias <= 90) return 'yellow';
        return 'red';
    },

    getMarkerSize(equipCount) {
        if (equipCount <= 0) return 8;
        if (equipCount <= 2) return 12;
        if (equipCount <= 5) return 16;
        if (equipCount <= 9) return 22;
        return 28;
    },

    truncate(str, len = 30) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    },

    // Vehicle model to icon type mapping
    getVehicleType(modelo) {
        const m = (modelo || '').toUpperCase();
        const pickups = ['SAVEIRO', 'MONTANA', 'STRADA', 'S10'];
        const suvs = ['CAPTIVA', 'SW4', 'HILUX', 'HILLUX', 'TRACKER', 'DUSTER'];
        const trucks = ['CARGO', 'CAMINHAO', 'VW'];
        if (pickups.some(p => m.includes(p))) return 'pickup';
        if (suvs.some(s => m.includes(s))) return 'suv';
        if (trucks.some(t => m.includes(t))) return 'truck';
        return 'sedan';
    },

    getVehicleIconUrl(modelo) {
        return `img/vehicles/${this.getVehicleType(modelo)}.svg`;
    }
};
