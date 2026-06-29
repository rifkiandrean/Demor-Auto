import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

// Standard list of popular Indonesian cities for offline matching
export interface PopularCity {
  name: string;
  coords: [number, number];
}

export const POPULAR_CITIES: PopularCity[] = [
  { name: 'Jakarta (Monas)', coords: [-6.1754, 106.8272] },
  { name: 'Bandung (Alun-Alun)', coords: [-6.9219, 107.6101] },
  { name: 'Surabaya (Tugu Pahlawan)', coords: [-7.2458, 112.7378] },
  { name: 'Yogyakarta (Malioboro)', coords: [-7.7928, 110.3658] },
  { name: 'Bali (Seminyak)', coords: [-8.6913, 115.1682] },
  { name: 'Malang (Alun-Alun)', coords: [-7.9829, 112.6308] },
  { name: 'Semarang (Simpang Lima)', coords: [-6.9902, 110.4228] },
  { name: 'Bogor (Kebun Raya)', coords: [-6.5976, 106.7996] },
  { name: 'Solo (Surakarta)', coords: [-7.5562, 110.8251] },
  { name: 'Tangerang', coords: [-6.1783, 106.6319] },
  { name: 'Bekasi', coords: [-6.2383, 106.9756] },
  { name: 'Depok', coords: [-6.4025, 106.7942] },
];

// Haversine formula to calculate distance between two coordinates
export function calculateHaversineDistance(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return parseFloat(d.toFixed(1)); // return 1 decimal point
}

interface RouteMapProps {
  startLocation: string;
  setStartLocation: (loc: string) => void;
  destination: string;
  setDestination: (loc: string) => void;
  onDistanceCalculated: (distance: number) => void;
}

export default function RouteMap({
  startLocation,
  setStartLocation,
  destination,
  setDestination,
  onDistanceCalculated
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default view centered on Java, Indonesia
    const map = L.map(mapContainerRef.current, {
      center: [-7.25, 110.0],
      zoom: 6,
      zoomControl: true,
    });

    // Add Tile Layer (Sleek light carto map matches Traveloka, or dark tiles in dark mode)
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    const markersGroup = L.featureGroup().addTo(map);

    mapRef.current = map;
    markersGroupRef.current = markersGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      markersGroupRef.current = null;
    };
  }, []);

  // Sync tiles color theme with dark mode dynamically
  useEffect(() => {
    if (!mapRef.current) return;
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    // Remove existing tile layers and add the new one
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapRef.current?.removeLayer(layer);
      }
    });

    L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(mapRef.current);
  }, [isOffline]); // can trigger redraw if dark class changes, or just simple state

  // Geocode location helper
  const geocodeLocation = async (query: string): Promise<[number, number] | null> => {
    if (!query || query.trim() === '') return null;

    // 1. Check offline/online local lookup first for speed
    const normalizedQuery = query.toLowerCase();
    const localMatch = POPULAR_CITIES.find(
      city => city.name.toLowerCase().includes(normalizedQuery) || 
              normalizedQuery.includes(city.name.toLowerCase().split(' ')[0])
    );
    if (localMatch) {
      return localMatch.coords;
    }

    if (!navigator.onLine) {
      // If offline, and we didn't match directly, guess near Bandung/Jakarta randomly so the map still displays
      console.warn('Offline: No exact match for location, using general coordinates');
      return [-6.2088, 106.8456]; // Jakarta default
    }

    // 2. Online fetch from Nominatim OSM (Search in ID region to restrict results)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Indonesia')}&limit=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'id' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.error('Geocoding search failed:', e);
    }
    return null;
  };

  // Search start location
  const handleSearchStart = async () => {
    if (!startLocation) return;
    setSearchingStart(true);
    setErrorMessage(null);
    const coords = await geocodeLocation(startLocation);
    setSearchingStart(false);
    if (coords) {
      setStartCoords(coords);
    } else {
      setErrorMessage(`Lokasi keberangkatan "${startLocation}" tidak ditemukan.`);
    }
  };

  // Search destination
  const handleSearchDest = async () => {
    if (!destination) return;
    setSearchingDest(true);
    setErrorMessage(null);
    const coords = await geocodeLocation(destination);
    setSearchingDest(false);
    if (coords) {
      setDestCoords(coords);
    } else {
      setErrorMessage(`Tujuan "${destination}" tidak ditemukan.`);
    }
  };

  // Trigger search when input field is filled and blurred/entered
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (startLocation && !startCoords) {
        handleSearchStart();
      }
    }, 1200);
    return () => clearTimeout(delayDebounceFn);
  }, [startLocation]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (destination && !destCoords) {
        handleSearchDest();
      }
    }, 1200);
    return () => clearTimeout(delayDebounceFn);
  }, [destination]);

  // Render Markers and Path on Map
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    // Clear previous markers & polylines
    markersGroupRef.current.clearLayers();
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const markers: L.Marker[] = [];

    // Custom SVG marker for start point (Traveloka Blue)
    const startIcon = L.divIcon({
      html: `
        <div class="flex items-center justify-center w-10 h-10 bg-white rounded-full border-2 border-[#0194f3] shadow-md relative">
          <div class="w-4 h-4 bg-[#0194f3] rounded-full animate-ping absolute"></div>
          <div class="w-4 h-4 bg-[#0194f3] rounded-full z-10"></div>
        </div>
      `,
      className: 'custom-leaflet-icon-start',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    // Custom SVG marker for destination point (Traveloka Accent Orange)
    const destIcon = L.divIcon({
      html: `
        <div class="flex items-center justify-center w-10 h-10 bg-white rounded-full border-2 border-[#ff5e1f] shadow-md relative">
          <div class="w-4 h-4 bg-[#ff5e1f] rounded-full animate-ping absolute"></div>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ff5e1f" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#ff5e1f] z-10"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
      `,
      className: 'custom-leaflet-icon-dest',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (startCoords) {
      const startMarker = L.marker(startCoords, { icon: startIcon })
        .bindPopup(`<b>Titik Keberangkatan:</b><br/>${startLocation || 'Asal'}`);
      markersGroupRef.current.addLayer(startMarker);
      markers.push(startMarker);
    }

    if (destCoords) {
      const destMarker = L.marker(destCoords, { icon: destIcon })
        .bindPopup(`<b>Tujuan:</b><br/>${destination || 'Destinasi'}`);
      markersGroupRef.current.addLayer(destMarker);
      markers.push(destMarker);
    }

    // Draw route line and calculate real-time distance
    if (startCoords && destCoords) {
      const distance = calculateHaversineDistance(
        startCoords[0], startCoords[1],
        destCoords[0], destCoords[1]
      );
      
      onDistanceCalculated(distance);

      // Create a nice routing line
      const routeLine = L.polyline([startCoords, destCoords], {
        color: '#0194f3',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 10',
        lineCap: 'round'
      }).addTo(mapRef.current);

      polylineRef.current = routeLine;

      // Fit map to markers bounds
      const bounds = L.latLngBounds([startCoords, destCoords]);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (startCoords) {
      mapRef.current.setView(startCoords, 12);
    } else if (destCoords) {
      mapRef.current.setView(destCoords, 12);
    }

  }, [startCoords, destCoords, onDistanceCalculated]);

  const selectPopular = (type: 'start' | 'dest', city: PopularCity) => {
    if (type === 'start') {
      setStartLocation(city.name);
      setStartCoords(city.coords);
    } else {
      setDestination(city.name);
      setDestCoords(city.coords);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Start Location Input */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
            Kota / Tempat Asal
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="start-location-input"
                type="text"
                placeholder="Cari kota asal... (e.g. Jakarta, Bandung)"
                value={startLocation}
                onChange={(e) => {
                  setStartLocation(e.target.value);
                  setStartCoords(null); // Reset coords to trigger search
                }}
                className="w-full text-sm py-2.5 px-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0194f3]"
              />
              {searchingStart && (
                <div className="absolute right-3 top-3">
                  <div className="w-4 h-4 border-2 border-[#0194f3] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <button
              id="search-start-btn"
              type="button"
              onClick={handleSearchStart}
              className="px-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-200 transition font-medium"
            >
              Cari
            </button>
          </div>
          
          {/* Quick choices popup */}
          {!startCoords && startLocation.length > 0 && (
            <div className="absolute z-20 w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-slate-300 divide-y divide-gray-100 dark:divide-slate-700">
              {POPULAR_CITIES.filter(c => c.name.toLowerCase().includes(startLocation.toLowerCase())).map((city) => (
                <button
                  id={`select-start-${city.name.replace(/\s+/g, '-').toLowerCase()}`}
                  key={city.name}
                  type="button"
                  onClick={() => selectPopular('start', city)}
                  className="w-full text-left py-2 px-3 hover:bg-[#0194f3]/10 hover:text-[#0194f3] font-medium block"
                >
                  📍 {city.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination Location Input */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
            Kota / Tempat Tujuan
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="dest-location-input"
                type="text"
                placeholder="Cari kota tujuan... (e.g. Surabaya, Bali)"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestCoords(null);
                }}
                className="w-full text-sm py-2.5 px-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0194f3]"
              />
              {searchingDest && (
                <div className="absolute right-3 top-3">
                  <div className="w-4 h-4 border-2 border-[#ff5e1f] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <button
              id="search-dest-btn"
              type="button"
              onClick={handleSearchDest}
              className="px-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-200 transition font-medium"
            >
              Cari
            </button>
          </div>

          {/* Quick choices popup */}
          {!destCoords && destination.length > 0 && (
            <div className="absolute z-20 w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-slate-300 divide-y divide-gray-100 dark:divide-slate-700">
              {POPULAR_CITIES.filter(c => c.name.toLowerCase().includes(destination.toLowerCase())).map((city) => (
                <button
                  id={`select-dest-${city.name.replace(/\s+/g, '-').toLowerCase()}`}
                  key={city.name}
                  type="button"
                  onClick={() => selectPopular('dest', city)}
                  className="w-full text-left py-2 px-3 hover:bg-[#ff5e1f]/10 hover:text-[#ff5e1f] font-medium block"
                >
                  📍 {city.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-950/20 py-1.5 px-3 rounded-md">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Map Container */}
      <div className="relative border border-gray-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-inner">
        <div 
          id="route-map" 
          ref={mapContainerRef} 
          style={{ height: '300px' }} 
          className="w-full bg-slate-50 dark:bg-slate-900"
        />
        
        {/* Map Overlay info */}
        {startCoords && destCoords && (
          <div className="absolute top-3 left-3 z-10 bg-white/95 dark:bg-slate-800/95 border border-gray-100 dark:border-slate-700 py-1.5 px-3 rounded-lg shadow-lg text-xs font-semibold text-gray-700 dark:text-slate-200 flex items-center gap-2 backdrop-blur-sm">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0194f3] animate-pulse"></span>
            Rute Terhitung: <span className="text-[#0194f3] text-sm font-bold">{calculateHaversineDistance(startCoords[0], startCoords[1], destCoords[0], destCoords[1])} km</span>
          </div>
        )}

        {isOffline && (
          <div className="absolute bottom-3 right-3 z-10 bg-amber-500 text-white font-semibold py-1 px-2.5 rounded-md text-[10px] uppercase tracking-wider shadow-md">
            Mode Offline: Lokasi Terbatas
          </div>
        )}
      </div>

      {/* Popular list quick hints */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
        <span className="font-semibold text-[10px] uppercase tracking-wider mr-1 text-gray-400 dark:text-slate-500">
          Rekomendasi Rute:
        </span>
        <button
          id="quick-route-jkt-bdg"
          type="button"
          onClick={() => {
            selectPopular('start', POPULAR_CITIES[0]); // Jakarta
            selectPopular('dest', POPULAR_CITIES[1]); // Bandung
          }}
          className="py-1 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-[#0194f3]/10 hover:text-[#0194f3] transition text-[11px] font-medium"
        >
          Jakarta ➔ Bandung
        </button>
        <button
          id="quick-route-sby-mlg"
          type="button"
          onClick={() => {
            selectPopular('start', POPULAR_CITIES[2]); // Surabaya
            selectPopular('dest', POPULAR_CITIES[5]); // Malang
          }}
          className="py-1 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-[#0194f3]/10 hover:text-[#0194f3] transition text-[11px] font-medium"
        >
          Surabaya ➔ Malang
        </button>
        <button
          id="quick-route-ygy-solo"
          type="button"
          onClick={() => {
            selectPopular('start', POPULAR_CITIES[3]); // Yogyakarta
            selectPopular('dest', POPULAR_CITIES[8]); // Solo
          }}
          className="py-1 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-[#0194f3]/10 hover:text-[#0194f3] transition text-[11px] font-medium"
        >
          Yogyakarta ➔ Solo
        </button>
      </div>
    </div>
  );
}
