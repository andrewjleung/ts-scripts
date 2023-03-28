import { iteratePaginatedAPI } from "@notionhq/client";
import { z } from "zod";
import { notion } from "./notion";

const companySchema = z.object({
  title: z.array(
    z.object({
      text: z.object({
        content: z.string(),
      }),
    })
  ),
});

const pageSchema = z.object({
  properties: z.record(z.any()),
});

export async function getAllCompanies() {
  const searchResponse = await notion.search({
    query: "Applications",
    filter: {
      property: "object",
      value: "database",
    },
  });

  if (searchResponse.results[0]?.id === undefined) {
    throw new Error("Could not find Applications database.");
  }

  const applicationsDatabaseId = searchResponse.results[0]?.id;
  const companies = new Set<string>();

  for await (const page of iteratePaginatedAPI(notion.databases.query, {
    database_id: applicationsDatabaseId,
  })) {
    // TODO: Zod is not working here to parse the page response, and I can't seem
    // to even access some of the properties (`Company` included). In the
    // meantime, I'll just find whichever property has a the `title` type.

    const { properties } = pageSchema.parse(page);

    // Find the property that matches the title schema, and get the title.
    const companyProperty: string | undefined =
      Object.values(properties).flatMap((property) => {
        const parsed = companySchema.safeParse(property);

        if (!parsed.success) {
          return [];
        }

        return [parsed.data.title[0]?.text.content || undefined];
      })[0] || undefined;

    if (companyProperty === undefined) {
      continue;
    }

    companies.add(companyProperty);
  }

  return [...companies].sort();
}

const companies = await getAllCompanies();
companies.forEach((company) => console.log(company));
