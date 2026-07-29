# Privacy legal-review queue

The following values are deliberately not inferred from code:

| Decision                              | Current technical state                                                                                         | Required owner           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| retention period per data category    | nullable versioned rules; dry-run returns `REVIEW`                                                              | legal/privacy owner      |
| legal-basis references                | optional field, required by release policy before approval                                                      | legal/privacy owner      |
| conditions for legal hold             | hold/release workflow and audit implemented                                                                     | legal/privacy owner      |
| identity of NXTDRIVE provider         | not inferable from repository; full statutory name, address, KvK and VAT details must be supplied               | business owner           |
| controller/processor allocation       | public policy explains the expected split; contracts and actual instructions must confirm it                    | legal/privacy owner      |
| subprocessors and transfer safeguards | technical candidates are inventoried; exact production configuration and contracts must be confirmed            | security/privacy owner   |
| final public privacy wording          | comprehensive policy implemented at `/privacy`; independent legal approval still required                       | legal/privacy owner      |
| deletion operations                   | public no-login route and authenticated request flow implemented; mailbox SLA and end-to-end case test required | operations/privacy owner |
| final platform terms                  | public route exists and is explicitly non-final/noindex                                                         | legal/commercial owner   |

Approval must create a new retention-policy version, record approver and time,
and preserve the prior version. It must not edit historical runs.

No engineer or automated test can truthfully certify the policy as “juridically
perfect”. Final approval must compare the text with the signed customer
agreement/DPA, register of processing activities, subprocessor agreements,
international-transfer assessment, incident process and actual production
settings.
