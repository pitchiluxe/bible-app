# Bible App — Landing Page

Static single-file landing page for the **Bible App** desktop application by My Digital Solutions.

## File structure

```
landing/
├── index.html                   ← the entire landing page (self-contained)
├── Bible-App-1.0.0-Setup.exe    ← place your installer here (not included)
└── README.md                    ← this file
```

The download button in `index.html` uses a **relative link**:

```html
<a href="./Bible-App-1.0.0-Setup.exe" download>
```

So the `.exe` installer must live in the **same folder** as `index.html` for the download to work.

---

## Local preview

Open `index.html` directly in any modern browser:

```
File ▸ Open File ▸ index.html
```

Or use a local HTTP server (recommended, so relative paths resolve correctly):

```bash
# Node.js (npx)
npx serve .

# Python 3
python -m http.server 8080

# VS Code
Install "Live Server" extension → right-click index.html → Open with Live Server
```

---

## Deploying to GitHub Pages

1. Create a GitHub repository (e.g. `bible-app-site`).
2. Push the contents of this `landing/` folder to the repository root:

```bash
git init
git add index.html Bible-App-1.0.0-Setup.exe README.md
git commit -m "Initial landing page release"
git remote add origin https://github.com/<your-username>/bible-app-site.git
git push -u origin main
```

3. Go to **Settings → Pages**.
4. Under **Source**, choose `main` branch → `/` (root) → **Save**.
5. Your site will be live at:

```
https://<your-username>.github.io/bible-app-site/
```

> **Important:** GitHub has a 100 MB file size limit for individual files via the web UI, and a soft limit of 50 MB for `git push`. If your `.exe` exceeds 100 MB, use [Git LFS](https://git-lfs.github.com/):
>
> ```bash
> git lfs install
> git lfs track "*.exe"
> git add .gitattributes
> git add Bible-App-1.0.0-Setup.exe
> git commit -m "Add installer via LFS"
> ```

---

## Deploying to Netlify

### Option A — Drag & drop (quickest)

1. Go to [app.netlify.com](https://app.netlify.com) and sign in.
2. Drag the entire `landing/` folder onto the **"Deploy manually"** drop zone.
3. Done — Netlify gives you a live URL instantly.

### Option B — Git-connected deploy

1. Push the `landing/` folder to a GitHub / GitLab / Bitbucket repository.
2. In Netlify: **Add new site → Import an existing project**.
3. Connect your repo.
4. Build settings:
   - **Build command**: *(leave empty — no build step needed)*
   - **Publish directory**: `.` (or the subfolder path if not root)
5. Click **Deploy site**.

### Large file hosting on Netlify

Netlify has a 100 MB limit per file on the free tier. For larger installers, host the `.exe` on a separate service (GitHub Releases, S3, Cloudflare R2) and update the `href` in `index.html`:

```html
<a href="https://your-cdn.example.com/Bible-App-1.0.0-Setup.exe" download>
```

---

## Deploying to Cloudflare Pages

1. Push to a GitHub repository.
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project → Connect to Git**.
3. Select your repository.
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(empty)*
   - **Build output directory**: `.` (or the subfolder)
5. Click **Save and Deploy**.

Cloudflare Pages supports files up to 25 MB each on the free tier. For the installer, use Cloudflare R2 (object storage) or GitHub Releases.

---

## Custom domain

All three platforms (GitHub Pages, Netlify, Cloudflare Pages) allow you to connect a custom domain for free. Follow their respective DNS configuration guides after your first successful deploy.

---

## Updating the page

`index.html` is fully self-contained — no build pipeline, no dependencies.
Edit it directly with any text editor and re-deploy.

To bump the version displayed on the page, search for `1.0.0` and replace with the new version number.
