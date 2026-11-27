import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  planBoundArtifact,
  planBoundExistence,
  planDeterministicRecovery,
} from "./recovery.ts";

Deno.test("първо изпълнение без обвързан артефакт генерира", () => {
  assertEquals(
    planBoundArtifact({ bound: { status: "none" }, isReplay: false }),
    { action: "generate" },
  );
});

Deno.test("несъвпадащ ключ е конфликт, не поднасяне", () => {
  assertEquals(
    planBoundArtifact({ bound: { status: "mismatch", reason: "digest_mismatch" }, isReplay: true }),
    { action: "conflict" },
  );
});

Deno.test("недостъпна справка води до изравняване", () => {
  assertEquals(
    planBoundArtifact({ bound: { status: "unavailable", reason: "lookup_failed" }, isReplay: true }),
    { action: "reconcile", reason: "artifact_lookup_failed" },
  );
});

Deno.test("записан резултат, различен от обвързания обект, е несъответствие", () => {
  assertEquals(
    planBoundArtifact({
      bound: { status: "match", bucket: "document-blanks", path: "request/op/a/x.docx" },
      priorRef: { bucket: "document-blanks", path: "request/other/x.docx" },
      isReplay: true,
    }),
    { action: "reconcile", reason: "result_ref_binding_mismatch" },
  );
});

Deno.test("доказано съществуващ обект се поднася със свеж подпис", () => {
  assertEquals(
    planBoundExistence("present", "document-blanks", "p.docx", true),
    { action: "serve_bound", bucket: "document-blanks", path: "p.docx" },
  );
});

Deno.test("неясно съществуване никога не се брои за наличен файл", () => {
  assertEquals(
    planBoundExistence("unknown", "document-blanks", "p.docx", true),
    { action: "reconcile", reason: "bound_artifact_unknown" },
  );
});

Deno.test("липсващ обект при повторение връща 'в ход', не ново генериране", () => {
  assertEquals(
    planBoundExistence("absent", "document-blanks", "p.docx", true),
    { action: "in_progress" },
  );
});

Deno.test("срив след качване преди обвързване се възстановява по детерминирания адрес", () => {
  assertEquals(planDeterministicRecovery("present", true), { action: "bind_deterministic" });
});

Deno.test("повторение без никакъв качен файл НЕ генерира втори път", () => {
  assertEquals(planDeterministicRecovery("absent", true), { action: "in_progress" });
  assertEquals(planDeterministicRecovery("unknown", true), {
    action: "reconcile",
    reason: "replay_artifact_unknown",
  });
  assertEquals(planDeterministicRecovery("absent", false), {
    action: "reconcile",
    reason: "replay_without_artifact",
  });
});

Deno.test("едновременни заявки по същия ключ стартират ТОЧНО едно генериране", () => {
  let generations = 0;
  // Първата заявка резервира (не е повторение) и генерира.
  const first = planBoundArtifact({ bound: { status: "none" }, isReplay: false });
  if (first.action === "generate") generations++;
  // Втората заявка вижда същия ключ като още резервиран: няма обвързан артефакт,
  // няма качен обект — единственият допустим изход е „в ход".
  const second = planBoundArtifact({ bound: { status: "none" }, isReplay: true });
  assertEquals(second, { action: "check_bound" });
  const secondFinal = planDeterministicRecovery("absent", true);
  if (secondFinal.action === "generate") generations++;
  assertEquals(secondFinal.action, "in_progress");
  assertEquals(generations, 1);
});

Deno.test("доказано отменена резервация (retry) се изпълнява наново", () => {
  // При доказана отмяна isReplay е false, така че пътят е нормално генериране.
  assertEquals(
    planBoundArtifact({ bound: { status: "none" }, isReplay: false }),
    { action: "generate" },
  );
});
