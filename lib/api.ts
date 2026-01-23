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

  const message = details && baseError
    ? `${baseError}: ${details}`
    : baseError || (text && !data ? text : fallbackMessage);

  return { message, requestId };
}
