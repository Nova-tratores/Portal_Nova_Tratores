"use client";

export default function LoadingIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="loading-indicator">
      <div className="spinner-inner" />
      Processando...
    </div>
  );
}
