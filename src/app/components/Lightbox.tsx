"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

type LightboxProps = {
  imageUrl: string;
  altText?: string;
  onClose: () => void;
  children?: React.ReactNode;
  onAiEdit?: (instruction: string) => Promise<string>;
  isEditingImage?: boolean;
};

export default function Lightbox({
  imageUrl,
  altText = "Mockup Preview",
  onClose,
  children,
  onAiEdit,
  isEditingImage,
}: LightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [showAiEdit, setShowAiEdit] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function handleAiSubmit() {
    if (!onAiEdit || !aiInstruction.trim()) return;
    const result = await onAiEdit(aiInstruction.trim());
    if (result) {
      setShowAiEdit(false);
      setAiInstruction("");
    }
  }

  function handleClose() {
    setShowAiEdit(false);
    setAiInstruction("");
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6 md:p-10 backdrop-blur-xl cursor-zoom-out animate-fade-in"
      onClick={handleClose}
    >
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-50 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white backdrop-blur-md transition cursor-pointer"
        title="Close preview"
      >
        <X size={24} />
      </button>

      <div
        className={`relative w-full mx-auto my-auto flex flex-col items-center py-6 cursor-default transition-all duration-300 ${
          zoomed ? "max-w-7xl" : "max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={altText}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(!zoomed);
          }}
          className={`transition-all duration-300 rounded-lg shadow-2xl border border-white/10 w-full h-auto ${
            zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
          }`}
        />

        {onAiEdit && (
          <div className="mt-4 w-full rounded-xl border border-white/5 bg-[#111310]/80 p-4 backdrop-blur-md">
            {showAiEdit ? (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  AI Edit Instruction
                </label>
                <textarea
                  className="min-h-24 w-full resize-y rounded-lg border border-white/10 bg-[#111310] p-3 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder="e.g. Make the accent colors brighter and add a secondary CTA button"
                  value={aiInstruction}
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAiEdit(false); setAiInstruction(""); }}
                    className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/60 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isEditingImage || !aiInstruction.trim()}
                    onClick={handleAiSubmit}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#111310] transition hover:bg-[#c8db5a] disabled:opacity-50"
                  >
                    {isEditingImage ? (
                      <>Editing...</>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Submit Edit
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isEditingImage}
                onClick={() => setShowAiEdit(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#a3b840]/30 bg-[#1a1c16] px-4 py-2.5 text-sm font-semibold text-[#a3b840] transition hover:bg-[#222420] disabled:opacity-50"
              >
                <Sparkles size={16} />
                {isEditingImage ? "AI Editing in progress..." : "AI Edit Mockup"}
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>,
    document.body
  );
}
