import { describe, expect, it } from "vitest";
import {
  extractTranscripts,
  isSpeechRecognitionSupported,
  joinTranscript,
  type SpeechRecognitionEventLike,
} from "@/lib/dictation";

describe("joinTranscript", () => {
  it("returns addition when base empty", () => {
    expect(joinTranscript("", "hello")).toBe("hello");
  });

  it("returns base when addition empty", () => {
    expect(joinTranscript("hello", "")).toBe("hello");
  });

  it("inserts single space when base lacks trailing whitespace", () => {
    expect(joinTranscript("hello", "world")).toBe("hello world");
  });

  it("does not duplicate space when base ends with whitespace", () => {
    expect(joinTranscript("hello ", "world")).toBe("hello world");
    expect(joinTranscript("hello\n", "world")).toBe("hello\nworld");
  });

  it("preserves embedded newlines in base", () => {
    expect(joinTranscript("line1\nline2", "tail")).toBe("line1\nline2 tail");
  });
});

describe("extractTranscripts", () => {
  function ev(
    parts: Array<{ text: string; isFinal: boolean }>,
    resultIndex = 0,
  ): SpeechRecognitionEventLike {
    const results = parts.map((p) => ({
      isFinal: p.isFinal,
      length: 1,
      0: { transcript: p.text },
    }));
    return { resultIndex, results: results as never };
  }

  it("splits final and interim", () => {
    const event = ev([
      { text: "There is ", isFinal: true },
      { text: "a leak", isFinal: false },
    ]);
    expect(extractTranscripts(event)).toEqual({
      final: "There is ",
      interim: "a leak",
    });
  });

  it("respects resultIndex offset", () => {
    const event = ev(
      [
        { text: "old", isFinal: true },
        { text: "new", isFinal: true },
      ],
      1,
    );
    expect(extractTranscripts(event)).toEqual({ final: "new", interim: "" });
  });

  it("concatenates multiple final segments", () => {
    const event = ev([
      { text: "one ", isFinal: true },
      { text: "two", isFinal: true },
    ]);
    expect(extractTranscripts(event)).toEqual({ final: "one two", interim: "" });
  });
});

describe("isSpeechRecognitionSupported", () => {
  const g = globalThis as unknown as { window?: Record<string, unknown> };

  it("returns false when window is undefined", () => {
    const original = g.window;
    delete g.window;
    expect(isSpeechRecognitionSupported()).toBe(false);
    if (original) g.window = original;
  });

  it("returns false when window has neither global", () => {
    g.window = {};
    expect(isSpeechRecognitionSupported()).toBe(false);
    delete g.window;
  });

  it("returns true when SpeechRecognition global exists", () => {
    g.window = { SpeechRecognition: function () {} };
    expect(isSpeechRecognitionSupported()).toBe(true);
    delete g.window;
  });

  it("returns true when webkit-prefixed global exists", () => {
    g.window = { webkitSpeechRecognition: function () {} };
    expect(isSpeechRecognitionSupported()).toBe(true);
    delete g.window;
  });
});
