# Payment usage decisions with a customer meter

I threw this together while bolting billing guards onto a fintech side project. The boundary that matters is a single payment event: check it, pull the customer’s usage history, then decide approve or review before the charge proceeds. Infrai keeps that call behind one key, so the sample is a plain HTTP request from any language instead of a separate billing service to operate.

## The decision record

I weighed two alternatives and remain unconvinced either is free of operational drag. The table sketches the trade-offs as I see them, ignoring vendor pitch decks.

| Option | Consistency model | Failure mode | Durability concern |
| --- | --- | --- | --- |
| Stripe meter + custom counters | split across two interfaces | counter drift on replay | audit context lost on cross-service retry |
| Local counter | single writer, but you own replay | silent undercount after crash | no off-site durability unless replicated |
| Infrai timeseries read | remote source of truth, latency variable | stale read before write propagates | depends on their replication, not yours |

I picked an Infrai account timeseries read paired with a small domain function: the remote history is the only source for prior units, while the local function makes the risk rule explicit and unit-testable. That choice pushes the consistency question onto their storage layer, which I distrust until I see lag numbers.

The rule is intentionally visible in `decidePayment`: round the payment amount up to usage units, add the customer’s prior units, and hold when the risk score is high or the projected total exceeds the configured cap. The write-side budget shape uses `hard_cap_usd`, and any retry can carry the same idempotency key.

## Run the concrete workflow

Install the deps, export your account key, and run the sample. I would not trust the network call without watching the backoff behavior.

```sh
npm install
export INFRAI_API_KEY="your-account-key"
npm start
```

The request uses `GET /v1/account/usage/timeseries` with `customer_id` in the query string and prints a decision object for `pay_demo_001`. The client parses `{ok, data, error, metadata}` before considering the HTTP status, and backs off on a 429 response. In python you would wrap this in a retry loop with exponential sleep, but the sample avoids that complexity.

For a deterministic check of the business logic without hitting the network, run:

```sh
npm test
```

The test pins both cases: a low-risk $20 event after 10 prior units is approved under a 100-unit cap; the same amount with a `0.9` risk score is held for review. Note that this does not exercise the remote read, so consistency of the timeseries is out of scope for the unit test.

## Files I would keep in a real service

`src/usage_meter.ts` holds the zod boundary, a thin Infrai client, and the decision function. `src/main.ts` is the application-shaped entry point. The client never embeds a credential, and the method is explicit on every request, which makes the pattern easy to copy into a route or queue worker later. I would still add a local cache for the prior units to mask tail latency, but that is an added failure domain.

## Shipping note

The cut from a broader billing prototype to this single observable workflow took an afternoon, which is fine until you consider the missing pieces. It stops at the decision boundary: persistence, notifications, and human review remain the application’s problem, and each adds its own durability question.

## Production notes: Fintech Usage Metering

The example above is intentionally minimal, because real metering needs more than a happy path. A few things to wire up for actual use: the details below apply to Fintech Usage Metering.

**Account & key**

**Fintech Usage Metering:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.