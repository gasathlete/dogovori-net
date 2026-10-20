import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {validateSavedContent,stableSavedContent} from "./saved-content-input.ts";
const base={action:"create",id:"11111111-2222-4333-8444-555555555555",kind:"contract",title:"Тест",payload:{title:"Тест",clauses:[{body:"Текст"}]}};
Deno.test("saved content accepts bounded generated JSON, stable order",()=>{
 assertEquals(validateSavedContent(base)?.action,"create");assertEquals(stableSavedContent({b:2,a:1}),stableSavedContent({a:1,b:2}));
});
Deno.test("saved content refuses owner/provenance/payment fields and invalid IDs",()=>{
 for(const extra of [{user_id:base.id},{save_request_key:"a".repeat(64)},{team_id:base.id},{environment:"sandbox"},{product_entitlement_id:base.id}])assertEquals(validateSavedContent({...base,...extra}),null);
 assertEquals(validateSavedContent({...base,id:"bad"}),null);assertEquals(validateSavedContent({...base,folder_id:"bad"}),null);
});
Deno.test("saved content update requires revision; no client kind/source reassignment",()=>{
 const update={action:"update",id:base.id,payload:base.payload,expected_updated_at:"2026-10-20T12:00:00Z"};
 assertEquals(validateSavedContent(update)?.action,"update");assertEquals(validateSavedContent({...update,expected_updated_at:"bad"}),null);
 assertEquals(validateSavedContent({...update,source_id:"different"}),null);assertEquals(validateSavedContent({...update,kind:"template"}),null);
});
Deno.test("saved content refuses oversized, deep and prototype-shaped JSON",()=>{
 assertEquals(validateSavedContent({...base,payload:{text:"x".repeat(200001)}}),null);
 let deep:unknown="x";for(let i=0;i<30;i++)deep={child:deep};assertEquals(validateSavedContent({...base,payload:deep}),null);
 assertEquals(validateSavedContent({...base,payload:JSON.parse('{"__proto__":{"x":1}}')}),null);
 assertEquals(validateSavedContent({...base,payload:[]}),null);
});
