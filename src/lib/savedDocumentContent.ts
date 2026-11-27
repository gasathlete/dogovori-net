import {supabase} from "@/integrations/supabase/client";
import {assertNoRestrictedIdentifiers} from "@/lib/privacyGate";
import {invokeWithMarketingBonus} from "@/lib/marketingBonus";
export class SavedContentWriteError extends Error {
 constructor(readonly code:string){super(code==="revision_conflict"?"Документът е променен междувременно. Презаредете го, за да продължите.":"Не успяхме да запазим документа. Промените Ви остават тук.");}
}
export async function writeSavedDocumentContent(body:Record<string,unknown>, headers?:Record<string,string>):Promise<Record<string,unknown>&{id:string;updated_at:string}>{
 assertNoRestrictedIdentifiers([body.title??"",body.payload,body.source_id??""]);
 const {data,error}=await invokeWithMarketingBonus<{document?:Record<string,unknown>&{id:string;updated_at:string};error?:string}>("saved-document-content",{body,...(headers?{headers}:{})});
 let result=data;
 if(error){try{const c=(error as {context?:Response}).context;if(c&&typeof c.json==="function")result=await c.json();}catch{/* bounded error below */}}
 if(error||!result?.document?.id)throw new SavedContentWriteError(typeof result?.error==="string"?result.error:"save_failed");
 return result.document;
}
