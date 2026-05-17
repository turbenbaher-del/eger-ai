import { useState, useEffect, useRef } from 'react';
import { C } from '../tokens.js';
import { haversine } from '../lib/utils.js';

function toRad(d) { return d * Math.PI / 180; }

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default function ARView({ spots, userLat, userLon, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [heading, setHeading] = useState(null);
  const [error, setError] = useState(null);
  const [fov] = useState(60);

  const nearby = spots
    .filter(s => s.lat && s.lon && haversine(userLat, userLon, s.lat, s.lon) <= 30)
    .map(s => ({
      ...s,
      dist: haversine(userLat, userLon, s.lat, s.lon),
      bearing: bearing(userLat, userLon, s.lat, s.lon),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      })
      .catch(() => setError("Нет доступа к камере"));

    const handleOrientation = e => {
      const h = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null);
      if (h != null) setHeading(h);
    };

    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().then(p => {
        if (p === "granted") window.addEventListener("deviceorientation", handleOrientation, true);
      }).catch(() => setError("Нет доступа к компасу"));
    } else {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const getScreenX = (spotBearing) => {
    if (heading == null) return null;
    let diff = ((spotBearing - heading) + 540) % 360 - 180;
    if (Math.abs(diff) > fov / 2) return null;
    return 50 + (diff / (fov / 2)) * 50;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000", overflow: "hidden" }}>
      <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />

      {error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
          <div style={{ fontSize: 44 }}>📷</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", textAlign: "center" }}>{error}</div>
          <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 12, background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accent, fontWeight: 700, cursor: "pointer" }}>Закрыть</button>
        </div>
      )}

      {!error && heading == null && (
        <div style={{ position: "absolute", bottom: 120, left: 0, right: 0, textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "8px 16px", borderRadius: 20, background: "rgba(0,0,0,.7)", color: "rgba(255,255,255,.8)", fontSize: 12 }}>
            Поверни телефон, чтобы активировать компас
          </div>
        </div>
      )}

      {nearby.map(spot => {
        const xPct = getScreenX(spot.bearing);
        if (xPct == null) return null;
        const dist = spot.dist < 1 ? `${Math.round(spot.dist * 1000)} м` : `${spot.dist.toFixed(1)} км`;
        return (
          <div key={spot.id || spot.name} style={{
            position: "absolute", top: "35%", left: `${xPct}%`, transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none"
          }}>
            <div style={{
              padding: "7px 12px", borderRadius: 14, background: "rgba(7,17,30,.88)", border: `1px solid ${C.accent}`,
              backdropFilter: "blur(8px)", textAlign: "center", maxWidth: 140
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{spot.name}</div>
              <div style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{dist}</div>
              {spot.fish && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>🐟 {spot.fish}</div>}
            </div>
            <div style={{ width: 2, height: 40, background: `linear-gradient(${C.accent},transparent)` }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.accent, boxShadow: `0 0 10px ${C.accent}` }} />
          </div>
        );
      })}

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(rgba(0,0,0,.7),transparent)", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,.6)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>AR Рыболовные точки</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>{heading != null ? `Курс: ${Math.round(heading)}°` : "Ожидание компаса..."} · {nearby.length} точек рядом</div>
        </div>
      </div>
    </div>
  );
}
