import { useState, useRef, useEffect, useMemo } from 'react';
import { C, glass } from '../tokens.js';
import { db, storage, auth, messaging, functionsRegion, VAPID_KEY, logEvent } from '../firebase.js';
import { collection, doc, setDoc, updateDoc, addDoc, deleteDoc,
         onSnapshot, query, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getToken, onMessage } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { fmtDate } from '../lib/utils.js';
import { haversine } from '../lib/utils.js';
import { Fish, MapPin, Camera, XIcon, Plus, RefreshCw, BellIcon, BellOffIcon } from '../icons/index.jsx';

const NEWS_ITEMS=[
  {id:1,title:"Нерест завершён — рыбалка на Дону открыта",date:"12 мая 2026",source:"Азово-Черноморское управление Росрыболовства",text:"С 12 мая снят нерестовый запрет на большинстве водоёмов Ростовской области. Разрешена ловля всех видов рыб. Норма вылова 5 кг на человека в сутки.",tag:"Официально"},
  {id:2,title:"Уровень воды в Дону поднялся на 42 см выше нормы",date:"10 мая 2026",source:"Донское бассейновое водное управление",text:"Половодье продолжается. У Аксайской пристани уровень составил 342 см. Прогноз — начало спада через 5–7 дней. Белый амур и карась активно кормятся у берегов.",tag:"Гидрология"},
  {id:3,title:"Запрет на ловлю судака продлён до 20 мая",date:"5 мая 2026",source:"Рыбнадзор РО",text:"В Аксайском и Азовском районах запрет на ловлю судака продлён до 20 мая в связи с поздним нерестом. Штраф за нарушение — до 100 000 рублей.",tag:"Запрет"},
  {id:4,title:"На Цимлянском водохранилище отличный клёв леща",date:"8 мая 2026",source:"Рыболовный клуб «Дон»",text:"Рыбаки сообщают о хорошем клёве леща. Глубина 6–8 метров, прикормка с кориандром, крючок №6 с опарышем дают стабильный результат.",tag:"Клёв"},
  {id:5,title:"Итоги весеннего нереста в Ростовской области",date:"3 мая 2026",source:"Минприроды РО",text:"Нерест 2026 года прошёл успешно. Численность молоди сазана и леща выше прошлогоднего уровня на 15%. Браконьерство снизилось на треть.",tag:"Аналитика"},
  {id:6,title:"Открытие сезона спортивной рыбалки на Мёртвом Донце",date:"1 мая 2026",source:"ФРР Ростовской области",text:"15 мая состоятся официальные соревнования по ловле карпа на Мёртвом Донце. Регистрация команд до 13 мая.",tag:"Соревнования"},
];

export default function NewsScreen({ user, onLogin, userLat, userLon }) {
  const nearestCity = useMemo(()=>{
    if(!userLat||!userLon) return null;
    const cities = [
      {name:"Аксай",     lat:47.2681, lon:39.8699, kw:["аксай","аксайск"]},
      {name:"Батайск",   lat:47.1456, lon:39.7456, kw:["батайск"]},
      {name:"Азов",      lat:47.1023, lon:39.4123, kw:["азов","азовск"]},
      {name:"Таганрог",  lat:47.2090, lon:38.9360, kw:["таганрог"]},
      {name:"Новочеркасск", lat:47.4181, lon:40.0956, kw:["новочеркасск"]},
      {name:"Ростов-на-Дону", lat:47.2357, lon:39.7015, kw:["ростов"]},
    ];
    return cities.sort((a,b)=>haversine(userLat,userLon,a.lat,a.lon)-haversine(userLat,userLon,b.lat,b.lon))[0];
  },[userLat,userLon]);
  const [tab,setTab]=useState("news");
  const [newsItems,setNewsItems]=useState([]);
  const [newsLoading,setNewsLoading]=useState(true);
  const [newIds,setNewIds]=useState(new Set());
  const [lastUpdated,setLastUpdated]=useState(null);
  const [newCount,setNewCount]=useState(0);
  const seenIdsRef=useRef(new Set());
  const firstSnapRef=useRef(true);
  const [notifEnabled,setNotifEnabled]=useState(()=>!!localStorage.getItem('fcm_token'));
  const [refreshing,setRefreshing]=useState(false);

  const triggerRefresh=async()=>{
    if(refreshing||!user) return;
    setRefreshing(true);
    try{
      const fn=httpsCallable(functionsRegion, "triggerFetchNews");
      await fn({});
    }catch(e){ console.log("triggerFetchNews:",e); }
    finally{ setRefreshing(false); }
  };

  const requestNotif=async()=>{
    if(!("serviceWorker" in navigator)||!messaging) return;
    try{
      const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token=await getToken(messaging, {vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
      if(token){
        await setDoc(doc(db, "fcm_tokens", token), {
          uid: auth?.currentUser?.uid || null,
          createdAt:serverTimestamp(),
          ua:navigator.userAgent.slice(0,100)
        });
        localStorage.setItem('fcm_token',token);
        setNotifEnabled(true);
      }
    }catch(e){ console.log("FCM error:",e); }
  };

  useEffect(()=>{
    if(!notifEnabled||!messaging) return;
    return onMessage(messaging, ()=>{
      setNewCount(n=>n+1);
    });
  },[notifEnabled]);

  const [reports,setReports]=useState([]);
  const [reportsErr,setReportsErr]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [editTarget,setEditTarget]=useState(null);
  const [form,setForm]=useState({title:"",body:"",location:"",fish:""});
  const [photoFile,setPhotoFile]=useState(null);
  const [photoPreview,setPhotoPreview]=useState(null);
  const [posting,setPosting]=useState(false);
  const [uploadPct,setUploadPct]=useState(null);

  // Realtime: Firestore onSnapshot
  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db, "news"), orderBy("timestamp","desc"), limit(20)), snap=>{
        setNewsLoading(false);
        if(snap.empty){ setNewsItems(NEWS_ITEMS); return; }
        const items=snap.docs.map(d=>({id:d.id,...d.data(),
          date:d.data().timestamp?.toDate?.().toLocaleDateString("ru-RU",{day:"numeric",month:"long"})||""}));
        if(firstSnapRef.current){
          firstSnapRef.current=false;
          items.forEach(it=>seenIdsRef.current.add(it.id));
          setNewsItems(items);
        } else {
          const fresh=items.filter(it=>!seenIdsRef.current.has(it.id));
          if(fresh.length>0){
            fresh.forEach(it=>seenIdsRef.current.add(it.id));
            setNewIds(prev=>new Set([...prev,...fresh.map(it=>it.id)]));
            setNewCount(n=>n+fresh.length);
          }
          setNewsItems(items);
        }
        setLastUpdated(new Date());
      }, err=>{ console.log("news snapshot err",err); setNewsLoading(false); setNewsItems(NEWS_ITEMS); });
    return unsub;
  },[]);

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db, "reports"), orderBy("timestamp","desc"), limit(50)),
      s=>{setReports(s.docs.map(d=>({id:d.id,...d.data()}))); setReportsErr(false);},
        err=>{console.error("Reports:",err); setReportsErr(true);});
    return unsub;
  },[]);

  const openCreate=()=>{ if(!user){onLogin();return;} setEditTarget(null); setForm({title:"",body:"",location:"",fish:""}); setPhotoFile(null); setPhotoPreview(null); setShowForm(true); };
  const openEdit=r=>{ setEditTarget(r); setForm({title:r.title||"",body:r.body||"",location:r.location||"",fish:r.fish||""}); setPhotoPreview(r.photo_url||null); setPhotoFile(null); setShowForm(true); };

  const onFileChange=e=>{ const f=e.target.files[0]; if(!f)return; setPhotoFile(f); const rd=new FileReader(); rd.onload=ev=>setPhotoPreview(ev.target.result); rd.readAsDataURL(f); };

  const uploadPhoto=async uid=>{
    if(!photoFile) return null;
    const storageRef=ref(storage, `reports/${uid}_${Date.now()}.jpg`);
    await uploadBytes(storageRef, photoFile);
    setUploadPct(null);
    return await getDownloadURL(storageRef);
  };

  const submitReport=async()=>{
    if(!form.title||!form.body||!user) return;
    setPosting(true);
    try {
      let photo_url=editTarget?.photo_url||null;
      if(photoFile) photo_url=await uploadPhoto(user.uid);
      const data={...form,uid:user.uid,displayName:user.displayName||"Рыбак",timestamp:serverTimestamp(),...(photo_url?{photo_url}:{}),...(userLat&&userLon?{lat:userLat,lng:userLon}:{})};
      if(editTarget) await updateDoc(doc(db, "reports", editTarget.id), data);
      else await addDoc(collection(db, "reports"), data);
      setShowForm(false); setForm({title:"",body:"",location:"",fish:""}); setPhotoFile(null); setPhotoPreview(null); setEditTarget(null);
    } catch(e){ alert("Ошибка: "+e.message); }
    setPosting(false);
  };

  const deleteReport=async id=>{ if(!window.confirm("Удалить отчёт?")) return; await deleteDoc(doc(db, "reports", id)); };

  const toggleReportLike=async(reportId,currentLikes)=>{
    if(!user){onLogin();return;}
    const reportRef=doc(db, "reports", reportId);
    const hasLiked=(currentLikes||[]).includes(user.uid);
    await updateDoc(reportRef, {likes:hasLiked?arrayRemove(user.uid):arrayUnion(user.uid)}).catch(()=>{});
  };

  const tagColor=t=>({Официально:"#2ecc71",Гидрология:C.cyan,Запрет:"#ef4444",Клёв:C.gold,Аналитика:C.blue,Соревнования:"#a78bfa"}[t]||C.muted);
  const srcLabel=s=>s==="telegram"?"📱 Telegram":s==="telegram_chat"?"💬 Из чата":null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"10px 16px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex"}}>
          {["news","reports"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px 0",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:tab===t?C.accent:C.muted,borderBottom:tab===t?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .2s"}}>{t==="news"?"Новости":"Отчёты рыбаков"}</button>))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>
        {tab==="news"&&<div>
          {/* Live header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"pulseGlow .8s ease infinite"}}/>
              <span style={{fontSize:11,color:C.text,fontWeight:700}}>В эфире</span>
              {lastUpdated&&<span style={{fontSize:10,color:C.dimmer}}>· {lastUpdated.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>}
              {newCount>0&&<span style={{fontSize:10,fontWeight:800,color:"#fff",background:"#ef4444",borderRadius:10,padding:"1px 7px",cursor:"pointer"}} onClick={()=>setNewCount(0)}>+{newCount} новых</span>}
              {nearestCity&&<span style={{fontSize:10,color:C.accent,background:C.accentDim,borderRadius:8,padding:"1px 7px",border:`1px solid ${C.borderHi}`}}>📍 {nearestCity.name}</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {"serviceWorker" in navigator&&(
                <button onClick={notifEnabled?undefined:requestNotif} title={notifEnabled?"Уведомления включены":"Включить push-уведомления"}
                  style={{background:notifEnabled?`rgba(46,204,113,.15)`:"none",border:`1px solid ${notifEnabled?C.accent:C.border}`,borderRadius:10,padding:"4px 8px",color:notifEnabled?C.accent:C.muted,fontSize:11,cursor:notifEnabled?"default":"pointer",display:"flex",alignItems:"center",gap:4,transition:"all .2s"}}>
                  {notifEnabled?<BellIcon size={11} color={C.accent}/>:<BellOffIcon size={11} color={C.muted}/>}
                  {notifEnabled?"Push вкл":"Уведомления"}
                </button>
              )}
              <button onClick={triggerRefresh} disabled={refreshing||!user} title={user?"Запросить свежие новости":"Войдите, чтобы обновить"}
                style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:10,border:`1px solid ${refreshing?C.accent:C.border}`,background:"none",color:refreshing?C.accent:C.dimmer,fontSize:11,cursor:user?"pointer":"default",transition:"all .2s"}}>
                <RefreshCw size={11} color={refreshing||newsLoading?C.accent:C.dimmer} style={refreshing||newsLoading?{animation:"spin 1s linear infinite"}:undefined}/>
                {newsLoading?"Загрузка...":refreshing?"Ищем...":"Обновить"}
              </button>
            </div>
          </div>
          {newsLoading&&newsItems.length===0&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 0",gap:12}}>
            <div style={{width:32,height:32,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
            <div style={{fontSize:12,color:C.muted}}>Загружаем новости...</div>
          </div>}
          {[...newsItems].sort((a,b)=>{
            if(!userLat||!userLon) return 0;
            const da=a.lat&&a.lng?haversine(userLat,userLon,a.lat,a.lng):9999;
            const db2=b.lat&&b.lng?haversine(userLat,userLon,b.lat,b.lng):9999;
            return da-db2;
          }).map(n=>{
            const isNew=newIds.has(n.id);
            const dist=userLat&&userLon&&n.lat&&n.lng?Math.round(haversine(userLat,userLon,n.lat,n.lng)):null;
            const isLocal=dist!==null&&dist<100||(nearestCity&&nearestCity.kw.some(k=>((n.title||"").toLowerCase()+(n.text||"").toLowerCase()).includes(k)));
            return(
              <div key={n.id} style={{...glass(),padding:"14px",marginBottom:10,animation:isNew?"newsSlideIn .5s cubic-bezier(.22,.61,.36,1), glowFlash 1.4s ease .35s":"fadeUp .3s ease",border:isNew?`1px solid rgba(239,68,68,.4)`:isLocal?`1px solid ${C.borderHi}`:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
                {isNew&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#ef4444,#f59e0b)",animation:"pulseGlow 2s ease 3"}}/>}
                {isLocal&&!isNew&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.accent},${C.cyan})`}}/>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,color:tagColor(n.tag),background:`${tagColor(n.tag)}20`,borderRadius:6,padding:"3px 8px"}}>{n.tag}</span>
                    {isNew&&<span style={{fontSize:9,fontWeight:800,color:"#ef4444",background:"rgba(239,68,68,.15)",borderRadius:6,padding:"2px 6px"}}>НОВОЕ</span>}
                    {isLocal&&!isNew&&<span style={{fontSize:9,fontWeight:800,color:C.accent,background:C.accentDim,borderRadius:6,padding:"2px 6px"}}>📍 рядом</span>}
                    {dist!==null&&!isNew&&<span style={{fontSize:9,color:C.dimmer,background:`${C.border}50`,borderRadius:6,padding:"2px 6px"}}>{dist<1?`<1 км`:dist>=1000?`${Math.round(dist/100)/10} тыс. км`:`${dist} км`}</span>}
                  </div>
                  <span style={{fontSize:10,color:C.dimmer}}>{n.date}</span>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.4,marginBottom:6}}>{n.title}</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:8}}>{n.text}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.dimmer}}>Источник: {n.source}</span>
                  {n.link&&<a href={n.link} target="_blank" rel="noreferrer" style={{fontSize:10,color:C.accent,fontWeight:700,textDecoration:"none"}}>Читать →</a>}
                </div>
              </div>
            );
          })}
        </div>}
        {tab==="reports"&&<div>
          <button onClick={openCreate} style={{width:"100%",padding:"13px",borderRadius:14,border:`1px dashed ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Plus size={16} color={C.accent}/> Добавить отчёт о рыбалке
          </button>
          {reportsErr&&<div style={{padding:"12px 14px",borderRadius:12,background:"rgba(239,68,68,.1)",border:"1px solid #ef444444",color:"#ef4444",fontSize:12,marginBottom:12}}>⚠️ Ошибка загрузки отчётов. Нужно обновить правила Firestore — разреши read для коллекции reports.</div>}
          {reports.length===0&&!reportsErr&&<div style={{textAlign:"center",padding:40,color:C.dimmer}}><Fish size={40} color={C.dimmer} style={{margin:"0 auto 12px",display:"block"}}/><div style={{fontSize:14}}>Отчётов пока нет — будь первым!</div></div>}
          {reports.map(r=>{
            const isOwn=user&&r.uid===user.uid;
            const sl=srcLabel(r.source);
            return (<div key={r.id} style={{...glass(),padding:"14px",marginBottom:10,animation:"fadeUp .3s ease"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#07111e",flexShrink:0}}>{(r.displayName||"Р")[0].toUpperCase()}</div>
                  <div><div style={{fontSize:12,fontWeight:700,color:C.accent}}>{r.displayName}</div>{sl&&<div style={{fontSize:10,color:C.muted}}>{sl}</div>}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:10,color:C.dimmer}}>{r.timestamp?fmtDate(r.timestamp):""}</span>
                  {isOwn&&<button onClick={()=>openEdit(r)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 7px",color:C.accent,fontSize:11,cursor:"pointer",lineHeight:1}}>✏️</button>}
                  {isOwn&&<button onClick={()=>deleteReport(r.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 7px",color:"#ef4444",fontSize:11,cursor:"pointer",lineHeight:1}}>🗑</button>}
                </div>
              </div>
              {r.photo_url&&<img src={r.photo_url} alt="улов" loading="lazy" onClick={()=>window.open(r.photo_url,"_blank")} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:10,marginBottom:10,cursor:"pointer",display:"block"}}/>}
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>{r.title}</div>
              {r.location&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}><MapPin size={11} color={C.muted}/><span style={{fontSize:11,color:C.muted}}>{r.location}</span></div>}
              {r.fish&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6}}><Fish size={11} color={C.gold}/><span style={{fontSize:11,color:C.gold}}>{r.fish}</span></div>}
              <div style={{fontSize:13,color:"rgba(232,244,240,.8)",lineHeight:1.6}}>{r.body}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <button onClick={()=>toggleReportLike(r.id,r.likes)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"4px 10px",cursor:"pointer",color:(r.likes||[]).includes(user?.uid)?C.gold:C.dimmer,fontSize:12,fontWeight:(r.likes||[]).includes(user?.uid)?700:400}}>
                  {(r.likes||[]).includes(user?.uid)?"❤️":"🤍"} {(r.likes||[]).length>0?(r.likes||[]).length:""}
                </button>
                <span style={{fontSize:10,color:C.dimmer,marginLeft:"auto"}}>{(r.likes||[]).length>0?`${(r.likes||[]).length} ${(r.likes||[]).length===1?"лайк":(r.likes||[]).length<5?"лайка":"лайков"}`:""}</span>
              </div>
            </div>);
          })}
        </div>}
      </div>

      {showForm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:100,display:"flex",alignItems:"flex-end",animation:"fadeIn .2s ease"}} onClick={e=>{if(e.target===e.currentTarget)setShowForm(false);}}>
        <div style={{...glass(),width:"100%",maxWidth:430,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:20,maxHeight:"90dvh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:16,fontWeight:800,color:C.text}}>{editTarget?"Редактировать":"Новый отчёт"}</span>
            <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",cursor:"pointer"}}><XIcon size={22} color={C.muted}/></button>
          </div>
          {[{key:"title",ph:"Заголовок (обязательно)"},{key:"location",ph:"Место рыбалки"},{key:"fish",ph:"Что поймал (вид, вес, штук)"}].map(({key,ph})=>(
            <input key={key} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
              style={{width:"100%",padding:"12px 14px",borderRadius:12,marginBottom:10,background:C.surfaceHi,border:`1px solid ${C.border}`,color:C.text,fontSize:14,outline:"none"}}
              onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>
          ))}
          <textarea rows={4} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Расскажи подробнее: снасти, насадка, время клёва..."
            style={{width:"100%",resize:"none",padding:"12px 14px",borderRadius:12,marginBottom:10,background:C.surfaceHi,border:`1px solid ${C.border}`,color:C.text,fontSize:14,outline:"none",lineHeight:1.5}}
            onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>
          <div style={{marginBottom:14}}>
            {photoPreview&&<img src={photoPreview} alt="preview" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:10,marginBottom:8,display:"block"}}/>}
            <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"11px",borderRadius:12,border:`1px dashed ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              <Camera size={16} color={C.accent}/>{photoPreview?"Сменить фото":"Добавить фото улова"}
              <input type="file" accept="image/*" onChange={onFileChange} style={{display:"none"}}/>
            </label>
            {uploadPct!==null&&<div style={{marginTop:6,height:4,borderRadius:4,background:C.surface}}><div style={{height:4,borderRadius:4,background:C.accent,width:`${uploadPct}%`,transition:"width .2s"}}/></div>}
          </div>
          <button onClick={submitReport} disabled={!form.title||!form.body||posting}
            style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
              background:form.title&&form.body?`linear-gradient(135deg,#1a8a50,${C.accent})`:C.surface,
              color:form.title&&form.body?"#07111e":C.muted,fontSize:15,fontWeight:800}}>
            {posting?(uploadPct!==null?`Фото ${uploadPct}%...`:"Публикуем..."):editTarget?"Сохранить":"Опубликовать"}
          </button>
        </div>
      </div>}
    </div>
  );
}
