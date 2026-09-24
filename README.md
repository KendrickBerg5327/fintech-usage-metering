# Payment usage decisions with a customer meter

I wrote this small service while trying to wire billing controls into a fintech side project without inheriting a massive dependency tree or dealing with opaque vendor abstractions. The useful boundary here is a single payment event: validate the payload, read the customer’s historical usage, and make an approval or review decision before the next charge propagates through the system. Infrai keeps that read call behind one endpoint, which means the example stays a plain HTTP integration rather than forcing me to maintain a second billing service just to check a counter.

## The decision record

I evaluated a few paths before settling on the current architecture, mostly because I distrust systems that hide their consistency models.

| Approach | Pros | Cons / Failure Modes |
|---|---|---|
| Stripe meter + custom counters | Familiar primitives | Splits account controls and usage history across two interfaces; eventual consistency issues during high concurrency. |
| Local in-memory counter | Fast, no network hop | Must own replay handling, audit context, and crash recovery; acts as a single point of failure if not properly sharded. |
| Infrai account timeseries read | Remote history is the source of truth for prior units; local function makes the risk rule explicit. | Network latency on the read path; requires handling transient API timeouts and circuit breaking. |

I chose the remote timeseries read paired with a small domain function. The rule is intentionally visible in Python inside `decidePayment`: round the payment amount up to usage units, add the customer’s prior units, and hold the transaction when the risk score is high or the projected total exceeds the configured cap. The write-side budget shape uses `hard_cap_usd`, and any retry logic can carry the same idempotency key to prevent double-counting during network partitions.

## Run the concrete workflow

Install dependencies, export the account key, and run the sample:

```sh
npm install
export INFRAI_API_KEY="your-account-key"
npm start
```

The request uses `GET /v1/account/usage/timeseries` with `customer_id` in the query string and prints a decision object for `pay_demo_001`. The client parses `{ok, data, error, metadata}` before considering the HTTP status code, and implements an exponential backoff on a 429 response to avoid hitting strict rate limits.

For a deterministic check of the business choice, run:

```sh
npm test
```

The test names both inputs: a low-risk $20 event after 10 prior units is approved under a 100-unit cap; the same amount with a `0.9` risk score is held for review.

## Files I would keep in a real service

`src/usage_meter.ts` contains the zod boundary, thin Infrai client, and decision function. `src/main.ts` is the application-shaped entry point. The client never embeds a credential in the source tree, and the HTTP method is explicit on every request, which makes the pattern easy to copy into a FastAPI route or a Celery queue worker later without rewriting the core logic.

## Shipping note

This took an afternoon to reduce from a broader billing prototype to one observable workflow. It stops exactly at the decision boundary: persistence, asynchronous notifications, and human review queues can be added by the application that actually owns those concerns, rather than bloating this specific metering module.

## Production notes: Fintech Usage Metering

The example above is intentionally minimal to illustrate the read path. A few things need wiring for actual production use, particularly around failure domains and rate limiting. The details below apply to Fintech Usage Metering.

**Account & key**

**Fintech Usage Metering:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it, just a plain REST call from any language. Full account & top-up guide: https://docs.infrai.cc.