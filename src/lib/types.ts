// Shared types for extraction + eligibility.

export type Method = "regex" | "llm" | "api" | "both";

/** A verbatim snippet from the JD (or an API field) that supports a value. */
export type Evidence = { quote: string; from: "jd" | "location" | "api" };

export type Field<T> = {
  value: T | null; // null = unknown (no evidence). Never guessed.
  evidence: Evidence[];
  method?: Method;
  /** regex and llm disagreed; the value is not trusted for an eligible verdict */
  conflict?: boolean;
};

export type Geo = {
  /**
   * anywhere   – explicitly open worldwide
   * restricted – remote but only from listed countries/regions
   * onsite     – must work from an office location (onsite/hybrid)
   */
  mode: "anywhere" | "restricted" | "onsite";
  /** country (ISO2) or region codes (see geo.ts REGIONS) */
  allowed: string[];
  excluded: string[];
};

export type Timezone = {
  /** e.g. ["PT","ET"], ["UTC-5..UTC+1"] as stated */
  zones: string[];
  overlap_hours: number | null;
};

export type Pay = { min: number | null; max: number | null; currency: string | null; period: "year" | "month" | "hour" | null };

export type Extraction = {
  job_id: string;
  geo: Field<Geo>;
  visa_sponsorship: Field<"yes" | "no">;
  relocation: Field<"yes" | "no">;
  /** e.g. US citizen / US person (ITAR) / security clearance required */
  citizenship: Field<{ country: string; kind: "citizen" | "us_person" | "clearance" | "work_authorization" }>;
  min_years: Field<number>;
  max_years: Field<number>;
  timezone: Field<Timezone>;
  onsite_days: Field<number>;
  pay: Field<Pay>;
  /** reasons the regex pass thinks a human/LLM should read this JD */
  ambiguity: string[];
};
