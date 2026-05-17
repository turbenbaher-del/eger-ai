import { useState, useEffect } from 'react';
import { C, glass } from '../tokens.js';
import { db, auth, messaging, VAPID_KEY, logEvent } from '../firebase.js';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc,
         query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { getToken } from 'firebase/messaging';
import { BADGE_DEFS } from '../data/fishing.jsx';
import { genUsername } from '../lib/utils.js';
import { Fish, Trophy, Star, AlertCircle, ChevronRight, LogOut } from '../icons/index.jsx';
import { RequireAuth } from '../components/AuthModal.jsx';

export default function ProfileScreen({ user, onLogin, onNav }) {
  if (!user) return <RequireAuth user={user} onLogin={onLogin}><div/></RequireAuth>;
  const [profileUsername, setProfileUsername] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [catchStats, setCatchStats] = useState(null);
  const [badges, setBadges] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [notifOn, setNotifOn] = useState(()=>!!localStorage.getItem("fcm_token"));
  const [userRank, setUserRank] = useState(null);

  const saveUsername = async () => {
    const u = usernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);
    if (!u) return;
    await setDoc(doc(db, "users", user.uid), {username:u}, {merge:true});
    setProfileUsername(u); setEditingUsername(false);
  };

  const shareProfile = async () => {
    const canvas = document.createElement("canvas");
    canvas.width=1080; canvas.height=540;
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0,0,1080,540);
    bg.addColorStop(0,"#07111e"); bg.addColorStop(1,"#0a192f");
    ctx.fillStyle=bg; ctx.fillRect(0,0,1080,540);
    const glow = ctx.createRadialGradient(200,150,0,200,150,400);
    glow.addColorStop(0,"rgba(46,204,113,0.22)"); glow.addColorStop(1,"transparent");
    ctx.fillStyle=glow; ctx.fillRect(0,0,1080,540);
    ctx.fillStyle="#2ecc71"; ctx.font="bold 32px sans-serif"; ctx.fillText("ЕГЕРЬ ИИ",50,60);
    ctx.fillStyle="rgba(255,255,255,.35)"; ctx.font="22px sans-serif"; ctx.fillText("eger-ai.app",50,92);
    ctx.fillStyle="#fff"; ctx.font="bold 72px sans-serif"; ctx.fillText(user.displayName||"Рыбак",50,200);
    if(profileUsername){ctx.fillStyle="#2ecc71"; ctx.font="30px sans-serif"; ctx.fillText("@"+profileUsername,50,248);}
    const stats=[
      {l:"Уловов",v:catchStats?.total||0},
      {l:"кг всего",v:catchStats?.totalW?(catchStats.totalW/1000).toFixed(1):"0"},
      {l:"Рекорд кг",v:catchStats?.best?(catchStats.best.weightGrams/1000).toFixed(1):"—"},
      {l:"Значков",v:badges.length},
    ];
    stats.forEach((s,i)=>{
      const x=50+i*250;
      ctx.fillStyle="#2ecc71"; ctx.font="bold 56px sans-serif"; ctx.fillText(String(s.v),x,370);
      ctx.fillStyle="rgba(255,255,255,.45)"; ctx.font="24px sans-serif"; ctx.fillText(s.l,x,410);
    });
    const dataUrl=canvas.toDataURL("image/jpeg",0.92);
    if(navigator.canShare){
      try{const blob=await (await fetch(dataUrl)).blob();const file=new File([blob],"profile.jpg",{type:"image/jpeg"});if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:"Мой профиль рыбака — Егерь ИИ"});return;}}catch(e){}
    }
    const a=document.createElement("a"); a.href=dataUrl; a.download="profile.jpg"; a.click();
  };

  const toggleNotif = async () => {
    if (notifOn) {
      localStorage.removeItem("fcm_token"); setNotifOn(false); return;
    }
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      if (!messaging) return;
      const token = await getToken(messaging, {vapidKey:VAPID_KEY, serviceWorkerRegistration:reg});
      if (token) {
        await setDoc(doc(db, "fcm_tokens", token), {createdAt:serverTimestamp(), ua:navigator.userAgent.slice(0,100)});
        localStorage.setItem("fcm_token", token); setNotifOn(true);
      }
    } catch(e) { console.log("FCM error:", e); }
  };

  useEffect(()=>{
    getDoc(doc(db, "users", user.uid)).then(snap=>{
      if(snap.exists() && snap.data().username) setProfileUsername(snap.data().username);
      else setProfileUsername(genUsername(user.displayName||"рыбак"));
    });
    getDoc(doc(db, "leaderboard", "month", "rows", user.uid))
      .then(d=>{ if(d.exists()) setUserRank(d.data().rank); }).catch(()=>{});
  },[user]);

  useEffect(()=>{
    setStatsLoading(true);
    getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), limit(200)))
      .then(snap=>{
        const recs = snap.docs.map(d=>d.data());
        const total = recs.length;
        const totalW = recs.reduce((s,r)=>s+(r.weightGrams||0),0);
        const best = recs.reduce((b,r)=>(!b||r.weightGrams>b.weightGrams?r:b),null);
        const gc={};
        recs.forEach(r=>{ if(r.gearType) gc[r.gearType]=(gc[r.gearType]||0)+1; });
        const favGear = Object.entries(gc).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
        const uniqueDays = new Set(recs.map(r=>r.createdAt?.toDate?.()?.toDateString()).filter(Boolean)).size;
        const now2=new Date();
        const monthly=Array.from({length:12},(_,i)=>{
          const d=new Date(now2.getFullYear(),now2.getMonth()-11+i,1);
          return {month:d.toLocaleString("ru-RU",{month:"short"}),year:d.getFullYear(),m:d.getMonth(),y:d.getFullYear(),count:0};
        });
        recs.forEach(r=>{const d=r.createdAt?.toDate?.(); if(!d) return; const slot=monthly.find(s=>s.m===d.getMonth()&&s.y===d.getFullYear()); if(slot) slot.count++;});
        const lc={};
        recs.forEach(r=>{ if(r.locationName) lc[r.locationName]=(lc[r.locationName]||0)+1; });
        const top3locs=Object.entries(lc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,c])=>({name:n,count:c}));
        const sc={};
        recs.forEach(r=>{ const n=r.fishName||r.fishType; if(n) sc[n]=(sc[n]||0)+1; });
        const top5species=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({name:n,count:c}));
        const maxSpecies=Math.max(...top5species.map(s=>s.count),1);
        const tod=Array(24).fill(0);
        recs.forEach(r=>{const d=r.createdAt?.toDate?.();if(d) tod[d.getHours()]++;});
        const maxTod=Math.max(...tod,1);
        // Best single day
        const dayCounts={};
        recs.forEach(r=>{const d=r.createdAt?.toDate?.();if(d){const k=d.toDateString();dayCounts[k]=(dayCounts[k]||0)+1;}});
        const bestDayEntry=Object.entries(dayCounts).sort((a,b)=>b[1]-a[1])[0];
        const bestDay=bestDayEntry?{date:bestDayEntry[0],count:bestDayEntry[1]}:null;
        // Longest streak
        const sortedDays=[...new Set(recs.map(r=>{const d=r.createdAt?.toDate?.();return d?d.toDateString():null;}).filter(Boolean))]
          .map(s=>new Date(s).getTime()).sort((a,b)=>a-b);
        let streak=0,curStreak=0,prevDay=null;
        for(const t of sortedDays){
          if(prevDay&&t-prevDay<=86400000*1.5) curStreak++;
          else curStreak=1;
          if(curStreak>streak) streak=curStreak;
          prevDay=t;
        }
        setCatchStats({total,totalW,best,favGear,uniqueDays,monthly,top3locs,top5species,maxSpecies,tod,maxTod,bestDay,streak});
        setStatsLoading(false);
      }).catch(()=>setStatsLoading(false));
    getDocs(collection(db, "users", user.uid, "badges"))
      .then(snap=>setBadges(snap.docs.map(d=>d.id))).catch(()=>{});
  },[user.uid]);

  const statItems = statsLoading
    ? [{label:"Уловов",val:"…"},{label:"Кг всего",val:"…"},{label:"Рекорд кг",val:"…"}]
    : [
        {label:"Уловов",val:catchStats?.total||0},
        {label:"Кг всего",val:catchStats?.totalW?(catchStats.totalW/1000).toFixed(1):"0"},
        {label:"Рекорд кг",val:catchStats?.best?(catchStats.best.weightGrams/1000).toFixed(1):"—"},
      ];

  const menu=[
    {Icon:Trophy,label:"Рейтинг рыбаков",nav:"leaderboard"},
    {Icon:Star,label:"Турниры",nav:"tournament"},
    {Icon:AlertCircle,label:"Telegram-бот @egerai_bot",href:"https://t.me/egerai_bot"},
  ];

  return (
    <div style={{padding:"16px 14px",overflowY:"auto",height:"100%"}}>
      <div style={{...glass(`0 0 0 1px ${C.borderHi}`),background:"linear-gradient(135deg,rgba(46,204,113,.12),rgba(59,130,246,.08))",padding:24,textAlign:"center",marginBottom:14,position:"relative"}}>
        <button onClick={shareProfile} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,.08)",border:`1px solid ${C.border}`,borderRadius:10,padding:"5px 10px",cursor:"pointer",color:C.muted,fontSize:11,fontWeight:700}}>📤 Поделиться</button>
        <div style={{width:72,height:72,borderRadius:"50%",margin:"0 auto 12px",background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 24px ${C.accentGlow}`,fontSize:28,fontWeight:800,color:"#07111e"}}>{(user.displayName||"Р")[0].toUpperCase()}</div>
        <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:2}}>{user.displayName||"Рыбак"}</div>
        {editingUsername ? (
          <div style={{display:"flex",gap:6,justifyContent:"center",alignItems:"center",marginBottom:6}}>
            <span style={{color:C.accent,fontWeight:700,fontSize:13}}>@</span>
            <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveUsername()}
              placeholder="имя_пользователя" autoFocus maxLength={20}
              style={{background:C.surface,border:`1px solid ${C.accent}`,borderRadius:8,padding:"4px 8px",color:C.text,fontSize:13,width:140,outline:"none"}}/>
            <button onClick={saveUsername} style={{background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:8,padding:"4px 8px",color:C.accent,fontSize:12,cursor:"pointer",fontWeight:700}}>✓</button>
            <button onClick={()=>setEditingUsername(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 8px",color:C.muted,fontSize:12,cursor:"pointer"}}>✕</button>
          </div>
        ) : (
          <div onClick={()=>{setEditingUsername(true);setUsernameInput(profileUsername||"");}} style={{cursor:"pointer",marginBottom:4}}>
            <span style={{fontSize:13,color:C.accent,fontWeight:700}}>@{profileUsername||"tap to set"}</span>
            <span style={{fontSize:10,color:C.dimmer,marginLeft:5}}>✎</span>
          </div>
        )}
        <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{user.email}</div>
        {userRank&&<div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:12,background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.3)",fontSize:11,color:C.gold,fontWeight:700,marginBottom:4}}>🏆 #{userRank} в рейтинге месяца</div>}
      </div>

      <div style={{display:"flex",gap:10,marginBottom:14}}>
        {statItems.map(s=>(<div key={s.label} style={{...glass(),flex:1,padding:"14px 8px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:800,color:C.accent,filter:`drop-shadow(0 0 8px ${C.accent})`}}>{s.val}</div>
          <div style={{fontSize:10,color:C.dimmer,marginTop:2}}>{s.label}</div>
        </div>))}
      </div>

      {catchStats?.favGear&&<div style={{...glass(),padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}><Fish size={15} color={C.accent}/><span style={{fontSize:13,color:C.text}}>Любимая снасть: <strong style={{color:C.accent}}>{catchStats.favGear}</strong></span></div>}
      {catchStats?.best&&<div style={{...glass(),padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}><Trophy size={15} color={C.gold}/><span style={{fontSize:13,color:C.text}}>Рекорд: <strong style={{color:C.gold}}>{catchStats.best.fishName||catchStats.best.fishType||"Рыба"} · {(catchStats.best.weightGrams/1000).toFixed(1)} кг</strong></span></div>}

      <div style={{...glass(),padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:.5}}>ЗНАЧКИ</div>
          <div style={{fontSize:11,color:C.accent,fontWeight:700}}>{badges.length}/{BADGE_DEFS.length}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {BADGE_DEFS.map(bd=>{
            const has=badges.includes(bd.id);
            return (
              <div key={bd.id} title={bd.desc} style={{padding:"8px 6px",background:has?C.accentDim:C.surface,border:`1px solid ${has?C.borderHi:C.border}`,borderRadius:12,textAlign:"center",opacity:has?1:.45,transition:"opacity .2s"}}>
                <div style={{fontSize:22,marginBottom:3,filter:has?"none":"grayscale(1)"}}>{bd.emoji}</div>
                <div style={{fontSize:9,color:has?C.accent:C.dimmer,fontWeight:700,lineHeight:1.2}}>{bd.name}</div>
              </div>
            );
          })}
        </div>
        {badges.length===0&&<div style={{fontSize:11,color:C.dimmer,textAlign:"center",marginTop:4}}>Поймай рыбу, чтобы получить первый значок 🎣</div>}
      </div>

      {/* Monthly activity chart */}
      {catchStats?.monthly&&catchStats.monthly.some(m=>m.count>0)&&(
        <div style={{...glass(),padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:10,fontWeight:700,letterSpacing:.5}}>АКТИВНОСТЬ ПО МЕСЯЦАМ</div>
          {(()=>{const mx=Math.max(...catchStats.monthly.map(m=>m.count),1); return(
            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:60}}>
              {catchStats.monthly.map((m,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:m.count>0?`linear-gradient(0deg,#1a8a50,${C.accent})`:"rgba(255,255,255,.06)",height:Math.max(3,Math.round(m.count/mx*48))}}/>
                  <div style={{fontSize:8,color:C.dimmer,whiteSpace:"nowrap"}}>{m.month}</div>
                </div>
              ))}
            </div>
          );})()}
        </div>
      )}

      {/* Time-of-day catch heatmap */}
      {catchStats?.tod&&catchStats.tod.some(v=>v>0)&&(
        <div style={{...glass(),padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:10,fontWeight:700,letterSpacing:.5}}>АКТИВНОСТЬ ПО ВРЕМЕНИ СУТОК</div>
          <div style={{display:"flex",gap:2,alignItems:"flex-end",height:44}}>
            {catchStats.tod.map((v,h)=>{
              const pct=Math.round(v/catchStats.maxTod*40);
              const col=h>=5&&h<10?"#f59e0b":h>=10&&h<18?C.accent:h>=18&&h<22?"#f97316":"rgba(34,211,238,.7)";
              return(
                <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                  <div style={{width:"100%",borderRadius:"2px 2px 0 0",background:v>0?col:"rgba(255,255,255,.05)",height:Math.max(2,pct)}}/>
                  <div style={{fontSize:7,color:C.dimmer}}>{h%6===0?`${h}ч`:""}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
            {[{col:"rgba(34,211,238,.7)",l:"Ночь 22–5"},{col:"#f59e0b",l:"Утро 5–10"},{col:C.accent,l:"День 10–18"},{col:"#f97316",l:"Вечер 18–22"}].map(({col,l})=>(
              <span key={l} style={{fontSize:9,color:C.dimmer,display:"flex",alignItems:"center",gap:3}}>
                <span style={{width:8,height:8,borderRadius:2,background:col,display:"inline-block"}}/>
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI insight */}
      {catchStats&&catchStats.total>=5&&(()=>{
        const bestH=catchStats.tod.indexOf(Math.max(...catchStats.tod));
        const timeLabel=bestH>=5&&bestH<10?"Утро (5–10ч)":bestH>=10&&bestH<18?"День (10–18ч)":bestH>=18&&bestH<22?"Вечер (18–22ч)":"Ночь (22–5ч)";
        const bestMonthIdx=catchStats.monthly.reduce((b,m,i)=>m.count>catchStats.monthly[b].count?i:b,0);
        const bm=catchStats.monthly[bestMonthIdx];
        const avgW=catchStats.total>0?(catchStats.totalW/catchStats.total/1000).toFixed(2):0;
        return(
          <div style={{...glass(),padding:"14px 16px",marginBottom:14,background:"rgba(34,211,238,.06)",border:`1px solid rgba(34,211,238,.2)`}}>
            <div style={{fontSize:11,color:C.cyan,fontWeight:700,letterSpacing:.5,marginBottom:10}}>🤖 ВАШ ИИ-АНАЛИЗ</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              <div style={{fontSize:13,color:C.text}}>🕐 Лучшее время: <span style={{color:C.accent,fontWeight:700}}>{timeLabel}</span> — {Math.max(...catchStats.tod)} уловов</div>
              {bm.count>0&&<div style={{fontSize:13,color:C.text}}>📅 Лучший месяц: <span style={{color:C.accent,fontWeight:700}}>{bm.month} {bm.year}</span> — {bm.count} рыбалок</div>}
              <div style={{fontSize:13,color:C.text}}>⚖️ Средний вес: <span style={{color:C.accent,fontWeight:700}}>{avgW} кг</span></div>
              {catchStats.favGear&&<div style={{fontSize:13,color:C.text}}>🎣 Снасть #1: <span style={{color:C.accent,fontWeight:700}}>{catchStats.favGear}</span></div>}
              {catchStats.bestDay&&catchStats.bestDay.count>1&&<div style={{fontSize:13,color:C.text}}>🏆 Лучший день: <span style={{color:C.accent,fontWeight:700}}>{catchStats.bestDay.count} уловов</span> — {new Date(catchStats.bestDay.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</div>}
              {catchStats.streak>1&&<div style={{fontSize:13,color:C.text}}>🔥 Рекорд серии: <span style={{color:C.accent,fontWeight:700}}>{catchStats.streak} дней подряд</span></div>}
            </div>
          </div>
        );
      })()}

      {/* Top-3 locations */}
      {catchStats?.top3locs?.length>0&&(
        <div style={{...glass(),padding:"12px 14px",marginBottom:10}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:700,letterSpacing:.5}}>ТОП МЕСТА ЛОВЛИ</div>
          {catchStats.top3locs.map((l,i)=>(
            <div key={l.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<catchStats.top3locs.length-1?8:0}}>
              <span style={{fontSize:14}}>{["🥇","🥈","🥉"][i]}</span>
              <span style={{flex:1,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</span>
              <span style={{fontSize:12,color:C.muted}}>{l.count} раз</span>
            </div>
          ))}
        </div>
      )}

      {/* Top-5 species */}
      {catchStats?.top5species?.length>0&&(
        <div style={{...glass(),padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:700,letterSpacing:.5}}>ТОП ВИДЫ РЫБ</div>
          {catchStats.top5species.map((s,i)=>(
            <div key={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:12,color:C.muted,width:16,textAlign:"right"}}>{i+1}.</span>
              <span style={{width:80,fontSize:12,color:C.text,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
              <div style={{flex:1,height:5,borderRadius:3,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
                <div style={{width:`${Math.round(s.count/catchStats.maxSpecies*100)}%`,height:"100%",borderRadius:3,background:`linear-gradient(90deg,#1a8a50,${C.accent})`,transition:"width .5s"}}/>
              </div>
              <span style={{fontSize:11,color:C.muted,width:28,textAlign:"right",flexShrink:0}}>{s.count}×</span>
            </div>
          ))}
        </div>
      )}

      {menu.map(({Icon,label,href,nav})=>(
        nav ? (
          <button key={label} onClick={()=>onNav&&onNav(nav)} style={{width:"100%",background:"none",border:"none",padding:0,textAlign:"left",cursor:"pointer",marginBottom:8}}>
            <div style={{...glass(),padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
              <Icon size={18} color={C.accent}/><span style={{fontSize:14,color:C.text,flex:1}}>{label}</span><ChevronRight size={15} color={C.dimmer}/>
            </div>
          </button>
        ) : (
          <a key={label} href={href} target={href.startsWith("http")?"_blank":"_self"} rel="noreferrer" style={{textDecoration:"none"}}>
            <div style={{...glass(),padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
              <Icon size={18} color={C.accent}/><span style={{fontSize:14,color:C.text,flex:1}}>{label}</span><ChevronRight size={15} color={C.dimmer}/>
            </div>
          </a>
        )
      ))}
      <button onClick={toggleNotif} style={{width:"100%",marginTop:8,padding:"14px 16px",borderRadius:20,border:`1px solid ${notifOn?"rgba(46,204,113,.3)":"rgba(34,211,238,.3)"}`,background:notifOn?"rgba(46,204,113,.08)":"rgba(34,211,238,.08)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer"}}>
        <span style={{fontSize:18}}>{notifOn?"🔔":"🔕"}</span>
        <span style={{fontSize:14,color:notifOn?C.accent:C.cyan,fontWeight:700}}>{notifOn?"Уведомления включены":"Включить уведомления"}</span>
      </button>
      <button onClick={()=>signOut(auth)} style={{width:"100%",marginTop:8,padding:"14px 16px",borderRadius:20,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.1)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer"}}>
        <LogOut size={18} color="#f87171"/><span style={{fontSize:14,color:"#f87171",fontWeight:700}}>Выйти из аккаунта</span>
      </button>
    </div>
  );
}
