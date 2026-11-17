import { describe, expect, it } from "vitest";
import type { ChatItem, ChatPage } from "@/lib/chat";
import { withLatest, withOlder, without } from "@/lib/chat-pages";

const message = (id: string): ChatItem => ({
  id,
  body: id,
  photoIds: [],
  task: null,
  createdAt: "2026-11-17T12:00:00.000Z",
  author: { id: "anna", name: "Anna", photoId: null },
  reactors: [],
});
const page = (ids: string[], more: boolean): ChatPage => ({ messages: ids.map(message), more });
const ids = (shown: ChatPage) => shown.messages.map((m) => m.id);

describe("withLatest", () => {
  it("keeps the older pages scrolled up to, in front of the latest", () => {
    const shown = page(["a", "b", "c", "d", "e"], true);
    const next = withLatest(shown, page(["c", "d", "e", "f"], true));
    expect(ids(next)).toEqual(["a", "b", "c", "d", "e", "f"]);
    // Still older ones before "a": the latest page's own "more" says nothing about those.
    expect(next.more).toBe(true);
    expect(withLatest(page(["a", "b", "c"], false), page(["b", "c", "d"], true)).more).toBe(false);
  });

  it("drops a message deleted elsewhere from the latest part", () => {
    expect(ids(withLatest(page(["a", "b", "c", "d"], false), page(["b", "d"], true)))).toEqual(["a", "b", "d"]);
  });

  it("takes the latest page alone when it does not meet what is shown", () => {
    // More than a page came in: no hole is left between the old and the new.
    expect(withLatest(page(["a", "b"], true), page(["x", "y"], true))).toEqual(page(["x", "y"], true));
    // Nothing older on screen: the latest page says whether there is more.
    expect(withLatest(page(["b", "c"], false), page(["b", "c", "d"], true))).toEqual(page(["b", "c", "d"], true));
    expect(withLatest(page(["a"], false), page([], false))).toEqual(page([], false));
  });
});

describe("withOlder", () => {
  it("puts the older page in front, once, and takes its more", () => {
    const next = withOlder(page(["c", "d"], true), page(["a", "b", "c"], false));
    expect(ids(next)).toEqual(["a", "b", "c", "d"]);
    expect(next.more).toBe(false);
  });
});

describe("without", () => {
  it("takes one message away and keeps the rest", () => {
    expect(without(page(["a", "b", "c"], true), "b")).toEqual(page(["a", "c"], true));
  });
});
