export type ApiErrorInfo = {
  message: string;
  requestId?: string;
};

export async function getApiError(response: Response, fallbackMessage: string): Promise<ApiErrorInfo> {
  const text = await response.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  const baseError =
    typeof data === 'object' && data
      ? data.error || data.message
      : null;
  const details =
    typeof data === 'object' && data
      ? data.details
      : null;
  const requestId =
    typeof data === 'object' && data
      ? data.requestId
      : undefined;

  const detailsStr = (() => {
    if (!details) return null;
    if (Array.isArray(details)) {
      const sample = details.slice(0, 3).map((d: any) =>
        typeof d === 'object' && d !== null
          ? (d.reason ? `[event ${d.index}] ${d.reason}` : JSON.stringify(d))
          : String(d)
      );
      const suffix = details.length > 3 ? ` … and ${details.length - 3} more` : '';
      return sample.join('; ') + suffix;
    }
    return typeof details === 'object' ? JSON.stringify(details) : String(details);
  })();

  const message = detailsStr && baseError
    ? `${baseError}: ${detailsStr}`
    : baseError || (text && !data ? text : fallbackMessage);

  return { message, requestId };
}
