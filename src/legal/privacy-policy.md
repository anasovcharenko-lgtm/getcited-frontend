# Privacy Policy

**Last updated: 30 September 2026**

This policy explains what personal data GetCited collects, why, and what you can
do about it. It is written to meet the UK GDPR and the Data Protection Act 2018.

---

## 1. Who we are

GetCited is a service operated by **Absolute One Ltd**, a company registered in
England and Wales under company number **17362397**, registered office
**College House, 17 King Edwards Road, Ruislip, England, HA4 7AE**.

We are the **data controller** for the personal data described here.

Contact for anything in this policy: **hi@absoluteone.ltd**

We have not appointed a Data Protection Officer. We are not required to.

---

## 2. What we collect

### 2.1 When you create an account

You sign in with Google. From that we receive, and store:

| Data | Where it comes from |
|---|---|
| Email address | Your Google account |
| Name and profile picture, if your Google account has them | Your Google account |
| A user ID we generate | Us |
| Account creation and last sign-in timestamps | Us |

We do not receive or store your Google password. We do not read your Gmail,
Drive, contacts or calendar, and we do not request permission to.

### 2.2 When you run an audit

You give us information about a brand:

- brand name and website
- a short description of what the brand does
- competitor names and websites
- the country and language you want results for
- any prompts you write yourself

Most of this is business information rather than personal data. It becomes
personal data if you are a sole trader, or if you type a person's name into a
field. We treat everything you enter in an audit as if it might be personal and
protect it the same way.

We also store the results of each audit: the prompts used, the answers the AI
models returned, and the web pages those answers cited.

### 2.3 Automatically

- IP address and approximate country, from the request itself
- Browser type and version
- Pages you visited on our site and when
- Error logs when something breaks

### 2.4 If you pay us

Payments are handled by **Stripe**. Your card details go to them
directly and never reach our servers. We receive only: the fact a payment
succeeded or failed, the amount, the last four digits of the card, and the
billing country.

### 2.5 What we never collect

We do not ask for and do not want special category data — health, ethnicity,
religion, political opinions, sexual orientation, biometrics, trade union
membership. Please do not type any of it into an audit field.

---

## 3. Why we use it, and our legal basis

| What we do | Legal basis |
|---|---|
| Create and run your account | Performance of a contract |
| Run audits you asked for | Performance of a contract |
| Take payment and issue receipts | Performance of a contract |
| Keep accounting records | Legal obligation |
| Email you about a problem with the service | Legitimate interests — you need to know |
| Keep the service secure, investigate abuse | Legitimate interests — running a safe service |
| Understand which features are used, in aggregate | Legitimate interests — improving the product |
| Marketing email about GetCited | Consent, which you can withdraw at any time |
| Analytics cookies | Consent |

Where we rely on legitimate interests we have weighed them against your rights
and concluded that the processing is what you would reasonably expect from a
service like this one. You can object — see section 8.

---

## 4. Sending prompts to AI models

This is the part of the service worth reading carefully.

To measure a brand's visibility, we send the audit prompts to third-party AI
models and record what comes back. Today that means **OpenAI**. We may add other
providers; when we do, this list is updated.

What leaves our servers is the prompt text — the search-style question, for
example *"best project management tools for small teams"*. Your email address,
your account ID and your payment details are **not** sent with it.

If you write a custom prompt containing personal data, that text will be sent to
the model provider. Do not put personal data in custom prompts.

We use the providers' paid API, not their consumer products. Under OpenAI's API
terms, data sent through the API is not used to train their models. OpenAI may
retain API request data for a limited period for abuse monitoring.

---

## 5. Who else sees your data

We use these processors to run the service. Each is bound by a contract that
restricts them to acting on our instructions.

| Provider | What for | Where |
|---|---|---|
| Supabase | Database, authentication | [SUPABASE REGION] |
| Railway | Backend hosting | United States |
| Vercel | Frontend hosting, CDN | United States and global edge |
| Google | Sign-in | United States and global |
| OpenAI | AI model queries | United States |
| Stripe | Payments | [SUPABASE REGION] |
| [ANALYTICS, if used] | Usage analytics | [SUPABASE REGION] |

We do not sell your data. We do not share it with advertisers. We do not trade
it, rent it, or hand it to data brokers.

We will disclose data if a UK court or regulator lawfully requires it, and if we
are ever asked, we will tell you unless we are legally barred from doing so.

If the business is sold or merged, data transfers with it, and we will tell you
before that happens.

---

## 6. Data leaving the UK

Several of the providers above are in the United States. Those transfers rely on
the **UK International Data Transfer Addendum** to the EU Standard Contractual
Clauses, or, where the provider is certified, the **UK Extension to the EU–US
Data Privacy Framework**.

If you would like a copy of the safeguards for a specific provider, email
**hi@absoluteone.ltd** and we will send it.

---

## 7. How long we keep it

| Data | Kept for |
|---|---|
| Account data | While your account exists, then 30 days |
| Audit history and results | While your account exists, then 30 days |
| Payment and invoice records | 6 years — required by UK tax law |
| Server and error logs | 90 days |
| Marketing consent records | 3 years after you unsubscribe |
| Backups | Up to 30 days, then overwritten |

Deleting your account deletes your audits. The 30-day window exists so that an
accidental deletion can be reversed; after it passes, the data is gone and we
cannot recover it.

---

## 8. Your rights

Under UK data protection law you can:

- **Get a copy** of the personal data we hold about you
- **Correct it** if it is wrong
- **Delete it** — "the right to be forgotten"
- **Restrict** how we use it while a dispute is being sorted out
- **Take it with you**, in a machine-readable format
- **Object** to processing we base on legitimate interests
- **Withdraw consent** at any time, where consent is the basis

To use any of these, email **hi@absoluteone.ltd**. We will respond within one
month. It is free. If a request is repetitive or excessive we may charge a
reasonable fee or decline, and we will explain why.

You can delete your account yourself from account settings.

If you are unhappy with how we have handled your data, please tell us first so we
can fix it. You also have the right to complain to the **Information
Commissioner's Office**: ico.org.uk, 0303 123 1113.

---

## 9. Security

- All traffic is encrypted in transit with TLS
- Data at rest is encrypted by our database provider
- Access is limited to people who need it, and protected by two-factor
  authentication
- We do not store passwords at all — sign-in is delegated to Google
- API keys and secrets are held in environment variables, never in source code

No system is perfectly secure. If a breach affects your rights, we will notify
the ICO within 72 hours and tell you directly where the law requires it.

---

## 10. Cookies

See our separate [Cookie Notice](/cookies).

---

## 11. Children

GetCited is a business tool and is not for anyone under 18. We do not knowingly
collect data from children. If you believe a child has given us data, email
**hi@absoluteone.ltd** and we will delete it.

---

## 12. Automated decision-making

We do not make decisions about you by automated means that produce legal or
similarly significant effects. The audit scores describe a brand's visibility in
AI answers; they are not decisions about a person.

---

## 13. Changes

We will post any change here and update the date at the top. For anything
material, we will email account holders at least 14 days before it takes effect.
