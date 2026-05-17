import React from 'react';
import { reportError } from '../lib/reportError.js';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("ErrorBoundary:", e, info); reportError(e, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{position:"fixed",inset:0,background:"#07111e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:20}}>🎣</div>
        <div style={{fontSize:22,fontWeight:800,color:"#e8f4f0",marginBottom:10}}>Что-то пошло не так</div>
        <div style={{fontSize:14,color:"rgba(232,244,240,.5)",marginBottom:28,maxWidth:320,lineHeight:1.6}}>
          Произошла ошибка в приложении. Попробуй перезагрузить — данные не потеряются.
        </div>
        <div style={{fontSize:12,color:"rgba(232,244,240,.25)",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"8px 14px",marginBottom:24,maxWidth:340,wordBreak:"break-all",fontFamily:"monospace"}}>
          {String(this.state.error?.message||this.state.error).slice(0,200)}
        </div>
        <button onClick={()=>window.location.reload()} style={{padding:"13px 32px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#1a7a4a,#2ecc71)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 20px rgba(46,204,113,.4)"}}>
          🔄 Перезагрузить
        </button>
        <button onClick={()=>this.setState({error:null})} style={{marginTop:12,padding:"10px 24px",borderRadius:14,border:"1px solid rgba(255,255,255,.1)",background:"none",color:"rgba(232,244,240,.5)",fontSize:13,cursor:"pointer"}}>
          Попробовать без перезагрузки
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
