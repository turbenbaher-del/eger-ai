import { FISH_TYPES } from '../data/fishing.jsx';
import { logEvent } from '../firebase.js';

export async function generateShareCard(record) {
  const autoFit = (ctx, text, maxW, maxSz, bold=false) => {
    let sz = maxSz;
    do { ctx.font=`${bold?"bold ":""}${sz}px sans-serif`; if(ctx.measureText(text).width<=maxW) break; sz-=2; } while(sz>18);
    return sz;
  };
  const fish = FISH_TYPES.find(f=>f.id===record.fishType);
  const fishName = fish?.name||record.fishName||"Рыба";
  const weightStr = record.weightGrams?`${(record.weightGrams/1000).toFixed(1)} кг`:"";
  const loc = record.locationName||"";
  const d = record.createdAt?.toDate?record.createdAt.toDate():new Date();
  const dateStr = d.toLocaleDateString("ru-RU",{day:"2-digit",month:"long",year:"numeric"});
  const timeStr = d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const hasPhoto = !!record.photoUrls?.[0];
  const isTrophy = (record.weightGrams||0) >= 5000;
  const W=1080, H=1080;
  const canvas = document.createElement("canvas");
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle="#07111e"; ctx.fillRect(0,0,W,H);

  // photo area
  const PHOTO_H = hasPhoto ? 650 : 480;
  if (hasPhoto) {
    try {
      const img = await new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=rej; i.src=record.photoUrls[0]; });
      const scale=Math.max(W/img.width,PHOTO_H/img.height);
      const dw=img.width*scale, dh=img.height*scale;
      ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,PHOTO_H); ctx.clip();
      ctx.drawImage(img,(W-dw)/2,(PHOTO_H-dh)/2,dw,dh);
      ctx.restore();
      const ov=ctx.createLinearGradient(0,0,0,PHOTO_H);
      ov.addColorStop(0,"rgba(7,17,30,0.18)"); ov.addColorStop(0.52,"rgba(7,17,30,0.0)"); ov.addColorStop(1,"rgba(7,17,30,0.97)");
      ctx.fillStyle=ov; ctx.fillRect(0,0,W,PHOTO_H);
    } catch(e){}
  } else {
    const gl=ctx.createRadialGradient(W*.5,PHOTO_H*.5,0,W*.5,PHOTO_H*.5,420);
    gl.addColorStop(0,"rgba(46,204,113,0.16)"); gl.addColorStop(.6,"rgba(34,211,238,0.06)"); gl.addColorStop(1,"transparent");
    ctx.fillStyle=gl; ctx.fillRect(0,0,W,PHOTO_H);
    ctx.fillStyle="rgba(46,204,113,0.06)";
    for(let x=0;x<W;x+=40) for(let y=0;y<PHOTO_H;y+=40){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }
    ctx.font="160px serif"; ctx.textAlign="center"; ctx.fillStyle="rgba(255,255,255,0.88)";
    ctx.fillText("🎣",W/2,PHOTO_H*.56); ctx.textAlign="left";
    const tr=ctx.createLinearGradient(0,PHOTO_H-100,0,PHOTO_H);
    tr.addColorStop(0,"transparent"); tr.addColorStop(1,"#07111e");
    ctx.fillStyle=tr; ctx.fillRect(0,PHOTO_H-100,W,100);
  }

  // branding chip (top-left)
  ctx.save();
  ctx.fillStyle="rgba(7,17,30,0.82)"; ctx.beginPath(); ctx.roundRect(26,26,232,58,29); ctx.fill();
  ctx.strokeStyle="rgba(46,204,113,0.6)"; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
  ctx.fillStyle="#2ecc71"; ctx.font="bold 30px sans-serif"; ctx.textAlign="left";
  ctx.fillText("🎣 ЕГЕРЬ ИИ",44,66);

  // trophy badge (top-right)
  if (isTrophy) {
    ctx.save();
    ctx.fillStyle="rgba(234,179,8,0.18)"; ctx.beginPath(); ctx.roundRect(W-212,26,186,58,29); ctx.fill();
    ctx.strokeStyle="rgba(234,179,8,0.7)"; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
    ctx.fillStyle="#facc15"; ctx.font="bold 27px sans-serif"; ctx.textAlign="right";
    ctx.fillText("🏆 ТРОФЕЙ",W-38,64); ctx.textAlign="left";
  }

  // green separator line with glow
  const sepY=PHOTO_H;
  const sepGlow=ctx.createLinearGradient(0,sepY-6,0,sepY+6);
  sepGlow.addColorStop(0,"transparent"); sepGlow.addColorStop(.5,"rgba(46,204,113,0.55)"); sepGlow.addColorStop(1,"transparent");
  ctx.fillStyle=sepGlow; ctx.fillRect(0,sepY-4,W,8);
  ctx.strokeStyle="#2ecc71"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,sepY); ctx.lineTo(W,sepY); ctx.stroke();
  const glowUnder=ctx.createLinearGradient(0,sepY,0,sepY+55);
  glowUnder.addColorStop(0,"rgba(46,204,113,0.11)"); glowUnder.addColorStop(1,"transparent");
  ctx.fillStyle=glowUnder; ctx.fillRect(0,sepY,W,55);

  // info section
  const M=50; let Y=sepY+46;

  // fish name + weight (auto-fit)
  const mainLine = weightStr?`${fishName}  ·  ${weightStr}`:fishName;
  const mainSz = autoFit(ctx,mainLine,W-M*2,82,true);
  ctx.font=`bold ${mainSz}px sans-serif`; ctx.fillStyle="#ffffff";
  ctx.fillText(fishName,M,Y+mainSz);
  if (weightStr) {
    const nW=ctx.measureText(fishName+"  ·  ").width;
    ctx.fillStyle="#2ecc71"; ctx.fillText(weightStr,M+nW,Y+mainSz);
  }
  Y+=mainSz+18;

  // thin divider
  ctx.strokeStyle="rgba(46,204,113,0.28)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(M,Y); ctx.lineTo(W-M,Y); ctx.stroke(); Y+=28;

  // location
  if (loc) {
    ctx.fillStyle="rgba(232,244,240,0.82)"; ctx.font="32px sans-serif";
    ctx.fillText("📍  "+loc.slice(0,42)+(loc.length>42?"…":""),M,Y); Y+=46;
  }

  // date + time
  ctx.fillStyle="rgba(34,211,238,0.9)"; ctx.font="29px sans-serif";
  ctx.fillText("📅  "+dateStr+"   ·   "+timeStr,M,Y); Y+=42;

  // weather row
  if (record.weather) {
    const wp=[];
    if(record.weather.temp!=null) wp.push(`🌡 ${record.weather.temp}°C`);
    if(record.weather.windSpeed!=null) wp.push(`💨 ${record.weather.windSpeed} м/с`);
    if(record.weather.biteIndex!=null) wp.push(`🎣 Клёв ${record.weather.biteIndex}/10`);
    if(wp.length>0){ ctx.fillStyle="rgba(46,204,113,0.75)"; ctx.font="26px sans-serif"; ctx.fillText(wp.join("   "),M,Y); Y+=40; }
  }

  // gear / bait / method
  const gp=[];
  if(record.gearType) gp.push("🎣 "+record.gearType);
  if(record.bait) gp.push("🪱 "+record.bait);
  if(record.catchMethod) gp.push("🚤 "+record.catchMethod);
  if(gp.length>0){
    ctx.fillStyle="rgba(232,244,240,0.6)"; ctx.font="27px sans-serif";
    const gs=gp.join("   ·   "); ctx.fillText(gs.slice(0,58)+(gs.length>58?"…":""),M,Y); Y+=40;
  }

  // notes
  if(record.notes){
    ctx.fillStyle="rgba(232,244,240,0.40)"; ctx.font="italic 24px sans-serif";
    const n=record.notes.slice(0,72)+(record.notes.length>72?"…":"");
    ctx.fillText('"'+n+'"',M,Y);
  }

  // URL chip at bottom
  const catchUrl = record.id ? `eger-ai.app/?catch=${record.id}` : "eger-ai.app";
  ctx.fillStyle="rgba(7,17,30,0.72)";
  ctx.beginPath(); ctx.roundRect(M, H-52, W-M*2, 34, 17); ctx.fill();
  ctx.strokeStyle="rgba(34,211,238,0.28)"; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle="rgba(34,211,238,0.8)"; ctx.font="20px sans-serif"; ctx.textAlign="center";
  ctx.fillText(catchUrl, W/2, H-28);
  return canvas.toDataURL("image/jpeg",0.93);
}

export async function doShareCard(record) {
  // Loading overlay
  const loading = document.createElement("div");
  loading.style.cssText="position:fixed;inset:0;background:rgba(7,17,30,0.92);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px";
  loading.innerHTML='<div style="width:48px;height:48px;border-radius:50%;border:3px solid #2ecc71;border-top-color:transparent;animation:spin 1s linear infinite"></div><div style="color:rgba(232,244,240,0.5);font-size:14px">Создаём карточку…</div>';
  document.body.appendChild(loading);

  let dataUrl;
  try { dataUrl = await generateShareCard(record); } catch(e){ document.body.removeChild(loading); console.error("share card err",e); return; }
  document.body.removeChild(loading);

  const fish = FISH_TYPES.find(f=>f.id===record.fishType);
  const fishName = fish?.name||record.fishName||"Рыба";
  const wStr = record.weightGrams?`${(record.weightGrams/1000).toFixed(1)} кг`:"";
  const title=`${fishName}${wStr?" · "+wStr:""} — Егерь ИИ`;
  const catchUrl = record.id ? `https://eger-ai.app/?catch=${record.id}` : "https://eger-ai.app";
  const d = record.createdAt?.toDate?record.createdAt.toDate():new Date();
  const dateStr = d.toLocaleDateString("ru-RU",{day:"2-digit",month:"long",year:"numeric"});

  const lines = [`🎣 ${fishName}${wStr?" · "+wStr:""}`];
  if (record.locationName) lines.push(`📍 ${record.locationName}`);
  lines.push(`📅 ${dateStr}`);
  const gear = [record.gearType&&`🎣 ${record.gearType}`, record.bait&&`🪱 ${record.bait}`, record.catchMethod&&`🚤 ${record.catchMethod}`].filter(Boolean);
  if (gear.length) lines.push(gear.join(" · "));
  if (record.notes) lines.push(`💬 ${record.notes}`);
  lines.push("", catchUrl);
  const shareText = lines.join("\n");

  const doShare = async () => {
    try {
      const blob=await(await fetch(dataUrl)).blob();
      const file=new File([blob],"catch-eger.jpg",{type:"image/jpeg"});
      if(navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file],title,text:shareText});
        logEvent("catch_shared",{method:"web_share"}); return true;
      }
    } catch(e){ if(e.name==="AbortError") return true; }
    return false;
  };
  const doDownload = () => {
    const a=document.createElement("a"); a.href=dataUrl; a.download="catch-eger.jpg"; a.click();
    logEvent("catch_shared",{method:"download"});
  };

  // Preview overlay
  const ov = document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px 16px 32px;overflow-y:auto;-webkit-overflow-scrolling:touch";
  const inner = document.createElement("div");
  inner.style.cssText="width:100%;max-width:420px;margin:auto";
  inner.innerHTML=`<div style="text-align:center;margin-bottom:14px;font-size:11px;font-weight:700;color:rgba(232,244,240,0.4);letter-spacing:2px">КАРТОЧКА УЛОВА</div><img src="${dataUrl}" alt="" style="width:100%;border-radius:16px;box-shadow:0 0 52px rgba(46,204,113,0.22);display:block;margin-bottom:16px"/>`;
  const btnShare = document.createElement("button");
  btnShare.style.cssText="width:100%;padding:16px;background:linear-gradient(135deg,#1a8a50,#2ecc71);border:none;border-radius:14px;color:#07111e;font-size:16px;font-weight:800;cursor:pointer;margin-bottom:10px;display:block";
  btnShare.textContent="📤 Поделиться";
  const btnDl = document.createElement("button");
  btnDl.style.cssText="width:100%;padding:16px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);border-radius:14px;color:#22d3ee;font-size:16px;font-weight:800;cursor:pointer;margin-bottom:10px;display:block";
  btnDl.textContent="💾 Сохранить на устройство";
  const btnClose = document.createElement("button");
  btnClose.style.cssText="width:100%;padding:12px;background:none;border:none;color:rgba(232,244,240,0.3);font-size:13px;cursor:pointer;display:block";
  btnClose.textContent="Закрыть";
  inner.appendChild(btnShare); inner.appendChild(btnDl); inner.appendChild(btnClose);
  ov.appendChild(inner); document.body.appendChild(ov);
  const close=()=>{ if(document.body.contains(ov)) document.body.removeChild(ov); };
  btnShare.onclick=async()=>{ const ok=await doShare(); if(ok) close(); };
  btnDl.onclick=()=>{ doDownload(); close(); };
  btnClose.onclick=close;
}
