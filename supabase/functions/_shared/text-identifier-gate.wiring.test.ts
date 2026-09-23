/**
 * Пряко извикване на функция от браузъра или от друг клиент трябва да срещне
 * преградата ПРЕДИ квота, платежно намерение, заявка към доставчик или запис на
 * работа. Тестът чете кода на всяка функция и проверява реда — мрежово тих е.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ROOT = new URL("../", import.meta.url);

// Функция -> първото действие, което НЕ бива да се случва преди преградата.
const ROUTES: Array<[string, string]> = [
  ["generate-contract", 'await import("../_shared/quota-ledger.ts")'],
  ["generate-job", ".insert({"],
  ["analyze-contract", 'await import("../_shared/quota-ledger.ts")'],
  ["correct-uploaded", "await reserveDocumentOperation(ledger"],
  ["negotiation-strategy", "await reserveDocumentOperation(ledger"],
  ["create-product-checkout", "createStripeClient(environment)"],
  ["fulfill-product", 'admin.rpc("claim_product_job"'],
  ["refine-product", 'admin.rpc("begin_product_result_refinement"'],
  ["apply-corrections", "await reserveQuotaWave(ledgerDb"],
  ["refine-contract", "await reserveQuota(ledgerDb"],
  ["build-custom-contract", "await reserveQuotaNoCharge(ledgerDb"],
  ["generate-linked-document", "await reserveDocumentOperation(ledger"],
  ["review-document", "await reserveReviewOperation(admin"],
  ["assistant-chat-anon", "await reserveAnonDelivery(ledger"],
  ["assistant-chat", "await reserveTurn(admin"],
  ["draft-sync", ".insert(insert)"],
  ["draft-claim", "await ensureSavedDocument("],
  ["assistant-edit", '"assistant_edit_proposal_action"'],
  ["admin-generate-article", "await retrieveLegalContext("],
  ["simulation-run", '.from("ai_simulation_sessions")'],
];

for (const [route, marker] of ROUTES) {
  Deno.test(`${route}: преградата е преди „${marker}“`, async () => {
    const src = await Deno.readTextFile(new URL(`${route}/index.ts`, ROOT));
    assert(src.includes("text-identifier-gate.ts"), `${route} не внася преградата`);
    const gate = Math.min(
      ...["restrictedIdentifierBlock(", "findRestrictedIdentifierKindsDeep("]
        .map((needle) => src.indexOf(needle, src.indexOf("serve")))
        .filter((i) => i > 0),
    );
    const action = src.indexOf(marker);
    assert(gate > 0 && Number.isFinite(gate), `${route}: преградата не се извиква`);
    assert(action > 0, `${route}: липсва очакваното действие „${marker}“`);
    assert(gate < action, `${route}: преградата е СЛЕД ${marker} (${gate} > ${action})`);
  });

  Deno.test(`${route}: блокираният отговор не съдържа стойности`, async () => {
    const src = await Deno.readTextFile(new URL(`${route}/index.ts`, ROOT));
    assert(
      !/restrictedIdentifier[A-Za-z]*\([^)]*JSON\.stringify/.test(src),
      `${route}: възможно изнасяне на сурова стойност в отговор`,
    );
  });
}

/* ------- Поправени редове след независим преглед на разликите ------------- */

async function read(route: string): Promise<string> {
  return await Deno.readTextFile(new URL(`${route}/index.ts`, ROOT));
}

function firstGate(src: string): number {
  return Math.min(
    ...["restrictedIdentifierBlock(", "findRestrictedIdentifierKindsDeep("]
      .map((needle) => src.indexOf(needle, src.indexOf("serve")))
      .filter((i) => i > 0),
  );
}

Deno.test("draft-claim: преградата е преди присвояването и ротацията на токена", async () => {
  const src = await read("draft-claim");
  const gate = firstGate(src);
  for (const marker of ["updateGuarded(", "generateClaimToken(", "claimFilters("]) {
    const at = src.indexOf(marker);
    if (at > 0) assert(gate < at, `draft-claim: преградата е СЛЕД ${marker}`);
  }
});

Deno.test("simulation-run: преградата е преди обновяване на състоянието на сесия", async () => {
  const src = await read("simulation-run");
  const gate = firstGate(src);
  const at = src.indexOf('status: "running"');
  assert(at > 0, "липсва обновяването на състоянието");
  assert(gate < at, "simulation-run: преградата е СЛЕД обновяването на състоянието");
  // Има отделна преграда след разрешените четения (сценарий и предишни ходове).
  assert(
    src.indexOf("prior_turns:") > 0,
    "simulation-run: прочетените предишни ходове не минават през преградата",
  );
});

Deno.test("assistant-chat: преградата на новото съобщение е преди guardIllegalContent", async () => {
  const src = await read("assistant-chat");
  const gate = firstGate(src);
  const at = src.indexOf("guardIllegalContent(");
  assert(at > 0, "липсва guardIllegalContent");
  assert(gate < at, "assistant-chat: преградата е СЛЕД guardIllegalContent");
});
