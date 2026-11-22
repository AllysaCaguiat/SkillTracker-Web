# SKILLTRACK — Vercel + Neon (browser-only deployment)

This project has been converted from the original **MySQL/XAMPP** version to **PostgreSQL on Neon**. A single **Vercel project** hosts both the React frontend and the Express API. No local database server or installed applications are needed for deployment.

## What is included

- React/Vite responsive frontend, preserved from original SkillTracker
- Express API exposed at `/api/*` via a Vercel Function
- PostgreSQL-backed users, enrollment, courses, lessons, progress, quizzes, attempts and role management
- Secure first-administrator creation in browser at `/setup`, protected by a private `SETUP_KEY`
- Vercel SPA rewrites for direct links and refreshes

## Deploy in your web browser

### 1. Create a Neon PostgreSQL database
1. Visit https://console.neon.tech and sign up (GitHub login is supported).
2. Create a project. Neon creates a default database (often `neondb`).
3. Select **SQL Editor**, paste **all** of `server/sql/skilltrack_postgres.sql`, and click **Run**.
4. Click **Connect** and copy the **pooled** PostgreSQL connection string (hostname usually contains `-pooler`). Keep it private.

### 2. Update your GitHub repository
From your browser, upload the contents of this ZIP to the repository (replace old files; do not upload ZIP itself). Keep **Root Directory** at repository root when configuring Vercel, **not** `client`.

If you cannot upload folders through GitHub's file upload interface, create a new repo by uploading the extracted folder contents with GitHub's browser interface, or use the GitHub website's add-file controls. Do not commit `.env` or secrets.

### 3. Connect GitHub to Vercel
1. At https://vercel.com/new click **Import Git Repository** and select your updated repository.
2. Set **Root Directory = `./`** (repository root). Do not set it to `client` or `server`.
3. If Vercel asks, select **Other** or leave auto-detected framework. The repository contains `vercel.json` with Vite build settings.
4. Build Command: `npm run build` (from root). Output Directory: `client/dist`. Install Command: `npm install`.
5. In **Environment Variables**, add:
   - `DATABASE_URL` = Neon's **pooled** Postgres connection string (keep the `sslmode=require` query parameter)
   - `JWT_SECRET` = random secret of **at least 32 characters**, unique to this app
   - `SETUP_KEY` = **different** random secret of **at least 24 characters**, which you will type once on `/setup`
6. Choose Production and deploy. Use generated Vercel URL. Do **not** set `VITE_API_URL`: the frontend calls `/api` at the same domain.

### 4. Make first admin online
1. Open `https://YOUR-VERCEL-APP.vercel.app/api/health` — expected JSON: `{"status":"ok","database":"connected"}`.
2. Open `https://YOUR-VERCEL-APP.vercel.app/setup`.
3. Fill your name, admin email, password (12+ characters) and private `SETUP_KEY`.
4. Click **Create admin account**. You will be logged in as admin.
5. Open **User management** and promote a separately registered account to **Instructor**.
6. Instructor can create course → lessons → quiz → publish. Student can enroll, complete lessons and submit quizzes.
7. Once the first admin exists, `/api/setup/first-admin` refuses creating another admin. Optionally delete `SETUP_KEY` from Vercel after setup and redeploy.

### 5. Verify features
- Student register / login / logout
- Admin user list and change role
- Instructor course create/edit/publish/delete
- Lesson create/edit/delete; student reads and completes
- Quiz edit/submit, grading and stored attempts
- Dashboard statistics and My Learning persistence after refresh

## Troubleshooting
- **404 at `/api/health`**: verify Vercel Root Directory is repository **root**; check the `api/index.js` Function exists in the build.
- **Database not initialized**: paste and run PostgreSQL schema (`skilltrack_postgres.sql`) in the Neon SQL Editor.
- **500 or timeout**: verify `DATABASE_URL` pooled connection string and JWT secret in Vercel → Settings → Environment Variables; redeploy after changes.
- **Build fails**: verify root `package.json`, `client/package.json`, and the Vercel build command are present.
- **Account already exists**: first-admin setup is one-time; normal login is at `/login`.
- **Secrets**: never upload `.env` files or share Vercel environment variable values in screenshots.

## Important limitations
- This ZIP is converted and syntax-checked, but **the deployed login/database workflows cannot be end-to-end verified here** without your actual Neon database and Vercel deployment. Follow the verification checklist after deployment.
- Runtime memory rate limiting in serverless is only best-effort. Use an external rate-limiting store / WAF before broad public use.
- Neon and Vercel free plans are subject to quotas and pricing changes; neither guarantees perpetual unlimited hosting.
- The old MySQL schema is retained solely for reference as `server/sql/legacy_mysql_schema.sql`; do not run it in Neon.
