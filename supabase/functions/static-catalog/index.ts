import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { createStripeClient } from "../_shared/stripe.ts";
import { StaticCatalogError, createStaticCheckout, deliverStaticCatalog, staticRequest } from "../_shared/static-catalog.ts";

Deno.serve(async req=>{
  const cors=buildCors(req);
  const json=(code:string,status:number)=>new Response(JSON.stringify({error:code,code}),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  if(req.method!=="POST")return json("method_not_allowed",405);
  try{
    const bearer=req.headers.get("Authorization");
    if(!bearer?.startsWith("Bearer "))return json("unauthorized",401);
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data,error}=await admin.auth.getUser(bearer.slice(7));
    if(error || !data.user)return json("unauthorized",401);
    const body=await staticRequest(req,["action","assetId","requestId","environment","termsAccepted","immediatePerformanceConsent","withdrawalLossAcknowledged","orderId"]);
    const deps={db:admin,stripe:()=>createStripeClient("sandbox"),env:(k:string)=>Deno.env.get(k)};
    if(body.action==="download"){
      if(Object.keys(body).some(k=>!["action","orderId"].includes(k)))return json("invalid_body",400);
      return await deliverStaticCatalog(deps,data.user.id,body.orderId,cors);
    }
    if(body.action==="checkout"){
      if(Object.hasOwn(body,"orderId"))return json("invalid_body",400);
      const result=await createStaticCheckout(deps,data.user.id,body);
      return new Response(JSON.stringify(result),{headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    return json("invalid_action",400);
  }catch(e){
    if(e instanceof StaticCatalogError)return json(e.code,e.status);
    console.error("static_catalog_failed",{name:e instanceof Error?e.name:"unknown"});
    return json("internal_error",500);
  }
});
