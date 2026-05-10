"use client";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import LineCircleDrawing, { type LineCircleDrawingData } from "./LineCircleDrawing";

function DropZone({
  label,
  hint,
  dataTestId,
  onFile,
  preview,
}: {
  label: string;
  hint: string;
  dataTestId: string;
  onFile: (file: File) => void;
  preview: string | null;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFile(files[0]),
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <p className="font-semibold text-gray-700">{label}</p>
      <div
        {...getRootProps()}
        data-testid={dataTestId}
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer w-full h-48 flex flex-col items-center justify-center border-gray-300 hover:border-gray-400"
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-gray-500">Drop here…</p>
        ) : preview ? (
          <img src={preview} alt={label} className="max-h-40 mx-auto rounded" />
        ) : (
          <p className="text-gray-400 text-sm">{hint}</p>
        )}
      </div>
    </div>
  );
}

export default function FileInput() {
  const [reference, setReference] = useState<File | null>(null);
  const [drawing, setDrawing] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<string | null>(null);
  const [referenceResult, setReferenceResult] = useState<string | null>(null);
  const [drawingResult, setDrawingResult] = useState<string | null>(null);
  const [lineCircleDrawing, setLineCircleDrawing] = useState<LineCircleDrawingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReference(file: File) {
    setReference(file);
    setReferencePreview(URL.createObjectURL(file));
  }

  function handleDrawing(file: File) {
    setDrawing(file);
    setDrawingPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!reference || !drawing) return;
    setReferenceResult(null);
    setDrawingResult(null);
    setLineCircleDrawing(null);
    setError(null);
    setLoading(true);
    try {
      const [refRes, drawRes] = await Promise.all([
        fetch("/api/remove-bg", {
          method: "POST",
          body: (() => { const f = new FormData(); f.append("image", reference); return f; })(),
        }),
        fetch("/api/remove-bg", {
          method: "POST",
          body: (() => { const f = new FormData(); f.append("image", drawing); return f; })(),
        }),
      ]);
      const [refData, drawData] = await Promise.all([refRes.json(), drawRes.json()]);
      if (refData.error) throw new Error(refData.error);
      if (drawData.error) throw new Error(drawData.error);
      setReferenceResult(refData.image);
      setDrawingResult(drawData.image);

      const lineCircleRes = await fetch("/api/line-circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: refData.image }),
      });
      const lineCircleData = await lineCircleRes.json();
      if (lineCircleData.error) throw new Error(lineCircleData.error);
      setLineCircleDrawing(lineCircleData.drawing);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl mx-auto px-6">
      <div className="grid grid-cols-2 gap-6 w-full">
        <DropZone
          label="Reference Photo"
          hint="Drop the pose/figure photo here, or click to select"
          dataTestId="drop-reference"
          onFile={handleReference}
          preview={referencePreview}
        />
        <DropZone
          label="Your Drawing"
          hint="Drop your drawing here, or click to select"
          dataTestId="drop-drawing"
          onFile={handleDrawing}
          preview={drawingPreview}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!reference || !drawing || loading}
        className="px-8 py-3 rounded-full bg-black text-white disabled:opacity-40 hover:bg-gray-800 transition-colors"
      >
        {loading ? "Analyzing…" : "Review My Drawing"}
      </button>

      {error && <p className="text-red-500">{error}</p>}
      {(referenceResult || drawingResult) && (
        <div className="grid grid-cols-2 gap-6 w-full">
          {referenceResult && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-gray-600 text-sm">Reference (background removed)</p>
              <div
                className="rounded-lg overflow-hidden w-full"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                }}
              >
                <img src={referenceResult} alt="Reference with background removed" className="max-h-96 mx-auto" />
              </div>
            </div>
          )}
          {drawingResult && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-gray-600 text-sm">Drawing (background removed)</p>
              <div
                className="rounded-lg overflow-hidden w-full"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                }}
              >
                <img src={drawingResult} alt="Drawing with background removed" className="max-h-96 mx-auto" />
              </div>
            </div>
          )}
        </div>
      )}
      {lineCircleDrawing && <LineCircleDrawing drawing={lineCircleDrawing} />}
    </div>
  );
}
