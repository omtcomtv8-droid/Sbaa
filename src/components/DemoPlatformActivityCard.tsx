import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  DollarSign,
  Radio,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { AssetInfo, DiagnosticsInfo, SystemAuditLog } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { authFetch } from '../lib/installAuthenticatedFetch';

interface RealPlatformActivityCardProps {
  diagnostics?: DiagnosticsInfo | null;
}

interface TelemetryHealth {
  status: string;
  uptimeSeconds: number;
  activeSockets: number;
  memory?: {
    heapUsedMb: number;
  };
  stats?: {
    auditLogsStored: number;
  };
}

export const DemoPlatformActivityCard: React.FC<RealPlatformActivityCardProps> = ({
  diagnostics: propDiagnostics,
}) => {
  const { isRTL } = useLanguage();

  const [livePackets, setLivePackets] = useState<number>(() => propDiagnostics?.packetCount ?? 0);
  const [assetsCount, setAssetsCount] = useState<number>(() => propDiagnostics?.assetsCount ?? 0);
  const [latency, setLatency] = useState<number | null>(() =>
    propDiagnostics && typeof propDiagnostics.latencyMs === 'number' && propDiagnostics.latencyMs > 0
      ? propDiagnostics.latencyMs
      : null
  );
  const [ticksCount, setTicksCount] = useState<number>(() => propDiagnostics?.ticksCount ?? 0);
  const [candlesCount, setCandlesCount] = useState<number>(() => propDiagnostics?.candlesCount ?? 0);
  const [wsState, setWsState] = useState<string>(() => propDiagnostics?.subsystems?.websocket || 'disconnected');
  const [authState, setAuthState] = useState<string>(() => propDiagnostics?.subsystems?.auth || 'none');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  const [health, setHealth] = useState<TelemetryHealth | null>(null);
  const [topRealAssets, setTopRealAssets] = useState<AssetInfo[]>([]);
  const [realLogs, setRealLogs] = useState<SystemAuditLog[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchRealTelemetry = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const [statusRes, healthRes, assetsRes, logsRes] = await Promise.all([
          authFetch('/api/status').catch(() => null),
          authFetch('/api/telemetry/health').catch(() => null),
          authFetch('/api/assets').catch(() => null),
          authFetch('/api/telemetry/logs').catch(() => null),
        ]);

        if (!isMounted) return;

        if (statusRes && statusRes.ok && statusRes.headers.get('content-type')?.includes('application/json')) {
          const data = await statusRes.json().catch(() => null);
          if (data?.diagnostics) {
            const diag = data.diagnostics;
            setLivePackets(typeof diag.packetCount === 'number' ? diag.packetCount : 0);
            setAssetsCount(typeof diag.assetsCount === 'number' ? diag.assetsCount : 0);
            setTicksCount(typeof diag.ticksCount === 'number' ? diag.ticksCount : 0);
            setCandlesCount(typeof diag.candlesCount === 'number' ? diag.candlesCount : 0);
            setLatency(typeof diag.latencyMs === 'number' && diag.latencyMs > 0 ? diag.latencyMs : null);
            setWsState(diag.subsystems?.websocket || 'disconnected');
            setAuthState(diag.subsystems?.auth || 'none');
            setLastSyncTime(Date.now());
          }
        }

        if (healthRes && healthRes.ok && healthRes.headers.get('content-type')?.includes('application/json')) {
          const hData = await healthRes.json().catch(() => null);
          if (hData) setHealth(hData);
        }

        if (assetsRes && assetsRes.ok && assetsRes.headers.get('content-type')?.includes('application/json')) {
          const assetsList = await assetsRes.json().catch(() => null);
          if (Array.isArray(assetsList)) {
            const sorted = [...assetsList]
              .filter((a: AssetInfo) => a && a.active && typeof a.payout === 'number' && a.payout > 0)
              .sort((a, b) => b.payout - a.payout)
              .slice(0, 3);
            setTopRealAssets(sorted);
            if (sorted.length > 0) {
              setAssetsCount((prev) => (prev > 0 ? prev : assetsList.length));
            }
          }
        }

        if (logsRes && logsRes.ok && logsRes.headers.get('content-type')?.includes('application/json')) {
          const logsList = await logsRes.json().catch(() => null);
          if (Array.isArray(logsList)) {
            setRealLogs(logsList.slice(0, 4));
          }
        }
      } catch {
        // Keep authentic empty/last known server state on network hiccup
      }
    };

    fetchRealTelemetry();
    const interval = setInterval(fetchRealTelemetry, 20000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (propDiagnostics) {
      setLivePackets(propDiagnostics.packetCount ?? 0);
      setAssetsCount(propDiagnostics.assetsCount ?? 0);
      setTicksCount(propDiagnostics.ticksCount ?? 0);
      setCandlesCount(propDiagnostics.candlesCount ?? 0);
      if (typeof propDiagnostics.latencyMs === 'number' && propDiagnostics.latencyMs > 0) {
        setLatency(propDiagnostics.latencyMs);
      }
      setWsState(propDiagnostics.subsystems?.websocket || 'disconnected');
      setAuthState(propDiagnostics.subsystems?.auth || 'none');
    }
  }, [propDiagnostics]);

  const isBrokerLive = wsState === 'connected' && authState === 'success';
  const uptimeMinutes = health ? Math.floor(health.uptimeSeconds / 60) : null;

  return (
    <div
      id="real-platform-activity-card"
      className={`rounded-2xl sabaa-panel-emerald p-5 sm:p-6 relative overflow-hidden anti-jitter select-none ${
        isRTL ? 'text-right' : 'text-left'
      }`}
      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm text-slate-100 tracking-tight">
                {isRTL ? 'نشاط محرك المنصة اللحظي' : 'Live Platform Engine Telemetry'}
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                · 100% REAL LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isRTL
                ? 'قراءة مباشرة من خادم المنصة وقناة WebSocket للوسيط بدون أي أرقام تقديرية'
                : 'Direct readouts from platform server & broker WebSocket without estimated numbers'}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 text-[10px] font-mono tabular-nums ${
            isBrokerLive ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <CheckCircle2 className={`w-3.5 h-3.5 ${isBrokerLive ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>
            {isBrokerLive
              ? 'WebSocket Live'
              : wsState === 'connected'
              ? 'متصل — بانتظار التوثيق'
              : 'بانتظار ربط جلسة الوسيط'}
          </span>
        </div>
      </div>

      {/* Primary Metric */}
      <div className="my-5 p-4 rounded-xl sabaa-well flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Server className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{isRTL ? 'الحزم والمؤشرات المعالجة فعلياً على الخادم' : 'Real Packets & Stream State on Server'}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex rounded-full h-2.5 w-2.5 ${
                  isBrokerLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span
                className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-emerald-400 tracking-tight inline-block min-w-[3.5rem]"
              >
                {livePackets.toLocaleString()}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-300">
              {isRTL ? 'حزمة بيانات حقيقية مستلمة' : 'real packets received'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
            <span className="text-emerald-300">
              {isRTL ? `النبضات: ${ticksCount}` : `Ticks: ${ticksCount}`}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-sky-300">
              {isRTL ? `الشموع المغلقة: ${candlesCount}` : `Closed Candles: ${candlesCount}`}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-amber-300">
              {isRTL ? `الأصول المتاحة: ${assetsCount}` : `Catalog: ${assetsCount}`}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:items-end justify-center gap-1 border-t sm:border-t-0 sm:border-r border-white/[0.08] sm:pr-4 pt-2 sm:pt-0 text-[10px] font-mono tabular-nums">
          <span className="text-emerald-300 font-bold inline-flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-400" />
            {health ? `SSE Clients: ${health.activeSockets}` : 'Checking Server...'}
          </span>
          <span className="text-slate-400">
            {isRTL ? 'زمن الاستجابة' : 'Latency'}: {latency !== null ? `${latency}ms` : '—'}
            {uptimeMinutes !== null ? ` · Uptime ${uptimeMinutes}m` : ''}
          </span>
          <span className="text-slate-500">
            {lastSyncTime
              ? `${isRTL ? 'آخر تحديث:' : 'Synced:'} ${new Date(lastSyncTime).toLocaleTimeString([], { hour12: false })}`
              : isRTL
              ? 'بانتظار الاستجابة'
              : 'Connecting'}
          </span>
        </div>
      </div>

      {/* Real Broker Assets & Payouts */}
      <div className="my-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">
              {isRTL ? 'عوائد وأصول الوسيط الحقيقية الأعلى عائداً' : 'Top Live Broker Assets by Real Payout'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-semibold">
            {isRTL ? 'أرقام حقيقية' : 'Real Market Figures'}
          </span>
        </div>

        {topRealAssets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {topRealAssets.map((asset) => (
              <div
                key={asset.asset}
                className="p-3 rounded-xl sabaa-well hover:border-emerald-500/35 transition-colors flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                  <span className="font-bold truncate">{asset.label || asset.asset}</span>
                  <span className="text-[9px] font-mono font-bold text-emerald-400">REAL</span>
                </div>
                <div className="flex items-baseline justify-between my-1">
                  <span className="text-xl font-black font-mono tabular-nums text-emerald-400">
                    +{asset.payout}%
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {isRTL ? 'العائد' : 'Payout'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono tabular-nums flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                  <span>{asset.is_otc ? 'OTC Feed' : asset.type || 'Market'}</span>
                  <span>{asset.digits} {isRTL ? 'عشري' : 'digits'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl sabaa-well text-center text-xs text-slate-400">
            {isRTL
              ? 'تظهر الأصول ونسب العوائد الفعلية فور اتصال جلسة Pocket Option وتحميل كتالوج السوق الحقيقي.'
              : 'Live assets and real payout rates appear once the Pocket Option session is connected.'}
          </div>
        )}
      </div>

      {/* Real Platform Activity Feed */}
      <div className="my-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200">
              {isRTL ? 'سجل نشاط النظام الحقيقي المباشر' : 'Real Server Audit Activity'}
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">
            {isRTL ? 'سجل فعلي' : 'Live Audit'}
          </span>
        </div>

        <div className="space-y-1.5">
          {realLogs.length > 0 ? (
            realLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl sabaa-well flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{log.message}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      {log.category} · {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-emerald-400 shrink-0">REAL</span>
              </div>
            ))
          ) : (
            <div className="p-3 rounded-xl sabaa-well flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-400">
                {isRTL ? 'بانتظار استلام أحداث التدقيق من الخادم...' : 'Awaiting server audit events...'}
              </span>
              <span className="text-[10px] font-mono text-emerald-400 shrink-0">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Integrity Guarantee */}
      <div className="mt-4 pt-3.5 border-t border-white/[0.08] flex items-start gap-2.5 text-[11px] text-slate-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-emerald-400 font-semibold">تأكيد الشفافية ومصداقية البيانات:</strong>{' '}
          جميع الإحصائيات والأرقام وأنشطة النظام المعروضة في هذا القسم مستمدة 100% من محرك المنصة الفعلي،
          وبروتوكول الاتصال بالوسيط (WebSocket)، وحسابات المؤشرات الرياضية الحقيقية.
        </p>
      </div>
    </div>
  );
};
