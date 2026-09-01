// Solar position (NOAA algorithm). Returns altitude and azimuth in radians; azimuth measured clockwise from north.
export function sunPosition(date, latDeg, lonDeg) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) + Math.sin(3 * M * rad) * 0.000289;
  const trueLon = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLon - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const y = Math.tan(eps * rad / 2) ** 2;
  const eqTime = 4 * (180 / Math.PI) * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad)); // minutes
  const minutesUTC = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (minutesUTC + eqTime + 4 * lonDeg + 1440) % 1440;
  let ha = trueSolarTime / 4 - 180; if (ha < -180) ha += 360;
  const lat = latDeg * rad, haR = ha * rad;
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(haR);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  let az = Math.acos(Math.max(-1, Math.min(1, ((Math.sin(lat) * Math.cos(zen)) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen))))) ; // from north
  az = ha > 0 ? Math.PI + az : Math.PI - az; az = (az + 2 * Math.PI) % (2 * Math.PI);
  return { altitude: Math.PI / 2 - zen, azimuth: az };
}
