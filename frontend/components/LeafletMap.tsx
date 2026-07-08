'use client';

import { useEffect, useRef } from 'react';

export interface MapStation {
  name: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  online: number;
  chargers: number;
}

export default function LeafletMap({ stations, height = 300 }: { stations: MapStation[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import('leaflet').then(async L => {
      if (destroyed || !containerRef.current) return;

      // Leaflet CSS — inject once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);

      const pins = stations.filter(s => s.lat && s.lng);
      if (pins.length) {
        const bounds = L.latLngBounds(pins.map(s => [s.lat!, s.lng!] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        pins.forEach(s => {
          const color = s.online > 0 ? '#14b8a6' : '#ef4444';
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0z" fill="${color}"/><circle cx="16" cy="16" r="9" fill="white"/><text x="16" y="20" text-anchor="middle" font-size="9" font-weight="700" fill="${color}">${s.online}/${s.chargers}</text></svg>`;
          const icon = L.divIcon({ html: svg, iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -40], className: '' });
          L.marker([s.lat!, s.lng!], { icon }).addTo(map)
            .bindPopup(`<b>${s.name}</b><br>${s.address || ''}<br>${s.online}/${s.chargers} online`);
        });
      } else {
        map.setView([20.5937, 78.9629], 5);
      }
      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [stations]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
