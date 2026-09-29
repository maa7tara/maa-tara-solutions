# Maa Tara Solutions Ltd — website

Static marketing site for Maa Tara Solutions Ltd, a courier and logistics
business based in Norwich, UK. Plain HTML, CSS and JavaScript with no build
step, no framework and no dependencies, so it can be edited in any text editor
and hosted for free on GitHub Pages.

## Before the site goes live

Five details are still placeholders. Search the whole folder for each token and
replace every occurrence:

| Token | Replace with | Occurrences |
| --- | --- | --- |
| `PHONE_TBC` | Business phone number, digits only in `tel:` links (e.g. `tel:+441603123456`) and readable form in the visible text | 6 |
| `EMAIL_TBC` | Business email address | 6 |
| `COMPANY_NUMBER_TBC` | Companies House registration number | 1 |
| `REGISTERED_ADDRESS_TBC` | Registered office address | 1 |
| `GITHUB_USERNAME_TBC` | GitHub username the repository lives under | 5 |

`verify.py` prints a warning for every token that is still present, so run it
after editing to confirm nothing was missed.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | The entire page: content, structure and metadata |
| `styles.css` | All styling, including the responsive and print rules |
| `script.js` | Menu, scrollspy, tab groups, job planner and copy buttons |
| `verify.py` | Checks structure, links, control wiring and metadata |
| `assets/favicon.svg` | Browser tab icon |
| `assets/og-image.png` | Preview image used when the link is shared |
| `assets/og-source.html` | Source page the preview image is rendered from |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |
| `.github/workflows/pages.yml` | Runs `verify.py`, then publishes to GitHub Pages |

## Editing the content

Everything a reader sees lives in `index.html`. The parts most likely to change:

- **Services** — the list under `<section id="services">`. Each entry is one
  `<li>` with a heading and a sentence.
- **Vehicles** — the rows under `<section id="vehicles">`. Each van has a
  button in the list and a matching panel below it. The `id` on the panel and
  the `aria-controls` on the button must stay in sync; `verify.py` fails if
  they do not.
- **Work completed so far** — the list under `<section id="experience">`. Keep
  the closing note about Courier Exchange, Crown and AnyVan being platforms
  rather than partners.
- **Job stages** — the five steps under `<section id="how-it-works">`, same
  button-and-panel pairing as the vehicles.

The site deliberately states no payloads, dimensions, fleet counts, volumes,
turnover, customer names, testimonials, certifications or delivery guarantees.
If any of those become verifiable facts later, add them then — not before.

## Running it locally

No install needed. From this folder:

```bash
python -m http.server 4321
```

Then open <http://127.0.0.1:4321/>. Opening `index.html` directly by
double-clicking also works, but serving it over HTTP matches how GitHub Pages
behaves.

To check the markup and links:

```bash
python verify.py
```

## Regenerating the preview image

`assets/og-image.png` is a screenshot of `assets/og-source.html`. If the
business name or tagline changes, edit that page and re-render at 1200×630:

```bash
python -m http.server 4321
chrome --headless=new --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot=assets/og-image.png http://127.0.0.1:4321/assets/og-source.html
```

## Publishing to GitHub Pages

1. Create a new **public** repository named `maa-tara-solutions` on the GitHub
   account that should own the site. Do not add a README, licence or
   `.gitignore` — this folder already has everything.
2. From inside this folder:

   ```bash
   git init
   git add .
   git commit -m "Add Maa Tara Solutions website"
   git branch -M main
   git remote add origin https://github.com/GITHUB_USERNAME_TBC/maa-tara-solutions.git
   git push -u origin main
   ```

3. In the repository, open **Settings → Pages** and set **Source** to
   **GitHub Actions**.
4. Open the **Actions** tab. The `Verify and deploy site` workflow runs on
   every push to `main`: it runs `verify.py` first and only deploys if that
   passes. The first run takes a couple of minutes.
5. The site is then live at
   `https://GITHUB_USERNAME_TBC.github.io/maa-tara-solutions/`.

For later changes:

```bash
git add .
git commit -m "Describe the change"
git push
```

### Using a custom domain

If a domain such as `maatarasolutions.co.uk` is bought later:

1. Add a file named `CNAME` in this folder containing only the domain name.
2. At the domain registrar, point the apex record at GitHub's four Pages IP
   addresses (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`) and add a `CNAME` record for `www` pointing at
   `GITHUB_USERNAME_TBC.github.io`.
3. In **Settings → Pages**, enter the domain and tick **Enforce HTTPS** once
   the certificate is issued.
4. Update the `og:url`, `twitter:image`, `og:image` and canonical URLs in
   `index.html` to the new domain.
