import fs from "fs";
import path from "path";
import axios from "axios";
import { ensureDirSync } from "fs-extra";
import {
  evaluateAccuracy,
  logPerformance,
  saveResultsToCSV,
} from "./helpers.mjs";
import sharp from "sharp";
import config from "../config/config.mjs";

const waitForRateLimitReset = async (retryAfter) => {
  console.log(`Rate limit hit. Waiting for ${retryAfter}s before retrying...`);
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
};

const handleRateLimit = async (error) => {
  if (
    error.response &&
    error.response.data &&
    error.response.data.error &&
    error.response.data.error.code === "rate_limit_exceeded"
  ) {
    const retryAfterMatch = error.response.data.error.message.match(
      /try again in ([\d.]+)s/
    );
    if (retryAfterMatch) {
      const retryAfter = parseFloat(retryAfterMatch[1]);
      await waitForRateLimitReset(retryAfter);
      return true;
    }
  }
  return false;
};

const processImage = async (imagePath, modelName, model, groundTruth) => {
  const maxRetries = 5;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      const resizedImageBuffer = await sharp(imagePath)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .toBuffer();
      const encodedImage = resizedImageBuffer.toString("base64");

      let payload,
        headers,
        inputTokens = 0,
        outputTokens = 0,
        cost = 0;

      switch (modelName) {
        case "claude":
          payload = {
            model: config.models[modelName],
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: config.prompt },
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/jpeg",
                      data: encodedImage,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1024,
          };
          headers = {
            "x-api-key": config.apiKeys[modelName],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          };
          break;

        case "gpt-4o":
          payload = {
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: config.prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${encodedImage}`,
                    },
                  },
                ],
              },
            ],
          };
          headers = {
            Authorization: `Bearer ${config.apiKeys[modelName]}`,
            "Content-Type": "application/json",
          };
          break;

        case "gpt-4-turbo":
          payload = {
            model: "gpt-4-turbo",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: config.prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${encodedImage}`,
                    },
                  },
                ],
              },
            ],
          };
          headers = {
            Authorization: `Bearer ${config.apiKeys[modelName]}`,
            "Content-Type": "application/json",
          };
          break;

        case "gpt-4o-mini":
          payload = {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: config.prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${encodedImage}`,
                    },
                  },
                ],
              },
            ],
          };
          headers = {
            Authorization: `Bearer ${config.apiKeys[modelName]}`,
            "Content-Type": "application/json",
          };
          break;

        default:
          throw new Error(`Unsupported model: ${modelName}`);
      }

      const startTime = Date.now();
      let timeToFirstByte;

      // Measure time to first byte
      const response = await axios({
        method: "post",
        url: model.endpoint,
        data: payload,
        headers,
        onDownloadProgress: (progressEvent) => {
          if (!timeToFirstByte) {
            timeToFirstByte = Date.now() - startTime; // Set time on first byte
          }
        },
      });

      const endTime = Date.now();

      let actual;
      switch (modelName) {
        case "claude":
          actual = response?.data?.content[0]?.text;
          inputTokens = response?.data?.usage?.input_tokens || 0;
          console.log("claude inputTokens", inputTokens);
          outputTokens = response?.data?.usage?.output_tokens || 0;
          console.log("claude outputTokens", outputTokens);
          cost = inputTokens * 0.000003 + outputTokens * 0.000015;
          console.log("claude cost", cost);
          break;

        case "gpt-4o":
          actual = response?.data?.choices[0]?.message?.content || "";
          inputTokens = response?.data?.usage?.prompt_tokens || 0;
          outputTokens = response?.data?.usage?.completion_tokens || 0;
          console.log("gpt40 inputTokens", inputTokens);
          console.log("gpt40 outputTokens", outputTokens);
          cost = inputTokens * 0.0000025 + outputTokens * 0.00001; // Pricing for GPT-40
          console.log("gpt40 cost", cost);
          break;

        case "gpt-4o-mini":
          actual = response?.data?.choices[0]?.message?.content || "";
          inputTokens = response?.data?.usage?.prompt_tokens || 0;
          outputTokens = response?.data?.usage?.completion_tokens || 0;
          console.log("gpt40mini inputTokens", inputTokens);
          console.log("gpt40mini outputTokens", outputTokens);
          cost = inputTokens * 0.00000015 + outputTokens * 0.0000006; // Pricing for GPT-40 Mini
          console.log("gpt40mini cost", cost);
          break;

        case "gpt-4-turbo":
          actual = response?.data?.choices[0]?.message?.content || "";
          inputTokens = response?.data?.usage?.prompt_tokens || 0;
          outputTokens = response?.data?.usage?.completion_tokens || 0;
          console.log("gptTurbo inputTokens", inputTokens);
          console.log("gptTurbo outputTokens", outputTokens);
          cost = inputTokens * 0.00001 + outputTokens * 0.00003; // Pricing for GPT-Turbo
          console.log("gptTurbo cost", cost);
          break;

        default:
          console.error(`Unknown model name: ${modelName}`);
          cost = 0; // Fallback cost
          break;
      }

      const expected = groundTruth[imagePath];
      const accuracy = await evaluateAccuracy(
        expected,
        actual,
        config.apiKeys[modelName]
      );

      logPerformance(
        modelName,
        path.basename(imagePath),
        startTime,
        endTime,
        { "x-time-to-first-byte": timeToFirstByte },
        response.headers
      );
      console.log("model:", modelName, "cost", cost);
      console.log("cost.toFixed(6)", cost.toFixed(6));
      return {
        image: path.basename(imagePath),
        accuracy: `${accuracy.score * 100}%`,
        model: config.models[modelName],
        expected,
        modelResponse: actual,
        timeToFirstByte,
        timeToLastByte: endTime - startTime,
        feedback: accuracy.feedback,
        inputTokens,
        outputTokens,
        cost: cost.toFixed(6), // Include cost in result
      };
    } catch (error) {
      if (await handleRateLimit(error)) {
        retries++;
        console.log(
          `Retrying ${retries}/${maxRetries} for image ${path.basename(
            imagePath
          )}...`
        );
        continue;
      }
      console.error(
        `Error processing image "${path.basename(
          imagePath
        )}" with model "${modelName}":`,
        error.response?.data || error.message
      );
      return null;
    }
  }

  console.error(`Exceeded max retries for image: ${path.basename(imagePath)}.`);
  return null;
};

const runTests = async () => {
  ensureDirSync(config.resultsDir); // Ensure the results directory exists
  const images = fs
    .readdirSync(config.imagesDir)
    .filter((file) => /\.(jpg|jpeg|png)$/i.test(file));
  const groundTruth = JSON.parse(
    fs.readFileSync(config.groundTruthFile, "utf-8")
  );
  const results = []; // Aggregate results in memory

  for (const modelName of Object.keys(config.endpoints)) {
    const model = { ...config.endpoints[modelName], name: modelName };
    console.log(`Testing with model: ${modelName}`);

    for (const image of images) {
      const imagePath = path.join(config.imagesDir, image);

      // Process each image
      const result = await processImage(
        imagePath,
        modelName,
        model,
        groundTruth
      );
      if (result) {
        results.push(result); // Add result to the aggregate
      }
    }
  }

  // Save all results in a single file (JSON)
  const resultsFilePath = path.join(config.resultsDir, "results.json");
  const existingResults = fs.existsSync(resultsFilePath)
    ? JSON.parse(fs.readFileSync(resultsFilePath, "utf-8"))
    : [];
  const combinedResults = [...existingResults, ...results];
  fs.writeFileSync(resultsFilePath, JSON.stringify(combinedResults, null, 2));
  console.log("All results saved successfully!", resultsFilePath);

  // Save all results in a CSV file
  const csvFilePath = path.join(config.resultsDir, "results.csv");
  await saveResultsToCSV(combinedResults, csvFilePath);
};

runTests().catch((err) => console.error("Error running tests:", err));
