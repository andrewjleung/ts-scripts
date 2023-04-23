import { notion } from "./notion";
import { iteratePaginatedAPI } from "@notionhq/client";
import { z } from "zod";
import { env } from "./env";

const SubscriptionPageSchema = z.object({
  properties: z.object({
    "Frequency (Months)": z.object({
      number: z.number(),
    }),
    Price: z.object({
      number: z.number(),
    }),
  }),
});

const databaseIterator = iteratePaginatedAPI(notion.databases.query, {
  database_id: env.SUBSCRIPTION_DATABASE_ID,
});

let totalMonthlyCost = 0;

for await (const page of databaseIterator) {
  const parsedPage = SubscriptionPageSchema.parse(page);
  const monthlyFrequency = parsedPage.properties["Frequency (Months)"].number;
  const price = parsedPage.properties.Price.number;

  totalMonthlyCost += price / monthlyFrequency;
}

const formatter = new Intl.NumberFormat("en-Us", {
  style: "currency",
  currency: "USD",
});

console.log(`Total monthly cost: ${formatter.format(totalMonthlyCost)}`);
console.log(`Total yearly cost: ${formatter.format(totalMonthlyCost * 12)}`);
