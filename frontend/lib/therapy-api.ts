/**
 * therapy-api.ts
 * Re-exports from therapy-timeline-api.ts for full backwards-compatibility.
 */

export * from "./therapy-timeline-api";
export { therapyTimelineDb as therapyDb, detectTherapyConflict as detectConflict } from "./therapy-timeline-api";
