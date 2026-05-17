import { C, glass } from '../tokens.js';
import { Thermometer, Droplets, Wind, Waves } from '../icons/index.jsx';

export function Sparkline({ data, width=280, height=60, nowIdx }) {
  const min=Math.min(...data)-2, max=Math.max(...data)+2;
  const allPts = data.map((v,i)=>{ const x=(i/(data.length-1))*width, y=height-((v-min)/(max-min))*height; return `${x},${y}`; });
  const pts = allPts.join(" ");
  const fillPts = `0,${height} ${pts} ${width},${height}`;
  const dotIdx = nowIdx!=null ? nowIdx : data.length-1;
  const [dx,dy] = allPts[dotIdx].split(",");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.35"/><stop offset="100%" stopColor={C.accent} stopOpacity="0"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <polygon points={fillPts} fill="url(#spGrad)"/>
      <polyline points={pts} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)"/>
      <line x1={dx} y1="0" x2={dx} y2={height} stroke={C.accent} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.45"/>
      <circle cx={dx} cy={dy} r="4" fill={C.accent} style={{filter:`drop-shadow(0 0 6px ${C.accent})`}}/>
    </svg>
  );
}

export function BiteArc({ score=8 }) {
  const pct=score/10, R=52, cx=64, cy=64, sA=Math.PI*.75, eA=Math.PI*2.25, sw=eA-sA;
  const ang=sA+sw*pct, xy=(a)=>[cx+R*Math.cos(a),cy+R*Math.sin(a)];
  const [bx,by]=xy(sA),[ex,ey]=xy(ang),[fx,fy]=xy(eA);
  const large=sw*pct>Math.PI?1:0, tl=(eA-sA)>Math.PI?1:0;
  const col=score>=8?C.accent:score>=5?C.gold:"#ef4444";
  return (
    <svg width={128} height={96} viewBox="0 0 128 96">
      <defs><linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={col} stopOpacity="0.4"/><stop offset="100%" stopColor={col}/></linearGradient></defs>
      <path d={`M${bx},${by} A${R},${R} 0 ${tl},1 ${fx},${fy}`} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" strokeLinecap="round"/>
      {pct>0&&<path d={`M${bx},${by} A${R},${R} 0 ${large},1 ${ex},${ey}`} stroke="url(#arcGrad)" strokeWidth="10" fill="none" strokeLinecap="round" style={{filter:`drop-shadow(0 0 8px ${col})`}}/>}
      <text x={cx} y={cy-4} textAnchor="middle" fill={col} style={{fontSize:28,fontWeight:800,fontFamily:"'Bebas Neue',cursive",filter:`drop-shadow(0 0 10px ${col})`}}>{score}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fill={C.muted} style={{fontSize:9,letterSpacing:2}}>ИЗ 10</text>
    </svg>
  );
}

export function WPill({ Icon, val, label, color=C.accent, loading }) {
  return (
    <div style={{...glass(),padding:"10px 8px",flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <Icon size={16} color={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
      <span style={{fontSize:13,fontWeight:700,color:loading?C.dimmer:C.text}}>{loading?"…":val}</span>
      <span style={{fontSize:9,color:C.dimmer,letterSpacing:1.5,textTransform:"uppercase"}}>{label}</span>
    </div>
  );
}

export function WaveIcon({size=20}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 14 Q6 10 10 14 Q14 18 18 14 Q20 12 22 14" stroke={C.cyan} strokeWidth="2" strokeLinecap="round"/>
      <path d="M2 18 Q6 14 10 18 Q14 22 18 18 Q20 16 22 18" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}
