export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p, dLon = (lon2 - lon1) * p;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export const moonPhase = (date) => {
  const ref = new Date(2024, 0, 11);
  const d = date instanceof Date ? date : new Date();
  const p = (((d - ref) / 86400000 % 29.53) + 29.53) % 29.53;
  if(p < 1.85)  return {ico:"🌑", tip:"Новолуние — хищник максимально активен ночью", p};
  if(p < 7.38)  return {ico:"🌒", tip:"Растущая луна — хороший клёв хищника", p};
  if(p < 9.22)  return {ico:"🌓", tip:"Первая четверть — умеренный клёв, лучше в заводях", p};
  if(p < 14.76) return {ico:"🌔", tip:"Луна прибывает — лещ и сазан выходят на бровки", p};
  if(p < 16.61) return {ico:"🌕", tip:"Полнолуние — мирная рыба активна весь день", p};
  if(p < 22.15) return {ico:"🌖", tip:"Убывающая луна — лещ, сазан, плотва берут стабильно", p};
  if(p < 23.99) return {ico:"🌗", tip:"Последняя четверть — клёв нестабилен, меняй насадку", p};
  return {ico:"🌘", tip:"Луна сходит — ставь на мирную рыбу", p};
};


export const ymaps   = (latlon) => { const [la,lo]=String(latlon).split(",").map(s=>s.trim()); return `https://yandex.ru/maps/?pt=${lo},${la}&z=14`; };
export const ymapsLL = (lat,lon) => `https://yandex.ru/maps/?pt=${lon},${lat}&z=14`;

export const shopLinks = (query) => {
  const q = encodeURIComponent(query);
  return `\n🛒 Купить:\nWildberries: https://www.wildberries.ru/catalog/0/search.aspx?search=${q}\nOzon: https://www.ozon.ru/search/?text=${q}\nЯндекс Маркет: https://market.yandex.ru/search?text=${q}`;
};

export const fmtTime = () => new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
export const fmtDate = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ru-RU",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
};

export const PRESSURE_DATA = [757,758,756,759,761,760,762,761,763,762,764,763];
export const REACTIONS_LIST = ["👍","❤️","😂","😮","🎣","🔥"];

export function genUsername(displayName) {
  const base = (displayName || "рыбак")
    .toLowerCase().replace(/\s+/g,"_").replace(/[^a-zа-яё0-9_]/g,"").slice(0,18) || "рыбак";
  return base;
}

export const pick = arr => arr[Math.floor(Math.random()*arr.length)];

export const seasonFish = m => ["плотва, окунь, щука","плотва, окунь, щука","щука + плотва, жерех выходит","лещ, плотва, жерех, окунь","лещ, сазан, карась, жерех, тарань","лещ, сазан, карась, карп, амур","амур, карп, сазан — рано утром","амур, карп, судак, лещ","судак, щука, лещ — начало жора","судак, щука, берш, лещ — осенний жор","судак, щука, берш, лещ","плотва, окунь, щука"][m] || "лещ, судак";
