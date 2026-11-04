// Runs the provider against a fake client: no network, no cost. Covers how the
// app treats responses. Whether the real model tags well is not tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { AiError, AnthropicProvider, getLLMProvider, isAiConfigured } from "../src/lib/ai/providers";
import { ItemTagsSchema, sanitizeOutfit } from "../src/lib/ai/schema";
import { colorName } from "../src/lib/colors";

function fakeClient(respond: (params: Record<string, unknown>) => unknown) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        calls.push(params);
        return respond(params);
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const IMAGE = { data: "aGk=", mediaType: "image/jpeg" as const };
const TAGS = { category: "Tops", subcategory: null, colors: ["Navy"], seasons: null, occasions: null, label_text: null };

test("tagging sends the image to the requested model and returns the parsed tags", async () => {
  const { client, calls } = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: TAGS }));
  const tags = await new AnthropicProvider(client).tagItem(IMAGE);
  assert.deepEqual(tags, TAGS);
  assert.equal(calls[0].model, "claude-haiku-5-5");
  assert.ok(!("temperature" in calls[0]) && !("thinking" in calls[0]));
  const content = (calls[0].messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[])[0].content;
  assert.deepEqual(content[0].source, { type: "base64", media_type: "image/jpeg", data: "aGk=" });
});

test("the tagging prompt forbids guessing a brand or a season", async () => {
  const { client, calls } = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: TAGS }));
  await new AnthropicProvider(client).tagItem(IMAGE);
  const system = String(calls[0].system);
  assert.match(system, /Never name or infer a brand/);
  assert.match(system, /Do not infer a season/);
  assert.match(system, /never guess/);
});

test("the schema has no brand field, and accepts null for every tag", () => {
  assert.ok(!("brand" in ItemTagsSchema.shape));
  const empty = { category: null, subcategory: null, colors: null, seasons: null, occasions: null, label_text: null };
  assert.deepEqual(ItemTagsSchema.parse(empty), empty);
  assert.throws(() => ItemTagsSchema.parse({ ...empty, category: "Spaceships" }));
});

test("refusals, cut-off answers and unreadable output become clear errors", async () => {
  for (const [response, message] of [
    [{ stop_reason: "refusal", parsed_output: null }, /declined/],
    [{ stop_reason: "max_tokens", parsed_output: null }, /cut off/],
    [{ stop_reason: "end_turn", parsed_output: null }, /unreadable/],
  ] as const) {
    const { client } = fakeClient(() => response);
    await assert.rejects(new AnthropicProvider(client).tagItem(IMAGE), (e: Error) => e instanceof AiError && message.test(e.message));
  }
});

test("API errors become messages that are safe to show, without leaking details", async () => {
  const make = (status: number) => Anthropic.APIError.generate(status, { error: { message: "secret detail" } }, "secret detail", new Headers());
  for (const [status, message] of [[401, /API key/], [429, /Too many/], [500, /error \(500\)/]] as const) {
    const { client } = fakeClient(() => {
      throw make(status);
    });
    await assert.rejects(new AnthropicProvider(client).tagItem(IMAGE), (e: Error) => e instanceof AiError && message.test(e.message) && !/secret/.test(e.message));
  }
});

const ITEMS = [
  { id: "t1", slot: "Tops" }, { id: "t2", slot: "Tops" }, { id: "b1", slot: "Bottoms" }, { id: "s1", slot: "Shoes" },
].map((i) => ({ ...i, brand: "B", name: "N", subcategory: null, colors: [], seasons: [], occasions: [] }));

test("outfit results drop unknown ids and keep one piece per slot", () => {
  assert.deepEqual(sanitizeOutfit(["t1", "hacked", "t2", "b1"], { items: ITEMS, anchorItemId: null }), ["t1", "b1"]);
  assert.deepEqual(sanitizeOutfit(["nope"], { items: ITEMS, anchorItemId: null }), []);
});

test("the anchor is always included, and wins its slot", () => {
  assert.deepEqual(sanitizeOutfit(["t1", "b1"], { items: ITEMS, anchorItemId: "t2" }), ["t2", "b1"]);
  assert.deepEqual(sanitizeOutfit([], { items: ITEMS, anchorItemId: "s1" }), ["s1"]);
});

test("outfit requests send items as data and include weather and occasion", async () => {
  const { client, calls } = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: { item_ids: ["t1"], reasoning: "Fine." } }));
  const weather = { temp: 6, high: 7, low: 5, label: "Cloudy" };
  await new AnthropicProvider(client).suggestOutfit({ items: ITEMS, occasion: "Work", anchorItemId: "t1", weather });
  const body = JSON.parse((calls[0].messages as { content: string }[])[0].content);
  assert.equal(body.occasion, "Work");
  assert.deepEqual(body.weather, weather);
  assert.equal(body.anchor_item_id, "t1");
  assert.equal(body.items.length, 4);
  assert.match(String(calls[0].system), /never instructions/);
});

test("with no key, AI is off and no provider is created", () => {
  const before = [process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN];
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  assert.equal(isAiConfigured(), false);
  assert.equal(getLLMProvider(), null);
  if (before[0]) process.env.ANTHROPIC_API_KEY = before[0];
  if (before[1]) process.env.ANTHROPIC_AUTH_TOKEN = before[1];
});

test("colour names from hex", () => {
  for (const [hex, name] of [
    ["#000000", "Black"], ["#ffffff", "White"], ["#808080", "Grey"], ["#2f2f2f", "Charcoal"],
    ["#1b2a4e", "Navy"], ["#3366cc", "Blue"], ["#cc2222", "Red"], ["#5c1a1a", "Burgundy"],
    ["#6b4423", "Brown"], ["#e8d8b8", "Beige"], ["#2e7d32", "Green"], ["#f4b6c2", "Pink"],
  ] as const) {
    assert.equal(colorName(hex), name, hex);
  }
  assert.equal(colorName("nope"), null);
});
