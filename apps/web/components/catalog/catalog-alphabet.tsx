"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type CatalogAlphabetProps = {
  letter: string | null;
  onLetter: (letter: string | null) => void;
};

export function CatalogAlphabet({ letter, onLetter }: CatalogAlphabetProps) {
  return (
    <div className="flex justify-center gap-2 overflow-x-auto text-xs">
      {LETTERS.map((ch) => (
        <Button
          key={ch}
          type="button"
          size="xs"
          variant="outline"
          className={cn(
            letter === ch && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          onClick={() => onLetter(ch)}
        >
          {ch}
        </Button>
      ))}
      <Button
        type="button"
        size="xs"
        variant="outline"
        className={cn(
          letter === null &&
            "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        onClick={() => onLetter(null)}
      >
        ALL
      </Button>
    </div>
  );
}