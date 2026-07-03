import { mock } from "node:test";
import { aiService } from "../../src/lib/ai.js";
import { storageService } from "../../src/lib/storage.js";
import nodemailer from "nodemailer";
import * as emailModule from "../../src/lib/email.js";

export function mockExternalServices() {
  const aiMock = mock.method(aiService, "generateAiJson", async () => {
    return {
      questions: ["Mock question 1", "Mock question 2", "Mock question 3"],
      score: 85,
      feedback: "Good mock answer.",
      relevance_score: 90,
      communication_score: 80,
      summary: "Mock summary.",
      shortlist: [
        {
          candidate_id: "user-123",
          name: "Test User",
          rank: 1,
          justification: "Fits perfectly.",
        },
      ],
    };
  });

  const aiKeyMock = mock.method(aiService, "hasAiKey", () => true);

  const storageMock = mock.method(storageService, "uploadFile", async () => {
    return "https://mock-s3-bucket.s3.amazonaws.com/mock-file.pdf";
  });

  // Mock nodemailer createTransport
  const mailMock = mock.method(nodemailer, "createTransport", () => {
    return {
      sendMail: async () => {
        return { messageId: "mock-message-id" };
      },
    };
  });

  return {
    restore: () => {
      aiMock.mock.restore();
      aiKeyMock.mock.restore();
      storageMock.mock.restore();
      mailMock.mock.restore();
    },
  };
}

export async function mockAiService() {
  return mock.method(
    aiService,
    "generateAiJson",
    async () => ({ shortlist: [] })
  );
}

export async function mockEmail() {
  return mock.method(
    emailModule,
    "sendDriveRegisteredEmail",
    async () => {}
  );
}
