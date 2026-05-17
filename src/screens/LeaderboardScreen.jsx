import { useState, useEffect, useRef } from 'react';
import { C, glass } from '../tokens.js';
import { db, logEvent } from '../firebase.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';

export default function LeaderboardScreen({ onBack, user }) {
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const cache = useRef({});

  useEffect(()=>{
    if(!user||rows.length===0) return setUserRow(null);
    if(rows.find(r=>r.userId===user.uid)) return setUserRow(null);
    if(period==="all") return setUserRow(null);
    getDoc(doc(db, "leaderboard", period, "rows", user.uid))
      .then(d=>setUserRow(d.exists()?d.data():null)).catch(()=>setUserRow(null));
  },[rows,user,period]);

  useEffect(()=>{
    logEvent("leaderboard_viewed",{period});
    if (cache.current[period]) {
      setRows(cache.current[period]);
      setLoading(false);
      return;
    }
    setLoading(true); setRows([]);

    if (period !== "all") {
      getDocs(query(collection(db, "leaderboard", period, "rows"), orderBy("rank","asc"), limit(100)))
        .then(snap=>{
          if (!snap.empty) {
            const r = snap.docs.map(d=>({...d.data()}));
            cache.current[period] = r;
            setRows(r);
            const ts = r[0]?.updatedAt?.toDate?.();
            if(ts) setUpdatedAt(ts.toLocaleDateString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}));
            setLoading(false);
            return;
          }
          computeFromReports(period);
        })
        .catch(()=>computeFromReports(period));
    } else {
      computeFromReports(period);
    }
  },[period]);

  const computeFromReports = (period) => {
    let q = query(collection(db,"reports"),orderBy("timestamp","desc"),limit(500));
    if(period==="week"){
      const since=new Date(); since.setDate(since.getDate()-7);
      q=query(collection(db,"reports"),where("timestamp",">=",Timestamp.fromDate(since)),orderBy("timestamp","desc"),limit(500));
    } else if(period==="month"){
      const since=new Date(); since.setMonth(since.getMonth()-1);
      q=query(collection(db,"reports"),where("timestamp",">=",Timestamp.fromDate(since)),orderBy("timestamp","desc"),limit(500));
    }
    getDocs(q).then(snap=>{
      const map={};
      snap.docs.forEach(d=>{
        const r=d.data(); const uid=r.uid||r.userId||"anon";
        if(!map[uid]) map[uid]={userId:uid,author:r.displayName||r.author||"Рыбак",catches:0,totalKg:0,best:0};
        map[uid].catches++;
        const kg=parseFloat(r.weight)||0;
        map[uid].totalKg+=kg;
        if(kg>map[uid].best) map[uid].best=kg;
      });
      const result = Object.values(map).sort((a,b)=>b.totalKg-a.totalKg||b.catches-a.catches).slice(0,50);
      cache.current[period] = result;
      setRows(result);
      setLoading(false);
    }).catch(()=>setLoading(false));
  };

  const medals=["🥇","🥈","🥉"];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"12px 14px",display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:"rgba(7,17,30,.9)",position:"sticky",top:0,zIndex:2}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:14,fontWeight:700,padding:"4px 10px 4px 0"}}>←</button>
        <div style={{flex:1,fontSize:17,fontWeight:800,color:C.text}}>🏆 Рейтинг рыбаков</div>
        {updatedAt&&<div style={{fontSize:9,color:C.dimmer}}>обн. {updatedAt}</div>}
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:"rgba(7,17,30,.92)",flexShrink:0}}>
        {[{id:"week",label:"Неделя"},{id:"month",label:"Месяц"},{id:"all",label:"Все"}].map(t=>(
          <button key={t.id} onClick={()=>setPeriod(t.id)} style={{flex:1,padding:"10px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:period===t.id?C.accent:C.muted,borderBottom:period===t.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .2s"}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 14px 24px"}}>
        {loading&&[1,2,3,4,5].map(i=><div key={i} style={{height:62,borderRadius:14,background:C.surface,marginBottom:8,animation:"pulseGlow 1.5s ease infinite"}}/>)}
        {!loading&&rows.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>Нет данных за этот период</div>}
        {!loading&&rows.map((r,i)=>(
          <div key={r.userId} style={{...glass(),padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,borderRadius:16,border:`1px solid ${user&&r.userId===user.uid?C.accent:i<3?`rgba(46,204,113,${0.4-i*0.1})`:C.border}`,background:user&&r.userId===user.uid?"rgba(46,204,113,.08)":"transparent"}}>
            <div style={{fontSize:i<3?26:13,fontWeight:800,color:i<3?C.accent:C.dimmer,width:30,textAlign:"center",flexShrink:0}}>{i<3?medals[i]:i+1}</div>
            <div style={{width:36,height:36,borderRadius:18,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#07111e",flexShrink:0}}>
              {(r.author||"Р")[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:user&&r.userId===user.uid?C.accent:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.author}{user&&r.userId===user.uid?" (Вы)":""}</div>
              <div style={{fontSize:11,color:C.muted}}>{r.catches} улов{r.catches===1?"":"ов"} · лучший {r.best.toFixed(1)} кг</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:17,fontWeight:800,color:C.accent}}>{r.totalKg.toFixed(1)}</div>
              <div style={{fontSize:10,color:C.dimmer}}>кг</div>
            </div>
          </div>
        ))}
        {userRow&&(
          <div style={{position:"sticky",bottom:0,paddingBottom:16,background:"rgba(7,17,30,.95)"}}>
            <div style={{...glass(),padding:"12px 14px",display:"flex",alignItems:"center",gap:12,borderRadius:16,border:`2px solid ${C.accent}`,background:"rgba(46,204,113,.1)"}}>
              <div style={{fontSize:13,fontWeight:800,color:C.accent,width:30,textAlign:"center",flexShrink:0}}>#{userRow.rank}</div>
              <div style={{width:36,height:36,borderRadius:18,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#07111e",flexShrink:0}}>{(userRow.author||"Р")[0].toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:C.accent}}>Вы · {userRow.author}</div>
                <div style={{fontSize:11,color:C.muted}}>{userRow.catches} улов{userRow.catches===1?"":"ов"} · лучший {(userRow.best||0).toFixed(1)} кг</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:17,fontWeight:800,color:C.accent}}>{(userRow.totalKg||0).toFixed(1)}</div>
                <div style={{fontSize:10,color:C.dimmer}}>кг</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
