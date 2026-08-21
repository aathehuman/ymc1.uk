# YMC email setup

YMC uses two separate email systems for two separate jobs:

- **Zoho Mail** — the real `@ymc1.uk` mailboxes used by staff, including `info@ymc1.uk` and `admin@ymc1.uk`.
- **Resend** — automated transactional emails sent by the website, such as notifying staff about a new Q&A submission and sending or notifying someone when their question has been answered.

The staff portal does **not** store or display the Zoho inbox. The YMC Mail card shows a short reminder and then opens Zoho Mail in a new tab.

## Zoho Mail

Create and manage the required YMC mailboxes in Zoho. Staff should sign in to Zoho with the specific mailbox they need to use.

The Firebase staff-portal account is separate from the Zoho mailbox account.

## Resend

Resend is used only from Netlify Functions. Never put a Resend API key in frontend JavaScript or commit it to GitHub.

A dedicated sending subdomain such as `send.ymc1.uk` is recommended so website-generated mail is kept separate from the normal Zoho mailbox setup.

After adding the sending domain to Resend, add the DNS records Resend generates and wait for the domain to be verified.

## Netlify environment variables

Add these variables to the Netlify site with Functions access:

- `RESEND_API_KEY` — the Resend API key.
- `RESEND_FROM_EMAIL` — the complete sender, for example `Yardley Muslim Centre <notifications@send.ymc1.uk>` after that domain is verified.
- `YMC_PUBLIC_URL` — `https://ymc1.uk`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the existing Firebase Admin service-account JSON used to verify staff requests.
- `YMC_QUESTION_NOTIFY_EMAIL` — optional staff destination for new-question alerts. If omitted, it defaults to `info@ymc1.uk`.
- `YMC_STAFF_URL` — optional override for the button in staff notification emails. If omitted, it defaults to `${YMC_PUBLIC_URL}/staff/`.

After changing environment variables, trigger a new deploy.

## New-question staff notifications

After the public Q&A form successfully writes a new question to Firestore, it calls the `notify-new-question` Netlify Function using only the new Firestore document ID.

The function then:

1. Reads the question directly from Firestore using Firebase Admin.
2. Only accepts questions that are still `new` and were created recently.
3. Prevents the same question from generating repeated staff notifications.
4. Sends a short email to `YMC_QUESTION_NOTIFY_EMAIL` (or `info@ymc1.uk` by default).
5. States whether public publishing was allowed or whether the reply must remain private.
6. Links staff to `/staff/` to review the submission.

The question text, submitter name and submitter email are deliberately **not copied into the staff notification email**. Staff should open the protected portal to read the actual submission.

If the staff notification fails, the user's question remains safely stored in Firestore and the public form still reports that the question was submitted. A notification failure must never make a valid question look unsent to the user.

## Q&A answer delivery

The public Q&A form records whether the sender explicitly allows their question and approved answer to be published publicly.

### Publicly allowed questions

When an approved staff member answers a question that has public-publishing consent:

1. The answer is written to `publishedQas` in Firestore and the original question is marked as answered.
2. If the question contains an email address, the protected `send-question-answer` Netlify Function sends a notification linking to the public Q&A page.
3. The function verifies the Firebase staff token and reads the recipient from Firestore rather than accepting an arbitrary recipient from the browser.
4. The message uses `info@ymc1.uk` as the reply-to address.

If the notification fails, the public answer stays published and the staff portal reports that the notification could not be sent.

### Private questions

If public publishing was not allowed, the answer is **not** added to `publishedQas`.

1. Staff writes the approved answer in `/staff/` and selects **Answer Question**.
2. The answer is saved to the original Firestore question as pending email delivery.
3. The protected `send-question-answer` function emails the approved answer directly to the submitter.
4. After Resend accepts the message, the function marks the question as answered.
5. If sending fails, the question remains visible in the staff portal with **Retry Private Email**, so the answer is not lost and nothing is published.

A private question therefore requires an email address. New public-form submissions enforce either an email address or explicit public-publishing consent.

Existing/legacy questions that do not contain a `publishPublicly` field are treated as private by default. They must never be assumed to have public-publishing consent.

## Testing

1. Confirm the Resend sending domain shows as verified.
2. Confirm the Netlify environment variables are present.
3. Submit one test question with **public publishing allowed** and an email address.
4. Confirm the staff notification arrives and links to the staff portal without including the question text itself.
5. Submit a second test question with **public publishing not allowed** and an email address, and confirm the notification labels it as a private reply.
6. Sign in to `/staff/` with an approved Firebase staff account and answer both questions.
7. Confirm the public answer appears on the Q&A page and its email contains a link to the published response.
8. Confirm the private answer does **not** appear publicly and its email contains the answer itself.
9. Reply to either answer email and confirm the reply is addressed to `info@ymc1.uk` in Zoho.
