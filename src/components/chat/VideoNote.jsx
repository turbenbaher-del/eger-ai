import { memo, useRef, useState } from 'react';
import { C } from '../../tokens.js';
import { PlayIcon } from '../../icons/index.jsx';

function VideoNote({ url, isMe, col }) {
  const vRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const SIZE = 148;
  const toggle = () => {
    const v = vRef.current; if(!v) return;
    if(v.paused){ v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };
  const onTime = () => {
    const v = vRef.current; if(!v||!v.duration) return;
    setProgress(v.currentTime/v.duration);
  };
  const onEnd = () => { setPlaying(false); setProgress(0); };
  const circ = 2*Math.PI*(SIZE/2-4);
  return (
    <div style={{position:"relative",width:SIZE,height:SIZE,cursor:"pointer"}}>
      <svg style={{position:"absolute",inset:0,transform:"rotate(-90deg)"}} width={SIZE} height={SIZE}>
        <circle cx={SIZE/2} cy={SIZE/2} r={SIZE/2-4} fill="none" stroke={isMe?C.blue:col} strokeWidth={3} strokeOpacity={.25}/>
        <circle cx={SIZE/2} cy={SIZE/2} r={SIZE/2-4} fill="none" stroke={isMe?C.blue:col} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={circ*(1-progress)} style={{transition:"stroke-dashoffset .1s linear"}}/>
      </svg>
      <div style={{position:"absolute",inset:4,borderRadius:"50%",overflow:"hidden",background:"#000"}}
        onClick={e=>{e.stopPropagation();toggle();}}>
        <video ref={vRef} src={url} playsInline style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
          onTimeUpdate={onTime} onEnded={onEnd}/>
      </div>
      {!playing&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
        <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <PlayIcon size={16} color="#fff" style={{marginLeft:3}}/>
        </div>
      </div>}
    </div>
  );
}

export default memo(VideoNote);
