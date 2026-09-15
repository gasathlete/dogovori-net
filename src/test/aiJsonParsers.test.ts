/**
 * Regression suite за всички AI JSON парсери.
 *
 * Всички edge функции минават през `extractJson` от
 * `supabase/functions/_shared/json.ts`. Тук фиксираме граничните случаи, които
 * в миналото връщаха 500 („AI отговорът не може да бъде анализиран като JSON").
 * Тестовете се изпълняват в CI (.github/workflows/tests.yml).
 */
import { describe, it, expect } from "vitest";
import { extractJson } from "../../supabase/functions/_shared/json.ts";
import { diagnoseJson } from "../../supabase/functions/_shared/jsonDiagnostics.ts";

const parse = (s: string) => extractJson(s, { report: false });

describe("extractJson — щастливи пътища", () => {
  it("чист JSON обект", () => {
    expect(parse('{"a":1}')).toEqual({ a: 1 });
  });

  it("масив в корена", () => {
    expect(parse("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("markdown ограден блок", () => {
    expect(parse('```json\n{"title":"Договор"}\n```')).toEqual({ title: "Договор" });
  });

  it("предговор и послеслов от модела", () => {
    expect(parse('Ето резултата:\n{"ok":true}\nГотово.')).toEqual({ ok: true });
  });

  it("кирилица и escape последователности", () => {
    expect(parse('{"t":"чл. 86 \\"ЗЗД\\"\\nнов ред"}')).toEqual({ t: 'чл. 86 "ЗЗД"\nнов ред' });
  });
});

describe("extractJson — гранични случаи (бивши 500)", () => {
  it("неескейпнати нови редове в стринг", () => {
    expect(parse('{"body":"ред 1\nред 2"}')).toEqual({ body: "ред 1\nред 2" });
  });

  it("табулация и carriage return в стринг", () => {
    expect(parse('{"body":"a\tb\r\nc"}')).toEqual({ body: "a\tb\r\nc" });
  });

  it("trailing запетая в обект и масив", () => {
    expect(parse('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it("отрязан вътре в стринг", () => {
    const r = parse('{"title":"Договор за изработка","clauses":[{"text":"Изпълнителят се задължава');
    expect(r.title).toBe("Договор за изработка");
    expect(Array.isArray(r.clauses)).toBe(true);
  });

  it("отрязан върху непълна \\u escape последователност", () => {
    const r = parse('{"title":"Анекс","note":"стойност \\u00');
    expect(r.title).toBe("Анекс");
  });

  it("отрязан върху единичен обратно наклонен черта", () => {
    const r = parse('{"title":"Анекс","note":"път \\');
    expect(r.title).toBe("Анекс");
  });

  it("висящ ключ без стойност", () => {
    const r = parse('{"title":"Пълномощно","detail":');
    expect(r.title).toBe("Пълномощно");
    expect("detail" in r).toBe(false);
  });

  it("вложени незатворени контейнери — в правилен ред", () => {
    const r = parse('{"a":{"b":[{"c":1');
    expect(r.a.b[0].c).toBe(1);
  });

  it("дълбоко отрязан списък запазва валидните елементи", () => {
    const r = parse('{"items":[{"n":1},{"n":2},{"n":');
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.items[0]).toEqual({ n: 1 });
  });

  it("контролни символи (0x01) вътре в стринг", () => {
    expect(parse('{"a":"x\u0001y"}').a).toContain("x");
  });

  it("масив, отрязан по средата", () => {
    const r = parse('[{"id":1},{"id":2},{"id":');
    expect(r[0]).toEqual({ id: 1 });
  });

  it("двоен markdown fence без език", () => {
    expect(parse('```\n{"a":"b"}\n```')).toEqual({ a: "b" });
  });

  it("хвърля при пълна липса на JSON", () => {
    expect(() => parse("Съжалявам, не мога да помогна.")).toThrow();
  });
});

describe("diagnoseJson — точка на прекъсване и предложена корекция", () => {
  it("разпознава отрязан стринг", () => {
    const d = diagnoseJson('{"a":"незавършен');
    expect(d.breakKind).toBe("truncated_string");
    expect(d.suggestion).toMatch(/токен|escape/i);
  });

  it("разпознава липсващи затварящи скоби в правилен ред", () => {
    const d = diagnoseJson('{"a":{"b":[1');
    expect(d.breakKind).toBe("unclosed_container");
    expect(d.missingClosers).toBe("]}}");
  });

  it("разпознава липса на JSON", () => {
    const d = diagnoseJson("няма json тук");
    expect(d.breakKind).toBe("no_json_found");
  });

  it("разпознава висящ ключ", () => {
    const d = diagnoseJson('{"a":1,"b":');
    expect(["dangling_key", "unclosed_container"]).toContain(d.breakKind);
  });

  it("връща контекст около прекъсването", () => {
    const d = diagnoseJson('{"long":"' + "x".repeat(400));
    expect(d.breakContext.length).toBeGreaterThan(0);
    expect(d.breakContext.length).toBeLessThanOrEqual(241);
  });
});

describe("регресия: всички едже функции ползват общия парсер", () => {
  /**
   * Единствено изключение: платеният продуктов шлюз НЕ поправя отговор на модел.
   * Там отрязан или повреден JSON трябва да е отказ (`invalid_json`), защото
   * поправен частичен отговор би дал непълен платен резултат.
   */
  const STRICT_BY_DESIGN = ["_shared/product-model-gateway.ts"];

  it("никоя функция не парсва AI съдържание с директен JSON.parse", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = path.resolve(process.cwd(), "supabase/functions");
    const offenders: string[] = [];

    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
          const src = await fs.readFile(p, "utf8");
          const re = /JSON\.parse\(\s*(?:content|raw|text|aiText|aiContent|completion|message\.content)\s*\)/g;
          if (re.test(src)) offenders.push(path.relative(root, p));
        }
      }
    }

    await walk(root);
    expect(offenders).toEqual([]);
  });
});

describe("extractJson — неескейпнати кавички в средата (500 от production)", () => {
  it("поправя цитат вътре в стойност", () => {
    const r = parse('{"a":"текст "цитат" още","b":2}');
    expect(r.b).toBe(2);
    expect(String(r.a)).toContain("цитат");
  });

  it("поправя няколко неескейпнати кавички в дълъг обект", () => {
    const raw = '{"contract":{"clauses":[{"title":"Чл. 1 "Предмет"","body":"Страните се "договарят" така"}]},"risk":{"score":40}}';
    const r = parse(raw);
    expect(r.risk.score).toBe(40);
    expect(r.contract.clauses.length).toBe(1);
  });
});
