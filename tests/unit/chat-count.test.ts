import { describe, expect, it } from "vitest";
import { UNREAD_UP_TO, unreadLabel } from "@/lib/chat-count";

describe("the chat button's count", () => {
  it("shows the number, and 99+ once it is counted no further", () => {
    expect(unreadLabel(1)).toBe("1");
    expect(unreadLabel(UNREAD_UP_TO - 1)).toBe("99");
    expect(unreadLabel(UNREAD_UP_TO)).toBe("99+");
  });
});
