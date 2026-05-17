import { useState } from 'react';
import { C, glass } from '../tokens.js';
import { Fish, XIcon, User } from '../icons/index.jsx';
import { auth } from '../firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth';

export function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [resetSent, setResetSent] = useState(false);
  const errMap = {"auth/email-already-in-use":"Этот email уже зарегистрирован","auth/invalid-email":"Неверный формат email","auth/weak-password":"Пароль минимум 6 символов","auth/user-not-found":"Пользователь не найден","auth/wrong-password":"Неверный пароль","auth/invalid-credential":"Неверный email или пароль"};
  const submit = async () => {
    if (!email||!password){setError("Заполни все поля");return;}
    if (mode==="register"&&!name){setError("Введи имя");return;}
    setError(""); setLoading(true);
    try {
      if (mode==="register"){const c=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(c.user,{displayName:name});}
      else{await signInWithEmailAndPassword(auth,email,password);}
      onSuccess?.();
    } catch(e){setError(errMap[e.code]||e.message);}
    setLoading(false);
  };
  const sendReset = async () => {
    if (!email){setError("Введи email для сброса пароля");return;}
    setError(""); setLoading(true);
    try {
      await sendPasswordResetEmail(auth,email);
      setResetSent(true);
    } catch(e){setError(errMap[e.code]||"Ошибка отправки. Проверь email.");}
    setLoading(false);
  };
  const inp=(val,set,ph,type="text",onEnter=submit)=>(<input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&onEnter()} style={{width:"100%",padding:"13px 16px",borderRadius:12,background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,color:C.text,fontSize:15,outline:"none",marginBottom:10}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>);
  const header = (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center"}}><Fish size={18} color="#07111e"/></div>
        <span style={{fontSize:17,fontWeight:800,color:C.text}}>Егерь ИИ</span>
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer"}}><XIcon size={22} color={C.muted}/></button>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"fadeIn .2s ease"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...glass(),width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:24,animation:"slideUp .3s ease"}}>
        {header}
        {mode==="reset" ? (
          resetSent ? (
            <>
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>📧</div>
                <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:8}}>Письмо отправлено!</div>
                <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Проверь почту <span style={{color:C.accent}}>{email}</span> и перейди по ссылке для сброса пароля.</div>
              </div>
              <button onClick={()=>{setMode("login");setResetSent(false);}} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:15,fontWeight:800}}>
                Вернуться ко входу
              </button>
            </>
          ) : (
            <>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>Восстановление пароля</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.5}}>Введи email — пришлём ссылку для сброса пароля.</div>
              {inp(email,setEmail,"Email","email",sendReset)}
              {error&&<div style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#fca5a5",marginBottom:12}}>{error}</div>}
              <button onClick={sendReset} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:loading?C.surface:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:loading?C.muted:"#07111e",fontSize:15,fontWeight:800,marginBottom:10}}>
                {loading?"Отправка...":"Отправить письмо"}
              </button>
              <button onClick={()=>{setMode("login");setError("");}} style={{width:"100%",padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:C.muted,fontSize:13}}>
                ← Назад ко входу
              </button>
            </>
          )
        ) : (
          <>
            <div style={{display:"flex",background:"rgba(0,0,0,.3)",borderRadius:10,padding:3,marginBottom:16}}>
              {["login","register"].map(m=>(
                <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"9px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:mode===m?`linear-gradient(135deg,#1a8a50,${C.accent})`:"transparent",color:mode===m?"#07111e":C.muted,transition:"all .2s"}}>
                  {m==="login"?"Войти":"Регистрация"}
                </button>
              ))}
            </div>
            {mode==="register"&&inp(name,setName,"Твоё имя (позывной)")}
            {inp(email,setEmail,"Email","email")}
            {inp(password,setPassword,"Пароль","password")}
            {mode==="login"&&(
              <div style={{textAlign:"right",marginTop:-4,marginBottom:10}}>
                <button onClick={()=>{setMode("reset");setError("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.accent,padding:0}}>
                  Забыли пароль?
                </button>
              </div>
            )}
            {error&&<div style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#fca5a5",marginBottom:12}}>{error}</div>}
            <button onClick={submit} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:loading?C.surface:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:loading?C.muted:"#07111e",fontSize:15,fontWeight:800,boxShadow:loading?"none":`0 4px 20px ${C.accentGlow}`}}>
              {loading?"Загрузка...":mode==="login"?"Войти":"Создать аккаунт"}
            </button>
            <div style={{textAlign:"center",marginTop:12,fontSize:12,color:C.dimmer}}>
              Регистрация открывает чат рыбаков и публикацию отчётов
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RequireAuth({ user, onLogin, children }) {
  if (user) return children;
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16}}>
      <div style={{width:64,height:64,borderRadius:18,background:`linear-gradient(135deg,${C.accent},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 24px ${C.accentGlow}`}}>
        <User size={30} color="#07111e"/>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:17,fontWeight:800,color:C.text,marginBottom:6}}>Войдите в аккаунт</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Чтобы писать в чат и публиковать отчёты — нужна регистрация. Это бесплатно и займёт 30 секунд.</div>
      </div>
      <button onClick={onLogin} style={{padding:"14px 32px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,#1a8a50,${C.accent})`,color:"#07111e",fontSize:15,fontWeight:800,boxShadow:`0 4px 20px ${C.accentGlow}`}}>
        Войти / Зарегистрироваться
      </button>
    </div>
  );
}
