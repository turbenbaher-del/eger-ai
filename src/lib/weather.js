/* ── Weather fetch (Open-Meteo, бесплатно) ── */
export async function fetchWeather(lat = 47.27, lon = 39.87) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code,relative_humidity_2m" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset" +
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code,surface_pressure" +
    "&forecast_days=7&wind_speed_unit=ms&timezone=Europe%2FMoscow";
  const r = await fetch(url);
  const d = await r.json();
  const c = d.current;
  const airTemp = Math.round(c.temperature_2m);
  const month = new Date().getMonth();
  const waterTemp = month >= 5 && month <= 8 ? airTemp - 1 : airTemp - 3;
  const pressureMmHg = Math.round(c.surface_pressure * 0.750064);
  return {
    airTemp, waterTemp: Math.max(2, waterTemp),
    wind: Math.round(c.wind_speed_10m),
    windDir: c.wind_direction_10m||0,
    pressure: pressureMmHg,
    humidity: c.relative_humidity_2m,
    code: c.weather_code,
    updated: new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),
    daily: d.daily,
    hourly: d.hourly,
  };
}

/* ── Bite score (давление, ветер, температура, месяц) ── */
export function calcBiteScore(pressure, month, wind=0, waterTemp=15, rain=0) {
  let score = 6;
  if (pressure >= 758 && pressure <= 765) score += 3;
  else if (pressure >= 750 && pressure <= 770) score += 2;
  else if (pressure >= 745 && pressure <= 775) score += 1;
  else score -= 1;
  if (wind <= 3) score += 1;
  else if (wind > 8) score -= 1;
  if (waterTemp >= 14 && waterTemp <= 22) score += 1;
  else if (waterTemp < 5 || waterTemp > 28) score -= 1;
  if (rain >= 60) score -= 1;
  if (month >= 4 && month <= 9) score += 1;
  return Math.max(1, Math.min(10, score));
}
