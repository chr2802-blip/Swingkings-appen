// Makes test accounts through an invitation link: node signup.mjs <token> <from> <to>
// loadtestNN@example.com, each with a random password; accounts.json keeps them and their
// session cookies (git-ignored). The app allows 15 new accounts an hour from one address.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { submit } from "./form.mjs";

const [, , token, from = "1", to = "12"] = process.argv;
if (!token) throw new Error("usage: node signup.mjs <invitation token> [from] [to]");
const file = new URL("./accounts.json", import.meta.url);
const accounts = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
for (let n = +from; n <= +to; n++) {
  const email = `loadtest${String(n).padStart(2, "0")}@example.com`;
  if (accounts.some((a) => a.email === email)) continue;
  const password = randomBytes(12).toString("base64url");
  const r = await submit(`/join/${token}`, (f) => "token" in f.hidden, { name: `Loadtest ${n}`, email, password });
  console.log(email, r.status, r.location ?? "", r.alert ?? "");
  if (!r.cookie) break;
  accounts.push({ email, password, cookie: r.cookie });
  writeFileSync(file, JSON.stringify(accounts, null, 2));
}
