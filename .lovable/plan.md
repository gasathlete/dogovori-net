## Цел
При натискане на "Продължи с Google" в страницата за вход винаги да се показва Google прозорецът за избор на акаунт, за да може потребителят да избере с кой имейл да влезе (вместо автоматично да го логва с последно използвания).

## Промяна
Във `src/pages/Auth.tsx`, в `handleGoogle`, да добавим `extraParams: { prompt: "select_account" }` към повикването на `lovable.auth.signInWithOAuth("google", ...)`.

Това е поддържан Google OAuth параметър в Lovable Cloud и принуждава Google да покаже екрана за избор на акаунт всеки път, дори когато потребителят вече има активна сесия с един акаунт.

## Технически детайли
```ts
const result = await lovable.auth.signInWithOAuth("google", {
  redirect_uri: window.location.origin + redirect,
  extraParams: { prompt: "select_account" },
});
```

Без други промени — без backend, без миграции, без нови зависимости.
