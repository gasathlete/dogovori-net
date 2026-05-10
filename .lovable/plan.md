## Проблем

При качване на PDF на iPhone (мобилен Safari) се появява грешка:
> `undefined is not a function (near '...n of e...')`

Това чупи бутона "Качи и анализирай" за PDF файлове на iOS.

## Причина

`src/lib/extractContractText.ts` използва `pdfjs-dist` v5 (модерен ESM build). Този build разчита на много нови JS функции (`Promise.withResolvers`, `Array.fromAsync`, `structuredClone` patterns), които работят само на Safari 17.4+ и съвсем нови Chromium-и. На по-стари iOS Safari версии минифицираният worker гърми точно с такава `for…of` грешка ("n of e" е минифицирано `for (const n of e)`).

DOCX и paste потоците не се засягат — само PDF.

## Решение

Превключване към **legacy build** на pdfjs-dist, който е специално компилиран за по-широк browser support (включително по-стари iOS Safari):

В `src/lib/extractContractText.ts`, функцията `extractPdf`:

```ts
const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

Останалата логика остава същата (`getDocument`, `getPage`, `getTextContent`).

Допълнително добавяне на по-чисто error handling в `UploadContractDialog.tsx`, за да не виждаме сурово JS съобщение, а: *„Не успяхме да прочетем PDF на това устройство. Опитайте Word файл или поставяне на текст."*

## Файлове за промяна

- `src/lib/extractContractText.ts` — legacy import за pdfjs
- `src/components/UploadContractDialog.tsx` — приятелско съобщение за грешка при PDF

Без промени в backend, миграции или edge functions.

## Тест

1. На мобилен Safari → качване на PDF трябва да работи.
2. Desktop Chrome / Safari → без регресия.
3. DOCX и paste текст пътищата не се пипат.
