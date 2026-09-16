/** Pilot limits — development defaults, not commercial package promises. */

export const HIRING_WORKSPACES_PER_MEMBER = Number(
  process.env.HIRING_WORKSPACES_PER_MEMBER ?? "1",
);
export const HIRING_ACTIVE_JOBS_PER_WORKSPACE = Number(
  process.env.HIRING_ACTIVE_JOBS_PER_WORKSPACE ?? "1",
);
export const HIRING_SAVED_SEARCHES_MAX = Number(process.env.HIRING_SAVED_SEARCHES_MAX ?? "20");
export const HIRING_CANDIDATE_LISTS_MAX = Number(process.env.HIRING_CANDIDATE_LISTS_MAX ?? "20");
export const HIRING_CANDIDATE_LIST_ENTRIES_MAX = Number(
  process.env.HIRING_CANDIDATE_LIST_ENTRIES_MAX ?? "200",
);
export const HIRING_NOTE_MAX_CHARS = Number(process.env.HIRING_NOTE_MAX_CHARS ?? "5000");
export const HIRING_JOB_TITLE_MAX = Number(process.env.HIRING_JOB_TITLE_MAX ?? "160");
export const HIRING_JOB_BODY_MAX = Number(process.env.HIRING_JOB_BODY_MAX ?? "15000");
export const HIRING_INVITATION_TTL_HOURS = Number(
  process.env.HIRING_INVITATION_TTL_HOURS ?? "168",
);

export const HIRING_MODERATION_ADAPTER = "rule-based-heuristic";
export const HIRING_MODERATION_POLICY_VERSION = "m3.3-hiring-rule-v1";

export const HIRING_PILOT_PROVENANCE = "hiring_pilot_v1";

export const HIRING_PILOT_CAPABILITY_KEYS = [
  "hiring.workspace.create",
  "hiring.job.publish",
  "hiring.search.advanced",
  "hiring.search.save",
  "hiring.candidate_list.manage",
] as const;
