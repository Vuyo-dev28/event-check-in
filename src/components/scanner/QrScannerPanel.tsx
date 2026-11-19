import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, QrCode, Search, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';

interface EventOption {
  id: number;
  name: string;
  dateText?: string;
  status?: string;
}

interface ScanOutcome {
  status: string;
  message: string;
  ticket?: any;
  record?: any;
}

function playBeep(success: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 880 : 240, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {}
}

export default function QrScannerPanel({
  events,
  businessId,
  initialEventId,
}: {
  events: EventOption[];
  businessId?: number;
  initialEventId?: number;
}) {
  const [selectedEventId, setSelectedEventId] = useState<number>(initialEventId || events[0]?.id || 0);
  const [entrance, setEntrance] = useState('Main Gate');
  const [scannerName, setScannerName] = useState('Gate Terminal A');
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const params = new URLSearchParams();
    if (businessId) params.set('businessId', String(businessId));
    if (selectedEventId) params.set('eventId', String(selectedEventId));
    const res = await apiFetch<any[]>(`/api/scanner/logs?${params.toString()}`);
    if (res.ok && Array.isArray(res.data)) {
      setLogs(res.data);
    }
    setLoadingLogs(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [businessId, selectedEventId]);

  const submitScan = async (payload: { token?: string; ticketNumber?: string }) => {
    if (!selectedEventId) {
      setOutcome({ status: 'INVALID', message: 'Select an active event before scanning.' });
      return;
    }
    setScanning(true);
    const res = await apiFetch<ScanOutcome>('/api/scanner/scan', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        eventId: selectedEventId,
        entrance,
        scannerName,
      }),
    });
    setScanning(false);

    if (!res.ok) {
      playBeep(false);
      setOutcome({ status: 'INVALID', message: (res.data as any)?.error || 'Scan validation failed.' });
      return;
    }

    playBeep(res.data.status === 'VALID');
    setOutcome(res.data);
    fetchLogs();
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported in this browser. Use manual ticket or QR token lookup below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          scanLoop();
        }
      });
    } catch (err: any) {
      setCameraError(err?.message || 'Camera permission denied or unavailable. Use manual lookup below.');
    }
  };

  const scanLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          const now = Date.now();
          if (code.data !== lastScannedRef.current.token || now - lastScannedRef.current.at > 3500) {
            lastScannedRef.current = { token: code.data, at: now };
            submitScan({ token: code.data });
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualInput.trim();
    if (!val) return;
    if (val.toUpperCase().startsWith('TKT-')) {
      submitScan({ ticketNumber: val.toUpperCase() });
    } else {
      submitScan({ token: val });
    }
    setManualInput('');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Scanner Console */}
        <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">Gate Check-In Scanner</h2>
              <p className="text-xs text-muted-foreground">
                Verify QR passes using your camera or enter a ticket reference manually.
              </p>
            </div>
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                cameraActive
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary text-primary-foreground hover:brightness-95'
              }`}
            >
              {cameraActive ? <CameraOff size={15} /> : <Camera size={15} />}
              {cameraActive ? 'Stop Camera' : 'Start Camera Scanner'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">Active Event *</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                className="onboarding-input text-xs py-2"
              >
                {events.length === 0 && <option value={0}>No events available</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">Gate / Entrance</label>
              <input
                type="text"
                value={entrance}
                onChange={(e) => setEntrance(e.target.value)}
                className="onboarding-input text-xs py-2"
                placeholder="Main Gate"
              />
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">Device / Lane</label>
              <input
                type="text"
                value={scannerName}
                onChange={(e) => setScannerName(e.target.value)}
                className="onboarding-input text-xs py-2"
                placeholder="Gate Terminal A"
              />
            </div>
          </div>

          {cameraError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-800 dark:text-amber-300">
              {cameraError}
            </div>
          )}

          <div className="relative overflow-hidden rounded-xl border border-border bg-[#11100F] text-[#F2ECE1] aspect-video flex items-center justify-center">
            {cameraActive ? (
              <>
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-44 w-44 rounded-2xl border-2 border-primary/90 relative overflow-hidden">
                    <div className="scan-sweep h-1 w-full bg-primary/80" />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-2">
                <QrCode className="mx-auto h-10 w-10 text-primary opacity-90" />
                <p className="font-display text-xl font-extrabold uppercase tracking-tight">Camera Standby</p>
                <p className="text-[11px] opacity-75 max-w-xs">
                  Click "Start Camera Scanner" to decode live attendee QR codes, or enter a token/ticket code below.
                </p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter Ticket Number (e.g. TKT-...) or QR verification token"
                className="onboarding-input pl-9 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={scanning || !manualInput.trim()}
              className="rounded-xl bg-secondary px-5 py-2.5 text-xs font-bold text-secondary-foreground hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              {scanning ? 'Checking...' : 'Validate Ticket'}
            </button>
          </form>
        </div>

        {/* Live Scan Outcome */}
        <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Latest Scan Result</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Atomic database admission check</p>
          </div>

          {!outcome ? (
            <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
              <QrCode size={28} className="text-muted-foreground mb-2" />
              <p className="text-xs font-semibold text-foreground">Awaiting First Scan</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Every valid scan marks the ticket as checked in atomically to prevent duplicate entry.
              </p>
            </div>
          ) : (
            <div
              className={`flex-1 rounded-xl border p-5 space-y-4 pop-in ${
                outcome.status === 'VALID'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : outcome.status === 'CHECKED_IN'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-destructive/40 bg-destructive/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {outcome.status === 'VALID' ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
                ) : outcome.status === 'CHECKED_IN' ? (
                  <AlertTriangle className="h-7 w-7 text-amber-600 shrink-0" />
                ) : (
                  <XCircle className="h-7 w-7 text-destructive shrink-0" />
                )}
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {outcome.status === 'VALID'
                      ? 'Admitted'
                      : outcome.status === 'CHECKED_IN'
                        ? 'Already Checked In'
                        : outcome.status}
                  </span>
                  <p className="text-sm font-extrabold text-foreground mt-0.5">{outcome.message}</p>
                </div>
              </div>

              {outcome.ticket && (
                <div className="rounded-lg bg-card/80 border border-border p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Attendee</span>
                    <span className="font-bold text-foreground">{outcome.ticket.attendeeName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket No.</span>
                    <span className="font-mono font-bold text-foreground">{outcome.ticket.ticketNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tier</span>
                    <span className="font-semibold text-foreground">{outcome.ticket.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Event</span>
                    <span className="font-semibold text-foreground">{outcome.ticket.eventName}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Real DB Check-in Logs */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Check-In Gate Log</h3>
            <p className="text-xs text-muted-foreground">Real-time persisted verification attempts</p>
          </div>
          <button
            type="button"
            onClick={fetchLogs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
          >
            <RefreshCw size={13} className={loadingLogs ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Attendee</th>
                <th className="px-4 py-3">Ticket #</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Gate / Staff</th>
                <th className="px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No gate scans recorded yet for this selection.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                      {log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">{log.attendeeName}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{log.ticketNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.ticketType}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.entrance} · {log.staffName}
                    </td>
                    <td className="px-4 py-3 font-bold">
                      <span
                        className={
                          log.status === 'VALID'
                            ? 'text-emerald-600'
                            : log.status === 'CHECKED_IN'
                              ? 'text-amber-600'
                              : 'text-destructive'
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
