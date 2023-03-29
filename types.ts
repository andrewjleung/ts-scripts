export type Cycle = "Spring 2021 (NEU Co-op 3)" | "Post Grad 2022-2023";

const STATUSES = [
  "Applied",
  "OA",
  "Phone Screen",
  "Hiring Manager Call",
  "Technical Interview",
  "Verbal Offer",
  "Formal Offer",
  "Rejected After Interview",
  "Rejected",
  "Archived",
  "Signed",
] as const;

export type ApplicationStatus = typeof STATUSES[number];

export type Application = {
  type: "application";
  status: ApplicationStatus;
  company: string;
  role: string;
  team?: string;
};

export type Phase = {
  type: "phase";
  status: ApplicationStatus;
};

export type ApplicationRow = Application | Phase;

export function isApplicationStatus(
  status: string
): status is ApplicationStatus {
  return STATUSES.includes(status as any);
}
