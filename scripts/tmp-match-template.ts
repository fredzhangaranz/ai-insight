import { matchTemplate } from "../lib/services/semantic/template-matcher.service";

async function main() {
  const question =
    "Show me wounds that achieved at least a 30% area reduction by 12 weeks";
  const customerId = process.env.CUSTOMER_ID || "test-customer";
  const result = await matchTemplate(question, customerId);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
