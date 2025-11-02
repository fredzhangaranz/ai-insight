// app/api/insights/ask/route.ts
// Phase 7A: Mock endpoint for UI testing
// This will be replaced with the full orchestrator in Phase 7B

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, customerId } = await req.json();

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock response for Phase 7A testing
  const mockResponse = {
    mode: "direct" as const,
    question,
    thinking: [
      {
        id: "1",
        status: "complete" as const,
        message: "Understanding your question",
        duration: 200
      },
      {
        id: "2",
        status: "complete" as const,
        message: "Discovering semantic context",
        duration: 500
      },
      {
        id: "3",
        status: "complete" as const,
        message: "Generating SQL query",
        duration: 300
      }
    ],
    sql: "SELECT * FROM Patient LIMIT 10",
    results: {
      columns: ["id", "name", "age", "status"],
      rows: [
        { id: "1", name: "John Doe", age: 45, status: "Active" },
        { id: "2", name: "Jane Smith", age: 62, status: "Active" },
        { id: "3", name: "Bob Johnson", age: 55, status: "Discharged" },
      ]
    },
    context: {
      intent: { type: "query", confidence: 0.95 },
      entities: ["Patient"],
      timeRange: null
    }
  };

  return NextResponse.json(mockResponse);
}
