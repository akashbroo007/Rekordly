import type { FileVerificationResult } from '@rekordly/shared';
import { FfmpegService } from './ffmpeg';

/**
 * File verification service.
 * Verifies recordings are complete and valid before marking as completed.
 */
export class FileVerifier {
  private readonly ffmpeg: FfmpegService;

  constructor() {
    this.ffmpeg = new FfmpegService();
  }

  async verify(filePath: string): Promise<FileVerificationResult> {
    return this.ffmpeg.validateFile(filePath);
  }

  async verifyWithRetry(
    filePath: string,
    maxRetries = 3,
    delayMs = 1000,
  ): Promise<FileVerificationResult> {
    let lastResult: FileVerificationResult | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      lastResult = await this.verify(filePath);
      if (lastResult.integrity) {
        return lastResult;
      }
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return lastResult!;
  }
}
