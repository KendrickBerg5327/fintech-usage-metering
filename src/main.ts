import { InfraiClient, meterPayment } from "./usage_meter.js";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before running the example");

const client = new InfraiClient(key);
const event = { customer_id: "cus_demo_42", amount_usd: 125, payment_id: "pay_demo_001", risk_score: 0.18 };
const result = await meterPayment(client, event, 1000);
console.log(JSON.stringify(result, null, 2));
