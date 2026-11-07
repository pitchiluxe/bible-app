# Bible web edition

The same React reader, translations, classroom, memorization lab, plans, and progress as the desktop app, with browser storage and browser speech. No account or backend is required.

From the repository root:

```sh
npm ci
npm run web:dev
npm run web:test
npm run web:build
npm run web:preview
```

Deploy the generated `dist-web/` folder to any static HTTPS host. Relative asset URLs support subdirectories, including GitHub Pages. The existing `landing/` download site and Electron builds remain separate.

The production service worker downloads the complete app and bundled Scripture. Wait for **Ready offline** before disconnecting. Updates take effect after existing app tabs close and the new service worker activates. Local development does not register a service worker.

Personal data stays in localStorage on the current origin. Export/import JSON backups through **Saved verses**; imports preserve existing references and merge study progress. Web backups use their own versioned format and do not import desktop files. Settings and custom courses are included. Clearing site data removes local progress; backups are recommended.

Read-aloud uses Web Speech voices supplied by the browser and device, rather than the desktop neural voice download. Gospel music opens YouTube search; direct YouTube scraping is not supported by browser security.

Optional AI: install Ollama and a chat model on the same computer. Set `OLLAMA_ORIGINS` to the exact website origin and restart Ollama. Open **Web settings**, enable local AI, optionally choose a model, then save and test. Requests go directly to `http://localhost:11434`; no API key is embedded. Browser local-network permissions, CORS, and HTTPS-to-localhost rules may block this connection. All other study features work without AI.

Pushes to main automatically test and build the web edition. For GitHub Pages, enable **Settings → Pages → Source: GitHub Actions**, then run the **Deploy Bible web app** workflow with **deploy** checked. This serves the app from this repository’s Pages URL; it does not change the existing Vercel landing site.
