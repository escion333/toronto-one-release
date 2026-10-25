import { z } from "zod";

export class TennisStepError extends Error {}

export const tennisBookingUrl =
  "https://anc.ca.apm.activecommunities.com/toronto/reservation/landing/quick?groupId=2";
export const tennisRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.literal(60),
  attendees: z.number().int().min(1).max(9),
  maxTotalCents: z.number().int().min(0).max(100_000).default(0),
});
export const tennisResourceSchema = z.object({
  kind: z.literal("tennis"),
  name: z.string().min(5).max(180),
  sourceUrl: z.literal(tennisBookingUrl),
});
export const tennisReservationSchema = tennisResourceSchema.extend({
  request: tennisRequestSchema.optional(),
  participant: z.string().optional(),
  totalCents: z.number().int().nonnegative().optional(),
});
export type TennisRequest = z.infer<typeof tennisRequestSchema>;
export type TennisResource = z.infer<typeof tennisResourceSchema>;
export type TennisCheckout = TennisResource & {
  request: TennisRequest;
  participant: string;
  totalCents: number;
  currency: "CAD";
};
export function torontoDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validateTennisRequest(value: unknown, now = new Date()): TennisRequest {
  const request = tennisRequestSchema.parse(value);
  const day = Date.parse(`${request.date}T12:00:00Z`);
  const today = Date.parse(`${torontoDate(now)}T12:00:00Z`);
  if (
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== request.date ||
    day < today ||
    day > today + 7 * 86_400_000
  )
    throw new TennisStepError(
      "Choose a real date from today through the next seven days. The City’s court-specific rules still apply.",
    );
  const start =
    Number(request.startTime.slice(0, 2)) * 60 + Number(request.startTime.slice(3));
  if (start < 8 * 60 || start + request.durationMinutes > 22 * 60 || start % 60 !== 0)
    throw new TennisStepError(
      "Choose a one-hour court time on the hour between 8 a.m. and 10 p.m. Availability must be checked with the City.",
    );
  return request;
}
export function tennisEndTime(request: TennisRequest) {
  const minutes =
    Number(request.startTime.slice(0, 2)) * 60 +
    Number(request.startTime.slice(3)) +
    request.durationMinutes;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
const normalized = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/[|–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function timeForms(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  return [
    time,
    `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`,
    ...(minute === "00" ? [`${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`] : []),
  ];
}
export function matchesTennisIdentity(
  text: string,
  resource: TennisResource,
  request: TennisRequest,
  participant?: string,
) {
  const content = ` ${normalized(text)} `;
  const date = new Date(`${request.date}T12:00:00Z`);
  const dates = [
    request.date,
    ...["short", "long"].map((month) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Toronto",
        month: month === "short" ? "short" : "long",
        day: "numeric",
        year: "numeric",
      }).format(date),
    ),
    `${Number(request.date.slice(5, 7))}/${Number(request.date.slice(8))}/${request.date.slice(0, 4)}`,
  ];
  const hasTime = (time: string) =>
    timeForms(time).some((form) => content.includes(` ${normalized(form)} `));
  return (
    text
      .split(/[\r\n\t]+/)
      .some(
        (line) =>
          normalized(line.replace(/^(?:Facility|Resource|Court)\s*:\s*/i, "")) ===
          normalized(resource.name),
      ) &&
    dates.some((day) => content.includes(` ${normalized(day)} `)) &&
    hasTime(request.startTime) &&
    hasTime(tennisEndTime(request)) &&
    (!participant ||
      normalized(tennisParticipant(text) ?? "") === normalized(participant))
  );
}
function tennisParticipant(text: string) {
  return /(?:Reserved for|Reservation for|Booking for|Participant|Permit holder)\s*:?\s*\n([^\n]+)/i
    .exec(text)?.[1]
    ?.trim();
}
export function extractTennisPermitNumber(text: string) {
  return /(?:Permit|Reservation|Booking)\s*(?:number|#|no\.?|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9.-]{3,})/i.exec(
    text,
  )?.[1];
}
export function containsTennisReference(text: string, reference: string) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Z0-9.-])${escaped}(?=$|[^A-Z0-9.-])`, "i").test(text);
}
export function readTennisTotal(
  text: string,
  mode: "checkout" | "permit" = "checkout",
): number | undefined {
  const amounts = (pattern: RegExp) =>
    [...text.matchAll(pattern)].map((match) =>
      Math.round(Number(match[1]?.replaceAll(",", "")) * 100),
    );
  const due =
    mode === "checkout"
      ? amounts(
          /\b(?:Due Now|Total Due|Amount Due)\s*:?\s*\$([\d,]+\.\d{2})(?:\s*CAD)?/gi,
        )
      : [];
  const charges = amounts(
    /\b(?:Total Paid|Amount Paid|Grand Total|Total(?:\s*\(CAD\))?)\s*:?\s*\$([\d,]+\.\d{2})(?:\s*CAD)?/gi,
  );
  const totals = charges.length ? charges : due;
  const unique = [...new Set(totals)];
  return unique.length === 1 &&
    Number.isSafeInteger(unique[0]) &&
    !due.some((amount) => amount > (unique[0] ?? -1))
    ? unique[0]
    : undefined;
}

export function readTennisCheckout(
  text: string,
  resource: TennisResource,
  request: TennisRequest,
): TennisCheckout {
  if (!/\b1 item\b/i.test(text) || !matchesTennisIdentity(text, resource, request))
    throw new TennisStepError(
      "The City cart must contain exactly the selected court, date and one-hour time. Review the existing selection in the City browser.",
    );
  const participant = tennisParticipant(text);
  const attendees =
    /(?:Attendees|Attendance|Number of (?:attendees|participants))\s*:?\s*(\d+)/i.exec(
      text,
    )?.[1];
  const totalCents = readTennisTotal(text);
  if (
    !participant ||
    participant.length > 200 ||
    Number(attendees) !== request.attendees ||
    totalCents === undefined
  )
    throw new TennisStepError(
      "The City’s booking name, attendee count or complete amount could not be verified. No automated payment is available; review the City cart.",
    );
  if (totalCents > request.maxTotalCents)
    throw new TennisStepError(
      "The City total exceeds your maximum charge. Do not pay. Change your selection or leave the City cart; no payment handoff was authorized.",
    );
  return {
    ...resource,
    request: structuredClone(request),
    participant,
    totalCents,
    currency: "CAD",
  };
}
export function verifyTennisPermit(
  permitText: string,
  accountRecord: string,
  payload: TennisCheckout,
  receiptNumber: string,
) {
  const permitNumber = extractTennisPermitNumber(permitText);
  if (
    !permitNumber ||
    !/\d/.test(permitNumber) ||
    !matchesTennisIdentity(permitText, payload, payload.request, payload.participant) ||
    !matchesTennisIdentity(
      accountRecord,
      payload,
      payload.request,
      payload.participant,
    ) ||
    !containsTennisReference(accountRecord, receiptNumber) ||
    !containsTennisReference(accountRecord, permitNumber) ||
    readTennisTotal(permitText, "permit") !== payload.totalCents ||
    readTennisTotal(accountRecord, "permit") !== payload.totalCents ||
    /(?:Status\s*:?\s*(?:cancelled|canceled|void|refunded|pending payment|unpaid)|This permit has been cancelled)/i.test(
      permitText + "\n" + accountRecord,
    )
  )
    throw new TennisStepError(
      "The official permit and City account do not yet match this exact court, time, booking name and charge. Do not make another booking; reconcile the existing one.",
    );
  return permitNumber;
}
