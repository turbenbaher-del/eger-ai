import { useState, useEffect, useRef, useMemo } from 'react';
import { C, glass } from '../tokens.js';
import { ChevronRight, MapPin, Clock } from '../icons/index.jsx';
import { db, logEvent } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { haversine } from '../lib/utils.js';
import { ymapsLL } from '../lib/utils.js';
import { SPOT_LIST } from '../data/spots.js';
import { FISHING_BASES, SHOPS } from '../data/fishing.jsx';
import ARView from '../components/ARView.jsx';

function YandexMapFrame({ src, iframeKey, fallbackUrl }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    loadedRef.current = false;
    const t = setTimeout(() => { if (!loadedRef.current) setFailed(true); }, 10000);
    return () => clearTimeout(t);
  }, [src]);
  const handleLoad = () => { loadedRef.current = true; setLoaded(true); setFailed(false); };
  if (failed) return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"#0a192f"}}>
      <div style={{fontSize:36}}>🗺️</div>
      <div style={{fontSize:13,fontWeight:700,color:C.text}}>Карта недоступна</div>
      <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"0 24px",lineHeight:1.5}}>Медленный интернет или карта заблокирована</div>
      {fallbackUrl&&<a href={fallbackUrl} target="_blank" rel="noreferrer" style={{marginTop:4,padding:"8px 18px",borderRadius:10,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:12,fontWeight:800,textDecoration:"none"}}>Открыть в Яндекс.Картах ↗</a>}
    </div>
  );
  return (
    <>
      {!loaded&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,background:"rgba(7,17,30,.95)",zIndex:1,pointerEvents:"none"}}>
        <div style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
        <div style={{fontSize:12,color:C.muted}}>Загрузка карты...</div>
        {fallbackUrl&&<a href={fallbackUrl} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.accent,textDecoration:"none",pointerEvents:"all"}}>Открыть в Яндекс.Картах ↗</a>}
      </div>}
      <iframe key={iframeKey} src={src} style={{width:"100%",height:"100%",display:"block",border:"none",opacity:loaded?1:0,transition:"opacity .5s"}} frameBorder="0" allowFullScreen={true} loading="lazy" onLoad={handleLoad}/>
    </>
  );
}

function SuggestSpotForm({ user, userLat, userLon, onClose }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [fish, setFish] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db,"suggested_spots"),{
        name: name.trim(), description: desc.trim(), fish: fish.trim(),
        lat: userLat||null, lng: userLon||null,
        uid: user?.uid||"anon", userId: user?.uid||"anon", userName: user?.displayName||"Рыбак",
        status: "pending", createdAt: serverTimestamp(),
      });
      logEvent("spot_suggested");
      setDone(true);
    } catch(e) { setSaving(false); }
  };
  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:200,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"flex-end"}}>
      <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1f35",borderRadius:"24px 24px 0 0",padding:"20px 16px 40px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text,flex:1}}>📍 Предложить точку</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>✕</button>
        </div>
        {done ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:C.accent,marginBottom:8}}>Спасибо!</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Ваша точка отправлена на модерацию. После одобрения она появится на карте.</div>
            <button onClick={onClose} style={{padding:"12px 32px",borderRadius:14,border:"none",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:14,fontWeight:800,cursor:"pointer"}}>Закрыть</button>
          </div>
        ) : (
          <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>НАЗВАНИЕ ТОЧКИ *</div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Напр.: Яма у старого моста" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>КАКАЯ РЫБА ЛОВИТСЯ</div>
              <input value={fish} onChange={e=>setFish(e.target.value)} placeholder="Напр.: Судак, Лещ, Карп" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ОПИСАНИЕ</div>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Глубина, дно, особенности..." rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",resize:"none",outline:"none"}}/>
            </div>
            {userLat&&<div style={{fontSize:11,color:C.accent,marginBottom:16,textAlign:"center"}}>📍 Координаты определены автоматически</div>}
            <button onClick={handleSave} disabled={saving||!name.trim()} style={{width:"100%",padding:"15px",borderRadius:16,border:"none",background:name.trim()?`linear-gradient(135deg,#1a8a50,${C.accent})`:"#1e3a2a",color:name.trim()?"#07111e":"#4a6e5a",fontSize:15,fontWeight:800,cursor:name.trim()?"pointer":"default"}}>
              {saving?"Отправляем...":"📤 Отправить на модерацию"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SpotsScreen({ userLat, userLon, user }) {
  const [selIdx, setSelIdx] = useState(null);
  const [filter, setFilter] = useState("");
  const [fishFilter, setFishFilter] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [showAR, setShowAR] = useState(false);
  useEffect(()=>{ logEvent("map_opened"); },[]);

  const sorted = useMemo(()=>{
    if(userLat && userLon)
      return [...SPOT_LIST].sort((a,b)=>haversine(userLat,userLon,a.lat,a.lon)-haversine(userLat,userLon,b.lat,b.lon));
    return SPOT_LIST;
  },[userLat,userLon]);

  const filtered = useMemo(()=>{
    return sorted.filter(s=>{
      if(filter && !s.name.toLowerCase().includes(filter.toLowerCase()) && !s.fish.toLowerCase().includes(filter.toLowerCase())) return false;
      if(fishFilter && !s.fish.toLowerCase().includes(fishFilter.toLowerCase())) return false;
      return true;
    });
  },[sorted,filter,fishFilter]);

  const sel = selIdx !== null ? SPOT_LIST[selIdx] : null;
  const centerLon = sel ? sel.lon : (userLon || 39.95);
  const centerLat = sel ? sel.lat : (userLat || 47.24);
  const zoom = sel ? 13 : (userLat ? 10 : 8);

  const userPt = userLat && userLon ? `~${userLon},${userLat},pm2yll1` : "";
  const pts = SPOT_LIST.map((s,i)=>
    `${s.lon},${s.lat},${i===selIdx?"pm2gnl1":"pm2rdl1"}`
  ).join("~") + userPt;

  const mapSrc = `https://yandex.ru/map-widget/v1/?ll=${centerLon},${centerLat}&z=${zoom}&pt=${pts}&l=map`;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {showAR&&userLat&&<ARView spots={SPOT_LIST} userLat={userLat} userLon={userLon} onClose={()=>setShowAR(false)}/>}
      {showSuggest&&<SuggestSpotForm user={user} userLat={userLat} userLon={userLon} onClose={()=>setShowSuggest(false)}/>}

      <div style={{flex:"0 0 44%",position:"relative",background:"#0a192f"}}>
        <YandexMapFrame src={mapSrc} iframeKey="yandex-spots-map" fallbackUrl={`https://yandex.ru/maps/?ll=${centerLon},${centerLat}&z=${zoom}`}/>
        {sel && (
          <div style={{position:"absolute",bottom:8,left:8,right:8,background:"rgba(7,17,30,.9)",backdropFilter:"blur(12px)",border:`1px solid ${C.borderHi}`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sel.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{sel.fish}</div>
            </div>
            <a href={ymapsLL(sel.lat,sel.lon)} target="_blank" rel="noreferrer"
              style={{padding:"5px 12px",borderRadius:8,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:11,fontWeight:800,textDecoration:"none",flexShrink:0}}>
              Маршрут
            </a>
            <button onClick={()=>setSelIdx(null)}
              style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.surface,color:C.muted,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={{padding:"8px 12px 6px",background:"rgba(7,17,30,.95)",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          <input
            value={filter} onChange={e=>setFilter(e.target.value)}
            placeholder={`🔍 Поиск по ${SPOT_LIST.length} точкам...`}
            style={{flex:1,background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:12,padding:"8px 12px",color:C.text,fontSize:13,outline:"none"}}
          />
          <button onClick={()=>setShowSuggest(true)} style={{flexShrink:0,padding:"7px 12px",borderRadius:12,background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            + Точку
          </button>
          {userLat&&<button onClick={()=>setShowAR(true)} style={{flexShrink:0,padding:"7px 10px",borderRadius:12,background:"rgba(139,92,246,.15)",border:"1px solid rgba(139,92,246,.4)",color:"#a78bfa",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            AR
          </button>}
        </div>
        <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4}}>
          <button onClick={()=>setFishFilter("")} style={{flexShrink:0,padding:"3px 10px",borderRadius:12,background:!fishFilter?C.accentDim:C.surface,border:`1px solid ${!fishFilter?C.accent:C.border}`,color:!fishFilter?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>Все</button>
          {["Судак","Щука","Сом","Лещ","Карп","Карась","Окунь","Сазан","Амур","Тарань","Чехонь","Жерех"].map(f=>(
            <button key={f} onClick={()=>setFishFilter(fishFilter===f?"":f)} style={{flexShrink:0,padding:"3px 10px",borderRadius:12,background:fishFilter===f?C.accentDim:C.surface,border:`1px solid ${fishFilter===f?C.accent:C.border}`,color:fishFilter===f?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"6px 10px"}}>
        {userLat && !filter && (
          <div style={{fontSize:10,color:C.muted,padding:"4px 4px 6px",textAlign:"center"}}>
            📍 По расстоянию от вас
          </div>
        )}
        {filtered.length===0&&filter&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Ничего не найдено</div>
            <div style={{fontSize:12,marginBottom:14}}>Попробуй другой запрос</div>
            <button onClick={()=>setFilter("")} style={{padding:"8px 20px",borderRadius:12,border:`1px solid ${C.accent}`,background:C.accentDim,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer"}}>Сбросить</button>
          </div>
        )}
        {filtered.map((s,i)=>{
          const realIdx = SPOT_LIST.indexOf(s);
          const dist = userLat&&userLon ? Math.round(haversine(userLat,userLon,s.lat,s.lon)) : null;
          const isSel = selIdx===realIdx;
          return (
            <div key={realIdx} onClick={()=>setSelIdx(isSel?null:realIdx)}
              style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",marginBottom:5,borderRadius:12,cursor:"pointer",
                background:isSel?`rgba(46,204,113,.1)`:"rgba(255,255,255,.03)",
                border:`1px solid ${isSel?C.accent:C.border}`,transition:"all .15s"}}>
              <div style={{width:30,height:30,borderRadius:8,background:isSel?C.accent:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <s.Icon size={14} color={isSel?"#07111e":C.accent}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                <div style={{fontSize:10,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.fish}{dist!==null?` · ${dist} км`:""}</div>
              </div>
              <ChevronRight size={12} color={isSel?C.accent:C.dimmer}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BasesScreen({ userLat, userLon }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const baseDist = b => userLat&&userLon ? haversine(userLat,userLon,b.lat,b.lon) : null;

  const filtered = FISHING_BASES
    .filter(b=>{
      if(typeFilter!=="all"&&b.type!==typeFilter) return false;
      if(search){const q=search.toLowerCase();return b.name.toLowerCase().includes(q)||b.fish.toLowerCase().includes(q)||b.city.toLowerCase().includes(q);}
      return true;
    })
    .sort((a,b)=>{const da=baseDist(a),db=baseDist(b);return(da!==null&&db!==null)?da-db:0;});

  const centerLon = selected?selected.lon:(userLon||39.75);
  const centerLat = selected?selected.lat:(userLat||47.23);
  const zoom = selected?14:8;
  const userPt = userLat && userLon ? `~${userLon},${userLat},pm2yll1` : "";
  const pts = FISHING_BASES.map(b=>`${b.lon},${b.lat},${selected?.id===b.id?"pm2gnl1":"pm2blm1"}`).join("~") + userPt;
  const mapSrc = `https://yandex.ru/map-widget/v1/?ll=${centerLon},${centerLat}&z=${zoom}&pt=${pts}&l=map`;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:C.bg,overflow:"hidden"}}>
      <div style={{padding:"8px 12px",background:"rgba(7,17,30,.97)",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.surfaceHi,borderRadius:12,padding:"9px 12px",border:`1px solid ${C.border}`,marginBottom:6}}>
          <span style={{fontSize:15}}>🏕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск баз и платной рыбалки..." style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:13}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1}}>×</button>}
        </div>
        <div style={{display:"flex",gap:5}}>
          {[{v:"all",l:"Все"},{v:"base",l:"Базы"},{v:"paid",l:"Платная"}].map(t=>(
            <button key={t.v} onClick={()=>setTypeFilter(t.v)} style={{padding:"3px 12px",borderRadius:10,background:typeFilter===t.v?C.accentDim:C.surface,border:`1px solid ${typeFilter===t.v?C.accent:C.border}`,color:typeFilter===t.v?C.accent:C.muted,fontSize:11,fontWeight:typeFilter===t.v?700:400,cursor:"pointer"}}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{flex:"0 0 42%",position:"relative",background:"#0a192f"}}>
        <YandexMapFrame src={mapSrc} iframeKey="yandex-bases-map" fallbackUrl={`https://yandex.ru/maps/?ll=${selected?selected.lon:39.95},${selected?selected.lat:47.24}&z=${selected?14:8}`}/>
        {selected&&(
          <div style={{position:"absolute",bottom:8,left:8,right:8,background:"rgba(7,17,30,.93)",backdropFilter:"blur(12px)",border:`1px solid ${C.borderHi}`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selected.name}</div>
              <div style={{fontSize:10,color:C.cyan}}>{selected.price}</div>
            </div>
            <a href={`tel:${selected.phone}`} style={{padding:"5px 10px",borderRadius:8,background:"rgba(34,211,238,.12)",border:"1px solid rgba(34,211,238,.3)",color:C.cyan,fontSize:11,fontWeight:700,textDecoration:"none",flexShrink:0}}>Звонить</a>
            <a href={ymapsLL(selected.lat,selected.lon)} target="_blank" rel="noreferrer" style={{padding:"5px 12px",borderRadius:8,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:11,fontWeight:800,textDecoration:"none",flexShrink:0}}>Маршрут</a>
            <button onClick={()=>setSelected(null)} style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.surface,color:C.muted,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 10px"}}>
        {userLat&&!search&&<div style={{fontSize:10,color:C.muted,padding:"4px 4px 6px",textAlign:"center"}}>📍 По расстоянию от вас</div>}
        {filtered.map(b=>{
          const dist=baseDist(b); const isSel=selected?.id===b.id;
          const distStr=dist!==null?`${Math.round(dist)} км`:"";
          return (
            <div key={b.id} onClick={()=>setSelected(isSel?null:b)}
              style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",marginBottom:5,borderRadius:12,cursor:"pointer",
                background:isSel?"rgba(34,211,238,.1)":"rgba(255,255,255,.03)",
                border:`1px solid ${isSel?"rgba(34,211,238,.4)":C.border}`,transition:"all .2s"}}>
              <div style={{width:40,height:40,borderRadius:10,background:"rgba(34,211,238,.1)",border:`1px solid rgba(34,211,238,.25)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:20}}>
                {b.type==="base"?"🏕":"🎣"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                  <span style={{fontSize:9,fontWeight:700,color:b.type==="base"?C.cyan:C.gold,background:b.type==="base"?"rgba(34,211,238,.12)":"rgba(245,158,11,.12)",border:`1px solid ${b.type==="base"?"rgba(34,211,238,.25)":"rgba(245,158,11,.25)"}`,borderRadius:5,padding:"1px 5px",flexShrink:0}}>{b.type==="base"?"БАЗА":"ПЛАТНАЯ"}</span>
                </div>
                <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.fish}</div>
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  <span style={{fontSize:10,color:C.accent,fontWeight:700}}>{b.price}</span>
                  {distStr&&<span style={{fontSize:10,color:C.dimmer}}>📍{distStr}</span>}
                  <span style={{fontSize:10,color:C.gold}}>★{b.rating}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShopsScreen({ userLat, userLon }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [shops, setShops] = useState(SHOPS);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(false);

  const fetchShops = async () => {
    const lat = userLat || 47.23;
    const lon = userLon || 39.75;
    setLoading(true);
    setFetchErr(false);
    try {
      const q = `[out:json][timeout:25];(node["shop"="fishing"](around:60000,${lat},${lon});way["shop"="fishing"](around:60000,${lat},${lon}););out body center;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("HTTP "+res.status);
      const json = await res.json();
      const els = (json.elements||[]).map(el=>{
        const t = el.tags||{};
        const elLat = el.lat??el.center?.lat, elLon = el.lon??el.center?.lon;
        if (!elLat||!elLon) return null;
        return {
          id: "osm_"+el.id,
          name: t.name||"Рыболовный магазин",
          addr: [t["addr:street"],t["addr:housenumber"]].filter(Boolean).join(", ")||t["addr:full"]||"",
          city: t["addr:city"]||t["addr:town"]||t["addr:village"]||"",
          phone: t.phone||t["contact:phone"]||"",
          hours: t.opening_hours||"",
          lat: elLat, lng: elLon,
          rating: null, cnt: 0,
          tags: ["снасти","рыболовный"], source: "osm"
        };
      }).filter(Boolean);
      setShops(els.length >= 3 ? els : SHOPS);
      if (els.length < 3) setFetchErr(true);
    } catch(e) {
      setFetchErr(true);
      setShops(SHOPS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ fetchShops(); }, []);

  const isOpen = (h) => {
    if (!h) return null;
    if (h === "24/7") return true;
    try {
      const m = h.replace("–","-").match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const now = new Date(), cur = now.getHours()*60+now.getMinutes();
      const open = +m[1]*60+(+m[2]), close = +m[3]*60+(+m[4]);
      return cur >= open && cur < close;
    } catch { return null; }
  };

  const Stars = ({r}) => {
    if (r === null || r === undefined) return null;
    const full = Math.floor(r), half = r%1 >= 0.5;
    return <span style={{color:"#f59e0b",fontSize:12,letterSpacing:1}}>{"★".repeat(full)}{half?"☆":""}{"☆".repeat(5-full-(half?1:0))}</span>;
  };

  const shopDist = (s) => userLat && userLon && s.lat && s.lng ? haversine(userLat, userLon, s.lat, s.lng) : null;

  const filtered = shops
    .filter(s=>{
      if (!search) return true;
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q)||(s.addr||"").toLowerCase().includes(q)||(s.city||"").toLowerCase().includes(q)||(s.tags||[]).some(t=>t.includes(q));
    })
    .sort((a,b)=>{ const da=shopDist(a),db=shopDist(b); return (da!==null&&db!==null)?da-db:0; });

  const centerLon = selected ? selected.lng : (userLon||39.75);
  const centerLat = selected ? selected.lat : (userLat||47.23);

  const userPt = userLat && userLon ? `~${userLon},${userLat},pm2yll1` : "";
  const mapSrc = selected
    ? `https://yandex.ru/map-widget/v1/?ll=${selected.lng},${selected.lat}&z=16&pt=${selected.lng},${selected.lat},pm2rdl1${userPt}&l=map`
    : `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent("рыболовный магазин")}&ll=${centerLon},${centerLat}&z=11${userPt?"&pt="+userPt.slice(1):""}&l=map`;

  const o = selected ? isOpen(selected.hours) : null;

  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:C.bg,overflow:"hidden"}}>
      <div style={{padding:"8px 12px",background:"rgba(7,17,30,.97)",backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.surfaceHi,borderRadius:12,padding:"9px 12px",border:`1px solid ${C.border}`}}>
          <MapPin size={15} color={C.muted}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск рыболовных магазинов..." style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:14}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1}}>×</button>}
        </div>
      </div>

      <div style={{flex:"0 0 44%",position:"relative",background:"#0a192f"}}>
        <YandexMapFrame src={mapSrc} iframeKey="yandex-shops-map" fallbackUrl={`https://yandex.ru/maps/?text=${encodeURIComponent("рыболовный магазин")}&ll=${centerLon},${centerLat}&z=11`}/>
        {selected&&(
          <div style={{position:"absolute",bottom:8,left:8,right:8,background:"rgba(7,17,30,.92)",backdropFilter:"blur(12px)",border:`1px solid ${C.borderHi}`,borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selected.name}</div>
              {o!==null&&<div style={{fontSize:10,color:o?"#2ecc71":"#ef4444"}}>{o?"● Открыто":"● Закрыто"} · {selected.hours}</div>}
            </div>
            <button onClick={()=>window.open(ymapsLL(selected.lat,selected.lng),"_blank","noopener,noreferrer")}
              style={{padding:"5px 12px",borderRadius:8,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:11,fontWeight:800,border:"none",cursor:"pointer",flexShrink:0}}>
              Маршрут
            </button>
            <button onClick={()=>setSelected(null)}
              style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.surface,color:C.muted,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={{flex:1,overflowY:"auto",background:"rgba(7,17,30,.98)",borderTop:`1px solid ${C.border}`}}>
        {selected?(
          <div style={{padding:"14px 14px 24px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <button onClick={()=>setSelected(null)} style={{background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 12px",color:C.muted,fontSize:12,cursor:"pointer"}}>
                ← Все магазины
              </button>
              {selected.city&&<span style={{fontSize:11,color:C.dimmer}}>{selected.city}</span>}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontSize:19,fontWeight:800,color:C.text,marginBottom:3}}>{selected.name}</div>
                {selected.rating!==null&&(
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <Stars r={selected.rating}/>
                    <span style={{color:"#f59e0b",fontSize:12,fontWeight:700}}>{selected.rating}</span>
                    {selected.cnt>0&&<span style={{color:C.muted,fontSize:11}}>({selected.cnt} отз.)</span>}
                  </div>
                )}
              </div>
              {o!==null&&(
                <div style={{padding:"5px 10px",borderRadius:8,background:o?"rgba(46,204,113,.15)":"rgba(239,68,68,.15)",border:`1px solid ${o?"rgba(46,204,113,.4)":"rgba(239,68,68,.4)"}`,fontSize:11,fontWeight:800,color:o?"#2ecc71":"#ef4444",whiteSpace:"nowrap"}}>
                  {o?"● Открыт":"● Закрыт"}
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12,padding:"10px 12px",background:C.surfaceHi,borderRadius:12,border:`1px solid ${C.border}`}}>
              {selected.addr&&<div style={{display:"flex",gap:8,alignItems:"center"}}><MapPin size={13} color={C.muted}/><span style={{color:C.text,fontSize:13}}>{selected.addr}{selected.city?`, ${selected.city}`:""}</span></div>}
              {selected.hours&&<div style={{display:"flex",gap:8,alignItems:"center"}}><Clock size={13} color={C.muted}/><span style={{color:C.text,fontSize:13}}>Работает: {selected.hours}</span></div>}
              {selected.phone&&<div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:13}}>📞</span><a href={`tel:${selected.phone}`} style={{color:C.accent,fontSize:13,textDecoration:"none",fontWeight:700}}>{selected.phone}</a></div>}
            </div>
            {(selected.tags||[]).length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {selected.tags.map(t=><span key={t} style={{padding:"3px 10px",borderRadius:20,background:C.accentDim,border:`1px solid ${C.borderHi}`,color:C.accent,fontSize:11,fontWeight:600}}>{t}</span>)}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>window.open(ymapsLL(selected.lat,selected.lng),"_blank","noopener,noreferrer")} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                📍 Маршрут
              </button>
              {selected.phone&&(
                <a href={`tel:${selected.phone}`} style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:13,fontWeight:800,cursor:"pointer",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  📞 Позвонить
                </a>
              )}
            </div>
          </div>
        ):(
          <div style={{padding:"12px 12px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:14,fontWeight:800,color:C.text}}>Рыболовные магазины</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {fetchErr&&<span style={{fontSize:10,color:"#f59e0b"}} title="Показаны сохранённые данные">⚠ офлайн</span>}
                {loading
                  ? <span style={{fontSize:11,color:C.accent}}>Загрузка...</span>
                  : <span style={{fontSize:11,color:C.muted,background:C.surfaceHi,padding:"3px 8px",borderRadius:8}}>{filtered.length} из {shops.length}</span>
                }
                <button onClick={fetchShops} disabled={loading} style={{background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 8px",color:C.muted,fontSize:13,cursor:"pointer"}} title="Обновить">↻</button>
              </div>
            </div>
            {loading?(
              <div style={{padding:32,textAlign:"center",color:C.muted,fontSize:13}}>
                <div style={{fontSize:28,marginBottom:8}}>🔍</div>
                Поиск магазинов рядом с вами...
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filtered.map(shop=>{
                  const op = isOpen(shop.hours);
                  const dist = shopDist(shop);
                  return(
                    <button key={shop.id} onClick={()=>setSelected(shop)} style={{display:"flex",gap:10,padding:"11px 12px",borderRadius:12,background:C.surfaceHi,border:`1px solid ${C.border}`,cursor:"pointer",textAlign:"left",width:"100%"}}>
                      <div style={{width:42,height:42,borderRadius:12,background:C.accentDim,border:`1px solid ${C.borderHi}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:20}}>🎣</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                          <span style={{fontSize:14,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{shop.name}</span>
                          {op!==null&&<span style={{fontSize:10,fontWeight:700,color:op?"#2ecc71":"#ef4444",flexShrink:0,marginLeft:6}}>{op?"● Открыт":"● Закрыт"}</span>}
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[shop.addr,shop.city].filter(Boolean).join(", ")}</div>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          {shop.rating!==null&&<><Stars r={shop.rating}/><span style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>{shop.rating}</span></>}
                          {shop.hours&&<span style={{fontSize:10,color:C.dimmer}}>• {shop.hours.length>22?shop.hours.slice(0,20)+"…":shop.hours}</span>}
                          {dist!==null&&<span style={{fontSize:10,fontWeight:700,color:C.cyan,marginLeft:4}}>📍 {Math.round(dist)} км</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filtered.length===0&&<div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>Ничего не найдено</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapScreen({ userLat, userLon, user }) {
  const [mapTab, setMapTab] = useState("spots");
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:"rgba(7,17,30,.92)",flexShrink:0}}>
        {[{id:"spots",label:"📍 Точки"},{id:"bases",label:"🏕 Базы"},{id:"shops",label:"🏪 Магазины"}].map(t=>(
          <button key={t.id} onClick={()=>setMapTab(t.id)} style={{flex:1,padding:"11px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:mapTab===t.id?C.accent:C.muted,borderBottom:mapTab===t.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .2s"}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflow:"hidden"}}>
        {mapTab==="spots"&&<SpotsScreen userLat={userLat} userLon={userLon} user={user}/>}
        {mapTab==="bases"&&<BasesScreen userLat={userLat} userLon={userLon}/>}
        {mapTab==="shops"&&<ShopsScreen userLat={userLat} userLon={userLon}/>}
      </div>
    </div>
  );
}
