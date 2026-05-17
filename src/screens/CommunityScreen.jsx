import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { C, glass } from '../tokens.js';
import { db, storage } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
         onSnapshot, query, orderBy, limit, startAfter, serverTimestamp, increment, deleteField, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { BADGE_DEFS } from '../data/fishing.jsx';
import { fmtDate, genUsername, REACTIONS_LIST } from '../lib/utils.js';
import { MessageCircle, XIcon, Send, Mic, Camera, ImageIcon, AttachIcon, VideoIcon } from '../icons/index.jsx';
import VoiceMessage from '../components/chat/VoiceMessage.jsx';
import VideoNote from '../components/chat/VideoNote.jsx';

/* ── DM Screen (личные сообщения) ── */
function DMScreen({ user, otherUser, onClose }) {
  const dmId = [user.uid, otherUser.uid].sort().join('_');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const aColor = uid => { const cols=[C.accent,C.cyan,C.gold,C.blue,"#a78bfa","#f472b6"]; let h=0; for(let c of(uid||"x")) h=(h*31+c.charCodeAt(0))%cols.length; return cols[h]; };
  const otherColor = aColor(otherUser.uid);

  useEffect(()=>{
    setDoc(doc(db, "dms", dmId), {
      participants:[user.uid,otherUser.uid].sort(),
      [`name_${user.uid}`]:user.displayName||"Рыбак",
      [`name_${otherUser.uid}`]:otherUser.displayName||"Рыбак",
    },{merge:true});
    const unsub=onSnapshot(
      query(collection(db, "dms", dmId, "messages"), orderBy("timestamp","asc"), limit(200)),
      snap=>{
        setMsgs(snap.docs.map(d=>({id:d.id,...d.data()})));
        setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),50);
      });
    return unsub;
  },[dmId]);

  const send = async () => {
    const text=input.trim(); if(!text) return;
    setInput("");
    await addDoc(collection(db, "dms", dmId, "messages"), {
      uid:user.uid, displayName:user.displayName||"Рыбак", text,
      timestamp:serverTimestamp()
    });
    setDoc(doc(db, "dms", dmId), {
      lastMessage:text, lastAt:serverTimestamp(),
      [`unread_${otherUser.uid}`]:increment(1)
    },{merge:true});
  };

  return (
    <div style={{position:"absolute",top:0,right:0,bottom:0,left:0,background:C.bg,display:"flex",flexDirection:"column",zIndex:80,animation:"slideUp .22s ease"}}>
      <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,background:"rgba(7,17,30,.97)",backdropFilter:"blur(20px)"}}>
        <button onClick={onClose} style={{width:36,height:36,borderRadius:"50%",border:"none",background:C.surfaceHi,color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
        <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${otherColor},${otherColor}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#07111e",flexShrink:0}}>
          {(otherUser.displayName||"Р")[0].toUpperCase()}
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text}}>{otherUser.displayName||"Рыбак"}</div>
          {otherUser.username&&<div style={{fontSize:10,color:C.muted}}>@{otherUser.username}</div>}
        </div>
        <div style={{fontSize:10,color:C.muted}}>Личные сообщения</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 6px"}}>
        {msgs.length===0&&(
          <div style={{textAlign:"center",padding:48,color:C.dimmer}}>
            <div style={{fontSize:40,marginBottom:14}}>💬</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>Начни разговор</div>
            <div style={{fontSize:12}}>Напиши {otherUser.displayName||"рыбаку"} первым!</div>
          </div>
        )}
        {msgs.map((msg)=>{
          const isMe=msg.uid===user.uid;
          const br=isMe?"18px 18px 4px 18px":"18px 18px 18px 4px";
          return (
            <div key={msg.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",marginBottom:6,animation:"fadeUp .2s ease"}}>
              <div style={{maxWidth:"78%"}}>
                <div style={{padding:"10px 13px",borderRadius:br,background:isMe?`linear-gradient(135deg,#1a8a50,${C.accent})`:"rgba(255,255,255,0.07)",border:isMe?"none":`1px solid ${C.border}`,color:isMe?"#07111e":C.text,fontSize:13.5,lineHeight:1.55,whiteSpace:"pre-wrap"}}>
                  {msg.text}
                  <div style={{fontSize:10,opacity:.5,marginTop:3,textAlign:"right",color:isMe?"#07111e":C.text}}>{msg.timestamp?fmtDate(msg.timestamp):""}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"8px 14px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(7,17,30,.92)",backdropFilter:"blur(20px)",display:"flex",gap:8,alignItems:"flex-end"}}>
        <textarea rows={1} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder={`Написать ${otherUser.displayName||""}...`}
          style={{flex:1,resize:"none",background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:16,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",lineHeight:1.4,boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor=C.borderHi} onBlur={e=>e.target.style.borderColor=C.border}/>
        <button onClick={send} style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:input.trim()?`linear-gradient(135deg,#1a8a50,${C.accent})`:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .25s"}}>
          <Send size={17} color={input.trim()?"#07111e":C.muted}/>
        </button>
      </div>
    </div>
  );
}

/* ── Classifieds (Барахолка) ── */
const CLASSIFIED_CATS = ["Снасти","Лодки","Места","Другое"];

function ClassifiedsTab({ user, onLogin }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [contact, setContact] = useState("");
  const [cat, setCat] = useState("Снасти");
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState("");

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db,"classifieds"),orderBy("createdAt","desc"),limit(50)),
      snap=>setItems(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return unsub;
  },[]);

  const filtered = catFilter ? items.filter(i=>i.category===catFilter) : items;

  const handlePost = async () => {
    if (!user) { onLogin(); return; }
    if (!title.trim()||!contact.trim()) return;
    setSaving(true);
    try {
      const expires = new Date(Date.now() + 30*24*60*60*1000);
      await addDoc(collection(db,"classifieds"),{
        title:title.trim(), price:price.trim(), contact:contact.trim(),
        category:cat, userId:user.uid, displayName:user.displayName||"Рыбак",
        createdAt:serverTimestamp(), expiresAt:expires,
      });
      setTitle(""); setPrice(""); setContact(""); setShowForm(false);
    } catch(e){}
    setSaving(false);
  };

  const handleDelete = async (id, uid) => {
    if (!user || user.uid !== uid) return;
    if (!window.confirm("Удалить объявление?")) return;
    await deleteDoc(doc(db,"classifieds",id)).catch(()=>{});
  };

  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 12px 80px"}}>
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        <button onClick={()=>setCatFilter("")} style={{padding:"4px 12px",borderRadius:12,background:!catFilter?C.accentDim:C.surface,border:`1px solid ${!catFilter?C.accent:C.border}`,color:!catFilter?C.accent:C.muted,fontSize:11,cursor:"pointer",fontWeight:!catFilter?700:400}}>Все</button>
        {CLASSIFIED_CATS.map(c=>(
          <button key={c} onClick={()=>setCatFilter(catFilter===c?"":c)} style={{padding:"4px 12px",borderRadius:12,background:catFilter===c?C.accentDim:C.surface,border:`1px solid ${catFilter===c?C.accent:C.border}`,color:catFilter===c?C.accent:C.muted,fontSize:11,cursor:"pointer",fontWeight:catFilter===c?700:400}}>{c}</button>
        ))}
      </div>

      <button onClick={()=>{if(!user){onLogin();return;}setShowForm(o=>!o);}} style={{width:"100%",padding:"10px",borderRadius:12,background:showForm?C.surface:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
        {showForm?"✕ Закрыть":"+ Разместить объявление"}
      </button>

      {showForm&&(
        <div style={{...glass(),padding:"14px",marginBottom:12,borderRadius:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Новое объявление</div>
          <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
            {CLASSIFIED_CATS.map(c=>(
              <button key={c} onClick={()=>setCat(c)} style={{padding:"4px 10px",borderRadius:10,background:cat===c?C.accentDim:C.surface,border:`1px solid ${cat===c?C.accent:C.border}`,color:cat===c?C.accent:C.muted,fontSize:11,cursor:"pointer",fontWeight:cat===c?700:400}}>{c}</button>
            ))}
          </div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Заголовок *" style={{width:"100%",padding:"9px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
          <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Цена (или 'договорная')" style={{width:"100%",padding:"9px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
          <input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Telegram / WhatsApp / телефон *" style={{width:"100%",padding:"9px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
          <div style={{fontSize:10,color:C.dimmer,marginBottom:10}}>Объявление публикуется на 30 дней и затем автоматически удаляется</div>
          <button onClick={handlePost} disabled={saving||!title.trim()||!contact.trim()} style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:title.trim()&&contact.trim()?`linear-gradient(135deg,#1a8a50,${C.accent})`:"rgba(46,204,113,.2)",color:title.trim()&&contact.trim()?"#07111e":"rgba(232,244,240,.3)",fontSize:14,fontWeight:800,cursor:"pointer"}}>
            {saving?"Публикуем...":"Опубликовать"}
          </button>
        </div>
      )}

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:C.dimmer}}>
          <div style={{fontSize:44,marginBottom:12}}>🛒</div>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>Объявлений пока нет</div>
          <div style={{fontSize:12}}>Разместите первое!</div>
        </div>
      )}

      {filtered.map(item=>(
        <div key={item.id} style={{...glass(),padding:"12px",marginBottom:8,borderRadius:14}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8,background:C.accentDim,color:C.accent,border:`1px solid ${C.borderHi}`}}>{item.category}</span>
                {item.price&&<span style={{fontSize:11,fontWeight:700,color:C.gold}}>{item.price} ₽</span>}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>{item.title}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>от {item.displayName||"Рыбак"}</div>
            </div>
            {user&&user.uid===item.userId&&(
              <button onClick={()=>handleDelete(item.id,item.userId)} style={{background:"none",border:"none",cursor:"pointer",color:C.dimmer,fontSize:16,flexShrink:0,lineHeight:1}}>🗑</button>
            )}
          </div>
          <a href={item.contact.startsWith("http")||item.contact.startsWith("+")||item.contact.startsWith("@")?`https://t.me/${item.contact.replace(/^@/,"")}`:`tel:${item.contact}`}
            style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:10,background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",color:C.cyan,fontSize:12,fontWeight:700,textDecoration:"none"}}>
            📞 {item.contact}
          </a>
        </div>
      ))}
    </div>
  );
}

/* ── CommunityScreen ── */
export default function CommunityScreen({ user, onLogin }) {
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [userTopBadge, setUserTopBadge] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  // video circle state
  const [showVideoRec, setShowVideoRec] = useState(false);
  const [vidRec, setVidRec] = useState(false);
  const [vidSec, setVidSec] = useState(0);
  const [vidBlob, setVidBlob] = useState(null);
  const [vidPreview, setVidPreview] = useState(null);
  const [vidUploading, setVidUploading] = useState(false);
  // voice state
  const [voiceRec, setVoiceRec] = useState(false);
  const [voiceSec, setVoiceSec] = useState(0);
  // upload progress
  const [mediaUploading, setMediaUploading] = useState(false);

  const bottomRef = useRef(null);
  const photoGallRef = useRef(null);
  const photoCamRef = useRef(null);
  const videoGallRef = useRef(null);
  const videoCamRef = useRef(null);
  const liveRef = useRef(null);
  const previewVidRef = useRef(null);
  const vidMR = useRef(null);
  const vidStream = useRef(null);
  const vidChunks = useRef([]);
  const vidTimer = useRef(null);
  const voiceMR = useRef(null);
  const voiceStream = useRef(null);
  const voiceChunks = useRef([]);
  const voiceTimer = useRef(null);

  const [olderMsgs, setOlderMsgs] = useState([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const oldestDocRef = useRef(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(()=>{
    const t = setTimeout(()=>setSearchQuery(searchInput), 300);
    return ()=>clearTimeout(t);
  },[searchInput]);
  const [dmTarget, setDmTarget] = useState(null);

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db, "messages"), orderBy("timestamp","desc"), limit(50)), snap=>{
      const docs=snap.docs;
      if(docs.length>0) oldestDocRef.current=docs[docs.length-1];
      setMessages([...docs].reverse().map(d=>({id:d.id,...d.data()})));
      setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),50);
    });
    return unsub;
  },[]);

  const loadOlderMsgs = async () => {
    if(!oldestDocRef.current||loadingOlder||noMoreOlder) return;
    setLoadingOlder(true);
    try {
      const snap=await getDocs(query(collection(db, "messages"), orderBy("timestamp","desc"), startAfter(oldestDocRef.current), limit(50)));
      if(snap.docs.length<50) setNoMoreOlder(true);
      if(snap.docs.length>0){
        oldestDocRef.current=snap.docs[snap.docs.length-1];
        const older=[...snap.docs].reverse().map(d=>({id:d.id,...d.data()}));
        setOlderMsgs(prev=>[...older,...prev]);
      } else { setNoMoreOlder(true); }
    } catch(e){}
    setLoadingOlder(false);
  };

  const allMsgs = useMemo(()=>{
    const seen=new Set();
    return [...olderMsgs,...messages].filter(m=>{ if(seen.has(m.id))return false; seen.add(m.id); return true; });
  },[olderMsgs,messages]);

  const displayMsgs = useMemo(()=>{
    if(!searchQuery.trim()) return allMsgs;
    const q=searchQuery.toLowerCase();
    return allMsgs.filter(m=>(m.text||"").toLowerCase().includes(q)||(m.displayName||"").toLowerCase().includes(q)||(m.username||"").toLowerCase().includes(q));
  },[allMsgs,searchQuery]);

  const hlSearch = (text) => {
    if(!searchQuery.trim()) return text;
    const q=searchQuery.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    return (text||"").split(new RegExp(`(${q})`,"gi")).map((p,i)=>
      p.toLowerCase()===searchQuery.toLowerCase()
        ? <mark key={i} style={{background:"rgba(46,204,113,.35)",color:C.text,borderRadius:2,padding:"0 1px"}}>{p}</mark>
        : p
    );
  };

  // Загрузка/создание username + top badge
  useEffect(()=>{
    if(!user) return;
    const userRef=doc(db, "users", user.uid);
    getDoc(userRef).then(snap=>{
      if(snap.exists() && snap.data().username){ setUsername(snap.data().username); return; }
      const uname=genUsername(user.displayName);
      setDoc(userRef, {username:uname,displayName:user.displayName||"Рыбак"},{merge:true});
      setUsername(uname);
    });
    getDocs(collection(db, "users", user.uid, "badges")).then(snap=>{
      if(snap.empty) return;
      const topBadgeOrder=["whale_15kg","trophy_5kg","diversity_10","reporter","traveler","weekly_angler","photographer","early_bird","first_catch"];
      const ids=new Set(snap.docs.map(d=>d.id));
      const top=topBadgeOrder.find(id=>ids.has(id));
      if(top){const bd=BADGE_DEFS.find(b=>b.id===top); if(bd) setUserTopBadge(bd.emoji);}
    }).catch(()=>{});
  },[user]);

  const mkBase = () => ({
    uid: user.uid,
    displayName: user.displayName || "Рыбак",
    username: username || genUsername(user.displayName||"рыбак"),
    topBadge: userTopBadge || null,
    timestamp: serverTimestamp()
  });

  /* ── upload helper ── */
  const uploadFile = async (blob, path, contentType) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, {contentType});
    return await getDownloadURL(storageRef);
  };

  /* ── reactions ── */
  const toggleReaction = async (msgId, emoji) => {
    if(!user){ onLogin(); return; }
    setSelectedMsg(null);
    try {
      const msgRef=doc(db, "messages", msgId);
      const msgSnap=await getDoc(msgRef);
      if(!msgSnap.exists()) return;
      const reactions=msgSnap.data().reactions||{};
      const upd={};
      for(const [e, uids] of Object.entries(reactions)){
        if(Array.isArray(uids)&&uids.includes(user.uid)){
          const filtered=uids.filter(u=>u!==user.uid);
          upd[`reactions.${e}`]=filtered.length>0?filtered:deleteField();
        }
      }
      const alreadyHad=(reactions[emoji]||[]).includes(user.uid);
      if(!alreadyHad){
        const cur=(reactions[emoji]||[]).filter(u=>u!==user.uid);
        upd[`reactions.${emoji}`]=[...cur,user.uid];
      }
      if(Object.keys(upd).length>0) await updateDoc(msgRef, upd);
    } catch(e){ console.error("toggleReaction error:", e); }
  };

  /* ── delete ── */
  const deleteMsg = async (msgId) => {
    setSelectedMsg(null);
    await deleteDoc(doc(db, "messages", msgId));
  };

  /* ── edit ── */
  const startEdit = (msg) => {
    setEditingMsg({id: msg.id, text: msg.text});
    setInput(msg.text);
    setSelectedMsg(null);
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setInput("");
  };

  /* ── text / edit ── */
  const send = async () => {
    const text = input.trim(); if(!text) return;
    if(!user){ onLogin(); return; }

    if(editingMsg) {
      setInput(""); setEditingMsg(null);
      try {
        await updateDoc(doc(db, "messages", editingMsg.id), {text, edited: true});
      } catch(e) { setSendError("Ошибка редактирования"); setTimeout(()=>setSendError(""),3000); }
      return;
    }

    setInput(""); setReplyTo(null); setSelectedMsg(null);
    try {
      const base = mkBase();
      const msg = {...base, type:"text", text};
      if(replyTo) msg.replyTo={id:replyTo.id,text:replyTo.text||"",displayName:replyTo.displayName,username:replyTo.username||""};
      await addDoc(collection(db, "messages"), msg);
    } catch(e) {
      setInput(text);
      setSendError("Не удалось отправить — нет соединения");
      setTimeout(()=>setSendError(""), 3000);
    }
  };

  /* ── photo ── */
  const sendPhoto = async (file) => {
    if(!file) return;
    if(!user){ onLogin(); return; }
    setAttachOpen(false); setMediaUploading(true);
    try {
      const url = await uploadFile(file, `chat_photos/${user.uid}_${Date.now()}.jpg`, file.type||"image/jpeg");
      await addDoc(collection(db, "messages"), {...mkBase(), type:"image", imageUrl:url});
    } catch(e) {
      setSendError("Ошибка загрузки фото");
      setTimeout(()=>setSendError(""), 3000);
    }
    setMediaUploading(false);
  };

  /* ── video from gallery ── */
  const sendVideoFile = async (file) => {
    if(!file) return;
    if(!user){ onLogin(); return; }
    setAttachOpen(false); setMediaUploading(true);
    try {
      const ext = (file.name||"").split(".").pop() || "mp4";
      const url = await uploadFile(file, `chat_videos/${user.uid}_${Date.now()}.${ext}`, file.type||"video/mp4");
      await addDoc(collection(db, "messages"), {...mkBase(), type:"video", videoUrl:url});
    } catch(e) {
      alert("Ошибка загрузки видео: " + e.message);
    }
    setMediaUploading(false);
  };

  /* ── video circle ── */
  const [camFacing, setCamFacing] = useState("environment");

  const startCamStream = async (facing) => {
    if(vidStream.current){ vidStream.current.getTracks().forEach(t=>t.stop()); vidStream.current=null; }
    const s = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:facing, width:{ideal:400}, height:{ideal:400}},
      audio: true
    });
    vidStream.current = s;
    if(liveRef.current){ liveRef.current.srcObject=s; liveRef.current.play(); }
    return s;
  };

  const openVideoRec = async () => {
    if(!user){ onLogin(); return; }
    setAttachOpen(false);
    setVidBlob(null); setVidPreview(null); setVidRec(false); setVidSec(0);
    try {
      await startCamStream(camFacing);
      setShowVideoRec(true);
    } catch(e){ alert("Нет доступа к камере: " + e.message); }
  };

  const flipCamera = async () => {
    if(vidRec) return;
    const newFacing = camFacing === "environment" ? "user" : "environment";
    setCamFacing(newFacing);
    try { await startCamStream(newFacing); }
    catch(e){ alert("Не удалось переключить камеру: " + e.message); }
  };

  const startVidRec = () => {
    if(!vidStream.current) return;
    vidChunks.current = [];
    const mime = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
    const mr = new MediaRecorder(vidStream.current, {mimeType:mime});
    mr.ondataavailable = e => { if(e.data&&e.data.size>0) vidChunks.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(vidChunks.current, {type:mime});
      setVidBlob(blob); setVidPreview(URL.createObjectURL(blob)); setVidRec(false);
      if(liveRef.current) liveRef.current.srcObject = null;
      if(vidStream.current){ vidStream.current.getTracks().forEach(t=>t.stop()); vidStream.current=null; }
    };
    mr.start(100); vidMR.current = mr;
    setVidRec(true); setVidSec(0);
    vidTimer.current = setInterval(()=>setVidSec(s=>{ if(s>=59){stopVidRec();return 60;} return s+1; }),1000);
  };

  const stopVidRec = () => {
    if(vidTimer.current){ clearInterval(vidTimer.current); vidTimer.current=null; }
    if(vidMR.current && vidMR.current.state!=="inactive") vidMR.current.stop();
  };

  const closeVideoRec = () => {
    stopVidRec();
    if(vidStream.current){ vidStream.current.getTracks().forEach(t=>t.stop()); vidStream.current=null; }
    setShowVideoRec(false); setVidBlob(null); setVidPreview(null); setVidRec(false); setVidSec(0);
  };

  const sendVideoCircle = async () => {
    if(!vidBlob||!user) return;
    setVidUploading(true);
    try {
      const ext = vidBlob.type.includes("mp4") ? "mp4" : "webm";
      const url = await uploadFile(vidBlob, `chat_videos/${user.uid}_${Date.now()}.${ext}`, vidBlob.type);
      await addDoc(collection(db, "messages"), {...mkBase(), type:"video", videoUrl:url});
      closeVideoRec();
    } catch(e){ alert("Ошибка: " + e.message + "\n\nПроверь правила Firebase Storage."); }
    setVidUploading(false);
  };

  /* ── voice ── */
  const startVoice = async () => {
    if(!user){ onLogin(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({audio:true});
      voiceStream.current = s; voiceChunks.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const mr = new MediaRecorder(s, {mimeType:mime});
      mr.ondataavailable = e => { if(e.data&&e.data.size>0) voiceChunks.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(voiceChunks.current, {type:mime});
        const dur = voiceSec;
        setVoiceRec(false); setVoiceSec(0);
        try {
          const ext = mime.includes("mp4") ? "m4a" : "webm";
          const url = await uploadFile(blob, `chat_voice/${user.uid}_${Date.now()}.${ext}`, mime);
          await addDoc(collection(db, "messages"), {...mkBase(), type:"voice", voiceUrl:url, dur});
        } catch(e){ alert("Ошибка загрузки голосового: " + e.message); }
      };
      mr.start(100); voiceMR.current = mr;
      setVoiceRec(true); setVoiceSec(0);
      voiceTimer.current = setInterval(()=>setVoiceSec(s=>{ if(s>=120){stopVoice();return 120;} return s+1; }),1000);
    } catch(e){ alert("Нет доступа к микрофону: " + e.message); }
  };

  const stopVoice = () => {
    if(voiceTimer.current){ clearInterval(voiceTimer.current); voiceTimer.current=null; }
    if(voiceMR.current && voiceMR.current.state!=="inactive") voiceMR.current.stop();
    if(voiceStream.current){ voiceStream.current.getTracks().forEach(t=>t.stop()); voiceStream.current=null; }
  };

  const cancelVoice = () => {
    if(voiceTimer.current){ clearInterval(voiceTimer.current); voiceTimer.current=null; }
    if(voiceMR.current && voiceMR.current.state!=="inactive"){
      voiceMR.current.onstop = null;
      voiceMR.current.stop();
    }
    if(voiceStream.current){ voiceStream.current.getTracks().forEach(t=>t.stop()); voiceStream.current=null; }
    setVoiceRec(false); setVoiceSec(0);
  };

  const aColor=uid=>{const cols=[C.accent,C.cyan,C.gold,C.blue,"#a78bfa","#f472b6"];let h=0;for(let c of(uid||"x"))h=(h*31+c.charCodeAt(0))%cols.length;return cols[h];};
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",position:"relative"}}>
      {dmTarget&&user&&<DMScreen user={user} otherUser={dmTarget} onClose={()=>setDmTarget(null)}/>}
      <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setTab("chat")} style={{padding:"6px 16px",borderRadius:12,background:tab==="chat"?C.accentDim:C.surface,border:`1px solid ${tab==="chat"?C.accent:C.border}`,color:tab==="chat"?C.accent:C.muted,fontSize:13,fontWeight:700,cursor:"pointer"}}>💬 Чат</button>
            <button onClick={()=>setTab("classified")} style={{padding:"6px 16px",borderRadius:12,background:tab==="classified"?C.accentDim:C.surface,border:`1px solid ${tab==="classified"?C.accent:C.border}`,color:tab==="classified"?C.accent:C.muted,fontSize:13,fontWeight:700,cursor:"pointer"}}>🛒 Барахолка</button>
          </div>
          {tab==="chat"&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>{setSearchOpen(o=>!o);setSearchInput("");setSearchQuery("");}} style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${searchOpen?C.borderHi:C.border}`,background:searchOpen?C.accentDim:C.surface,color:searchOpen?C.accent:C.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,transition:"all .2s"}}>🔍</button>
            {!user&&<button onClick={onLogin} style={{padding:"6px 12px",borderRadius:12,border:`1px solid ${C.borderHi}`,background:C.accentDim,color:C.accent,fontSize:11,fontWeight:700,cursor:"pointer"}}>Войти</button>}
          </div>}
        </div>
        {tab==="chat"&&searchOpen&&(
          <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",animation:"fadeIn .2s ease"}}>
            <input autoFocus value={searchInput} onChange={e=>setSearchInput(e.target.value)}
              placeholder="Поиск по сообщениям..."
              style={{flex:1,padding:"9px 14px",borderRadius:12,border:`1px solid ${C.borderHi}`,background:C.surfaceHi,color:C.text,fontSize:13,outline:"none"}}
              onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.borderHi}/>
            {searchInput.trim()&&<span style={{fontSize:11,color:C.muted,flexShrink:0,whiteSpace:"nowrap"}}>{displayMsgs.length} сообщ.</span>}
          </div>
        )}
      </div>

      {tab==="classified"&&<ClassifiedsTab user={user} onLogin={onLogin}/>}
      {tab==="chat"&&<div style={{flex:1,overflowY:"auto",padding:"12px 12px 6px"}} onClick={()=>setAttachOpen(false)}>
        {!noMoreOlder&&messages.length>=50&&(
          <div style={{textAlign:"center",padding:"8px 0 12px"}}>
            <button onClick={loadOlderMsgs} disabled={loadingOlder} style={{padding:"7px 18px",borderRadius:16,border:`1px solid ${C.border}`,background:C.surface,color:C.muted,fontSize:12,cursor:"pointer"}}>
              {loadingOlder?"Загружаем...":"📋 Загрузить старые сообщения"}
            </button>
          </div>
        )}
        {allMsgs.length===0&&<div style={{textAlign:"center",padding:40,color:C.dimmer}}><MessageCircle size={40} color={C.dimmer} style={{margin:"0 auto 12px",display:"block"}}/><div style={{fontSize:14}}>Будь первым!</div></div>}
        {allMsgs.length>0&&displayMsgs.length===0&&<div style={{textAlign:"center",padding:40,color:C.dimmer}}><div style={{fontSize:24,marginBottom:8}}>🔍</div><div style={{fontSize:14}}>Ничего не найдено</div></div>}
        {displayMsgs.map((msg,i)=>{
          const isMe=user&&msg.uid===user.uid, col=aColor(msg.uid), ts=msg.timestamp?fmtDate(msg.timestamp):"";
          const isVideo=msg.type==="video"&&msg.videoUrl;
          const isVoice=msg.type==="voice"&&msg.voiceUrl;
          const isImage=msg.type==="image"&&msg.imageUrl;
          const isSel=selectedMsg===msg.id;
          const showTs = isSel || i===displayMsgs.length-1 || displayMsgs[i+1]?.uid!==msg.uid;
          const sameAsPrev = i>0 && displayMsgs[i-1]?.uid===msg.uid;
          const rxEntries=Object.entries(msg.reactions||{}).filter(([,u])=>u&&u.length>0);
          return (
            <div key={msg.id} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start",marginBottom:sameAsPrev?3:10,animation:"fadeUp .25s ease"}}>
              <div style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",width:"100%"}}>
                {!isMe&&<div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:sameAsPrev?"transparent":`linear-gradient(135deg,${col},${col}88)`,display:"flex",alignItems:"center",justifyContent:"center",marginRight:8,alignSelf:"flex-end",fontSize:13,fontWeight:800,color:"#07111e"}}>{sameAsPrev?"":(msg.displayName||"Р")[0].toUpperCase()}</div>}
                <div style={{maxWidth:isVideo?"160px":"75%"}} onClick={()=>setSelectedMsg(isSel?null:msg.id)}>
                  {!isMe&&!sameAsPrev&&<div style={{fontSize:10,color:col,fontWeight:700,marginBottom:2,paddingLeft:4,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setDmTarget({uid:msg.uid,displayName:msg.displayName,username:msg.username});}}>
                    {msg.topBadge&&<span style={{fontSize:12}}>{msg.topBadge}</span>}
                    {hlSearch(msg.displayName||"")}
                    {msg.username&&<span style={{color:C.dimmer,fontWeight:400,marginLeft:2}}>@{hlSearch(msg.username)}</span>}
                  </div>}
                  {/* Reply preview inside bubble */}
                  {msg.replyTo&&<div style={{margin:"0 0 6px",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,.06)",borderLeft:`3px solid ${col}`,cursor:"default"}} onClick={e=>e.stopPropagation()}>
                    <div style={{fontSize:10,color:col,fontWeight:700,marginBottom:1}}>{msg.replyTo.displayName}{msg.replyTo.username?` @${msg.replyTo.username}`:""}</div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{msg.replyTo.text||"медиафайл"}</div>
                  </div>}
                  {isVideo&&<div>
                    <VideoNote url={msg.videoUrl} isMe={isMe} col={col}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:isMe?"flex-end":"flex-start",gap:8,marginTop:4}}>
                      {showTs&&<div style={{fontSize:9,opacity:.4}}>{ts}</div>}
                      <button onClick={e=>{e.stopPropagation();setSelectedMsg(isSel?null:msg.id);}}
                        style={{background:"rgba(255,255,255,.07)",border:`1px solid ${C.border}`,borderRadius:12,padding:"2px 8px",fontSize:12,cursor:"pointer",color:C.muted}}>
                        😊
                      </button>
                    </div>
                  </div>}
                  {isVoice&&<div>
                    <VoiceMessage url={msg.voiceUrl} dur={msg.dur} isMe={isMe} col={col}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:isMe?"flex-end":"flex-start",gap:8,marginTop:4}}>
                      {showTs&&<div style={{fontSize:9,opacity:.4}}>{ts}</div>}
                      <button onClick={e=>{e.stopPropagation();setSelectedMsg(isSel?null:msg.id);}}
                        style={{background:"rgba(255,255,255,.07)",border:`1px solid ${C.border}`,borderRadius:12,padding:"2px 8px",fontSize:12,cursor:"pointer",color:C.muted}}>
                        😊
                      </button>
                    </div>
                  </div>}
                  {isImage&&<div>
                    <div style={{position:"relative",display:"inline-block"}}>
                      <img src={msg.imageUrl} alt="" style={{maxWidth:220,maxHeight:200,borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",display:"block",objectFit:"cover"}}/>
                      <a href={msg.imageUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                        style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.6)",borderRadius:8,padding:"3px 8px",fontSize:11,color:"#fff",textDecoration:"none",backdropFilter:"blur(4px)"}}>
                        🔍
                      </a>
                    </div>
                    {showTs&&<div style={{fontSize:9,marginTop:4,opacity:.4,textAlign:isMe?"right":"left"}}>{ts}</div>}
                  </div>}
                  {!isVideo&&!isVoice&&!isImage&&<div style={{padding:"10px 14px",borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",background:isMe?`linear-gradient(135deg,#1a5276,${C.blue})`:"rgba(255,255,255,0.07)",border:isMe?"none":`1px solid ${C.border}`,color:C.text,fontSize:13.5,lineHeight:1.5}}>
                    {hlSearch(msg.text||"")}
                    {showTs&&<div style={{fontSize:9,marginTop:4,opacity:.4,textAlign:"right",display:"flex",justifyContent:"flex-end",gap:6}}>
                      {msg.edited&&<span>изменено</span>}
                      <span>{ts}</span>
                    </div>}
                  </div>}
                </div>
              </div>

              {/* Reactions display */}
              {rxEntries.length>0&&<div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap",paddingLeft:isMe?0:40}}>
                {rxEntries.map(([emoji,uids])=>(
                  <button key={emoji} onClick={()=>toggleReaction(msg.id,emoji)}
                    style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:20,border:`1px solid ${uids.includes(user?.uid)?C.borderHi:C.border}`,background:uids.includes(user?.uid)?C.accentDim:"rgba(255,255,255,.04)",cursor:"pointer",fontSize:13}}>
                    <span>{emoji}</span><span style={{fontSize:11,color:C.muted,fontWeight:700}}>{uids.length}</span>
                  </button>
                ))}
              </div>}

              {/* Action bar */}
              {isSel&&<div style={{display:"flex",alignItems:"center",gap:4,marginTop:6,padding:"4px 8px",background:"rgba(7,17,30,.96)",borderRadius:20,border:`1px solid ${C.border}`,boxShadow:"0 4px 16px rgba(0,0,0,.5)",animation:"fadeUp .15s ease",flexWrap:"wrap",maxWidth:320}}>
                <button onClick={()=>{setReplyTo(msg);setSelectedMsg(null);}} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:14,background:"none",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,cursor:"pointer",fontWeight:700}}>
                  ↩ Ответить
                </button>
                {isMe&&msg.type==="text"&&<button onClick={()=>startEdit(msg)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:14,background:"none",border:`1px solid ${C.border}`,color:C.cyan,fontSize:11,cursor:"pointer",fontWeight:700}}>
                  ✏️ Изменить
                </button>}
                {isMe&&<button onClick={()=>deleteMsg(msg.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:14,background:"none",border:"1px solid rgba(239,68,68,.4)",color:"#f87171",fontSize:11,cursor:"pointer",fontWeight:700}}>
                  🗑 Удалить
                </button>}
                <div style={{width:1,height:20,background:C.border,margin:"0 2px"}}/>
                {REACTIONS_LIST.map(emoji=>(
                  <button key={emoji} onClick={()=>toggleReaction(msg.id,emoji)}
                    style={{width:32,height:32,borderRadius:"50%",background:"none",border:"none",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform .15s"}}
                    onMouseOver={e=>e.currentTarget.style.transform="scale(1.3)"}
                    onMouseOut={e=>e.currentTarget.style.transform="scale(1)"}>
                    {emoji}
                  </button>
                ))}
              </div>}
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>}

      {tab==="chat"&&<>{/* Запись голоса */}
      {voiceRec&&<div style={{padding:"10px 14px",background:"rgba(239,68,68,.12)",borderTop:`1px solid #ef444433`,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:"#ef4444",animation:"pulseGlow .8s ease infinite"}}/>
        <span style={{color:"#ef4444",fontSize:14,fontWeight:700,flex:1}}>🎤 Запись {fmt(voiceSec)}</span>
        <button onClick={stopVoice} style={{padding:"8px 18px",borderRadius:20,border:"none",background:"#ef4444",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отправить</button>
        <button onClick={cancelVoice} style={{padding:"8px 14px",borderRadius:20,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.muted,fontSize:13,cursor:"pointer"}}>Отмена</button>
      </div>}

      {mediaUploading&&<div style={{padding:"8px 14px",background:C.accentDim,borderTop:`1px solid ${C.border}`,fontSize:12,color:C.accent,textAlign:"center"}}>Загружаем медиафайл...</div>}

      {/* Edit mode bar */}
      {editingMsg&&<div style={{padding:"8px 14px",background:"rgba(34,211,238,.08)",borderTop:`1px solid rgba(34,211,238,.25)`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:3,height:36,borderRadius:2,background:C.cyan,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:C.cyan,fontWeight:700,marginBottom:1}}>✏️ Редактирование</div>
          <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{editingMsg.text}</div>
        </div>
        <button onClick={cancelEdit} style={{background:"none",border:"none",cursor:"pointer",color:C.dimmer,fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>
      </div>}

      {/* Reply preview bar */}
      {replyTo&&<div style={{padding:"8px 14px",background:"rgba(46,204,113,.08)",borderTop:`1px solid rgba(46,204,113,.25)`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:3,height:36,borderRadius:2,background:C.accent,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:C.accent,fontWeight:700,marginBottom:1}}>↩ {replyTo.displayName}{replyTo.username?` @${replyTo.username}`:""}</div>
          <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{replyTo.text||"медиафайл"}</div>
        </div>
        <button onClick={()=>setReplyTo(null)} style={{background:"none",border:"none",cursor:"pointer",color:C.dimmer,fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>
      </div>}

      {/* Панель вложений */}
      {attachOpen&&<div style={{padding:"12px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(7,17,30,.97)",display:"flex",gap:12,justifyContent:"center",animation:"slideUp .2s ease"}}>
        {[
          {icon:<VideoIcon size={22} color={C.text}/>,label:"Видео с кам",fn:()=>videoCamRef.current?.click()},
          {icon:<AttachIcon size={22} color={C.text}/>,label:"Видео файл",fn:()=>videoGallRef.current?.click()},
          {icon:<div style={{width:22,height:22,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>,label:"Кружок",fn:openVideoRec},
          {icon:<Mic size={22} color={C.text}/>,label:"Голос",fn:startVoice},
        ].map(({icon,label,fn})=>(
          <button key={label} onClick={fn} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:"8px 12px",borderRadius:12}}>
            <div style={{width:48,height:48,borderRadius:14,background:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
            <span style={{fontSize:10,color:C.muted,fontWeight:600}}>{label}</span>
          </button>
        ))}
      </div>}

      {!user&&<div style={{padding:"11px 14px",background:"rgba(46,204,113,.07)",borderTop:`1px solid rgba(46,204,113,.2)`,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:12,color:C.muted,flex:1}}>🔒 Войдите чтобы писать в чат и сохранять уловы</span>
        <button onClick={onLogin} style={{padding:"8px 16px",borderRadius:12,border:"none",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>Войти</button>
      </div>}
      {sendError&&<div style={{padding:"8px 14px",background:"rgba(239,68,68,.15)",borderTop:"1px solid rgba(239,68,68,.3)",fontSize:12,color:"#fca5a5",fontWeight:600,animation:"fadeIn .2s ease"}}>{sendError}</div>}
      <div style={{padding:"8px 12px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(7,17,30,.92)",backdropFilter:"blur(20px)",display:"flex",gap:8,alignItems:"flex-end"}}>
        <input ref={photoGallRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>sendPhoto(e.target.files[0])}/>
        <input ref={photoCamRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>sendPhoto(e.target.files[0])}/>
        <input ref={videoGallRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>sendVideoFile(e.target.files[0])}/>
        <input ref={videoCamRef} type="file" accept="video/*" capture="environment" style={{display:"none"}} onChange={e=>sendVideoFile(e.target.files[0])}/>

        {/* Фото из галереи */}
        <button onClick={()=>{if(!user){onLogin();return;}photoGallRef.current?.click();}} style={{width:40,height:40,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ImageIcon size={17} color={C.muted}/>
        </button>
        {/* Камера */}
        <button onClick={()=>{if(!user){onLogin();return;}photoCamRef.current?.click();}} style={{width:40,height:40,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Camera size={17} color={C.muted}/>
        </button>
        {/* Ещё (видео, кружок, голос) */}
        <button onClick={()=>{if(!user){onLogin();return;}setAttachOpen(o=>!o);}} style={{width:40,height:40,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:attachOpen?C.accentDim:C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",transform:attachOpen?"rotate(45deg)":"none"}}>
          <AttachIcon size={17} color={attachOpen?C.accent:C.muted}/>
        </button>

        <textarea rows={1} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder={editingMsg?"Редактировать сообщение...":user?"Написать в чат...":"Войдите чтобы писать..."}
          style={{flex:1,resize:"none",background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:14,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",lineHeight:1.4,boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor=C.borderHi} onBlur={e=>e.target.style.borderColor=C.border}/>
        {input.trim()
          ? <button onClick={send} style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:`linear-gradient(135deg,#1a5276,${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .25s"}}>
              <Send size={17} color="#fff"/>
            </button>
          : <button onClick={voiceRec?stopVoice:startVoice} style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:voiceRec?"#ef4444":C.surfaceHi,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .25s"}}>
              <Mic size={18} color={voiceRec?"#fff":C.muted}/>
            </button>
        }
      </div>

      {/* ── Рекордер кружочков ── */}
      {showVideoRec&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.93)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn .2s ease"}}>
        <div style={{position:"absolute",top:16,right:16}}>
          <button onClick={closeVideoRec} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:"50%",width:40,height:40,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <XIcon size={20} color="#fff"/>
          </button>
        </div>
        <div style={{position:"relative",width:260,height:260,marginBottom:28}}>
          {vidRec&&<svg style={{position:"absolute",inset:0,transform:"rotate(-90deg)"}} width={260} height={260}>
            <circle cx={130} cy={130} r={126} fill="none" stroke={C.accent} strokeWidth={4} strokeOpacity={.2}/>
            <circle cx={130} cy={130} r={126} fill="none" stroke={C.accent} strokeWidth={4}
              strokeDasharray={2*Math.PI*126} strokeDashoffset={2*Math.PI*126*(1-vidSec/60)} style={{transition:"stroke-dashoffset 1s linear"}}/>
          </svg>}
          <div style={{position:"absolute",inset:vidRec?5:0,borderRadius:"50%",overflow:"hidden",background:"#111",border:`3px solid ${vidRec?C.accent:vidPreview?"#2ecc71":C.border}`}}>
            {!vidPreview&&<video ref={liveRef} muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",display:"block",transform:"scaleX(-1)"}}/>}
            {vidPreview&&<video ref={previewVidRef} src={vidPreview} loop playsInline controls style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
          </div>
          {vidRec&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",color:"#fff",fontSize:36,fontWeight:800,textShadow:"0 2px 8px rgba(0,0,0,.8)",pointerEvents:"none"}}>{60-vidSec}</div>}
        </div>
        {!vidPreview&&!vidRec&&<div style={{display:"flex",alignItems:"center",gap:24,marginBottom:16}}>
          <div style={{width:48}}/>
          <button onClick={startVidRec} style={{width:72,height:72,borderRadius:"50%",border:`4px solid ${C.accent}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:C.accent}}/>
          </button>
          <button onClick={flipCamera} style={{width:48,height:48,borderRadius:"50%",border:`1px solid ${C.border}`,background:"rgba(255,255,255,.1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="Сменить камеру">
            <span style={{fontSize:22}}>🔄</span>
          </button>
        </div>}
        {vidRec&&<button onClick={stopVidRec} style={{width:72,height:72,borderRadius:"50%",border:`4px solid #ef4444`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
          <div style={{width:26,height:26,borderRadius:4,background:"#ef4444"}}/>
        </button>}
        {vidPreview&&!vidUploading&&<div style={{display:"flex",gap:16,marginBottom:16}}>
          <button onClick={()=>{setVidPreview(null);setVidBlob(null);setVidSec(0);openVideoRec();}} style={{padding:"12px 24px",borderRadius:14,border:`1px solid ${C.border}`,background:C.surfaceHi,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer"}}>Переснять</button>
          <button onClick={sendVideoCircle} style={{padding:"12px 28px",borderRadius:14,border:"none",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:14,fontWeight:800,cursor:"pointer"}}>Отправить</button>
        </div>}
        {vidUploading&&<div style={{color:C.accent,fontSize:14,fontWeight:700}}>Загрузка...</div>}
        <div style={{color:C.muted,fontSize:12,marginTop:8}}>{!vidPreview&&!vidRec?"Нажми для начала записи":vidRec?"Нажми квадрат для остановки":""}</div>
      </div>}</>}
    </div>
  );
}
