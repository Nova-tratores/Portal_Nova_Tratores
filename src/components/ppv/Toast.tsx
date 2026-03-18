"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  type: "success" | "error";
  visible: boolean;
  onClose: () => void;
}

export default function Toast({ message, type, visible, onClose }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-5 right-8 z-[3000] flex items-center gap-2.5 rounded-full px-6 py-3 text-[13px] font-semibold text-white shadow-lg transition-all ${
        type === "success" ? "bg-emerald-500" : "bg-red-600"
      }`}
    >
      {message}
    </div>
  );
}
