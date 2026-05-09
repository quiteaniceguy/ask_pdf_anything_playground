"use client";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function FileInput() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setResult(null);
      setError(null);
      setLoading(true);

      try {
        const form = new FormData();
        form.append("image", file);
        const res = await fetch("/api/remove-bg", { method: "POST", body: form });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResult(data.image);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        {...getRootProps()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 w-3/5"
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the image here...</p>
        ) : (
          <p>Drag and drop an image here, or click to select</p>
        )}
      </div>

      {loading && <p className="text-gray-500">Processing with YOLO...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {result && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-600 text-sm">Background removed</p>
          {/* Checkerboard pattern shows transparency */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          >
            <img src={result} alt="Person with background removed" className="max-h-96" />
          </div>
        </div>
      )}
    </div>
  );
}
