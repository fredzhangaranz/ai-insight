// Test script for execute-query API with subQuestionId
const testExecuteQuery = async () => {
  const testQuery = "SELECT TOP 1 * FROM rpt.Patient";
  const subQuestionId = "1"; // Test with a sample ID

  try {
    const response = await fetch("http://localhost:3000/api/ai/execute-query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: testQuery,
        subQuestionId: subQuestionId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      return;
    }

    const result = await response.json();
    console.log("✅ Query executed successfully");
    console.log("Results:", result.data);
    console.log(
      "Expected: Sub-question status should be updated to 'completed'"
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test
testExecuteQuery();
