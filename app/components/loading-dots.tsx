"use client"

export function LoadingDots() {
  return (
    <div className="flex justify-center items-center space-x-2 mb-6">
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
    </div>
  )
}
