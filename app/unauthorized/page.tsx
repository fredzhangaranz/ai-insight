"use client";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-semibold text-gray-900">
          Access Denied
        </h1>
        <p className="mt-4 text-sm text-gray-600">
          You do not have permission to view this page. If you believe this is a
          mistake, contact an administrator for assistance.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Return to home
        </a>
      </div>
    </div>
  );
}
