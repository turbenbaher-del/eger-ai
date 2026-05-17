import { useState } from 'react';
import { C } from '../tokens.js';

export default function OnboardingModal({ onDone }) {
  const [step, setStep] = useState(0);
  const steps = [
    {emoji:"🎣",title:"Дневник уловов",desc:"Добавляй уловы с фото, весом и местом — следи за своим прогрессом и получай значки"},
    {emoji:"🤖",title:"ИИ-помощник Егерь",desc:"Анализирует клёв, давление, луну и погоду — спроси когда и где лучше ловить"},
    {emoji:"📍",title:"Карта и рейтинг",desc:"Находи лучшие точки ловли, делись уловами с сообществом и попадай в топ рыбаков"},
  ];
  const cur = steps[step];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(7,17,30,.98)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,maxWidth:430,margin:"0 auto"}}>
      <div style={{fontSize:84,marginBottom:28,animation:"fabPulse 2.5s ease infinite"}}>{cur.emoji}</div>
      <div style={{fontSize:26,fontWeight:800,color:C.text,textAlign:"center",marginBottom:14,fontFamily:"'Bebas Neue',cursive",letterSpacing:1}}>{cur.title}</div>
      <div style={{fontSize:16,color:C.muted,textAlign:"center",lineHeight:1.65,marginBottom:44,maxWidth:300}}>{cur.desc}</div>
      <div style={{display:"flex",gap:8,marginBottom:36}}>
        {steps.map((_,i)=>(
          <div key={i} style={{width:i===step?30:8,height:8,borderRadius:4,background:i===step?C.accent:C.surface,transition:"width .3s ease"}}/>
        ))}
      </div>
      {step<steps.length-1?(
        <button onClick={()=>setStep(s=>s+1)} style={{width:"100%",maxWidth:320,padding:"16px",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,border:"none",borderRadius:20,color:"#07111e",fontSize:16,fontWeight:800,cursor:"pointer",letterSpacing:.5}}>
          Далее →
        </button>
      ):(
        <button onClick={onDone} style={{width:"100%",maxWidth:320,padding:"16px",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,border:"none",borderRadius:20,color:"#07111e",fontSize:16,fontWeight:800,cursor:"pointer",letterSpacing:.5}}>
          🎣 Начать ловить!
        </button>
      )}
      <button onClick={onDone} style={{marginTop:14,background:"none",border:"none",color:C.dimmer,fontSize:12,cursor:"pointer"}}>Пропустить</button>
    </div>
  );
}
