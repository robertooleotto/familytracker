/**
 * Reverse geocoding service using Nominatim (OSM) and Mapbox.
 * Identifies what's at a given GPS coordinate.
 */

interface GeocodedPlace {
  name: string;
  category: string; // supermarket|barber|school|work|gym|doctor|restaurant|pharmacy|park|other
  address: string;
  lat: number;
  lng: number;
}

// OSM category mapping to our simplified categories
const OSM_CATEGORY_MAP: Record<string, string> = {
  supermarket: "supermarket", grocery: "supermarket", convenience: "supermarket",
  hairdresser: "barber", barber: "barber",
  school: "school", kindergarten: "school", college: "school", university: "school",
  office: "work", coworking_space: "work",
  gym: "gym", fitness_centre: "gym", sports_centre: "gym", swimming_pool: "gym",
  doctors: "doctor", dentist: "doctor", clinic: "doctor", hospital: "doctor", veterinary: "doctor",
  restaurant: "restaurant", cafe: "restaurant", fast_food: "restaurant", bar: "restaurant", pub: "restaurant",
  pharmacy: "pharmacy", chemist: "pharmacy",
  park: "park", playground: "park", garden: "park",
  bank: "other", post_office: "other", fuel: "other", car_repair: "other",
};

function mapOsmCategory(tags: Record<string, string>): string {
  // Check amenity, shop, leisure, building tags
  for (const key of ["amenity", "shop", "leisure", "tourism", "building"]) {
    const val = tags[key];
    if (val && OSM_CATEGORY_MAP[val]) return OSM_CATEGORY_MAP[val];
  }
  return "other";
}

/**
 * Reverse geocode using Nominatim (OSM) — free, no API key needed.
 * Returns nearby POIs and address info.
 */
export async function reverseGeocodeNominatim(lat: number, lng: number): Promise<GeocodedPlace | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FamilyTracker/1.0 (roberto.oleotto@gmail.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;

    const name = data.namedetails?.name || data.name || data.display_name?.split(",")[0] || "Sconosciuto";
    const tags = { ...(data.extratags || {}), ...(data.type ? { amenity: data.type } : {}) };
    // Also check the class field
    if (data.class === "shop") tags.shop = data.type;
    if (data.class === "amenity") tags.amenity = data.type;
    if (data.class === "leisure") tags.leisure = data.type;

    const category = mapOsmCategory(tags);
    const address = data.display_name || "";

    return { name, category, address, lat, lng };
  } catch (err) {
    console.warn("[Geocoding] Nominatim error:", (err as Error).message);
    return null;
  }
}

/**
 * Search nearby POIs using Overpass API (OSM).
 * Finds businesses/places within a radius.
 */
export async function searchNearbyPOIs(lat: number, lng: number, radiusM: number = 60): Promise<GeocodedPlace[]> {
  try {
    const query = `
      [out:json][timeout:10];
      (
        node["name"]["amenity"](around:${radiusM},${lat},${lng});
        node["name"]["shop"](around:${radiusM},${lat},${lng});
        node["name"]["leisure"](around:${radiusM},${lat},${lng});
        way["name"]["amenity"](around:${radiusM},${lat},${lng});
        way["name"]["shop"](around:${radiusM},${lat},${lng});
      );
      out center 5;
    `.trim();

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return [];
    const data = await res.json() as any;

    return (data.elements || []).map((el: any) => ({
      name: el.tags?.name || "Sconosciuto",
      category: mapOsmCategory(el.tags || {}),
      address: el.tags?.["addr:street"] ? `${el.tags["addr:street"]} ${el.tags["addr:housenumber"] || ""}` : "",
      lat: el.lat || el.center?.lat || lat,
      lng: el.lon || el.center?.lon || lng,
    }));
  } catch (err) {
    console.warn("[Geocoding] Overpass error:", (err as Error).message);
    return [];
  }
}

/**
 * Calculate distance between two GPS points in meters (Haversine formula).
 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
