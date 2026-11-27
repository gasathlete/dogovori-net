/** Controlled saved-document JSON persistence; no model, quota, payment or file upload. */
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {buildCors} from "../_shared/cors.ts";
import {isNewProcessingOpen,newProcessingClosedResponse} from "../_shared/new-processing-gate.ts";
import {restrictedIdentifierBlock} from "../_shared/text-identifier-gate.ts";
import {checkRateLimitStrict} from "../_shared/rate-limit.ts";
import {validateSavedContent,stableSavedContent} from "../_shared/saved-content-input.ts";
Deno.serve(async(req)=>{
 const cors=buildCors(req);
 const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json(405,{error:"method_not_allowed"});
 try {
  if(!isNewProcessingOpen("document_content_save"))return newProcessingClosedResponse("document_content_save",cors);
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json(401,{error:"Unauthorized"});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:u,error:authErr}=await admin.auth.getUser(auth.slice(7));
  if(authErr||!u?.user)return json(401,{error:"Unauthorized"});const userId=u.user.id;
  const body=await req.text();if(body.length>250000)return json(413,{error:"body_too_large"});
  let raw:unknown;try{raw=JSON.parse(body);}catch{return json(400,{error:"invalid_body"});}
  const v=validateSavedContent(raw);if(!v)return json(400,{error:"invalid_body"});
  const blocked=restrictedIdentifierBlock([v.title??"",v.payload,v.source_id??""],cors);if(blocked)return blocked;
  const rl=await checkRateLimitStrict("saved-content:"+userId,30,600);
  if(!rl.ok)return json(rl.unavailable?503:429,{error:rl.unavailable?"rate_limit_unavailable":"rate_limited"});
  for(const [field,table] of [["folder_id","folders"],["contact_id","contacts"]] as const){
   const id=v[field];if(!id)continue;
   let q=admin.from(table).select("id").eq("id",id).eq("user_id",userId);
   if(table==="contacts")q=q.is("deleted_at",null);
   const {data:owned,error}=await q.maybeSingle();if(error)return json(503,{error:"reference_unavailable"});
   if(!owned)return json(403,{error:"reference_not_owned"});
  }
  const {data:current,error:readErr}=await admin.from("saved_documents").select("*").eq("id",v.id).maybeSingle();
  if(readErr)return json(503,{error:"read_unavailable"});
  if(current&&current.user_id!==userId)return json(404,{error:"not_found"});
  const wanted={kind:v.kind??null,title:v.title??null,payload:v.payload,source_id:v.source_id??null,folder_id:v.folder_id??null,contact_id:v.contact_id??null};
  const matches=(row:Record<string,unknown>)=>stableSavedContent({kind:row.kind,title:row.title,payload:row.payload,source_id:row.source_id??null,folder_id:row.folder_id??null,contact_id:row.contact_id??null})===stableSavedContent(wanted);
  if(v.action==="create"){
   if(current)return matches(current)?json(200,{document:current,replayed:true}):json(409,{error:"id_conflict"});
   const {data:created,error}=await admin.from("saved_documents").insert({id:v.id,user_id:userId,...wanted}).select("*").single();
   if(error){
    if(error.code==="23505"){
     const {data:again,error:e}=await admin.from("saved_documents").select("*").eq("id",v.id).eq("user_id",userId).maybeSingle();
     if(!e&&again&&matches(again))return json(200,{document:again,replayed:true});
     return json(409,{error:"id_conflict"});
    }
    return json(500,{error:"save_failed"});
   }
   return json(201,{document:created,replayed:false});
  }
  if(!current)return json(404,{error:"not_found"});
  if(Date.parse(current.updated_at)!==Date.parse(v.expected_updated_at!))return json(409,{error:"revision_conflict"});
  const patch:Record<string,unknown>={payload:v.payload};
  for(const k of ["title","folder_id","contact_id"] as const)if(v[k]!==undefined)patch[k]=v[k];
  const {data:updated,error}=await admin.from("saved_documents").update(patch).eq("id",v.id).eq("user_id",userId).eq("updated_at",v.expected_updated_at!).select("*").maybeSingle();
  if(error)return json(500,{error:"save_failed"});
  if(!updated)return json(409,{error:"revision_conflict"});
  return json(200,{document:updated});
 }catch(e){console.error("saved-document-content",e instanceof Error?e.name:"error");return json(500,{error:"internal_error"});}
});
