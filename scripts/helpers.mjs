import axios from "axios";
import { createObjectCsvWriter } from "csv-writer";
import config from "../config/config.mjs";

export const evaluateAccuracy = async (expected, actual) => {
  const apiKey = config.apiKeys["gpt-4-turbo"];
  console.log("apiKey", apiKey);
  console.log(`Expected:
${JSON.stringify(expected, null, 2)}

Actual:
${actual || ""}`);
  try {
    if (!expected || !actual) {
      throw new Error("Invalid input for accuracy evaluation.");
    }

    const prompt = `
You are an evaluation system. Compare the expected foods and quantities to the actual foods and quantities. 
Provide a score from 0 to 1 based on how well the actual matches the expected.

Expected:
${JSON.stringify(expected, null, 2)}

Actual:
${actual || ""}

Instructions:
1. Consider food names and their corresponding quantities.
2. Score based on both name matches and quantity matches.
3. Provide detailed feedback on mismatches.

Your response format should be:
Score: [0-100]
Feedback: [detailed explanation of matches and mismatches]
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = response.data.choices[0]?.message?.content || "";
    console.log("Evaluation Response:", result);

    // Parse the response
    const scoreMatch = result.match(/Score:\s*([\d.]+)/i);
    const feedbackMatch = result.match(/Feedback:\s*(.+)/is);
    console.log("scoreMatch", scoreMatch);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : null;
    console.log("score", score);
    return { score, feedback };
  } catch (error) {
    console.error("Error in evaluateAccuracyWithOpenAI:", error);
    return { score: 0, feedback: "Error in accuracy evaluation." };
  }
};

export const logPerformance = (model, image, startTime, endTime, headers) => {
  console.log(`[${model}] Processed image ${image}`);
  console.log(
    `  - Time to First Byte: ${headers?.["x-time-to-first-byte"] || "N/A"} ms`
  );
  console.log(`  - Time to Last Byte: ${endTime - startTime} ms`);
};

export const saveResultsToCSV = async (results, filePath) => {
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "image", title: "Image" },
      { id: "accuracy", title: "Accuracy" },
      { id: "feedback", title: "Feedback" },
      { id: "model", title: "Model" },
      { id: "expected", title: "Expected" },
      { id: "modelResponse", title: "Model Response" },
      { id: "inputTokens", title: "Input Tokens" },
      { id: "outputTokens", title: "Output Tokens" },
      { id: "timeToFirstByte", title: "Time to First Byte (ms)" },
      { id: "timeToLastByte", title: "Time to Last Byte (ms)" },
      { id: "cost", title: "Total Cost (USD)" }, // Added column for cost
    ],
  });

  // Flatten results to match CSV format
  const flattenedResults = results.map((result) => ({
    image: result.image,
    accuracy: result.accuracy,
    feedback: result.feedback,
    model: result.model,
    expected: JSON.stringify(result.expected),
    modelResponse: result.modelResponse || "N/A",
    timeToFirstByte: result.timeToFirstByte || "N/A",
    timeToLastByte: result.timeToLastByte || "N/A",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: result.cost, // Include calculated cost
  }));

  try {
    await csvWriter.writeRecords(flattenedResults);
    console.log("Results saved successfully to CSV!", filePath);
  } catch (error) {
    console.error("Error saving results to CSV:", error.message);
  }
};
