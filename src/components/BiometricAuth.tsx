import { useState, useEffect } from 'react';

interface BiometricAuthProps {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
  mode: 'register' | 'login';
}

export default function BiometricAuth({ email, onSuccess, onCancel, mode }: BiometricAuthProps) {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (mode === 'register') {
      setStatusText('Sentuh sensor sidik jari untuk meregistrasi perangkat Anda');
    } else {
      setStatusText('Sentuh sensor sidik jari untuk masuk dengan aman');
    }
  }, [mode]);

  const startScanning = () => {
    if (scanState === 'scanning' || scanState === 'success') return;

    setScanState('scanning');
    setProgress(0);
    setStatusText('Memulai pemindaian biometrik...');

    // Simulate scanning progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 8;
        if (next >= 100) {
          clearInterval(interval);
          setScanState('success');
          setStatusText(mode === 'register' ? 'Registrasi Biometrik Berhasil!' : 'Autentikasi Berhasil!');
          
          // Trigger success after a small delay
          setTimeout(() => {
            onSuccess();
          }, 1200);
          return 100;
        }

        // Informative updates
        if (next < 30) {
          setStatusText('Memindai sidik jari...');
        } else if (next < 60) {
          setStatusText('Menganalisis pola dermatoglif...');
        } else if (next < 85) {
          setStatusText('Mencocokkan dengan kunci enkripsi aman...');
        } else {
          setStatusText('Menyelesaikan verifikasi enkripsi...');
        }

        return next;
      });
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 text-center space-y-6">
        
        {/* Header decoration */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mb-5"></div>
          <span className="text-[10px] tracking-widest font-extrabold text-[#0194f3] uppercase">
            TRAVELOKA SECURE LINK
          </span>
          <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 mt-1">
            {mode === 'register' ? 'Registrasi Sidik Jari / Wajah' : 'Masuk dengan Biometrik'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 px-4">
            Mengamankan akses akun <span className="font-semibold text-gray-700 dark:text-slate-300">{email}</span> menggunakan modul pengaman bawaan perangkat Anda.
          </p>
        </div>

        {/* Biometric Interactive Scanner Ring */}
        <div className="flex justify-center py-4">
          <button
            id="biometric-fingerprint-sensor"
            onClick={startScanning}
            disabled={scanState === 'scanning' || scanState === 'success'}
            className={`group relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              scanState === 'scanning'
                ? 'bg-blue-50 dark:bg-blue-950/20 scale-105'
                : scanState === 'success'
                ? 'bg-green-50 dark:bg-green-950/20 scale-105 border-2 border-green-500'
                : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-[#0194f3]'
            }`}
          >
            {/* Concentric rotating glowing rings */}
            {scanState === 'scanning' && (
              <>
                <div className="absolute inset-0 border-4 border-t-[#0194f3] border-r-transparent border-l-transparent border-b-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-3 border-2 border-b-[#ff5e1f] border-r-transparent border-l-transparent border-t-transparent rounded-full animate-spin [animation-direction:reverse]"></div>
                <div className="absolute inset-0 bg-[#0194f3]/10 rounded-full animate-pulse"></div>
              </>
            )}

            {/* Radial progress ring */}
            {scanState === 'scanning' && (
              <svg className="absolute inset-0 -rotate-90 w-full h-full">
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  className="stroke-gray-100 dark:stroke-slate-800"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  className="stroke-[#0194f3] transition-all duration-150"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 58}
                  strokeDashoffset={2 * Math.PI * 58 * (1 - progress / 100)}
                />
              </svg>
            )}

            {/* Fingerprint / Checkmark Icon */}
            <div className={`transition-all duration-300 ${
              scanState === 'success' ? 'text-green-500 scale-110' : scanState === 'scanning' ? 'text-[#0194f3]' : 'text-gray-400 group-hover:text-[#0194f3]'
            }`}>
              {scanState === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/>
                  <path d="M12 6a6 6 0 0 1 6 6v3"/>
                  <path d="M6 15v-3a6 6 0 0 1 3.2-5.3"/>
                  <path d="M9 18v-3a3 3 0 0 1 6 0v3"/>
                  <path d="M12 12h.01"/>
                </svg>
              )}
            </div>

            {/* Scanning radar sweep bar */}
            {scanState === 'scanning' && (
              <div 
                className="absolute left-4 right-4 h-1.5 bg-[#0194f3] rounded-full blur-[1px] opacity-80"
                style={{
                  top: `${15 + (progress / 100) * 70}%`,
                  transition: 'top 150ms linear'
                }}
              />
            )}
          </button>
        </div>

        {/* Status texts */}
        <div className="space-y-1">
          <div className={`text-xs font-bold ${
            scanState === 'success' ? 'text-green-600' : scanState === 'failed' ? 'text-red-500' : 'text-gray-700 dark:text-slate-300'
          }`}>
            {statusText}
          </div>
          {scanState === 'scanning' && (
            <div className="text-[10px] font-mono font-semibold text-[#0194f3]">
              {progress}% SELESAI
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="pt-2 flex gap-3">
          <button
            id="biometric-cancel-btn"
            type="button"
            onClick={onCancel}
            disabled={scanState === 'scanning' || scanState === 'success'}
            className="flex-1 py-2.5 px-4 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-gray-500 dark:text-slate-300 transition border border-gray-100 dark:border-slate-800 disabled:opacity-40"
          >
            Batalkan
          </button>
          
          {scanState === 'idle' && (
            <button
              id="biometric-scan-start-btn"
              type="button"
              onClick={startScanning}
              className="flex-1 py-2.5 px-4 bg-[#0194f3] hover:bg-[#017ece] text-white text-xs font-bold rounded-xl transition shadow-md"
            >
              Mulai Pindai
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
