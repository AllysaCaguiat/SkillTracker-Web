# SkillTracker: recover existing Administrator account (one time)

This patch preserves your existing Neon users, courses, quizzes, and lessons. **Do not create a new Administrator or delete records.**

1. Back up your Neon production database before making changes.
2. In Neon SQL Editor (production branch, `neondb`), run **only** `server/sql/2026_one_time_admin_recovery.sql`. This creates a one-time recovery guard table and does not change existing users.
3. In Vercel > skilltracker-web > Settings > Environment Variables, add **ADMIN_RECOVERY_KEY** (a NEW randomly generated secret, 32+ characters; do not reuse SETUP_KEY or JWT_SECRET) and **ADMIN_RECOVERY_USER_ID** set to `2` (the confirmed existing admin ID from Neon). Set both for Production. Do not share the key in chat, screenshots, or GitHub.
4. Upload these updated project files to the existing GitHub repository, preserving folder paths. Vercel will deploy automatically. Confirm the deployment is Ready.
5. Open `https://skilltracker-web.vercel.app/recover-admin`. Enter the temporary recovery key, your real new email address, and a new password (12–128 characters). Submit **once**. The backend verifies the key and admin ID, hashes the password, and atomically consumes the recovery guard.
6. **Immediately delete both ADMIN_RECOVERY_KEY and ADMIN_RECOVERY_USER_ID in Vercel and redeploy.** Then sign in using your new email/password.
7. After successful sign-in, remove the temporary recovery route and UI from the source in a follow-up code update. This avoids leaving recovery functionality deployed.

Security: The one-time guard prevents repeating the reset even if the environment key is accidentally left configured. This method is appropriate only when you control both Vercel and the Neon database. No plaintext password is stored. Do not reinitialize the guard or rerun modified SQL to reset its used_at value.

Troubleshooting: If the page says recovery disabled, check the Production variables and redeploy. If it says not initialized, verify the SQL migration ran on the same Neon branch as DATABASE_URL. If email already used, choose an unused address. Never paste secrets or passwords into ChatGPT.
