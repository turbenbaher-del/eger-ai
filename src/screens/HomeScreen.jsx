import { useState, useEffect, useRef, useMemo } from 'react';
import { C, glass } from '../tokens.js';
import { Star, RefreshCw, Cloud, ChevronRight, Fish, Trophy, Anchor } from '../icons/index.jsx';
import { Thermometer, Droplets, Wind, Waves } from '../icons/index.jsx';
import { db, logEvent, functionsRegion } from '../firebase.js';
import { collection, doc, onSnapshot, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { calcBiteScore } from '../lib/weather.js';
import { haversine, moonPhase, seasonFish } from '../lib/utils.js';
import { ymapsLL, PRESSURE_DATA } from '../lib/utils.js';
import { WATER_BODIES, SPOT_LIST } from '../data/spots.js';
import { getNearestCity } from '../data/spots.js';
import { FISH_TYPES, FISHING_BASES } from '../data/fishing.jsx';
import { Sparkline, BiteArc, WPill } from '../components/ui.jsx';

export default function HomeScreen({ onGoChat, weather, weatherLoading, onRefreshWeather, setTab, userLat, userLon, user, onLogin }) {
  const month = new Date().getMonth();
  const biteScore = weather ? calcBiteScore(weather.pressure, month, weather.wind, weather.waterTemp, weather.daily?.precipitation_probability_max?.[0]??0) : 8;
  const biteLabel = biteScore>=9?"Превосходный!":biteScore>=8?"Отличный!":biteScore>=6?"Хороший":biteScore>=4?"Средний":"Слабый";

  const nearestBodies = useMemo(()=>{
    if(!userLat||!userLon) return [WATER_BODIES[0]];
    return [...WATER_BODIES].sort((a,b)=>haversine(userLat,userLon,a.lat,a.lon)-haversine(userLat,userLon,b.lat,b.lon));
  },[userLat,userLon]);

  const [bodyIdx,setBodyIdx]=useState(0);
  useEffect(()=>{
    if(nearestBodies.length<=1) return;
    const t=setInterval(()=>setBodyIdx(i=>(i+1)%Math.min(nearestBodies.length,3)),30000);
    return()=>clearInterval(t);
  },[nearestBodies]);
  const currentBody = nearestBodies[bodyIdx]||WATER_BODIES[0];

  const [waterLevel,setWaterLevel]=useState(null);
  useEffect(()=>{
    const unsub=onSnapshot(doc(db, "water_levels", "don-rostov"), snap=>{
      if(snap.exists()) setWaterLevel(snap.data());
    });
    return unsub;
  },[]);

  const seasonalLevel=()=>{const m=new Date().getMonth()+1;const lvl={1:-20,2:-15,3:15,4:80,5:40,6:5,7:-10,8:-15,9:-5,10:0,11:-10,12:-20};return lvl[m]||0;};
  const levelVal = waterLevel ? waterLevel.level : seasonalLevel();
  const levelStr = `${levelVal>=0?'+':''}${levelVal} см`;

  const nearestSpots = useMemo(()=>{
    if(!userLat||!userLon) return SPOT_LIST.slice(0,3);
    return [...SPOT_LIST]
      .sort((a,b)=>haversine(userLat,userLon,a.lat,a.lon)-haversine(userLat,userLon,b.lat,b.lon))
      .slice(0,3);
  },[userLat,userLon]);
  const nowHour = new Date().getHours();
  const pressureData = useMemo(()=>{
    if (!weather?.hourly?.surface_pressure) return PRESSURE_DATA;
    return Array.from({length:12},(_,i)=>{
      const h = nowHour - 5 + i;
      const idx = ((h % 24) + 24) % 24;
      const raw = idx < weather.hourly.surface_pressure.length
        ? weather.hourly.surface_pressure[idx]
        : weather.pressure / 0.750064;
      return Math.round(raw * 0.750064);
    });
  },[weather, nowHour]);
  const pressureLabels = useMemo(()=>{
    return Array.from({length:6},(_,i)=>{
      if(i===2) return "сейчас";
      const offset = [-4,-2,0,2,4,6][i];
      const h = ((nowHour + offset) % 24 + 24) % 24;
      return `${h}ч`;
    });
  },[nowHour]);
  const pressureTrend = useMemo(()=>{
    if (!weather?.hourly?.surface_pressure || nowHour < 2) return "";
    const curr = Math.round(weather.hourly.surface_pressure[nowHour] * 0.750064);
    const prev = Math.round(weather.hourly.surface_pressure[Math.max(0, nowHour-3)] * 0.750064);
    return curr - prev > 2 ? " ▲" : curr - prev < -2 ? " ▼" : " →";
  },[weather, nowHour]);

  const [recentCatches, setRecentCatches] = useState([]);
  useEffect(()=>{
    getDocs(query(collection(db, "reports"), orderBy("timestamp","desc"), limit(5)))
      .then(snap=>setRecentCatches(snap.docs.map(d=>({...d.data(),id:d.id}))))
      .catch(()=>{});
  },[]);

  const [quickStats, setQuickStats] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  useEffect(()=>{
    if(!user?.uid) return;
    getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), limit(200)))
      .then(snap=>{
        const recs=snap.docs.map(d=>d.data());
        const total=recs.length;
        const best=recs.reduce((b,r)=>((r.weightGrams||0)>(b||0)?r.weightGrams:b),0);
        const now2=new Date(), ms=new Date(now2.getFullYear(),now2.getMonth(),1);
        const thisMonth=recs.filter(r=>{const d=r.createdAt?.toDate?.();return d&&d>=ms;}).length;
        setQuickStats({total,bestKg:best?+(best/1000).toFixed(2):null,thisMonth});
        if(total>=3){
          const fc={},gc={},lc={},hc=Array(24).fill(0);
          recs.forEach(r=>{
            if(r.fishType) fc[r.fishType]=(fc[r.fishType]||0)+1;
            if(r.gearType) gc[r.gearType]=(gc[r.gearType]||0)+1;
            if(r.locationName) lc[r.locationName]=(lc[r.locationName]||0)+1;
            const d=r.createdAt?.toDate?.(); if(d) hc[d.getHours()]++;
          });
          const tf=Object.entries(fc).sort((a,b)=>b[1]-a[1])[0];
          const tg=Object.entries(gc).sort((a,b)=>b[1]-a[1])[0];
          const tl=Object.entries(lc).sort((a,b)=>b[1]-a[1])[0];
          setUserProfile({
            topFish:tf?{type:tf[0],name:FISH_TYPES.find(f=>f.id===tf[0])?.name||tf[0]}:null,
            topGear:tg?{name:tg[0]}:null,
            topLoc:tl?{name:tl[0]}:null,
            bestHour:hc.indexOf(Math.max(...hc)),
            total,
          });
        }
      }).catch(()=>{});
  },[user?.uid]);

  const [nearbyCatches, setNearbyCatches] = useState([]);
  useEffect(()=>{
    if(!userLat||!userLon) return;
    const since = new Date(Date.now() - 6*60*60*1000);
    getDocs(query(collection(db, "reports"), where("timestamp",">=",Timestamp.fromDate(since)), orderBy("timestamp","desc"), limit(50)))
      .then(snap=>{
        const near = snap.docs.map(d=>({...d.data(),id:d.id})).filter(r=>{
          const rlon = r.lon||r.lng;
          if(!r.lat||!rlon) return false;
          return haversine(userLat,userLon,r.lat,rlon)<=20;
        }).slice(0,3);
        setNearbyCatches(near);
      }).catch(()=>{});
  },[userLat,userLon]);

  const [egerAdvice, setEgerAdvice] = useState("");
  const [egerAdviceLoading, setEgerAdviceLoading] = useState(false);
  const adviceFetchedRef = useRef(false);

  useEffect(()=>{
    if (!weather || adviceFetchedRef.current) return;
    const cacheKey = `eger_home_advice_${new Date().toISOString().slice(0,13)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { setEgerAdvice(cached); return; }
    adviceFetchedRef.current = true;
    setEgerAdviceLoading(true);
    const moon = moonPhase();
    let pDir=0;
    if(weather.hourly?.surface_pressure && nowHour>=3){
      pDir=Math.round(weather.hourly.surface_pressure[nowHour]*0.750064)
          -Math.round(weather.hourly.surface_pressure[Math.max(0,nowHour-3)]*0.750064);
    }
    const timeLabel = nowHour>=22||nowHour<4?"ночь ("+nowHour+":00)":nowHour>=4&&nowHour<8?"рассвет ("+nowHour+":00)":nowHour>=8&&nowHour<13?"утро ("+nowHour+":00)":nowHour>=18&&nowHour<22?"вечер ("+nowHour+":00)":"день ("+nowHour+":00)";
    const pTrend = pDir>2?"растёт":pDir<-2?"падает":"стабильное";
    const spotName = nearestSpots[0]?.name||currentBody.name;
    const contextLines = [
      `Сейчас: ${timeLabel}, ${new Date().toLocaleDateString("ru-RU",{day:"2-digit",month:"long"})}, сезон — месяц ${month+1}`,
      `Погода: воздух +${weather.airTemp}°C, вода +${weather.waterTemp}°C, ветер ${weather.wind} м/с, давление ${weather.pressure} мм (${pTrend})`,
      `Луна: ${moon.ico} ${moon.tip}`,
      `Индекс клёва: ${biteScore}/10 (${biteLabel})`,
      `Ближайшее место: ${spotName}`,
      `Активная рыба сезона: ${seasonFish(month)}`,
      userProfile?.total>=3?`Статистика рыбака: ${userProfile.total} уловов, лучший час ${userProfile.bestHour}:00${userProfile.topFish?`, чаще ловит ${userProfile.topFish.name}`:""}${userProfile.topGear?` на ${userProfile.topGear.name}`:""}${userProfile.topLoc?` у ${userProfile.topLoc.name}`:""}`:null,
      nearbyCatches[0]?(()=>{const nc=nearbyCatches[0];const mins=Math.round((Date.now()-(nc.timestamp?.toMillis?.()??Date.now()))/60000);return `Рядом только что поймали: ${nc.fish||"рыбу"}${nc.weight?" "+nc.weight+" кг":""} — ${mins<60?mins+" мин":Math.floor(mins/60)+"ч"} назад`;})():null,
    ].filter(Boolean).join("\n");

    httpsCallable(functionsRegion, "askEger")({
      messages:[{role:"user",content:`Дай совет рыбаку: что ловить, на что и почему. Ровно 30–40 слов, без заголовков и вступлений, сразу по делу. Пиши как опытный местный рыбак.\n\nДанные:\n${contextLines}`}],
      weather:{temp:weather.airTemp,wind:weather.wind,pressure:weather.pressure,waterTemp:weather.waterTemp},
      mode:"home_advice",
    }).then(r=>{
      const text=r.data?.text||r.data?.message||"";
      if(text){ setEgerAdvice(text); sessionStorage.setItem(cacheKey,text); }
      setEgerAdviceLoading(false);
    }).catch(()=>{ setEgerAdviceLoading(false); });
  },[weather]);

  return (
    <div style={{padding:"0 14px",overflowY:"auto",height:"100%",paddingBottom:20}}>
      <div style={{...glass(`0 8px 32px rgba(0,0,0,.4),0 0 0 1px ${C.borderHi}`),background:"linear-gradient(135deg,rgba(46,204,113,.12) 0%,rgba(34,211,238,.08) 50%,rgba(59,130,246,.10) 100%)",padding:20,marginBottom:14,position:"relative",overflow:"hidden",animation:"fadeUp .5s ease"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(46,204,113,.15) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <Star size={12} color={C.gold} fill={C.gold}/>
              <span style={{fontSize:10,color:C.gold,letterSpacing:2.5,fontWeight:700}}>ПРОГНОЗ ДНЯ</span>
              <button onClick={onRefreshWeather} style={{background:"none",border:"none",cursor:"pointer",padding:2,marginLeft:4}}>
                <RefreshCw size={11} color={weatherLoading?C.accent:C.dimmer} style={weatherLoading?{animation:"spin 1s linear infinite"}:undefined}/>
              </button>
            </div>
            <div style={{fontSize:20,fontWeight:800,color:C.text,lineHeight:1.2}}>{biteLabel}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2,display:"flex",alignItems:"center",gap:4}}>
              {userLat?"📍":"🗺"}
              <span key={currentBody.name} style={{animation:"textSwap 30s ease",display:"inline-block",color:C.accent,fontWeight:700}}>{currentBody.name}</span>
              {userLat&&(()=>{const c=getNearestCity(userLat,userLon);return c?<span style={{color:C.dimmer}}> · {c.name}</span>:null;})()}
              <span>· {weather?"обновлено "+weather.updated:"загрузка..."}</span>
            </div>
          </div>
          <BiteArc score={biteScore}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:10,color:C.dimmer,letterSpacing:1.5}}>ДАВЛЕНИЕ (ммрт) · 12 ч</span>
            <span style={{fontSize:11,fontWeight:700,color:C.accent}}>{weather?`${weather.pressure} мм${pressureTrend}`:"…"}</span>
          </div>
          <Sparkline data={pressureData} nowIdx={5}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            {pressureLabels.map((l,i)=>(
              <span key={i} style={{fontSize:9,color:i===2?C.accent:C.dimmer,fontWeight:i===2?700:400}}>{l}</span>
            ))}
          </div>
        </div>
        <div style={{background:"rgba(0,0,0,.3)",borderRadius:14,padding:"12px 14px",borderLeft:`3px solid ${C.accent}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
            <div style={{fontSize:10,color:C.accent,letterSpacing:2,fontWeight:700}}>ИИ-СОВЕТ ЕГЕРЯ</div>
            {!egerAdviceLoading&&(
              <button onClick={()=>{
                adviceFetchedRef.current=false;
                const cacheKey=`eger_home_advice_${new Date().toISOString().slice(0,13)}`;
                sessionStorage.removeItem(cacheKey);
                setEgerAdvice(""); setEgerAdviceLoading(true);
                const moon=moonPhase();
                let pDir=0;
                if(weather?.hourly?.surface_pressure&&nowHour>=3){pDir=Math.round(weather.hourly.surface_pressure[nowHour]*0.750064)-Math.round(weather.hourly.surface_pressure[Math.max(0,nowHour-3)]*0.750064);}
                const pTrend=pDir>2?"растёт":pDir<-2?"падает":"стабильное";
                const spotName=nearestSpots[0]?.name||currentBody.name;
                const contextLines=[`Сейчас: ${nowHour}:00, ${new Date().toLocaleDateString("ru-RU",{day:"2-digit",month:"long"})}, месяц ${month+1}`,`Погода: воздух +${weather?.airTemp}°C, вода +${weather?.waterTemp}°C, ветер ${weather?.wind} м/с, давление ${weather?.pressure} мм (${pTrend})`,`Луна: ${moon.ico} ${moon.tip}`,`Индекс клёва: ${biteScore}/10 (${biteLabel})`,`Ближайшее место: ${spotName}`,`Активная рыба: ${seasonFish(month)}`,userProfile?.total>=3?`Статистика: ${userProfile.total} уловов, лучший час ${userProfile.bestHour}:00${userProfile.topFish?`, ловит ${userProfile.topFish.name}`:""}`:null,nearbyCatches[0]?(()=>{const nc=nearbyCatches[0];const mins=Math.round((Date.now()-(nc.timestamp?.toMillis?.()??Date.now()))/60000);return`Рядом поймали: ${nc.fish||"рыбу"} — ${mins<60?mins+" мин":Math.floor(mins/60)+"ч"} назад`;})():null].filter(Boolean).join("\n");
                httpsCallable(functionsRegion, "askEger")({messages:[{role:"user",content:`Дай совет рыбаку: что ловить, на что и почему. Ровно 30–40 слов, без заголовков и вступлений, сразу по делу. Пиши как опытный местный рыбак.\n\nДанные:\n${contextLines}`}],weather:{temp:weather?.airTemp,wind:weather?.wind,pressure:weather?.pressure,waterTemp:weather?.waterTemp},mode:"home_advice"}).then(r=>{const text=r.data?.text||r.data?.message||"";if(text){setEgerAdvice(text);sessionStorage.setItem(cacheKey,text);}setEgerAdviceLoading(false);}).catch(()=>setEgerAdviceLoading(false));
              }} style={{background:"none",border:"none",cursor:"pointer",padding:2,opacity:.6}}>
                <RefreshCw size={11} color={C.accent}/>
              </button>
            )}
          </div>
          {egerAdviceLoading?(
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:4}}>
              <div style={{display:"flex",gap:4}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`bounce 1.2s ease ${i*0.2}s infinite`}}/>)}
              </div>
              <span style={{fontSize:12,color:C.muted}}>Егерь думает...</span>
            </div>
          ):(
            <div style={{fontSize:13,color:"rgba(232,244,240,.9)",lineHeight:1.75,whiteSpace:"pre-line"}}>
              {egerAdvice||"Нажми обновить для получения совета"}
            </div>
          )}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14,animation:"fadeUp .6s ease"}}>
        <WPill Icon={Thermometer} val={weather?(weather.airTemp>0?`+${weather.airTemp}°C`:`${weather.airTemp}°C`):"…"} label="воздух" color={C.gold} loading={weatherLoading}/>
        <WPill Icon={Droplets}    val={weather?(weather.waterTemp>0?`+${weather.waterTemp}°C`:`${weather.waterTemp}°C`):"…"} label="вода"   color={C.cyan} loading={weatherLoading}/>
        <WPill Icon={Wind}        val={weather?`${weather.wind} м/с`:"…"}  label={weather&&weather.windDir!=null?(()=>{const dirs=["С","СВ","В","ЮВ","Ю","ЮЗ","З","СЗ"];return dirs[Math.round(weather.windDir/45)%8];})():"ветер"} color={C.blue} loading={weatherLoading}/>
        <WPill Icon={Waves}       val={levelStr} label={waterLevel?(levelVal>20?"▲ растёт":levelVal<-20?"▼ низкий":"→ норма"):"Дон · сезон"} color={levelVal>20?C.cyan:levelVal<-20?"#ef4444":C.accent} loading={false}/>
      </div>
      <button onClick={()=>setTab("weather")} style={{width:"100%",padding:"8px 14px",background:"none",border:`1px solid ${C.border}`,borderRadius:12,color:C.muted,fontSize:12,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        <Cloud size={13} color={C.cyan}/><span style={{color:C.cyan,fontWeight:600}}>Подробный прогноз погоды →</span>
      </button>
      {(()=>{
        const now=new Date(), m=now.getMonth()+1, d=now.getDate();
        const inRange=(sm,sd,em,ed)=>(m>sm||(m===sm&&d>=sd))&&(m<em||(m===em&&d<=ed));
        const bans=[];
        if(inRange(4,1,5,31)) bans.push("🚫 Нерестовый запрет (до 31 мая): запрещён лов у берегов Дона");
        if(inRange(4,1,5,15)) bans.push("🚫 Запрет на судака и щуку (до 15 мая)");
        if(inRange(3,15,4,30)) bans.push("🚫 Запрет спиннинга на щуку (15 мар — 30 апр)");
        if(inRange(11,1,12,31)||inRange(1,1,2,28)) bans.push("✅ Зимний сезон — доступна подлёдная ловля");
        const allowed=[];
        if(inRange(6,1,10,31)) allowed.push("✅ Летний сезон — без ограничений на донку и спиннинг");
        if(bans.length===0&&allowed.length===0) allowed.push("✅ Активных запретов нет — рыбачь законно!");
        const items=[...bans,...allowed];
        const hasBan=bans.length>0;
        return(
          <div style={{...glass(),padding:"10px 14px",marginBottom:10,border:`1px solid ${hasBan?"rgba(239,68,68,.35)":"rgba(46,204,113,.3)"}`,background:hasBan?"rgba(239,68,68,.06)":"rgba(46,204,113,.05)"}}>
            <div style={{fontSize:10,fontWeight:700,color:hasBan?"#ef4444":C.accent,letterSpacing:1,marginBottom:6}}>⚖️ ЗАПРЕТЫ И ОГРАНИЧЕНИЯ (Ростовская обл.)</div>
            {items.map((ban,i)=><div key={i} style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:i<items.length-1?3:0}}>{ban}</div>)}
            <div style={{fontSize:9,color:C.dimmer,marginTop:6}}>Источник: Правила рыболовства для Азово-Черноморского рыбохозяйственного бассейна</div>
          </div>
        );
      })()}

      {user&&quickStats&&quickStats.total>0&&(
        <div style={{...glass(),padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:0,animation:"fadeUp .62s ease",background:"rgba(46,204,113,.05)"}}>
          <div style={{flex:1,textAlign:"center",borderRight:`1px solid ${C.border}`}}>
            <div style={{fontSize:20,fontWeight:800,color:C.accent}}>{quickStats.total}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>всего уловов</div>
          </div>
          <div style={{flex:1,textAlign:"center",borderRight:`1px solid ${C.border}`}}>
            <div style={{fontSize:20,fontWeight:800,color:C.cyan}}>{quickStats.thisMonth}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>в этом месяце</div>
          </div>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:800,color:C.gold}}>{quickStats.bestKg?`${quickStats.bestKg} кг`:"—"}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>лучший улов</div>
          </div>
        </div>
      )}
      {user===null&&(
        <div onClick={onLogin} style={{...glass(),padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10,cursor:"pointer",animation:"fadeUp .62s ease",background:"rgba(46,204,113,.04)"}}>
          <span style={{fontSize:13}}>👤</span>
          <span style={{fontSize:12,color:C.muted,flex:1}}>Войдите, чтобы вести личный дневник и статистику</span>
          <span style={{fontSize:12,color:C.accent,fontWeight:700}}>Войти →</span>
        </div>
      )}

      {nearbyCatches.length>0&&(
        <div style={{...glass(`0 0 0 1px rgba(46,204,113,.3)`),padding:"12px 14px",marginBottom:14,animation:"fadeUp .65s ease",background:"rgba(46,204,113,.07)"}}>
          <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:1.5,marginBottom:8}}>📍 ПОЙМАЛИ РЯДОМ (последние 6 ч)</div>
          {nearbyCatches.map((r,i)=>{
            const dist=Math.round(haversine(userLat,userLon,r.lat,r.lon||r.lng));
            const mins=Math.round((Date.now()-(r.timestamp?.toMillis?.()??Date.now()))/60000);
            const timeStr=mins<60?`${mins} мин назад`:`${Math.floor(mins/60)} ч назад`;
            return (
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:i>0?"8px 0 0":"0",borderTop:i>0?`1px solid ${C.border}`:"none"}}>
                <div style={{width:32,height:32,borderRadius:8,background:C.accentDim,border:`1px solid ${C.borderHi}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>🐟</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.fish||r.title||"Улов"} {r.weight?`· ${r.weight} кг`:""}</div>
                  <div style={{fontSize:10,color:C.muted}}>{r.displayName||"Рыбак"} · {dist} км · {timeStr}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(()=>{
        const allPts = [
          ...SPOT_LIST.map(s=>({...s,_type:"spot"})),
          ...FISHING_BASES.map(b=>({name:b.name,fish:b.fish,lat:b.lat,lon:b.lon,_type:"base",_base:b,Icon:Anchor})),
        ];
        const sorted = userLat&&userLon
          ? [...allPts].sort((a,b)=>haversine(userLat,userLon,a.lat,a.lon)-haversine(userLat,userLon,b.lat,b.lon))
          : allPts;
        const topPts = sorted.slice(0,5);
        const bs = biteScore||8;
        return (
        <div style={{animation:"fadeUp .7s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <span style={{fontSize:14,fontWeight:700,color:C.text}}>Горячие точки</span>
              {userLat&&<span style={{fontSize:10,color:C.dimmer,marginLeft:6}}>по геолокации</span>}
            </div>
            <span onClick={()=>setTab("map")} style={{fontSize:12,color:C.accent,display:"flex",alignItems:"center",gap:2,cursor:"pointer"}}>
              На карте <ChevronRight size={13}/>
            </span>
          </div>
          {topPts.map((s,i)=>{
            const distKm = userLat&&userLon ? Math.round(haversine(userLat,userLon,s.lat,s.lon)) : null;
            const isBase = s._type==="base";
            const distBonus = distKm===null?0:distKm<5?2:distKm<15?1:distKm<40?0:-1;
            const scoreVal = Math.max(1,Math.min(10,bs+distBonus-(i*0.3|0)));
            const scoreColor = scoreVal>=8?C.accent:scoreVal>=6?C.gold:"#ef4444";
            return (
            <a key={i} href={ymapsLL(s.lat,s.lon)} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
              <div style={{...glass(),padding:"11px 13px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:`1px solid ${isBase?"rgba(34,211,238,.25)":C.border}`,background:isBase?"rgba(34,211,238,.04)":""}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:isBase?"rgba(34,211,238,.12)":C.accentDim,border:`1px solid ${isBase?"rgba(34,211,238,.3)":C.borderHi}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <s.Icon size={16} color={isBase?C.cyan:C.accent}/>
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{s.name}</div>
                      {isBase&&<span style={{fontSize:9,fontWeight:700,color:C.cyan,background:"rgba(34,211,238,.12)",border:"1px solid rgba(34,211,238,.25)",borderRadius:5,padding:"1px 5px",flexShrink:0}}>БАЗА</span>}
                    </div>
                    <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {s.fish.split(",").slice(0,3).join(", ")}{distKm!==null?` · ${distKm} км`:""}
                      {isBase&&s._base?.price?` · ${s._base.price}`:""}
                    </div>
                  </div>
                </div>
                <div style={{flexShrink:0,background:`${scoreColor}18`,border:`1px solid ${scoreColor}55`,borderRadius:8,padding:"4px 10px",fontSize:13,fontWeight:800,color:scoreColor}}>{scoreVal}/10</div>
              </div>
            </a>
            );
          })}
          <div onClick={onGoChat} style={{...glass(`0 0 0 1px ${C.borderHi}`),background:"linear-gradient(135deg,rgba(46,204,113,.18),rgba(34,211,238,.10))",padding:"14px 18px",marginTop:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px ${C.accentGlow}`}}><Fish size={19} color="#07111e"/></div>
              <div><div style={{fontSize:13,fontWeight:700,color:C.text}}>Спроси Егеря</div><div style={{fontSize:11,color:C.muted}}>ИИ-помощник рыбака</div></div>
            </div>
            <ChevronRight size={18} color={C.accent}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <div onClick={()=>setTab("leaderboard")} style={{...glass(),flex:1,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderRadius:16}}>
              <div style={{width:34,height:34,borderRadius:10,background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.25)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Trophy size={15} color={C.gold}/></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:C.text}}>Рейтинг</div><div style={{fontSize:10,color:C.muted}}>топ рыбаков</div></div>
              <ChevronRight size={12} color={C.dimmer}/>
            </div>
            <div onClick={()=>setTab("tournament")} style={{...glass(),flex:1,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderRadius:16}}>
              <div style={{width:34,height:34,borderRadius:10,background:"rgba(34,211,238,.10)",border:"1px solid rgba(34,211,238,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Star size={15} color={C.cyan}/></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:C.text}}>Турниры</div><div style={{fontSize:10,color:C.muted}}>соревнования</div></div>
              <ChevronRight size={12} color={C.dimmer}/>
            </div>
          </div>
        </div>
        );
      })()}
      {recentCatches.length>0&&(
        <div style={{animation:"fadeUp .8s ease",marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:14,fontWeight:700,color:C.text}}>Свежие уловы сообщества</span>
            <span onClick={()=>setTab("news")} style={{fontSize:12,color:C.accent,display:"flex",alignItems:"center",gap:2,cursor:"pointer"}}>Все <ChevronRight size={13}/></span>
          </div>
          {recentCatches.map((r,i)=>{
            const mins=r.timestamp?Math.round((Date.now()-r.timestamp.toMillis())/60000):null;
            const timeStr=mins!==null?(mins<60?`${mins} мин`:`${Math.floor(mins/60)} ч`):"";
            return (
              <div key={r.id} style={{...glass(),padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setTab("news")}>
                {r.photoUrls?.[0]
                  ? <img src={r.photoUrls[0]} alt="" style={{width:52,height:52,borderRadius:10,objectFit:"cover",flexShrink:0}}/>
                  : <div style={{width:52,height:52,borderRadius:10,background:C.accentDim,border:`1px solid ${C.borderHi}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>🐟</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title||r.fish||"Улов"}</div>
                  <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.displayName||r.author||"Рыбак"}{r.location?` · ${r.location}`:""}</div>
                </div>
                {timeStr&&<div style={{fontSize:10,color:C.dimmer,flexShrink:0}}>{timeStr} назад</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
