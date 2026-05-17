import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { C, glass } from '../tokens.js';
import { db, storage, logEvent } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
         onSnapshot, query, where, orderBy, limit, startAfter, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { FISH_TYPES, GEAR_TYPES, CATCH_METHODS } from '../data/fishing.jsx';
import { getNearestSpotName } from '../data/spots.js';
import { generateShareCard, doShareCard } from '../lib/shareCard.js';
import { RequireAuth } from '../components/AuthModal.jsx';
import CatchCard from '../components/CatchCard.jsx';
import { MapPin, Clock } from '../icons/index.jsx';

/* ── EditCatchForm ── */
function EditCatchForm({ user, record, onClose, onSaved }) {
  const [fishSearch, setFishSearch] = useState(FISH_TYPES.find(f=>f.id===record.fishType)?.name||"");
  const [fishType, setFishType] = useState(record.fishType||"");
  const [weightKg, setWeightKg] = useState(record.weightGrams?String(record.weightGrams/1000):"");
  const [lengthCm, setLengthCm] = useState(record.lengthCm?String(record.lengthCm):"");
  const [depthM, setDepthM] = useState(record.depthM?String(record.depthM):"");
  const [distanceM, setDistanceM] = useState(record.distanceM?String(record.distanceM):"");
  const [locationName, setLocationName] = useState(record.locationName||"");
  const [dateStr, setDateStr] = useState(()=>{const d=record.createdAt?.toDate?record.createdAt.toDate():new Date();return d.toISOString().slice(0,16);});
  const [gearType, setGearType] = useState(record.gearType||"");
  const [bait, setBait] = useState(record.bait||"");
  const [catchMethod, setCatchMethod] = useState(record.catchMethod||"");
  const [notes, setNotes] = useState(record.notes||"");
  const [saving, setSaving] = useState(false);
  const [photoUrls, setPhotoUrls] = useState(record.photoUrls||[]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileGallRef = useRef();
  const fileCamRef = useRef();
  const fishFiltered = fishSearch ? FISH_TYPES.filter(f=>f.name.toLowerCase().includes(fishSearch.toLowerCase())) : FISH_TYPES;

  const addPhoto = async (file) => {
    if (!file) return;
    setPhotoUploading(true);
    try {
      const blob = await new Promise((res,rej)=>{
        const img=new Image(), url=URL.createObjectURL(file);
        img.onload=()=>{
          URL.revokeObjectURL(url);
          const maxS=1200; let w=img.width,h=img.height;
          if(w>maxS||h>maxS){const r=Math.min(maxS/w,maxS/h);w=Math.round(w*r);h=Math.round(h*r);}
          const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
          cv.getContext("2d").drawImage(img,0,0,w,h);
          cv.toBlob(b=>b?res(b):rej(new Error("toBlob")),"image/jpeg",0.85);
        };
        img.onerror=rej; img.src=url;
      });
      const storageRef=ref(storage, `catches/${user.uid}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, {contentType:"image/jpeg"});
      const url=await getDownloadURL(storageRef);
      setPhotoUrls(prev=>[...prev,url]);
    } catch(e){ alert("Ошибка загрузки: "+e.message); }
    setPhotoUploading(false);
  };

  const handleSave = async () => {
    if (!fishType) return alert("Выберите вид рыбы");
    setSaving(true);
    const updates = {
      fishType, fishName: FISH_TYPES.find(f=>f.id===fishType)?.name||"",
      weightGrams: weightKg ? Math.round(parseFloat(weightKg)*1000) : null,
      lengthCm: lengthCm ? parseFloat(lengthCm) : null,
      depthM: depthM ? parseFloat(depthM) : null,
      distanceM: distanceM ? parseFloat(distanceM) : null,
      locationName: locationName||"Место не указано",
      gearType: gearType||null, bait: bait||null,
      catchMethod: catchMethod||null, notes: notes||null,
      photoUrls,
      createdAt: Timestamp.fromDate(new Date(dateStr)),
    };
    try {
      await updateDoc(doc(db, "catches", user.uid, "records", record.id), updates);
      onSaved?.({...record,...updates});
      onClose();
    } catch(e){ setSaving(false); alert("Ошибка: "+e.message); }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"flex-end"}}>
      <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1f35",borderRadius:"24px 24px 0 0",maxHeight:"90vh",overflowY:"auto",padding:"20px 16px 40px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text,flex:1}}>✏️ Изменить улов</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ВИД РЫБЫ *</div>
          <input value={fishSearch} onChange={e=>setFishSearch(e.target.value)} placeholder="Поиск..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",marginBottom:8,outline:"none"}}/>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,maxHeight:100,overflowY:"auto"}}>
            {fishFiltered.map(f=>(
              <button key={f.id} onClick={()=>{setFishType(f.id);setFishSearch(f.name);}} style={{padding:"5px 11px",borderRadius:14,background:fishType===f.id?C.accentDim:C.surface,border:`1px solid ${fishType===f.id?C.accent:C.border}`,color:fishType===f.id?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{f.name}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ВЕС (КГ)</div><input type="number" step="0.1" min="0" value={weightKg} onChange={e=>setWeightKg(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/></div>
          <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДЛИНА (СМ)</div><input type="number" step="1" min="0" value={lengthCm} onChange={e=>setLengthCm(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/></div>
        </div>
        <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>МЕСТО</div><input value={locationName} onChange={e=>setLocationName(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/></div>
        <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДАТА И ВРЕМЯ</div><input type="datetime-local" value={dateStr} onChange={e=>setDateStr(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/></div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>СНАСТЬ</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{GEAR_TYPES.map(g=><button key={g} onClick={()=>setGearType(gearType===g?"":g)} style={{padding:"5px 11px",borderRadius:14,background:gearType===g?C.accentDim:C.surface,border:`1px solid ${gearType===g?C.accent:C.border}`,color:gearType===g?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{g}</button>)}</div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ТИП ЛОВЛИ</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{CATCH_METHODS.map(m=><button key={m} onClick={()=>setCatchMethod(catchMethod===m?"":m)} style={{padding:"5px 11px",borderRadius:14,background:catchMethod===m?C.accentDim:C.surface,border:`1px solid ${catchMethod===m?C.accent:C.border}`,color:catchMethod===m?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{m}</button>)}</div>
        </div>
        <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ПРИМАНКА / НАЖИВКА</div><input value={bait} onChange={e=>setBait(e.target.value)} placeholder="Напр.: Джиг, червь..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/></div>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ГЛУБИНА (М)</div><input type="number" step="0.5" min="0" value={depthM} onChange={e=>setDepthM(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/></div>
          <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДИСТАНЦИЯ (М)</div><input type="number" step="1" min="0" value={distanceM} onChange={e=>setDistanceM(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/></div>
        </div>
        <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ЗАМЕТКИ</div><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",resize:"none",outline:"none"}}/></div>

        {/* Photo section */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:700}}>ФОТО</div>
          {photoUrls.length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {photoUrls.map((url,idx)=>(
                <div key={idx} style={{position:"relative",width:80,height:80,flexShrink:0}}>
                  <img src={url} alt="" style={{width:80,height:80,objectFit:"cover",borderRadius:10,display:"block"}}/>
                  <button onClick={()=>setPhotoUrls(p=>p.filter((_,i)=>i!==idx))}
                    style={{position:"absolute",top:-7,right:-7,width:22,height:22,borderRadius:"50%",background:"#ef4444",border:"2px solid #0d1f35",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>✕</button>
                </div>
              ))}
              {photoUploading&&(
                <div style={{width:80,height:80,borderRadius:10,background:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
                </div>
              )}
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>fileGallRef.current?.click()} disabled={photoUploading}
              style={{flex:1,padding:"11px 8px",borderRadius:12,border:`1px dashed ${C.border}`,background:"transparent",color:photoUploading?C.dimmer:C.muted,fontSize:13,cursor:photoUploading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              🖼 {photoUploading&&photoUrls.length===0?"Загрузка…":"Из галереи"}
            </button>
            <button onClick={()=>fileCamRef.current?.click()} disabled={photoUploading}
              style={{flex:1,padding:"11px 8px",borderRadius:12,border:`1px dashed ${C.border}`,background:"transparent",color:photoUploading?C.dimmer:C.muted,fontSize:13,cursor:photoUploading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              📷 Камера
            </button>
          </div>
          <input ref={fileGallRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{addPhoto(e.target.files[0]);e.target.value="";}}/>
          <input ref={fileCamRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{addPhoto(e.target.files[0]);e.target.value="";}}/>
        </div>

        <button onClick={handleSave} disabled={saving||!fishType||photoUploading} style={{width:"100%",padding:"15px",borderRadius:16,border:"none",background:fishType&&!photoUploading?`linear-gradient(135deg,#1a8a50,${C.accent})`:"#1e3a2a",color:fishType&&!photoUploading?"#07111e":"#4a6e5a",fontSize:15,fontWeight:800,cursor:fishType&&!photoUploading?"pointer":"default"}}>{saving?"Сохраняем...":photoUploading?"Подождите, загружается фото…":"✅ Сохранить изменения"}</button>
      </div>
    </div>
  );
}

/* ── CatchDetailView ── */
function CatchDetailView({ record: initRecord, user, onBack }) {
  const [record, setRecord] = useState(initRecord);
  const [showEdit, setShowEdit] = useState(false);
  const fish = FISH_TYPES.find(f=>f.id===record.fishType);
  const date = record.createdAt?.toDate?record.createdAt.toDate():new Date(parseInt(record.id)||Date.now());
  const [deleting, setDeleting] = useState(false);
  const [published, setPublished] = useState(record.isPublic||false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = record.photoUrls||[];
  const [cardPreview, setCardPreview] = useState(null);
  const [cardLoading, setCardLoading] = useState(true);

  useEffect(()=>{
    setCardPreview(null); setCardLoading(true);
    generateShareCard(record).then(url=>{ setCardPreview(url); setCardLoading(false); }).catch(()=>setCardLoading(false));
  },[record.id]);

  const handleDelete = async () => {
    if (!window.confirm("Удалить этот улов?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "catches", user.uid, "records", record.id));
      if (record.isPublic) deleteDoc(doc(db, "reports", record.id)).catch(()=>{});
      onBack();
    }
    catch(e){ setDeleting(false); }
  };

  const handlePublish = async () => {
    try {
      await updateDoc(doc(db, "catches", user.uid, "records", record.id), {isPublic:true});
      await setDoc(doc(db, "reports", record.id), {
        id:record.id, userId:record.userId, author:record.userName||user.displayName||"Рыбак",
        userPhoto:record.userPhoto||null,
        title:`${fish?.name||"Рыба"} ${record.weightGrams?(record.weightGrams/1000).toFixed(1)+" кг":""}`,
        fish:fish?.name||record.fishName||"Рыба",
        weight:record.weightGrams?(record.weightGrams/1000).toFixed(1):null,
        location:record.locationName, lat:record.lat||null, lng:record.lng||null,
        photoUrls:record.photoUrls||[], gearType:record.gearType||null, notes:record.notes||null,
        displayName:record.userName||user.displayName||"Рыбак",
        timestamp:serverTimestamp(),
      });
      setPublished(true);
    } catch(e){ console.error("publish",e); }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflowY:"auto"}}>
      {showEdit&&<EditCatchForm user={user} record={record} onClose={()=>setShowEdit(false)} onSaved={updated=>{setRecord(updated);setShowEdit(false);}}/>}
      <div style={{padding:"12px 14px",display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:"rgba(7,17,30,.9)",position:"sticky",top:0,zIndex:2}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:14,fontWeight:700,padding:"4px 0"}}>← Назад</button>
        <div style={{flex:1}}/>
        {(record.isPublic||published)&&<span style={{fontSize:11,color:C.accent}}>📢 Опубликован</span>}
      </div>
      <div style={{padding:"0 0 24px",flex:1}}>
        {/* Share card preview */}
        <div style={{padding:"14px 14px 0"}}>
          {cardLoading?(
            <div style={{width:"100%",aspectRatio:"1/1",borderRadius:16,background:"rgba(46,204,113,0.06)",border:"1px solid rgba(46,204,113,0.15)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <div style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
            </div>
          ):cardPreview?(
            <div style={{position:"relative",marginBottom:14}}>
              <img src={cardPreview} alt="Карточка улова" style={{width:"100%",borderRadius:16,display:"block",boxShadow:"0 4px 32px rgba(46,204,113,0.18)"}}/>
              <button onClick={()=>doShareCard(record)}
                style={{position:"absolute",bottom:12,right:12,padding:"9px 18px",background:"linear-gradient(135deg,#1a8a50,#2ecc71)",border:"none",borderRadius:24,color:"#07111e",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 2px 16px rgba(46,204,113,0.4)"}}>
                📤 Поделиться
              </button>
            </div>
          ):null}
        </div>
        {/* Photo gallery */}
        {photos.length>0&&(
          <div style={{position:"relative",background:"#000",marginBottom:0}}>
            <img src={photos[photoIdx]} alt="" style={{width:"100%",maxHeight:300,objectFit:"cover",display:"block"}}/>
            {photos.length>1&&(
              <>
                <button onClick={()=>setPhotoIdx(i=>Math.max(0,i-1))} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,.5)",border:"none",color:"#fff",fontSize:18,cursor:"pointer",display:photoIdx===0?"none":"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                <button onClick={()=>setPhotoIdx(i=>Math.min(photos.length-1,i+1))} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,.5)",border:"none",color:"#fff",fontSize:18,cursor:"pointer",display:photoIdx===photos.length-1?"none":"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                <div style={{position:"absolute",bottom:8,left:0,right:0,display:"flex",justifyContent:"center",gap:5}}>
                  {photos.map((_,i)=><div key={i} onClick={()=>setPhotoIdx(i)} style={{width:6,height:6,borderRadius:"50%",background:i===photoIdx?"#fff":"rgba(255,255,255,.4)",cursor:"pointer"}}/>)}
                </div>
              </>
            )}
          </div>
        )}
        <div style={{padding:"16px 14px"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:12}}>
            <div style={{fontSize:22,fontWeight:800,color:C.text}}>{fish?.name||record.fishName||"Рыба"}</div>
            {record.weightGrams&&<div style={{fontSize:28,fontWeight:800,color:C.accent}}>{(record.weightGrams/1000).toFixed(1)} кг</div>}
            {record.lengthCm&&<div style={{fontSize:14,color:C.muted}}>{record.lengthCm} см</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            <div style={{...glass(),padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}><MapPin size={14} color={C.accent}/><span style={{fontSize:13,color:C.text}}>{record.locationName||"Место не указано"}</span></div>
            <div style={{...glass(),padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}><Clock size={14} color={C.cyan}/><span style={{fontSize:13,color:C.text}}>{date.toLocaleDateString("ru-RU",{day:"2-digit",month:"long",year:"numeric"})} {date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span></div>
            {record.catchMethod&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>🚤 Тип: </span>{record.catchMethod}</div>}
            {record.gearType&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>🎣 Снасть: </span>{record.gearType}</div>}
            {record.bait&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>🪱 Приманка: </span>{record.bait}</div>}
            {record.depthM&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>📏 Глубина: </span>{record.depthM} м</div>}
            {record.distanceM&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>↔ Дистанция: </span>{record.distanceM} м</div>}
            {record.notes&&<div style={{...glass(),padding:"10px 14px",fontSize:13,color:C.text}}><span style={{color:C.muted}}>📝 Заметка: </span>{record.notes}</div>}
            {record.weather&&(
              <div style={{...glass(),padding:"12px 14px"}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700,letterSpacing:.5}}>ПОГОДА В МОМЕНТ УЛОВА</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                  {record.weather.temp!=null&&<span style={{fontSize:12,color:C.text}}>🌡 {record.weather.temp}°C</span>}
                  {record.weather.windSpeed!=null&&<span style={{fontSize:12,color:C.text}}>💨 {record.weather.windSpeed} м/с</span>}
                  {record.weather.pressure!=null&&<span style={{fontSize:12,color:C.text}}>⬇ {record.weather.pressure} мм</span>}
                  {record.weather.moonPhase!=null&&<span style={{fontSize:12,color:C.text}}>🌙 Луна {Math.round(record.weather.moonPhase*100)}%</span>}
                  {record.weather.biteIndex!=null&&<span style={{fontSize:12,color:C.accent,fontWeight:700}}>🎣 Клёв {record.weather.biteIndex}/10</span>}
                </div>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <button onClick={()=>setShowEdit(true)} style={{flex:1,padding:"12px",background:"rgba(46,204,113,.1)",border:"1px solid rgba(46,204,113,.3)",borderRadius:14,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              ✏️ Изменить
            </button>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!published&&!record.isPublic&&(
              <button onClick={handlePublish} style={{flex:1,padding:"12px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:14,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                📢 Опубликовать
              </button>
            )}
            <button onClick={handleDelete} disabled={deleting} style={{flex:1,padding:"12px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:14,color:"#f87171",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              {deleting?"...":"🗑 Удалить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ManualCatchForm ── */
function ManualCatchForm({ user, userLat, userLon, onClose, onSaved }) {
  const [fishSearch, setFishSearch] = useState("");
  const [fishType, setFishType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [depthM, setDepthM] = useState("");
  const [distanceM, setDistanceM] = useState("");
  const [locationName, setLocationName] = useState(userLat?getNearestSpotName(userLat,userLon):"");
  const [dateStr, setDateStr] = useState(()=>new Date().toISOString().slice(0,16));
  const [gearType, setGearType] = useState("");
  const [bait, setBait] = useState("");
  const [catchMethod, setCatchMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const fishFiltered = fishSearch ? FISH_TYPES.filter(f=>f.name.toLowerCase().includes(fishSearch.toLowerCase())) : FISH_TYPES;

  const fillFromLast = () => {
    getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), limit(1)))
      .then(snap=>{
        if(snap.empty) return;
        const r=snap.docs[0].data();
        if(r.locationName) setLocationName(r.locationName);
        if(r.gearType) setGearType(r.gearType);
        if(r.bait) setBait(r.bait);
        if(r.catchMethod) setCatchMethod(r.catchMethod);
        if(r.depthM) setDepthM(String(r.depthM));
        if(r.distanceM) setDistanceM(String(r.distanceM));
      });
  };

  const handleSave = async () => {
    if (!fishType) return alert("Выберите вид рыбы");
    setSaving(true);
    const dt = new Date(dateStr);
    const rec = {
      userId: user.uid, userName: user.displayName||"Рыбак",
      fishType, fishName: FISH_TYPES.find(f=>f.id===fishType)?.name||"",
      weightGrams: weightKg ? Math.round(parseFloat(weightKg)*1000) : null,
      lengthCm: lengthCm ? parseFloat(lengthCm) : null,
      depthM: depthM ? parseFloat(depthM) : null,
      distanceM: distanceM ? parseFloat(distanceM) : null,
      locationName: locationName||"Место не указано",
      lat: userLat||null, lng: userLon||null,
      gearType: gearType||null, bait: bait||null,
      catchMethod: catchMethod||null, notes: notes||null,
      photoUrls: [], isPublic: false, source: "manual",
      createdAt: Timestamp.fromDate(dt),
    };
    try {
      await addDoc(collection(db, "catches", user.uid, "records"), rec);
      logEvent("catch_saved",{source:"manual",fish_type:fishType,weight_g:rec.weightGrams||0,has_photo:false});
      onSaved?.();
      if(!navigator.onLine){
        const p=parseInt(localStorage.getItem("eger_offline_pending")||"0")+1;
        localStorage.setItem("eger_offline_pending",String(p));
        alert("✅ Улов сохранён локально.\nОн синхронизируется когда появится интернет.");
      }
      onClose();
    } catch(e){ setSaving(false); alert("Ошибка сохранения: "+e.message); }
  };

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:200,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"flex-end"}}>
      <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1f35",borderRadius:"24px 24px 0 0",maxHeight:"90vh",overflowY:"auto",padding:"20px 16px 40px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text,flex:1}}>📝 Добавить вручную</div>
          <button onClick={fillFromLast} title="Копировать с последней рыбалки" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"4px 8px",cursor:"pointer",color:C.muted,fontSize:11,fontWeight:700,marginRight:8}}>↩ Повторить</button>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        {/* Fish type */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ВИД РЫБЫ *</div>
          <input value={fishSearch} onChange={e=>setFishSearch(e.target.value)} placeholder="Поиск..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",marginBottom:8,outline:"none"}}/>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,maxHeight:120,overflowY:"auto"}}>
            {fishFiltered.map(f=>(
              <button key={f.id} onClick={()=>{setFishType(f.id);setFishSearch(f.name);}} style={{padding:"5px 11px",borderRadius:14,background:fishType===f.id?C.accentDim:C.surface,border:`1px solid ${fishType===f.id?C.accent:C.border}`,color:fishType===f.id?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{f.name}</button>
            ))}
          </div>
        </div>
        {/* Weight & length with LW predictor */}
        {(()=>{
          const LW_PARAMS={pike:{a:0.0059,b:3.05},perch:{a:0.0105,b:3.00},bream:{a:0.0066,b:3.13},carp:{a:0.0132,b:3.16},roach:{a:0.0080,b:3.06},tench:{a:0.0093,b:3.04},catfish:{a:0.0152,b:2.88},pike_perch:{a:0.0079,b:3.00},crucian:{a:0.0184,b:3.05},asp:{a:0.0088,b:3.00}};
          const p=LW_PARAMS[fishType]||{a:0.01,b:3.0};
          const L=parseFloat(lengthCm);
          const predG=L>5?p.a*Math.pow(L,p.b):null;
          const predKg=predG?Math.round(predG)/1000:null;
          return(
            <div style={{display:"flex",gap:10,marginBottom:predKg&&!weightKg?4:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ВЕС (КГ)</div>
                <input type="number" step="0.1" min="0" value={weightKg} onChange={e=>setWeightKg(e.target.value)} placeholder={predKg?`~${predKg.toFixed(2)}`:"0.0"} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДЛИНА (СМ)</div>
                <input type="number" step="1" min="0" value={lengthCm} onChange={e=>setLengthCm(e.target.value)} placeholder="0" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
              </div>
            </div>
          );
        })()}
        {(()=>{
          const LW_PARAMS={pike:{a:0.0059,b:3.05},perch:{a:0.0105,b:3.00},bream:{a:0.0066,b:3.13},carp:{a:0.0132,b:3.16},roach:{a:0.0080,b:3.06},tench:{a:0.0093,b:3.04},catfish:{a:0.0152,b:2.88},pike_perch:{a:0.0079,b:3.00},crucian:{a:0.0184,b:3.05},asp:{a:0.0088,b:3.00}};
          const p=LW_PARAMS[fishType]||{a:0.01,b:3.0};
          const L=parseFloat(lengthCm);
          const predG=L>5?p.a*Math.pow(L,p.b):null;
          const predKg=predG?Math.round(predG)/1000:null;
          if(!predKg||weightKg) return null;
          return(
            <div onClick={()=>setWeightKg(predKg.toFixed(2))} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"rgba(46,204,113,.07)",border:`1px solid ${C.borderHi}`,marginBottom:12,cursor:"pointer"}}>
              <span style={{fontSize:11,color:C.accent}}>🧮 Расчётный вес по длине {lengthCm} см:</span>
              <span style={{fontSize:12,fontWeight:700,color:C.accent}}>~{predKg.toFixed(2)} кг</span>
              <span style={{fontSize:10,color:C.muted,marginLeft:"auto"}}>Нажать чтобы вставить</span>
            </div>
          );
        })()}
        {/* Location & date */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>МЕСТО</div>
          <input value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="Название места" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДАТА И ВРЕМЯ</div>
          <input type="datetime-local" value={dateStr} onChange={e=>setDateStr(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
        </div>
        {/* Gear */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>СНАСТЬ</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {GEAR_TYPES.map(g=>(
              <button key={g} onClick={()=>setGearType(gearType===g?"":g)} style={{padding:"5px 11px",borderRadius:14,background:gearType===g?C.accentDim:C.surface,border:`1px solid ${gearType===g?C.accent:C.border}`,color:gearType===g?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{g}</button>
            ))}
          </div>
        </div>
        {/* Catch method */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ТИП ЛОВЛИ</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {CATCH_METHODS.map(m=>(
              <button key={m} onClick={()=>setCatchMethod(catchMethod===m?"":m)} style={{padding:"5px 11px",borderRadius:14,background:catchMethod===m?C.accentDim:C.surface,border:`1px solid ${catchMethod===m?C.accent:C.border}`,color:catchMethod===m?C.accent:C.muted,fontSize:12,cursor:"pointer"}}>{m}</button>
            ))}
          </div>
        </div>
        {/* Bait */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ПРИМАНКА / НАЖИВКА</div>
          <input value={bait} onChange={e=>setBait(e.target.value)} placeholder="Напр.: Джиг, червь..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
        </div>
        {/* Depth & Distance */}
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ГЛУБИНА (М)</div>
            <input type="number" step="0.5" min="0" value={depthM} onChange={e=>setDepthM(e.target.value)} placeholder="2.5" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ДИСТАНЦИЯ (М)</div>
            <input type="number" step="1" min="0" value={distanceM} onChange={e=>setDistanceM(e.target.value)} placeholder="30" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
          </div>
        </div>
        {/* Notes */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700}}>ЗАМЕТКИ</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Любые заметки о рыбалке..." rows={3} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:13,boxSizing:"border-box",resize:"none",outline:"none"}}/>
        </div>
        <button onClick={handleSave} disabled={saving||!fishType} style={{width:"100%",padding:"15px",borderRadius:16,border:"none",background:fishType?`linear-gradient(135deg,#1a8a50,${C.accent})`:"#1e3a2a",color:fishType?"#07111e":"#4a6e5a",fontSize:15,fontWeight:800,cursor:fishType?"pointer":"default"}}>
          {saving?"Сохраняем...":"💾 Сохранить улов"}
        </button>
      </div>
    </div>
  );
}

/* ── DiaryScreen ── */
export default function DiaryScreen({ user, onLogin, userLat, userLon }) {
  if (!user) return <RequireAuth user={user} onLogin={onLogin}><div/></RequireAuth>;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const lastDocRef = useRef(null);
  const [filterFish, setFilterFish] = useState("");
  const [filterGear, setFilterGear] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(()=>{
    const t = setTimeout(()=>setSearch(searchInput), 300);
    return ()=>clearTimeout(t);
  },[searchInput]);
  const [selected, setSelected] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const loadInitial = useCallback(()=>{
    setLoading(true); setNoMore(false); lastDocRef.current=null;
    const unsub = onSnapshot(
      query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), limit(20)),
      snap=>{
        const docs = snap.docs;
        if (docs.length>0) lastDocRef.current = docs[docs.length-1];
        if (docs.length<20) setNoMore(true);
        setRecords(docs.map(d=>({...d.data(),id:d.id})));
        setLoading(false);
      },()=>setLoading(false));
    return unsub;
  },[user.uid]);

  useEffect(()=>{
    logEvent("diary_opened",{records_count:records.length});
    const unsub = loadInitial();
    return unsub;
  },[user.uid]);

  const loadMore = async () => {
    if (!lastDocRef.current||loadingMore||noMore) return;
    setLoadingMore(true);
    const snap = await getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), startAfter(lastDocRef.current), limit(20)));
    if (snap.docs.length>0) lastDocRef.current = snap.docs[snap.docs.length-1];
    if (snap.docs.length<20) setNoMore(true);
    setRecords(prev=>[...prev,...snap.docs.map(d=>({...d.data(),id:d.id}))]);
    setLoadingMore(false);
  };

  const periodStart = useMemo(()=>{
    const now=new Date();
    if(filterPeriod==="week") return new Date(now.getFullYear(),now.getMonth(),now.getDate()-7);
    if(filterPeriod==="month") return new Date(now.getFullYear(),now.getMonth(),1);
    if(filterPeriod==="year") return new Date(now.getFullYear(),0,1);
    return null;
  },[filterPeriod]);

  const filtered = useMemo(()=>{
    return records.filter(r=>{
      if(filterFish && r.fishType!==filterFish) return false;
      if(filterGear && r.gearType!==filterGear) return false;
      if(periodStart){const d=r.createdAt?.toDate?.(); if(!d||d<periodStart) return false;}
      if(search){
        const q=search.toLowerCase();
        const fishName=(FISH_TYPES.find(f=>f.id===r.fishType)?.name||r.fishName||"").toLowerCase();
        const loc=(r.locationName||"").toLowerCase();
        const notes=(r.notes||"").toLowerCase();
        if(!fishName.includes(q)&&!loc.includes(q)&&!notes.includes(q)) return false;
      }
      return true;
    });
  },[records,filterFish,filterGear,filterPeriod,search,periodStart]);

  const fishInRecs = useMemo(()=>[...new Set(records.map(r=>r.fishType).filter(Boolean))],[records]);
  const gearsInRecs = useMemo(()=>[...new Set(records.map(r=>r.gearType).filter(Boolean))],[records]);
  const totalW = useMemo(()=>records.reduce((s,r)=>s+(r.weightGrams||0),0),[records]);
  const fishCounts = useMemo(()=>{const m={};records.forEach(r=>{if(r.fishType) m[r.fishType]=(m[r.fishType]||0)+1;});return m;},[records]);
  const gearCounts = useMemo(()=>{const m={};records.forEach(r=>{if(r.gearType) m[r.gearType]=(m[r.gearType]||0)+1;});return m;},[records]);

  const handleScroll = useCallback((e)=>{
    const el=e.currentTarget;
    if(el.scrollHeight-el.scrollTop-el.clientHeight<100) loadMore();
  },[loadMore]);

  const exportCSV = useCallback(async()=>{
    const snap = await getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc")));
    const rows = snap.docs.map(d=>d.data());
    const header = ["Дата","Рыба","Вес (г)","Длина (см)","Глубина (м)","Дистанция (м)","Место","Снасть","Наживка","Заметки","Публично"];
    const escape = v => `"${String(v||"").replace(/"/g,'""')}"`;
    const csv = [header.map(escape).join(","), ...rows.map(r=>[
      r.createdAt?.toDate?.().toLocaleString("ru-RU")||"",
      FISH_TYPES.find(f=>f.id===r.fishType)?.name||r.fishType||"",
      r.weightGrams||0, r.lengthCm||"", r.depthM||"", r.distanceM||"", r.locationName||"",
      r.gearType||"", r.bait||"", r.notes||"", r.isPublic?"Да":"Нет"
    ].map(escape).join(","))].join("\n");
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eger_diary_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    logEvent("diary_exported",{count:rows.length});
  },[user.uid]);

  if (selected) return <CatchDetailView record={selected} user={user} onBack={()=>setSelected(null)}/>;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {showManual&&<ManualCatchForm user={user} userLat={userLat} userLon={userLon} onClose={()=>setShowManual(false)} onSaved={()=>loadInitial()}/>}
      {/* Header */}
      <div style={{padding:"12px 14px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:19,fontWeight:800,color:C.text}}>🎣 Мой дневник</div>
          <div style={{display:"flex",gap:6}}>
            {records.length>0&&<button onClick={exportCSV} title="Экспорт CSV" style={{padding:"6px 10px",borderRadius:14,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>📥 CSV</button>}
            <button onClick={()=>setShowManual(true)} style={{padding:"6px 14px",borderRadius:14,background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Добавить</button>
          </div>
        </div>
        {/* Stats mini-bar */}
        {records.length>0&&(
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[{v:records.length,l:"записей"},{v:(totalW/1000).toFixed(1)+" кг",l:"всего"},{v:fishInRecs.length,l:"видов рыб"}].map(s=>(
              <div key={s.l} style={{flex:1,padding:"8px 6px",background:C.surfaceHi,borderRadius:12,textAlign:"center",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:14,fontWeight:800,color:C.accent}}>{s.v}</div>
                <div style={{fontSize:9,color:C.dimmer}}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
        {/* Search */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.surfaceHi,borderRadius:12,padding:"8px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
          <span style={{fontSize:14,color:C.muted}}>🔍</span>
          <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Поиск по рыбе, месту, заметкам..." style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:13}}/>
          {(search||filterFish||filterGear||filterPeriod!=="all")&&<span style={{fontSize:11,color:C.accent,fontWeight:700,flexShrink:0}}>{filtered.length}</span>}
          {searchInput&&<button onClick={()=>{setSearchInput("");setSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1}}>×</button>}
        </div>
        {/* Period filter */}
        <div style={{display:"flex",gap:5,marginBottom:6}}>
          {[["all","Всё время"],["week","Неделя"],["month","Месяц"],["year","Год"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterPeriod(v)} style={{flex:1,padding:"5px 4px",background:filterPeriod===v?C.accentDim:C.surface,border:`1px solid ${filterPeriod===v?C.accent:C.border}`,borderRadius:10,color:filterPeriod===v?C.accent:C.muted,fontSize:11,cursor:"pointer",fontWeight:filterPeriod===v?700:400}}>{l}</button>
          ))}
        </div>
        {/* Fish filter chips */}
        {fishInRecs.length>0&&(
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:8}}>
            <button onClick={()=>setFilterFish("")} style={{flexShrink:0,padding:"4px 10px",background:!filterFish?C.accentDim:C.surface,border:`1px solid ${!filterFish?C.accent:C.border}`,borderRadius:14,color:!filterFish?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>Все</button>
            {fishInRecs.map(ft=>{const f=FISH_TYPES.find(f=>f.id===ft);const cnt=fishCounts[ft]||0;return(
              <button key={ft} onClick={()=>setFilterFish(filterFish===ft?"":ft)} style={{flexShrink:0,padding:"4px 10px",background:filterFish===ft?C.accentDim:C.surface,border:`1px solid ${filterFish===ft?C.accent:C.border}`,borderRadius:14,color:filterFish===ft?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{f?.name||ft} <span style={{opacity:.6}}>({cnt})</span></button>
            );})}
            {gearsInRecs.map(g=>{const cnt=gearCounts[g]||0;return(
              <button key={g} onClick={()=>setFilterGear(filterGear===g?"":g)} style={{flexShrink:0,padding:"4px 10px",background:filterGear===g?"rgba(34,211,238,.15)":C.surface,border:`1px solid ${filterGear===g?C.cyan:C.border}`,borderRadius:14,color:filterGear===g?C.cyan:C.muted,fontSize:11,cursor:"pointer"}}>🎣 {g} <span style={{opacity:.6}}>({cnt})</span></button>
            );})};
          </div>
        )}
      </div>
      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 14px 80px"}} onScroll={handleScroll}>
        {loading&&[1,2,3,4].map(i=>(
          <div key={i} style={{height:78,borderRadius:16,background:C.surface,animation:"pulseGlow 1.5s ease infinite",marginBottom:8,display:"flex",gap:12,padding:"10px 14px",alignItems:"center"}}>
            <div style={{width:58,height:58,borderRadius:12,background:C.surfaceHi}}/>
            <div style={{flex:1}}>
              <div style={{height:14,borderRadius:6,background:C.surfaceHi,marginBottom:6,width:"60%"}}/>
              <div style={{height:10,borderRadius:6,background:C.surfaceHi,width:"40%"}}/>
            </div>
          </div>
        ))}
        {!loading&&filtered.length===0&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🎣</div>
            {search||filterFish||filterGear||filterPeriod!=="all"?(
              <>
                <div style={{fontSize:15,fontWeight:700,marginBottom:8,color:C.text}}>Ничего не найдено</div>
                <button onClick={()=>{setSearchInput("");setSearch("");setFilterFish("");setFilterGear("");setFilterPeriod("all");}} style={{padding:"8px 20px",borderRadius:12,border:`1px solid ${C.accent}`,background:C.accentDim,color:C.accent,fontSize:13,cursor:"pointer"}}>Сбросить фильтры</button>
              </>
            ):(
              <>
                <div style={{fontSize:16,fontWeight:700,marginBottom:8,color:C.text}}>Пока нет записей</div>
                <div style={{fontSize:13,marginBottom:16}}>Нажми кнопку 🐟 чтобы добавить первый улов</div>
                <button onClick={()=>setShowManual(true)} style={{padding:"10px 24px",borderRadius:14,background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Добавить вручную</button>
              </>
            )}
          </div>
        )}
        {!loading&&filtered.map(rec=><CatchCard key={rec.id} record={rec} onClick={()=>setSelected(rec)} onDelete={async id=>{await deleteDoc(doc(db, "catches", user.uid, "records", id));}}/>)}
        {loadingMore&&<div style={{textAlign:"center",padding:"12px",color:C.muted,fontSize:13}}>Загрузка...</div>}
        {!loading&&!noMore&&records.length>=20&&!loadingMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",borderRadius:14,border:`1px solid ${C.border}`,background:C.surface,color:C.muted,fontSize:13,cursor:"pointer",marginBottom:8}}>Загрузить ещё</button>
        )}
      </div>
    </div>
  );
}
