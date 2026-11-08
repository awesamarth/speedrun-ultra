// Board seniority labels -> coarse level buckets (used for filtering + display).

export const LEVELS = ["intern", "new_grad", "junior", "mid", "senior", "staff", "lead"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_NAME: Record<Level, string> = {
  intern: "Intern", new_grad: "New grad", junior: "Junior", mid: "Mid-level", senior: "Senior", staff: "Staff / principal", lead: "Lead / manager / exec",
};

const MAP: Record<string, Level> = {
  intern: "intern", "new grad": "new_grad", junior: "junior", "mid-level": "mid", senior: "senior",
  "staff or principal": "staff", staff: "staff",
  "lead or manager": "lead", director: "lead", vp: "lead", exec: "lead", founding: "lead",
};

/** null = the board gives no level (such roles are never hidden by the level filter) */
export function levelOf(seniority: string | null | undefined): Level | null {
  return seniority ? MAP[seniority.toLowerCase()] ?? null : null;
}

/** What an eligible verdict covers, and what it doesn't. Returned with results so agents don't oversell it. */
export const CHECKED = ["location", "work_authorization", "citizenship_or_clearance", "stated_min_years"] as const;
export const NOT_CHECKED = "skills, seniority fit, education or student status, timezone, interview/other requirements";

export const sourceJobApi = (id: string) => `https://speedrun-talent-network.com/api/v1/jobs/${id}?source=speedrun-ultra`;
