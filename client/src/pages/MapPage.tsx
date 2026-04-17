import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Navigation, Battery, Clock, AlertTriangle, PauseCircle, PlayCircle,
  HandHeart, GraduationCap, X, MapPin, Zap, Eye, EyeOff, Radio, LocateOff,
} from "lucide-react";
import { haptics } from "@/lib/haptics";
import type { Profile, Location } from "@shared/schema";

interface MemberLocation {
  profile: Profile;
  location: Location | null;
  locationPaused: boolean;
}

function formatTimeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins}m fa`;
  return `${Math.floor(mins / 60)}h fa`;
}

function calcDistance(c1: GeolocationCoordinates, c2: GeolocationCoordinates) {
  const R = 6371000;
  const dLat = (c2.latitude - c1.latitude) * Math.PI / 180;
  const dLon = (c2.longitude - c1.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(c1.latitude * Math.PI / 180) * Math.cos(c2.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapPage({ isActive = true }: { isActive?: boolean }) {
  const { profile: myProfile } = useAuth();
  const { toast } = useToast();
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const circlesRef = useRef<Map<string, any>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const isMovingRef = useRef(false);

  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused]     = useState(myProfile?.locationPaused || false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinPlace, setCheckinPlace] = useState("");
  const [selected, setSelected]     = useState<MemberLocation | null>(null);
  const [geoStatus, setGeoStatus]   = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");

  const { data: members, isLoading } = useQuery<MemberLocation[]>({
    queryKey: ["/api/family/locations"],
    refetchInterval: 10000,
  });

  const { data: profileSettingsData } = useQuery<any>({ queryKey: ["/api/profile/settings"] });
  const isSchoolMode = profileSettingsData?.schoolModeEnabled && (() => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fH, fM] = (profileSettingsData.schoolModeFrom || "08:00").split(":").map(Number);
    const [tH, tM] = (profileSettingsData.schoolModeTo || "13:30").split(":").map(Number);
    return cur >= fH * 60 + fM && cur <= tH * 60 + tM;
  })();

  // ── Mutations ───────────────────────────────────────────────────────────
  const quickCheckinMutation = useMutation({
    mutationFn: (placeName: string) => new Promise<any>((resolve, reject) => {
      const post = (extra: object = {}) => apiRequest("POST", "/api/checkins", { placeName, ...extra }).then(resolve).catch(reject);
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(
            p => post({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => post(), { timeout: 4000 }
          )
        : post();
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/mine"] });
      toast({ title: `Check-in: ${checkinPlace} ✅ +${data.pointsEarned}⭐`, description: data.streak > 1 ? `Serie: ${data.streak}!` : undefined });
      setShowCheckin(false); setCheckinPlace("");
    },
    onError: () => toast({ title: "Errore check-in", variant: "destructive" }),
  });

  const updateLocationMutation = useMutation({
    mutationFn: (coords: { lat: number; lng: number; accuracy: number; speed?: number; isMoving?: boolean }) =>
      apiRequest("POST", "/api/locations", coords),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/family/locations"] }),
  });

  const pauseMutation = useMutation({
    mutationFn: (pause: boolean) => apiRequest("POST", pause ? "/api/location/pause" : "/api/location/resume", {}),
    onSuccess: (_, pause) => {
      setIsPaused(pause);
      queryClient.invalidateQueries({ queryKey: ["/api/family/locations"] });
      toast({ title: pause ? "Posizione in pausa" : "Posizione ripresa" });
    },
  });

  const sosMutation = useMutation({
    mutationFn: (coords: { lat: number; lng: number }) => apiRequest("POST", "/api/sos", coords),
    onSuccess: () => toast({ title: "🆘 SOS inviato!", description: "La tua posizione è stata condivisa." }),
    onError: (e: Error) => toast({ title: "SOS fallito", description: e.message, variant: "destructive" }),
  });

  // ── Init Leaflet ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    let cancelled = false;
    const load = async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      leafletMap.current = L.map(mapRef.current, {
        center: [41.9028, 12.4964],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });
      L.control.zoom({ position: "topright" }).addTo(leafletMap.current);
      L.control.attribution({ position: "bottomleft", prefix: "" }).addTo(leafletMap.current);

      // Mapbox Streets tile layer (256px tiles for native Leaflet compat)
      const mbToken = import.meta.env.VITE_MAPBOX_TOKEN || "";
      L.tileLayer("https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=" + mbToken, {
        attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> · © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        maxZoom: 20,
      }).addTo(leafletMap.current);

    };
    load();
    return () => {
      cancelled = true;
      if (leafletMap.current) {
        try { leafletMap.current.stop(); } catch (_) {}
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // ── Re-render tiles when map becomes visible again after display:none ────
  useEffect(() => {
    if (isActive && leafletMap.current) {
      // Small delay allows the browser to update layout before invalidating
      const t = setTimeout(() => leafletMap.current?.invalidateSize(), 150);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  // ── Cleanup geolocation watch on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // ── Update markers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMap.current || !members) return;
    const updateMarkers = async () => {
      const L = (await import("leaflet")).default;
      const valid = members.filter(m => m.location && !m.locationPaused);
      const bounds: [number, number][] = [];

      valid.forEach(m => {
        const loc = m.location!;
        const color = m.profile.colorHex || "#3B82F6";
        bounds.push([loc.lat, loc.lng]);

        const moving = loc.isMoving;
        const pulse = moving
          ? `<span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};opacity:0.5;animation:mapPulse 1.5s ease-out infinite;"></span>`
          : "";

        const html = `
          <div style="position:relative;width:42px;height:42px;">
            ${pulse}
            <div style="
              width:42px;height:42px;border-radius:50%;
              background:${color};
              border:3px solid white;
              box-shadow:0 2px 12px rgba(0,0,0,0.18),0 0 0 1px ${color}22;
              display:flex;align-items:center;justify-content:center;
              font-size:16px;font-weight:700;color:white;
              font-family:system-ui;
              cursor:pointer;
            ">${m.profile.name.charAt(0)}</div>
          </div>`;

        const icon = L.divIcon({ html, className: "", iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -28] });

        const existing = markersRef.current.get(m.profile.id);
        if (existing) {
          existing.setLatLng([loc.lat, loc.lng]);
          existing.setIcon(icon);
        } else {
          const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(leafletMap.current);
          marker.on("click", () => setSelected(m));
          markersRef.current.set(m.profile.id, marker);
        }

        if (loc.accuracy) {
          const existingCircle = circlesRef.current.get(m.profile.id);
          if (existingCircle) {
            existingCircle.setLatLng([loc.lat, loc.lng]);
            existingCircle.setRadius(loc.accuracy);
          } else {
            const circle = L.circle([loc.lat, loc.lng], {
              radius: loc.accuracy,
              color: color,
              fillColor: color,
              fillOpacity: 0.07,
              weight: 1,
              opacity: 0.35,
            }).addTo(leafletMap.current);
            circlesRef.current.set(m.profile.id, circle);
          }
        }
      });

      markersRef.current.forEach((marker, id) => {
        if (!valid.find(m => m.profile.id === id)) {
          marker.remove(); markersRef.current.delete(id);
          circlesRef.current.get(id)?.remove(); circlesRef.current.delete(id);
        }
      });

      if (bounds.length === 1) leafletMap.current.setView(bounds[0], 15, { animate: true });
      else if (bounds.length > 1) leafletMap.current.fitBounds(bounds, { padding: [60, 60], animate: true });
    };
    updateMarkers();
  }, [members]);

  // ── Check geolocation permission on mount ───────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then(status => {
        setGeoStatus(status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "unknown");
        status.onchange = () => setGeoStatus(status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "unknown");
      }).catch(() => {});
    }
  }, []);

  // ── Tracking ─────────────────────────────────────────────────────────────
  const lastPosRef = useRef<GeolocationPosition | null>(null);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      toast({ title: "GPS non supportato", description: "Il tuo browser non supporta la geolocalizzazione.", variant: "destructive" }); return;
    }
    haptics.medium();
    setIsTracking(true);

    const onPosition = (pos: GeolocationPosition) => {
      setGeoStatus("granted");
      const speed = pos.coords.speed || 0;
      const moving = speed > 0.5 || (lastPosRef.current ? calcDistance(lastPosRef.current.coords, pos.coords) > 20 : false);
      isMovingRef.current = moving;
      lastPosRef.current = pos;
      updateLocationMutation.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed, isMoving: moving });
      if (leafletMap.current) {
        leafletMap.current.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true });
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setGeoStatus("denied");
        setIsTracking(false);
        if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        toast({
          title: "Posizione non autorizzata",
          description: "Abilita il GPS nelle impostazioni del browser, poi premi 'Condividi' di nuovo.",
          variant: "destructive",
        });
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        toast({ title: "Segnale GPS assente", description: "Vai all'aperto o attiva il Wi-Fi per migliorare il segnale.", variant: "destructive" });
      } else {
        // Timeout: retry with lower accuracy
        navigator.geolocation.getCurrentPosition(onPosition, () => {}, { enableHighAccuracy: false, timeout: 20000 });
      }
    };

    navigator.geolocation.getCurrentPosition(onPosition, onError, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    });
    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 5000,
    });
  };

  const stopTracking = () => {
    haptics.tap();
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsTracking(false);
  };

  const handleSOS = () => {
    haptics.heavy();
    navigator.geolocation.getCurrentPosition(
      pos => sosMutation.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast({ title: "Impossibile ottenere posizione", variant: "destructive" })
    );
  };

  const focusMember = (m: MemberLocation) => {
    if (m.location && leafletMap.current) {
      leafletMap.current.flyTo([m.location.lat, m.location.lng], 16, { animate: true, duration: 0.8 });
      setSelected(m);
    }
  };

  return (
    <div className="flex flex-col h-full relative bg-[#f8f9fa] overflow-hidden">
      <style>{`
        @keyframes mapPulse {
          0%   { transform:scale(1); opacity:0.6 }
          100% { transform:scale(2.2); opacity:0 }
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.12) !important;
          border-radius: 12px !important;
          overflow: hidden;
          margin-top: 60px !important;
        }
        .leaflet-control-zoom a {
          background: white !important;
          color: #334155 !important;
          border: none !important;
          border-bottom: 1px solid #e2e8f0 !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          font-size: 18px !important;
          transition: background 0.15s !important;
        }
        .leaflet-control-zoom a:last-child { border-bottom: none !important; }
        .leaflet-control-zoom a:hover { background: #f1f5f9 !important; }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.85) !important;
          color: #94a3b8 !important;
          font-size: 9px !important;
          border-radius: 8px 8px 0 0 !important;
          padding: 3px 8px !important;
        }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>

      {/* ── Map container ── */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapRef} className="w-full h-full" />

        {/* ── GPS denied banner ── */}
        {(geoStatus === "denied" || geoStatus === "unavailable") && (
          <div className="absolute top-0 inset-x-0 z-[1500] bg-red-500 text-white text-xs px-4 py-2 flex items-center gap-2" data-testid="banner-gps-denied">
            <LocateOff size={13} className="flex-shrink-0" />
            <span>
              {geoStatus === "denied"
                ? "Posizione bloccata — abilita il GPS nelle impostazioni del browser e ricarica la pagina."
                : "Geolocalizzazione non disponibile su questo dispositivo."}
            </span>
          </div>
        )}

        {/* ── Top-left FABs ── */}
        <div className={`absolute left-3 z-[1000] flex flex-col gap-2 ${geoStatus === "denied" || geoStatus === "unavailable" ? "top-10" : "top-3"}`}>
          <button
            onClick={isTracking ? stopTracking : startTracking}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold shadow-md transition-all ${
              isTracking
                ? "bg-red-500 text-white hover:bg-red-400"
                : geoStatus === "denied"
                  ? "bg-orange-100 text-orange-700 border border-orange-300"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
            data-testid="button-track-location"
          >
            <Radio size={14} className={isTracking ? "animate-pulse" : ""} />
            {isTracking ? "Live" : geoStatus === "denied" ? "GPS bloccato" : "Condividi"}
          </button>

          <button
            onClick={() => pauseMutation.mutate(!isPaused)}
            disabled={pauseMutation.isPending}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-md transition-all"
            data-testid="button-pause-location"
          >
            {isPaused ? <Eye size={14} /> : <EyeOff size={14} />}
            {isPaused ? "Visibile" : "Nascondi"}
          </button>
        </div>

        {/* ── Top-right SOS ── */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
          <button
            onClick={handleSOS}
            disabled={sosMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-400 shadow-md shadow-red-200 transition-all"
            data-testid="button-sos"
          >
            <AlertTriangle size={14} />
            SOS
          </button>
          {isTracking && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-600 text-xs shadow-sm">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {isMovingRef.current ? "30s" : "5m"}
            </div>
          )}
          {isSchoolMode && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 text-xs shadow-sm" data-testid="badge-school-mode">
              <GraduationCap size={12} />
              In classe
            </div>
          )}
        </div>

        {/* ── Bottom-left check-in ── */}
        <div className="absolute bottom-3 left-3 z-[1000]">
          <button
            onClick={() => setShowCheckin(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-200 shadow-md transition-all"
            data-testid="button-quick-checkin"
          >
            <HandHeart size={14} />
            Check-in
          </button>
        </div>

        {/* ── Selected member popup ── */}
        {selected && (
          <div className="absolute inset-x-4 z-[1500] pointer-events-none" style={{ bottom: "72px" }}>
            <div className="pointer-events-auto bg-white border border-slate-200 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                    style={{ backgroundColor: selected.profile.colorHex || "#3B82F6" }}
                  >
                    {selected.profile.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-slate-900 font-semibold text-sm">{selected.profile.name}</p>
                    <p className="text-slate-400 text-xs capitalize">{selected.profile.role}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={18} />
                </button>
              </div>
              {selected.location && !selected.locationPaused ? (
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Clock size={12} />
                    {formatTimeAgo(String(selected.location.timestamp))}
                  </span>
                  {selected.location.isMoving && (
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      In movimento
                    </span>
                  )}
                  {selected.location.batteryPct != null && (
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Battery size={12} />
                      {selected.location.batteryPct}%
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Posizione non condivisa</p>
              )}
            </div>
          </div>
        )}

        {/* ── Check-in sheet ── */}
        {showCheckin && (
          <div
            className="absolute inset-0 z-[2000] bg-black/30 backdrop-blur-sm flex items-end"
            onClick={() => setShowCheckin(false)}
          >
            <div
              className="bg-white w-full rounded-t-3xl p-5 pb-8 border-t border-slate-200 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-slate-900">Check-in rapido</p>
                  <p className="text-xs text-slate-500">Dove sei? Guadagna punti!</p>
                </div>
                <button onClick={() => setShowCheckin(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {["🏠 Casa", "🏫 Scuola", "⚽ Sport", "🛍️ Spesa", "👴 Nonni", "📍 Altro"].map(p => (
                  <button
                    key={p}
                    data-testid={`quick-checkin-${p}`}
                    onClick={() => { setCheckinPlace(p); quickCheckinMutation.mutate(p); }}
                    disabled={quickCheckinMutation.isPending}
                    className={`py-3 rounded-2xl text-sm font-medium transition-all border ${
                      checkinPlace === p
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom member strip ── */}
      <div className="bg-white border-t border-slate-200 flex-shrink-0">
        {isLoading ? (
          <div className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-shrink-0 w-28 h-16 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : members && members.length > 0 ? (
          <div className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar">
            {members.map(m => {
              const online = m.location && !m.locationPaused;
              const isSelected = selected?.profile.id === m.profile.id;
              return (
                <button
                  key={m.profile.id}
                  onClick={() => online ? focusMember(m) : setSelected(m)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-2xl transition-all border ${
                    isSelected
                      ? "bg-slate-100 border-slate-300 shadow-sm"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                  data-testid={`member-location-${m.profile.id}`}
                >
                  <div className="relative">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: m.profile.colorHex || "#3B82F6", opacity: online ? 1 : 0.45 }}
                    >
                      {m.profile.name.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${online ? "bg-emerald-400" : "bg-slate-300"}`} />
                  </div>
                  <span className="text-xs text-slate-700 font-medium leading-none">
                    {m.profile.name.split(" ")[0]}
                  </span>
                  <span className="text-[10px] leading-none">
                    {m.locationPaused
                      ? <span className="text-amber-500">nascosto</span>
                      : m.location
                        ? <span className="text-emerald-600">{formatTimeAgo(String(m.location.timestamp))}</span>
                        : <span className="text-slate-400">—</span>
                    }
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-5 text-center px-4">
            <MapPin className="w-7 h-7 text-slate-300 mb-1.5" />
            <p className="text-slate-500 text-sm">Nessuna posizione. Avvia la condivisione!</p>
          </div>
        )}
      </div>
    </div>
  );
}
