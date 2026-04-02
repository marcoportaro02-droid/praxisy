// Praxisy Mappa Interattiva — Leaflet.js
// Incolla questo codice nel tuo index.html PRIMA del tag </body>
// Aggiunge una mappa interattiva nella sezione Segnalazioni

/* ═══ ISTRUZIONI DI INSTALLAZIONE ═══
1. Aggiungi nel <head> del tuo index.html:
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

2. Nella sezione view-segnalazioni, aggiungi questo HTML
   PRIMA del form di nuova segnalazione:
   <div id="mappa-segnalazioni" style="height:280px;border-radius:11px;overflow:hidden;border:1px solid var(--border);margin-bottom:14px"></div>

3. Incolla questo script PRIMA del </body>
═══════════════════════════════════════ */

(function initMappa() {
  'use strict';

  let mappa = null;
  let markers = [];
  let userMarker = null;
  let selectedLatLng = null;

  const iconColors = {
    buca: '#8b2e2e',
    illuminazione: '#b8922a',
    rifiuti: '#5a3a5a',
    verde: '#2d5a2d',
    acqua: '#2a5c7a',
    vandalismo: '#5a2e2e',
    pericolo: '#c4522a',
    altro: '#6b7d5a',
  };

  const iconEmoji = {
    buca: '🕳️', illuminazione: '💡', rifiuti: '🗑️',
    verde: '🌿', acqua: '💧', vandalismo: '🔨',
    pericolo: '⚠️', altro: '📋',
  };

  // Crea icona custom per il marker
  function creaIcona(tipo, stato) {
    const color = iconColors[tipo] || '#6b7d5a';
    const emoji = iconEmoji[tipo] || '📋';
    const opacity = stato === 'done' ? '0.5' : '1';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48">
        <path d="M18 0C8 0 0 8 0 18c0 12 18 30 18 30S36 30 36 18C36 8 28 0 18 0z"
          fill="${color}" opacity="${opacity}" stroke="white" stroke-width="2"/>
        <text x="18" y="23" text-anchor="middle" font-size="14" dy=".3em">${emoji}</text>
      </svg>`;
    return L.divIcon({
      html: svg,
      iconSize: [36, 48],
      iconAnchor: [18, 48],
      popupAnchor: [0, -48],
      className: '',
    });
  }

  // Icona per posizione utente
  const userIcon = L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#2d5a2d;border:3px solid white;box-shadow:0 0 8px rgba(45,90,45,.6)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    className: '',
  });

  // Icona per nuova segnalazione (pin rosso)
  const newPinIcon = L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#8b2e2e;border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    className: '',
  });

  // Inizializza la mappa
  function init(comune) {
    const el = document.getElementById('mappa-segnalazioni');
    if (!el || typeof L === 'undefined') return;
    if (mappa) { mappa.remove(); mappa = null; markers = []; }

    // Coordinate default per i comuni pilota
    const coords = {
      'Cividale del Friuli': [46.0944, 13.4330],
      "Cantù": [45.7375, 9.1280],
      'Stresa': [45.8838, 8.5330],
    };
    const center = coords[comune] || [45.4642, 9.1900]; // default Milano

    mappa = L.map('mappa-segnalazioni', {
      center,
      zoom: comune === 'Stresa' ? 14 : 13,
      zoomControl: true,
      attributionControl: false,
    });

    // Tile layer OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(mappa);

    // Click sulla mappa per selezionare posizione segnalazione
    mappa.on('click', function(e) {
      selectedLatLng = e.latlng;
      if (userMarker) mappa.removeLayer(userMarker);
      userMarker = L.marker(e.latlng, { icon: newPinIcon }).addTo(mappa);
      userMarker.bindPopup('<strong>📍 Posizione selezionata</strong><br>Clicca "Invia Segnalazione" per confermare.').openPopup();

      // Aggiorna il campo indirizzo con coordinate
      const addrEl = document.getElementById('seg-addr');
      if (addrEl) addrEl.value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
      showToast('📍 Posizione selezionata sulla mappa');
    });

    // Bottone GPS
    const gpsBtn = L.control({ position: 'topleft' });
    gpsBtn.onAdd = function() {
      const div = L.DomUtil.create('div', '');
      div.innerHTML = `<button onclick="usaGPS()" style="background:var(--ink);color:var(--bg);border:none;border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,.2)">📍 Usa GPS</button>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    gpsBtn.addTo(mappa);

    // Carica segnalazioni esistenti sulla mappa
    caricaSegnalazioniMappa(comune);
  }

  // Carica markers segnalazioni dal database
  async function caricaSegnalazioniMappa(comune) {
    if (!mappa || !window.sb) return;
    try {
      const { data } = await window.sb
        .from('segnalazioni')
        .select('*')
        .eq('comune', comune)
        .not('indirizzo', 'is', null);

      // Rimuovi markers esistenti
      markers.forEach(m => mappa.removeLayer(m));
      markers = [];

      (data || []).forEach(seg => {
        // Prova a parsare coordinate dal campo indirizzo
        const coordMatch = seg.indirizzo?.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
        if (!coordMatch) return;

        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (isNaN(lat) || isNaN(lng)) return;

        const marker = L.marker([lat, lng], { icon: creaIcona(seg.tipo, seg.stato) });

        const statusLabel = { open: '🔴 Aperta', progress: '🟡 In lavorazione', done: '🟢 Risolta' };
        const popup = `
          <div style="font-family:'DM Sans',sans-serif;min-width:180px">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${iconEmoji[seg.tipo] || '📋'} ${seg.tipo?.charAt(0).toUpperCase() + seg.tipo?.slice(1)}</div>
            <div style="font-size:11.5px;color:#333;margin-bottom:4px">${seg.descrizione}</div>
            <div style="font-size:10px;color:#888;margin-bottom:4px">${statusLabel[seg.stato] || seg.stato}</div>
            <div style="font-size:10px;color:#888">👍 ${seg.voti || 0} cittadini confermano</div>
          </div>`;

        marker.bindPopup(popup, { maxWidth: 220 });
        marker.addTo(mappa);
        markers.push(marker);
      });

      if (markers.length > 0) {
        showToast(`🗺️ ${markers.length} segnalazioni sulla mappa`);
      }
    } catch (e) {
      console.error('Errore caricamento mappa:', e);
    }
  }

  // Funzione GPS globale
  window.usaGPS = function() {
    if (!navigator.geolocation) { showToast('GPS non disponibile ⚠️'); return; }
    showToast('📍 Rilevamento posizione...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        selectedLatLng = { lat, lng };
        if (mappa) mappa.setView([lat, lng], 16);
        if (userMarker) mappa.removeLayer(userMarker);
        userMarker = L.marker([lat, lng], { icon: newPinIcon }).addTo(mappa);
        userMarker.bindPopup('<strong>📍 La tua posizione</strong>').openPopup();
        const addrEl = document.getElementById('seg-addr');
        if (addrEl) addrEl.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        showToast('✅ Posizione GPS rilevata!');
      },
      err => showToast('GPS non riuscito. Clicca sulla mappa. ⚠️')
    );
  };

  // Aggiorna mappa quando cambia il comune
  window.initMappaSegnalazioni = init;
  window.aggiornaMappaSegs = caricaSegnalazioniMappa;

  // Osserva quando la view segnalazioni diventa visibile
  const observer = new MutationObserver(() => {
    const view = document.getElementById('view-segnalazioni');
    if (view && view.classList.contains('on') && !mappa && window.selectedComune) {
      setTimeout(() => init(window.selectedComune.n), 100);
    }
  });

  const content = document.querySelector('.content');
  if (content) observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

})();
