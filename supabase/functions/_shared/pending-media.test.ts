import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { parsePendingMedia } from "./pending-media.ts";

const U = "aaaaaaaa-0000-4000-8000-000000000001";

Deno.test("pending media marker: only own staging bucket, no traversal", () => {
  assertEquals(parsePendingMedia(`pending-media:partner-logos-pending/${U}/a1-b2.png`, "partner"),
    { bucket: "partner-logos-pending", path: `${U}/a1-b2.png` });
  assert(!parsePendingMedia(`pending-media:user-articles-pending/${U}/a.png`, "partner"));
  assert(!parsePendingMedia(`pending-media:partner-logos-pending/${U}/../x.png`, "partner"));
  assert(!parsePendingMedia(`pending-media:partner-logos-pending/${U}/a.svg`, "partner"));
  assert(!parsePendingMedia(`https://evil.example/a.png`, "article"));
  assert(!parsePendingMedia(`pending-media:partner-logos-pending/not-a-uuid/a.png`, "partner"));
});
