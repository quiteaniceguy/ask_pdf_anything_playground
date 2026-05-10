import { NextRequest, NextResponse } from "next/server";

type LineCommand = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth?: number;
};

type CircleCommand = {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  strokeWidth?: number;
};

type LineCircleCommand = LineCommand | CircleCommand;

type LineCircleResponse = {
  width: number;
  height: number;
  commands: LineCircleCommand[];
};

const lineCircleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["width", "height", "commands"],
  properties: {
    width: {
      type: "integer",
      minimum: 1,
      maximum: 1600,
      description: "Canvas width in pixels.",
    },
    height: {
      type: "integer",
      minimum: 1,
      maximum: 1600,
      description: "Canvas height in pixels.",
    },
    commands: {
      type: "array",
      minItems: 1,
      maxItems: 80,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "x1", "y1", "x2", "y2", "strokeWidth"],
            properties: {
              type: { type: "string", enum: ["line"] },
              x1: { type: "number" },
              y1: { type: "number" },
              x2: { type: "number" },
              y2: { type: "number" },
              strokeWidth: { type: "number", minimum: 1, maximum: 16 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "cx", "cy", "r", "strokeWidth"],
            properties: {
              type: { type: "string", enum: ["circle"] },
              cx: { type: "number" },
              cy: { type: "number" },
              r: { type: "number", minimum: 1 },
              strokeWidth: { type: "number", minimum: 1, maximum: 16 },
            },
          },
        ],
      },
    },
  },
} as const;

function extractOutputText(response: unknown) {
  if (typeof response !== "object" || response === null) return null;
  if ("output_text" in response && typeof response.output_text === "string") {
    return response.output_text;
  }

  const output = "output" in response ? response.output : null;
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null || !("content" in item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (
        typeof contentItem === "object" &&
        contentItem !== null &&
        "type" in contentItem &&
        contentItem.type === "output_text" &&
        "text" in contentItem &&
        typeof contentItem.text === "string"
      ) {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.length > 0 ? parts.join("") : null;
}

function isNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isLineCircleResponse(value: unknown): value is LineCircleResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LineCircleResponse>;
  if (!Number.isInteger(candidate.width) || !Number.isInteger(candidate.height)) return false;
  if (!Array.isArray(candidate.commands) || candidate.commands.length === 0) return false;

  return candidate.commands.every((command) => {
    if (typeof command !== "object" || command === null || !("type" in command)) return false;
    if (command.type === "line") {
      return (
        isNumber(command.x1) &&
        isNumber(command.y1) &&
        isNumber(command.x2) &&
        isNumber(command.y2) &&
        (command.strokeWidth === undefined || isNumber(command.strokeWidth))
      );
    }

    if (command.type === "circle") {
      return (
        isNumber(command.cx) &&
        isNumber(command.cy) &&
        isNumber(command.r) &&
        (command.strokeWidth === undefined || isNumber(command.strokeWidth))
      );
    }

    return false;
  });
}

export async function POST(request: NextRequest) {
  const { image } = (await request.json().catch(() => ({}))) as { image?: unknown };

  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "A processed image data URL is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const model = process.env.OPENAI_LINE_CIRCLE_MODEL ?? "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You convert figure images into simple drawing primitives. Use only line and circle commands. Capture pose, limb axes, head, torso, and major silhouette cues. Do not include text, colors, fills, curves, rectangles, paths, or polygons.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Recreate this processed figure image as a sparse line-and-circle drawing on an 800 by 800 canvas. Return JSON only.",
            },
            {
              type: "input_image",
              image_url: image,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "line_circle_drawing",
          strict: true,
          schema: lineCircleSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      { error: `Line-circle generation failed: ${message}` },
      { status: response.status },
    );
  }

  const responseJson: unknown = await response.json();
  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    return NextResponse.json({ error: "Line-circle generation returned no JSON" }, { status: 502 });
  }

  let drawing: unknown;
  try {
    drawing = JSON.parse(outputText);
  } catch {
    return NextResponse.json({ error: "Line-circle generation returned malformed JSON" }, { status: 502 });
  }

  if (!isLineCircleResponse(drawing)) {
    return NextResponse.json({ error: "Line-circle generation returned invalid commands" }, { status: 502 });
  }

  return NextResponse.json({ drawing });
}
