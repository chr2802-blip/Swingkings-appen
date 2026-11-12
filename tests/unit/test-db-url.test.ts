import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../integration/test-db";

describe("testDatabaseUrl", () => {
  it("adds _test to the development database's name", () => {
    expect(testDatabaseUrl({ DATABASE_URL: "postgresql://u:p@localhost:5432/swingkings" })).toBe("postgresql://u:p@localhost:5432/swingkings_test");
  });

  it("does not add it twice", () => {
    expect(testDatabaseUrl({ DATABASE_URL: "postgresql://u:p@localhost:5432/swingkings_test" })).toBe("postgresql://u:p@localhost:5432/swingkings_test");
  });

  it("keeps the query string", () => {
    expect(testDatabaseUrl({ DATABASE_URL: "postgresql://u:p@db:6543/swingkings?pgbouncer=true" })).toBe("postgresql://u:p@db:6543/swingkings_test?pgbouncer=true");
  });

  it("refuses an explicit test database not named _test, and no database at all", () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: "postgresql://u:p@localhost/production" })).toThrow(/must end in _test/);
    expect(() => testDatabaseUrl({})).toThrow(/Set DATABASE_URL/);
    expect(testDatabaseUrl({ TEST_DATABASE_URL: "postgresql://u:p@localhost/x_test", DATABASE_URL: "postgresql://u:p@localhost/prod" })).toBe(
      "postgresql://u:p@localhost/x_test",
    );
  });
});
