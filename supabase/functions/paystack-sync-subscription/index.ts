import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 try{
  const authHeader=req.headers.get("Authorization")??"";
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}}});
  const {data:auth}=await client.auth.getUser(); if(!auth?.user) return json({error:"Unauthorized"},401);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // SECURITY: manual/browser sync is read-only. It cannot create/update
  // subscriptions, premium entitlements, webhook events, rewards or profiles.
  // Signed Paystack webhook processing is the sole mutation authority.
  const {data:sub}=await admin.from("subscriptions").select("status,current_period_end,next_payment_date,paystack_subscription_code,updated_at").eq("user_id",auth.user.id).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  const {data:profile}=await admin.from("profiles").select("is_premium,premium_until").eq("user_id",auth.user.id).maybeSingle();
  const premiumActive = Boolean(profile?.is_premium && (!profile.premium_until || new Date(profile.premium_until).getTime() > Date.now()));
  const periodExpired = Boolean(sub?.current_period_end && new Date(sub.current_period_end).getTime() <= Date.now());
  const status = periodExpired && ["active","non-renewing","attention"].includes(sub?.status ?? "") ? "expired" : sub?.status ?? "none";
  return json({status,premium:premiumActive,premium_until:profile?.premium_until??null,next_payment_date:sub?.next_payment_date??null,source:"server_state",sync:"webhook_authoritative"});
 }catch(e){console.error("paystack-sync-subscription read error",e);return json({error:"Subscription status temporarily unavailable"},502)}
});