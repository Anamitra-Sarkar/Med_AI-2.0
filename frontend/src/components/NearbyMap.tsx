"use client";

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/api";

interface NearbyMapProps {
  userLat: number;
  userLon: number;
  places: Place[];
  activeType: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  hospital: "#ef4444",
  clinic: "#3b82f6",
  pharmacy: "#10b981",
};

const TYPE_LABELS: Record<string, string> = {
  hospital: "🏥",
  clinic: "🏨",
  pharmacy: "💊",
};

function makeDivIcon(emoji: string, color: string): string {
  return `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;cursor:pointer;
    ">${emoji}</div>
  `;
}

function userDivIcon(): string {
  return `
    <div style="
      width:18px;height:18px;border-radius:50%;
      background:#14b8a6;
      border:3px solid white;
      box-shadow:0 0 0 4px rgba(20,184,166,0.25);
    "></div>
  `;
}

export default function NearbyMap({
  userLat,
  userLon,
  places,
  activeType,
}: NearbyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let L: typeof import("leaflet");
    import("leaflet").then((leafletModule) => {
      L = leafletModule.default ?? leafletModule;

      // Prevent double-init on re-render
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: true,
      });

      map.setView([userLat, userLon], 14, { animate: true });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Zoom control bottom-right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // User location marker
      L.marker([userLat, userLon], {
        icon: L.divIcon({
          className: "",
          html: userDivIcon(),
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup(
          `<div style="font-weight:600;color:#0f172a">📍 Your Location</div>`
        );

      const filtered =
        activeType ? places.filter((p) => p.type === activeType) : places;

      filtered.forEach((place, index) => {
        if (place.lat == null || place.lon == null) return;

        const color = TYPE_COLORS[place.type] || "#6366f1";
        const emoji = TYPE_LABELS[place.type] || "📍";

        const icon = L.divIcon({
          className: "",
          html: makeDivIcon(emoji, color),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });

        const osmLink = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;

        const popupContent = `
          <div style="min-width:180px;font-family:system-ui,sans-serif">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">
              ${emoji} ${place.name}
            </div>
            <div style="font-size:11px;text-transform:capitalize;color:${color};font-weight:600;margin-bottom:6px">
              ${place.type}
            </div>
            ${place.address ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px">${place.address}</div>` : ""}
            ${place.opening_hours ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px">🕐 ${place.opening_hours}</div>` : ""}
            <a href="${osmLink}" target="_blank" rel="noopener noreferrer"
              style="font-size:11px;color:#0d9488;text-decoration:underline">
              Open in OpenStreetMap ↗
            </a>
          </div>
        `;

        const marker = L.marker([place.lat, place.lon], { icon })
          .addTo(map)
          .bindPopup(popupContent, { maxWidth: 240 });

        // Stagger the drop animation via CSS
        const el = marker.getElement();
        if (el) {
          el.style.opacity = "0";
          el.style.transform = "translateY(-20px)";
          el.style.transition = `opacity 0.3s ease ${index * 40}ms, transform 0.3s ease ${index * 40}ms`;
          setTimeout(() => {
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
          }, 50);
        }
      });

      leafletMapRef.current = map;
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [userLat, userLon, places, activeType]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-2xl overflow-hidden"
      style={{ height: "300px" }}
    />
  );
}
