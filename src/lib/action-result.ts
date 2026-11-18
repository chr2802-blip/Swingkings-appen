/**
 * What a form action reports back. Actions that validate user input return this so the
 * form can say what happened: previously they returned nothing at all, and an invalid
 * submission closed the dialog as though it had been saved.
 *
 * `undefined` is the state before the first submission.
 */
export type ActionResult =
  | {
      ok: true;
      /**
       * Something worth saying about a submission that worked. Success usually needs no
       * words — the form said what it was going to do and it did it — but a press whose
       * effect was quietly smaller than asked for does — the calendar sync says how many
       * matches it brought in, and a sync that found nothing new should say so.
       */
      note?: string;
      /**
       * The ids of what the press made (the fines given, the challenge reported), so the
       * page can show them arriving — `useShowFresh` in `src/components/fresh.tsx`.
       */
      created?: string[];
    }
  | { ok: false; error: string }
  | undefined;

export const ok = (note?: string, created?: string[]): ActionResult => ({
  ok: true,
  ...(note ? { note } : {}),
  ...(created?.length ? { created } : {}),
});

export const fail = (error: string): ActionResult => ({ ok: false, error });

/** A form action as React's useActionState calls it. */
export type FormAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/** The outcome of reading a form: either the fields, or why they were rejected. */
export type Parsed<T> = { ok: true; fields: T } | { ok: false; error: string };

export const parsed = <T>(fields: T): Parsed<T> => ({ ok: true, fields });

export const invalid = <T>(error: string): Parsed<T> => ({ ok: false, error });
