/** Bounded JSON contract for controlled saved-content writes. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type SavedContentInput={action:"create"|"update";id:string;title?:string;payload:Record<string,unknown>;kind?:"contract";source_id?:string|null;folder_id?:string|null;contact_id?:string|null;expected_updated_at?:string};
export function validateSavedContent(raw:unknown):SavedContentInput|null {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const b=raw as Record<string,unknown>;
 if(b.action!=="create"&&b.action!=="update")return null;
 const keys=b.action==="create"?["action","id","title","payload","kind","source_id","folder_id","contact_id"]:["action","id","title","payload","folder_id","contact_id","expected_updated_at"];
 if(Object.keys(b).some(k=>!keys.includes(k))||typeof b.id!=="string"||!UUID.test(b.id))return null;
 if(b.action==="create"&&(b.kind!=="contract"||typeof b.title!=="string"))return null;
 if(b.title!==undefined&&(typeof b.title!=="string"||!b.title.trim()||b.title.length>300))return null;
 if(!b.payload||typeof b.payload!=="object"||Array.isArray(b.payload))return null;
 let nodes=0;const pending:[unknown,number][]=[[b.payload,0]];
 while(pending.length){const [v,d]=pending.pop()!;if(++nodes>15000||d>24)return null;
  if(v&&typeof v==="object"){for(const [k,x] of Object.entries(v)){if(["__proto__","prototype","constructor"].includes(k))return null;pending.push([x,d+1]);}}
  else if(typeof v==="number"&&!Number.isFinite(v))return null;
 }
 if(JSON.stringify(b.payload).length>200000)return null;
 for(const k of ["folder_id","contact_id"])if(b[k]!==undefined&&b[k]!==null&&(typeof b[k]!=="string"||!UUID.test(b[k] as string)))return null;
 if(b.source_id!==undefined&&b.source_id!==null&&(typeof b.source_id!=="string"||b.source_id.length>200))return null;
 if(b.action==="update"&&(typeof b.expected_updated_at!=="string"||!Number.isFinite(Date.parse(b.expected_updated_at))))return null;
 return {...b,id:b.id.toLowerCase(),...(b.title===undefined?{}:{title:(b.title as string).trim()})} as SavedContentInput;
}
export function stableSavedContent(value:unknown):string {
 if(Array.isArray(value))return "["+value.map(stableSavedContent).join(",")+"]";
 if(value&&typeof value==="object"){const v=value as Record<string,unknown>;return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableSavedContent(v[k])).join(",")+"}";}
 return JSON.stringify(value??null);
}
