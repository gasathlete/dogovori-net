"""Изтегля консолидирани текстове (kik-info.com) и ги разделя по членове.

  python3 scripts/fetch-legal-excerpts.py

Пише src/lib/templateRegen/data/legal-excerpts.json. Текстовете са неофициални
консолидации; извлечени автоматично от агента (fetchedBy: agent). Не е правно одобрение.
"""
import hashlib, json, re, datetime, requests
from bs4 import BeautifulSoup

LAWS = {"ЗЗД": "zakoni/zzd", "ТЗ": "kodeksi/tz", "КТ": "kodeksi/kt", "ГПК": "kodeksi/gpk", "ЗЗЛД": "zakoni/zzld", "ЗЗП": "zakoni/zzp"}
out = {"fetchedOn": datetime.date.today().isoformat(), "fetchedBy": "agent", "laws": {}}
for law, path in LAWS.items():
    url = f"https://kik-info.com/normativna-baza/{path}/"
    html = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0"}).text
    s = BeautifulSoup(html, "lxml")
    t = re.sub(r"[ \t]+", " ", s.get_text("\n"))
    arts = {}
    for p in re.split(r"\n(?=Чл\. \d+[а-я]?\s*\n?\.)", t)[1:]:
        n = re.match(r"Чл\. (\d+[а-я]?)", p).group(1)
        body = re.sub(r"\s+", " ", p).strip()
        # отрязване на навигационен шум след последния член
        arts.setdefault(n, body[:4000])
    out["laws"][law] = {"title": (s.title.get_text().strip() if s.title else law), "url": url,
                        "pageSha256": hashlib.sha256(t.encode()).hexdigest(), "articles": arts,
                        "caveats": ["Неофициален консолидиран текст.", "Възможни бъдещи/отменени редакции — преценяват се по текста на члена."]}
    print(law, len(arts))
json.dump(out, open("src/lib/templateRegen/data/legal-excerpts.json", "w"), ensure_ascii=False, indent=0, sort_keys=True)
