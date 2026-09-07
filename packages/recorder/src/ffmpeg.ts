import { ExternalBinary } from './binary';

/** FFmpeg wrapper. Recording-specific argument construction arrives with the recording engine. */
export const ffmpeg = new ExternalBinary('ffmpeg');
