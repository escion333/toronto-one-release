import { readFileSync } from "node:fs";
import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { bookingStateSchema, type BookingState } from "./booking-contracts.ts";
import { privateBookingDirectory } from "./booking-approval.ts";

const ownerSchema = z.string().uuid();
const artifactSchema = z
  .string()
  .regex(/^[a-f0-9-]{36}-(?:official-)?receipt\.(?:png|pdf)$/);
const stateSchema = bookingStateSchema
  .omit({ review: true, participants: true })
  .extend({ status: z.literal("confirmed") });
const checkpointSchema = z.object({
  owner: ownerSchema,
  expiresAt: z.number(),
  state: stateSchema,
  receiptFile: artifactSchema.optional(),
  pdfFile: artifactSchema.optional(),
});
export type BookingCheckpoint = z.infer<typeof checkpointSchema>;
export function readBookingCheckpoint(
  owner: string,
  now = Date.now(),
  directory = privateBookingDirectory,
): BookingCheckpoint | undefined {
  if (!ownerSchema.safeParse(owner).success) return undefined;
  try {
    // Private runtime records must never be bundled as build inputs.
    const bytes = readFileSync(
      /* turbopackIgnore: true */ path.join(directory, `session-${owner}.json`),
    );
    if (bytes.length > 100_000) return undefined;
    const record = checkpointSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (
      record.owner !== owner ||
      now >= record.expiresAt ||
      !record.state.receipt?.accountVerified
    )
      return undefined;
    return record;
  } catch {
    return undefined;
  }
}
export async function writeBookingCheckpoint(
  owner: string,
  state: BookingState,
  receiptFile?: string,
  pdfFile?: string,
  directory = privateBookingDirectory,
  now = Date.now(),
) {
  if (state.status !== "confirmed" || !state.receipt?.accountVerified) return;
  const record = checkpointSchema.parse({
    owner,
    expiresAt: now + 20 * 60_000,
    state,
    ...(receiptFile ? { receiptFile: path.basename(receiptFile) } : {}),
    ...(pdfFile ? { pdfFile: path.basename(pdfFile) } : {}),
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `session-${record.owner}.json`);
  await writeFile(`${destination}.tmp`, JSON.stringify(record), { mode: 0o600 });
  await rename(`${destination}.tmp`, destination);
}
export async function removeBookingCheckpoint(
  owner: string,
  directory = privateBookingDirectory,
) {
  if (!ownerSchema.safeParse(owner).success) return;
  try {
    await unlink(path.join(directory, `session-${owner}.json`));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}
