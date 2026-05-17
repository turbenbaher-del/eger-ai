import { useState, useEffect } from 'react';
import { C, glass } from '../tokens.js';
import { db, logEvent } from '../firebase.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, orderBy, limit, setDoc, serverTimestamp } from 'firebase/firestore';

export default function TournamentScreen({ onBack, user }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState({});
  const [regLoading, setRegLoading] = useState({});

  useEffect(()=>{
    logEvent("tournament_viewed");
    const unsub=onSnapshot(query(collection(db,"tournaments"),orderBy("startDate","asc")),
      snap=>{ setTournaments(snap.docs.map(d=>({...d.data(),id:d.id}))); setLoading(false); },
      ()=>setLoading(false));
    return unsub;
  },[]);

  useEffect(()=>{
    if(!user||tournaments.length===0) return;
    Promise.all(tournaments.map(t=>
      getDoc(doc(db,"tournaments",t.id,"participants",user.uid))
        .then(d=>({id:t.id,reg:d.exists()})).catch(()=>({id:t.id,reg:false}))
    )).then(results=>{
      const m={};results.forEach(r=>m[r.id]=r.reg);setRegistered(m);
    });
  },[user,tournaments.length]);

  const register=async(tId)=>{
    if(!user) return;
    setRegLoading(p=>({...p,[tId]:true}));
    try{
      await setDoc(doc(db,"tournaments",tId,"participants",user.uid),{
        uid:user.uid,name:user.displayName||"Рыбак",registeredAt:serverTimestamp()
      });
      setRegistered(p=>({...p,[tId]:true}));
      logEvent("tournament_registered",{tournament_id:tId});
    }catch(e){}
    setRegLoading(p=>({...p,[tId]:false}));
  };

  const now=Date.now();
  const active=tournaments.filter(t=>{const s=t.startDate?.toMillis?.()??0,e=t.endDate?.toMillis?.()??0;return s<=now&&e>=now;});
  const upcoming=tournaments.filter(t=>{const s=t.startDate?.toMillis?.()??0;return s>now;});
  const past=tournaments.filter(t=>{const e=t.endDate?.toMillis?.()??0;return e<now;});

  function Countdown({toMs}){
    const [diff,setDiff]=useState(Math.max(0,toMs-Date.now()));
    useEffect(()=>{const t=setInterval(()=>setDiff(Math.max(0,toMs-Date.now())),1000);return()=>clearInterval(t);},[toMs]);
    const s=Math.floor(diff/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
    if(d>0) return <span>{d}д {h%24}ч</span>;
    if(h>0) return <span>{h}ч {m%60}мин</span>;
    return <span>{m}:{String(s%60).padStart(2,"0")}</span>;
  }

  function LiveLeaderboard({tournamentId}){
    const [rows,setRows]=useState([]);
    useEffect(()=>{
      const unsub=onSnapshot(
        query(collection(db,"tournaments",tournamentId,"participants"),orderBy("score","desc"),limit(20)),
        snap=>setRows(snap.docs.map(d=>({...d.data(),uid:d.id})))
      );
      return unsub;
    },[tournamentId]);
    if(rows.length===0) return <div style={{fontSize:11,color:C.dimmer,textAlign:"center",padding:"8px 0"}}>Пока нет участников с баллами</div>;
    return(
      <div style={{marginTop:10}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:.5,marginBottom:6}}>LIVE ТАБЛИЦА</div>
        {rows.map((r,i)=>(
          <div key={r.uid} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:10,background:i===0?"rgba(245,158,11,.08)":"rgba(255,255,255,.03)",border:`1px solid ${i===0?"rgba(245,158,11,.3)":C.border}`,marginBottom:4}}>
            <span style={{fontSize:14,width:24,textAlign:"center",flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
            <span style={{flex:1,fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name||"Рыбак"}</span>
            <span style={{fontSize:12,fontWeight:700,color:i===0?C.gold:C.accent,flexShrink:0}}>{r.score||0} оч.</span>
          </div>
        ))}
      </div>
    );
  }

  function TCard({t,status}){
    const start=t.startDate?.toDate?.()??new Date();
    const end=t.endDate?.toDate?.()??new Date();
    const statusBadge={active:{bg:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,text:"● ИДЁТ СЕЙЧАС"},upcoming:{bg:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",color:C.cyan,text:"⏳ СКОРО"},past:{bg:C.surface,border:`1px solid ${C.border}`,color:C.muted,text:"✓ ЗАВЕРШЁН"}}[status];
    const isReg=registered[t.id];
    const isRegLoading=regLoading[t.id];
    return (
      <div style={{...glass(),padding:"14px",marginBottom:10,borderRadius:16,border:`1px solid ${status==="active"?C.accent:C.border}`}}>
        <div style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:10,fontWeight:700,marginBottom:8,...statusBadge}}>{statusBadge.text}</div>
        <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:4}}>{t.title||"Турнир"}</div>
        {t.description&&<div style={{fontSize:12,color:C.muted,marginBottom:8}}>{t.description}</div>}
        <div style={{display:"flex",gap:12,fontSize:11,color:C.dimmer,marginBottom:8,flexWrap:"wrap"}}>
          <span>📅 {start.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"})} — {end.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"})}</span>
          {t.prize&&<span>🏅 {t.prize}</span>}
          {t.participants&&<span>👥 {t.participants} участников</span>}
        </div>
        {status==="active"&&<div style={{fontSize:12,color:C.cyan,fontWeight:700,marginBottom:8}}>⏱ Осталось: <Countdown toMs={end.getTime()}/></div>}
        {status==="upcoming"&&<div style={{fontSize:12,color:C.accent,fontWeight:700,marginBottom:8}}>⏳ До старта: <Countdown toMs={start.getTime()}/></div>}
        {status!=="past"&&user&&(
          isReg
            ? <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:12,background:"rgba(46,204,113,.12)",border:`1px solid ${C.accent}`,fontSize:12,fontWeight:700,color:C.accent}}>✓ Вы записаны</div>
            : <button onClick={()=>register(t.id)} disabled={isRegLoading} style={{padding:"7px 16px",borderRadius:12,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,border:"none",color:"#07111e",fontSize:12,fontWeight:800,cursor:"pointer",opacity:isRegLoading?.6:1}}>{isRegLoading?"Записываем...":"Записаться →"}</button>
        )}
        {status==="active"&&<LiveLeaderboard tournamentId={t.id}/>}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"12px 14px",display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:"rgba(7,17,30,.9)",position:"sticky",top:0,zIndex:2}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:14,fontWeight:700,padding:"4px 10px 4px 0"}}>←</button>
        <div style={{flex:1,fontSize:17,fontWeight:800,color:C.text}}>🏅 Турниры</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 24px"}}>
        {loading&&[1,2].map(i=><div key={i} style={{height:120,borderRadius:16,background:C.surface,marginBottom:10,animation:"pulseGlow 1.5s ease infinite"}}/>)}
        {!loading&&active.length===0&&upcoming.length===0&&past.length===0&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:52,marginBottom:12}}>🏅</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Турниров пока нет</div>
            <div style={{fontSize:13}}>Следите за анонсами в новостях</div>
          </div>
        )}
        {!loading&&active.map(t=><TCard key={t.id} t={t} status="active"/>)}
        {!loading&&upcoming.length>0&&<div style={{fontSize:11,color:C.dimmer,fontWeight:700,marginBottom:6,marginTop:4,letterSpacing:.5}}>ПРЕДСТОЯЩИЕ</div>}
        {!loading&&upcoming.map(t=><TCard key={t.id} t={t} status="upcoming"/>)}
        {!loading&&past.length>0&&<div style={{fontSize:11,color:C.dimmer,fontWeight:700,marginBottom:6,marginTop:8,letterSpacing:.5}}>ПРОШЕДШИЕ</div>}
        {!loading&&past.map(t=><TCard key={t.id} t={t} status="past"/>)}
      </div>
    </div>
  );
}
