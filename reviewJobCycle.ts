import { iteratePaginatedAPI } from "@notionhq/client";
import { z } from "zod";
import { notion } from "./notion";
import {
  Cycle,
  ApplicationRow,
  isApplicationStatus,
  ApplicationStatus,
  Phase,
} from "./types";
import { env } from "./env";

type ApplicationCycleInfo = {
  status:
    | { hired: true; company: string; role: string; team?: string }
    | { hired: false };
  companies: string[];
  phaseCounts: Map<ApplicationStatus, number>;
  paths: Phase[][];
  total: number;
  startDate?: Date;
  endDate?: Date;
};

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
  id: z.string(),
  created_time: z.string().pipe(z.coerce.date()),
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
    "Next Deadline": z.object({
      date: z.nullable(
        z.object({
          start: z.string().pipe(z.coerce.date()),
          end: z.nullable(z.string().pipe(z.coerce.date())),
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
    id,
    created_time: created,
    properties: {
      Status: {
        status: { name: status },
      },
      Role: { select: maybeRole },
      Application: application,
      Team: { select: maybeTeam },
      "Next Deadline": { date: maybeDate },
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
      parentId: application.relation[0].id,
      status,
      date: maybeDate?.end || maybeDate?.start || undefined,
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
    id,
    company: maybeCompany,
    role: maybeRole.name,
    team: maybeTeam?.name ?? undefined,
    status,
    created,
  };
}

export async function reviewCycle(cycle: Cycle): Promise<ApplicationCycleInfo> {
  let hiringStatus: ApplicationCycleInfo["status"] = { hired: false };
  const companies = new Set<string>();
  const phaseCounts = new Map<ApplicationStatus, number>();
  const paths = new Map<string, Phase[]>();
  let total = 0;
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  const databaseIterator = iteratePaginatedAPI(notion.databases.query, {
    database_id: env.APPLICATION_DATABASE_ID,
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
      paths.set(result.parentId, [
        ...(paths.get(result.parentId) || []),
        result,
      ]);

      if (result.status === "Signed") {
        endDate = result.date;
      }

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

    startDate = startDate
      ? new Date(Math.min(startDate.getTime(), result.created.getTime()))
      : result.created;

    companies.add(result.company);
    total += 1;
  }

  return {
    status: hiringStatus,
    companies: Array.from(companies).sort(),
    phaseCounts,
    paths: Array.from(paths.values()),
    total,
    startDate,
    endDate,
  };
}

const cycleInfo = await reviewCycle("Post Grad 2022-2023");
console.log(cycleInfo);
