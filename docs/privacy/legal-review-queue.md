# Privacy legal-review queue

The following values are deliberately not inferred from code:

| Decision | Current technical state | Required owner |
| --- | --- | --- |
| retention period per data category | nullable versioned rules; dry-run returns `REVIEW` | legal/privacy owner |
| legal-basis references | optional field, required by release policy before approval | legal/privacy owner |
| conditions for legal hold | hold/release workflow and audit implemented | legal/privacy owner |
| final public privacy wording | technical inventory present; legal claims marked for review | legal/privacy owner |
| final platform terms | public route exists and is explicitly non-final/noindex | legal/commercial owner |

Approval must create a new retention-policy version, record approver and time,
and preserve the prior version. It must not edit historical runs.
