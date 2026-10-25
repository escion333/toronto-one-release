"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ConversationComposer({
  value,
  onChange,
  onSend,
  onStop,
  onFocusChange,
  inputRef,
  chatProcessing,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  onFocusChange: (focused: boolean) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  chatProcessing: boolean;
  /** Sending is blocked during agent and checkout work; drafting stays available. */
  disabled: boolean;
}) {
  useEffect(() => {
    function markKeyboardFocus(event: KeyboardEvent) {
      if (event.key === "Tab" && inputRef.current)
        inputRef.current.dataset.keyboardFocus = "true";
    }
    function clearKeyboardFocus() {
      if (inputRef.current) delete inputRef.current.dataset.keyboardFocus;
    }
    document.addEventListener("keydown", markKeyboardFocus, true);
    document.addEventListener("pointerdown", clearKeyboardFocus, true);
    return () => {
      document.removeEventListener("keydown", markKeyboardFocus, true);
      document.removeEventListener("pointerdown", clearKeyboardFocus, true);
    };
  }, [inputRef]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  }, [value, inputRef]);
  function submit() {
    if (!disabled && value.trim()) onSend(value);
  }
  return (
    <div className="composer-dock">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
          inputRef.current?.focus({ preventScroll: true });
        }}
      >
        <label className="sr-only" htmlFor="message">
          Message Toronto One
        </label>
        <Textarea
          id="message"
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPointerDown={(event) => {
            delete event.currentTarget.dataset.keyboardFocus;
          }}
          onTouchStart={(event) => {
            delete event.currentTarget.dataset.keyboardFocus;
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="Message…"
          maxLength={6000}
          rows={1}
          enterKeyHint="enter"
          onKeyDown={(event) => {
            // Touch keyboards keep Return for line breaks; hardware Enter sends when ready.
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              window.matchMedia("(pointer: fine)").matches
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {chatProcessing ? (
          <Button
            key="stop-response"
            className="send-button stop-button"
            size="icon"
            type="button"
            aria-label="Stop response"
            onClick={(event) => {
              // Stopping can synchronously render Send; never let this click submit that draft.
              event.preventDefault();
              onStop();
            }}
          >
            <Square size={15} fill="currentColor" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            key="send-message"
            className="send-button"
            size="icon"
            type="submit"
            aria-label="Send message"
            disabled={disabled || !value.trim()}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ArrowUp size={21} strokeWidth={2.4} aria-hidden="true" />
          </Button>
        )}
      </form>
    </div>
  );
}
