import { LegalLayout } from "./LegalLayout";

const EMAIL = "imdevelopmentoffice@gmail.com";

export default function Contacts() {
  return (
    <LegalLayout
      title="Контакти"
      description="Свържете се с екипа на Dogovori.net — въпроси, обратна връзка и поддръжка."
    >
      <p>
        Ценим обратната връзка. За всички въпроси, предложения и сигнали ни пишете на:
      </p>
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      <p>
        Стараем се да отговаряме в рамките на 1–2 работни дни.
      </p>
    </LegalLayout>
  );
}
