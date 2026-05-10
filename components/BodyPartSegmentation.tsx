"use client";

import { useEffect, useRef, useState } from "react";

type BodyPartSegmentationProps = {
  image: string;
};

const MAX_SEGMENTATION_SIZE = 384;
const MASK_OPACITY = 0.72;
const MASK_BLUR_AMOUNT = 2;

type BodySegmentationModule = {
  SupportedModels: { BodyPix: string };
  createSegmenter: (model: string, config: object) => Promise<{
    segmentPeople: (image: HTMLImageElement, config: object) => Promise<unknown>;
  }>;
  toColoredMask: (
    segmentation: unknown,
    maskValueToColor: (maskValue: number) => { r: number; g: number; b: number; a: number },
    background: { r: number; g: number; b: number; a: number },
  ) => Promise<ImageData>;
  bodyPixMaskValueToRainbowColor: (maskValue: number) => { r: number; g: number; b: number; a: number };
  drawMask: (
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    mask: ImageData,
    opacity: number,
    maskBlurAmount: number,
    flipHorizontal: boolean,
  ) => Promise<void>;
};

let bodySegmentationPromise: Promise<BodySegmentationModule> | null = null;
let bodyPixSegmenterPromise: Promise<unknown> | null = null;

async function getBodySegmentation() {
  if (!bodySegmentationPromise) {
    bodySegmentationPromise = Promise.all([
      import("@tensorflow/tfjs-backend-webgl"),
      import("@tensorflow-models/body-segmentation"),
    ]).then(([, bodySegmentation]) => bodySegmentation as BodySegmentationModule);
  }

  return bodySegmentationPromise;
}

async function getBodyPixSegmenter() {
  const bodySegmentation = await getBodySegmentation();

  bodyPixSegmenterPromise ??= bodySegmentation.createSegmenter(
    bodySegmentation.SupportedModels.BodyPix,
    {
      architecture: "MobileNetV1",
      outputStride: 16,
      multiplier: 0.5,
      quantBytes: 2,
    },
  );

  return bodyPixSegmenterPromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Body part segmentation image failed to load"));
    image.src = src;
  });
}

function resizeForSegmentation(image: HTMLImageElement) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const largestSide = Math.max(sourceWidth, sourceHeight);
  const scale = largestSide > MAX_SEGMENTATION_SIZE ? MAX_SEGMENTATION_SIZE / largestSide : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (scale === 1) {
    return image;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

  return canvas;
}

export default function BodyPartSegmentation({ image }: BodyPartSegmentationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderSegmentation() {
      setStatus("loading");
      setError(null);

      try {
        const [bodySegmentation, segmenter, imageElement] = await Promise.all([
          getBodySegmentation(),
          getBodyPixSegmenter(),
          loadImage(image),
        ]);

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const segmentationImage = resizeForSegmentation(imageElement);
        canvas.width = segmentationImage.width;
        canvas.height = segmentationImage.height;

        const segmentation = await (
          segmenter as Awaited<ReturnType<BodySegmentationModule["createSegmenter"]>>
        ).segmentPeople(segmentationImage as HTMLImageElement, {
          multiSegmentation: false,
          segmentBodyParts: true,
        });

        if (cancelled) return;

        const coloredPartImage = await bodySegmentation.toColoredMask(
          segmentation,
          bodySegmentation.bodyPixMaskValueToRainbowColor,
          { r: 255, g: 255, b: 255, a: 0 },
        );

        await bodySegmentation.drawMask(
          canvas,
          segmentationImage as HTMLImageElement,
          coloredPartImage,
          MASK_OPACITY,
          MASK_BLUR_AMOUNT,
          false,
        );

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Body part segmentation failed");
        }
      }
    }

    void renderSegmentation();

    return () => {
      cancelled = true;
    };
  }, [image]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <p className="text-gray-600 text-sm">Reference body parts</p>
      <div className="rounded-lg overflow-hidden w-full border border-gray-200 bg-white">
        {status === "loading" && (
          <div className="flex min-h-48 items-center justify-center text-sm text-gray-500">
            Segmenting body parts...
          </div>
        )}
        {status === "error" && (
          <div className="flex min-h-48 items-center justify-center px-4 text-center text-sm text-red-600">
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          data-testid="body-part-segmentation"
          className={status === "ready" ? "max-h-96 mx-auto" : "hidden"}
        />
      </div>
    </div>
  );
}
