"use client";

import { cn } from "cn";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FIRST_ROW = LETTERS.slice(0, 13);
const SECOND_ROW = LETTERS.slice(13);

export type CatalogAlphabetProps = {
  letter: string | null;
  onLetter: (letter: string | null) => void;
};

function LetterButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "shrink-0 px-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground",
        pressed &&
          "text-primary underline decoration-2 underline-offset-4 hover:text-primary",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function CatalogAlphabet({ letter, onLetter }: CatalogAlphabetProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-x-3">
      <div className="flex w-full justify-center gap-x-3 sm:contents">
        {FIRST_ROW.map((ch) => (
          <LetterButton
            key={ch}
            label={ch}
            pressed={letter === ch}
            onClick={() => onLetter(ch)}
          />
        ))}
      </div>
      <div className="flex w-full justify-center gap-x-3 sm:contents">
        {SECOND_ROW.map((ch) => (
          <LetterButton
            key={ch}
            label={ch}
            pressed={letter === ch}
            onClick={() => onLetter(ch)}
          />
        ))}
        <LetterButton
          label="All"
          pressed={letter === null}
          onClick={() => onLetter(null)}
        />
      </div>
    </div>
  );
}