import { iteratePaginatedAPI } from "@notionhq/client";
import { z } from "zod";
import { notion } from "./notion";
import {
  Cycle,
  ApplicationRow,
  isApplicationStatus,
  ApplicationStatus,
} from "./types";

type ApplicationCycleInfo = {
  status:
    | { hired: true; company: string; role: string; team?: string }
    | { hired: false };
  companies: string[];
  phaseCounts: Map<ApplicationStatus, number>;
  total: number;
  startDate?: Date;
  endDate?: Date;
};

const APPLICATION_DATABASE_ID = "e56c1cbb90834c95b8e0c09964830767";

const companySchema = z.object({
  title: z.array(
    z.object({
      text: z.object({
        content: z.string(),
      }),
    })
  ),
});

const genericPageSchema = z.object({
  properties: z.record(z.any()),
});

const pageSchema = z.object({
  properties: z.object({
    Status: z.object({
      status: z.object({
        name: z.string(),
      }),
    }),
    Role: z.object({
      select: z.nullable(
        z.object({
          name: z.string(),
        })
      ),
    }),
    Application: z.object({
      relation: z.array(z.object({ id: z.string() })),
    }),
    Team: z.object({
      select: z.nullable(
        z.object({
          name: z.string(),
        })
      ),
    }),
  }),
});

function parseApplicationRow(
  page: Awaited<ReturnType<typeof notion.databases.query>>["results"][number]
): ApplicationRow | string {
  const { properties } = genericPageSchema.parse(page);
  const {
    properties: {
      Status: {
        status: { name: status },
      },
      Role: { select: maybeRole },
      Application: application,
      Team: { select: maybeTeam },
    },
  } = pageSchema.parse(page);

  if (!isApplicationStatus(status)) {
    return `Invalid status: ${status}`;
  }

  // If this page has a non-empty application relation, that means it is a
  // subtask corresponding to a phase.
  if (application.relation.length > 0) {
    return {
      type: "phase",
      status,
    };
  }

  // TODO: I'm unable to access the `Company` property for some reason by key.
  // Instead, this just grabs the `Company` property based upon which property
  // is the first to match the schema of the property.
  const maybeCompany =
    Object.values(properties).flatMap((property) => {
      const result = companySchema.safeParse(property);

      if (!result.success) {
        return [];
      }

      return result.data.title.map((title) => title.text.content);
    })[0] || undefined;

  if (maybeCompany === undefined) {
    return `Application has no company.`;
  }

  if (maybeRole === null) {
    return `Application has no role.`;
  }

  return {
    type: "application",
    company: maybeCompany,
    role: maybeRole.name,
    team: maybeTeam?.name ?? undefined,
    status,
  };
}

export async function reviewCycle(cycle: Cycle): Promise<ApplicationCycleInfo> {
  let hiringStatus: ApplicationCycleInfo["status"] = { hired: false };
  const companies = new Set<string>();
  const phaseCounts = new Map<ApplicationStatus, number>();
  let total = 0;

  const databaseIterator = iteratePaginatedAPI(notion.databases.query, {
    database_id: APPLICATION_DATABASE_ID,
    filter: {
      property: "Cycle",
      select: {
        equals: cycle,
      },
    },
  });

  for await (const page of databaseIterator) {
    const result = parseApplicationRow(page);

    if (typeof result === "string") {
      console.error(result);
      continue;
    }

    if (result.type === "phase") {
      phaseCounts.set(result.status, (phaseCounts.get(result.status) || 0) + 1);
      continue;
    }

    if (result.status === "Signed") {
      hiringStatus = {
        hired: true,
        company: result.company,
        role: result.role,
        team: result.team,
      };
    }

    companies.add(result.company);
    total += 1;
  }

  return {
    status: hiringStatus,
    companies: Array.from(companies).sort(),
    phaseCounts,
    total,
  };
}

const cycleInfo = await reviewCycle("Post Grad 2022-2023");
console.log(cycleInfo);
