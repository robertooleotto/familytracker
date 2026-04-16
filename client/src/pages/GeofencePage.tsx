import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Trash2, MapPin, Bell } from "lucide-react";
import type { Geofence } from "@shared/schema";

export default function GeofencePage() {
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const circlesRef = useRef<Map<string, any>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", centerLat: "", centerLng: "", radiusM: 200, notifyOn: "both" as "enter" | "exit" | "both", debounceMin: 3 });
  const [clickMode, setClickMode] = useState(false);

  const { data: geofences, isLoading } = useQuery<Geofence[]>({ queryKey: ["/api/geofences"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/geofences", {
        ...form, centerLat: parseFloat(form.centerLat), centerLng: parseFloat(form.centerLng),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geofences"] });
      setShowAdd(false);
      setForm({ name: "", centerLat: "", centerLng: "", radiusM: 200, notifyOn: "both", debounceMin: 3 });
      toast({ title: "Zona creata!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/geofences/${id}`, undefined); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geofences"] });
      toast({ title: "Zona eliminata" });
    },
  });

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const load = async () => {
      const L = (await import("leaflet")).default;
      leafletMap.current = L.map(mapRef.current!, { center: [41.9028, 12.4964], zoom: 13, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(leafletMap.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(leafletMap.current);

      leafletMap.current.on("click", (e: any) => {
        setForm(f => ({ ...f, centerLat: e.latlng.lat.toFixed(6), centerLng: e.latlng.lng.toFixed(6) }));
      });

      // Try to center on user's position
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          leafletMap.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
        }, () => {});
      }
    };
    load();
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, []);

  useEffect(() => {
    if (!leafletMap.current || !geofences) return;
    const update = async () => {
      const L = (await import("leaflet")).default;

      circlesRef.current.forEach(c => c.remove());
      circlesRef.current.clear();

      geofences.forEach(g => {
        const circle = L.circle([g.centerLat, g.centerLng], {
          radius: g.radiusM, color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: 0.15, weight: 2,
        }).addTo(leafletMap.current).bindPopup(`<b>${g.name}</b><br>Raggio: ${g.radiusM}m`);

        L.marker([g.centerLat, g.centerLng], {
          icon: L.divIcon({
            html: `<div style="background:#3B82F6;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);">🛡</div>`,
            className: "", iconSize: [24, 24], iconAnchor: [12, 12],
          }),
        }).addTo(leafletMap.current);

        circlesRef.current.set(g.id, circle);
      });

      if (geofences.length > 0) {
        const bounds = geofences.map(g => [g.centerLat, g.centerLng] as [number, number]);
        leafletMap.current.fitBounds(bounds, { padding: [60, 60] });
      }
    };
    update();
  }, [geofences]);

  // Preview circle while setting coordinates
  const previewCircleRef = useRef<any>(null);
  useEffect(() => {
    if (!leafletMap.current || !form.centerLat || !form.centerLng) return;
    const update = async () => {
      const L = (await import("leaflet")).default;
      if (previewCircleRef.current) { previewCircleRef.current.remove(); previewCircleRef.current = null; }
      const lat = parseFloat(form.centerLat), lng = parseFloat(form.centerLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        previewCircleRef.current = L.circle([lat, lng], {
          radius: form.radiusM, color: "#F59E0B", fillColor: "#F59E0B", fillOpacity: 0.2, weight: 2, dashArray: "5,5",
        }).addTo(leafletMap.current);
        leafletMap.current.setView([lat, lng], 15);
      }
    };
    update();
  }, [form.centerLat, form.centerLng, form.radiusM]);

  const notifyLabels: Record<string, string> = { enter: "Solo entrata", exit: "Solo uscita", both: "Entrata e uscita" };

  return (
    <div className="flex flex-col h-full">
      <div className="relative" style={{ height: showAdd ? "220px" : "300px", transition: "height 0.3s" }}>
        <div ref={mapRef} className="w-full h-full" />
        <div className="absolute top-3 left-3 z-[1000] bg-background/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-muted-foreground shadow">
          📍 Tocca la mappa per impostare il centro
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Add zone */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Zone sicure</h3>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-geofence">
              <Plus className="w-4 h-4 mr-1" /> Nuova zona
            </Button>
          </div>

          {showAdd && (
            <div className="bg-accent/40 rounded-xl p-3 space-y-3">
              <div>
                <Label className="text-xs">Nome zona</Label>
                <Input placeholder="es. Scuola, Casa, Parco" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-geofence-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Latitudine</Label>
                  <Input placeholder="41.9028" value={form.centerLat} onChange={e => setForm({ ...form, centerLat: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Longitudine</Label>
                  <Input placeholder="12.4964" value={form.centerLng} onChange={e => setForm({ ...form, centerLng: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Raggio (m)</Label>
                  <Select value={String(form.radiusM)} onValueChange={v => setForm({ ...form, radiusM: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[50, 100, 200, 500, 1000].map(r => <SelectItem key={r} value={String(r)}>{r}m</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notifica</Label>
                  <Select value={form.notifyOn} onValueChange={v => setForm({ ...form, notifyOn: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enter">Entrata</SelectItem>
                      <SelectItem value="exit">Uscita</SelectItem>
                      <SelectItem value="both">Entrambi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Debounce (min) — evita falsi alert</Label>
                <Select value={String(form.debounceMin)} onValueChange={v => setForm({ ...form, debounceMin: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10].map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => addMutation.mutate()} disabled={!form.name || !form.centerLat || !form.centerLng || addMutation.isPending}>
                  {addMutation.isPending ? "Salvataggio…" : "Salva zona"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annulla</Button>
              </div>
            </div>
          )}
        </div>

        {/* Zones list */}
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : geofences && geofences.length > 0 ? (
            geofences.map(g => (
              <div key={g.id} className="flex items-start gap-3 p-3 rounded-xl border border-card-border bg-card hover:bg-accent/20 transition-colors" data-testid={`geofence-${g.id}`}>
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{g.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{g.radiusM}m</span>
                    <Badge variant="outline" className="text-xs"><Bell className="w-3 h-3 mr-1" />{notifyLabels[g.notifyOn]}</Badge>
                    <Badge variant="secondary" className="text-xs">⏱ {g.debounceMin}min debounce</Badge>
                  </div>
                </div>
                <button onClick={() => deleteMutation.mutate(g.id)} className="text-muted-foreground hover:text-destructive p-1" data-testid={`delete-geofence-${g.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nessuna zona configurata</p>
              <p className="text-xs mt-1">Crea zone sicure come casa, scuola, palestra</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
