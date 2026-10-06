import { describe, expect, it } from "vitest";
import { fixTechTerms } from "./glossary";

describe("fixTechTerms", () => {
  it("fixes the 'no js' mishearing", () => {
    expect(fixTechTerms("I built it with no js and express js")).toBe("I built it with Node.js and Express");
    expect(fixTechTerms("we use Node JS")).toBe("we use Node.js");
  });
  it("fixes database and infra names", () => {
    expect(fixTechTerms("post gress and mongo db on a w s")).toBe("PostgreSQL and MongoDB on AWS");
    expect(fixTechTerms("cooper netties with docker")).toBe("Kubernetes with Docker");
  });
  it("keeps SQLite distinct from SQL", () => {
    expect(fixTechTerms("sequel lite and sequel")).toBe("SQLite and SQL");
  });
  it("catches Postgres however it is misheard, without doubling SQL", () => {
    for (const heard of ["postgre", "postgres", "postgress", "post gres", "post grass", "post gray", "postgres sql", "post gres sequel", "postgre sql", "postgres q l"]) {
      expect(fixTechTerms(`we run ${heard} in production`)).toBe("we run PostgreSQL in production");
    }
  });
  it("catches MySQL, but keeps 'my SQL' when it is clearly about skills", () => {
    expect(fixTechTerms("I used mysql and postgres")).toBe("I used MySQL and PostgreSQL");
    expect(fixTechTerms("I used my sequel before")).toBe("I used MySQL before");
    expect(fixTechTerms("we moved from my sql database to Postgres")).toBe("we moved from MySQL database to PostgreSQL");
    expect(fixTechTerms("I used my sql and redis")).toBe("I used MySQL and Redis");
    expect(fixTechTerms("I improved my SQL skills")).toBe("I improved my SQL skills");
  });
  it("fixes other commonly misheard tools", () => {
    expect(fixTechTerms("maria db, dynamo db and elastic search")).toBe("MariaDB, DynamoDB and Elasticsearch");
    expect(fixTechTerms("behind engine x with view js")).toBe("behind nginx with Vue");
    expect(fixTechTerms("a yaml file on git hub")).toBe("a YAML file on GitHub");
  });
  it("does not touch ordinary words", () => {
    const text = "I know that nodes in the cluster note the state and it reads from a cache. A post is great, and postgraduate students post gradually.";
    expect(fixTechTerms(text)).toBe(text);
  });
  it("is idempotent", () => {
    const once = fixTechTerms("typescript and graph q l");
    expect(fixTechTerms(once)).toBe(once);
  });
});
