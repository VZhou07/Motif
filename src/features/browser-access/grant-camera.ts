export type GrantOutcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * Asks Chrome for camera permission and releases every track at once. It never reads frames, runs no tracker,
 * holds no lock and sends no messages: it only exists so a helper can complete the browser's prompt for this
 * extension's origin if the side panel cannot show it.
 */
export async function requestCameraGrant(devices: Pick<MediaDevices, 'getUserMedia'> | undefined): Promise<GrantOutcome> {
  if (!devices?.getUserMedia) return { ok: false, message: 'This browser cannot access a camera here.' };
  try {
    const stream = await devices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true, message: 'Camera permission is allowed for Motif. You can close this tab and open the Motif side panel.' };
  } catch (error) {
    const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
    return { ok: false, message: name === 'NotAllowedError' ? 'Camera permission was not allowed. Use the browser address bar camera icon to allow it, then try again.' : 'No camera could be opened. Check the connection and try again.' };
  }
}
