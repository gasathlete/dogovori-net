import {beforeEach,describe,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({invoke:vi.fn(),check:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:h.invoke}}}));
vi.mock("@/lib/privacyGate",()=>({assertNoRestrictedIdentifiers:h.check}));
import {writeSavedDocumentContent} from "@/lib/savedDocumentContent";
const body={action:"create",id:"11111111-2222-4333-8444-555555555555",kind:"contract",title:"Тест",payload:{title:"Тест"}};
beforeEach(()=>{h.invoke.mockReset();h.check.mockReset();});
describe("controlled saved content client",()=>{
 it("pins the captured owner authorization outside the persisted body",async()=>{
  h.invoke.mockResolvedValue({data:{document:{id:body.id,updated_at:"2026-10-20T12:00:00Z"}},error:null});
  const headers={Authorization:"Bearer captured-owner-token"};
  expect((await writeSavedDocumentContent(body,headers)).id).toBe(body.id);
  expect(h.invoke).toHaveBeenCalledWith("saved-document-content",{body,headers});
  expect(body).not.toHaveProperty("Authorization");expect(body).not.toHaveProperty("user_id");
 });
 it("checks local restricted identifiers before any request",async()=>{
  h.check.mockImplementation(()=>{throw new Error("blocked");});
  await expect(writeSavedDocumentContent(body)).rejects.toThrow("blocked");
  expect(h.invoke).not.toHaveBeenCalled();
 });
 it("keeps revision conflicts distinct for the editor",async()=>{
  h.invoke.mockResolvedValue({data:null,error:{context:{json:async()=>({error:"revision_conflict"})}}});
  await expect(writeSavedDocumentContent(body)).rejects.toMatchObject({code:"revision_conflict"});
 });
 it("a missing saved row is not reported as success",async()=>{
  h.invoke.mockResolvedValue({data:{},error:null});
  await expect(writeSavedDocumentContent(body)).rejects.toMatchObject({code:"save_failed"});
 });
});
