import { describe, expect, it } from "vitest";
import {
  buildGeneratedPatientIdentifiers,
  formatGeneratedPatientAccessCode,
  formatGeneratedPatientDomainId,
  parseGeneratedPatientSequenceNumber,
} from "../patient-id.service";

describe("patient-id.service", () => {
  it("formats sequential domain IDs", () => {
    expect(formatGeneratedPatientDomainId(1)).toBe("IG-00001");
    expect(formatGeneratedPatientDomainId(126)).toBe("IG-00126");
    expect(formatGeneratedPatientDomainId(100005)).toBe("IG-100005");
  });

  it("parses only generated IG domain IDs", () => {
    expect(parseGeneratedPatientSequenceNumber("IG-00126")).toBe(126);
    expect(parseGeneratedPatientSequenceNumber("ABC-00126")).toBeNull();
    expect(parseGeneratedPatientSequenceNumber("IG-free-text")).toBeNull();
    expect(parseGeneratedPatientSequenceNumber(null)).toBeNull();
  });

  it("builds contiguous patient identifier ranges", () => {
    expect(buildGeneratedPatientIdentifiers(126, 3)).toEqual([
      {
        sequenceNumber: 126,
        domainId: "IG-00126",
        accessCode: formatGeneratedPatientAccessCode(126),
      },
      {
        sequenceNumber: 127,
        domainId: "IG-00127",
        accessCode: formatGeneratedPatientAccessCode(127),
      },
      {
        sequenceNumber: 128,
        domainId: "IG-00128",
        accessCode: formatGeneratedPatientAccessCode(128),
      },
    ]);
  });
});
