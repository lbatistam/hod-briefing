// Local preview only. No real storage, credentials or network access.
const demoStore={};
window.chrome={
 storage:{
  sync:{get:async d=>({...d,...demoStore}),set:async d=>Object.assign(demoStore,d),clear:async()=>{},remove:async()=>{}},
  local:{get:async()=>({}),set:async()=>{},remove:async()=>{}},
  onChanged:{addListener(){}}
 },
 runtime:{
  getURL:path=>"/"+path,
  onMessage:{addListener(){}},
  sendMessage:async()=>({ok:false,configured:false,error:"Prévia local: nenhuma API é chamada."})
 },
 tabs:{query:async()=>[{id:1}],sendMessage:async()=>({conversation:true,contact:"Contato de demonstração"})}
};
