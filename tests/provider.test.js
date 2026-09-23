const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
let attempts=0, failures=0, status=500, sent=[], options={};
// A resposta devolve uma pequena variação de flexão; isso não pode derrubar uma
// geração válida cuja conversa contenha os mesmos fatos.
const data={nome:"Pedro",perfil:{ocupacao:"Ator",situacao:"Por projetos",evidencia:"Sou ator e trabalho por projetos."},resumo:"Busca renda previsível para manter a carreira de ator.",topicos:[{tipo:"objetivo",texto:"Busca renda previsível",evidencia:"Busco uma renda previsível."}]};
const context={console,AbortController,performance,setTimeout:(fn,ms)=>setTimeout(fn,ms<=2000?0:ms),clearTimeout,importScripts(){},
 chrome:{runtime:{getURL:()=> "prompt",onMessage:{addListener(){}},onInstalled:{addListener(){}}},
 storage:{sync:{get:async d=>({...d,...options})},local:{get:async()=>({groqApiKey:"test-key-not-real"})}}},
 fetch:async (url,request)=>{
  if(url==="prompt")return {text:async()=>fs.readFileSync("briefing.md","utf8")};
  attempts++;sent.push(JSON.parse(request.body));
  if(failures-->0)return {ok:false,status,json:async()=>({error:{message:"test failure"}})};
  return {ok:true,json:async()=>({choices:[{finish_reason:"stop",message:{content:JSON.stringify(data)}}],usage:{total_tokens:99}})};
 }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("settings.js","utf8"),context);
vm.runInContext(fs.readFileSync("background.js","utf8")+"\nglobalThis.generate=callAi;",context);
(async()=>{
 const input="RESPOSTA DO LEAD: Sou ator e trabalho por projeto.\nRESPOSTA DO LEAD: Busco renda previsível.";
 options={retries:1,aiModel:"groq-gpt-oss-120b",reasoning:"high"};failures=1;
 const result=await context.generate(input);
 assert.equal(attempts,2);assert.equal(result.model,"groq-gpt-oss-120b");
 assert.equal(sent[0].reasoning_effort,"high");assert.equal(sent[0].max_completion_tokens,8192);
 assert.equal(sent[0].include_reasoning,false);assert.equal("reasoning_format" in sent[0],false);
 await assert.rejects(()=>context.generate(""),/Nenhuma conversa/);
 await assert.rejects(()=>context.generate("x".repeat(60001)),/Nenhum trecho foi omitido/);
 options={retries:2,aiModel:"groq-gpt-oss-120b",reasoning:"low"};failures=1;status=401;attempts=0;
 await assert.rejects(()=>context.generate(input),/test failure/);assert.equal(attempts,1);
 failures=0;attempts=0;const second=await context.generate(input);assert.equal(attempts,1);
 assert.equal(sent.at(-1).reasoning_effort,"low");assert.equal(second.data.topicos.length,1);
 console.log("Provider V1: GPT-OSS 120B, reasoning, retry 500, no retry 401, lock recovery, evidence filtering: OK");
})().catch(e=>{console.error(e);process.exitCode=1;});
