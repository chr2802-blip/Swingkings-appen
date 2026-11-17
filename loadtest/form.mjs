// Sends a server-action form the way a browser without JavaScript does: reads the page,
// takes the form's hidden fields (the action's id among them) and posts them back with ours.
export const BASE = process.env.BASE_URL ?? "https://swingkings-appen.vercel.app";

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function forms(html) {
  return [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((m) => {
    const hidden = {};
    for (const i of m[1].matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/?>/g)) hidden[unescape(i[1])] = unescape(i[2] ?? "");
    return { html: m[0], hidden };
  });
}

export async function submit(path, pick, fields, cookie = "") {
  const page = await fetch(BASE + path, { headers: { cookie } });
  const form = forms(await page.text()).find(pick);
  if (!form) throw new Error(`no form on ${path} (status ${page.status})`);
  const body = new FormData();
  for (const [k, v] of Object.entries({ ...form.hidden, ...fields })) body.append(k, v);
  const res = await fetch(BASE + path, { method: "POST", body, headers: { cookie }, redirect: "manual" });
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("swingkings_session="));
  const alert = ((await res.text()).match(/role="alert"[^>]*>([^<]*)/) || [])[1];
  return { status: res.status, location: res.headers.get("location"), cookie: session, alert };
}
