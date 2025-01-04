import fs from "fs";
import path from "path";
import "dotenv/config";

const ensureDirectoriesExist = () => {
  const directories = ["./images", "./ground_truth", "./results"];
  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(path.resolve(dir), { recursive: true });
    }
  });
};

ensureDirectoriesExist();
export default {
  endpoints: {
    // claude: {
    //   endpoint: "https://api.anthropic.com/v1/messages",
    // },
    // "gpt-4o": {
    //   endpoint: "https://api.openai.com/v1/chat/completions",
    // },
    "gpt-4o-mini": {
      endpoint: "https://api.openai.com/v1/chat/completions",
    },
    // "gpt-4-turbo": {
    //   endpoint: "https://api.openai.com/v1/chat/completions",
    // },
  },
  apiKeys: {
    claude: process.env.CLAUDE_API_KEY,
    "gpt-4o": process.env.OPENAI_API_KEY,
    "gpt-4o-mini": process.env.OPENAI_API_KEY,
    "gpt-4-turbo": process.env.OPENAI_API_KEY,
  },
  models: {
    claude: "claude-3-5-sonnet-20241022",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4-turbo",
  },
  prompt:
    "Which foods are in this image, and identify quantities and measurements of all items, clear enough that we can lookup the nutrition facts. Keep the answer as brief as possible and as a list of food items alongside the portions.",
  imagesDir: "./images",
  groundTruthFile: "./ground_truth/ground_truth.json",
  resultsDir: "./results",
};
