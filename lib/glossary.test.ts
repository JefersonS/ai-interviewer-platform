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
  it("does not touch ordinary words", () => {
    const text = "I know that nodes in the cluster note the state and it reads from a cache";
    expect(fixTechTerms(text)).toBe(text);
  });
  it("is idempotent", () => {
    const once = fixTechTerms("typescript and graph q l");
    expect(fixTechTerms(once)).toBe(once);
  });
});
