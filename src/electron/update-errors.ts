// Only application-authored messages may be displayed verbatim in Settings.
export class UpdateUserError extends Error {}

export function describeUpdateError(error: unknown): { phase: "unavailable" | "error"; message: string } {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const detail = error instanceof Error ? error.message : String(error);
  if (code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") {
    return { phase: "unavailable", message: "In-app updates are not available for the latest release yet. Check again later, or visit GitHub Releases for downloads." };
  }
  if (error instanceof UpdateUserError) return { phase: "error", message: error.message };
  if (/checksum|sha512|signature/i.test(`${code} ${detail}`)) {
    return { phase: "error", message: "The update could not be verified and was not installed. Try downloading it again." };
  }
  if (/ENOTFOUND|ECONN|ETIMEDOUT|ERR_(?:INTERNET|NETWORK|NAME_NOT_RESOLVED)|net::/i.test(`${code} ${detail}`)) {
    return { phase: "error", message: "Could not reach the update service. Check your internet connection and try again." };
  }
  return { phase: "error", message: "The update could not be completed. Try again later or visit GitHub Releases. Details are saved in the update log." };
}
