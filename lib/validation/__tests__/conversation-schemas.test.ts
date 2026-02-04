import { describe, it, expect } from "vitest";
import {
  SendConversationMessageSchema,
  CreateConversationThreadSchema,
  GetConversationHistorySchema,
  validateRequest,
} from "../conversation-schemas";

describe("Conversation Validation Schemas", () => {
  describe("SendConversationMessageSchema", () => {
    it("accepts valid message with required fields only", () => {
      const data = {
        customerId: "cust-123",
        question: "What is the patient status?",
      };

      const result = SendConversationMessageSchema.parse(data);
      expect(result.customerId).toBe("cust-123");
      expect(result.question).toBe("What is the patient status?");
      expect(result.threadId).toBeUndefined();
      expect(result.modelId).toBeUndefined();
    });

    it("accepts valid message with all fields", () => {
      const data = {
        threadId: "123e4567-e89b-12d3-a456-426614174000",
        customerId: "cust-456",
        question: "Show patients with active wounds",
        modelId: "claude-3-5-sonnet",
      };

      const result = SendConversationMessageSchema.parse(data);
      expect(result.threadId).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(result.modelId).toBe("claude-3-5-sonnet");
    });

    it("rejects invalid UUID for threadId", () => {
      const data = {
        threadId: "not-a-uuid",
        customerId: "cust-123",
        question: "Test question",
      };

      expect(() => SendConversationMessageSchema.parse(data)).toThrow();
    });

    it("rejects empty customerId", () => {
      const data = {
        customerId: "   ",
        question: "Test question",
      };

      expect(() => SendConversationMessageSchema.parse(data)).toThrow(
        /customerId cannot be empty/
      );
    });

    it("rejects question shorter than 3 characters", () => {
      const data = {
        customerId: "cust-123",
        question: "Hi",
      };

      expect(() => SendConversationMessageSchema.parse(data)).toThrow(
        /question must be at least 3 characters/
      );
    });

    it("rejects question longer than 5000 characters", () => {
      const data = {
        customerId: "cust-123",
        question: "a".repeat(5001),
      };

      expect(() => SendConversationMessageSchema.parse(data)).toThrow(
        /question must be less than 5000 characters/
      );
    });

    it("trims whitespace from inputs", () => {
      const data = {
        customerId: "  cust-123  ",
        question: "  What is status?  ",
        modelId: "  claude-model  ",
      };

      const result = SendConversationMessageSchema.parse(data);
      expect(result.customerId).toBe("cust-123");
      expect(result.question).toBe("What is status?");
      expect(result.modelId).toBe("claude-model");
    });

    it("accepts valid 3-character question", () => {
      const data = {
        customerId: "cust-123",
        question: "foo",
      };

      const result = SendConversationMessageSchema.parse(data);
      expect(result.question).toBe("foo");
    });

    it("accepts valid 5000-character question", () => {
      const data = {
        customerId: "cust-123",
        question: "a".repeat(5000),
      };

      const result = SendConversationMessageSchema.parse(data);
      expect(result.question).toHaveLength(5000);
    });
  });

  describe("CreateConversationThreadSchema", () => {
    it("accepts valid thread with customerId only", () => {
      const data = {
        customerId: "cust-789",
      };

      const result = CreateConversationThreadSchema.parse(data);
      expect(result.customerId).toBe("cust-789");
      expect(result.title).toBeUndefined();
    });

    it("accepts valid thread with title", () => {
      const data = {
        customerId: "cust-789",
        title: "Patient Assessment Discussion",
      };

      const result = CreateConversationThreadSchema.parse(data);
      expect(result.title).toBe("Patient Assessment Discussion");
    });

    it("rejects empty customerId", () => {
      const data = {
        customerId: "",
      };

      expect(() => CreateConversationThreadSchema.parse(data)).toThrow(
        /customerId cannot be empty/
      );
    });

    it("rejects title longer than 100 characters", () => {
      const data = {
        customerId: "cust-789",
        title: "a".repeat(101),
      };

      expect(() => CreateConversationThreadSchema.parse(data)).toThrow(
        /title must be less than 100 characters/
      );
    });

    it("accepts title of exactly 100 characters", () => {
      const data = {
        customerId: "cust-789",
        title: "a".repeat(100),
      };

      const result = CreateConversationThreadSchema.parse(data);
      expect(result.title).toHaveLength(100);
    });

    it("trims whitespace from customerId and title", () => {
      const data = {
        customerId: "  cust-789  ",
        title: "  Assessment  ",
      };

      const result = CreateConversationThreadSchema.parse(data);
      expect(result.customerId).toBe("cust-789");
      expect(result.title).toBe("Assessment");
    });
  });

  describe("GetConversationHistorySchema", () => {
    it("accepts empty query params", () => {
      const data = {};
      const result = GetConversationHistorySchema.parse(data);
      expect(result.customerId).toBeUndefined();
      expect(result.limit).toBeUndefined();
      expect(result.offset).toBeUndefined();
    });

    it("parses string limit to number", () => {
      const data = {
        limit: "25",
      };

      const result = GetConversationHistorySchema.parse(data);
      expect(result.limit).toBe(25);
      expect(typeof result.limit).toBe("number");
    });

    it("parses string offset to number", () => {
      const data = {
        offset: "50",
      };

      const result = GetConversationHistorySchema.parse(data);
      expect(result.offset).toBe(50);
    });

    it("rejects limit < 1", () => {
      const data = { limit: "0" };
      expect(() => GetConversationHistorySchema.parse(data)).toThrow();
    });

    it("rejects limit > 100", () => {
      const data = { limit: "101" };
      expect(() => GetConversationHistorySchema.parse(data)).toThrow();
    });

    it("rejects negative offset", () => {
      const data = { offset: "-1" };
      expect(() => GetConversationHistorySchema.parse(data)).toThrow();
    });

    it("accepts valid pagination params", () => {
      const data = {
        customerId: "cust-123",
        limit: "20",
        offset: "40",
      };

      const result = GetConversationHistorySchema.parse(data);
      expect(result.customerId).toBe("cust-123");
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    it("trims customerId whitespace", () => {
      const data = {
        customerId: "  cust-abc  ",
      };

      const result = GetConversationHistorySchema.parse(data);
      expect(result.customerId).toBe("cust-abc");
    });
  });

  describe("validateRequest helper", () => {
    it("returns valid result with parsed data", () => {
      const data = {
        customerId: "cust-123",
        question: "Test question",
      };

      const result = validateRequest(SendConversationMessageSchema, data);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.customerId).toBe("cust-123");
      }
    });

    it("returns invalid result with error details on validation failure", () => {
      const data = {
        customerId: "",
        question: "ab", // Too short
      };

      const result = validateRequest(SendConversationMessageSchema, data);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Validation failed");
        expect(result.details.issues).toContainEqual(
          expect.objectContaining({
            field: "customerId",
          })
        );
        expect(result.details.issues).toContainEqual(
          expect.objectContaining({
            field: "question",
          })
        );
      }
    });

    it("formats error message with field names", () => {
      const data = {
        customerId: "",
        question: "a",
      };

      const result = validateRequest(SendConversationMessageSchema, data);
      if (!result.valid) {
        expect(result.details.message).toContain("customerId");
        expect(result.details.message).toContain("question");
      }
    });

    it("includes error codes in details", () => {
      const data = {
        customerId: "",
      };

      const result = validateRequest(SendConversationMessageSchema, data);
      if (!result.valid) {
        expect(result.details.issues[0].code).toBeDefined();
      }
    });
  });
});
