import { Anchor, TrendingUp, Waves } from '../icons/index.jsx';
import { haversine } from '../lib/utils.js';

export const WATER_BODIES = [
  {name:"Дон",              lat:47.2108, lon:39.7043, station:"don-rostov-na-donu"},
  {name:"р. Аксай",         lat:47.2681, lon:39.8699, station:null},
  {name:"Мёртвый Донец",    lat:47.2198, lon:39.6234, station:null},
  {name:"Азовское море",    lat:47.1023, lon:39.4123, station:"don-azov"},
  {name:"Цимлянское вдхр.", lat:47.6421, lon:42.0954, station:null},
  {name:"Манычское вдхр.",  lat:46.7012, lon:41.7234, station:null},
  {name:"р. Сал",           lat:47.40,   lon:40.80,   station:null},
];

export const SPOT_LIST = [
  {name:"Вторая дамба (Аксай)",           fish:"Лещ, Сазан, Карп",          lat:47.2731, lon:39.8701, Icon:Anchor},
  {name:"Каменная гряда (Аксай)",         fish:"Судак, Жерех, Щука",        lat:47.2612, lon:39.8812, Icon:TrendingUp},
  {name:"Глубокая яма под Аксаем",        fish:"Сом, Судак",                lat:47.2534, lon:39.8923, Icon:Anchor},
  {name:"Перекат ниже Аксая",             fish:"Сазан, Голавль, Чехонь",    lat:47.2456, lon:39.9012, Icon:TrendingUp},
  {name:"Острова у Аксая",                fish:"Лещ, Щука, Карась",         lat:47.2690, lon:39.8580, Icon:Waves},
  {name:"Гниловская переправа",           fish:"Судак, Жерех",              lat:47.1734, lon:39.7012, Icon:TrendingUp},
  {name:"Яма у опоры ЖД-моста (Ростов)", fish:"Сом, Судак, Лещ",           lat:47.2267, lon:39.7134, Icon:Anchor},
  {name:"Диванчик (Дон, Ростов)",        fish:"Лещ, Плотва, Карп, Тарань", lat:47.2115, lon:39.7111, Icon:Waves},
  {name:"Кумженская роща (Дон)",          fish:"Лещ, Тарань, Кефаль",       lat:47.1849, lon:39.6257, Icon:Waves},
  {name:"Нижний Дон (ниже Ростова)",      fish:"Судак, Тарань, Лещ",        lat:47.1823, lon:39.8512, Icon:TrendingUp},
  {name:"Рогожкино (Каланча)",            fish:"Щука, Карп, Амур, Лещ",     lat:47.1765, lon:39.3435, Icon:Waves},
  {name:"Горожкино (Б. Кутерьма)",        fish:"Карп, Сазан, Лещ, Щука",    lat:47.1855, lon:39.3345, Icon:Anchor},
  {name:"Дугино (Каланча)",               fish:"Сазан, Карп, Лещ, Плотва",  lat:47.1564, lon:39.4387, Icon:Waves},
  {name:"Мёртвый Донец (Ливенцовка)",    fish:"Щука, Карась, Окунь",       lat:47.2198, lon:39.6234, Icon:Waves},
  {name:"Камышовая заводь (Батайск)",    fish:"Карась, Карп, Амур",        lat:47.1456, lon:39.7456, Icon:Waves},
  {name:"Мёртвый Донец (трофейный лещ)", fish:"Лещ, Карп, Щука",           lat:47.2575, lon:39.4098, Icon:Anchor},
  {name:"Тихий залив (Азов)",            fish:"Тарань, Карась, Лещ",       lat:47.1023, lon:39.4123, Icon:Waves},
  {name:"Протока Кутюрьма (Азов)",       fish:"Судак, Тарань, Сом",        lat:47.0812, lon:39.2345, Icon:Anchor},
  {name:"Взморье у Азова",               fish:"Тарань, Чехонь, Лещ",       lat:47.0512, lon:38.9123, Icon:Waves},
  {name:"Старочеркасская (Дон)",         fish:"Лещ, Чехонь, Сазан, Щука",  lat:47.2389, lon:40.0153, Icon:Anchor},
  {name:"Арпачин (Дон)",                 fish:"Чехонь, Сазан, Карп, Щука", lat:47.2557, lon:40.1558, Icon:TrendingUp},
  {name:"Тузлуков (Маныч)",              fish:"Карп, Сазан, Судак, Амур",   lat:47.2061, lon:40.4758, Icon:Waves},
  {name:"Перекат у Багаевской",          fish:"Сазан, Чехонь, Жерех, Амур",lat:47.3197, lon:40.3475, Icon:TrendingUp},
  {name:"Раздоры (перекат)",             fish:"Чехонь, Сазан, Лещ, Судак", lat:47.5632, lon:40.6735, Icon:TrendingUp},
  {name:"Коса у Семикаракорска",         fish:"Лещ, Сазан, Судак",         lat:47.5234, lon:40.8012, Icon:Anchor},
  {name:"Плёс у Константиновска",        fish:"Лещ, Плотва, Красноперка",  lat:47.5801, lon:41.0912, Icon:Waves},
  {name:"Костино-Горский (С. Донец)",    fish:"Лещ, Судак, Жерех, Щука",   lat:47.6177, lon:40.8880, Icon:TrendingUp},
  {name:"Цимлянское вдхр. (низовье)",    fish:"Лещ, Судак, Сом",           lat:47.6421, lon:42.0954, Icon:Anchor},
  {name:"Цимлянское вдхр. (свалы)",      fish:"Судак, Берш, Жерех",        lat:47.6134, lon:42.1534, Icon:TrendingUp},
  {name:"Манычское вдхр. (Пролетарск)",  fish:"Амур, Карп, Толстолобик",   lat:46.7012, lon:41.7234, Icon:Waves},
  {name:"Манычское вдхр. (восток)",      fish:"Судак, Лещ, Карп",          lat:46.6512, lon:41.6234, Icon:Anchor},
  {name:"Таганрогский залив (мыс)",      fish:"Тарань, Судак, Бычок",      lat:47.2090, lon:38.9360, Icon:Waves},
  {name:"Чалтырское озеро",              fish:"Карась, Карп, Толстолобик", lat:47.2512, lon:39.5234, Icon:Waves},
];

export const GEO_CITIES = [
  {name:"Ростов-на-Дону",   lat:47.2357, lon:39.7015},
  {name:"Аксай",            lat:47.2681, lon:39.8699},
  {name:"Батайск",          lat:47.1456, lon:39.7456},
  {name:"Азов",             lat:47.1023, lon:39.4123},
  {name:"Таганрог",         lat:47.2090, lon:38.9360},
  {name:"Новочеркасск",     lat:47.4181, lon:40.0956},
  {name:"Новошахтинск",     lat:47.7576, lon:39.9320},
  {name:"Шахты",            lat:47.7089, lon:40.2158},
  {name:"Волгодонск",       lat:47.5083, lon:42.1583},
  {name:"Семикаракорск",    lat:47.5177, lon:40.8069},
  {name:"Константиновск",   lat:47.5789, lon:41.0989},
  {name:"Багаевская",       lat:47.3197, lon:40.4012},
  {name:"Старочеркасская",  lat:47.2389, lon:40.0153},
  {name:"Раздорская",       lat:47.5632, lon:40.6735},
  {name:"Цимлянск",         lat:47.6421, lon:42.0954},
  {name:"Пролетарск",       lat:46.7012, lon:41.7234},
  {name:"Рогожкино",        lat:47.1765, lon:39.3435},
  {name:"Кагальник",        lat:47.0312, lon:39.5012},
  {name:"Гниловская",       lat:47.1734, lon:39.7012},
];

export function getNearestCity(lat, lon) {
  if (!lat || !lon) return null;
  return [...GEO_CITIES].sort((a,b)=>haversine(lat,lon,a.lat,a.lon)-haversine(lat,lon,b.lat,b.lon))[0];
}

export function getNearestSpotName(lat, lon) {
  if (!lat || !lon) return "Место не определено";
  let nearest = null, minD = Infinity;
  SPOT_LIST.forEach(s=>{ const d=Math.hypot(s.lat-lat,s.lon-lon); if(d<minD){minD=d;nearest=s;} });
  if (nearest && minD < 0.3) return nearest.name;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
