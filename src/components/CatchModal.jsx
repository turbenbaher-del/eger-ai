import { memo, useRef, useState, useMemo } from 'react';
import { C, glass } from '../tokens.js';
import { XIcon, Camera, MapPin } from '../icons/index.jsx';
import { db, storage, logEvent, functionsRegion } from '../firebase.js';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { enqueue } from '../lib/offlineQueue.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { FISH_TYPES, GEAR_TYPES, CATCH_METHODS, FISH_INFO, checkAndAwardBadges } from '../data/fishing.jsx';
import { getNearestSpotName } from '../data/spots.js';
import { doShareCard } from '../lib/shareCard.js';

export default function CatchModal({ user, userLat, userLon, onClose, weather }) {
  const [step, setStep] = useState(1);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [fishSearch, setFishSearch] = useState("");
  const [fishType, setFishType] = useState(null);
  const [weightKg, setWeightKg] = useState("");
  const [locName, setLocName] = useState(()=>getNearestSpotName(userLat,userLon));
  const [gearType, setGearType] = useState("");
  const [catchMethod, setCatchMethod] = useState("");
  const [bait, setBait] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedRec, setSavedRec] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiVisionLoading, setAiVisionLoading] = useState(false);
  const [aiVisionResult, setAiVisionResult] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const fileRef = useRef();

  const analyzePhoto = (canvas, w, h) => {
    try {
      const ctx = canvas.getContext("2d");
      const d = ctx.getImageData(0, 0, Math.min(w,200), Math.min(h,200)).data;
      let r=0,g=0,b=0,n=0;
      for(let i=0;i<d.length;i+=16){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
      r/=n; g/=n; b/=n;
      const bright=(r+g+b)/3;
      const silver=bright>145&&Math.max(r,g,b)-Math.min(r,g,b)<45;
      const golden=r>160&&g>120&&b<110&&r>g;
      const dark=bright<75;
      const greenish=(g-(r+b)/2)>15;
      const reddish=(r-(g+b)/2)>20;
      if(silver&&bright>180) return {id:"pike",name:"Щука",conf:65};
      if(dark&&!greenish) return {id:"catfish",name:"Сом",conf:58};
      if(golden&&reddish) return {id:"carp",name:"Карп",conf:62};
      if(greenish&&!dark) return {id:"perch",name:"Окунь",conf:60};
      if(silver) return {id:"bream",name:"Лещ",conf:58};
      if(reddish) return {id:"roach",name:"Тарань",conf:52};
      return {id:"pike_perch",name:"Судак",conf:48};
    } catch(e){ return null; }
  };

  const fishFiltered = useMemo(()=>
    fishSearch ? FISH_TYPES.filter(f=>f.name.toLowerCase().includes(fishSearch.toLowerCase())) : FISH_TYPES.slice(0,10)
  ,[fishSearch]);

  const handleFile = e => {
    const file = e.target.files?.[0]; if(!file) return;
    logEvent("catch_photo_taken",{ai_detected:false});
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX=1200; let w=img.width,h=img.height;
        if(w>MAX||h>MAX){ if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;} }
        canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        canvas.toBlob(blob=>{setPhotoBlob(blob);setPhotoUrl(URL.createObjectURL(blob));const ai=analyzePhoto(canvas,w,h);setAiSuggestion(ai);setStep(2);}, "image/jpeg", 0.82);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const identifyWithAI = async () => {
    if (!photoBlob) return;
    setAiVisionLoading(true);
    setAiVisionResult(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise(resolve => {
        reader.onload = e => resolve(e.target.result.split(",")[1]);
        reader.readAsDataURL(photoBlob);
      });
      const fn = httpsCallable(functionsRegion, "identifyFish", {timeout: 30000});
      const result = await fn({ imageBase64: base64 });
      setAiVisionResult(result.data);
    } catch(e) {
      setAiVisionResult({ error: true, fish: null });
    }
    setAiVisionLoading(false);
  };

  const handleSave = async () => {
    if (!fishType||!weightKg||isNaN(parseFloat(weightKg))||parseFloat(weightKg)<=0) return;
    setSaving(true);
    try {
      let uploadedUrl = null;
      if (photoBlob && navigator.onLine) {
        const storageRef = ref(storage,`catches/${user.uid}/${Date.now()}.jpg`);
        await uploadBytes(storageRef,photoBlob,{contentType:"image/jpeg"});
        uploadedUrl = await getDownloadURL(storageRef);
      }
      const recRef = doc(collection(db,"catches",user.uid,"records"));
      const recId = recRef.id;
      const weatherData = weather ? {temp:weather.temp,pressure:weather.pressure,windSpeed:weather.windSpeed,biteIndex:weather.biteIndex||null} : null;
      const record = {
        id:recId, userId:user.uid,
        userName:user.displayName||"Рыбак", userPhoto:user.photoURL||null,
        createdAt:serverTimestamp(),
        fishType:fishType.id, fishName:fishType.name,
        weightGrams:Math.round(parseFloat(weightKg)*1000),
        locationName:locName||"Неизвестное место",
        lat:userLat||null, lng:userLon||null,
        gearType:null, catchMethod:null, bait:null, notes:null,
        photoUrls:uploadedUrl?[uploadedUrl]:[], isPublic:false, source:"button",
        weather:weatherData,
      };
      if (!navigator.onLine) {
        await enqueue("add", record);
        const cur = parseInt(localStorage.getItem("eger_offline_pending")||"0");
        localStorage.setItem("eger_offline_pending", String(cur+1));
        setSavedOffline(true);
        setSavedRec(record); setSaving(false); setStep(3);
        return;
      }
      await setDoc(recRef, record);
      logEvent("catch_saved",{source:"button",has_photo:!!uploadedUrl,fish_type:fishType.id,weight_g:record.weightGrams,is_offline:!navigator.onLine});
      setSavedRec(record); setSaving(false); setStep(3);
      logEvent("catch_details_opened");
    } catch(e){ console.error("save catch",e); setSaving(false); }
  };

  const handleFinish = async () => {
    if (savedRec&&(gearType||catchMethod||bait||notes)) {
      try {
        await updateDoc(doc(db,"catches",user.uid,"records",savedRec.id),{gearType:gearType||null,catchMethod:catchMethod||null,bait:bait||null,notes:notes||null});
        logEvent("catch_details_completed",{gear_type:gearType||"",has_bait:!!bait});
      } catch(e){}
    }
    getDocs(collection(db,"catches",user.uid,"records")).then(snap=>{
      checkAndAwardBadges(user.uid,snap.docs.map(d=>d.data()));
    }).catch(()=>{});
    setStep(4);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:200,display:"flex",alignItems:"flex-end",animation:"fadeIn .15s"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1e30",borderRadius:"24px 24px 0 0",maxHeight:"92dvh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"slideUp .25s ease"}}>
        <div style={{padding:"16px 20px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text}}>
            {step===1?"📷 Сфотографируй улов":step===2?"🐟 Запиши улов":"✅ Улов сохранён!"}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6}}><XIcon size={20}/></button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20}}>

          {step===1&&(
            <div style={{display:"flex",flexDirection:"column",gap:16,alignItems:"center",paddingTop:8}}>
              <div onClick={()=>fileRef.current.click()} style={{width:190,height:190,borderRadius:24,background:C.surface,border:`2px dashed ${C.accent}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,cursor:"pointer"}}>
                <Camera size={52} color={C.accent}/>
                <span style={{color:C.accent,fontWeight:700,fontSize:15}}>Сделать фото</span>
                <span style={{color:C.muted,fontSize:11}}>или выбрать из галереи</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
              <button onClick={()=>setStep(2)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 28px",color:C.muted,cursor:"pointer",fontSize:13}}>
                Без фото — рыба отпущена
              </button>
            </div>
          )}

          {step===2&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {photoUrl&&<img src={photoUrl} alt="" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:16}}/>}
              {aiSuggestion&&!fishType&&!aiVisionResult&&(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(46,204,113,.08)",border:`1px solid ${C.borderHi}`,borderRadius:12}}>
                  <div style={{fontSize:22}}>🤖</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:.5}}>ИИ РАСПОЗНАЛ</div>
                    <div style={{fontSize:13,color:C.text,fontWeight:700}}>{aiSuggestion.name} <span style={{fontSize:10,color:C.muted,fontWeight:400}}>({aiSuggestion.conf}%)</span></div>
                  </div>
                  <button onClick={()=>{const f=FISH_TYPES.find(f=>f.id===aiSuggestion.id);if(f){setFishType(f);setFishSearch("");}}} style={{padding:"6px 12px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:10,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>Принять</button>
                </div>
              )}
              {photoUrl&&!fishType&&(
                <div style={{display:"flex",gap:8}}>
                  <button onClick={identifyWithAI} disabled={aiVisionLoading}
                    style={{flex:1,padding:"9px 12px",background:"rgba(34,211,238,.08)",border:`1px solid rgba(34,211,238,.3)`,borderRadius:12,color:aiVisionLoading?C.muted:C.cyan,fontSize:12,fontWeight:700,cursor:aiVisionLoading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .2s"}}>
                    {aiVisionLoading?<><div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${C.cyan}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/> Определяем...</>:"🔍 Определить через ИИ"}
                  </button>
                </div>
              )}
              {aiVisionResult&&!fishType&&(
                <div style={{padding:"10px 12px",background:"rgba(34,211,238,.08)",border:`1px solid rgba(34,211,238,.3)`,borderRadius:12}}>
                  {aiVisionResult.error ? (
                    <div style={{fontSize:12,color:C.muted}}>Не удалось определить вид рыбы — выбери вручную</div>
                  ) : (
                    <>
                      <div style={{fontSize:10,color:C.cyan,fontWeight:700,letterSpacing:.5,marginBottom:4}}>🔍 CLAUDE VISION ОПРЕДЕЛИЛ</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:800,color:C.text}}>{aiVisionResult.fish}</div>
                          {aiVisionResult.confidence&&<div style={{fontSize:10,color:C.muted}}>Уверенность: {aiVisionResult.confidence}%{aiVisionResult.weight_estimate?` · Вес: ~${aiVisionResult.weight_estimate}`:""}</div>}
                          {aiVisionResult.tip&&<div style={{fontSize:11,color:C.dimmer,marginTop:2}}>{aiVisionResult.tip}</div>}
                        </div>
                        <button onClick={()=>{
                          const name=aiVisionResult.fish||"";
                          const f=FISH_TYPES.find(f=>f.name.toLowerCase()===name.toLowerCase())||FISH_TYPES.find(f=>name.toLowerCase().includes(f.name.toLowerCase()));
                          if(f){setFishType(f);setFishSearch("");}
                          else{setFishSearch(name);}
                        }} style={{padding:"6px 12px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:10,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>Принять</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700,letterSpacing:.5}}>ВИД РЫБЫ</div>
                {fishType?(
                  <>
                  <div style={{padding:"12px 14px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{color:C.accent,fontWeight:700,fontSize:15}}>{fishType.name}</span>
                    <button onClick={()=>setFishType(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:0}}><XIcon size={16}/></button>
                  </div>
                  {FISH_INFO[fishType.id]&&(
                    <div style={{padding:"10px 12px",background:"rgba(255,255,255,.04)",border:`1px solid ${C.border}`,borderRadius:12,marginTop:6,fontSize:11,color:C.muted,lineHeight:1.7}}>
                      <div><span style={{color:C.dimmer}}>🎣 Приманка:</span> {FISH_INFO[fishType.id].bait}</div>
                      <div><span style={{color:C.dimmer}}>📅 Сезон:</span> {FISH_INFO[fishType.id].season}</div>
                      <div><span style={{color:C.dimmer}}>📍 Место:</span> {FISH_INFO[fishType.id].habitat}</div>
                      <div><span style={{color:C.dimmer}}>⚖️ Вес:</span> {FISH_INFO[fishType.id].size}</div>
                    </div>
                  )}
                  </>
                ):(
                  <>
                    <input value={fishSearch} onChange={e=>setFishSearch(e.target.value)} placeholder="Поиск рыбы..."
                      style={{width:"100%",padding:"11px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,color:C.text,fontSize:14,outline:"none"}}/>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                      {fishFiltered.map(f=>(
                        <button key={f.id} onClick={()=>{setFishType(f);setFishSearch("");}}
                          style={{padding:"6px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,color:C.text,fontSize:12,cursor:"pointer"}}>
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:700,letterSpacing:.5}}>ВЕС (КГ)</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <button onClick={()=>setWeightKg(v=>{const n=Math.max(0,parseFloat(v||0)-0.1); return n.toFixed(1);})} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",flexShrink:0}}>−</button>
                  <input type="number" inputMode="decimal" value={weightKg} onChange={e=>setWeightKg(e.target.value)}
                    placeholder="0.0" min="0.1" max="99.9" step="0.1"
                    style={{flex:1,padding:"12px 8px",background:C.surface,border:`1px solid ${weightKg?C.accent:C.border}`,borderRadius:14,color:C.text,fontSize:24,fontWeight:800,outline:"none",textAlign:"center"}}/>
                  <button onClick={()=>setWeightKg(v=>{const n=(parseFloat(v||0)+0.1); return n.toFixed(1);})} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",flexShrink:0}}>+</button>
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {["0.3","0.5","1.0","1.5","2.0","3.0","5.0","10.0"].map(w=>(
                    <button key={w} onClick={()=>setWeightKg(w)} style={{flex:1,minWidth:0,padding:"5px 2px",borderRadius:10,background:weightKg===w?C.accentDim:C.surface,border:`1px solid ${weightKg===w?C.accent:C.border}`,color:weightKg===w?C.accent:C.muted,fontSize:11,cursor:"pointer",fontWeight:weightKg===w?700:400}}>{w}</button>
                  ))}
                </div>
              </div>
              <div style={{...glass(),padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                <MapPin size={14} color={C.accent}/>
                <span style={{fontSize:12,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{locName}</span>
              </div>
              <button onClick={handleSave} disabled={!fishType||!weightKg||parseFloat(weightKg)<=0||saving}
                style={{width:"100%",padding:"16px",background:fishType&&weightKg&&!saving?`linear-gradient(135deg,#1a8a50,${C.accent})`:"rgba(46,204,113,.2)",border:"none",borderRadius:16,color:fishType&&weightKg&&!saving?"#07111e":"rgba(232,244,240,.3)",fontSize:16,fontWeight:800,cursor:fishType&&weightKg&&!saving?"pointer":"default",transition:"all .2s"}}>
                {saving?"Сохраняем...":"💾 СОХРАНИТЬ"}
              </button>
            </div>
          )}

          {step===3&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{textAlign:"center",padding:"8px 0 16px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:48,marginBottom:8}}>🎉</div>
                <div style={{color:C.accent,fontWeight:800,fontSize:20,marginBottom:2}}>
                  {savedRec?.fishName} · {savedRec?(savedRec.weightGrams/1000).toFixed(1):"0"} кг
                </div>
                <div style={{color:C.muted,fontSize:12}}>{savedOffline?"⏳ сохранён локально — синхронизируется при подключении":"сохранён в дневник"}</div>
              </div>
              <div style={{fontSize:11,color:C.dimmer,textAlign:"center"}}>Добавь детали — необязательно, улучшит ИИ-анализ</div>
              <div>
                <div style={{fontSize:11,color:C.dimmer,marginBottom:6}}>Снасть</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {GEAR_TYPES.map(g=>(
                    <button key={g} onClick={()=>setGearType(gearType===g?"":g)}
                      style={{padding:"6px 12px",background:gearType===g?C.accentDim:C.surface,border:`1px solid ${gearType===g?C.accent:C.border}`,borderRadius:16,color:gearType===g?C.accent:C.text,fontSize:12,cursor:"pointer"}}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dimmer,marginBottom:6}}>Тип ловли</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {CATCH_METHODS.map(m=>(
                    <button key={m} onClick={()=>setCatchMethod(catchMethod===m?"":m)}
                      style={{padding:"6px 12px",background:catchMethod===m?C.accentDim:C.surface,border:`1px solid ${catchMethod===m?C.accent:C.border}`,borderRadius:16,color:catchMethod===m?C.accent:C.text,fontSize:12,cursor:"pointer"}}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dimmer,marginBottom:6}}>Приманка / Наживка</div>
                <input value={bait} onChange={e=>setBait(e.target.value)} placeholder="Джиг, червь, воблер..."
                  style={{width:"100%",padding:"10px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,outline:"none"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dimmer,marginBottom:6}}>Заметка</div>
                <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,300))} placeholder="Условия ловли, хитрости..." rows={2}
                  style={{width:"100%",padding:"10px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,outline:"none",resize:"none"}}/>
              </div>
              <button onClick={handleFinish}
                style={{width:"100%",padding:"14px",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,border:"none",borderRadius:16,color:"#07111e",fontSize:15,fontWeight:800,cursor:"pointer",marginTop:4}}>
                Готово →
              </button>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textAlign:"center",padding:6}}>
                Закрыть без деталей
              </button>
            </div>
          )}

          {step===4&&(
            <div style={{display:"flex",flexDirection:"column",gap:16,alignItems:"center",paddingTop:8}}>
              <div style={{fontSize:56,marginBottom:4}}>🎉</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:C.accent}}>{savedRec?.fishName} · {savedRec?(savedRec.weightGrams/1000).toFixed(1):"0"} кг</div>
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>Улов сохранён! Похвастаться?</div>
              </div>
              <button onClick={()=>doShareCard(savedRec)} style={{width:"100%",padding:"14px",background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",borderRadius:16,color:C.cyan,fontSize:15,fontWeight:800,cursor:"pointer"}}>
                📤 Поделиться карточкой
              </button>
              <button onClick={()=>{
                if(savedRec){
                  updateDoc(doc(db,"catches",user.uid,"records",savedRec.id),{isPublic:true}).catch(()=>{});
                  setDoc(doc(db,"reports",savedRec.id),{
                    id:savedRec.id,userId:savedRec.userId,
                    displayName:savedRec.userName||"Рыбак",author:savedRec.userName||"Рыбак",
                    title:`${savedRec.fishName} ${(savedRec.weightGrams/1000).toFixed(1)} кг`,
                    fish:savedRec.fishName,weight:(savedRec.weightGrams/1000).toFixed(1),
                    location:savedRec.locationName,lat:savedRec.lat||null,lng:savedRec.lng||null,
                    photoUrls:savedRec.photoUrls||[],gearType:gearType||null,notes:notes||null,
                    timestamp:serverTimestamp(),
                  }).catch(()=>{});
                }
                onClose();
              }} style={{width:"100%",padding:"14px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:16,color:C.accent,fontSize:15,fontWeight:800,cursor:"pointer"}}>
                📢 Опубликовать в сообществе
              </button>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:6}}>
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
