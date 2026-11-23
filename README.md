# SkillTracker — Secure Instructor Invitations

## Upgrade existing production (do not delete data)
1. Back up Neon production database or create a restore point.
2. Run `server/sql/2026_instructor_invitations_migration.sql` once in Neon SQL Editor against the existing `neondb` production database.
3. Configure Vercel environment variables: existing `DATABASE_URL`, `JWT_SECRET`, `SETUP_KEY`; new `RESEND_API_KEY`, `INVITE_FROM_EMAIL` (a verified sender address), and `PUBLIC_APP_URL` (e.g. `https://skilltracker-web.vercel.app`, no trailing slash).
4. In Resend, verify a sending domain and create an API key. Domain and sender rules depend on the provider. Keep the key secret.
5. Upload changed files to the existing GitHub repository, commit and let Vercel deploy.
6. Log in as admin → User Management → Add Instructor. The invitation is emailed; the instructor uses the one-time 24-hour link to set their password.
7. Test invitation, activation, login, resend, deactivation and existing courses/quiz functionality.

## Security
- Student registration cannot self-assign elevated roles.
- Admin-only invitation/status routes enforce server-side authorization.
- Activation tokens are random, SHA-256 hashed in database, single-use and expire after 24 hours.
- Instructor accounts are disabled until activation; disabled users cannot authenticate or access existing sessions.
- Admin role assignment through User Management is disabled to prevent privilege escalation.
- The email service is **not** active until configured; there is no automatic fallback exposing invitation links.

## Important limitations
- Do not run the original schema to replace production data.
- Admin must manage an already-registered student account separately; the invitation endpoint rejects existing emails.
- This package has not been end-to-end tested against your live Neon or Resend services.

## User Management update (2026-11-23)

Administrator → User Management lists accounts, invites instructors, deactivates access, and permanently deletes **unused** Student/Instructor accounts after confirmation. The API refuses deletion of administrators and any account with courses, enrollments, lesson progress, or quiz attempts; deactivate these instead. Existing Neon invitation migration still required. No new SQL migration is required for this addition.

After uploading this version, test on a non-production/test account first. Do not publish secret environment variables.
