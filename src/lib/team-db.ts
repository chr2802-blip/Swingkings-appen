import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Which models belong to a team, read from the schema: a model carries a team if it has
 * a `teamId` column. Asking Prisma cannot drift the way a hand-kept list can.
 */
const TEAM_SCOPED = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "teamId"))
    .map((model) => model.name),
);

/**
 * The models with no `teamId`, one entry each. Some read as though they belong to a
 * team and do not — a task's assignees, a post's likes — and scoping them would pass the
 * query straight through, unscoped: those are refused. The rest have nothing to do with
 * teams and are passed through. A model in neither is an error, not a default.
 */
const NO_TEAM_ID: Record<string, { refuse: true; because: string } | { refuse: false }> = {
  User: { refuse: true, because: "a user is on several teams; ask teamMember and include the user" },
  TaskAssignee: { refuse: true, because: "reached through its task" },
  PostLike: { refuse: true, because: "reached through its post" },
  PostComment: { refuse: true, because: "reached through its post" },

  Team: { refuse: false },
  LoginAttempt: { refuse: false },
  PushSubscription: { refuse: false },
};

function decide(model: string): "scope" | "refuse" | "pass" {
  if (TEAM_SCOPED.has(model)) return "scope";
  const known = NO_TEAM_ID[model];
  if (!known) {
    throw new Error(
      `teamDb does not know what ${model} is. It carries no teamId, so it is either reached ` +
        "through the record that does (refuse: true) or has nothing to do with teams " +
        "(refuse: false). Say which in lib/team-db.ts.",
    );
  }
  return known.refuse ? "refuse" : "pass";
}

const FILTERED = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

type Args = Record<string, unknown>;

/**
 * A Prisma client bound to one team. Every query against a team-scoped model carries
 * that team's id whether or not the caller wrote one, and every row it creates is
 * stamped with it — so a query that forgets the clause returns nothing rather than
 * another team's rows. It does not replace the checks in `lib/access.ts`.
 */
export function teamDb(teamId: string) {
  return prisma.$extends({
    name: "team-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const verdict = decide(model);
          if (verdict === "refuse") {
            const { because } = NO_TEAM_ID[model] as { refuse: true; because: string };
            throw new Error(`teamDb cannot scope ${model}: it carries no teamId — ${because}.`);
          }
          if (verdict === "pass") return query(args);

          const scoped = { ...(args as Args) };
          if (FILTERED.has(operation)) {
            scoped.where = { ...((scoped.where as Args) ?? {}), teamId };
          } else if (operation === "create") {
            scoped.data = { ...((scoped.data as Args) ?? {}), teamId };
          } else if (operation === "createMany") {
            const rows = scoped.data as Args | Args[];
            scoped.data = Array.isArray(rows) ? rows.map((row) => ({ ...row, teamId })) : { ...rows, teamId };
          } else if (operation === "upsert") {
            scoped.where = { ...((scoped.where as Args) ?? {}), teamId };
            scoped.create = { ...((scoped.create as Args) ?? {}), teamId };
          } else {
            throw new Error(`teamDb does not know how to scope "${operation}" on ${model}.`);
          }
          return query(scoped);
        },
      },
    },
  });
}

export type TeamDb = ReturnType<typeof teamDb>;

/** Every model, sorted into what `teamDb` does with it — for the unit test. */
export function classifyModels() {
  return Prisma.dmmf.datamodel.models.map((model) => ({ model: model.name, verdict: decide(model.name) }));
}
