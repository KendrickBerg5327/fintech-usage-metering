import assert from "node:assert/strict";
import { decidePayment } from "../src/usage_meter.js";

const approved = decidePayment({ customer_id: "cus_1", amount_usd: 20, payment_id: "pay_1", risk_score: 0.1 }, 10, 100);
assert.equal(approved.decision, "approve");
assert.equal(approved.projected_units, 30);

const held = decidePayment({ customer_id: "cus_1", amount_usd: 20, payment_id: "pay_2", risk_score: 0.9 }, 10, 100);
assert.equal(held.decision, "hold_for_review");
console.log("usage decision tests passed");
