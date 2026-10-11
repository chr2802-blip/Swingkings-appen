import { z } from "zod";
import { invalid, parsed, type Parsed } from "./action-result";

/**
 * Reads a form against a schema: the fields, or the first message the schema produced.
 * The wording a person sees lives beside the field it belongs to.
 */
export function readForm<S extends z.ZodType>(schema: S, formData: FormData): Parsed<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return parsed(result.data);

  const issue = result.error.issues[0];
  if (issue?.code === "too_big" && issue.origin === "string") {
    return invalid(`Teksten er for lang (højst ${Number(issue.maximum)} tegn).`);
  }
  return invalid(issue?.message || "Tjek felterne og prøv igen.");
}

/** Ceilings on the absurd, not a style guide. */
export const MAX_NAME = 200;
export const MAX_NOTE = 2_000;
export const MAX_MESSAGE = 4_000;

export const requiredText = (message: string, max: number = MAX_NAME) =>
  z.string({ error: message }).trim().min(1, message).max(max);

/** Optional text, stored as null rather than an empty string. */
export const optionalText = z
  .string()
  .trim()
  .max(MAX_NOTE)
  .optional()
  .transform((value) => value || null);

/** A whole number from a form field, within bounds, with its own message. */
export const wholeNumber = (message: string, min: number, max: number) =>
  z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

/** An optional id from a select: empty means none. */
export const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || null);
