# Aurora — Quiz Studio

A tiny installable web app that turns formatted `.txt` question banks into
glowing, tap-through practice quizzes with instant feedback and
explanations. No backend, no account — everything is saved in your
browser's local storage
on your own device.

## What's in this folder

```
index.html      the whole app shell
style.css       visual design (blueprint / inspection-stamp theme)
app.js          parsing, storage, quiz logic
manifest.json   makes it installable ("Add to Home Screen")
sw.js           service worker, lets it work offline once loaded
seed-quiz.txt   your original 25-question sample, loaded automatically
icons/          app icons
```

## 1. Put it on GitHub Pages (free hosting)

1. Create a new **public** GitHub repository (e.g. `site-register`).
2. Upload every file in this folder into the repo, keeping the `icons/`
   folder as a folder.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a URL like
   `https://yourusername.github.io/site-register/`. It can take a minute
   to go live.

That's it — no build step, no npm install. It's plain HTML/CSS/JS.

## 2. Add it to your phone's home screen

**Android (Chrome):** open the GitHub Pages URL, tap the **⋮** menu →
"Add to Home screen" / "Install app".

**iPhone (Safari):** open the URL, tap the **Share** icon → "Add to Home
Screen".

Either way you get an icon that opens full-screen, like a normal app.

## 3. Add a new quiz

Tap **+ New Quiz**, give it a title, then get your questions into the box
one of two ways:

### Option A — Paste / Upload Text (works fully offline)

Upload a `.txt` file already in this exact format, or just paste text
straight into the box:

```
Q1. Question text goes here?

A) First option
B) Second option
C) Third option  ✅ CORRECT
D) Fourth option

Explanation: Why C is the right answer.

------------------------------------------------

Q2. Next question...
```

Rules the parser follows:

- Each question starts with `Q<number>.` at the start of a line.
- Options are lines starting with `A)`, `B)`, `C)`, `D)` (any number of
  options ≥ 2 is fine — it doesn't have to be exactly four).
- Put a `✅` right after the correct option's text — the app strips the
  checkmark and anything after it before showing the option, so it never
  gives the answer away while you're taking the quiz.
- An `Explanation:` line is optional but recommended — it's revealed the
  moment you answer, whether you got it right or wrong.
- Blocks can be separated by a line of dashes or just left blank; both
  work. Line breaks inside a question or explanation are preserved
  exactly as you typed them.

### Option B — Auto-Format with AI (needs internet, needs a free API key)

Skip formatting entirely: switch to the **Auto-Format with AI** tab,
upload your raw notes, a messy question dump, or even a PDF, paste in a
Gemini API key, and tap **Format with AI**. It reformats the source into
the format above and drops it straight into the same text box for you to
review (and hand-edit if needed) before saving.

- Get a free key at **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
  (sign in with any Google account). Paste it into the API key field —
  it's saved only in your browser's local storage on your device, and is
  sent directly from your browser to Google, never through any server of
  ours.
- This step needs an internet connection. If you're offline, the app
  tells you so and points you back to the manual tab — everything else
  (browsing, taking, renaming, deleting quizzes) keeps working offline as
  normal.
- If the AI call fails for any reason (bad key, rate limit, network
  issue, or it just returns something that doesn't parse), you get a
  clear error message and the text box stays fully editable — you can
  fix it by hand or switch to the manual tab instead. Nothing is lost.
- There's an "Advanced: model name" field under the AI tab, pre-filled
  with `gemini-flash-lite-latest` — Google's lightest current Flash
  model, chosen because it has the most generous free-tier rate limits
  and is the least likely to return a "high demand" (503) error. If
  Google renames things and it stops working, check
  [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
  for the current model name and update that field.

Either way, you can keep adding new `.txt` files or AI sources any time
— each becomes its own entry in the home page list ("the register"),
with its own question count, a rename button, and a delete button.

## 4. Move quizzes between devices (export / import)

At the top of the home page there are two buttons:

- **Export All** — downloads every quiz in your register as one `.json`
  file (named `site-register-export-<date>.json`). Great for backups or
  moving everything to a new device at once.
- **Import** — pick a `.json` file exported from this app (from any
  device) and its quizzes get added to whatever's already on this
  device. Nothing gets overwritten or removed — imported quizzes are
  always added on top of your existing ones, even if titles match.

Each quiz card also has its own **Export** button, next to Rename and
Remove, if you just want to share or move one specific quiz instead of
everything.

To move quizzes to another device: tap Export (all or one) here, send
that `.json` file to the other device however you like (email, message,
cloud drive, USB), then open this same app on that device and tap
**Import**, picking the file you sent over.

## Notes

- All quizzes live in your browser's local storage, scoped to whatever
  domain you host this on. Clearing site data / browser storage will
  remove them, so it's not a place for anything irreplaceable — if a
  quiz matters, keep the original source file too.
- Except for the AI formatting step, nothing is uploaded anywhere;
  parsing and quiz-taking happen entirely on-device.
- Works offline after the first visit (the service worker caches the app
  shell) — only the AI formatting button needs a live connection.
