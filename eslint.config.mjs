import { readFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * The models that carry a team, read from the schema the way `src/lib/team-db.ts` reads
 * them from Prisma — a model has a `teamId` column or it does not.
 */
const TEAM_SCOPED_MODELS = [
  ...readFileSync(new URL("./prisma/schema.prisma", import.meta.url), "utf8").matchAll(/^model (\w+) \{([^}]*)\}/gm),
]
  .filter(([, , body]) => /^\s+teamId\s/m.test(body))
  .map(([, name]) => name[0].toLowerCase() + name.slice(1));

const TENANCY = [
  {
    selector: `MemberExpression[object.name='prisma'][property.name=/^(${TEAM_SCOPED_MODELS.filter((m) => m !== "team").join("|")})$/]`,
    message:
      "Read team-scoped models through teamDb(teamId) so the team cannot be left out. Use prisma directly only where crossing teams is the point.",
  },
  {
    selector: "MemberExpression[object.name='prisma'][property.name=/^(taskAssignee|postLike|postComment|postPhoto|pollOption|pollVote|pollBallot)$/]",
    message: "These carry no teamId. Read them as an include on a teamDb query of their task, post or poll.",
  },
];

/**
 * An effect's arrow must have a body. React calls whatever an effect returns when it
 * cleans up, and DOM methods that returned nothing now return a Promise
 * (`scrollIntoView` from Chrome 153), which crashed the whole app on leaving the chat.
 */
const EFFECTS = [
  {
    selector: "CallExpression[callee.name=/^use(Layout|Insertion)?Effect$/] > ArrowFunctionExpression[expression=true]",
    message: "Give the effect a body: `useEffect(() => { … })`. Return only a clean-up function, written as `return …`.",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...EFFECTS] },
  },
  {
    // Pages and components are where a forgotten `where: { teamId }` would show one team
    // another's data. They read team-scoped models through `teamDb`.
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/components/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...TENANCY, ...EFFECTS] },
  },
];

export default eslintConfig;
