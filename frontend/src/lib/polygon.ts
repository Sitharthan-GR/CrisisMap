/** Centroid of a polygon ring [[lng, lat], ...]. */
export function polygonCentroid(ring: number[][]): { lat: number; lng: number } {
  const points =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;

  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of points) {
    sumLat += lat;
    sumLng += lng;
  }

  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length,
  };
}
