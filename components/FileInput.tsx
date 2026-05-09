"use client";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

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
  const [result, setResult] = useState<string | null>(null);
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
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("image", reference);
      const res = await fetch("/api/remove-bg", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.image);
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
      {result && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-600 text-sm">Reference (background removed)</p>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          >
            <img src={result} alt="Reference with background removed" className="max-h-96" />
          </div>
        </div>
      )}
    </div>
  );
}
