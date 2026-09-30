import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import ResetPasswordPage from "@/pages/ResetPassword";
const mocks=vi.hoisted(()=>({updateUser:vi.fn(),getUser:vi.fn(),getSession:vi.fn(),reauthenticate:vi.fn(),navigate:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock("react-router-dom",()=>({useNavigate:()=>mocks.navigate}));
vi.mock("@/components/Header",()=>({Header:()=>null}));
vi.mock("@/components/Seo",()=>({Seo:()=>null}));
vi.mock("sonner",()=>({toast:{success:mocks.success,error:mocks.error}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{...mocks,onAuthStateChange:()=>({data:{sub:{},subscription:{unsubscribe:vi.fn()}}})}}}));
describe("password change authentication boundary",()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();window.history.replaceState({},"","/reset-password");mocks.getSession.mockResolvedValue({data:{session:{user:{id:"test"}}},error:null});mocks.getUser.mockResolvedValue({data:{user:{id:"test"}},error:null});mocks.updateUser.mockResolvedValue({error:null});mocks.reauthenticate.mockResolvedValue({error:null});});
  afterEach(()=>vi.useRealTimers());
  const mount=async()=>{render(<ResetPasswordPage/>);await act(async()=>{await Promise.resolve();});};
  const submit=async()=>{fireEvent.change(screen.getByLabelText("Нова парола"),{target:{value:"synthetic-new-password"}});await act(async()=>{fireEvent.submit(screen.getByRole("button",{name:"Запази"}).closest("form")!);});};
  it("does not manufacture a session after the timeout",async()=>{
    mocks.getSession.mockResolvedValue({data:{session:null},error:null});await mount();await act(async()=>vi.advanceTimersByTime(3000));expect(screen.getByText(/Линкът за възстановяване е невалиден/)).toBeInTheDocument();expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("verifies with Auth before updating and blocks revoked sessions",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:null},error:{message:"revoked"}});await mount();await submit();expect(mocks.updateUser).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();
  });
  it("supports server-required reauthentication without automatically sending a message",async()=>{
    mocks.updateUser.mockResolvedValueOnce({error:{code:"reauthentication_needed",message:"reauthentication required"}});await mount();await submit();expect(screen.getByLabelText("Код за потвърждение")).toBeInTheDocument();expect(mocks.reauthenticate).not.toHaveBeenCalled();
    await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Изпрати код"}));});expect(mocks.reauthenticate).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Код за потвърждение"),{target:{value:"12345678"}});await submit();expect(mocks.updateUser).toHaveBeenLastCalledWith({password:"synthetic-new-password",nonce:"12345678"});expect(mocks.navigate).toHaveBeenCalledWith("/account");
  });
  it("clears busy on a network failure and permits retry",async()=>{
    mocks.updateUser.mockRejectedValueOnce(new Error("network"));await mount();await submit();expect(screen.getByRole("button",{name:"Запази"})).not.toBeDisabled();expect(mocks.navigate).not.toHaveBeenCalled();await submit();expect(mocks.navigate).toHaveBeenCalledWith("/account");
  });
});
