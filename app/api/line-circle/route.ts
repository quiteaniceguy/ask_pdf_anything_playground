import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";

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

type PolygonPoint = {
  x: number;
  y: number;
};

type PolygonCommand = {
  type: "polygon";
  points: PolygonPoint[];
  strokeWidth?: number;
  fillOpacity?: number;
};

type LineCircleCommand = LineCommand | CircleCommand | PolygonCommand;

type LineCircleResponse = {
  width: number;
  height: number;
  commands: LineCircleCommand[];
};

const CANVAS_SIZE = 800;
const DEFAULT_MODEL = "gpt-5.5";
const MIN_COMMANDS = 35;
const MAX_COMMANDS = 120;
const REFINEMENT_PASSES = 3;

export const maxDuration = 180;

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
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "points", "strokeWidth", "fillOpacity"],
            properties: {
              type: { type: "string", enum: ["polygon"] },
              points: {
                type: "array",
                minItems: 3,
                maxItems: 16,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["x", "y"],
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                },
              },
              strokeWidth: { type: "number", minimum: 1, maximum: 16 },
              fillOpacity: { type: "number", minimum: 0, maximum: 0.35 },
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

    if (command.type === "polygon") {
      return (
        Array.isArray(command.points) &&
        command.points.length >= 3 &&
        command.points.length <= 16 &&
        command.points.every((point) => (
          typeof point === "object" &&
          point !== null &&
          isNumber(point.x) &&
          isNumber(point.y)
        )) &&
        (command.strokeWidth === undefined || isNumber(command.strokeWidth)) &&
        (command.fillOpacity === undefined || isNumber(command.fillOpacity))
      );
    }

    return false;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function renderPrimitiveDrawing(drawing: LineCircleResponse) {
  const width = Math.max(1, drawing.width);
  const height = Math.max(1, drawing.height);
  const commands = drawing.commands.map((command) => {
    const strokeWidth = clamp(command.strokeWidth ?? 3, 1, 16);

    if (command.type === "line") {
      return `<line x1="${clamp(command.x1, 0, width)}" y1="${clamp(command.y1, 0, height)}" x2="${clamp(command.x2, 0, width)}" y2="${clamp(command.y2, 0, height)}" stroke="black" stroke-linecap="round" stroke-width="${strokeWidth}" />`;
    }

    if (command.type === "circle") {
      return `<circle cx="${clamp(command.cx, 0, width)}" cy="${clamp(command.cy, 0, height)}" r="${clamp(command.r, 1, Math.max(width, height))}" fill="none" stroke="black" stroke-width="${strokeWidth}" />`;
    }

    const points = command.points
      .map((point) => `${clamp(point.x, 0, width)},${clamp(point.y, 0, height)}`)
      .join(" ");

    return `<polygon points="${points}" fill="black" fill-opacity="${clamp(command.fillOpacity ?? 0.08, 0, 0.35)}" stroke="black" stroke-linejoin="round" stroke-width="${strokeWidth}" />`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white" />`,
    ...commands,
    "</svg>",
  ].join("");

  const png = new Resvg(svg).render().asPng();

  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

function buildPassPrompt(pass: number, currentDrawing?: LineCircleResponse) {
  if (pass === 1 || !currentDrawing) {
    return `Study the exact pose in this background-removed figure. Return ${MIN_COMMANDS}-${MAX_COMMANDS} line/circle/polygon commands on a ${CANVAS_SIZE} by ${CANVAS_SIZE} canvas. Use polygons for broad body masses, silhouette planes, and limb volumes, not just lines. Include the head, neck, shoulder line, torso centerline, outer torso contours, rib cage, pelvis, both upper arms, both lower arms, hands, both thighs, both shins, both feet, and several silhouette contour cues. Return JSON only.`;
  }

  return [
    `This is refinement pass ${pass} of ${REFINEMENT_PASSES}. Compare the original reference image with the rendered primitive drawing from the previous pass.`,
    "Revise the existing line/circle/polygon commands to improve proportions, dimensions, angles, placement, negative spaces, and silhouette landmarks so the generated primitive drawing matches the reference more closely.",
    "Use polygons aggressively for body masses and silhouette planes: rib cage, pelvis, shoulders, upper arms, forearms, thighs, shins, hands, feet, and any broad visible planes. Keep lines for gesture/contours and circles for joints/landmarks.",
    "Return a complete replacement command list, not a diff. Keep the same JSON contract and only use line, circle, and polygon commands. Do not use freeform drawing, text, colors, curves, rectangles, or paths.",
    `Current commands to revise:\n${JSON.stringify(currentDrawing)}`,
  ].join("\n\n");
}

async function generateDrawingPass({
  image,
  model,
  pass,
  currentDrawing,
}: {
  image: string;
  model: string;
  pass: number;
  currentDrawing?: LineCircleResponse;
}) {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: buildPassPrompt(pass, currentDrawing),
    },
    {
      type: "input_image",
      image_url: image,
      detail: "high",
    },
  ];

  if (currentDrawing) {
    content.push({
      type: "input_image",
      image_url: renderPrimitiveDrawing(currentDrawing),
      detail: "high",
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are a life drawing instructor converting and refining a figure photo into geometric drawing primitives. Use only line, circle, and polygon commands, and make the result visibly match the specific pose in the reference image, not a generic stick figure. Use polygons for major body masses and silhouette planes such as the rib cage, pelvis, upper arms, forearms, thighs, shins, hands, and feet. Use lines for gesture axes, contours, and limb direction. Use circles for joints and important landmarks. Preserve asymmetry, body lean, arm and leg angles, negative spaces, and silhouette landmarks. Correct proportions, dimensions, and placement on each pass. Coordinates must be on an 800 by 800 canvas with the full figure centered and scaled to fit. Avoid perfect symmetry unless the photo is symmetric. Do not include text, colors, curves, rectangles, paths, or freeform drawing.",
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "line_circle_polygon_drawing",
          strict: true,
          schema: lineCircleSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      error: NextResponse.json(
        { error: `Line-circle generation pass ${pass} failed: ${message}` },
        { status: response.status },
      ),
    };
  }

  const responseJson: unknown = await response.json();
  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    return {
      error: NextResponse.json({ error: `Line-circle generation pass ${pass} returned no JSON` }, { status: 502 }),
    };
  }

  let drawing: unknown;
  try {
    drawing = JSON.parse(outputText);
  } catch {
    return {
      error: NextResponse.json(
        { error: `Line-circle generation pass ${pass} returned malformed JSON` },
        { status: 502 },
      ),
    };
  }

  if (!isLineCircleResponse(drawing)) {
    return {
      error: NextResponse.json(
        { error: `Line-circle generation pass ${pass} returned invalid commands` },
        { status: 502 },
      ),
    };
  }

  return { drawing };
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
  let drawing: LineCircleResponse | undefined;

  for (let pass = 1; pass <= REFINEMENT_PASSES; pass += 1) {
    const result = await generateDrawingPass({
      image,
      model,
      pass,
      currentDrawing: drawing,
    });

    if (result.error) return result.error;
    drawing = result.drawing;
  }

  return NextResponse.json({ drawing });
}
