import test from "node:test";
import assert from "node:assert/strict";
import { AssistantChatService } from "../src/services/ai/chat.service.js";
import { geminiAssistantClient } from "../src/services/ai/gemini.client.js";

function mockProvider(t, { grounded, general }) {
  t.mock.method(geminiAssistantClient, "isConfigured", () => true);
  if (grounded) t.mock.method(geminiAssistantClient, "generateGroundedResponse", grounded);
  if (general) t.mock.method(geminiAssistantClient, "generateGeneralAgriculturalResponse", general);
}

test("supported environmental tasks stay on the grounded tool route", async (t) => {
  let groundedCalls = 0;
  let generalCalls = 0;
  mockProvider(t, {
    grounded: async () => {
      groundedCalls += 1;
      return {
        answer: "Latest verified soil moisture is unavailable.",
        modelUsed: "mock-grounded",
        executedTools: [{ toolName: "getSoilMoistureLatest", result: { date: null, qualityClassification: "unavailable" } }],
      };
    },
    general: async () => { generalCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock-general" }; },
  });

  const result = await new AssistantChatService().handleChat({
    message: "What is the latest soil moisture?",
    district: "cumilla",
  });
  assert.equal(groundedCalls, 1);
  assert.equal(generalCalls, 0);
  assert.deepEqual(result.meta.toolsCalled, ["getSoilMoistureLatest"]);
});

test("supported market forecasts stay on the existing grounded forecast route", async (t) => {
  let request;
  mockProvider(t, {
    grounded: async (input) => {
      request = input;
      return {
        answer: "A verified forecast is unavailable for this series.",
        modelUsed: "mock-grounded",
        executedTools: [{ toolName: "getMarketPriceReference", result: { forecasts: { wholesale: { status: "UNAVAILABLE" } } } }],
      };
    },
  });
  const result = await new AssistantChatService().handleChat({
    message: "Forecast potato market prices for the next seven days",
    district: "cumilla",
  });
  assert.equal(request.message, "Forecast potato market prices for the next seven days");
  assert.equal(request.district, "cumilla");
  assert.deepEqual(result.meta.toolsCalled, ["getMarketPriceReference"]);
});

test("unseen agricultural questions use the existing provider without ML/data tools", async (t) => {
  let request;
  let groundedCalls = 0;
  mockProvider(t, {
    grounded: async () => { groundedCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock-grounded" }; },
    general: async (input) => {
      request = input;
      return { answer: "Mulch can reduce direct soil evaporation. Check that the layer does not touch the plant stem.", executedTools: [], modelUsed: "mock-general" };
    },
  });

  const result = await new AssistantChatService().handleChat({ message: "How can I reduce water loss with mulch in my vegetable garden?" });
  assert.equal(groundedCalls, 0);
  assert.equal(request.message, "How can I reduce water loss with mulch in my vegetable garden?");
  assert.deepEqual(request.conversationHistory, []);
  assert.equal(result.meta.model, "mock-general");
  assert.deepEqual(result.meta.toolsCalled, []);
  assert.match(result.answer, /Mulch/);
});

test("Bangla agricultural questions use the general provider and preserve conversation context", async (t) => {
  let request;
  mockProvider(t, {
    general: async (input) => {
      request = input;
      return { answer: "মালচ মাটির ওপর ঢেকে দিন; ফসল ও জমির অবস্থা জানালে আরও নির্দিষ্টভাবে বলা যাবে।", executedTools: [], modelUsed: "mock-general" };
    },
  });
  const result = await new AssistantChatService().handleChat({
    message: "আর এরপর কী করব?",
    customHistory: [
      { role: "user", parts: [{ text: "টমেটো গাছে পানি ধরে রাখতে মালচ কীভাবে দেব?" }] },
      { role: "model", parts: [{ text: "জমির অবস্থা জানাবেন?" }] },
    ],
  });
  assert.equal(request.message, "আর এরপর কী করব?");
  assert.equal(request.conversationHistory.length, 2);
  assert.equal(result.language, "bn");
});

test("missing district for a district-scoped observation asks before calling a provider", async (t) => {
  let providerCalls = 0;
  mockProvider(t, {
    grounded: async () => { providerCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock" }; },
    general: async () => { providerCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock" }; },
  });
  const result = await new AssistantChatService().handleChat({ message: "What is the latest soil moisture?" });
  assert.equal(result.dataQuality, "clarification_needed");
  assert.match(result.answer, /district/i);
  assert.equal(providerCalls, 0);
});

test("unrelated questions are politely declined without calling the AI provider", async (t) => {
  let providerCalls = 0;
  mockProvider(t, {
    grounded: async () => { providerCalls += 1; return { answer: "not allowed", executedTools: [], modelUsed: "mock" }; },
    general: async () => { providerCalls += 1; return { answer: "not allowed", executedTools: [], modelUsed: "mock" }; },
  });
  const assistant = new AssistantChatService();
  const results = await Promise.all([
    assistant.handleChat({ message: "Who won yesterday's cricket match?" }),
    assistant.handleChat({ message: "Can you help me with the cricket match?" }),
  ]);
  assert.ok(results.every((result) => result.dataQuality === "out_of_scope"));
  assert.equal(providerCalls, 0);
  assert.ok(results.every((result) => /agriculture and farming/i.test(result.answer)));
});

test("vague messages get a short agricultural follow-up instead of a fabricated answer", async (t) => {
  let providerCalls = 0;
  mockProvider(t, {
    grounded: async () => { providerCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock" }; },
    general: async () => { providerCalls += 1; return { answer: "unused", executedTools: [], modelUsed: "mock" }; },
  });
  const result = await new AssistantChatService().handleChat({ message: "কিছু বলো" });
  assert.equal(result.dataQuality, "clarification_needed");
  assert.equal(providerCalls, 0);
  assert.match(result.answer, /কোন বিষয়ে সাহায্য চান/);
});

test("provider failure uses the safe deterministic response for unsupported agricultural questions", async (t) => {
  mockProvider(t, {
    general: async () => { throw new Error("provider unavailable"); },
  });
  const result = await new AssistantChatService().handleChat({ message: "How can I manage an unfamiliar crop pest safely?" });
  assert.match(result.answer, /could not prepare a reliable answer/i);
  assert.equal(result.meta.model, "deterministic-grounded-engine");
});
