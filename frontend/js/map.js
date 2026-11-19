/**
 * map.js — Leaflet.js green cover ward map with realistic Bengaluru polygons.
 */

let leafletMap = null;
let geojsonLayer = null;
let labelLayer = null;

// ── Color scale matching legend ───────────────────────────────────────────────
function wardColor(pct) {
  if (pct < 10)  return "#B71C1C";   // deep red — critical
  if (pct < 15)  return "#E53935";   // red — deficient
  if (pct < 25)  return "#FB8C00";   // orange — low
  if (pct < 40)  return "#7CB342";   // light green — moderate
  return "#2E7D32";                   // dark green — good
}

function wardLabel(pct) {
  if (pct < 10)  return "Critical";
  if (pct < 15)  return "Deficient";
  if (pct < 25)  return "Low";
  if (pct < 40)  return "Moderate";
  return "Good";
}

function wardStyle(feature) {
  const pct = feature.properties.green_cover_pct || 0;
  return {
    fillColor:   wardColor(pct),
    weight:      2,
    opacity:     0.9,
    color:       "#ffffff",
    fillOpacity: 0.68,
  };
}

function wardStyleHover(feature) {
  const pct = feature.properties.green_cover_pct || 0;
  return {
    fillColor:   wardColor(pct),
    weight:      3.5,
    opacity:     1,
    color:       "#fff",
    fillOpacity: 0.88,
  };
}

function onEachFeature(feature, layer) {
  const p    = feature.properties;
  const name = p.ward_name || `Ward ${p.ward_no || "?"}`;
  const pct  = typeof p.green_cover_pct === "number"
    ? p.green_cover_pct.toFixed(1) : "N/A";
  const color   = wardColor(p.green_cover_pct || 0);
  const label   = wardLabel(p.green_cover_pct || 0);
  const updated = p.last_updated
    ? new Date(p.last_updated).toLocaleTimeString() : "—";

  layer.bindPopup(`
    <div style="min-width:180px;font-family:-apple-system,sans-serif">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">${name}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:14px;height:14px;border-radius:3px;background:${color};flex-shrink:0"></div>
        <span style="font-size:22px;font-weight:700;color:${color}">${pct}%</span>
        <span style="font-size:11px;color:#666;padding:2px 7px;background:#f5f5f5;border-radius:12px">${label}</span>
      </div>
      <div style="font-size:11px;color:#888">Last updated: ${updated}</div>
    </div>
  `, { maxWidth: 240 });

  layer.on("mouseover", function (e) {
    this.setStyle(wardStyleHover(feature));
    this.openPopup();
  });
  layer.on("mouseout", function () {
    if (geojsonLayer) geojsonLayer.resetStyle(this);
    this.closePopup();
  });
  layer.on("click", function () {
    this.openPopup();
  });
}

async function loadMap() {
  if (!leafletMap) {
    leafletMap = L.map("map-container", {
      zoomControl:       true,
      scrollWheelZoom:   true,
      preferCanvas:      false,
    }).setView([12.9716, 77.5946], 11);

    // Subtle OSM tiles — CartoDB Positron gives cleaner base for data overlays
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://carto.com/">CartoDB</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(leafletMap);
  }

  // Always invalidate size — fixes blank map when panel was hidden on init
  leafletMap.invalidateSize();

  try {
    const res    = await fetch(`${API}/map/wards`);
    const geojson = await res.json();

    if (geojsonLayer) leafletMap.removeLayer(geojsonLayer);

    geojsonLayer = L.geoJSON(geojson, {
      style:          wardStyle,
      onEachFeature:  onEachFeature,
    }).addTo(leafletMap);

    if (geojsonLayer.getBounds().isValid()) {
      leafletMap.fitBounds(geojsonLayer.getBounds(), { padding: [30, 30] });
    }

    // Update "last updated" badge
    const features = geojson.features || [];
    if (features.length && features[0].properties.last_updated) {
      const mins = Math.floor(
        (Date.now() - new Date(features[0].properties.last_updated).getTime()) / 60000
      );
      const badge = document.getElementById("map-updated-badge");
      if (badge) badge.textContent = `Last updated: ${mins < 1 ? "just now" : mins + " min ago"}`;
    }
  } catch (err) {
    console.error("Map load failed:", err);
  }
}

window.loadMap = loadMap;
