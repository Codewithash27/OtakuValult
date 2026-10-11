import json
import re
from difflib import get_close_matches
from pathlib import Path

TITLES = """Moby Dick
Synced For Pleasure
Landlord Sisters
Drama Queens
Kink Folder
The Late-Bloomers
The Messiah And His Followers
The Hole Is Open
The Mansion
Don't Tell Mom!
Thrust & Conquer
Someone Stop Her!
Live-In Son-In-Law
Love Quest
Like Father, Like Son
Cougar 101
Sex Study Group
The Boss's Daughter
Perverts' Daily Lives
The Girlfriend Dice
My New Family Is Too Nice To Me
Asmodeck: A Game Of Desire
My Secret Cupid
Secret Siblings
Learning The Hard Way
Steamy Studies
What Happens Inside The Dungeon
My Daughters Friend
Lucky Guy
Where Did All The Men Go?
Kindergarten Driver's Dirty Secrets
What Do I Do Now…?
Hari's Steamy Boarding House
What's Wrong With This Family?
Money Games
CCTV
Crime And Punishment
Her Rejuvenation
Like No Other
Brave New World
Getting To Know Mila
Should I Study At Noryangjin
Engineering Beauties
Intern Diver
Sextopwatch
Men Prohibited Chatroom
Sexercise
Addicted To My Mom
Tutor's Efforts: A Million-Dollar Mission
People Of The Dark
Brother From Another
College Coeds
Please, Sponsor
Got A Room?
Kids Cafe Moms
Night With My Mother And Sister
Living With A Teacher
Level Up Through Lust
Lightning Rod
I Have To Sleep With A Stranger?
Friends To Lovers From Today
Childhood Friend
Fatal Lessons In This Pandemic
My Sister's Friends
My First And Last
New Town Massage
Saving My Magical Girl
Size Gap
Slave Diary
Blurred Lines
You Watch Stuff Like That?
Self-Defense Lesson
Secret X Folder
Wreck My Bias
Soaking Summer Vacation
Troublesome Employee Warning
Between Us
He Does A Body Good
Every Building Has A Gimmick
Slide To Unlock Her
Find My Secret Spot
A Journal Exploring Desire
Married Couple Swap ~He's Better Than My Husband~
Do It For Me
My Sweet Home
Trapped In A Hentai Game Academy
Lust Awakening
Maid Rehabilitation
Cheer Love!
MILF Hunter In Another World
Power Play
Master Of Intimacy
Performance (Sex) Report
Pheromone-Holic
Romance Camping
Touch To Unlock
I Will Protect You
No Man's Land
Switch ON
KING Of The NIGHT""".strip().split("\n")


def norm(t: str) -> str:
    t = t.lower().replace("…", "...")
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("`", "'")
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t


def main() -> None:
    path = Path(__file__).resolve().parents[1] / "data" / "pornhwa-export.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    by_title: dict[str, str] = {}
    by_slug: dict[str, str] = {}
    for s in data["pornhwa"]:
        t = (s.get("title") or "").strip()
        slug = str(s.get("slug") or "")
        by_title[t.lower()] = slug
        by_slug[slug] = t
        for alt in s.get("alternativeTitles") or []:
            by_title[str(alt).strip().lower()] = slug
    nmap = {norm(k): v for k, v in by_title.items()}
    norm_keys = list(nmap.keys())

    slugs: list[str] = []
    missing: list[tuple[int, str]] = []
    for i, want in enumerate(TITLES, 1):
        w = want.strip()
        slug = by_title.get(w.lower()) or nmap.get(norm(w))
        if not slug:
            for c in get_close_matches(norm(w), norm_keys, n=5, cutoff=0.72):
                slug = nmap[c]
                break
        if slug:
            slugs.append(slug)
            print(f"{i:3} {slug}")
        else:
            missing.append((i, w))
            print(f"{i:3} MISSING {w}")

    print("missing count", len(missing))
    out = Path(__file__).resolve().parents[1] / "data" / "top-rated-slugs.json"
    out.write_text(json.dumps(slugs, indent=2), encoding="utf-8")
    print("wrote", out, len(slugs))


if __name__ == "__main__":
    main()
