import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { C } from '../tokens.js';
import { Fish, ImageIcon, Camera, Send, Mic } from '../icons/index.jsx';
import { db, storage, logEvent, functionsRegion } from '../firebase.js';
import { collection, doc, onSnapshot, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { fmtTime, pick } from '../lib/utils.js';
import { getBotReplyCtx } from '../data/fishing.jsx';
import Bubble from '../components/chat/Bubble.jsx';
import DateDivider from '../components/chat/DateDivider.jsx';

const PHOTO_REPLIES = [
  "Отличный улов! По размеру и форме — похоже на леща. Такие экземпляры держатся на 4–6 м у бровки старого русла. Расскажи где поймал — подскажу ещё точки рядом.",
  "Хороший трофей! Снасть выглядит правильно настроена. Для Дона рекомендую немного уменьшить крючок — №10 вместо №8, рыба здесь осторожная в ясную погоду.",
  "Красивое место на фото! Вижу камыш и тихую воду — это классическое карасиное и карповое место. Глубина у камыша 0.5–1.5 м, поплавочная снасть с мотылём — лучший выбор здесь.",
  "Интересный экземпляр! Судя по окраске — сазан. Такие держатся в тихих ямах с глинистым дном. При стабильном давлении выходят на кормёжку ранним утром. Какая насадка сработала?",
  "Вижу хорошего жереха! Это один из самых сложных трофеев на Дону. Ищи его на быстрых перекатах — там где бьёт малёк. Кастмастер 18–28 г, быстрая проводка у поверхности.",
  "Красивый щучий трофей! Щука такого размера стоит в засаде у коряжника или затопленных кустов. Воблер-суспендер 9 см, рывковая проводка с паузой 3–4 сек — её любимый стиль атаки.",
  "Отличное фото места! По берегу видно что течение умеренное — идеальное для фидера. Бровка на 40–50 м от берега, кормушка 80 г, прикормка с кориандром — лещ будет стоять там весь день.",
];

function getDiaryNote(query, catches) {
  if (!catches?.length) return "";
  const l = query.toLowerCase();
  const match = catches.find(c => {
    const loc = (c.locationName||"").toLowerCase();
    const parts = loc.split(/[\s,()]+/).filter(p=>p.length>3);
    return parts.some(p=>l.includes(p));
  });
  if (!match) return "";
  const fish = match.fishName || "рыбу";
  const wStr = match.weightGrams ? ` ${(match.weightGrams/1000).toFixed(1)} кг` : "";
  const d = match.createdAt?.toDate ? match.createdAt.toDate() : new Date();
  const ds = d.toLocaleDateString("ru-RU",{day:"2-digit",month:"long"});
  return `📖 Кстати, ${ds} ты здесь поймал: ${fish}${wStr} на «${match.locationName}».\n\n`;
}

function Typing(){return(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,#2ecc71,#22d3ee)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 14px rgba(46,204,113,0.4)`,flexShrink:0}}><Fish size={17} color="#07111e"/></div><div style={{padding:"12px 16px",borderRadius:"18px 18px 18px 4px",background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,display:"flex",gap:5,alignItems:"center"}}>{[0,1,2].map(i=>(<div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#2ecc71",animation:`bounce 1.2s ease ${i*.2}s infinite`}}/>))}</div></div>);}

export default function ChatScreen({ weather, userLat, userLon, user, onLogin }) {
  const _initMsg = {role:"assistant",type:"text",text:"Здорово, рыбак! Я — Егерь ИИ, знаю каждый омут Дона и Ростовской области.\n\nСпрашивай про клёв, снасти, места — пиши, присылай фото улова или места, запиши голосовой 🎣",time:fmtTime(),id:"msg_0",date:new Date().toLocaleDateString("ru-RU")};
  const [msgs, setMsgs] = useState([_initMsg]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [voiceRec, setVoiceRec] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [newbieMode, setNewbieMode] = useState(()=>localStorage.getItem("eger_newbie")==="1");
  const [lastTopic, setLastTopic] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const photoRef = useRef(null);
  const camRef = useRef(null);
  const srRef = useRef(null);
  const srTextRef = useRef("");
  const ctxRef = useRef({});
  const userCatchesRef = useRef([]);
  const msgIdRef = useRef(1);
  const msgsRef = useRef([_initMsg]);
  const kbRef = useRef([]);

  useEffect(()=>{
    if(!user) return;
    const unsub = onSnapshot(
      query(collection(db, "bot_kb"), orderBy("timestamp","desc"), limit(300)),
      snap=>{ kbRef.current = snap.docs.map(d=>d.data()); }, ()=>{});
    return unsub;
  },[user]);

  const findKbAnswer = (question) => {
    const stopwords = new Set(['что','как','где','когда','какой','какая','это','для','при','или','но','по','на','в','из','с','и','а','не','мне','есть','там','его','её','их','мы','вы','ты','я','был','было','будет','можно','нужно','надо','хочу','если','так','всё','этот']);
    const words = question.toLowerCase().replace(/[^\wа-яё\s]/gi," ").split(/\s+/).filter(w=>w.length>3&&!stopwords.has(w));
    if(words.length===0) return null;
    let best=null, bestScore=0;
    for(const entry of kbRef.current){
      const kws = entry.keywords||[];
      const score = words.filter(w=>kws.some(k=>k.includes(w)||w.includes(k))).length;
      if(score>bestScore&&score>=2){ bestScore=score; best=entry; }
    }
    return best?.answer||null;
  };

  useEffect(()=>{
    if(!user?.uid) return;
    getDocs(query(collection(db, "catches", user.uid, "records"), orderBy("createdAt","desc"), limit(10)))
      .then(snap=>{ userCatchesRef.current=snap.docs.map(d=>({...d.data(),id:d.id})); })
      .catch(()=>{});
  },[user?.uid]);

  useEffect(()=>{ if(atBottom) bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,typing]);
  useEffect(()=>{ msgsRef.current = msgs; },[msgs]);

  const makeMsg = (base) => ({...base, id:`msg_${++msgIdRef.current}`, date:base.date||new Date().toLocaleDateString("ru-RU")});
  const markAsRead = () => setMsgs(p=>p.map(m=>m.role==="user"?{...m,read:true}:m));
  const handleScroll = () => {
    const el=scrollRef.current; if(!el) return;
    const near=el.scrollHeight-el.scrollTop-el.clientHeight<120;
    setAtBottom(near);
    if(near) setUnreadCount(0);
  };
  const handleReply = (msg) => setReplyTo(msg);
  const handleDelete = (msg) => {
    setMsgs(p=>p.filter(m=>m.id!==msg.id));
    msgsRef.current=msgsRef.current.filter(m=>m.id!==msg.id);
  };
  const handleReact = (msg, emoji) => {
    setMsgs(p=>p.map(m=>{
      if(m.id!==msg.id) return m;
      const r={...(m.reactions||{})}; r[emoji]=(r[emoji]||0)+1; return {...m,reactions:r};
    }));
  };
  const fmtDateLabel = (d) => {
    const today=new Date().toLocaleDateString("ru-RU"), yest=new Date(Date.now()-86400000).toLocaleDateString("ru-RU");
    return d===today?"Сегодня":d===yest?"Вчера":d;
  };
  const renderList = useMemo(()=>{
    const list=[]; let lastDate=null;
    for(let i=0;i<msgs.length;i++){
      const m=msgs[i], md=m.date||new Date().toLocaleDateString("ru-RU");
      if(md!==lastDate){ list.push({_type:"date",label:fmtDateLabel(md),key:`d_${md}`}); lastDate=md; }
      list.push({...m,_idx:i});
    }
    return list;
  },[msgs]);

  const aiReply = (text, delay=1400) => {
    setTyping(true);
    setTimeout(()=>{ setTyping(false); markAsRead(); setMsgs(p=>[...p,makeMsg({role:"assistant",type:"text",text,time:fmtTime()})]); }, delay+Math.random()*600);
  };

  const callAI = async (userText) => {
    const queryText = newbieMode ? `Объясни просто, без рыболовного жаргона, как для новичка: ${userText}` : userText;
    setTyping(true);
    try {
      const fn = httpsCallable(functionsRegion, "askEger");
      const history = msgsRef.current
        .filter(m => m.type === "text" || !m.type)
        .slice(-12)
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const result = await fn({
        messages: history,
        weather: weather ? { temp: weather.temp, wind: weather.wind, pressure: weather.pressure, waterTemp: weather.waterTemp } : null,
        userCatches: userCatchesRef.current.slice(0, 5).map(c => ({ fishType: c.fishType, weightGrams: c.weightGrams, locationName: c.locationName }))
      });
      setTyping(false);
      const replyText = result.data.limited ? result.data.message : result.data.text;
      const r = getBotReplyCtx(queryText, weather, ctxRef.current);
      ctxRef.current = r.ctx; setLastTopic(r.ctx.lastTopic || "");
      markAsRead(); setMsgs(p => [...p, makeMsg({ role:"assistant", type:"text", text: replyText, time:fmtTime() })]);
    } catch(e) {
      setTyping(false);
      console.error("[askEger] error:", e?.code, e?.message, e);
      const kbAnswer = findKbAnswer(userText);
      if(kbAnswer){
        markAsRead(); setMsgs(p=>[...p,makeMsg({role:"assistant",type:"text",text:kbAnswer,time:fmtTime(),fromKb:true})]);
      } else {
        const r = getBotReplyCtx(queryText, weather, ctxRef.current);
        ctxRef.current = r.ctx; setLastTopic(r.ctx.lastTopic||"");
        const note = getDiaryNote(userText, userCatchesRef.current);
        markAsRead(); setMsgs(p=>[...p,makeMsg({role:"assistant",type:"text",text:note?note+r.text:r.text,time:fmtTime()})]);
      }
    }
  };

  const send = useCallback((overrideText)=>{
    const text=(overrideText||input).trim(); if(!text) return;
    const newMsg = makeMsg({role:"user",type:"text",text,time:fmtTime(),replyTo:replyTo||undefined});
    msgsRef.current = [...msgsRef.current, newMsg];
    setMsgs(p=>[...p,newMsg]);
    if(!overrideText) setInput("");
    setReplyTo(null);
    setAtBottom(true);
    logEvent("chat_message_sent");
    logEvent("ai_query_sent",{is_voice:false});
    callAI(text);
  },[input,weather,newbieMode,replyTo]);

  const sendPhoto = async (file) => {
    if(!file) return;
    const localUrl = URL.createObjectURL(file);
    setMsgs(p=>[...p,makeMsg({role:"user",type:"image",imageUrl:localUrl,time:fmtTime()})]);
    aiReply(pick(PHOTO_REPLIES), 1800);
    try {
      const storageRef = ref(storage, `chat_photos/eger_${Date.now()}.jpg`);
      await uploadBytes(storageRef, file, {contentType:file.type});
    } catch(e){}
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Распознавание речи не поддерживается в вашем браузере. Используйте Chrome или Safari.");
      return;
    }
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    srTextRef.current = "";

    rec.onstart = () => { setVoiceRec(true); setVoiceText(""); };

    rec.onresult = (e) => {
      let interim = "", final = "";
      for (const r of e.results) {
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) srTextRef.current = final;
      setVoiceText(final || interim);
    };

    rec.onend = () => {
      setVoiceRec(false);
      const text = srTextRef.current.trim();
      srTextRef.current = "";
      setVoiceText("");
      if (text) {
        const newMsg = makeMsg({role:"user",type:"text",text,time:fmtTime(),voice:true});
        msgsRef.current = [...msgsRef.current, newMsg];
        setMsgs(p=>[...p,newMsg]);
        logEvent("chat_message_sent",{method:"voice"});
        callAI(text);
      }
    };

    rec.onerror = (e) => {
      setVoiceRec(false); setVoiceText(""); srTextRef.current = "";
      if (e.error !== "aborted" && e.error !== "no-speech") {
        alert("Ошибка распознавания: " + e.error);
      }
    };

    srRef.current = rec;
    rec.start();
  };

  const stopVoice = () => { srRef.current?.stop(); };

  const QUICK_MAP = {
    feeder:  ["Монтаж кормушки","Насадка для леща","Как прикармливать?","Дальность заброса","Какой фидер выбрать?","Погода для клёва"],
    fly:     ["Техника заброса","Какие мушки взять?","Где голавль на Дону?","Сухая или нимфа?","Снаряжение нахлыстовика","Лучшие места"],
    spin:    ["Какой джиг взять?","Ступенчатая проводка","Где судак на Дону?","Какую приманку взять?","Плетёнка или моно?","Топ точки на спиннинг"],
    float:   ["Лучший поплавок","Глубина под поплавок","Насадка для карася","Как регулировать спуск?","Прикормка своими руками","Где ловить тарань?"],
    carp:    ["Рецепт прикормки на карпа","Монтаж на сазана","Ночная рыбалка","Лучшие бойлы","Где карп в Ростове?","Карповый монтаж"],
    default: ["Скинь точку ловли","Прогноз клёва","Где белый амур?","Где щука?","На что ловить сазана?","Что ловится сейчас?"],
  };
  const quick = QUICK_MAP[lastTopic] || (lastTopic?.startsWith("fish_") ? [
    `Лучшие точки`,`Снасти и приманки`,`Время клёва`,`Прикормка`,`Где ловить?`,`Советы рыбака`
  ] : QUICK_MAP.default);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",position:"relative"}}>
      <div style={{padding:"10px 16px 6px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 12px ${C.accentGlow}`}}><Fish size={17} color="#07111e"/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text}}>Егерь ИИ</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:"pulseGlow 2s ease infinite"}}/>
            <span style={{fontSize:10,color:C.accent}}>онлайн · {weather?`вода ${weather.waterTemp>0?'+':''}${weather.waterTemp}°C`:"Знает Дон"}</span>
          </div>
        </div>
        <button onClick={()=>{ const v=!newbieMode; setNewbieMode(v); localStorage.setItem("eger_newbie",v?"1":"0"); }}
          title={newbieMode?"Режим новичка включён":"Режим новичка выключен"}
          style={{padding:"5px 10px",borderRadius:12,border:`1px solid ${newbieMode?C.cyan:C.border}`,background:newbieMode?"rgba(34,211,238,.12)":C.surface,color:newbieMode?C.cyan:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
          {newbieMode?"🐣 Новичок":"👨‍🎣 Рыбак"}
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} style={{flex:1,overflowY:"auto",padding:"14px 14px 6px"}}>
        {renderList.map((item,i)=>{
          if(item._type==="date") return <DateDivider key={item.key} label={item.label}/>;
          const prev=renderList[i-1], next=renderList[i+1];
          return <Bubble key={item.id||i} msg={item}
            prevMsg={prev&&prev._type!=="date"?prev:null}
            nextMsg={next&&next._type!=="date"?next:null}
            onReply={handleReply} onDelete={handleDelete} onReact={handleReact}/>;
        })}
        {typing&&<Typing/>}
        <div ref={bottomRef}/>
      </div>

      {!atBottom&&(
        <button onClick={()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});setAtBottom(true);setUnreadCount(0);}}
          style={{position:"absolute",bottom:200,right:14,width:42,height:42,borderRadius:"50%",background:"rgba(7,17,30,.95)",border:`1px solid ${C.border}`,color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:50}}>
          ↓
          {unreadCount>0&&<span style={{position:"absolute",top:-5,right:-3,background:C.accent,color:"#07111e",fontSize:10,fontWeight:800,minWidth:18,height:18,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadCount}</span>}
        </button>
      )}

      <div style={{display:"flex",gap:8,padding:"6px 14px",overflowX:"auto",scrollbarWidth:"none"}}>
        {quick.map(q=>(<button key={q} onClick={()=>{ send(q); }} style={{flexShrink:0,padding:"6px 12px",borderRadius:20,border:`1px solid ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",animation:"fadeIn .3s ease"}}>{q}</button>))}
      </div>

      {replyTo&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:"rgba(46,204,113,.07)",borderTop:`1px solid rgba(46,204,113,.2)`}}>
          <div style={{width:3,alignSelf:"stretch",background:C.accent,borderRadius:2,flexShrink:0}}/>
          <div style={{flex:1,overflow:"hidden"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:1}}>{replyTo.role==="user"?"Вы":"Егерь ИИ"}</div>
            <div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{replyTo.type==="image"?"📷 Фото":(replyTo.text||"").slice(0,60)}</div>
          </div>
          <button onClick={()=>setReplyTo(null)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:22,lineHeight:1,padding:4}}>×</button>
        </div>
      )}

      {voiceRec&&<div style={{padding:"10px 14px",background:`rgba(46,204,113,.08)`,borderTop:`1px solid rgba(46,204,113,.25)`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:12,height:12,borderRadius:"50%",background:C.accent,animation:"pulseGlow .6s ease infinite",flexShrink:0}}/>
        <span style={{flex:1,fontSize:13,color:voiceText?C.text:C.muted,fontStyle:voiceText?"normal":"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {voiceText||"Слушаю... говорите"}
        </span>
        <button onClick={stopVoice} style={{padding:"7px 16px",borderRadius:20,border:"none",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>Готово</button>
      </div>}

      <div style={{padding:"8px 14px 14px",background:"rgba(7,17,30,.92)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end"}}>
        <button onClick={()=>photoRef.current?.click()} style={{width:40,height:40,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ImageIcon size={17} color={C.muted}/>
        </button>
        <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>sendPhoto(e.target.files[0])}/>
        <button onClick={()=>camRef.current?.click()} style={{width:40,height:40,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Camera size={17} color={C.muted}/>
        </button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>sendPhoto(e.target.files[0])}/>

        <textarea rows={1} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder={replyTo?"Ответить...":"Спроси Егеря..."} style={{flex:1,resize:"none",background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:16,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",lineHeight:1.4,boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor=C.borderHi} onBlur={e=>e.target.style.borderColor=C.border}/>

        {input.trim()
          ? <button onClick={()=>send()} style={{width:46,height:46,borderRadius:"50%",border:"none",flexShrink:0,background:`linear-gradient(135deg,#1a8a50,${C.accent})`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 16px ${C.accentGlow}`,transition:"all .25s"}}>
              <Send size={18} color="#07111e"/>
            </button>
          : <button onClick={voiceRec?stopVoice:startVoice} style={{width:46,height:46,borderRadius:"50%",border:"none",flexShrink:0,background:voiceRec?"#ef4444":C.surfaceHi,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .25s",animation:voiceRec?"pulseGlow .8s ease infinite":"none"}}>
              <Mic size={18} color={voiceRec?"#fff":C.muted}/>
            </button>
        }
      </div>
    </div>
  );
}
