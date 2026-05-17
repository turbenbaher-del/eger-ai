import { memo, useRef, useState } from 'react';
import { C, glass } from '../tokens.js';
import { FISH_TYPES } from '../data/fishing.jsx';

function CatchCard({ record, onClick, onDelete }) {
  const fish = FISH_TYPES.find(f=>f.id===record.fishType);
  const date = record.createdAt?.toDate?record.createdAt.toDate():new Date(parseInt(record.id)||Date.now());
  const dateStr = date.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"});
  const wStr = record.weightGrams?`${(record.weightGrams/1000).toFixed(1)} кг`:"";
  const hasPhoto = !!record.photoUrls?.[0];
  const [swipeX, setSwipeX] = useState(0);
  const tRef = useRef({x:0, moving:false});
  const onTS = e => { tRef.current={x:e.touches[0].clientX,moving:false}; };
  const onTM = e => {
    const dx=e.touches[0].clientX-tRef.current.x;
    if(!tRef.current.moving&&Math.abs(dx)>8) tRef.current.moving=true;
    if(tRef.current.moving&&dx<0){ e.preventDefault(); setSwipeX(Math.max(-88,dx)); }
  };
  const onTE = () => { setSwipeX(p=>p<-44?-88:0); tRef.current.moving=false; };
  const handleClick = () => { if(Math.abs(swipeX)>10){ setSwipeX(0); return; } onClick(); };

  return (
    <div style={{position:"relative",overflow:"hidden",marginBottom:8,borderRadius:16}}>
      {onDelete&&<div onClick={e=>{e.stopPropagation();if(window.confirm("Удалить улов?"))onDelete(record.id);}}
        style={{position:"absolute",right:0,top:0,bottom:0,width:88,background:"#ef4444",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",borderRadius:"0 16px 16px 0",zIndex:0}}>
        <span style={{fontSize:20}}>🗑</span><span style={{fontSize:10,color:"#fff",fontWeight:700,marginTop:2}}>Удалить</span>
      </div>}

      <div onClick={handleClick} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
        style={{...glass(),overflow:"hidden",cursor:"pointer",borderRadius:16,
          transform:`translateX(${swipeX}px)`,transition:tRef.current.moving?"none":"transform .2s ease",position:"relative",zIndex:1}}>

        {hasPhoto ? (
          <>
            <div style={{position:"relative",height:160,overflow:"hidden"}}>
              <img src={record.photoUrls[0]} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(7,17,30,0.05) 30%,rgba(7,17,30,0.85) 100%)"}}/>
              {record.isPublic&&(
                <div style={{position:"absolute",top:10,right:10,background:"rgba(46,204,113,0.25)",border:"1px solid rgba(46,204,113,0.5)",borderRadius:20,padding:"3px 9px",fontSize:10,color:C.accent,fontWeight:700}}>📢 публ.</div>
              )}
              {(record.weightGrams||0)>=5000&&(
                <div style={{position:"absolute",top:10,left:10,background:"rgba(234,179,8,0.25)",border:"1px solid rgba(234,179,8,0.6)",borderRadius:20,padding:"3px 9px",fontSize:10,color:"#facc15",fontWeight:700}}>🏆 Трофей</div>
              )}
              <div style={{position:"absolute",bottom:10,left:12,right:12}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <span style={{fontSize:17,fontWeight:800,color:"#fff"}}>{fish?.name||record.fishName||"Рыба"}</span>
                  {wStr&&<span style={{fontSize:18,fontWeight:800,color:C.accent}}>{wStr}</span>}
                </div>
                <div style={{fontSize:11,color:"rgba(232,244,240,0.7)",marginTop:2}}>📍 {record.locationName||"Место не указано"}</div>
              </div>
            </div>
            <div style={{padding:"9px 12px",display:"flex",gap:8,alignItems:"center"}}>
              <div style={{flex:1,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {record.gearType&&<span style={{fontSize:10,color:C.dimmer,background:C.surface,borderRadius:8,padding:"2px 7px"}}>🎣 {record.gearType}</span>}
                {record.bait&&<span style={{fontSize:10,color:C.dimmer,background:C.surface,borderRadius:8,padding:"2px 7px"}}>🪱 {record.bait}</span>}
                {record.photoUrls.length>1&&<span style={{fontSize:10,color:C.cyan,background:"rgba(34,211,238,0.1)",borderRadius:8,padding:"2px 7px"}}>+{record.photoUrls.length-1} фото</span>}
              </div>
              <span style={{fontSize:11,color:C.dimmer,flexShrink:0}}>{dateStr}</span>
            </div>
          </>
        ) : (
          <div style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
            <div style={{width:52,height:52,borderRadius:12,background:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:24}}>🐟</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:C.text}}>
                {fish?.name||record.fishName||"Рыба"} {wStr&&<span style={{color:C.accent,fontWeight:800}}>{wStr}</span>}
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {record.locationName||"Место не указано"}</div>
              <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
                {record.gearType&&<span style={{fontSize:10,color:C.dimmer}}>{record.gearType}</span>}
                {record.depthM&&<span style={{fontSize:10,color:"rgba(34,211,238,.6)"}}>📏{record.depthM}м</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:11,color:C.dimmer}}>{dateStr}</div>
              {record.isPublic&&<div style={{fontSize:9,color:C.accent,marginTop:2}}>📢 публ.</div>}
              {(record.weightGrams||0)>=5000&&<div style={{fontSize:9,color:"#facc15",marginTop:2}}>🏆 трофей</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(CatchCard, (a, b) => a.record?.id === b.record?.id && a.record?.updatedAt === b.record?.updatedAt);
