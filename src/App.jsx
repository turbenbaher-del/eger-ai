import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { C } from './tokens.js';
import { auth, db, logEvent } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { setUserGeo } from './data/fishing.jsx';
import { fetchWeather } from './lib/weather.js';
import { WaveIcon } from './components/ui.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
import CatchModal from './components/CatchModal.jsx';
import { Fish, BookOpen, MapPin, MessageCircle, Newspaper, User, Home } from './icons/index.jsx';
import { setDoc, serverTimestamp } from 'firebase/firestore';

// Eager — first screen
import HomeScreen from './screens/HomeScreen.jsx';

// Lazy — loaded on demand
const ChatScreen       = lazy(() => import('./screens/ChatScreen.jsx'));
const WeatherScreen    = lazy(() => import('./screens/WeatherScreen.jsx'));
const MapScreen        = lazy(() => import('./screens/MapScreen.jsx'));
const DiaryScreen      = lazy(() => import('./screens/DiaryScreen.jsx'));
const CommunityScreen  = lazy(() => import('./screens/CommunityScreen.jsx'));
const NewsScreen       = lazy(() => import('./screens/NewsScreen.jsx'));
const ProfileScreen    = lazy(() => import('./screens/ProfileScreen.jsx'));
const LeaderboardScreen= lazy(() => import('./screens/LeaderboardScreen.jsx'));
const TournamentScreen = lazy(() => import('./screens/TournamentScreen.jsx'));

function ScreenFallback() {
  return (
    <div style={{display:'grid',placeItems:'center',height:'100%',color:'#2ecc71'}}>
      <div style={{width:32,height:32,borderRadius:'50%',border:'3px solid #2ecc71',borderTopColor:'transparent',animation:'spin 1s linear infinite'}}/>
    </div>
  );
}

export default function App() {
  useEffect(()=>{
    const s=document.getElementById("splash");
    if(!s) return;
    s.style.opacity="0";
    setTimeout(()=>s.remove(), 350);
  },[]);

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [tab, setTab] = useState("home");
  const [showCatch, setShowCatch] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(()=>!localStorage.getItem("eger_onboarded"));
  const [waterLevel, setWaterLevel] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadNews, setUnreadNews] = useState(0);
  const tabRef = useRef("home");
  const [userLat, setUserLat] = useState(null);
  const [userLon, setUserLon] = useState(null);
  const geoRef = useRef({lat: null, lon: null});
  const [fabPos, setFabPos] = useState(()=>{ const s=localStorage.getItem("eger_fab_pos"); return s?JSON.parse(s):null; });
  const fabDrag = useRef({active:false,moved:false,startX:0,startY:0,startLeft:0,startTop:0});
  const lastFabPos = useRef(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlinePending, setOfflinePending] = useState(()=>parseInt(localStorage.getItem("eger_offline_pending")||"0"));
  const [deepLinkRecord, setDeepLinkRecord] = useState(null);

  const onFabTouchStart = useCallback((e)=>{
    const t=e.touches[0];
    const el=e.currentTarget.getBoundingClientRect();
    fabDrag.current={active:true,moved:false,startX:t.clientX,startY:t.clientY,startLeft:el.left,startTop:el.top};
  },[]);
  const onFabTouchMove = useCallback((e)=>{
    if(!fabDrag.current.active) return;
    const t=e.touches[0];
    const dx=t.clientX-fabDrag.current.startX, dy=t.clientY-fabDrag.current.startY;
    if(!fabDrag.current.moved && Math.abs(dx)<5 && Math.abs(dy)<5) return;
    fabDrag.current.moved=true;
    e.preventDefault();
    const newLeft=Math.max(8,Math.min(window.innerWidth-68, fabDrag.current.startLeft+dx));
    const newTop=Math.max(8,Math.min(window.innerHeight-68, fabDrag.current.startTop+dy));
    const pos={left:newLeft,top:newTop};
    lastFabPos.current=pos;
    setFabPos(pos);
  },[]);
  const onFabTouchEnd = useCallback((e)=>{
    if(!fabDrag.current.active) return;
    fabDrag.current.active=false;
    if(fabDrag.current.moved){
      if(lastFabPos.current) localStorage.setItem("eger_fab_pos",JSON.stringify(lastFabPos.current));
    } else {
      logEvent("catch_button_tapped"); setShowCatch(true);
    }
  },[]);

  useEffect(()=>{ const u=onAuthStateChanged(auth, u=>{setUser(u);setAuthLoading(false);}); return u; },[]);

  useEffect(()=>{
    const on=()=>{ setIsOffline(false); localStorage.setItem("eger_offline_pending","0"); setOfflinePending(0); };
    const off=()=>setIsOffline(true);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  useEffect(()=>{ logEvent("app_open",{source:"direct"}); },[]);

  useEffect(()=>{
    const catchId = new URLSearchParams(window.location.search).get("catch");
    if (!catchId) return;
    getDoc(doc(db, "reports", catchId)).then(snap=>{
      if (snap.exists()) setDeepLinkRecord({id:snap.id,...snap.data()});
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    const unsub=onSnapshot(doc(db, "water_levels", "don-rostov"), snap=>{ if(snap.exists()) setWaterLevel(snap.data()); });
    return unsub;
  },[]);

  const loadWeather = useCallback(async()=>{
    setWeatherLoading(true);
    const {lat, lon} = geoRef.current;
    try { setWeather(await fetchWeather(lat||47.27, lon||39.87)); } catch(e){ console.log("weather error",e); }
    setWeatherLoading(false);
  },[]);

  useEffect(()=>{ loadWeather(); const t=setInterval(loadWeather,10*60*1000); return()=>clearInterval(t); },[loadWeather]);

  // Геолокация пользователя
  useEffect(()=>{
    if(!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        setUserGeo(lat, lon);  // update fishing.jsx module-level vars
        geoRef.current = {lat, lon};
        setUserLat(lat); setUserLon(lon);
        (async()=>{
          setWeatherLoading(true);
          try { setWeather(await fetchWeather(lat, lon)); } catch(e){}
          setWeatherLoading(false);
        })();
        auth.currentUser && setDoc(
          doc(db, "users", auth.currentUser.uid),
          {lat, lng:lon, geoAt:serverTimestamp()},
          {merge:true}
        ).catch(()=>{});
      },
      err => console.log("geo denied", err.message),
      {enableHighAccuracy: false, timeout: 12000, maximumAge: 5*60*1000}
    );
  },[]);

  useEffect(()=>{
    if(!user) return;
    if("Notification" in window && Notification.permission==="default"){
      setTimeout(()=>Notification.requestPermission(), 8000);
    }
  },[user]);

  // Слушатель новых сообщений чата
  useEffect(()=>{
    let first=true;
    const unsub=onSnapshot(
      query(collection(db, "messages"), orderBy("timestamp","asc"), limit(200)),
      snap=>{
        if(first){ first=false; return; }
        snap.docChanges().filter(c=>c.type==="added").forEach(c=>{
          if(tabRef.current==="community") return;
          const d=c.doc.data();
          setUnreadChat(n=>n+1);
          if("Notification" in window && Notification.permission==="granted" && !document.hasFocus()){
            new Notification("💬 Новое сообщение в чате",{
              body:`${d.displayName||"Рыбак"}: ${d.text||"прикрепил медиафайл"}`,
              icon:"https://eger-ai.app/icons/icon-192.png",
              tag:"chat-msg",
            });
          }
        });
      }
    );
    return unsub;
  },[]);

  // Слушатель новых отчётов
  useEffect(()=>{
    let first=true;
    const unsub=onSnapshot(
      query(collection(db, "reports"), orderBy("timestamp","desc"), limit(50)),
      snap=>{
        if(first){ first=false; return; }
        snap.docChanges().filter(c=>c.type==="added").forEach(c=>{
          if(tabRef.current==="news") return;
          const d=c.doc.data();
          setUnreadNews(n=>n+1);
          if("Notification" in window && Notification.permission==="granted" && !document.hasFocus()){
            new Notification("🐟 Новый отчёт о рыбалке",{
              body:`${d.author||"Рыбак"}: ${d.title||"добавил отчёт"}`,
              icon:"https://eger-ai.app/icons/icon-192.png",
              tag:"report-new",
            });
          }
        });
      }
    );
    return unsub;
  },[]);

  const prevTabRef = useRef("home");
  const goTab=(id)=>{
    prevTabRef.current=tabRef.current;
    tabRef.current=id;
    setTab(id);
    if(id==="community") setUnreadChat(0);
    if(id==="news") setUnreadNews(0);
  };

  if (authLoading) return (
    <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#07111e"}}>
      <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
    </div>
  );

  const NAV=[
    {id:"home",     label:"Главная", Icon:Home},
    {id:"diary",    label:"Дневник", Icon:BookOpen},
    {id:"chat",     label:"Егерь",   Icon:Fish},
    {id:"mapall",   label:"Карта",   Icon:MapPin},
    {id:"community",label:"Чат",     Icon:MessageCircle},
    {id:"news",     label:"Новости", Icon:Newspaper},
    {id:"profile",  label:"Профиль", Icon:User},
  ];

  return (
    <div style={{maxWidth:430,margin:"0 auto",height:"100dvh",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#07111e 0%,#0a192f 100%)",position:"relative",overflow:"hidden"}}>
      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} onSuccess={()=>setShowAuth(false)}/>}
      {showCatch && user && <CatchModal user={user} userLat={userLat} userLon={userLon} weather={weather} onClose={()=>setShowCatch(false)}/>}
      {showOnboarding && <OnboardingModal onDone={()=>{ localStorage.setItem("eger_onboarded","1"); setShowOnboarding(false); }}/>}
      {deepLinkRecord && (
        <div style={{position:"fixed",inset:0,zIndex:9500,background:"#07111e",display:"flex",flexDirection:"column"}}>
          <Suspense fallback={<ScreenFallback/>}>
            <DiaryScreen user={user} onLogin={()=>setShowAuth(true)} userLat={userLat} userLon={userLon}/>
          </Suspense>
        </div>
      )}
      {isOffline&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:9998,background:"rgba(239,68,68,.95)",color:"#fff",fontSize:12,fontWeight:700,textAlign:"center",padding:"8px 0",letterSpacing:.5,backdropFilter:"blur(8px)"}}>📵 Нет интернета{offlinePending>0?` — ${offlinePending} записей ожидают синхронизации`:" — офлайн-режим"}</div>}
      {!showCatch && (
        <button
          onTouchStart={onFabTouchStart}
          onTouchMove={onFabTouchMove}
          onTouchEnd={onFabTouchEnd}
          aria-label="Добавить улов"
          onClick={fabDrag.current.moved?undefined:()=>{logEvent("catch_button_tapped");if(user){setShowCatch(true);}else{setShowAuth(true);}}}
          style={{
            position:"fixed",
            ...(fabPos
              ? {left:fabPos.left,top:fabPos.top}
              : {bottom:"calc(env(safe-area-inset-bottom,0px) + 76px)",right:"max(calc(50vw - 199px),16px)"}),
            width:60,height:60,borderRadius:30,
            background:"linear-gradient(135deg,#1a8a50,#2ecc71)",
            border:"none",cursor:"grab",zIndex:99,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:26,
            animation:fabDrag.current.active?"none":"fabPulse 3s ease infinite",
            touchAction:"none",
            userSelect:"none",
            WebkitUserSelect:"none",
          }}>
          🐟
        </button>
      )}

      <div style={{position:"absolute",top:-100,left:-60,width:280,height:280,borderRadius:"50%",pointerEvents:"none",zIndex:0,background:"radial-gradient(circle,rgba(46,204,113,.08) 0%,transparent 70%)"}}/>
      <div style={{position:"absolute",bottom:80,right:-80,width:240,height:240,borderRadius:"50%",pointerEvents:"none",zIndex:0,background:"radial-gradient(circle,rgba(34,211,238,.07) 0%,transparent 70%)"}}/>

      <header style={{padding:"48px 16px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(7,17,30,.85)",backdropFilter:"blur(24px)",borderBottom:`1px solid ${C.border}`,position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 18px ${C.accentGlow}`}}><Fish size={21} color="#07111e"/></div>
          <div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,letterSpacing:2.5,lineHeight:1,background:"linear-gradient(90deg,#fff 20%,#2ecc71 80%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Егерь ИИ</div>
            <div style={{fontSize:10,color:C.dimmer,letterSpacing:.5}}>Умный помощник рыбака</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
          {user ? (
            <div style={{display:"flex",alignItems:"center",gap:6,background:C.accentDim,border:`1px solid ${C.borderHi}`,borderRadius:20,padding:"5px 10px"}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#07111e"}}>{(user.displayName||"Р")[0].toUpperCase()}</div>
              <span style={{fontSize:11,color:C.accent,fontWeight:700}}>{(user.displayName||"").split(" ")[0]}</span>
            </div>
          ) : (
            <button onClick={()=>setShowAuth(true)} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:11,fontWeight:700,cursor:"pointer"}}>Войти</button>
          )}
          {(()=>{
            const seaLvl={1:-20,2:-15,3:15,4:80,5:40,6:5,7:-10,8:-15,9:-5,10:0,11:-10,12:-20};
            const lvl=waterLevel?waterLevel.level:(seaLvl[new Date().getMonth()+1]||0);
            const lvlStr=`Дон ${lvl>=0?'+':''}${lvl} см`;
            return (
              <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",borderRadius:20,padding:"4px 10px"}}>
                <WaveIcon size={14}/>
                <span style={{fontSize:10,color:C.cyan,fontWeight:700}}>{lvlStr}</span>
              </div>
            );
          })()}
        </div>
      </header>

      <main key={tab} style={{flex:1,overflow:"hidden",position:"relative",zIndex:1,animation:"fadeIn .2s ease"}}>
        <Suspense fallback={<ScreenFallback/>}>
          {tab==="home"       && <HomeScreen onGoChat={()=>goTab("chat")} weather={weather} weatherLoading={weatherLoading} onRefreshWeather={loadWeather} setTab={goTab} userLat={userLat} userLon={userLon} user={user} onLogin={()=>setShowAuth(true)}/>}
          {tab==="diary"      && <DiaryScreen user={user} onLogin={()=>setShowAuth(true)} userLat={userLat} userLon={userLon}/>}
          {tab==="chat"       && <ChatScreen weather={weather} userLat={userLat} userLon={userLon} user={user} onLogin={()=>setShowAuth(true)}/>}
          {(tab==="mapall"||tab==="spots"||tab==="map") && <MapScreen userLat={userLat} userLon={userLon} user={user}/>}
          {tab==="community"  && <CommunityScreen user={user} onLogin={()=>setShowAuth(true)}/>}
          {tab==="news"       && <NewsScreen user={user} onLogin={()=>setShowAuth(true)} userLat={userLat} userLon={userLon}/>}
          {tab==="weather"    && <WeatherScreen weather={weather} weatherLoading={weatherLoading} onRefresh={loadWeather}/>}
          {tab==="leaderboard"&& <LeaderboardScreen onBack={()=>goTab(prevTabRef.current||"profile")} user={user}/>}
          {tab==="tournament" && <TournamentScreen onBack={()=>goTab(prevTabRef.current||"profile")} user={user}/>}
          {tab==="profile"    && <ProfileScreen user={user} onLogin={()=>setShowAuth(true)} onNav={goTab}/>}
        </Suspense>
      </main>

      <nav aria-label="Основная навигация" style={{display:"flex",background:"rgba(7,17,30,.95)",backdropFilter:"blur(24px)",borderTop:`1px solid ${C.border}`,paddingBottom:"env(safe-area-inset-bottom,6px)",position:"relative",zIndex:10}}>
        {NAV.map(({id,label,Icon})=>{
          const active=tab===id;
          const badge=id==="community"?unreadChat:id==="news"?unreadNews:0;
          return (
            <button key={id} onClick={()=>goTab(id)} aria-label={label} aria-current={active?"page":undefined} style={{flex:1,padding:"8px 0 6px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
              {active&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:24,height:2,borderRadius:2,background:C.accent,boxShadow:`0 0 8px ${C.accent}`}}/>}
              <div style={{position:"relative",display:"inline-flex"}}>
                <div style={{width:34,height:34,borderRadius:10,background:active?C.accentDim:"transparent",border:`1px solid ${active?C.borderHi:"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>
                  <Icon size={17} color={active?C.accent:C.dimmer} style={active?{filter:`drop-shadow(0 0 5px ${C.accent})`}:undefined}/>
                </div>
                {badge>0&&<div style={{position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:8,background:"#ef4444",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",border:"2px solid #07111e",lineHeight:1,animation:"pulseGlow .8s ease infinite"}}>
                  {badge>99?"99+":badge}
                </div>}
              </div>
              <span style={{fontSize:11,letterSpacing:.3,fontWeight:active?700:500,color:active?C.accent:C.dimmer}}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
