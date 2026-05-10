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

const CANVAS_SIZE = 800;
const DEFAULT_MODEL = "gpt-5.5";
const MIN_COMMANDS = 35;
const MAX_COMMANDS = 120;

export const maxDuration = 90;

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
      minItems: MIN_COMMANDS,
      maxItems: MAX_COMMANDS,
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
  if (
    !Array.isArray(candidate.commands) ||
    candidate.commands.length < MIN_COMMANDS ||
    candidate.commands.length > MAX_COMMANDS
  ) {
    return false;
  }

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

  const model = process.env.OPENAI_LINE_CIRCLE_MODEL ?? DEFAULT_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are a life drawing instructor converting a figure photo into geometric drawing primitives. Use only line and circle commands, but make the result visibly match the specific pose in the image, not a generic stick figure. Preserve asymmetry, body lean, arm and leg angles, negative spaces, and silhouette landmarks. Use many short contour and gesture lines plus joint circles. Add a little bit more detail than a stick figure: include key anatomical landmarks, overlapping limb edges, hands, feet, and small silhouette cues where they help the pose read clearly. Coordinates must be on an 800 by 800 canvas with the full figure centered and scaled to fit. Avoid perfect symmetry unless the photo is symmetric. Do not include text, colors, fills, curves, rectangles, paths, or polygons.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Study the exact pose in this background-removed figure. Return ${MIN_COMMANDS}-${MAX_COMMANDS} line/circle commands on a ${CANVAS_SIZE} by ${CANVAS_SIZE} canvas. Include the head, neck, shoulder line, torso centerline, outer torso contours, both upper arms, both lower arms, hands, pelvis, both thighs, both shins, both feet, and several silhouette contour cues. Return JSON only.`,
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
