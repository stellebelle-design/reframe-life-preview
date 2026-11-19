# Reframe Life — preview data-retention setup

This is an implementation guide for the PREVIEW Supabase project only. It does not run against production.

## What this retention job does

- An authorised admin records the date coaching actually ended for a client.
- Six months after that date, the scheduled server-side job deletes the client's coaching/onboarding records from tables that exist in this project:
  - client_onboarding (including health responses)
  - client_programme_readiness
  - client_checkins
  - client_progress_reflections
  - client_progress_reviews
  - client_programme_schedules
- It deliberately does NOT delete auth accounts, client_purchases, Stripe IDs/payment references, invoices or accounting records.
- It does not delete Google Forms waitlist submissions or EmailOctopus contacts. Those are separate external services and need their own retention/deletion procedures.

## Important safeguards

- No existing test records are deleted by adding these files.
- The purge only processes clients explicitly given a coaching-ended date.
- The six-month clock starts from the date coaching actually ends, not the purchase date.
- The SQL function is restricted to the service role / database owner. The Edge Function additionally requires a separate RETENTION_PURGE_SECRET.
- Do not put the service-role key or retention secret in website JavaScript, GitHub, or a public document.
- This code has not been deployed or scheduled. Do not describe the retention policy as automated until the migration is applied, the Edge Function is deployed, and a schedule is configured and tested.

## Preview setup still required

1. Apply `supabase/migrations/20261119_client_data_retention.sql` in the Supabase SQL Editor for project `mzzujnceyspsvlbllzst` only.
2. Deploy `supabase/functions/purge-expired-coaching-data/index.ts` to that same preview project.
3. Add a strong random `RETENTION_PURGE_SECRET` as an Edge Function secret. Keep it private.
4. Configure a monthly scheduled POST to the Edge Function URL with header `x-retention-secret: <the secret>`. Do not include the secret in a public URL or repository. Use the Supabase scheduling facility or another trusted scheduler.
5. Before enabling a live schedule, test using a dedicated dummy client with a coaching-ended date more than six months ago. Confirm the returned counts and verify purchases/auth records remain.
6. Only then consider the process operational. Keep a record of each run's result without copying client personal data into logs.

## Admin workflow

When a client finishes coaching, an authorised admin records the actual end date by calling:

```sql
select public.record_client_coaching_end(
  'CLIENT-USER-UUID',
  '2026-11-19T00:00:00Z'
);
```

Replace the example UUID and timestamp with the correct client and actual end date. Do not use this for applicants who were never accepted.

## Waitlist / unsuccessful applications

The current public website links to Google Forms for the waitlist. Supabase cannot purge those form responses. Review the linked Google Form and its response spreadsheet permissions, identify any EmailOctopus sync, and implement the six-month deletion period there separately. If an applicant opts in to future contact, retain only the contact details needed for that purpose and delete the rest of the application information.
