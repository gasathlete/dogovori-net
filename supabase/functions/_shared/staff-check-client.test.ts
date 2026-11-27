import { assert } from "jsr:@std/assert@1";

// is_staff EXECUTE е отнет от authenticated: sandbox проверката трябва да ползва
// service-role клиент и userId от проверения JWT, не потребителския клиент.
for (const [fn, client] of [
  ["create-checkout", "staffClient"],
  ["create-strict-unlock-checkout", "staffClient"],
  ["create-product-checkout", "admin"],
] as const) {
  Deno.test(`${fn}: staff проверката минава със service-role клиент`, async () => {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    assert(src.includes(`assertEnvironmentAllowed(${client}, environment, userId)`), fn);
    const decl = src.indexOf(`const ${client} = createClient(`);
    const svc = src.indexOf(`SUPABASE_SERVICE_ROLE_KEY`, decl);
    const call = src.indexOf(`assertEnvironmentAllowed(${client}`);
    assert(decl > 0 && svc > decl && svc < call, fn);
    assert(src.indexOf("auth.getUser(token)") < call, `${fn}: JWT първо`);
    assert(!/assertEnvironmentAllowed\((supabase|asUser),/.test(src), fn);
  });
}
