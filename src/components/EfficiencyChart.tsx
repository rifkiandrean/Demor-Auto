import { useState } from 'react';
import { TripRecord } from '../types';

interface EfficiencyChartProps {
  trips: TripRecord[];
}

export default function EfficiencyChart({ trips }: EfficiencyChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // We need at least 1 trip to render a chart.
  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 text-center p-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Belum ada data perjalanan untuk grafik.</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Catat perjalanan Anda untuk melihat efisiensi bahan bakar.</p>
      </div>
    );
  }

  // Reverse to chronological order for line graph representation
  const chronTrips = [...trips].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate efficiency for each trip (km / Liter)
  const data = chronTrips.map(t => {
    // litters estimation from fuelCost if fuelLiters is not recorded
    const liters = t.fuelLiters || (t.fuelCost / 13000) || 1; // fallback to 1 to avoid Division by Zero
    const efficiency = parseFloat((t.distance / liters).toFixed(2));
    return {
      date: t.date,
      efficiency,
      distance: t.distance,
      destination: t.destination
    };
  });

  const efficiencies = data.map(d => d.efficiency);
  const maxEff = Math.max(...efficiencies, 15); // baseline max 15 km/L
  const minEff = Math.max(0, Math.min(...efficiencies) - 2);

  const padding = 40;
  const chartHeight = 160;
  const chartWidth = 500;

  // Generate SVG coordinates for line path
  const points = data.map((d, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (chartWidth - padding * 2);
    // invert Y for SVG coordinate system
    const yRange = maxEff - minEff || 1;
    const y = chartHeight - padding - ((d.efficiency - minEff) / yRange) * (chartHeight - padding * 2);
    return { x, y, ...d };
  });

  // SVG Line path string
  let linePath = '';
  let areaPath = '';
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-slate-100">Grafik Efisiensi Bahan Bakar</h4>
          <p className="text-xs text-gray-500 dark:text-slate-400">Efisiensi dalam kilometer per liter (km/L) berdasarkan riwayat perjalanan</p>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-[#0194f3]">
          km/L
        </span>
      </div>

      <div className="relative">
        <svg 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          className="w-full overflow-visible"
        >
          {/* Gradients */}
          <defs>
            <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0194f3" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0194f3" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="chart-line-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0194f3" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line 
            x1={padding} y1={padding} 
            x2={chartWidth - padding} y2={padding} 
            stroke="currentColor" className="text-gray-100 dark:text-slate-700/60" strokeDasharray="3,3" 
          />
          <line 
            x1={padding} y1={(chartHeight) / 2} 
            x2={chartWidth - padding} y2={(chartHeight) / 2} 
            stroke="currentColor" className="text-gray-100 dark:text-slate-700/60" strokeDasharray="3,3" 
          />
          <line 
            x1={padding} y1={chartHeight - padding} 
            x2={chartWidth - padding} y2={chartHeight - padding} 
            stroke="currentColor" className="text-gray-100 dark:text-slate-700/60" 
          />

          {/* Y Axis Labels */}
          <text x={padding - 10} y={padding + 4} textAnchor="end" className="text-[10px] font-semibold fill-gray-400 dark:fill-slate-500">
            {maxEff.toFixed(1)}
          </text>
          <text x={padding - 10} y={(chartHeight) / 2 + 4} textAnchor="end" className="text-[10px] font-semibold fill-gray-400 dark:fill-slate-500">
            {((maxEff + minEff) / 2).toFixed(1)}
          </text>
          <text x={padding - 10} y={chartHeight - padding + 4} textAnchor="end" className="text-[10px] font-semibold fill-gray-400 dark:fill-slate-500">
            {minEff.toFixed(1)}
          </text>

          {/* Gradient area */}
          {points.length > 1 && (
            <path d={areaPath} fill="url(#chart-area-grad)" />
          )}

          {/* Main line path */}
          {points.length > 1 ? (
            <path 
              d={linePath} 
              fill="none" 
              stroke="url(#chart-line-grad)" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          ) : points.length === 1 ? (
            <circle cx={points[0].x} cy={points[0].y} r="6" fill="#0194f3" />
          ) : null}

          {/* Data Points and Interactivity */}
          {points.map((p, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <g key={idx}>
                <circle 
                  cx={p.x} 
                  cy={p.y} 
                  r={isHovered ? "7" : "4.5"} 
                  fill={isHovered ? "#ff5e1f" : "#ffffff"} 
                  stroke={isHovered ? "#ffffff" : "#0194f3"} 
                  strokeWidth={isHovered ? "2.5" : "3"} 
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                
                {/* Horizontal guide lines on hover */}
                {isHovered && (
                  <>
                    <line 
                      x1={padding} y1={p.y} 
                      x2={chartWidth - padding} y2={p.y} 
                      stroke="#ff5e1f" strokeOpacity="0.4" strokeDasharray="2,2" 
                    />
                    <line 
                      x1={p.x} y1={padding} 
                      x2={p.x} y2={chartHeight - padding} 
                      stroke="#ff5e1f" strokeOpacity="0.4" strokeDasharray="2,2" 
                    />
                  </>
                )}

                {/* X Axis Date labels (sparse) */}
                {(idx === 0 || idx === points.length - 1 || (points.length > 3 && idx === Math.floor(points.length / 2))) && (
                  <text 
                    x={p.x} 
                    y={chartHeight - padding + 15} 
                    textAnchor="middle" 
                    className="text-[9px] font-medium fill-gray-400 dark:fill-slate-500"
                  >
                    {new Date(p.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && (
          <div 
            className="absolute z-10 bg-slate-900/95 dark:bg-slate-950/95 text-white p-2.5 rounded-xl shadow-xl border border-slate-800 text-xs pointer-events-none transition-all"
            style={{
              left: `${(points[hoveredIndex].x / chartWidth) * 100}%`,
              top: `${Math.max(0, (points[hoveredIndex].y / chartHeight) * 100 - 45)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-semibold text-gray-300">
              {new Date(points[hoveredIndex].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff5e1f]"></span>
              <span>Ke: <strong className="text-white">{points[hoveredIndex].destination}</strong></span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 pt-1 border-t border-slate-800 text-[11px]">
              <div>Efisiensi: <strong className="text-[#0194f3]">{points[hoveredIndex].efficiency} km/L</strong></div>
              <div>Jarak: <strong className="text-[#ff5e1f]">{points[hoveredIndex].distance} km</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Average summary row */}
      {data.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/60 text-center">
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Efisiensi Rata-rata</div>
            <div className="text-base font-extrabold text-[#0194f3] mt-0.5">
              {(data.reduce((sum, d) => sum + d.efficiency, 0) / data.length).toFixed(2)} <span className="text-xs font-semibold">km/L</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Efisiensi Terbaik</div>
            <div className="text-base font-extrabold text-[#22c55e] mt-0.5">
              {Math.max(...efficiencies).toFixed(2)} <span className="text-xs font-semibold">km/L</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Total Perjalanan</div>
            <div className="text-base font-extrabold text-gray-800 dark:text-slate-100 mt-0.5">
              {trips.length} <span className="text-xs font-semibold">Trip</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
