import { memo, useRef, useState } from 'react';
import { C } from '../../tokens.js';
import { Fish } from '../../icons/index.jsx';
import VoiceMessage from './VoiceMessage.jsx';

const renderLinks = (text, isUser) =>
  (text||"").replace(/\*/g,"").split(/(https?:\/\/[^\s\n]+)/g).map((part,i)=>{
    if(!part.match(/^https?:\/\//)) return part;
    const isMaps=part.includes("maps.google")||part.includes("google.com/maps");
    const isWB=part.includes("wildberries"), isOzon=part.includes("ozon.ru"), isYM=part.includes("market.yandex");
    const label=isMaps?"📍 Открыть на карте →":isWB?"🛒 Wildberries →":isOzon?"🛒 Ozon →":isYM?"🛒 Яндекс Маркет →":part;
    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",color:isUser?"#07111e":C.accent,textDecoration:"underline",cursor:"pointer",wordBreak:"break-all",fontWeight:isMaps||isWB||isOzon||isYM?700:400}}>{label}</a>;
  });

function Bubble({ msg, onReply, onDelete, onReact, prevMsg, nextMsg }) {
  const isUser = msg.role==="user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const longTimer = useRef(null);
  const t0x = useRef(0), t0y = useRef(0), didSwipe = useRef(false);

  const isPrevSame = prevMsg && prevMsg.role===msg.role;
  const isNextSame = nextMsg && nextMsg.role===msg.role;

  const br = isUser
    ? `18px 18px ${isNextSame?"6px":"18px"} ${isPrevSame?"6px":"18px"}`
    : `${isPrevSame?"6px":"18px"} 18px 18px ${isNextSame?"6px":"18px"}`;

  const bg  = isUser?`linear-gradient(135deg,#1a8a50,${C.accent})`:msg.isError?"rgba(239,68,68,0.1)":"rgba(255,255,255,0.07)";
  const col = isUser?"#07111e":C.text;
  const brd = isUser?"none":msg.isError?`1px solid rgba(239,68,68,0.4)`:`1px solid ${C.border}`;
  const REACTS = ["👍","❤️","😂","😮","🔥","🎣","🐟","👎"];

  const onTS = e => {
    t0x.current=e.touches[0].clientX; t0y.current=e.touches[0].clientY; didSwipe.current=false;
    longTimer.current=setTimeout(()=>{ if(!didSwipe.current) setMenuOpen(true); },580);
  };
  const onTM = e => {
    const dx=e.touches[0].clientX-t0x.current, dy=Math.abs(e.touches[0].clientY-t0y.current);
    if(dy>12){clearTimeout(longTimer.current);return;}
    if(dx>8){didSwipe.current=true;clearTimeout(longTimer.current);setSwipeX(Math.min(dx,62));}
  };
  const onTE = () => { clearTimeout(longTimer.current); if(swipeX>50) onReply&&onReply(msg); setSwipeX(0); };

  const reactions = msg.reactions||{};
  const hasReactions = Object.keys(reactions).length>0;
  const ticks = isUser?(msg.read?"✓✓":"✓"):null;
  const tickCol = msg.read?"#22d3ee":"rgba(255,255,255,0.6)";
  const showAvatar = !isUser && !isPrevSame;

  return (
    <div style={{position:"relative",marginBottom:isNextSame?2:8}}>
      {(menuOpen||reactOpen)&&<div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:200}} onClick={()=>{setMenuOpen(false);setReactOpen(false);}}/>}
      {swipeX>12&&<div style={{position:"absolute",left:isUser?"auto":-28,right:isUser?-28:"auto",top:"50%",transform:"translateY(-50%)",fontSize:16,opacity:Math.min(swipeX/52,1),pointerEvents:"none",zIndex:1}}>↩️</div>}

      <div style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",transform:`translateX(${swipeX}px)`,transition:swipeX===0?"transform .18s ease":"none",animation:"fadeUp .25s ease"}}
        onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
        onContextMenu={e=>{e.preventDefault();setMenuOpen(true);}}
      >
        {!isUser&&(
          <div style={{width:34,flexShrink:0,marginRight:8,alignSelf:"flex-end"}}>
            {showAvatar&&<div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 14px ${C.accentGlow}`}}><Fish size={17} color="#07111e"/></div>}
          </div>
        )}
        <div style={{maxWidth:"80%"}}>
          {msg.replyTo&&(
            <div style={{borderLeft:`3px solid ${C.accent}`,paddingLeft:8,paddingTop:4,paddingBottom:4,marginBottom:2,background:"rgba(46,204,113,0.07)",borderRadius:"8px 8px 0 0",overflow:"hidden"}}>
              <div style={{fontSize:10,fontWeight:700,color:C.accent,marginBottom:1}}>{msg.replyTo.role==="user"?"Вы":"Егерь ИИ"}</div>
              <div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{msg.replyTo.type==="image"?"📷 Фото":(msg.replyTo.text||"").slice(0,70)}</div>
            </div>
          )}
          {msg.type==="image"&&<div style={{marginBottom:msg.text?4:0}}><img src={msg.imageUrl} alt="" onClick={()=>window.open(msg.imageUrl,"_blank")} style={{maxWidth:"100%",maxHeight:220,borderRadius:br,display:"block",cursor:"pointer",objectFit:"cover"}}/></div>}
          {msg.type==="voice"&&<VoiceMessage url={msg.voiceUrl} dur={msg.dur} isMe={isUser} col={C.accent}/>}
          {msg.type!=="voice"&&(msg.text||(!msg.type||msg.type==="text"))&&(
            <div style={{padding:"10px 13px",borderRadius:msg.replyTo?`0 12px 12px ${isUser?"6px":"6px"}`:br,background:bg,border:brd,color:col,fontSize:13.5,lineHeight:1.6,fontWeight:isUser?600:400,backdropFilter:"blur(12px)",whiteSpace:"pre-wrap"}}>
              {msg.voice&&<span style={{fontSize:11,opacity:.6,marginBottom:4,display:"block"}}>🎤 голосовое</span>}
              {renderLinks(msg.text,isUser)}
              <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:3,marginTop:4}}>
                <span style={{fontSize:10,opacity:.5,color:col}}>{msg.time}</span>
                {ticks&&<span style={{fontSize:11,color:tickCol,fontWeight:msg.read?700:400,letterSpacing:-0.5}}>{ticks}</span>}
              </div>
            </div>
          )}
          {msg.type==="image"&&<div style={{fontSize:10,marginTop:3,opacity:.4,textAlign:isUser?"right":"left",color:C.text}}>{msg.time}</div>}
          {hasReactions&&(
            <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap",justifyContent:isUser?"flex-end":"flex-start"}}>
              {Object.entries(reactions).map(([e,n])=>(
                <button key={e} onClick={()=>onReact&&onReact(msg,e)} style={{padding:"2px 8px",borderRadius:20,border:`1px solid ${C.borderHi}`,background:C.accentDim,color:C.text,fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>
                  {e}{n>1&&<span style={{fontSize:10,fontWeight:800,color:C.accent}}>{n}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={e=>{e.stopPropagation();setReactOpen(p=>!p);}} style={{alignSelf:"flex-end",width:22,height:22,borderRadius:"50%",border:`1px solid ${C.border}`,background:"rgba(255,255,255,.05)",color:C.muted,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:isUser?0:4,marginRight:isUser?4:0,marginBottom:2,opacity:.55}}>😊</button>
      </div>

      {reactOpen&&(
        <div style={{position:"absolute",zIndex:300,bottom:36,left:isUser?"auto":38,right:isUser?4:"auto",background:"rgba(10,22,38,.97)",border:`1px solid ${C.border}`,borderRadius:24,padding:"8px 12px",display:"flex",gap:6,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          {REACTS.map(e=>(
            <button key={e} onClick={()=>{onReact&&onReact(msg,e);setReactOpen(false);}} style={{fontSize:20,background:"none",border:"none",cursor:"pointer",transition:"transform .12s"}}
              onMouseEnter={ev=>ev.currentTarget.style.transform="scale(1.35)"} onMouseLeave={ev=>ev.currentTarget.style.transform="scale(1)"}
            >{e}</button>
          ))}
        </div>
      )}

      {menuOpen&&(
        <div style={{position:"absolute",zIndex:300,bottom:40,left:isUser?"auto":46,right:isUser?4:"auto",background:"rgba(10,22,38,.97)",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.65)",minWidth:165}}>
          {[
            {ico:"↩️",lbl:"Ответить",fn:()=>{onReply&&onReply(msg);setMenuOpen(false);}},
            {ico:"📋",lbl:"Копировать",fn:()=>{try{navigator.clipboard.writeText(msg.text||"");}catch(x){}setMenuOpen(false);}},
            ...(isUser?[{ico:"🗑️",lbl:"Удалить",fn:()=>{onDelete&&onDelete(msg);setMenuOpen(false);},col:"#ef4444"}]:[]),
          ].map(it=>(
            <button key={it.lbl} onClick={it.fn}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",background:"none",border:"none",color:it.col||C.text,fontSize:14,cursor:"pointer",textAlign:"left"}}
              onMouseEnter={ev=>ev.currentTarget.style.background="rgba(255,255,255,.08)"}
              onMouseLeave={ev=>ev.currentTarget.style.background="none"}
            ><span>{it.ico}</span><span>{it.lbl}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(Bubble);
