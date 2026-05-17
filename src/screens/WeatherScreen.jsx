import { useState, useEffect } from 'react';
import { C, glass } from '../tokens.js';
import { RefreshCw } from '../icons/index.jsx';
import { logEvent } from '../firebase.js';
import { calcBiteScore } from '../lib/weather.js';
import { moonPhase } from '../lib/utils.js';
import { _uLat, _uLon } from '../data/fishing.jsx';

export default function WeatherScreen({ weather, weatherLoading, onRefresh }) {
  useEffect(()=>{ logEvent("forecast_viewed"); },[]);
  const [histWeather, setHistWeather] = useState(null);
  useEffect(()=>{
    const lat=_uLat||47.27, lon=_uLon||39.87;
    const d=new Date(); d.setFullYear(d.getFullYear()-1);
    const date=d.toISOString().slice(0,10);
    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,weather_code,wind_speed_10m_max&timezone=Europe%2FMoscow`)
      .then(r=>r.json()).then(j=>{
        if(j.daily) setHistWeather({maxT:Math.round(j.daily.temperature_2m_max[0]),code:j.daily.weather_code[0],wind:Math.round(j.daily.wind_speed_10m_max[0]),date});
      }).catch(()=>{});
  },[]);
  const DAYS_RU = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

  const wIcon = (code) => {
    if(code===0) return "☀️";
    if(code===1) return "🌤️";
    if(code===2) return "⛅";
    if(code===3) return "☁️";
    if(code<=48) return "🌫️";
    if(code<=57) return "🌦️";
    if(code<=67) return "🌧️";
    if(code<=77) return "❄️";
    if(code<=82) return "🌦️";
    if(code<=86) return "🌨️";
    return "⛈️";
  };
  const wDesc = (code) => {
    if(code===0) return "Ясно";
    if(code===1) return "Малооблачно";
    if(code===2) return "Переменная облачность";
    if(code===3) return "Пасмурно";
    if(code<=48) return "Туман";
    if(code<=57) return "Морось";
    if(code<=67) return "Дождь";
    if(code<=77) return "Снег";
    if(code<=82) return "Ливень";
    if(code<=86) return "Снегопад";
    return "Гроза";
  };

  if(weatherLoading && !weather) return (
    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14}}>
      <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
      <div style={{color:C.muted,fontSize:13}}>Загружаем прогноз...</div>
    </div>
  );
  if(!weather) return (
    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,padding:24}}>
      <div style={{fontSize:44}}>🌤️</div>
      <div style={{color:C.text,fontSize:16,fontWeight:700}}>Нет данных</div>
      <button onClick={onRefresh} style={{padding:"10px 24px",borderRadius:12,border:"none",background:C.accent,color:"#07111e",fontWeight:700,cursor:"pointer"}}>Обновить</button>
    </div>
  );

  const month = new Date().getMonth();
  const biteScore = calcBiteScore(weather.pressure, month, weather.wind, weather.waterTemp, weather.daily?.precipitation_probability_max?.[0]??0);
  const moon = moonPhase();
  const biteLabel = biteScore>=9?"🔥 Превосходный!":biteScore>=8?"✅ Отличный":biteScore>=7?"👍 Хороший":biteScore>=5?"⚠️ Средний":"❌ Слабый";
  const biteColor = biteScore>=8?"#2ecc71":biteScore>=6?"#f59e0b":"#ef4444";

  const nowHour = new Date().getHours();
  const hourly = weather.hourly;
  const hourlySlice = hourly ? Array.from({length:12},(_,i)=>{
    const idx = nowHour + i;
    if(idx >= hourly.time.length) return null;
    return {
      time: hourly.time[idx].slice(11,16),
      temp: Math.round(hourly.temperature_2m[idx]),
      precip: hourly.precipitation_probability[idx]||0,
      wind: Math.round(hourly.wind_speed_10m[idx]),
      code: hourly.weather_code[idx],
    };
  }).filter(Boolean) : [];

  return (
    <div style={{height:"100%",overflowY:"auto",padding:"12px 14px 32px"}}>

      {/* Current */}
      <div style={{...glass(`0 0 0 1px ${C.borderHi}`),padding:"20px 16px 16px",marginBottom:10,textAlign:"center",position:"relative"}}>
        <button onClick={onRefresh} style={{position:"absolute",top:12,right:12,background:"none",border:"none",cursor:"pointer"}}>
          <RefreshCw size={15} color={C.muted}/>
        </button>
        <div style={{fontSize:60,lineHeight:1,marginBottom:6}}>{wIcon(weather.code)}</div>
        <div style={{fontSize:54,fontWeight:900,color:C.text,lineHeight:1}}>
          {weather.airTemp>0?"+":""}{weather.airTemp}°
        </div>
        <div style={{fontSize:14,color:C.muted,marginTop:4,marginBottom:14}}>{wDesc(weather.code)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[
            {ico:"💨",val:`${weather.wind} м/с`,lbl:(()=>{const dirs=["С","СВ","В","ЮВ","Ю","ЮЗ","З","СЗ"];return "Ветер "+dirs[Math.round((weather.windDir||0)/45)%8];})()},
            {ico:"💧",val:`${weather.humidity}%`,lbl:"Влажность"},
            {ico:"⏱",val:`${weather.pressure} мм`,lbl:(()=>{if(!weather.hourly?.surface_pressure)return "Давление";const hr=new Date().getHours();const p3ago=Math.round((weather.hourly.surface_pressure[Math.max(0,hr-3)]||weather.pressure/0.750064)*0.750064);const diff=weather.pressure-p3ago;return diff>2?"⬆ Растёт":diff<-2?"⬇ Падает":"→ Стабильно";})()},
          ].map(({ico,val,lbl})=>(
            <div key={lbl} style={{background:"rgba(255,255,255,.05)",borderRadius:10,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:20}}>{ico}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginTop:2}}>{val}</div>
              <div style={{fontSize:10,color:C.muted}}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 14px",borderRadius:20,background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.25)"}}>
            <span style={{fontSize:11,color:C.cyan,fontWeight:700}}>🌊 Вода +{weather.waterTemp}°C</span>
            <span style={{fontSize:10,color:C.dimmer}}>· обновлено {weather.updated}</span>
          </div>
          {weather.daily?.sunrise?.[0]&&(
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:20,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.25)"}}>
              <span style={{fontSize:11,color:C.gold,fontWeight:700}}>🌅 {new Date(weather.daily.sunrise[0]).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>
              <span style={{fontSize:11,color:C.dimmer}}>|</span>
              <span style={{fontSize:11,color:"#f97316",fontWeight:700}}>🌇 {new Date(weather.daily.sunset[0]).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bite score */}
      <div style={{...glass(),padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:58,height:58,borderRadius:"50%",border:`3px solid ${biteColor}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 0 14px ${biteColor}55`}}>
          <div style={{fontSize:20,fontWeight:900,color:biteColor,lineHeight:1}}>{biteScore}</div>
          <div style={{fontSize:8,color:C.dimmer,letterSpacing:.5}}>ИЗ 10</div>
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:biteColor,marginBottom:3}}>{biteLabel}</div>
          <div style={{fontSize:11,color:C.muted}}>{moon.ico} {moon.tip}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>
            {weather.pressure>=758&&weather.pressure<=765?"Давление идеальное — вся рыба активна":
             weather.pressure>768?"Высокое давление — лещ и карась берут хорошо":
             weather.pressure<750?"Низкое давление — хищник оживляется":"Давление в норме"}
          </div>
        </div>
      </div>

      {/* Hourly today */}
      {hourlySlice.length>0 && (
        <div style={{...glass(),marginBottom:10,padding:"12px 12px 8px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Сегодня по часам</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6}}>
            {hourlySlice.map((h,i)=>(
              <div key={i} style={{flexShrink:0,textAlign:"center",padding:"8px 8px",borderRadius:12,
                background:i===0?"rgba(46,204,113,.1)":"rgba(255,255,255,.04)",
                border:`1px solid ${i===0?C.borderHi:C.border}`,minWidth:52}}>
                <div style={{fontSize:10,color:i===0?C.accent:C.muted,fontWeight:i===0?700:400}}>{i===0?"Сейчас":h.time}</div>
                <div style={{fontSize:20,margin:"4px 0"}}>{wIcon(h.code)}</div>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{h.temp>0?"+":""}{h.temp}°</div>
                {h.precip>20&&<div style={{fontSize:9,color:"#60a5fa",marginTop:2}}>💧{h.precip}%</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly bite chart */}
      {hourlySlice.length>0 && (
        <div style={{...glass(),marginBottom:10,padding:"12px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Лучшее время для ловли сегодня</div>
          {(()=>{
            const biteByHour = hourlySlice.map(h=>{
              const rain = h.code>=51?1:0;
              const windOk = h.wind<=5?3:h.wind<=8?2:1;
              const tempOk = h.temp>=8&&h.temp<=26?3:h.temp>=4?1:0;
              const hourNum = parseInt(h.time);
              const timeBonus = (hourNum>=5&&hourNum<=9)||(hourNum>=17&&hourNum<=21)?2:1;
              return Math.max(1,Math.min(10,windOk+tempOk+timeBonus-(rain*2)));
            });
            const maxB = Math.max(...biteByHour,1);
            const color = s=>s>=8?"#2ecc71":s>=6?"#f59e0b":s>=4?"#f97316":"#ef4444";
            return(
              <div style={{display:"flex",gap:3,alignItems:"flex-end",height:56}}>
                {biteByHour.map((score,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:color(score),height:Math.max(4,Math.round(score/maxB*44)),transition:"height .3s"}}/>
                    <div style={{fontSize:8,color:C.dimmer}}>{i===0?"":hourlySlice[i].time.slice(0,2)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{fontSize:10,color:C.dimmer,marginTop:4,textAlign:"center"}}>🟢 активный клёв · 🟡 средний · 🔴 слабый</div>
        </div>
      )}

      {/* Hourly wind chart */}
      {hourlySlice.length>0&&(
        <div style={{...glass(),marginBottom:10,padding:"12px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>💨 Ветер по часам (м/с)</div>
          {(()=>{
            const maxW=Math.max(...hourlySlice.map(h=>h.wind),1);
            const wColor=w=>w<=3?"#2ecc71":w<=6?"#f59e0b":w<=10?"#f97316":"#ef4444";
            return(
              <div style={{display:"flex",gap:3,alignItems:"flex-end",height:56}}>
                {hourlySlice.map((h,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{fontSize:8,color:C.dimmer,marginBottom:1}}>{h.wind>0?h.wind:""}</div>
                    <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:wColor(h.wind),height:Math.max(3,Math.round(h.wind/maxW*40)),transition:"height .3s"}}/>
                    <div style={{fontSize:8,color:C.dimmer}}>{i===0?"":h.time.slice(0,2)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{fontSize:10,color:C.dimmer,marginTop:4,textAlign:"center"}}>🟢 ≤3 · 🟡 4–6 · 🟠 7–10 · 🔴 {">"}10 м/с</div>
        </div>
      )}

      {/* Solunar fishing periods */}
      {(()=>{
        const mp=moonPhase();
        const refD=new Date(2024,0,11);
        const p=(((new Date()-refD)/86400000%29.53)+29.53)%29.53;
        const transitLocal=((p*(24.8333/29.53))+3)%24;
        const antiLocal=(transitLocal+12)%24;
        const fmt=h=>{const fh=((h%24)+24)%24;const hh=Math.floor(fh);const mm=Math.round((fh-hh)*60);return `${String(hh).padStart(2,"0")}:${String(mm<60?mm:0).padStart(2,"0")}`;};
        const periods=[
          {label:"Лунный меридиан",start:transitLocal-1,dur:2,type:"major",icon:"🌙"},
          {label:"Лунный надир",start:antiLocal-1,dur:2,type:"major",icon:"🌙"},
          {label:"Восход луны",start:transitLocal-6.25,dur:1,type:"minor",icon:"🌛"},
          {label:"Заход луны",start:transitLocal+5.25,dur:1,type:"minor",icon:"🌛"},
        ].map(pd=>({...pd,s24:((pd.start%24)+24)%24})).sort((a,b)=>a.s24-b.s24);
        const now=new Date(); const nowH=now.getHours()+now.getMinutes()/60;
        return(
          <div style={{...glass(),padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text}}>🌙 Солунар — время клёва</div>
              <div style={{fontSize:10,color:C.dimmer}}>{mp.ico}</div>
            </div>
            <div style={{fontSize:10,color:C.dimmer,marginBottom:10}}>{mp.tip}</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {periods.map(({label,s24,dur,type,icon})=>{
                const startFmt=fmt(s24); const endFmt=fmt(s24+dur);
                const isNow=nowH>=s24&&nowH<s24+dur;
                return(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,background:isNow?"rgba(46,204,113,.1)":"rgba(255,255,255,.04)",border:`1px solid ${isNow?C.accent:C.border}`}}>
                    <div style={{fontSize:17,flexShrink:0}}>{icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:isNow?C.accent:C.text}}>{label}</div>
                      <div style={{fontSize:10,color:C.muted}}>{startFmt} — {endFmt}</div>
                    </div>
                    <div style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:7,background:type==="major"?C.accentDim:"rgba(245,158,11,.12)",color:type==="major"?C.accent:C.gold,border:`1px solid ${type==="major"?C.borderHi:"rgba(245,158,11,.25)"}`}}>
                      {type==="major"?"ГЛАВНЫЙ":"вторст."}
                    </div>
                    {isNow&&<div style={{fontSize:8,fontWeight:800,color:"#07111e",background:C.accent,borderRadius:5,padding:"2px 5px",flexShrink:0,animation:"pulseGlow 1s ease infinite"}}>Сейчас</div>}
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:9,color:C.dimmer,marginTop:8,textAlign:"center"}}>По теории Солунара Дж. Найта · расчёт ориентировочный</div>
          </div>
        );
      })()}

      {/* Best fishing day this week */}
      {weather.daily && (()=>{
        const scores = weather.daily.time.map((date,i)=>{
          const code=weather.daily.weather_code[i];
          const prec=weather.daily.precipitation_probability_max[i]||0;
          const wind=weather.daily.wind_speed_10m_max[i]||0;
          const maxT=Math.round(weather.daily.temperature_2m_max[i]);
          const codeScore=code===0?4:code<=3?3:code<=48?2:code<=57?1:0;
          const windScore=wind<=3?3:wind<=5?2:wind<=8?1:0;
          const tempScore=maxT>=12&&maxT<=26?3:maxT>=6?1:0;
          const precScore=prec<20?2:prec<50?1:0;
          return codeScore+windScore+tempScore+precScore;
        });
        const best=scores.reduce((b,s,i)=>s>scores[b]?i:b,1);
        const bestDate=new Date(weather.daily.time[best]+"T12:00:00");
        const DAYS_RU2=["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
        const bestLabel=best===1?"завтра":DAYS_RU2[bestDate.getDay()];
        const maxT=Math.round(weather.daily.temperature_2m_max[best]);
        const code=weather.daily.weather_code[best];
        const wIcon2=(c)=>c===0?"☀️":c<=3?"🌤️":c<=48?"🌫️":c<=67?"🌧️":"⛈️";
        if(scores[best]<6) return null;
        return(
          <div style={{...glass(),padding:"12px 14px",marginBottom:10,background:"rgba(46,204,113,.07)",border:`1px solid rgba(46,204,113,.35)`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:28}}>{wIcon2(code)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:1}}>🏆 ЛУЧШИЙ ДЕНЬ ДЛЯ РЫБАЛКИ</div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>
                  {best===1?"Завтра":bestLabel.charAt(0).toUpperCase()+bestLabel.slice(1)} · {maxT>0?"+":""}{maxT}°C
                </div>
                <div style={{fontSize:11,color:C.muted}}>Оценка клёва: {scores[best]}/12 · {bestDate.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"})}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 7-day forecast */}
      {weather.daily && (
        <div style={{...glass(),padding:"12px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>Прогноз на 7 дней</div>
          {weather.daily.time.map((date,i)=>{
            const d = new Date(date+"T12:00:00");
            const maxT = Math.round(weather.daily.temperature_2m_max[i]);
            const minT = Math.round(weather.daily.temperature_2m_min[i]);
            const prec = weather.daily.precipitation_probability_max[i]||0;
            const code = weather.daily.weather_code[i];
            const biteQ = code===0?"🟢":code<=3?"🟢":code<=48?"🟡":code<=82?"🔴":"🔴";
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<6?`1px solid ${C.border}`:"none"}}>
                <div style={{width:34,fontSize:12,fontWeight:i<=1?700:400,color:i===0?C.accent:i===1?"#f59e0b":C.text,flexShrink:0}}>
                  {i===0?"Сег":i===1?"Завт":DAYS_RU[d.getDay()]}
                </div>
                <div style={{fontSize:22,flexShrink:0}}>{wIcon(code)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{wDesc(code)}</div>
                  {prec>20&&<div style={{fontSize:9,color:"#60a5fa"}}>💧{prec}%</div>}
                </div>
                <div style={{fontSize:10,marginRight:4}}>{biteQ}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  <span style={{fontSize:13,fontWeight:700,color:C.text}}>{maxT>0?"+":""}{maxT}°</span>
                  <span style={{fontSize:11,color:C.muted}}>{minT>0?"+":""}{minT}°</span>
                </div>
              </div>
            );
          })}
          <div style={{fontSize:10,color:C.dimmer,marginTop:8,textAlign:"center"}}>🟢 хороший клёв · 🟡 средний · 🔴 слабый</div>
        </div>
      )}

      {/* Fish species forecast */}
      {(()=>{
        const p=weather.pressure||760, t=weather.airTemp||15, w=weather.wind||3;
        const moonObj=moonPhase();
        const speciesForecast=[
          {name:"Судак",   score:Math.min(10,Math.round((p>=752&&p<=768?3:1)+(t>=8&&t<=22?3:1)+(w<=5?2:1)+2))},
          {name:"Щука",    score:Math.min(10,Math.round((p>=748&&p<=762?3:1)+(t>=6&&t<=20?3:1)+(w<=6?2:1)+2))},
          {name:"Лещ",     score:Math.min(10,Math.round((p>=758&&p<=770?4:1)+(t>=12&&t<=26?3:1)+(w<=4?2:1)+2))},
          {name:"Карп",    score:Math.min(10,Math.round((p>=755&&p<=768?3:p>768?4:1)+(t>=15&&t<=28?4:1)+(w<=3?2:1)+2))},
          {name:"Сом",     score:Math.min(10,Math.round((p>=748&&p<=762?3:1)+(t>=18&&t<=30?4:1)+(w<=4?2:1)+2))},
          {name:"Окунь",   score:Math.min(10,Math.round((p>=750&&p<=770?3:1)+(t>=10&&t<=24?3:1)+(w<=5?2:1)+2))},
        ].sort((a,b)=>b.score-a.score);
        const scoreColor=s=>s>=8?"#2ecc71":s>=6?"#f59e0b":s>=4?"#f97316":"#ef4444";
        return(
          <div style={{...glass(),padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Клёв по видам рыб</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {speciesForecast.map(({name,score})=>(
                <div key={name} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:56,fontSize:12,color:C.muted}}>{name}</div>
                  <div style={{flex:1,height:6,borderRadius:3,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
                    <div style={{width:`${score*10}%`,height:"100%",borderRadius:3,background:scoreColor(score),transition:"width .5s"}}/>
                  </div>
                  <div style={{width:36,textAlign:"right",fontSize:12,fontWeight:700,color:scoreColor(score)}}>{score}/10</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Year-ago history */}
      {histWeather&&(
        <div style={{...glass(),padding:"12px 14px",marginTop:10,background:"rgba(255,255,255,.03)"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8,letterSpacing:.5}}>📅 ГОД НАЗАД · {new Date(histWeather.date+"T12:00").toLocaleDateString("ru-RU",{day:"2-digit",month:"long"})}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:28}}>{wIcon(histWeather.code)}</div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>{histWeather.maxT>0?"+":""}{histWeather.maxT}°C</div>
              <div style={{fontSize:11,color:C.muted}}>{wDesc(histWeather.code)} · {histWeather.wind} м/с ветер</div>
            </div>
          </div>
        </div>
      )}

      {/* 30-day Lunar calendar */}
      {(()=>{
        const moonScore=(p)=>{
          if(p<1.85||p>27.68) return 10;
          if(p>=14.76&&p<16.61) return 9;
          if(p<3.69||p>25.84) return 8;
          if(p>=12.91&&p<18.46) return 7;
          if(p<7.38||p>22.15) return 6;
          return 5;
        };
        const scoreColor=s=>s>=9?"#2ecc71":s>=7?"#f59e0b":s>=6?"#f97316":"#ef4444";
        const DAYS_SH=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
        return (
          <div style={{...glass(),padding:"12px 14px",marginTop:10}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>🌙 Лунный календарь — 30 дней</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {Array.from({length:30},(_,i)=>{
                const d=new Date(); d.setDate(d.getDate()+i);
                const m=moonPhase(d);
                const sc=moonScore(m.p);
                const dateStr=d.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"});
                const dayStr=DAYS_SH[d.getDay()];
                const isToday=i===0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:8,background:isToday?"rgba(46,204,113,.08)":"transparent",border:isToday?`1px solid rgba(46,204,113,.2)`:"none"}}>
                    <div style={{width:20,fontSize:10,color:isToday?C.accent:C.dimmer,fontWeight:isToday?700:400,flexShrink:0,textAlign:"center"}}>{isToday?"Сег":dayStr}</div>
                    <div style={{width:48,fontSize:10,color:C.muted,flexShrink:0}}>{dateStr}</div>
                    <div style={{fontSize:17,flexShrink:0}}>{m.ico}</div>
                    <div style={{flex:1,fontSize:10,color:C.dimmer,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.tip.split(" — ")[0]}</div>
                    <div style={{fontSize:11,fontWeight:700,color:scoreColor(sc),flexShrink:0,width:32,textAlign:"right"}}>{sc}/10</div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:9,color:C.dimmer,marginTop:8,textAlign:"center"}}>Оценка клёва по фазе луны · 10 = максимум активности</div>
          </div>
        );
      })()}
    </div>
  );
}
