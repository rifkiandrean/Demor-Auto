import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TripRecord, ServiceRecord, VehicleInfo } from '../types';

interface ReportPDFProps {
  vehicle: VehicleInfo | null;
  trips: TripRecord[];
  services: ServiceRecord[];
}

export default function ReportPDF({ vehicle, trips, services }: ReportPDFProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [generating, setGenerating] = useState(false);

  // Extract year and month
  const [year, month] = selectedMonth.split('-');
  const monthNameIndonesian = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ][parseInt(month) - 1];

  // Filter records for the selected month
  const filteredTrips = trips.filter(t => t.date.startsWith(selectedMonth));
  const filteredServices = services.filter(s => s.date.startsWith(selectedMonth));

  // Compute metrics
  const totalDistance = filteredTrips.reduce((sum, t) => sum + t.distance, 0);
  const totalDuration = filteredTrips.reduce((sum, t) => sum + t.duration, 0);
  const totalFuelCost = filteredTrips.reduce((sum, t) => sum + t.fuelCost, 0);
  const totalFuelLiters = filteredTrips.reduce((sum, t) => {
    const liters = t.fuelLiters || (t.fuelCost / 13000); // 13k/L as fallback
    return sum + (isNaN(liters) ? 0 : liters);
  }, 0);

  const avgEfficiency = totalFuelLiters > 0 
    ? parseFloat((totalDistance / totalFuelLiters).toFixed(2)) 
    : 0;

  const totalServiceCost = filteredServices.reduce((sum, s) => sum + s.cost, 0);

  // Format currency helper
  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('report-pdf-template');
    if (!element) return;

    setGenerating(true);
    // temporarily unhide or render in a high-resolution canvas friendly state
    element.style.display = 'block';

    try {
      // Small timeout to let elements render completely
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        scale: 2, // High resolution capture
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Laporan_Pemakaian_Mobil_${selectedMonth}.pdf`);
    } catch (e) {
      console.error('PDF Generation failed:', e);
    } finally {
      element.style.display = 'none';
      setGenerating(false);
    }
  };

  // Generate unique months from all trips for user selection
  const availableMonths = Array.from(new Set([
    ...trips.map(t => t.date.substring(0, 7)),
    ...services.map(s => s.date.substring(0, 7)),
    selectedMonth
  ])).sort().reverse();

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-slate-100">Unduh Laporan Bulanan (PDF)</h4>
          <p className="text-xs text-gray-500 dark:text-slate-400">Generate invoice rincian pemakaian, biaya BBM, efisiensi, dan servis secara detail</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            id="report-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs py-2 px-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0194f3] text-gray-700 dark:text-slate-200"
          >
            {availableMonths.map(m => {
              const [y, mn] = m.split('-');
              const mName = [
                'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
              ][parseInt(mn) - 1];
              return (
                <option key={m} value={m}>
                  {mName} {y}
                </option>
              );
            })}
          </select>

          <button
            id="download-pdf-btn"
            onClick={handleDownloadPDF}
            disabled={generating}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#ff5e1f] hover:bg-[#e04a0e] text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md transition disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Menyusun PDF...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Unduh Laporan PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* RENDER-ONLY HIDDEN PRINTING TEMPLATE (A4 Styled, Beautiful Traveloka look) */}
      <div 
        id="report-pdf-template" 
        style={{ display: 'none', width: '794px', minHeight: '1123px', fontFamily: '"Outfit", sans-serif' }}
        className="bg-white p-10 text-slate-800"
      >
        {/* Header Block (Traveloka Style Blue Accent) */}
        <div className="border-b-4 border-[#0194f3] pb-6 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 text-[#0194f3]">
                {/* Custom Traveloka style icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                <span className="font-extrabold text-2xl tracking-tight uppercase">DEMOR<span className="text-[#ff5e1f] font-medium text-lg uppercase">AUTO</span></span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">Layanan Manajemen Operasional Armada Mobil Mandiri</p>
            </div>
            <div className="text-right">
              <h1 className="font-extrabold text-xl text-gray-900 uppercase tracking-tight">LAPORAN BULANAN</h1>
              <p className="text-xs font-bold text-[#0194f3] mt-1">{monthNameIndonesian} {year}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">ID Dokumen: AUTO-{year}{month}-{Math.floor(1000 + Math.random() * 9000)}</p>
            </div>
          </div>
        </div>

        {/* Info Rows */}
        <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-5 rounded-xl border border-slate-100">
          <div>
            <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">IDENTITAS KENDARAAN</h5>
            {vehicle ? (
              <div className="space-y-1 text-xs">
                <div>Nama Armada: <strong className="text-gray-900 text-sm font-bold">{vehicle.brand} {vehicle.model}</strong></div>
                <div>Nomor Plat: <strong className="text-[#0194f3] font-bold">{vehicle.licensePlate}</strong></div>
                <div>Bahan Bakar: <strong className="text-gray-700">{vehicle.fuelType}</strong></div>
                <div>Odometer Terkini: <strong className="text-gray-700">{vehicle.currentOdometer.toLocaleString('id-ID')} km</strong></div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic">Armada mobil belum dikonfigurasi.</div>
            )}
          </div>
          <div>
            <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">RINGKASAN OPERASIONAL</h5>
            <div className="space-y-1 text-xs">
              <div>Total Perjalanan: <strong className="text-gray-900 font-bold">{filteredTrips.length} kali perjalanan</strong></div>
              <div>Rata-rata Efisiensi: <strong className="text-green-600 font-bold">{avgEfficiency > 0 ? `${avgEfficiency} km/Liter` : 'N/A'}</strong></div>
              <div>Oleh Pengguna: <strong className="text-gray-700">rifkiandrean@gmail.com</strong></div>
              <div>Dicetak Pada: <strong className="text-gray-500">{new Date().toLocaleString('id-ID')}</strong></div>
            </div>
          </div>
        </div>

        {/* Highlights Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="border border-slate-100 p-4 rounded-xl text-center bg-white shadow-sm">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Jarak Tempuh</div>
            <div className="text-lg font-extrabold text-[#0194f3] mt-1">{totalDistance.toLocaleString('id-ID')} km</div>
          </div>
          <div className="border border-slate-100 p-4 rounded-xl text-center bg-white shadow-sm">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Durasi</div>
            <div className="text-lg font-extrabold text-[#0194f3] mt-1">{totalDuration} menit</div>
          </div>
          <div className="border border-slate-100 p-4 rounded-xl text-center bg-white shadow-sm">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Biaya BBM</div>
            <div className="text-lg font-extrabold text-[#ff5e1f] mt-1">{formatIDR(totalFuelCost)}</div>
          </div>
          <div className="border border-slate-100 p-4 rounded-xl text-center bg-white shadow-sm">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Biaya Servis</div>
            <div className="text-lg font-extrabold text-gray-800 mt-1">{formatIDR(totalServiceCost)}</div>
          </div>
        </div>

        {/* Table 1: Perjalanan */}
        <div className="mb-8">
          <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider mb-3 border-l-4 border-[#0194f3] pl-2">
            RIWAYAT PERJALANAN & KONSUMSI BBM ({filteredTrips.length})
          </h4>
          {filteredTrips.length > 0 ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 rounded-l-lg">Tanggal</th>
                  <th className="py-2.5 px-3">Rute (Asal ➔ Tujuan)</th>
                  <th className="py-2.5 px-3 text-right">Jarak</th>
                  <th className="py-2.5 px-3 text-right">Durasi</th>
                  <th className="py-2.5 px-3 text-right">Biaya BBM</th>
                  <th className="py-2.5 px-3 text-right rounded-r-lg">Efisiensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.map((trip) => {
                  const liters = trip.fuelLiters || (trip.fuelCost / 13000);
                  const eff = liters > 0 ? (trip.distance / liters).toFixed(1) : 'N/A';
                  return (
                    <tr key={trip.id} className="text-gray-700 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-semibold">{new Date(trip.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                      <td className="py-2.5 px-3 font-medium">{trip.origin} ➔ {trip.destination}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">{trip.distance} km</td>
                      <td className="py-2.5 px-3 text-right text-gray-500">{trip.duration} m</td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#ff5e1f]">{formatIDR(trip.fuelCost)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-green-600">{eff} km/L</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-gray-400 italic py-4 border border-dashed border-gray-100 rounded-lg text-center">
              Tidak ada riwayat perjalanan tercatat pada bulan ini.
            </div>
          )}
        </div>

        {/* Table 2: Servis */}
        <div className="mb-8">
          <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider mb-3 border-l-4 border-[#ff5e1f] pl-2">
            RIWAYAT PERAWATAN & SERVIS rutin ({filteredServices.length})
          </h4>
          {filteredServices.length > 0 ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 rounded-l-lg">Tanggal</th>
                  <th className="py-2.5 px-3">Jenis Servis</th>
                  <th className="py-2.5 px-3 text-right">Odometer</th>
                  <th className="py-2.5 px-3 text-right">Biaya</th>
                  <th className="py-2.5 px-3 text-right">Servis Berikutnya</th>
                  <th className="py-2.5 px-3 text-right rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredServices.map((service) => (
                  <tr key={service.id} className="text-gray-700">
                    <td className="py-2.5 px-3 font-semibold">{new Date(service.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{service.serviceType}</td>
                    <td className="py-2.5 px-3 text-right">{service.currentOdometer.toLocaleString('id-ID')} km</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#ff5e1f]">{formatIDR(service.cost)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500 font-medium">
                      {service.nextServiceOdometer ? `${service.nextServiceOdometer.toLocaleString('id-ID')} km` : ''} 
                      {service.nextServiceDate ? ` / ${new Date(service.nextServiceDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : ''}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-block py-0.5 px-2 rounded-full text-[9px] font-bold ${
                        service.status === 'Selesai' 
                          ? 'bg-green-50 text-green-600 border border-green-200' 
                          : 'bg-amber-50 text-amber-600 border border-amber-200'
                      }`}>
                        {service.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-gray-400 italic py-4 border border-dashed border-gray-100 rounded-lg text-center">
              Tidak ada jadwal servis atau perawatan yang dicatat pada bulan ini.
            </div>
          )}
        </div>

        {/* Footer info/Disclaimer */}
        <div className="mt-12 pt-6 border-t border-dashed border-gray-200 text-center text-[10px] text-gray-400">
          <p>Dokumen ini dihasilkan secara otomatis oleh sistem Demor Auto dengan sinkronisasi Firebase & dukungan Mode Offline.</p>
          <p className="mt-1">© 2026 demorauto. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
