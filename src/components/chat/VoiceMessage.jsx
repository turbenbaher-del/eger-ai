import { memo, useRef, useState } from 'react';
import { C } from '../../tokens.js';
import { PlayIcon, PauseIcon } from '../../icons/index.jsx';

function VoiceMessage({ url, dur, isMe, col }) {
  const aRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const [cur, setCur] = useState(0);
  const [total, setTotal] = useState(dur||0);
  const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  const BARS = [3,5,9,14,19,22,17,11,6,8,13,20,24,16,10,6,12,18,14,8];
  const toggle = () => {
    const a = aRef.current; if(!a) return;
    if(a.paused){ a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:24,background:isMe?`linear-gradient(135deg,#1a5276,${C.blue})`:"rgba(255,255,255,0.08)",border:isMe?"none":`1px solid ${C.border}`,minWidth:200,maxWidth:260}}>
      <audio ref={aRef} src={url}
        onLoadedMetadata={e=>setTotal(e.target.duration)}
        onTimeUpdate={e=>{const a=e.target;if(a.duration){setProg(a.currentTime/a.duration);setCur(a.currentTime);}}}
        onEnded={()=>{setPlaying(false);setProg(0);setCur(0);}}/>
      <button onClick={toggle} style={{width:38,height:38,borderRadius:"50%",border:"none",background:isMe?C.blue:col,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {playing?<PauseIcon size={13} color="#fff"/>:<PlayIcon size={13} color="#fff" style={{marginLeft:2}}/>}
      </button>
      <div style={{flex:1}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:2,height:22,marginBottom:4}}>
          {BARS.map((h,i)=><div key={i} style={{width:2.5,height:h,borderRadius:2,background:prog*BARS.length>i?(isMe?"rgba(255,255,255,.9)":col):"rgba(255,255,255,.2)",transition:"background .1s"}}/>)}
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,.45)"}}>{fmt(cur)} / {fmt(total)}</div>
      </div>
    </div>
  );
}

export default memo(VoiceMessage);
