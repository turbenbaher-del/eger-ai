import { memo } from 'react';
import { C } from '../../tokens.js';

const DateDivider = memo(function DateDivider({ label }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0 10px",userSelect:"none"}}>
      <div style={{flex:1,height:1,background:C.border}}/>
      <span style={{fontSize:11,color:C.muted,fontWeight:600,padding:"3px 12px",borderRadius:20,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`}}>{label}</span>
      <div style={{flex:1,height:1,background:C.border}}/>
    </div>
  );
});

export default DateDivider;
