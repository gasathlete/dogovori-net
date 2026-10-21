"""Run against an isolated PostgreSQL database loaded with deployed functions.
Requires MARKETING_BONUS_TEST_SOCKET and local port 55439; refuses MAIN.
No auth email calls, model calls, payment calls or production data.
"""
import concurrent.futures
import json
import os
import subprocess
import uuid

socket = os.environ.get("MARKETING_BONUS_TEST_SOCKET", "")
if not socket.startswith("/tmp/marketing-bonus/"):
    raise SystemExit("An isolated local test socket is required")

def sql(statement, owner=None, role=None, failure=False):
    prefix = ""
    if owner:
        prefix += f"SET request.jwt.claim.sub='{owner}';"
    if role:
        prefix += f"SET ROLE {role};"
    run = subprocess.run(["psql", "-h", socket, "-p", "55439", "-U", "bonus_test", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", prefix + statement], capture_output=True, text=True)
    if failure:
        assert run.returncode != 0, "Expected server rejection"
        return
    assert run.returncode == 0, run.stderr
    return run.stdout.strip()

def new_user():
    user = str(uuid.uuid4())
    sql(f"INSERT INTO auth.users(id,email) VALUES('{user}','synthetic@example.invalid')")
    return user

def balance(user):
    return int(sql(f"SELECT topup_ops_balance FROM public.download_quota WHERE user_id='{user}'"))

def claim(user, accept=True, event=None, version="2026-10-21"):
    return json.loads(sql(f"SELECT public.claim_marketing_bonus({'true' if accept else 'false'},'{event or uuid.uuid4()}','{version}')", user, "authenticated"))

def consent(user, granted):
    sql(f"INSERT INTO public.user_consents(user_id,consent_type,document_version,granted,consent_event_id) VALUES('{user}','marketing','2026-10-21',{'true' if granted else 'false'},'{uuid.uuid4()}')", user, "authenticated")

user = new_user()
assert balance(user) == 0
assert sql(f"SELECT public.free_ops_cap('{user}')") == "2"
consent(user, False)
assert balance(user) == 0
assert json.loads(sql("SELECT public.marketing_bonus_status()", user, "authenticated"))["eligible"] is True
print("PASS signup without marketing remains valid, baseline 2, no starter bonus")

opted_in = new_user()
consent(opted_in, True)
assert balance(opted_in) == 3
assert sql(f"SELECT marketing_bonus_claimed_at IS NOT NULL FROM public.download_quota WHERE user_id='{opted_in}'") == "t"
print("PASS signup explicit consent grants configured 5-2 exactly once")

sql(f"SELECT public.claim_marketing_bonus(false,'{uuid.uuid4()}','2026-10-21')", user, "authenticated", failure=True)
sql(f"SELECT public.claim_marketing_bonus(true,'{uuid.uuid4()}','old-version')", user, "authenticated", failure=True)
assert balance(user) == 0
event = str(uuid.uuid4())
assert claim(user, event=event)["granted"] is True
assert claim(user, event=event)["granted"] is False
assert claim(user)["already_claimed"] is True
assert balance(user) == 3
print("PASS later claim, false/stale rejection, retry and duplicate protection")

consent(user, False)
assert balance(user) == 3
consent(user, True)
assert balance(user) == 3
assert json.loads(sql("SELECT public.marketing_bonus_status()", user, "authenticated"))["eligible"] is False
print("PASS revoke preserves credits; re-enable never regrants")

legacy = new_user()
sql(f"UPDATE public.download_quota SET marketing_bonus_legacy=true,topup_ops_balance=17 WHERE user_id='{legacy}'")
assert sql(f"SELECT public.free_ops_cap('{legacy}')") == "5"
assert claim(legacy)["already_claimed"] is True
consent(legacy, True)
assert balance(legacy) == 17
print("PASS historical starter respected without resetting balance")

concurrent_user = new_user()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    receipts = list(pool.map(lambda _: claim(concurrent_user), range(8)))
assert sum(r["granted"] for r in receipts) == 1
assert balance(concurrent_user) == 3
assert sql(f"SELECT count(*) FROM public.user_consents WHERE user_id='{concurrent_user}' AND granted") == "1"
race = new_user()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    a = pool.submit(consent, race, True)
    b = pool.submit(claim, race)
    a.result(); b.result()
assert balance(race) == 3
print("PASS eight concurrent claims and signup-versus-claim race grant once")

conflict = new_user()
same = str(uuid.uuid4())
sql(f"INSERT INTO public.user_consents(user_id,consent_type,document_version,granted,consent_event_id) VALUES('{conflict}','marketing','2026-10-21',false,'{same}')")
sql(f"SELECT public.claim_marketing_bonus(true,'{same}','2026-10-21')", conflict, "authenticated", failure=True)
assert balance(conflict) == 0
sql(f"UPDATE public.download_quota SET marketing_bonus_claimed_at=now() WHERE user_id='{conflict}'", conflict, "authenticated", failure=True)
sql("SELECT public.marketing_bonus_status()", failure=True)
print("PASS consent event collision cannot forge grant; client marker and anonymous access denied")

for source in ["free", "pro"]:
    chat = new_user()
    consent(chat, True)
    sql(f"UPDATE public.download_quota SET ai_messages_used=3,plan={'\'pro\'' if source == 'pro' else '\'free\''},pro_monthly_used=50,plan_ops_cap=50 WHERE user_id='{chat}'")
    op = str(uuid.uuid4())
    reserve = f"SELECT public.assistant_turn_reserve('{op}','{chat}','{'a'*64}',null,'platform_help',true,'{source}',null,180,'{{}}',3)"
    result = json.loads(sql(reserve))
    assert result["status"] == "reserved", result
    assert balance(chat) == 2
    assert json.loads(sql(reserve))["status"] in ["in_progress", "reserved"]
    assert balance(chat) == 2
    restored = json.loads(sql(f"SELECT public.assistant_turn_cancel('{op}','{chat}','test')"))
    assert restored["status"] == "cancelled", restored
    assert balance(chat) == 3
    sql(f"SELECT public.assistant_turn_cancel('{op}','{chat}','replay')")
    assert balance(chat) == 3
print("PASS free/pro assistant consumes one bonus and cancelled replay restores once")
wave = new_user()
sql(f"UPDATE public.download_quota SET monthly_total_used=2 WHERE user_id='{wave}'")
batch = str(uuid.uuid4())
denied = json.loads(sql(f"SELECT public.charge_corrections_wave('{wave}','{batch}',1)"))
assert denied["ok"] is False and denied["reason"] == "insufficient_quota", denied
assert claim(wave)["granted"] is True
assert json.loads(sql(f"SELECT public.charge_corrections_wave('{wave}','{batch}',1)"))["ok"] is True
assert balance(wave) == 2
sql(f"SELECT public.charge_corrections_wave('{wave}','{batch}',1)")
assert balance(wave) == 2
op = str(uuid.uuid4())
sql("SET request.jwt.claim.role='service_role'")
reserve = f"SET request.jwt.claim.role='service_role';SELECT public.quota_wave_reserve('{op}','{wave}','analysis','test',null,null,null,'{'b'*64}',1,300)"
assert json.loads(sql(reserve))["status"] == "reserved"
assert balance(wave) == 1
sql(reserve)
assert balance(wave) == 1
print("PASS exhausted correction/wave claims and replays use one authoritative bonus pool")
print("ALL isolated server integration assertions passed")