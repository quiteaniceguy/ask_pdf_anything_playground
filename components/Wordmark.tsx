"use client";

const name = "Temporary";

export default function Wordmark() {
  return (
    <div className="p-6 select-none">
      {name.split("").map((letter, i) => (
        <span key={i} className="wordmark-letter">
          {letter}
        </span>
      ))}
    </div>
  );
}
