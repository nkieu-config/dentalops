import { DEFAULT_AUDIT_DB, databaseFromUrl } from "../src/audit/mongo.provider"

describe("choosing the audit database", () => {
  it("uses the database the url names", () => {
    expect(databaseFromUrl("mongodb://localhost:27017/dentalops")).toBe("dentalops")
    expect(databaseFromUrl("mongodb://localhost:27017/dentalops_ci?retryWrites=true")).toBe(
      "dentalops_ci"
    )
  })

  it("falls back to a named database rather than mongo's 'test' default", () => {
    expect(databaseFromUrl("mongodb+srv://u:p@cluster0.abc.mongodb.net/")).toBe(DEFAULT_AUDIT_DB)
    expect(
      databaseFromUrl("mongodb+srv://u:p@cluster0.abc.mongodb.net/?retryWrites=true&w=majority")
    ).toBe(DEFAULT_AUDIT_DB)
    expect(databaseFromUrl("mongodb+srv://u:p@cluster0.abc.mongodb.net")).toBe(DEFAULT_AUDIT_DB)
  })
})
