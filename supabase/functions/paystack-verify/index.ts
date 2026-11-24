import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 try{
  const authHeader=req.headers.get("Authorization")??"";
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}}});
  const {data:auth}=await client.auth.getUser(); if(!auth?.user) return json({error:"Unauthorized"},401);
  const raw=await req.text(); let reference:string|undefined; if(raw){try{reference=JSON.parse(raw)?.reference}catch{ /* ignore: best effort */ }}
  if(!reference) reference=new URL(req.url).searchParams.get("reference")??undefined;
  if(!reference||reference.length>160||!/^htx_[A-Za-z0-9._-]+$/.test(reference)) return json({error:"Invalid reference"},400);
  const key=Deno.env.get("PAYSTACK_SECRET_KEY"); if(!key) throw new Error("Payment provider unavailable");
  const r=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${key}`}});
  const v=await r.json().catch(()=>({})); if(!r.ok||v?.status===false) return json({error:"Verification unavailable"},502);
  const d=v?.data; if(d?.reference!==reference) return json({error:"Reference mismatch"},400);
  if(d?.metadata?.user_id!==auth.user.id) return json({error:"User mismatch"},403);
  // SECURITY: browser verification is observational only. Premium grants,
  // subscription mutations and referral rewards are webhook-authoritative.
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:profile}=await admin.from("profiles").select("is_premium,premium_until").eq("user_id",auth.user.id).maybeSingle();
  const premiumActive = Boolean(profile?.is_premium && (!profile.premium_until || new Date(profile.premium_until).getTime() > Date.now()));
  const activation = premiumActive ? "active" : profile?.is_premium ? "expired" : "awaiting_webhook";
  return json({provider_status:d?.status??"unknown",premium:premiumActive,premium_until:profile?.premium_until??null,activation});
 }catch(e){console.error("paystack-verify status error",e);return json({error:"Payment verification temporarily unavailable"},502)}
});